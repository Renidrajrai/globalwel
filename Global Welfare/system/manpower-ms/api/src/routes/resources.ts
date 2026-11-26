import { randomUUID } from 'crypto';
import { Router, type Request, type RequestHandler, type Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { audit } from '../lib/audit';
import { HttpError } from '../lib/http';
import { candidateSearchWhere } from '../lib/candidateSearch';
import { alpha2ToAlpha3, resolveCountryName } from '../lib/countryCodes';
import { dateKey, isRealDate, toDateOnly, todayKathmandu } from '../lib/dates';
import { currentPriceWhere, positionBlockers } from '../lib/catalogueRules';
import { decideApproval } from '../lib/approvals';
import { requireAuth, requirePermission } from '../auth/middleware';
import { hashPassword } from '../lib/password';
import { nextDemandReference } from '../lib/demandReference';

type WriteRule = string | { create?: string; update?: string };

type Resource = {
  delegate: string;
  read: string[];
  write?: WriteRule;
  fields?: string[];
  createFields?: string[];
  updateFields?: string[];
  search?: string[];
  include?: Record<string, unknown>;
  select?: Record<string, boolean>;
  filters?: string[];
  orderBy?: Record<string, unknown> | Record<string, unknown>[];
  reverse?: boolean;
  searchWhere?: (q: string, req: Request, db: any) => Promise<Record<string, any> | null> | Record<string, any> | null;
  prepare?: (op: 'create' | 'update', data: Record<string, any>, existing: any | null, db: any) => Promise<void>;
  decorate?: (rows: any[], db: any) => Promise<any[]>;
};

const text = (v: unknown, label: string, min = 2, max = 200) => {
  if (typeof v !== 'string' || v.trim().length < min || v.trim().length > max)
    throw new HttpError(400, `${label} must be ${min} to ${max} characters.`, {});
  return v.trim();
};
const normName = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ');

const resources: Record<string, Resource> = {
  candidates: {
    delegate: 'candidate',
    read: ['candidate.read'],
    write: { update: 'candidate.update' },
    fields: ['fullName', 'dateOfBirth', 'phone', 'altPhone', 'email', 'address', 'nextOfKin', 'referId'],
    updateFields: ['fullName', 'dateOfBirth', 'phone', 'altPhone', 'email', 'address', 'nextOfKin', 'referId'],
    searchWhere: (q) => candidateSearchWhere(q, false),
    orderBy: [{ createdAt: 'desc' }],
    include: {
      refer: { select: { id: true, name: true } },
      applications: { select: { id: true, code: true, lifecycleStatus: true, currency: true, selectedAt: true, position: { select: { jobTitle: { select: { title: true } }, demand: { select: { reference: true, destinationCountry: { select: { name: true } }, employer: { select: { legalName: true } } } } } } } },
      passports: { select: { id: true, isCurrent: true, issueDate: true, expiryDate: true }, orderBy: { expiryDate: 'desc' } },
    },
    filters: ['referId'],
    prepare: async (op, data, existing, db) => {
      if ('referId' in data && data.referId) {
        const refer = await db.referralPartner.findUnique({ where: { id: data.referId }, select: { active: true } });
        if (!refer?.active) throw new HttpError(400, 'Select an active Refer source.', { referId: 'Refer is unavailable.' });
      }
      if (op !== 'update' || !('dateOfBirth' in data)) return;
      if (data.dateOfBirth === null || data.dateOfBirth === '') {
        const n = await db.candidatePassport.count({ where: { candidateId: existing.id } });
        if (n) throw new HttpError(400, 'Date of birth cannot be removed while a passport is on file.', { dateOfBirth: 'Required while a passport is on file.' });
        data.dateOfBirth = null;
        return;
      }
      if (!isRealDate(data.dateOfBirth) || data.dateOfBirth > todayKathmandu())
        throw new HttpError(400, 'Enter a valid date of birth that is not in the future.', { dateOfBirth: 'Enter a valid date that is not in the future.' });
      const first = await db.candidatePassport.findFirst({ where: { candidateId: existing.id }, orderBy: { issueDate: 'asc' } });
      if (first && dateKey(first.issueDate) < data.dateOfBirth)
        throw new HttpError(400, 'Date of birth is later than a passport issue date on file.', { dateOfBirth: 'This date of birth is after a passport issue date already on file.' });
      data.dateOfBirth = toDateOnly(data.dateOfBirth);
    },
  },
  applications: {
    delegate: 'application',
    read: ['application.read'],
    write: { update: 'application.update' },
    fields: ['code', 'candidateId', 'positionId', 'priceVersionId', 'currency', 'agreedAmountSnapshot', 'packageTotalSnapshot', 'sourceType', 'referralPartnerId', 'lifecycleStatus', 'holdReason', 'nextReviewOn', 'assignedToId'],
    updateFields: ['assignedToId', 'nextReviewOn'],
    search: ['code'],
    searchWhere: (q) => ({ OR: [
      { code: { contains: q, mode: 'insensitive' } },
      { candidate: { fullName: { contains: q, mode: 'insensitive' } } },
    ] }),
    include: {
      candidate: true,
      position: {
        include: {
          jobTitle: true,
          city: { include: { country: true } },
          demand: { include: { employer: true, destinationCountry: true, overseasAgency: true } },
        },
      },
      referralPartner: true,
      positionPreferences: { include: { position: { include: { jobTitle: true, demand: { include: { employer: true, destinationCountry: true, overseasAgency: true } } } } } },
    },
    filters: ['candidateId', 'positionId', 'lifecycleStatus', 'sourceType', 'referralPartnerId', 'assignedToId', 'selected'],
  },
  'referral-partners': {
    delegate: 'referralPartner', read: ['catalogue.read'], write: 'catalogue.manage',
    createFields: ['name', 'contact', 'notes'],
    updateFields: ['name', 'contact', 'notes', 'active'],
    fields: ['name', 'contact', 'notes', 'partnerType', 'verificationStatus', 'active'],
    search: ['name', 'contact', 'notes'], filters: ['active', 'verificationStatus'], orderBy: { name: 'asc' },
    include: { _count: { select: { referredCandidates: true } } },
    prepare: async (_op, data) => { if ('name' in data) data.name = text(data.name, 'Name'); },
  },
  countries: {
    delegate: 'country', read: ['catalogue.read'], write: 'catalogue.manage',
    createFields: ['name', 'region'],
    updateFields: ['name', 'region', 'displayOrder', 'active'],
    fields: ['iso2Code', 'iso3Code', 'name', 'region', 'displayOrder', 'active'],
    search: ['iso2Code', 'iso3Code', 'name'], filters: ['active', 'region'], orderBy: [{ region: 'asc' }, { displayOrder: 'asc' }, { name: 'asc' }],
    decorate: async (rows) => rows.map((row) => ({ ...row, iso3Code: row.iso3Code ?? alpha2ToAlpha3.get(row.iso2Code) ?? null })),
    prepare: async (op, data, existing, db) => {
      if ('region' in data && data.region === '') data.region = null;
      if ('region' in data && data.region !== null && !['EUROPE', 'GULF'].includes(data.region)) throw new HttpError(400, 'Choose Europe or Gulf.', { region: 'Choose a valid region.' });
      if ('displayOrder' in data && (!Number.isInteger(data.displayOrder) || data.displayOrder < 0 || data.displayOrder > 100000)) throw new HttpError(400, 'Invalid country order.', { displayOrder: 'Use a whole number from 0 to 100000.' });
      if (op === 'create') {
        const country = resolveCountryName(text(data.name, 'Country name'));
        if (!country) throw new HttpError(400, 'Enter a recognized, unambiguous country name.', { name: 'Use the full country name; Congo and Korea need a more specific name.' });
        if (await db.country.findUnique({ where: { iso2Code: country.iso2 } })) throw new HttpError(409, 'This country is already in the catalogue.', { name: 'Already exists.' });
        data.name = country.name; data.iso2Code = country.iso2; data.iso3Code = country.iso3;
      }
      if ('name' in data && op !== 'create') data.name = text(data.name, 'Name');
      if (op === 'update' && data.active === false && existing.active) {
        const n = await db.jobDemand.count({ where: { destinationCountryId: existing.id, active: true } });
        if (n) throw new HttpError(409, 'This country has active demands. Deactivate them first.');
        const passports = await db.candidatePassport.count({ where: { issuingCountryId: existing.id } });
        if (passports) throw new HttpError(409, 'This country is used as a passport issuing country and cannot be deactivated.');
      }
    },
  },
  cities: {
    delegate: 'city', read: ['catalogue.read'],
    search: ['name'], filters: ['countryId', 'active'], orderBy: { name: 'asc' },
    include: { country: { select: { id: true, name: true, iso2Code: true } } },
  },
  employers: {
    delegate: 'employer', read: ['catalogue.read'], write: 'catalogue.manage',
    createFields: ['registeredCountryId', 'legalName', 'reference', 'contactName', 'email', 'phone'],
    updateFields: ['legalName', 'reference', 'contactName', 'email', 'phone', 'active'],
    fields: ['registeredCountryId', 'legalName', 'reference', 'contactName', 'email', 'phone', 'verificationStatus', 'active'],
    search: ['legalName', 'reference', 'contactName'], filters: ['registeredCountryId', 'active', 'verificationStatus', 'overseasAgencyId'],
    orderBy: { legalName: 'asc' },
    include: { registeredCountry: { select: { id: true, name: true, iso2Code: true } }, destinationCountries: { include: { country: { select: { id: true, name: true } } } }, overseasAgencies: { include: { overseasAgency: { select: { id: true, name: true, country: { select: { id: true, name: true } } } } } }, jobTitles: { include: { jobTitle: true } } },
    prepare: async (op, data, existing, db) => {
      if ('legalName' in data) data.legalName = text(data.legalName, 'Legal name');
      if (op === 'update' && data.active === false && existing.active) {
        const n = await db.jobDemand.count({ where: { employerId: existing.id, active: true } });
        if (n) throw new HttpError(409, 'This employer has active demands. Deactivate them first.');
      }
    },
  },
  'overseas-agencies': {
    delegate: 'overseasAgency', read: ['catalogue.read'], write: 'catalogue.manage',
    createFields: ['countryId', 'name', 'contactName', 'phone', 'email', 'notes'],
    updateFields: ['countryId', 'name', 'contactName', 'phone', 'email', 'notes', 'active'],
    fields: ['countryId', 'name', 'contactName', 'phone', 'email', 'notes', 'active'],
    search: ['name', 'contactName', 'phone', 'email'], filters: ['countryId', 'active'], orderBy: [{ name: 'asc' }],
    include: { country: { select: { id: true, name: true } }, employers: { include: { employer: { select: { id: true, legalName: true } } } }, demands: { select: { id: true, reference: true, active: true, positions: { select: { id: true, vacancies: true, jobTitle: { select: { title: true } } } } } } },
    prepare: async (op, data, existing, db) => {
      if ('name' in data) data.name = text(data.name, 'Agency name');
      if (op === 'update' && data.active === false && existing.active) {
        const n = await db.jobDemand.count({ where: { overseasAgencyId: existing.id, active: true } });
        if (n) throw new HttpError(409, 'This agency has active demands. Deactivate them first.');
      }
    },
  },
  demands: {
    delegate: 'jobDemand', read: ['catalogue.read'], write: { update: 'catalogue.manage' },
    updateFields: ['overseasAgencyId', 'expiresOn', 'active'],
    fields: ['employerId', 'destinationCountryId', 'overseasAgencyId', 'reference', 'feimsReference', 'expiresOn', 'active'],
    search: ['reference', 'feimsReference'], filters: ['employerId', 'destinationCountryId', 'overseasAgencyId', 'active'],
    orderBy: [{ createdAt: 'desc' }],
    include: { employer: true, overseasAgency: true, destinationCountry: true, positions: { include: { jobTitle: true, city: true, applications: { where: { selectedAt: { not: null } }, select: { id: true } }, priceVersions: { include: { components: true }, orderBy: { createdAt: 'desc' } } } } },
    searchWhere: (q) => ({ OR: [
      { reference: { contains: q, mode: 'insensitive' } },
      { employer: { legalName: { contains: q, mode: 'insensitive' } } },
      { overseasAgency: { name: { contains: q, mode: 'insensitive' } } },
      { positions: { some: { jobTitle: { title: { contains: q, mode: 'insensitive' } } } } },
    ] }),
    prepare: async (op, data, existing, db) => {
      if (op === 'update' && 'overseasAgencyId' in data && data.overseasAgencyId) {
        const link = await db.employerOverseasAgency.findUnique({
          where: { employerId_overseasAgencyId: { employerId: existing.employerId, overseasAgencyId: data.overseasAgencyId } },
          include: { overseasAgency: { select: { active: true } } },
        });
        if (!link?.overseasAgency.active) throw new HttpError(400, 'Choose an active agency linked to this company.', { overseasAgencyId: 'Not linked.' });
      }
      if ('reference' in data) data.reference = text(data.reference, 'Reference', 2, 100);
      if ('feimsReference' in data) {
        data.feimsReference = data.feimsReference ? text(data.feimsReference, 'FEIMS reference', 2, 100) : null;
      }
      if ('expiresOn' in data) {
        if (!data.expiresOn) data.expiresOn = null;
        else if (!isRealDate(data.expiresOn)) throw new HttpError(400, 'Expiry date is not a valid date.', { expiresOn: 'Not a valid date.' });
        else data.expiresOn = toDateOnly(data.expiresOn);
      }
    },
  },
  positions: {
    delegate: 'jobPosition', read: ['catalogue.read'], write: { update: 'catalogue.manage' },
    updateFields: ['vacancies', 'salaryAmount', 'salaryCurrency', 'terms', 'active'],
    fields: ['demandId', 'destinationCountryId', 'cityId', 'jobTitleId', 'vacancies', 'salaryAmount', 'salaryCurrency', 'terms', 'active'],
    filters: ['demandId', 'destinationCountryId', 'jobTitleId', 'active'],
    orderBy: [{ createdAt: 'desc' }],
    include: { jobTitle: true, city: { include: { country: true } }, demand: { include: { employer: true, destinationCountry: true } } },
    searchWhere: (q) => ({ OR: [
      { jobTitle: { title: { contains: q, mode: 'insensitive' } } },
      { demand: { reference: { contains: q, mode: 'insensitive' } } },
      { demand: { employer: { legalName: { contains: q, mode: 'insensitive' } } } },
    ] }),
    decorate: async (rows, db) => {
      const today = toDateOnly(todayKathmandu());
      const priced = new Set((await db.jobPriceVersion.findMany({
        where: { positionId: { in: rows.map((r) => r.id) }, ...currentPriceWhere() }, select: { positionId: true },
      })).map((p: any) => p.positionId));
      return rows.map((r) => ({ ...r, blockers: positionBlockers(r, priced.has(r.id), today) }));
    },
    prepare: async (_op, data, existing, db) => {
      if ('vacancies' in data) {
        if (!Number.isInteger(data.vacancies) || data.vacancies < 1 || data.vacancies > 100000)
          throw new HttpError(400, 'Workers required must be 1 to 100000. To close a position, deactivate it.', { vacancies: 'Invalid.' });
        const filled = await db.application.count({ where: { positionId: existing.id, selectedAt: { not: null } } });
        if (data.vacancies < filled) throw new HttpError(409, `${filled} workers are already selected. Vacancies cannot go below that.`, { vacancies: 'Below selected workers.' });
      }
      if ('salaryAmount' in data || 'salaryCurrency' in data) {
        const a = data.salaryAmount ?? null, c = data.salaryCurrency ? String(data.salaryCurrency).toUpperCase() : null;
        if ((a === null) !== (c === null)) throw new HttpError(400, 'Salary amount and currency must be given together.', { salaryCurrency: 'Required with amount.' });
        if (a !== null && !(typeof a === 'number' && a >= 0)) throw new HttpError(400, 'Salary must be zero or more.', { salaryAmount: 'Invalid.' });
        if (c !== null && !/^[A-Z]{3}$/.test(c)) throw new HttpError(400, 'Currency must be a 3-letter code.', { salaryCurrency: 'Invalid.' });
        data.salaryAmount = a; data.salaryCurrency = c;
      }
    },
  },
  'price-versions': {
    delegate: 'jobPriceVersion', read: ['catalogue.read'],
    fields: ['positionId', 'currency', 'effectiveFrom', 'effectiveTo', 'approvalStatus', 'changeReason', 'complianceReference'],
    filters: ['positionId', 'approvalStatus'],
    orderBy: [{ createdAt: 'desc' }],
    include: { position: { include: { jobTitle: true, city: true } }, components: true },
  },
  'job-titles': {
    delegate: 'jobTitle', read: ['catalogue.read'], write: 'catalogue.manage',
    createFields: ['title', 'description'],
    updateFields: ['title', 'description', 'active'],
    fields: ['title', 'normalizedTitle', 'description', 'active'],
    search: ['title'], filters: ['active'], orderBy: { title: 'asc' },
    prepare: async (op, data, existing, db) => {
      if ('title' in data) { data.title = text(data.title, 'Title'); data.normalizedTitle = normName(data.title); }
      if (op === 'update' && data.active === false && existing.active) {
        const n = await db.jobPosition.count({ where: { jobTitleId: existing.id, active: true } });
        if (n) throw new HttpError(409, 'This job title has active positions. Deactivate them first.');
      }
    },
  },
  'status-history': {
    delegate: 'applicationStatusHistory',
    read: ['application.read'],
    include: { application: { select: { code: true } } },
    filters: ['applicationId'],
  },
  'installment-templates': {
    delegate: 'paymentPlanTemplate',
    read: ['finance.receipt.read'],
    write: 'finance.receipt.record',
    fields: ['name', 'active'],
    search: ['name'],
    filters: ['active'],
  },
  installments: {
    delegate: 'applicationInstallment',
    read: ['finance.receipt.read'],
    write: 'finance.receipt.record',
    fields: ['applicationId', 'seq', 'label', 'expectedAmount', 'dueOn'],
    include: { application: { select: { code: true, currency: true } } },
    filters: ['applicationId'],
    orderBy: [{ applicationId: 'asc' }, { seq: 'asc' }],
  },
  'candidate-payments': {
    delegate: 'candidatePayment',
    read: ['finance.receipt.read'],
    write: 'finance.receipt.record',
    fields: ['applicationId', 'installmentId', 'amount', 'currency', 'receivedOn', 'method', 'receiptNumber', 'bankReference', 'payerName', 'payerRelationship', 'note'],
    include: { application: { select: { code: true } }, installment: true },
    filters: ['applicationId', 'installmentId', 'currency', 'method'],
    reverse: true,
  },
  'expense-categories': {
    delegate: 'expenseCategory', read: ['catalogue.read'], write: 'catalogue.manage',
    createFields: ['parentId', 'name'],
    updateFields: ['name', 'active'],
    fields: ['parentId', 'name', 'normalizedName', 'isSystem', 'active'],
    search: ['name'], filters: ['parentId', 'active'], orderBy: { name: 'asc' },
    include: { parent: { select: { id: true, name: true } }, children: { select: { id: true, name: true, parentId: true } } },
    prepare: async (op, data, existing, db) => {
      if (op === 'update' && existing.isSystem) throw new HttpError(403, 'System categories cannot be changed.');
      if ('name' in data) { data.name = text(data.name, 'Name'); data.normalizedName = normName(data.name); }
      if (op === 'create') {
        data.parentId = data.parentId || null;
        if (data.parentId) {
          const parent = await db.expenseCategory.findUnique({ where: { id: data.parentId } });
          if (!parent || !parent.active) throw new HttpError(400, 'Parent category not found or inactive.', { parentId: 'Not available.' });
          if (parent.parentId) throw new HttpError(400, 'Categories can only be two levels deep (parent, then child).', { parentId: 'Choose a top-level category.' });
        }
        const dup = await db.expenseCategory.findFirst({ where: { parentId: data.parentId, normalizedName: data.normalizedName } });
        if (dup) throw new HttpError(409, 'A category with this name already exists here.', { name: 'Already exists.' });
      }
    },
  },
  expenses: {
    delegate: 'companyExpense',
    read: ['finance.expense.read'],
    write: 'finance.expense.record',
    fields: ['categoryId', 'expenseDate', 'amount', 'currency', 'payee', 'paymentMethod', 'reference', 'description'],
    include: { category: true, allocations: { include: { application: { select: { id: true, code: true } } } } },
    filters: ['categoryId', 'currency', 'applicationId'],
    reverse: true,
  },
  commissions: {
    delegate: 'partnerCommission',
    read: ['finance.commission.manage', 'finance.commission.approve'],
    write: 'finance.commission.manage',
    fields: ['applicationId', 'partnerId', 'agreedAmount', 'currency', 'payableWhen', 'approvalStatus'],
    include: { partner: true, application: { select: { id: true, code: true } }, payments: true },
    filters: ['applicationId', 'partnerId', 'approvalStatus'],
  },
  'commission-payments': {
    delegate: 'commissionPayment',
    read: ['finance.commission.manage'],
    write: 'finance.commission.manage',
    fields: ['commissionId', 'amount', 'currency', 'paidOn', 'method', 'bankReference'],
    include: { commission: { select: { id: true, applicationId: true, partnerId: true } } },
    filters: ['commissionId', 'currency'],
    reverse: true,
  },
  settlements: {
    delegate: 'candidateSettlement',
    read: ['finance.settlement.prepare'],
    write: 'finance.settlement.prepare',
    fields: ['applicationId', 'revisionNo', 'stopReason', 'status', 'currency', 'receivedTotalSnapshot', 'approvedRetentionTotal', 'refundDue'],
    include: { application: { select: { id: true, code: true } }, lines: true, refunds: true },
    filters: ['applicationId', 'status', 'currency'],
  },
  'settlement-lines': {
    delegate: 'settlementLine',
    read: ['finance.settlement.prepare'],
    write: 'finance.settlement.prepare',
    fields: ['settlementId', 'applicationId', 'expenseId', 'lineType', 'amount', 'basis', 'approvalStatus'],
    include: { settlement: { select: { id: true, revisionNo: true, status: true } } },
    filters: ['settlementId', 'applicationId', 'approvalStatus'],
  },
  refunds: {
    delegate: 'candidateRefund',
    read: ['finance.settlement.prepare'],
    write: 'finance.settlement.prepare',
    fields: ['settlementId', 'amount', 'currency', 'paidOn', 'method', 'bankReference'],
    include: { settlement: { select: { id: true, revisionNo: true, applicationId: true } } },
    filters: ['settlementId', 'currency'],
    reverse: true,
  },
  'approval-actions': {
    delegate: 'approvalAction',
    read: ['application.read'],
    filters: ['decision', 'entityType', 'entityId'],
  },
  'audit-logs': {
    delegate: 'auditLog',
    read: ['audit.read'],
    search: ['action', 'entityType', 'actorUserId'],
    filters: ['action', 'entityType', 'actorUserId'],
    orderBy: { at: 'desc' },
  },
  users: {
    delegate: 'user',
    read: ['admin.users.manage'],
    write: 'admin.users.manage',
    fields: ['email', 'fullName', 'status', 'roles'],
    select: { id: true, email: true, fullName: true, status: true, failedLogins: true, lockedUntil: true, lastLoginAt: true, createdAt: true },
    search: ['email', 'fullName'],
    filters: ['status'],
  },
};

type Reversal = {
  delegate: string;
  entity: string;
  link: string;
  build: (original: any, reason: string, userId: string) => Record<string, any>;
};

const negative = (amount: any) => new Prisma.Decimal(amount.toString()).negated();

const reversals: Record<string, Reversal> = {
  'candidate-payments': {
    delegate: 'candidatePayment',
    entity: 'CANDIDATE_PAYMENT',
    link: 'reversesPaymentId',
    build: (o, reason, userId) => ({
      applicationId: o.applicationId,
      installmentId: o.installmentId,
      amount: negative(o.amount),
      currency: o.currency,
      receivedOn: o.receivedOn,
      method: o.method,
      receiptNumber: `${o.receiptNumber}-REV-${randomUUID().slice(0, 8)}`,
      bankReference: o.bankReference,
      payerName: o.payerName,
      payerRelationship: o.payerRelationship,
      note: o.note,
      reversesPaymentId: o.id,
      reversalReason: reason,
      createdById: userId,
    }),
  },
  expenses: {
    delegate: 'companyExpense',
    entity: 'COMPANY_EXPENSE',
    link: 'reversesExpenseId',
    build: (o, reason, userId) => ({
      categoryId: o.categoryId,
      expenseDate: o.expenseDate,
      amount: negative(o.amount),
      currency: o.currency,
      payee: o.payee,
      paymentMethod: o.paymentMethod,
      reference: o.reference,
      description: o.description,
      reversesExpenseId: o.id,
      reversalReason: reason,
      recordedById: userId,
    }),
  },
  'commission-payments': {
    delegate: 'commissionPayment',
    entity: 'COMMISSION_PAYMENT',
    link: 'reversesPaymentId',
    build: (o, reason, userId) => ({
      commissionId: o.commissionId,
      amount: negative(o.amount),
      currency: o.currency,
      paidOn: o.paidOn,
      method: o.method,
      bankReference: o.bankReference,
      reversesPaymentId: o.id,
      reversalReason: reason,
      createdById: userId,
    }),
  },
  refunds: {
    delegate: 'candidateRefund',
    entity: 'CANDIDATE_REFUND',
    link: 'reversesRefundId',
    build: (o, reason, userId) => ({
      settlementId: o.settlementId,
      amount: negative(o.amount),
      currency: o.currency,
      paidOn: o.paidOn,
      method: o.method,
      bankReference: o.bankReference,
      reversesRefundId: o.id,
      reversalReason: reason,
      recordedById: userId,
    }),
  },
};

const lifecycleStatuses = new Set(['ACTIVE', 'ON_HOLD', 'STOPPED_PENDING_SETTLEMENT', 'CLOSED_SUCCESSFULLY', 'CLOSED_UNSUCCESSFULLY']);

const MANUAL_LIFECYCLE = new Set(['ACTIVE', 'ON_HOLD', 'STOPPED_PENDING_SETTLEMENT']);
const CLOSED_LIFECYCLE = new Set(['CLOSED_SUCCESSFULLY', 'CLOSED_UNSUCCESSFULLY']);
const NO_PASSPORT_HOLD = 'No passport on file at intake';

const anyPermission =
  (...codes: string[]): RequestHandler =>
  (req, res, next) => {
    if (!req.auth) return res.status(401).json({ error: 'You are not signed in.' });
    if (!codes.some((code) => req.auth!.permissions.has(code))) {
      return res.status(403).json({ error: 'Your role does not allow this action.' });
    }
    next();
  };

const permissionFor = (codes: string[]) => (codes.length === 1 ? requirePermission(codes[0]) : anyPermission(...codes));

const serialize = (value: any): any => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Prisma.Decimal) return value.toString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'passwordHash')
        .map(([key, item]) => [key, serialize(item)]),
    );
  }
  return value;
};

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch((err) => {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...(err.fields ? { fields: err.fields } : {}) });
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Record not found.' });
        if (err.code === 'P2002') return res.status(409).json({ error: 'A record with these details already exists.' });
        if (err.code === 'P2023') return res.status(400).json({ error: 'Invalid identifier.' });
        if (err.code === 'P2003' || err.code === 'P2014') {
          return res.status(400).json({ error: 'A related record does not exist.' });
        }
      }
      next(err);
    });
  };

const delegateOf = (config: Resource, db: unknown = prisma) => (db as Record<string, any>)[config.delegate];

const guard = (kind: 'read' | 'create' | 'update'): RequestHandler => (req, res, next) => {
  const config = resources[req.params.name];
  if (!config) return res.status(404).json({ error: 'Unknown resource.' });
  if (kind === 'read') return permissionFor(config.read)(req, res, next);
  if (!config.write) return res.status(403).json({ error: 'This resource is read-only.' });
  const code = typeof config.write === 'string' ? config.write : config.write[kind];
  if (!code) return res.status(403).json({ error: 'This action is not allowed for this resource.' });
  return permissionFor([code])(req, res, next);
};

const pagination = (req: Request) => {
  const pageValue = req.query.page ?? '1';
  const sizeValue = req.query.pageSize ?? '50';
  const page = typeof pageValue === 'string' && /^\d+$/.test(pageValue) ? Number(pageValue) : 0;
  const pageSize = typeof sizeValue === 'string' && /^\d+$/.test(sizeValue) ? Number(sizeValue) : 0;
  if (page < 1 || pageSize < 1 || pageSize > 200) throw new HttpError(400, 'Invalid page or pageSize.');
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
};

const buildWhere = async (config: Resource, req: Request) => {
  const where: Record<string, any> = {};
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q && config.searchWhere) {
    const w = await config.searchWhere(q, req, prisma);
    if (w) Object.assign(where, w);
  } else if (q && config.search?.length) {
    where.OR = config.search.map((field) => ({ [field]: { contains: q, mode: 'insensitive' } }));
  }
  for (const key of config.filters ?? []) {
    const raw = req.query[key];
    if (typeof raw !== 'string' || raw === '') continue;
    if ((key === 'active' || key === 'selected') && raw !== 'true' && raw !== 'false') throw new HttpError(400, `Invalid ${key} filter.`);
    const value = key === 'active' || key === 'selected' ? raw === 'true' : raw;
      if (key === 'overseasAgencyId' && config.delegate === 'employer') {
        where.overseasAgencies = { some: { overseasAgencyId: value } };
      } else if (key === 'selected' && config.delegate === 'application') {
      where.selectedAt = value ? { not: null } : null;
    } else if (config.delegate === 'companyExpense' && key === 'applicationId') {
      where.allocations = { some: { applicationId: value } };
    } else {
      where[key] = value;
    }
  }
  return where;
};

const pickFields = (body: any, fields: string[] = []) => {
  const data: Record<string, any> = {};
  for (const key of fields) {
    if (body && Object.prototype.hasOwnProperty.call(body, key) && body[key] !== undefined) data[key] = body[key];
  }
  return data;
};

const userData = async (body: any, create: boolean) => {
  const data = pickFields(body, ['email', 'fullName', 'status']);
  if (create || body?.password !== undefined) {
    if (typeof body?.password !== 'string' || body.password.length < 8) {
      throw new HttpError(400, 'Password must be at least 8 characters.');
    }
    data.passwordHash = await hashPassword(body.password);
  }
  const rawRoles = Array.isArray(body?.roles)
    ? body.roles
    : typeof body?.roles === 'string'
      ? body.roles.split(',').map((code: string) => code.trim()).filter(Boolean)
      : [];
  if (body?.roles !== undefined) {
    const codes = rawRoles.filter((code: unknown): code is string => typeof code === 'string');
    const roles = codes.length ? await prisma.role.findMany({ where: { code: { in: codes } }, select: { id: true } }) : [];
    data.roles = create
      ? { create: roles.map((role) => ({ roleId: role.id })) }
      : { deleteMany: {}, create: roles.map((role) => ({ roleId: role.id })) };
  }
  return data;
};

const shape = (config: Resource) => (config.select ? { select: config.select } : { include: config.include });

export const resourcesRouter = Router();

resourcesRouter.get('/:name', requireAuth, guard('read'), wrap(async (req, res) => {
  const config = resources[req.params.name]!;
  const { page, pageSize, skip, take } = pagination(req);
  const where = await buildWhere(config, req);
  if (req.params.name === 'approval-actions') {
    where.entityType = { in: ['JOB_PRICE_VERSION', 'PARTNER_COMMISSION', 'CANDIDATE_SETTLEMENT'] };
  }
  const [rows, total] = await Promise.all([
    delegateOf(config).findMany({ where, skip, take, orderBy: config.orderBy ?? { id: 'asc' }, ...shape(config) }),
    delegateOf(config).count({ where }),
  ]);
  const out = config.decorate ? await config.decorate(rows, prisma) : rows;
  res.json({ data: serialize(out), total, page, pageSize });
}));

resourcesRouter.get('/:name/:id', requireAuth, guard('read'), wrap(async (req, res) => {
  const config = resources[req.params.name]!;
  const row = await delegateOf(config).findUnique({ where: { id: req.params.id }, ...shape(config) });
  if (!row) throw new HttpError(404, 'Record not found.');
  res.json({ data: serialize(row) });
}));

resourcesRouter.post('/:name', requireAuth, guard('create'), wrap(async (req, res) => {
  const config = resources[req.params.name]!;
  const data = config.delegate === 'user' ? await userData(req.body, true) : pickFields(req.body, config.createFields ?? config.fields);
  if (config.delegate === 'jobDemand') data.reference = await prisma.$transaction((tx) => nextDemandReference(tx));
  if (config.prepare) await config.prepare('create', data, null, prisma);
  if (config.delegate === 'candidate' && !data.nameNormalized && typeof data.fullName === 'string') {
    data.nameNormalized = data.fullName.trim().toLowerCase().replace(/\s+/g, ' ');
  }
  if (!Object.keys(data).length) throw new HttpError(400, 'No valid fields supplied.');
  const row = await delegateOf(config).create({ data, ...shape(config) });
  await audit(req, 'CATALOGUE_RESOURCE_CREATED', { entityType: req.params.name, entityId: row.id, detail: { fields: Object.keys(data) } });
  res.status(201).json({ data: serialize(row) });
}));

resourcesRouter.patch('/:name/:id', requireAuth, guard('update'), wrap(async (req, res) => {
  const config = resources[req.params.name]!;
  const existing = config.prepare ? await delegateOf(config).findUnique({ where: { id: req.params.id } }) : null;
  if (config.prepare && !existing) throw new HttpError(404, 'Record not found.');
  const data = config.delegate === 'user' ? await userData(req.body, false) : pickFields(req.body, config.updateFields ?? config.fields);
  if (config.prepare) await config.prepare('update', data, existing, prisma);
  if (config.delegate === 'candidate' && typeof data.fullName === 'string') {
    data.nameNormalized = data.fullName.trim().toLowerCase().replace(/\s+/g, ' ');
  }
  if (!Object.keys(data).length) throw new HttpError(400, 'No valid fields supplied.');
  const row = await delegateOf(config).update({ where: { id: req.params.id }, data, ...shape(config) });
  await audit(req, 'CATALOGUE_RESOURCE_UPDATED', { entityType: req.params.name, entityId: row.id, detail: { fields: Object.keys(data) } });
  res.json({ data: serialize(row) });
}));

resourcesRouter.post('/countries/reorder', requireAuth, requirePermission('catalogue.manage'), wrap(async (req, res) => {
  const { region, orderedIds } = req.body ?? {};
  if (!(region === null || region === 'EUROPE' || region === 'GULF') || !Array.isArray(orderedIds) || orderedIds.length > 300 || orderedIds.some((id: unknown) => typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) || new Set(orderedIds).size !== orderedIds.length)
    throw new HttpError(400, 'Choose a valid region and country order.');
  const existing = await prisma.country.findMany({ where: { id: { in: orderedIds } }, select: { id: true, region: true } });
  if (existing.length !== orderedIds.length || existing.filter((row) => row.region !== region).length > 1) throw new HttpError(400, 'The country order contains an unknown country or invalid region change.');
  await prisma.$transaction(orderedIds.map((id: string, index: number) => prisma.country.update({ where: { id }, data: { region, displayOrder: (index + 1) * 10 } })));
  res.json({ data: { ok: true } });
}));

resourcesRouter.put('/employers/:id/overseas-agencies', requireAuth, requirePermission('catalogue.manage'), wrap(async (req, res) => {
  const ids = req.body?.overseasAgencyIds;
  if (!Array.isArray(ids) || ids.length > 100 || ids.some((id: unknown) => typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)))
    throw new HttpError(400, 'Choose valid overseas agencies.', { overseasAgencyIds: 'Invalid agency list.' });
  const uniqueIds = [...new Set(ids as string[])];
  const [employer, agencies] = await Promise.all([
    prisma.employer.findUnique({ where: { id: req.params.id }, select: { id: true } }),
    prisma.overseasAgency.findMany({ where: { id: { in: uniqueIds }, active: true }, select: { id: true } }),
  ]);
  if (!employer) throw new HttpError(404, 'Company not found.');
  if (agencies.length !== uniqueIds.length) throw new HttpError(400, 'One or more agencies are unavailable.');
  await prisma.$transaction(async (tx) => {
    await tx.employerOverseasAgency.deleteMany({ where: { employerId: employer.id } });
    if (uniqueIds.length) await tx.employerOverseasAgency.createMany({ data: uniqueIds.map((overseasAgencyId) => ({ employerId: employer.id, overseasAgencyId })) });
  });
  await audit(req, 'COMPANY_OVERSEAS_AGENCIES_UPDATED', { entityType: 'employer', entityId: employer.id, detail: { count: uniqueIds.length } });
  res.json({ data: { ok: true, overseasAgencyIds: uniqueIds } });
}));

resourcesRouter.put('/employers/:id/destination-countries', requireAuth, requirePermission('catalogue.manage'), wrap(async (req, res) => {
  const ids = req.body?.countryIds;
  if (!Array.isArray(ids) || ids.length > 100 || ids.some((id: unknown) => typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)))
    throw new HttpError(400, 'Choose valid destination countries.', { countryIds: 'Invalid country list.' });
  const uniqueIds = [...new Set(ids as string[])];
  const [employer, countries] = await Promise.all([
    prisma.employer.findUnique({ where: { id: req.params.id }, select: { id: true } }),
    prisma.country.findMany({ where: { id: { in: uniqueIds }, active: true }, select: { id: true } }),
  ]);
  if (!employer) throw new HttpError(404, 'Company not found.');
  if (countries.length !== uniqueIds.length) throw new HttpError(400, 'One or more countries are unavailable.');
  await prisma.$transaction(async (tx) => {
    await tx.employerDestinationCountry.deleteMany({ where: { employerId: employer.id } });
    if (uniqueIds.length) await tx.employerDestinationCountry.createMany({ data: uniqueIds.map((countryId) => ({ employerId: employer.id, countryId })) });
  });
  await audit(req, 'COMPANY_DESTINATION_COUNTRIES_UPDATED', { entityType: 'employer', entityId: employer.id, detail: { count: uniqueIds.length } });
  res.json({ data: { ok: true, countryIds: uniqueIds } });
}));

resourcesRouter.put('/employers/:id/relationships', requireAuth, requirePermission('catalogue.manage'), wrap(async (req, res) => {
  const countryIds = req.body?.countryIds; const overseasAgencyIds = req.body?.overseasAgencyIds;
  const validIds = (ids: unknown) => Array.isArray(ids) && ids.length <= 100 && ids.every((id) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id));
  if (!validIds(countryIds) || !validIds(overseasAgencyIds)) throw new HttpError(400, 'Choose valid countries and agencies.');
  const countriesToLink = [...new Set(countryIds as string[])]; const agenciesToLink = [...new Set(overseasAgencyIds as string[])];
  const [employer, countries, agencies] = await Promise.all([
    prisma.employer.findUnique({ where: { id: req.params.id }, select: { id: true } }),
    prisma.country.findMany({ where: { id: { in: countriesToLink }, active: true }, select: { id: true } }),
    prisma.overseasAgency.findMany({ where: { id: { in: agenciesToLink }, active: true }, select: { id: true } }),
  ]);
  if (!employer) throw new HttpError(404, 'Company not found.');
  if (countries.length !== countriesToLink.length || agencies.length !== agenciesToLink.length) throw new HttpError(400, 'One or more relationship records are unavailable.');
  const orphaned = await prisma.jobDemand.findMany({ where: { employerId: employer.id, active: true, overseasAgencyId: { not: null, notIn: agenciesToLink } }, select: { reference: true }, take: 5 });
  if (orphaned.length) throw new HttpError(409, `Active demands (${orphaned.map((d) => d.reference).join(', ')}) use an agency you are removing.`);
  if (countriesToLink.length) {
    const outside = await prisma.jobDemand.findMany({ where: { employerId: employer.id, active: true, destinationCountryId: { notIn: countriesToLink } }, select: { reference: true }, take: 5 });
    if (outside.length) throw new HttpError(409, `Active demands (${outside.map((d) => d.reference).join(', ')}) use a destination you are removing.`);
  }
  await prisma.$transaction(async (tx) => {
    await tx.employerDestinationCountry.deleteMany({ where: { employerId: employer.id } });
    await tx.employerOverseasAgency.deleteMany({ where: { employerId: employer.id } });
    if (countriesToLink.length) await tx.employerDestinationCountry.createMany({ data: countriesToLink.map((countryId) => ({ employerId: employer.id, countryId })) });
    if (agenciesToLink.length) await tx.employerOverseasAgency.createMany({ data: agenciesToLink.map((overseasAgencyId) => ({ employerId: employer.id, overseasAgencyId })) });
  });
  await audit(req, 'COMPANY_RELATIONSHIPS_UPDATED', { entityType: 'employer', entityId: employer.id, detail: { countryCount: countriesToLink.length, agencyCount: agenciesToLink.length } });
  res.json({ data: { ok: true } });
}));

resourcesRouter.post('/overseas-agencies/:id/companies/link', requireAuth, requirePermission('catalogue.manage'), wrap(async (req, res) => {
  const employerId = req.body?.employerId;
  if (typeof employerId !== 'string' || !/^[0-9a-f-]{36}$/i.test(employerId)) throw new HttpError(400, 'Choose a valid company.');
  const [agency, employer] = await Promise.all([
    prisma.overseasAgency.findUnique({ where: { id: req.params.id }, select: { id: true, active: true } }),
    prisma.employer.findUnique({ where: { id: employerId }, select: { id: true, active: true } }),
  ]);
  if (!agency?.active) throw new HttpError(404, 'Active overseas agency not found.');
  if (!employer?.active) throw new HttpError(404, 'Active company not found.');
  const link = await prisma.$transaction(async (tx) => {
    const existing = await tx.employerOverseasAgency.findUnique({ where: { employerId_overseasAgencyId: { employerId, overseasAgencyId: agency.id } } });
    await tx.employerOverseasAgency.upsert({
      where: { employerId_overseasAgencyId: { employerId, overseasAgencyId: agency.id } },
      create: { employerId, overseasAgencyId: agency.id }, update: {},
    });
    const company = await tx.employer.findUnique({ where: { id: employerId }, include: {
      registeredCountry: true, overseasAgencies: { include: { overseasAgency: true } },
      destinationCountries: { include: { country: true } }, jobTitles: { include: { jobTitle: true } },
    } });
    return { company, created: !existing };
  });
  if (link.created) await audit(req, 'COMPANY_LINKED_TO_OVERSEAS_AGENCY', { entityType: 'employer', entityId: employerId, detail: { overseasAgencyId: agency.id } });
  res.status(link.created ? 201 : 200).json({ data: serialize(link.company) });
}));

resourcesRouter.post('/overseas-agencies/:id/companies', requireAuth, requirePermission('catalogue.manage'), wrap(async (req, res) => {
  const body = req.body ?? {};
  const legalName = text(body.legalName, 'Company name');
  const rawCountryIds = Array.isArray(body.countryIds) ? body.countryIds : body.destinationCountryId ? [body.destinationCountryId] : [];
  if (rawCountryIds.length > 100 || rawCountryIds.some((id: unknown) => typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id))) throw new HttpError(400, 'Choose valid destination countries.');
  const countryIds = [...new Set(rawCountryIds as string[])];
  if (!countryIds.length) throw new HttpError(400, 'Choose a destination country.', { destinationCountryId: 'A destination country is required.' });
  const [agency, countries] = await Promise.all([
    prisma.overseasAgency.findUnique({ where: { id: req.params.id }, select: { id: true, countryId: true, active: true } }),
    prisma.country.findMany({ where: { id: { in: countryIds }, active: true }, select: { id: true } }),
  ]);
  if (!agency?.active) throw new HttpError(404, 'Active overseas agency not found.');
  if (countries.length !== countryIds.length) throw new HttpError(400, 'One or more destination countries are unavailable.');
  const duplicate = await prisma.employer.findFirst({ where: {
    legalName: { equals: legalName, mode: 'insensitive' },
    overseasAgencies: { some: { overseasAgencyId: agency.id } },
  }, select: { id: true } });
  if (duplicate) throw new HttpError(409, 'A company with this name is already linked to this agency.');
  const company = await prisma.$transaction(async (tx) => tx.employer.create({ data: {
    registeredCountryId: agency.countryId, legalName, contactName: typeof body.contactName === 'string' ? body.contactName.trim() || null : null,
    phone: typeof body.phone === 'string' ? body.phone.trim() || null : null, email: typeof body.email === 'string' ? body.email.trim() || null : null,
    overseasAgencies: { create: { overseasAgencyId: agency.id } },
    ...(countryIds.length ? { destinationCountries: { create: countryIds.map((countryId) => ({ countryId })) } } : {}),
  }, include: { registeredCountry: true, overseasAgencies: { include: { overseasAgency: true } }, destinationCountries: { include: { country: true } }, jobTitles: { include: { jobTitle: true } } } }));
  await audit(req, 'COMPANY_CREATED_FOR_OVERSEAS_AGENCY', { entityType: 'employer', entityId: company.id, detail: { overseasAgencyId: agency.id } });
  res.status(201).json({ data: serialize(company) });
}));

resourcesRouter.post('/employers/:id/job-titles', requireAuth, requirePermission('catalogue.manage'), wrap(async (req, res) => {
  const titleId = typeof req.body?.jobTitleId === 'string' ? req.body.jobTitleId : null;
  const title = typeof req.body?.title === 'string' ? text(req.body.title, 'Job title') : null;
  if (!titleId && !title) throw new HttpError(400, 'Choose or enter a job title.');
  const employer = await prisma.employer.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!employer) throw new HttpError(404, 'Company not found.');
  const normalizedTitle = title?.toLowerCase().replace(/\s+/g, ' ');
  const job = await prisma.$transaction(async (tx) => {
    const row = titleId
      ? await tx.jobTitle.findFirst({ where: { id: titleId, active: true } })
      : await tx.jobTitle.upsert({ where: { normalizedTitle: normalizedTitle! }, create: { title: title!, normalizedTitle: normalizedTitle! }, update: {} });
    if (!row?.active) throw new HttpError(400, 'Choose an active job title.');
    await tx.employerJobTitle.upsert({ where: { employerId_jobTitleId: { employerId: employer.id, jobTitleId: row.id } }, create: { employerId: employer.id, jobTitleId: row.id }, update: {} });
    return row;
  });
  await audit(req, 'COMPANY_JOB_TITLE_LINKED', { entityType: 'employer', entityId: employer.id, detail: { jobTitleId: job.id } });
  res.status(201).json({ data: job });
}));

resourcesRouter.post('/:name/:id/reverse', requireAuth, guard('update'), wrap(async (req, res) => {
  const config = resources[req.params.name]!;
  const reversal = reversals[req.params.name];
  if (!config.reverse || !reversal) throw new HttpError(404, 'Reversal is not supported for this resource.');
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length < 3) throw new HttpError(400, 'A reversal reason of at least 3 characters is required.');
  const row = await prisma.$transaction(async (tx) => {
    const db = delegateOf(config, tx);
    const original = await db.findUnique({ where: { id: req.params.id } });
    if (!original) throw new HttpError(404, 'Record not found.');
    if (original[reversal.link]) throw new HttpError(409, 'This record has already been reversed.');
    if (new Prisma.Decimal(original.amount.toString()).lte(0)) {
      throw new HttpError(409, 'Only positive records can be reversed.');
    }
    return db.create({ data: reversal.build(original, reason, req.auth!.user.id), ...shape(config) });
  });
  await audit(req, `${reversal.entity}_REVERSED`, { entityId: row.id, detail: { reason } });
  res.json({ data: serialize(row) });
}));

resourcesRouter.post('/applications/:id/status', requireAuth, requirePermission('application.update'), wrap(async (req, res) => {
  const status = req.body?.status;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  const nextReviewOn = typeof req.body?.nextReviewOn === 'string' && req.body.nextReviewOn ? new Date(req.body.nextReviewOn) : null;
  if (typeof status !== 'string' || !MANUAL_LIFECYCLE.has(status)) {
    throw new HttpError(409, 'Closed statuses cannot be set here. Successful closure goes through closure review; unsuccessful closure goes through settlement.');
  }
  if (!reason) throw new HttpError(400, 'A reason is required.');
  const row = await prisma.$transaction(async (tx) => {
    const application = await tx.application.findUnique({ where: { id: req.params.id } });
    if (!application) throw new HttpError(404, 'Application not found.');
    if (CLOSED_LIFECYCLE.has(application.lifecycleStatus)) throw new HttpError(409, 'A closed application cannot be changed here.');
    if (application.lifecycleStatus === status) throw new HttpError(409, 'The application already has this status.');
    if (status === 'ACTIVE') {
      const hasPassport = await tx.candidatePassport.count({ where: { candidateId: application.candidateId, isCurrent: true } });
      if (!hasPassport) throw new HttpError(409, 'Add the candidate\'s passport before activating this application.');
    }
    const data = {
      lifecycleStatus: status as any,
      holdReason: status === 'ON_HOLD' ? reason : null,
      nextReviewOn: status === 'ON_HOLD' ? nextReviewOn : null,
      closedAt: null,
    };
    const updated = await tx.application.update({ where: { id: req.params.id }, data });
    await tx.applicationStatusHistory.create({
      data: {
        applicationId: req.params.id,
        fromStatus: application.lifecycleStatus,
        toStatus: status as any,
        reason,
        changedById: req.auth!.user.id,
      },
    });
    return updated;
  });
  await audit(req, 'APPLICATION_STATUS_CHANGED', { entityId: row.id, detail: { status, reason } });
  res.json({ data: serialize(row) });
}));

resourcesRouter.post(
  '/approval-actions/:id/decision',
  requireAuth,
  anyPermission('finance.settlement.approve', 'finance.commission.approve', 'catalogue.approve'),
  wrap(async (req, res) => {
    const decision = req.body?.decision;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (decision !== 'APPROVED' && decision !== 'REJECTED') throw new HttpError(400, 'Invalid decision.');
    if (reason.length < 3) throw new HttpError(400, 'A reason is required.');
    const row = await decideApproval(req, req.params.id, decision, reason);
    res.json({ data: serialize(row) });
  }),
);

export const financeRouter = Router();

financeRouter.get('/application/:id', requireAuth, wrap(async (req, res) => {
  const application = await prisma.application.findUnique({ where: { id: req.params.id } });
  if (!application) throw new HttpError(404, 'Application not found.');
  const [payments, settlements] = await Promise.all([
    prisma.candidatePayment.findMany({ where: { applicationId: req.params.id } }),
    prisma.candidateSettlement.findMany({ where: { applicationId: req.params.id }, include: { refunds: true } }),
  ]);
  type FinanceRow = {
    currency: string;
    agreedAmount: Prisma.Decimal;
    collected: Prisma.Decimal;
    refundsPaid: Prisma.Decimal;
    retentionApproved: Prisma.Decimal;
  };
  const zero = new Prisma.Decimal(0);
  const rows = new Map<string, FinanceRow>();
  const rowFor = (currency: string) => {
    let row = rows.get(currency);
    if (!row) {
      row = { currency, agreedAmount: zero, collected: zero, refundsPaid: zero, retentionApproved: zero };
      rows.set(currency, row);
    }
    return row;
  };
  const add = (currency: string, field: 'collected' | 'refundsPaid' | 'retentionApproved', value: Prisma.Decimal) => {
    const row = rowFor(currency);
    row[field] = row[field].plus(value);
  };
  if (!application.currency || !application.agreedAmountSnapshot) return res.json({ data: [] });
  rowFor(application.currency).agreedAmount = application.agreedAmountSnapshot;
  for (const payment of payments) add(payment.currency, 'collected', payment.amount);
  for (const settlement of settlements) {
    for (const refund of settlement.refunds) add(refund.currency, 'refundsPaid', refund.amount);
    if (settlement.status === 'APPROVED') add(settlement.currency, 'retentionApproved', settlement.approvedRetentionTotal);
  }
  const data = [...rows.values()].map((row) => {
    const difference = row.agreedAmount.minus(row.collected);
    return {
      ...row,
      outstanding: difference.gt(0) ? difference : zero,
      settlementBalance: row.collected.minus(row.refundsPaid).minus(row.retentionApproved),
    };
  });
  res.json({ data: serialize(data) });
}));

export const analyticsRouter = Router();

analyticsRouter.get('/lifecycle', requireAuth, requirePermission('application.read'), wrap(async (_req, res) => {
  const groups = await prisma.application.groupBy({ by: ['lifecycleStatus'], _count: { _all: true } });
  const counts = new Map(groups.map((row) => [row.lifecycleStatus, row._count._all]));
  res.json({ data: ['ACTIVE', 'ON_HOLD', 'STOPPED_PENDING_SETTLEMENT', 'CLOSED_SUCCESSFULLY', 'CLOSED_UNSUCCESSFULLY']
    .map((status) => ({ status, count: counts.get(status as any) ?? 0 })) });
}));

analyticsRouter.get('/summary', requireAuth, wrap(async (req, res) => {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const canReadApplications = req.auth!.permissions.has('application.read');
  const canReadCandidates = req.auth!.permissions.has('candidate.read');
  const canReadApprovals = req.auth!.permissions.has('catalogue.approve') || req.auth!.permissions.has('finance.settlement.approve') || req.auth!.permissions.has('finance.commission.approve');
  const canReadFinance = req.auth!.permissions.has('report.finance') || req.auth!.permissions.has('finance.receipt.read');
  const canReadCatalogue = req.auth!.permissions.has('catalogue.read');
  const canReadSelection = req.auth!.permissions.has('application.read') && req.auth!.permissions.has('candidate.read');
  const [activeApplications, pendingApprovals, pendingRefunds, collected, activeAgencies, activeRefers, activeCompanies, activeDemands, countryRegions, requestedVacancies, selectedWorkers, pendingPhoto, pendingPcc, pendingMedical, totalApplicants, onHoldApplications, completedApplications] = await Promise.all([
    canReadApplications ? prisma.application.count({ where: { lifecycleStatus: 'ACTIVE' } }) : Promise.resolve(null),
    canReadApprovals ? prisma.approvalAction.count({ where: { decision: 'PENDING', entityType: { in: ['JOB_PRICE_VERSION', 'PARTNER_COMMISSION', 'CANDIDATE_SETTLEMENT'] } } }) : Promise.resolve(null),
    canReadFinance ? prisma.candidateRefund.count({ where: { amount: { gt: 0 } } }) : Promise.resolve(null),
    canReadFinance ? prisma.candidatePayment.groupBy({
      by: ['currency'],
      where: { amount: { gt: 0 }, receivedOn: { gte: monthStart } },
      _sum: { amount: true },
    }) : Promise.resolve([]),
    canReadCatalogue ? prisma.overseasAgency.count({ where: { active: true } }) : Promise.resolve(null),
    canReadCatalogue ? prisma.referralPartner.count({ where: { active: true } }) : Promise.resolve(null),
    canReadCatalogue ? prisma.employer.count({ where: { active: true } }) : Promise.resolve(null),
    canReadCatalogue ? prisma.jobDemand.count({ where: { active: true } }) : Promise.resolve(null),
    canReadCatalogue ? prisma.country.groupBy({ by: ['region'], where: { active: true }, _count: { _all: true } }) : Promise.resolve([]),
    canReadCatalogue ? prisma.jobPosition.aggregate({ where: { active: true, demand: { active: true } }, _sum: { vacancies: true } }) : Promise.resolve(null),
    canReadSelection ? prisma.application.count({ where: { selectedAt: { not: null }, position: { active: true, demand: { active: true } } } }) : Promise.resolve(null),
    canReadSelection ? prisma.application.count({ where: { selectedAt: { not: null }, photoStatus: 'PENDING', position: { active: true, demand: { active: true } } } }) : Promise.resolve(null),
    canReadSelection ? prisma.application.count({ where: { selectedAt: { not: null }, pccStatus: 'PENDING', position: { active: true, demand: { active: true } } } }) : Promise.resolve(null),
    canReadSelection ? prisma.application.count({ where: { selectedAt: { not: null }, medicalStatus: 'PENDING', position: { active: true, demand: { active: true } } } }) : Promise.resolve(null),
    canReadCandidates ? prisma.candidate.count() : Promise.resolve(null),
    canReadApplications ? prisma.application.count({ where: { lifecycleStatus: 'ON_HOLD' } }) : Promise.resolve(null),
    canReadApplications ? prisma.application.count({ where: { lifecycleStatus: 'CLOSED_SUCCESSFULLY' } }) : Promise.resolve(null),
  ]);
  const vacancies = requestedVacancies?._sum.vacancies ?? null;
  res.json({
    data: {
      activeApplications,
      totalApplicants,
      onHoldApplications,
      completedApplications,
      pendingApprovals,
      pendingRefunds,
      collectedThisMonth: collected.map((row) => ({
        currency: row.currency,
        amount: serialize(row._sum.amount ?? new Prisma.Decimal(0)),
      })),
      businessMetrics: canReadCatalogue ? {
        activeAgencies, activeRefers, activeCompanies, activeDemands,
        countriesByRegion: countryRegions.map((row) => ({ region: row.region, count: row._count._all })),
        requestedVacancies: vacancies,
        selectedWorkers,
        vacanciesRemaining: canReadSelection && vacancies !== null && selectedWorkers !== null ? Math.max(0, vacancies - selectedWorkers) : null,
        pendingPhoto, pendingPcc, pendingMedical,
      } : null,
    },
  });
}));

analyticsRouter.get('/search', requireAuth, wrap(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  if (q.length < 2) return res.json({ data: [] });
  const canReadCandidates = req.auth!.permissions.has('candidate.read');
  const canReadCatalogue = req.auth!.permissions.has('catalogue.read');
  const jobs: Promise<any[]>[] = [];
  if (canReadCandidates) {
    const where = candidateSearchWhere(q, false) ?? { id: '00000000-0000-0000-0000-000000000000' };
    jobs.push(prisma.candidate.findMany({ where, select: { id: true, fullName: true, candidateCode: true }, take: 5 }).then((rows) => rows.map((row) => ({ type: 'Applicant', title: row.fullName, description: row.candidateCode, to: `/candidates/${row.id}` }))));
  }
  if (canReadCatalogue) {
    jobs.push(prisma.employer.findMany({ where: { OR: [{ legalName: { contains: q, mode: 'insensitive' } }, { demands: { some: { reference: { contains: q, mode: 'insensitive' } } } }] }, select: { id: true, legalName: true }, take: 5 }).then((rows) => rows.map((row) => ({ type: 'Company', title: row.legalName, description: 'Overseas employer', to: `/companies/${row.id}` }))));
    jobs.push(prisma.overseasAgency.findMany({ where: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { country: { name: { contains: q, mode: 'insensitive' } } }] }, select: { id: true, name: true, country: { select: { name: true } } }, take: 5 }).then((rows) => rows.map((row) => ({ type: 'Overseas agency', title: row.name, description: row.country.name, to: `/agencies/${row.id}` }))));
    jobs.push(prisma.referralPartner.findMany({ where: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { contact: { contains: q, mode: 'insensitive' } }] }, select: { id: true, name: true }, take: 5 }).then((rows) => rows.map((row) => ({ type: 'Refer', title: row.name, description: 'Applicant source', to: `/refers/${row.id}` }))));
    jobs.push(prisma.jobDemand.findMany({ where: { OR: [{ reference: { contains: q, mode: 'insensitive' } }, { employer: { legalName: { contains: q, mode: 'insensitive' } } }, { overseasAgency: { name: { contains: q, mode: 'insensitive' } } }, { positions: { some: { jobTitle: { title: { contains: q, mode: 'insensitive' } } } } }] }, select: { id: true, reference: true, employer: { select: { legalName: true } } }, take: 5 }).then((rows) => rows.map((row) => ({ type: 'Demand', title: row.reference, description: row.employer.legalName, to: `/demands/${row.id}` }))));
    jobs.push(prisma.jobTitle.findMany({ where: { title: { contains: q, mode: 'insensitive' } }, select: { id: true, title: true }, take: 5 }).then((rows) => rows.map((row) => ({ type: 'Job title', title: row.title, description: 'Reusable title', to: '/companies' }))));
  }
  res.json({ data: (await Promise.all(jobs)).flat().slice(0, 20) });
}));

// Read-only business activity feed. Audit detail is deliberately excluded: it can
// contain sensitive identifiers and the CEO view only needs who/what/when.
analyticsRouter.get('/activity', requireAuth, requirePermission('audit.read'), wrap(async (_req, res) => {
  const logs = await prisma.auditLog.findMany({
    where: { entityType: { in: ['candidate', 'candidates', 'application', 'applications', 'job_demand', 'demands', 'overseas_agency', 'overseas-agencies', 'employer', 'employers'] } },
    orderBy: { at: 'desc' }, take: 20,
    select: { id: true, at: true, action: true, actorUserId: true, entityType: true, entityId: true },
  });
  const actorIds = [...new Set(logs.flatMap((row) => row.actorUserId ? [row.actorUserId] : []))];
  const actors = await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, fullName: true } });
  const actorNames = new Map(actors.map((actor) => [actor.id, actor.fullName]));
  const route = (type: string | null, id: string | null) => {
    if (!id) return null;
    if (type === 'candidate' || type === 'candidates') return `/candidates/${id}`;
    if (type === 'application' || type === 'applications') return `/applications/${id}`;
    if (type === 'job_demand' || type === 'demands') return `/demands/${id}`;
    if (type === 'overseas_agency' || type === 'overseas-agencies') return `/agencies/${id}`;
    if (type === 'employer' || type === 'employers') return `/companies/${id}`;
    return null;
  };
  res.json({ data: logs.map((row) => ({ id: row.id, at: row.at, action: row.action.replaceAll('_', ' ').toLowerCase(), actor: row.actorUserId ? actorNames.get(row.actorUserId) ?? 'Former user' : 'System', entityType: row.entityType, to: route(row.entityType, row.entityId) })) });
}));
