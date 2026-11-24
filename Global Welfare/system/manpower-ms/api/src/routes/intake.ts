import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import rateLimit from 'express-rate-limit';
import { prisma } from '../db';
import { requirePermission } from '../auth/middleware';
import { HttpError } from '../lib/http';
import { h, parse, actorId, A } from '../lib/routeKit';
import {
  passportHmac, encryptPassport, passportStatus, passportNumberProblem, passportDateProblems, PASSPORT_KEY_VERSION,
} from '../lib/passport';
import { dateKey, isRealDate, toDateOnly, todayKathmandu } from '../lib/dates';
import { availablePositionWhere, currentPriceWhere, priceFrom, resolvePositionPrice } from '../lib/catalogueRules';

export const intakeRouter = Router();

intakeRouter.get('/options', requirePermission('application.create'), h(async (_req, res) => {
  const [countries, referralPartners] = await Promise.all([
    prisma.country.findMany({ where: { active: true }, select: { id: true, name: true, iso2Code: true }, orderBy: { name: 'asc' } }),
    prisma.referralPartner.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  res.json({ data: { countries, referralPartners } });
}));

const OPEN = ['ACTIVE', 'ON_HOLD', 'STOPPED_PENDING_SETTLEMENT'];
const CLOSED = ['CLOSED_SUCCESSFULLY', 'CLOSED_UNSUCCESSFULLY'];
const NO_PASSPORT_HOLD = 'No passport on file at intake';
const PASSPORT_WARN_DAYS = 180;
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

const lookupLimiter = rateLimit({
  windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => (req as any).auth?.user?.id ?? 'anon',
});

const reqDate = (label: string) =>
  z.string().min(1, `${label} is required`).refine(isRealDate, `${label} is not a valid date`);

const blankToNull = (v: unknown) => (v === '' ? null : v);

const sourceSchema = z.object({
  sourceType: z.enum(['DIRECT', 'REFERRED', 'UNKNOWN']),
  referralPartnerId: z.preprocess(blankToNull, z.string().uuid().nullish()),
});
const appSchema = sourceSchema.extend({
  positionId: z.preprocess(blankToNull, z.string().uuid().nullish()),
  assignedToId: z.preprocess(blankToNull, z.string().uuid().nullish()),
});
const candidateSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required').max(200),
  dateOfBirth: z.preprocess(blankToNull,
    reqDate('Date of birth').refine((d) => d <= todayKathmandu(), 'Date of birth cannot be in the future').nullish()),
  phone: z.string().trim().min(5, 'Phone is required').max(30),
  altPhone: z.preprocess(blankToNull, z.string().trim().max(30).nullish()),
  email: z.preprocess(blankToNull, z.string().trim().email('Enter a valid email').nullish()),
  address: z.preprocess(blankToNull, z.string().trim().max(500).nullish()),
});
const passportSchema = z.object({
  passportNumber: z.string().trim().min(1, 'Passport number is required').max(30),
  issueDate: reqDate('Issue date'),
  expiryDate: reqDate('Expiry date'),
  issuingCountryId: z.preprocess(blankToNull, z.string().uuid().nullish()),
});
type PassportInput = z.infer<typeof passportSchema>;

function checkSource(s: z.infer<typeof sourceSchema>) {
  if (s.sourceType === 'REFERRED' && !s.referralPartnerId)
    throw new HttpError(400, 'Referral partner is required when source is REFERRED', { referralPartnerId: 'Select a partner.' });
  if (s.sourceType !== 'REFERRED' && s.referralPartnerId)
    throw new HttpError(400, 'Referral partner must be empty unless source is REFERRED', { referralPartnerId: 'Remove the partner or choose REFERRED.' });
}

async function nextCode(tx: Prisma.TransactionClient, seq: 'candidate_code_seq' | 'application_code_seq', prefix: string) {
  const rows = await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT nextval('${seq}') AS n`);
  return `${prefix}-${new Date().getFullYear()}-${String(Number(rows[0].n)).padStart(6, '0')}`;
}

async function resolveIssuingCountry(id: string | null | undefined, key: string) {
  const c = id
    ? await prisma.country.findUnique({ where: { id } })
    : await prisma.country.findUnique({ where: { iso2Code: 'NP' } });
  if (!c) throw new HttpError(400, id ? 'Issuing country not found.' : 'Nepal is missing from the country list. Add it in the catalogue first.', { [key]: 'Select a valid country.' });
  return c;
}

async function checkPassport(dob: string | null | undefined, p: PassportInput, keys: { prefix: string; dob: string }) {
  const country = await resolveIssuingCountry(p.issuingCountryId, `${keys.prefix}.issuingCountryId`);
  const fields: Record<string, string> = {};
  const np = passportNumberProblem(p.passportNumber, country.iso2Code);
  if (np) fields[`${keys.prefix}.passportNumber`] = np;
  if (!dob) fields[keys.dob] = 'Date of birth is required when a passport is entered.';
  const d = passportDateProblems({ dob, issue: p.issueDate, expiry: p.expiryDate });
  if (d.issueDate) fields[`${keys.prefix}.issueDate`] = d.issueDate;
  if (d.expiryDate) fields[`${keys.prefix}.expiryDate`] = d.expiryDate;
  if (Object.keys(fields).length) throw new HttpError(400, 'Please correct the highlighted fields.', fields);
  return country;
}

const hasCurrentPassport = async (db: Prisma.TransactionClient | typeof prisma, candidateId: string) =>
  (await db.candidatePassport.count({ where: { candidateId, isCurrent: true } })) > 0;

async function createApplication(
  tx: Prisma.TransactionClient,
  a: { candidateId: string } & z.infer<typeof appSchema>,
  actor: string,
  holdReason: string | null,
) {
  checkSource(a);
  if (a.referralPartnerId) {
    const p = await tx.referralPartner.findUnique({ where: { id: a.referralPartnerId } });
    if (!p || p.active === false) throw new HttpError(400, 'Referral partner not found or inactive', { referralPartnerId: 'Not available.' });
  }
  const price = a.positionId ? await resolvePositionPrice(tx, a.positionId) : null;

  const status = holdReason ? 'ON_HOLD' : 'ACTIVE';
  const code = await nextCode(tx, 'application_code_seq', 'APP');
  try {
    const app = await tx.application.create({
      data: {
        code,
        candidateId: a.candidateId,
        positionId: price?.pos.id ?? null,
        priceVersionId: price?.pv.id ?? null,
        currency: price?.pv.currency ?? null,
        agreedAmountSnapshot: price?.agreed ?? null,
        packageTotalSnapshot: price?.packageTotal ?? null,
        sourceType: a.sourceType,
        referralPartnerId: a.referralPartnerId ?? null,
        lifecycleStatus: status,
        holdReason,
        assignedToId: a.assignedToId ?? actor,
      },
    });
    if (price) {
      await tx.applicationPriceComponent.createMany({
        data: price.pv.components.map((c) => ({ applicationId: app.id, componentType: c.componentType, payer: c.payer, amount: c.amount })),
      });
    }
    await tx.applicationStatusHistory.create({
      data: { applicationId: app.id, fromStatus: null, toStatus: status, reason: holdReason ?? 'Application opened', changedById: actor },
    });
    return app;
  } catch (e: any) {
    if (e?.code === 'P2002') throw new HttpError(409, 'This candidate already has an open application for this position (or an open application with no position yet).');
    throw e;
  }
}

intakeRouter.post('/passport-lookup', lookupLimiter, requirePermission('passport.lookup'), h(async (req, res) => {
  const body = parse(z.object({
    passportNumber: z.string().trim().min(1, 'Passport number is required').max(30),
    issuingCountryId: z.preprocess(blankToNull, z.string().uuid().nullish()),
  }), req.body);
  const country = await resolveIssuingCountry(body.issuingCountryId, 'issuingCountryId');
  const problem = passportNumberProblem(body.passportNumber, country.iso2Code);
  if (problem) throw new HttpError(400, problem, { passportNumber: problem });

  const p = await prisma.candidatePassport.findUnique({
    where: { passportLookupHmac: passportHmac(body.passportNumber, country.iso2Code) },
    include: { candidate: { select: { id: true, fullName: true, candidateCode: true, phone: true } } },
  });
  await A(req, 'PASSPORT_LOOKUP', 'candidate_passport', p?.id ?? null, { found: !!p });
  if (!p) return res.json({ data: { found: false } });

  const openApplications = await prisma.application.count({
    where: { candidateId: p.candidateId, lifecycleStatus: { in: OPEN as any } },
  });
  res.json({ data: {
    found: true,
    candidateId: p.candidate.id,
    fullName: p.candidate.fullName,
    candidateCode: p.candidate.candidateCode,
    passportStatus: passportStatus(p.expiryDate, p.isCurrent),
    openApplications,
  } });
}));

intakeRouter.get('/positions', requirePermission('application.create'), h(async (_req, res) => {
  const rows = await prisma.jobPosition.findMany({
    where: availablePositionWhere(),
    include: {
      jobTitle: true, city: true,
      demand: { include: { employer: true, destinationCountry: true } },
      priceVersions: { where: currentPriceWhere(), orderBy: { effectiveFrom: 'desc' }, take: 1, include: { components: true } },
    },
    take: 500,
  });
  res.json({ data: rows.filter((r) => r.priceVersions.length).map((r) => {
    const pv = r.priceVersions[0];
    const { agreed, packageTotal } = priceFrom(pv.components);
    return {
      id: r.id,
      label: `${r.demand.destinationCountry.name} / ${r.city.name} / ${r.jobTitle.title}`,
      employer: r.demand.employer.legalName,
      vacancies: r.vacancies,
      currency: pv.currency,
      agreedAmount: agreed.toString(),
      packageTotal: packageTotal.toString(),
    };
  }) });
}));

intakeRouter.post('/duplicate-check', requirePermission('candidate.create'), h(async (req, res) => {
  const b = parse(z.object({ fullName: z.string().trim().min(2), dateOfBirth: reqDate('Date of birth') }), req.body);
  const rows = await prisma.candidate.findMany({
    where: { nameNormalized: norm(b.fullName), dateOfBirth: toDateOnly(b.dateOfBirth) },
    select: { id: true, fullName: true, candidateCode: true }, take: 5,
  });
  res.json({ data: { matches: rows } });
}));

intakeRouter.post('/applicant', requirePermission('candidate.create', 'application.create'), h(async (req, res) => {
  const body = parse(z.object({
    candidate: candidateSchema, passport: passportSchema.nullish(), application: appSchema,
  }), req.body);
  const actor = actorId(req);

  let country: { id: string; iso2Code: string } | null = null;
  let hmac: string | null = null;
  if (body.passport) {
    country = await checkPassport(body.candidate.dateOfBirth, body.passport, { prefix: 'passport', dob: 'candidate.dateOfBirth' });
    hmac = passportHmac(body.passport.passportNumber, country.iso2Code);
    if (await prisma.candidatePassport.findUnique({ where: { passportLookupHmac: hmac } }))
      throw new HttpError(409, 'Passport already registered. Run the passport lookup and use the existing candidate.', { 'passport.passportNumber': 'Already registered.' });
  }

  try {
    const out = await prisma.$transaction(async (tx) => {
      const c = body.candidate;
      const cand = await tx.candidate.create({ data: {
        candidateCode: await nextCode(tx, 'candidate_code_seq', 'CAND'),
        fullName: c.fullName,
        nameNormalized: norm(c.fullName),
        dateOfBirth: c.dateOfBirth ? toDateOnly(c.dateOfBirth) : null,
        phone: c.phone, altPhone: c.altPhone ?? null, email: c.email ?? null, address: c.address ?? null,
        createdById: actor,
      } });
      if (body.passport && hmac && country) {
        await tx.candidatePassport.create({ data: {
          candidateId: cand.id,
          passportNumberCipher: encryptPassport(body.passport.passportNumber),
          passportLookupHmac: hmac,
          keyVersion: PASSPORT_KEY_VERSION,
          issuingCountryId: country.id,
          issueDate: toDateOnly(body.passport.issueDate),
          expiryDate: toDateOnly(body.passport.expiryDate),
          isCurrent: true, createdById: actor,
        } });
      }
      const app = await createApplication(tx, { candidateId: cand.id, ...body.application }, actor, body.passport ? null : NO_PASSPORT_HOLD);
      return { cand, app };
    }, { timeout: 15_000 });

    await A(req, 'INTAKE_CREATED', 'application', out.app.id, { candidateId: out.cand.id, hasPassport: !!body.passport, hasPosition: !!body.application.positionId });

    const warnings: string[] = [];
    if (!body.passport) warnings.push('No passport entered. The application is ON HOLD until a passport is added.');
    else {
      const days = (toDateOnly(body.passport.expiryDate).getTime() - Date.now()) / 86_400_000;
      if (days < PASSPORT_WARN_DAYS) warnings.push(`Passport expires in ${Math.max(0, Math.floor(days))} days`);
    }
    if (!body.application.positionId) warnings.push('No position selected yet. Assign one when the catalogue is available.');
    res.status(201).json({ data: {
      candidateId: out.cand.id, candidateCode: out.cand.candidateCode,
      applicationId: out.app.id, applicationCode: out.app.code,
      lifecycleStatus: out.app.lifecycleStatus, warnings,
    } });
  } catch (e: any) {
    if (e?.code === 'P2002' && String(e?.meta?.target ?? '').includes('passport'))
      throw new HttpError(409, 'Duplicate passport detected. Run the lookup again.');
    throw e;
  }
}));

intakeRouter.post('/application', requirePermission('application.create'), h(async (req, res) => {
  const body = parse(appSchema.extend({ candidateId: z.string().uuid() }), req.body);
  const cand = await prisma.candidate.findUnique({ where: { id: body.candidateId } });
  if (!cand) throw new HttpError(404, 'Candidate not found');
  const hasPassport = await hasCurrentPassport(prisma, cand.id);
  const app = await prisma.$transaction(
    (tx) => createApplication(tx, body, actorId(req), hasPassport ? null : NO_PASSPORT_HOLD), { timeout: 15_000 });
  await A(req, 'APPLICATION_CREATED', 'application', app.id, { candidateId: cand.id });
  const warnings: string[] = [];
  if (!hasPassport) warnings.push('Candidate has no current passport. The application is ON HOLD until one is added.');
  if (!body.positionId) warnings.push('No position selected yet. Assign one when the catalogue is available.');
  res.status(201).json({ data: { candidateId: cand.id, applicationId: app.id, applicationCode: app.code, lifecycleStatus: app.lifecycleStatus, warnings } });
}));

intakeRouter.post('/applications/:id/assign-position', requirePermission('application.update'), h(async (req, res) => {
  const { positionId } = parse(z.object({ positionId: z.string().uuid('Select a position') }), req.body);
  const actor = actorId(req);
  await prisma.$transaction(async (tx) => {
    const app = await tx.application.findUnique({ where: { id: req.params.id } });
    if (!app) throw new HttpError(404, 'Application not found');
    if (CLOSED.includes(app.lifecycleStatus)) throw new HttpError(409, 'Closed applications cannot change.');
    if (app.positionId) throw new HttpError(409, 'This application already has a position. The price snapshot cannot be changed.');
    const price = await resolvePositionPrice(tx, positionId);
    try {
      await tx.application.update({ where: { id: app.id }, data: {
        positionId: price.pos.id, priceVersionId: price.pv.id, currency: price.pv.currency,
        agreedAmountSnapshot: price.agreed, packageTotalSnapshot: price.packageTotal,
      } });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new HttpError(409, 'This candidate already has an open application for this position.');
      throw e;
    }
    await tx.applicationPriceComponent.createMany({
      data: price.pv.components.map((c) => ({ applicationId: app.id, componentType: c.componentType, payer: c.payer, amount: c.amount })),
    });
    await tx.applicationStatusHistory.create({
      data: { applicationId: app.id, fromStatus: app.lifecycleStatus, toStatus: app.lifecycleStatus, reason: 'Position assigned', changedById: actor },
    });
  });
  await A(req, 'APPLICATION_POSITION_ASSIGNED', 'application', req.params.id, { positionId });
  res.json({ data: { ok: true } });
}));

intakeRouter.get('/candidates/:id/passports', requirePermission('candidate.read'), h(async (req, res) => {
  const rows = await prisma.candidatePassport.findMany({
    where: { candidateId: req.params.id }, orderBy: { expiryDate: 'desc' },
    select: { id: true, isCurrent: true, issueDate: true, expiryDate: true, issuingCountryId: true },
  });
  res.json({ data: rows.map((r) => ({ ...r, status: passportStatus(r.expiryDate, r.isCurrent) })) });
}));

intakeRouter.post('/candidates/:id/passport', requirePermission('candidate.update'), h(async (req, res) => {
  const p = parse(passportSchema, req.body);
  const cand = await prisma.candidate.findUnique({ where: { id: req.params.id } });
  if (!cand) throw new HttpError(404, 'Candidate not found');

  const country = await checkPassport(cand.dateOfBirth ? dateKey(cand.dateOfBirth) : null, p, { prefix: 'passport', dob: 'passport.dateOfBirth' });
  const hmac = passportHmac(p.passportNumber, country.iso2Code);
  const existing = await prisma.candidatePassport.findUnique({ where: { passportLookupHmac: hmac } });
  if (existing) throw new HttpError(409, existing.candidateId === cand.id
    ? 'This passport is already registered for this candidate.'
    : 'This passport number belongs to a different candidate record. Possible duplicate, escalate to a manager.',
    { 'passport.passportNumber': 'Already registered.' });

  await prisma.$transaction(async (tx) => {
    await tx.candidatePassport.updateMany({ where: { candidateId: cand.id, isCurrent: true }, data: { isCurrent: false } });
    await tx.candidatePassport.create({ data: {
      candidateId: cand.id,
      passportNumberCipher: encryptPassport(p.passportNumber),
      passportLookupHmac: hmac,
      keyVersion: PASSPORT_KEY_VERSION,
      issuingCountryId: country.id,
      issueDate: toDateOnly(p.issueDate), expiryDate: toDateOnly(p.expiryDate),
      isCurrent: true, createdById: actorId(req),
    } });
  });
  await A(req, 'PASSPORT_ADDED', 'candidate', cand.id, {});
  const held = await prisma.application.findMany({
    where: { candidateId: cand.id, lifecycleStatus: 'ON_HOLD', holdReason: NO_PASSPORT_HOLD }, select: { id: true, code: true },
  });
  res.status(201).json({ data: { ok: true, applicationsThatCanBeReleased: held } });
}));

intakeRouter.post('/applications/:id/source-change', requirePermission('application.source_change_request'), h(async (req, res) => {
  const body = parse(sourceSchema.extend({ reason: z.string().trim().min(5, 'Give a reason').max(500) }), req.body);
  checkSource(body);
  const app = await prisma.application.findUnique({ where: { id: req.params.id } });
  if (!app) throw new HttpError(404, 'Application not found');
  if (CLOSED.includes(app.lifecycleStatus)) throw new HttpError(409, 'Closed applications cannot change source');
  const newPartner = body.referralPartnerId ?? null;
  if (app.sourceType === body.sourceType && (app.referralPartnerId ?? null) === newPartner)
    throw new HttpError(400, 'The requested source is the same as the current source');
  if (newPartner) {
    const rp = await prisma.referralPartner.findUnique({ where: { id: newPartner } });
    if (!rp || rp.active === false) throw new HttpError(400, 'Referral partner not found or inactive', { referralPartnerId: 'Not available.' });
  }
  try {
    const ch = await prisma.applicationSourceChange.create({ data: {
      applicationId: app.id, oldSourceType: app.sourceType, newSourceType: body.sourceType,
      oldPartnerId: app.referralPartnerId, newPartnerId: newPartner,
      reason: body.reason, status: 'PENDING', requestedById: actorId(req),
    } });
    await A(req, 'SOURCE_CHANGE_REQUESTED', 'application', app.id, { changeId: ch.id });
    res.status(201).json({ data: { id: ch.id, status: 'PENDING' } });
  } catch (e: any) {
    if (e?.code === 'P2002') throw new HttpError(409, 'There is already a pending source change for this application');
    throw e;
  }
}));

intakeRouter.get('/source-changes', requirePermission('application.source_change_approve'), h(async (req, res) => {
  const status = String(req.query.status ?? 'PENDING');
  const rows = await prisma.applicationSourceChange.findMany({
    where: { status: status as any }, orderBy: { requestedAt: 'desc' }, take: 200,
    include: { application: { select: { id: true, code: true, candidate: { select: { fullName: true } } } } },
  });
  res.json({ data: rows });
}));

intakeRouter.post('/source-changes/:id/decision', requirePermission('application.source_change_approve'), h(async (req, res) => {
  const body = parse(z.object({ decision: z.enum(['APPROVED', 'REJECTED']), reason: z.string().trim().min(3, 'Give a reason').max(500) }), req.body);
  const actor = actorId(req);
  await prisma.$transaction(async (tx) => {
    const ch = await tx.applicationSourceChange.findUnique({ where: { id: req.params.id } });
    if (!ch) throw new HttpError(404, 'Request not found');
    if (ch.status !== 'PENDING') throw new HttpError(409, 'This request has already been decided');
    if (ch.requestedById === actor) throw new HttpError(403, 'You cannot decide your own request');
    if (body.decision === 'APPROVED') {
      const app = await tx.application.findUnique({ where: { id: ch.applicationId }, include: { commission: true } });
      if (!app) throw new HttpError(404, 'Application not found');
      if (CLOSED.includes(app.lifecycleStatus)) throw new HttpError(409, 'Application is closed');
      if (app.sourceType !== ch.oldSourceType || (app.referralPartnerId ?? null) !== (ch.oldPartnerId ?? null))
        throw new HttpError(409, 'The application source changed since this request was made. Reject it and request again.');
      if (app.commission && app.commission.partnerId !== (ch.newPartnerId ?? null))
        throw new HttpError(409, 'A commission already exists for the current partner. Cancel or reverse it first.');
      await tx.application.update({ where: { id: app.id }, data: { sourceType: ch.newSourceType, referralPartnerId: ch.newPartnerId ?? null } });
    }
    await tx.applicationSourceChange.update({ where: { id: ch.id }, data: {
      status: body.decision as any, decidedById: actor, decidedAt: new Date(), decisionReason: body.reason } });
  });
  await A(req, 'SOURCE_CHANGE_DECIDED', 'application_source_change', req.params.id, { decision: body.decision });
  res.json({ data: { ok: true } });
}));
