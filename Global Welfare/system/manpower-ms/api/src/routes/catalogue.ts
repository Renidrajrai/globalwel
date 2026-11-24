import { Router } from 'express';
import { z } from 'zod';
import { EligibilityStatus, PayerType, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { requirePermission } from '../auth/middleware';
import { HttpError } from '../lib/http';
import { h, parse, actorId, A } from '../lib/routeKit';
import { dateKey, isRealDate, todayKathmandu, toDateOnly } from '../lib/dates';
import { CANDIDATE_PAYER } from '../lib/catalogueRules';
import { decideApproval } from '../lib/approvals';
import { alpha3ToAlpha2 } from '../lib/countryCodes';

export const catalogueRouter = Router();
const REQUIRE_COMPLIANCE_REF = true;
const uuid = z.string().uuid();
const blankToNull = (v: unknown) => (v === '' ? null : v);

catalogueRouter.get('/meta', requirePermission('catalogue.read'), h(async (_req, res) => {
  res.json({ data: {
    payerTypes: Object.values(PayerType),
    candidatePayer: CANDIDATE_PAYER,
    eligibilityStatuses: Object.values(EligibilityStatus),
  } });
}));

const masterSetupBody = z.object({
  countryId: z.preprocess(blankToNull, uuid.nullish()),
  iso3Code: z.preprocess(blankToNull, z.string().trim().length(3).transform((s) => s.toUpperCase()).nullish()),
  countryName: z.preprocess(blankToNull, z.string().trim().min(2).max(100).nullish()),
  cities: z.array(z.object({ name: z.string().trim().min(2).max(120), region: z.string().trim().max(120).nullish() })).max(100),
  jobTitles: z.array(z.object({ title: z.string().trim().min(2).max(120), description: z.string().trim().max(500).nullish() })).max(100),
  employer: z.object({
    legalName: z.string().trim().min(2).max(200), registeredCountryId: z.preprocess(blankToNull, uuid.nullish()),
    reference: z.string().trim().max(100).nullish(), contactName: z.string().trim().max(160).nullish(),
    email: z.preprocess(blankToNull, z.string().trim().email().nullish()), phone: z.string().trim().max(40).nullish(),
  }).nullish(),
}).superRefine((b, ctx) => {
  if (b.countryId && (b.iso3Code || b.countryName)) ctx.addIssue({ code: 'custom', path: ['countryId'], message: 'Choose an existing country or enter a new one.' });
  if (!b.countryId && (!b.iso3Code || !b.countryName)) ctx.addIssue({ code: 'custom', path: ['countryName'], message: 'Add a country or select an existing one.' });
  if (b.iso3Code && !alpha3ToAlpha2.has(b.iso3Code)) ctx.addIssue({ code: 'custom', path: ['iso3Code'], message: 'Enter a valid 3-letter country code.' });
});

catalogueRouter.post('/master-data/setup', requirePermission('catalogue.manage'), h(async (req, res) => {
  const b = parse(masterSetupBody, req.body);
  if (!b.countryId && b.iso3Code) {
    const alpha2 = alpha3ToAlpha2.get(b.iso3Code);
    if (!alpha2) throw new HttpError(400, 'Enter a valid 3-letter country code.', { iso3Code: 'Use a valid country code, such as NPL.' });
    const existing = await prisma.country.findFirst({ where: { OR: [{ iso3Code: b.iso3Code }, { iso2Code: alpha2 }] }, select: { id: true } });
    if (existing) throw new HttpError(409, 'This country has already been added.', { iso3Code: 'This country code is already in use.' });
  }
  const result = await prisma.$transaction(async (tx) => {
    const country = b.countryId
      ? await tx.country.findFirst({ where: { id: b.countryId, active: true } })
      : await tx.country.create({ data: { iso2Code: alpha3ToAlpha2.get(b.iso3Code!)!, iso3Code: b.iso3Code!, name: b.countryName! } });
    if (!country) throw new HttpError(b.countryId ? 404 : 400, b.countryId ? 'Country not found.' : 'Choose an active country.', { countryId: 'Country is unavailable.' });
    const cities = [];
    for (const city of b.cities) cities.push(await tx.city.create({ data: {
      countryId: country.id, name: city.name, normalizedName: city.name.trim().toLowerCase().replace(/\s+/g, ' '), region: city.region || null,
    } }));
    const titles = [];
    for (const title of b.jobTitles) titles.push(await tx.jobTitle.create({ data: {
      title: title.title, normalizedTitle: title.title.trim().toLowerCase().replace(/\s+/g, ' '), description: title.description || null,
    } }));
    let employer = null;
    if (b.employer) {
      const registeredCountryId = b.employer.registeredCountryId ?? country.id;
      const registeredCountry = await tx.country.findFirst({ where: { id: registeredCountryId, active: true } });
      if (!registeredCountry) throw new HttpError(400, 'Choose an active employer registration country.', { employer: 'Registration country is unavailable.' });
      employer = await tx.employer.create({ data: {
        registeredCountryId, legalName: b.employer.legalName, reference: b.employer.reference || null,
        contactName: b.employer.contactName || null, email: b.employer.email || null, phone: b.employer.phone || null,
      } });
    }
    return { country, cities, titles, employer };
  });
  await A(req, 'MASTER_DATA_SETUP_CREATED', 'country', result.country.id, {
    cities: result.cities.length, jobTitles: result.titles.length, employerId: result.employer?.id ?? null,
  });
  res.status(201).json({ data: { countryId: result.country.id, cities: result.cities.length, jobTitles: result.titles.length, employerId: result.employer?.id ?? null, eligibility: result.country.eligibility } });
}));

const demandWizardBody = z.object({
  employerId: z.string().uuid(), destinationCountryId: z.string().uuid(),
  reference: z.string().trim().min(2).max(100),
  feimsReference: z.preprocess(blankToNull, z.string().trim().min(2).max(100).nullish()),
  expiresOn: z.preprocess(blankToNull, z.string().refine(isRealDate, 'Enter a valid date.').nullish()),
  positions: z.array(z.object({
    cityId: z.string().uuid(), jobTitleId: z.string().uuid(),
    vacancies: z.coerce.number().int().min(1).max(100000),
    salaryAmount: z.preprocess(blankToNull, z.coerce.number().nonnegative().nullish()),
    salaryCurrency: z.string().trim().length(3).transform((v) => v.toUpperCase()),
    terms: z.preprocess(blankToNull, z.string().trim().max(2000).nullish()),
    priceAmount: z.coerce.number().min(0).max(10_000_000_000),
    priceCurrency: z.string().trim().length(3).transform((v) => v.toUpperCase()),
  })).min(1).max(50),
});

catalogueRouter.post('/demands/with-positions', requirePermission('catalogue.manage'), h(async (req, res) => {
  const b = parse(demandWizardBody, req.body);
  const [employer, country] = await Promise.all([
    prisma.employer.findUnique({ where: { id: b.employerId } }),
    prisma.country.findUnique({ where: { id: b.destinationCountryId } }),
  ]);
  if (!employer?.active) throw new HttpError(400, 'Choose an active employer.', { employerId: 'Employer is unavailable.' });
  if (!country?.active) throw new HttpError(400, 'Choose an active destination country.', { destinationCountryId: 'Country is unavailable.' });
  const [cities, titles] = await Promise.all([
    prisma.city.findMany({ where: { id: { in: b.positions.map((p) => p.cityId) }, active: true } }),
    prisma.jobTitle.findMany({ where: { id: { in: b.positions.map((p) => p.jobTitleId) }, active: true } }),
  ]);
  if (cities.length !== new Set(b.positions.map((p) => p.cityId)).size || cities.some((city) => city.countryId !== country.id))
    throw new HttpError(400, `Every position must use an active city in ${country.name}.`, { positions: 'Choose cities in the selected destination.' });
  if (titles.length !== new Set(b.positions.map((p) => p.jobTitleId)).size)
    throw new HttpError(400, 'Choose active job titles for every position.', { positions: 'A job title is unavailable.' });
  const demand = await prisma.$transaction(async (tx) => {
    const created = await tx.jobDemand.create({ data: {
      employerId: employer.id, destinationCountryId: country.id, reference: b.reference,
      feimsReference: b.feimsReference ?? null, expiresOn: b.expiresOn ? toDateOnly(b.expiresOn) : null,
      approvalStatus: 'APPROVED',
    } });
    for (const item of b.positions) {
      const position = await tx.jobPosition.create({ data: {
        demandId: created.id, destinationCountryId: country.id, cityId: item.cityId, jobTitleId: item.jobTitleId,
        vacancies: item.vacancies, salaryAmount: item.salaryAmount ?? null,
        salaryCurrency: item.salaryAmount == null ? null : item.salaryCurrency, terms: item.terms ?? null,
      } });
      const price = await tx.jobPriceVersion.create({ data: {
        positionId: position.id, currency: item.priceCurrency, effectiveFrom: toDateOnly(todayKathmandu()),
        approvalStatus: 'DRAFT', changeReason: 'Initial demand setup',
      } });
      await tx.priceComponent.create({ data: {
        priceVersionId: price.id, componentType: 'Recruitment package', payer: PayerType.CANDIDATE, amount: item.priceAmount,
      } });
    }
    return created;
  });
  await A(req, 'RECRUITMENT_DEMAND_WIZARD_CREATED', 'job_demand', demand.id, {
    positions: b.positions.length, destinationCountryId: country.id,
    eligibility: country.eligibility, approvalStatus: demand.approvalStatus,
  });
  res.status(201).json({ data: { id: demand.id, approvalStatus: demand.approvalStatus, eligibility: country.eligibility } });
}));

const positionBody = z.object({
  demandId: uuid, cityId: uuid, jobTitleId: uuid,
  vacancies: z.coerce.number().int().min(1, 'At least 1').max(100000),
  salaryAmount: z.preprocess(blankToNull, z.coerce.number().nonnegative().nullish()),
  salaryCurrency: z.preprocess(blankToNull, z.string().trim().length(3).transform((s) => s.toUpperCase()).nullish()),
  terms: z.preprocess(blankToNull, z.string().trim().max(2000).nullish()),
}).superRefine((p, ctx) => {
  if (p.salaryCurrency && !(p.salaryAmount && p.salaryAmount > 0))
    ctx.addIssue({ code: 'custom', path: ['salaryAmount'], message: 'Enter the salary amount' });
});

catalogueRouter.post('/positions', requirePermission('catalogue.manage'), h(async (req, res) => {
  const b = parse(positionBody, req.body);
  const demand = await prisma.jobDemand.findUnique({ where: { id: b.demandId }, include: { destinationCountry: true } });
  if (!demand || !demand.active) throw new HttpError(400, 'Demand not found or inactive.', { demandId: 'Not available.' });
  if (demand.expiresOn && dateKey(demand.expiresOn) < todayKathmandu()) throw new HttpError(400, 'This demand has expired.', { demandId: 'Expired.' });
  const city = await prisma.city.findUnique({ where: { id: b.cityId } });
  if (!city || !city.active) throw new HttpError(400, 'City not found or inactive.', { cityId: 'Not available.' });
  if (city.countryId !== demand.destinationCountryId)
    throw new HttpError(400, `This city is not in ${demand.destinationCountry.name}.`, { cityId: `Choose a city in ${demand.destinationCountry.name}.` });
  const title = await prisma.jobTitle.findUnique({ where: { id: b.jobTitleId } });
  if (!title || !title.active) throw new HttpError(400, 'Job title not found or inactive.', { jobTitleId: 'Not available.' });

  const row = await prisma.jobPosition.create({ data: {
    demandId: demand.id, destinationCountryId: demand.destinationCountryId, cityId: city.id, jobTitleId: title.id,
    vacancies: b.vacancies, salaryAmount: b.salaryCurrency ? b.salaryAmount ?? null : null, salaryCurrency: b.salaryCurrency ?? null, terms: b.terms ?? null,
  } });
  await A(req, 'POSITION_CREATED', 'job_position', row.id, { demandId: demand.id });
  res.status(201).json({ data: { id: row.id } });
}));

const payerValues = Object.values(PayerType) as [string, ...string[]];
const componentSchema = z.object({
  componentType: z.string().trim().min(2).max(60),
  payer: z.enum(payerValues),
  amount: z.number().min(0).max(10_000_000_000),
});
const priceFields = z.object({
  currency: z.string().trim().length(3).transform((s) => s.toUpperCase()),
  effectiveFrom: z.string().refine(isRealDate, 'Not a valid date'),
  effectiveTo: z.preprocess(blankToNull, z.string().refine(isRealDate, 'Not a valid date').nullish()),
  changeReason: z.string().trim().min(3, 'Give a reason').max(500),
  complianceReference: z.preprocess(blankToNull, z.string().trim().max(200).nullish()),
  components: z.array(componentSchema).min(1, 'Add at least one price component').max(30),
});
const datesOk = (b: { effectiveFrom: string; effectiveTo?: string | null }, ctx: z.RefinementCtx) => {
  if (b.effectiveTo && b.effectiveTo < b.effectiveFrom)
    ctx.addIssue({ code: 'custom', path: ['effectiveTo'], message: 'Must not be before the start date' });
};
const priceCreate = priceFields.extend({ positionId: uuid }).superRefine(datesOk);
const priceEdit = priceFields.superRefine(datesOk);

catalogueRouter.post('/price-versions', requirePermission('catalogue.manage'), h(async (req, res) => {
  const b = parse(priceCreate, req.body);
  const pos = await prisma.jobPosition.findUnique({ where: { id: b.positionId } });
  if (!pos) throw new HttpError(404, 'Position not found.', { positionId: 'Not found.' });
  const open = await prisma.jobPriceVersion.count({ where: { positionId: pos.id, approvalStatus: { in: ['DRAFT', 'PENDING_APPROVAL'] as any } } });
  if (open) throw new HttpError(409, 'This position already has a draft or pending price version. Finish or reject it first.');
  const pv = await prisma.$transaction(async (tx) => {
    const v = await tx.jobPriceVersion.create({ data: {
      positionId: pos.id, currency: b.currency, effectiveFrom: toDateOnly(b.effectiveFrom),
      effectiveTo: b.effectiveTo ? toDateOnly(b.effectiveTo) : null, approvalStatus: 'DRAFT',
      changeReason: b.changeReason, complianceReference: b.complianceReference ?? null,
    } });
    await tx.priceComponent.createMany({ data: b.components.map((c) => ({ priceVersionId: v.id, componentType: c.componentType, payer: c.payer as any, amount: c.amount })) });
    return v;
  });
  await A(req, 'PRICE_VERSION_CREATED', 'job_price_version', pv.id, { positionId: pos.id });
  res.status(201).json({ data: { id: pv.id } });
}));

catalogueRouter.put('/price-versions/:id', requirePermission('catalogue.manage'), h(async (req, res) => {
  const b = parse(priceEdit, req.body);
  await prisma.$transaction(async (tx) => {
    const pv = await tx.jobPriceVersion.findUnique({ where: { id: req.params.id } });
    if (!pv) throw new HttpError(404, 'Price version not found.');
    if (pv.approvalStatus !== 'DRAFT' && pv.approvalStatus !== 'REJECTED')
      throw new HttpError(409, 'Only a draft or rejected price version can be edited. Create a new version instead.');
    await tx.jobPriceVersion.update({ where: { id: pv.id }, data: {
      currency: b.currency, effectiveFrom: toDateOnly(b.effectiveFrom),
      effectiveTo: b.effectiveTo ? toDateOnly(b.effectiveTo) : null,
      changeReason: b.changeReason, complianceReference: b.complianceReference ?? null, approvalStatus: 'DRAFT',
    } });
    await tx.priceComponent.deleteMany({ where: { priceVersionId: pv.id } });
    await tx.priceComponent.createMany({ data: b.components.map((c) => ({ priceVersionId: pv.id, componentType: c.componentType, payer: c.payer as any, amount: c.amount })) });
  });
  await A(req, 'PRICE_VERSION_EDITED', 'job_price_version', req.params.id, {});
  res.json({ data: { ok: true } });
}));

const SUBMITTABLE = {
  'price-versions': { delegate: 'jobPriceVersion', entityType: 'JOB_PRICE_VERSION' },
} as const;

async function assertSubmittable(kind: keyof typeof SUBMITTABLE, id: string, db: Prisma.TransactionClient) {
  if (kind === 'price-versions') {
    const v = await db.jobPriceVersion.findUnique({ where: { id }, include: { components: true, position: true } });
    if (!v) throw new HttpError(404, 'Price version not found.');
    const problems: string[] = [];
    if (!v.components.length) problems.push('no price components');
    if (!v.position.active) problems.push('position is inactive');
    if (REQUIRE_COMPLIANCE_REF && !v.complianceReference) problems.push('compliance reference is missing');
    if (problems.length) throw new HttpError(409, `Cannot submit: ${problems.join('; ')}.`);
  }
}

catalogueRouter.post('/submit/:kind/:id', requirePermission('catalogue.manage'), h(async (req, res) => {
  const kind = req.params.kind as keyof typeof SUBMITTABLE;
  const cfg = SUBMITTABLE[kind];
  if (!cfg) throw new HttpError(404, 'Unknown type.');
  const { note } = parse(z.object({ note: z.preprocess(blankToNull, z.string().trim().max(500).nullish()) }), req.body ?? {});
  const actor = actorId(req);
  await prisma.$transaction(async (tx) => {
    const row = await (tx as any)[cfg.delegate].findUnique({ where: { id: req.params.id } });
    if (!row) throw new HttpError(404, 'Record not found.');
    if (row.approvalStatus !== 'DRAFT' && row.approvalStatus !== 'REJECTED')
      throw new HttpError(409, 'Only a draft or rejected record can be submitted.');
    await assertSubmittable(kind, row.id, tx);
    const pending = await tx.approvalAction.findFirst({ where: { entityType: cfg.entityType, entityId: row.id, decision: 'PENDING' } });
    if (pending) throw new HttpError(409, 'Already waiting for approval.');
    await tx.approvalAction.create({ data: {
      entityType: cfg.entityType,
      entityId: row.id,
      action: 'SUBMIT_FOR_APPROVAL',
      decision: 'PENDING',
      requestedById: actor,
      reason: note ?? 'Submitted for approval',
    } });
    await (tx as any)[cfg.delegate].update({ where: { id: row.id }, data: { approvalStatus: 'PENDING_APPROVAL' } });
  });
  await A(req, 'CATALOGUE_SUBMITTED', cfg.entityType.toLowerCase(), req.params.id, {});
  res.json({ data: { ok: true } });
}));

catalogueRouter.post('/decide/:kind/:id', requirePermission('catalogue.approve'), h(async (req, res) => {
  const cfg = SUBMITTABLE[req.params.kind as keyof typeof SUBMITTABLE];
  if (!cfg) throw new HttpError(404, 'Unknown type.');
  const b = parse(z.object({ decision: z.enum(['APPROVED', 'REJECTED']), reason: z.string().trim().min(3, 'Give a reason').max(500) }), req.body);
  const action = await prisma.approvalAction.findFirst({
    where: { entityType: cfg.entityType, entityId: req.params.id, decision: 'PENDING' }, orderBy: { requestedAt: 'desc' },
  });
  if (!action) throw new HttpError(404, 'Nothing is waiting for approval for this record.');
  await decideApproval(req, action.id, b.decision, b.reason);
  res.json({ data: { ok: true } });
}));

const eligibilityValues = Object.values(EligibilityStatus) as [string, ...string[]];
catalogueRouter.post('/countries/:id/eligibility', requirePermission('catalogue.eligibility.manage'), h(async (req, res) => {
  const b = parse(z.object({
    eligibility: z.enum(eligibilityValues),
    source: z.preprocess(blankToNull, z.string().trim().max(500).nullish()),
  }), req.body);
  const country = await prisma.country.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!country) throw new HttpError(404, 'Country not found.');
  await prisma.country.update({ where: { id: req.params.id }, data: {
    eligibility: b.eligibility as any, ...(b.source !== undefined ? { eligibilitySource: b.source } : {}),
    eligibilityVerifiedAt: new Date(), eligibilityVerifiedById: actorId(req),
  } });
  await A(req, 'COUNTRY_ELIGIBILITY_SET', 'country', req.params.id, { eligibility: b.eligibility });
  res.json({ data: { ok: true } });
}));

const VERIFIABLE = { employers: 'employer', 'referral-partners': 'referralPartner' } as const;
catalogueRouter.post('/:kind/:id/verification', requirePermission('catalogue.manage'), h(async (req, res) => {
  const delegate = VERIFIABLE[req.params.kind as keyof typeof VERIFIABLE];
  if (!delegate) throw new HttpError(404, 'Unknown type.');
  const b = parse(z.object({ status: z.enum(['UNVERIFIED', 'VERIFIED', 'REJECTED']) }), req.body);
  await (prisma as any)[delegate].update({ where: { id: req.params.id }, data: { verificationStatus: b.status } });
  await A(req, 'VERIFICATION_SET', delegate, req.params.id, { status: b.status });
  res.json({ data: { ok: true } });
}));
