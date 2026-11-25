import { Router } from 'express';
import { z } from 'zod';
import { PayerType, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { requirePermission } from '../auth/middleware';
import { HttpError } from '../lib/http';
import { h, parse, actorId, A } from '../lib/routeKit';
import { dateKey, isRealDate, todayKathmandu, toDateOnly } from '../lib/dates';
import { CANDIDATE_PAYER } from '../lib/catalogueRules';
import { decideApproval } from '../lib/approvals';
import { decryptPassport } from '../lib/passport';
import { nextDemandReference } from '../lib/demandReference';

export const catalogueRouter = Router();
const REQUIRE_COMPLIANCE_REF = true;
const uuid = z.string().uuid();
const blankToNull = (v: unknown) => (v === '' ? null : v);

catalogueRouter.get('/meta', requirePermission('catalogue.read'), h(async (_req, res) => {
  res.json({ data: {
    payerTypes: Object.values(PayerType),
    candidatePayer: CANDIDATE_PAYER,
  } });
}));

const demandWizardBody = z.object({
  employerId: z.string().uuid(), destinationCountryId: z.string().uuid(), overseasAgencyId: z.string().uuid(),
  expiresOn: z.preprocess(blankToNull, z.string().refine(isRealDate, 'Enter a valid date.').nullish()),
  positions: z.array(z.object({
    jobTitleId: z.string().uuid(),
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
  const [employer, country, agency] = await Promise.all([
    prisma.employer.findUnique({ where: { id: b.employerId }, include: { overseasAgencies: true, destinationCountries: true, jobTitles: true } }),
    prisma.country.findUnique({ where: { id: b.destinationCountryId } }),
    prisma.overseasAgency.findUnique({ where: { id: b.overseasAgencyId }, include: { employers: true } }),
  ]);
  if (!employer?.active) throw new HttpError(400, 'Choose an active employer.', { employerId: 'Employer is unavailable.' });
  if (!country?.active) throw new HttpError(400, 'Choose an active destination country.', { destinationCountryId: 'Country is unavailable.' });
  if (!agency?.active) throw new HttpError(400, 'Choose an active overseas agency.', { overseasAgencyId: 'Agency is unavailable.' });
  const associatedEmployerIds = agency.employers.map((link) => link.employerId);
  const associatedAgencyIds = employer.overseasAgencies.map((link) => link.overseasAgencyId);
  if ((associatedEmployerIds.length || associatedAgencyIds.length) && !associatedEmployerIds.includes(employer.id) && !associatedAgencyIds.includes(agency.id))
    throw new HttpError(400, 'Choose a company associated with this overseas agency.', { employerId: 'Company is not linked to this agency.' });
  if (employer.destinationCountries.length && !employer.destinationCountries.some((link) => link.countryId === country.id))
    throw new HttpError(400, 'Choose a destination configured for this company.', { destinationCountryId: 'Company is not linked to this destination.' });
  const titles = await prisma.jobTitle.findMany({ where: { id: { in: b.positions.map((p) => p.jobTitleId) }, active: true } });
  if (titles.length !== new Set(b.positions.map((p) => p.jobTitleId)).size)
    throw new HttpError(400, 'Choose active job titles for every position.', { positions: 'A job title is unavailable.' });
  if (employer.jobTitles.length && b.positions.some((position) => !employer.jobTitles.some((link) => link.jobTitleId === position.jobTitleId)))
    throw new HttpError(400, 'Choose job titles linked to this company.', { positions: 'A title is not linked to the selected company.' });
  const demand = await prisma.$transaction(async (tx) => {
    const created = await tx.jobDemand.create({ data: {
      employerId: employer.id, destinationCountryId: country.id, overseasAgencyId: agency.id, reference: await nextDemandReference(tx),
      expiresOn: b.expiresOn ? toDateOnly(b.expiresOn) : null,
      approvalStatus: 'APPROVED',
    } });
    for (const item of b.positions) {
      const position = await tx.jobPosition.create({ data: {
        demandId: created.id, destinationCountryId: country.id, cityId: null, jobTitleId: item.jobTitleId,
        vacancies: item.vacancies, salaryAmount: item.salaryAmount ?? null,
        salaryCurrency: item.salaryAmount == null ? null : item.salaryCurrency, terms: item.terms ?? null,
      } });
      const price = await tx.jobPriceVersion.create({ data: {
        positionId: position.id, currency: item.priceCurrency, effectiveFrom: toDateOnly(todayKathmandu()),
        approvalStatus: 'APPROVED', approvedById: actorId(req), changeReason: 'Initial demand setup',
      } });
      await tx.priceComponent.create({ data: {
        priceVersionId: price.id, componentType: 'Recruitment package', payer: PayerType.CANDIDATE, amount: item.priceAmount,
      } });
    }
    return created;
  });
  await A(req, 'RECRUITMENT_DEMAND_WIZARD_CREATED', 'job_demand', demand.id, {
    positions: b.positions.length, destinationCountryId: country.id, overseasAgencyId: agency.id,
    approvalStatus: demand.approvalStatus,
  });
  res.status(201).json({ data: { id: demand.id, reference: demand.reference, approvalStatus: demand.approvalStatus } });
}));

const xmlText = (value: unknown) => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const xmlCell = (value: unknown, type = 'String') => `<Cell><Data ss:Type="${type}">${xmlText(value)}</Data></Cell>`;

catalogueRouter.get('/demands/:id/selection-list', requirePermission('export.run', 'passport.view_number'), h(async (req, res) => {
  const demand = await prisma.jobDemand.findUnique({ where: { id: req.params.id }, include: {
    employer: true, overseasAgency: true,
    positions: { include: { jobTitle: true, applications: { where: { selectedAt: { not: null } }, include: {
      candidate: { include: { refer: true, passports: { where: { isCurrent: true }, select: { passportNumberCipher: true }, take: 1 } } },
      referralPartner: true,
    } } } },
  } });
  if (!demand) throw new HttpError(404, 'Demand not found.');
  const selected = demand.positions.flatMap((position) => position.applications.map((application) => ({ position, application })));
  const title = `${selected.length} PAX SELECTION OF ${demand.employer.legalName}${demand.overseasAgency ? ` (${demand.overseasAgency.name})` : ''}`;
  const headers = ['S.N', 'Name', 'PP No', 'Company', 'Trade', 'Next to Kin', 'Contact', 'Overseas Agency', 'Refer', 'Photo', 'PCC', 'Medical', 'Selected Date', 'Remarks'];
  const dataRows = selected.map(({ position, application }, index) => {
    const candidate = application.candidate;
    const passport = candidate.passports[0]?.passportNumberCipher ? decryptPassport(candidate.passports[0].passportNumberCipher) : '';
    return `<Row>${[
      xmlCell(index + 1, 'Number'), xmlCell(candidate.fullName), xmlCell(passport), xmlCell(demand.employer.legalName), xmlCell(position.jobTitle.title),
      xmlCell(candidate.nextOfKin), xmlCell(candidate.phone), xmlCell(demand.overseasAgency?.name), xmlCell(candidate.refer?.name ?? application.referralPartner?.name),
      xmlCell(application.photoStatus ?? 'PENDING'), xmlCell(application.pccStatus ?? 'PENDING'), xmlCell(application.medicalStatus ?? 'PENDING'),
      xmlCell(application.selectedAt?.toISOString().slice(0, 10)), xmlCell(application.selectionRemarks),
    ].join('')}</Row>`;
  }).join('');
  const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="title"><Font ss:Bold="1" ss:Size="14"/><Alignment ss:Horizontal="Center"/></Style><Style ss:ID="header"><Font ss:Bold="1"/><Interior ss:Color="#DCE6F1" ss:Pattern="Solid"/></Style></Styles><Worksheet ss:Name="Selection List"><Table><Row><Cell ss:MergeAcross="13" ss:StyleID="title"><Data ss:Type="String">${xmlText(title)}</Data></Cell></Row><Row>${headers.map((value) => `<Cell ss:StyleID="header"><Data ss:Type="String">${xmlText(value)}</Data></Cell>`).join('')}</Row>${dataRows}</Table></Worksheet></Workbook>`;
  await A(req, 'DEMAND_SELECTION_LIST_EXPORTED', 'job_demand', demand.id, { selectedWorkers: selected.length });
  const safeName = demand.reference.replace(/[^A-Za-z0-9_-]/g, '_');
  res.type('application/vnd.ms-excel').attachment(`${selected.length}-PAX-${safeName}.xls`).send(xml);
}));

catalogueRouter.get('/demands/:id/workers', requirePermission('catalogue.read', 'candidate.read', 'application.read'), h(async (req, res) => {
  const demand = await prisma.jobDemand.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!demand) throw new HttpError(404, 'Demand not found.');
  const positions = await prisma.jobPosition.findMany({ where: { demandId: demand.id }, orderBy: { createdAt: 'asc' }, select: {
    id: true, jobTitle: { select: { title: true } }, vacancies: true,
    applications: { orderBy: [{ selectedAt: 'desc' }, { openedAt: 'desc' }], select: {
      id: true, code: true, selectedAt: true, photoStatus: true, pccStatus: true, medicalStatus: true, selectionRemarks: true,
      candidate: { select: { id: true, candidateCode: true, fullName: true, phone: true, nextOfKin: true, refer: { select: { id: true, name: true } }, passports: { where: { isCurrent: true }, select: { isCurrent: true, expiryDate: true } } } }, referralPartner: { select: { name: true } },
    } },
  } });
  res.json({ data: positions });
}));

const positionBody = z.object({
  demandId: uuid, cityId: z.preprocess(blankToNull, uuid.nullish()), jobTitleId: uuid,
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
  const city = b.cityId ? await prisma.city.findUnique({ where: { id: b.cityId } }) : null;
  if (b.cityId && (!city || !city.active || city.countryId !== demand.destinationCountryId))
    throw new HttpError(400, `Choose a valid city in ${demand.destinationCountry.name}.`, { cityId: `Choose a city in ${demand.destinationCountry.name}.` });
  const title = await prisma.jobTitle.findUnique({ where: { id: b.jobTitleId } });
  if (!title || !title.active) throw new HttpError(400, 'Job title not found or inactive.', { jobTitleId: 'Not available.' });

  const row = await prisma.jobPosition.create({ data: {
    demandId: demand.id, destinationCountryId: demand.destinationCountryId, cityId: city?.id ?? null, jobTitleId: title.id,
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
const priceEntry = priceFields.extend({
  positionId: uuid,
  changeReason: z.string().trim().max(500).optional(),
}).superRefine(datesOk);
const priceEdit = priceFields.superRefine(datesOk);

catalogueRouter.post('/price-versions', requirePermission('catalogue.manage'), h(async (req, res) => {
  const b = parse(priceEntry, req.body);
  const pos = await prisma.jobPosition.findUnique({ where: { id: b.positionId } });
  if (!pos) throw new HttpError(404, 'Position not found.', { positionId: 'Not found.' });
  const open = await prisma.jobPriceVersion.count({ where: { positionId: pos.id, approvalStatus: { in: ['DRAFT', 'PENDING_APPROVAL'] as any } } });
  if (open) throw new HttpError(409, 'This position already has a draft or pending price version. Finish or reject it first.');
  const pv = await prisma.$transaction(async (tx) => {
    const established = await tx.jobPriceVersion.findFirst({ where: { positionId: pos.id, approvalStatus: 'APPROVED' }, select: { id: true } });
    if (established && (!b.changeReason || b.changeReason.length < 3)) throw new HttpError(400, 'Give a reason for changing an established price.', { changeReason: 'A reason of at least 3 characters is required.' });
    const v = await tx.jobPriceVersion.create({ data: {
      positionId: pos.id, currency: b.currency, effectiveFrom: toDateOnly(b.effectiveFrom),
      effectiveTo: b.effectiveTo ? toDateOnly(b.effectiveTo) : null,
      approvalStatus: established ? 'DRAFT' : 'APPROVED', approvedById: established ? null : actorId(req),
      changeReason: b.changeReason || (established ? null : 'Initial price'), complianceReference: b.complianceReference ?? null,
    } });
    await tx.priceComponent.createMany({ data: b.components.map((c) => ({ priceVersionId: v.id, componentType: c.componentType, payer: c.payer as any, amount: c.amount })) });
    return v;
  });
  await A(req, 'PRICE_VERSION_CREATED', 'job_price_version', pv.id, { positionId: pos.id });
  res.status(201).json({ data: { id: pv.id, approvalStatus: pv.approvalStatus } });
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

const VERIFIABLE = { employers: 'employer', 'referral-partners': 'referralPartner' } as const;
catalogueRouter.post('/:kind/:id/verification', requirePermission('catalogue.manage'), h(async (req, res) => {
  const delegate = VERIFIABLE[req.params.kind as keyof typeof VERIFIABLE];
  if (!delegate) throw new HttpError(404, 'Unknown type.');
  const b = parse(z.object({ status: z.enum(['UNVERIFIED', 'VERIFIED', 'REJECTED']) }), req.body);
  await (prisma as any)[delegate].update({ where: { id: req.params.id }, data: { verificationStatus: b.status } });
  await A(req, 'VERIFICATION_SET', delegate, req.params.id, { status: b.status });
  res.json({ data: { ok: true } });
}));
