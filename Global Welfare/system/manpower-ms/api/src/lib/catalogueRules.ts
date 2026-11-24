import { PayerType, Prisma } from '@prisma/client';
import { HttpError } from './http';
import { todayKathmandu, toDateOnly } from './dates';

export const CANDIDATE_PAYER: PayerType = PayerType.CANDIDATE;

export function availablePositionWhere(): Prisma.JobPositionWhereInput {
  const today = toDateOnly(todayKathmandu());
  return {
    active: true,
    vacancies: { gt: 0 },
    city: { active: true },
    jobTitle: { active: true },
    demand: {
      active: true,
      OR: [{ expiresOn: null }, { expiresOn: { gte: today } }],
      employer: { active: true },
      destinationCountry: { active: true, eligibility: 'APPROVED' },
    },
  };
}

export function currentPriceWhere(): Prisma.JobPriceVersionWhereInput {
  const today = toDateOnly(todayKathmandu());
  return {
    approvalStatus: 'APPROVED',
    effectiveFrom: { lte: today },
    OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
  };
}

export function priceFrom(components: { payer: PayerType; amount: Prisma.Decimal }[]) {
  const sum = (xs: typeof components) => xs.reduce((s, c) => s.plus(c.amount), new Prisma.Decimal(0));
  return { agreed: sum(components.filter((c) => c.payer === CANDIDATE_PAYER)), packageTotal: sum(components) };
}

export async function resolvePositionPrice(tx: Prisma.TransactionClient, positionId: string) {
  const pos = await tx.jobPosition.findFirst({ where: { id: positionId, ...availablePositionWhere() } });
  if (!pos) throw new HttpError(400, 'This position is not open for applications (inactive, expired, ineligible destination, or no vacancies).', { positionId: 'Not available.' });
  const pv = await tx.jobPriceVersion.findFirst({
    where: { positionId, ...currentPriceWhere() }, orderBy: { effectiveFrom: 'desc' }, include: { components: true },
  });
  if (!pv) throw new HttpError(400, 'No approved current price for this position.', { positionId: 'No approved price.' });
  if (!pv.components.length) throw new HttpError(400, 'The approved price has no components.');
  const { agreed, packageTotal } = priceFrom(pv.components);
  if (packageTotal.lt(agreed)) throw new HttpError(400, 'Price setup error: package total is lower than the agreed amount.');
  return { pos, pv, agreed, packageTotal };
}

// ponytail: exclusion uses daterange '[)', so a new version starts exactly when the old one ends.
export const endBefore = (newFrom: string) => newFrom;

export function positionBlockers(p: any, hasPrice: boolean, today: Date): string[] {
  const out: string[] = [];
  const d = p.demand, c = d?.destinationCountry;
  if (!p.active) out.push('Position is inactive');
  if (p.vacancies <= 0) out.push('No vacancies left');
  if (!p.city?.active) out.push('City is inactive');
  if (!p.jobTitle?.active) out.push('Job title is inactive');
  if (d && !d.active) out.push('Demand is inactive');
  if (d?.expiresOn && d.expiresOn < today) out.push('Demand has expired');
  if (d && !d.employer?.active) out.push('Employer is inactive');
  if (c && !c.active) out.push('Country is inactive');
  if (c && c.eligibility !== 'APPROVED') out.push('Country is not approved for recruitment');
  if (!hasPrice) out.push('No approved current price');
  return out;
}
