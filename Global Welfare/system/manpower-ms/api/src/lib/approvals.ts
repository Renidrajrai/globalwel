import type { Request } from 'express';
import { prisma } from '../db';
import { HttpError } from './http';
import { audit } from './audit';
import { endBefore } from './catalogueRules';
import { dateKey, toDateOnly } from './dates';

type Target = {
  delegate: string;
  field: 'approvalStatus' | 'status';
  perm: string;
  selfDecisionOk?: boolean; // catalogue only: a CEO holding catalogue.approve may approve their own submission
  onApprove?: (tx: any, id: string, actor: string) => Promise<void>;
};

async function activatePriceVersion(tx: any, id: string) {
  const pv = await tx.jobPriceVersion.findUnique({ where: { id }, include: { position: true } });
  if (!pv) throw new HttpError(404, 'Price version not found.');
  if (!pv.position.active) throw new HttpError(409, 'The position is inactive.');
  const from = dateKey(pv.effectiveFrom);
  const overlapping = await tx.jobPriceVersion.findMany({
    where: {
      positionId: pv.positionId, approvalStatus: 'APPROVED', id: { not: id },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: pv.effectiveFrom } }],
    },
  });
  for (const o of overlapping) {
    if (dateKey(o.effectiveFrom) >= from)
      throw new HttpError(409, 'An approved price already starts on or after this start date. Change the dates.');
    await tx.jobPriceVersion.update({ where: { id: o.id }, data: { effectiveTo: toDateOnly(endBefore(from)) } });
  }
}

export const approvalTargets: Record<string, Target> = {
  JOB_PRICE_VERSION: { delegate: 'jobPriceVersion', field: 'approvalStatus', perm: 'catalogue.approve', selfDecisionOk: true, onApprove: (tx, id) => activatePriceVersion(tx, id) },
  PARTNER_COMMISSION:   { delegate: 'partnerCommission',   field: 'approvalStatus', perm: 'finance.commission.approve' },
  CANDIDATE_SETTLEMENT: { delegate: 'candidateSettlement', field: 'status',         perm: 'finance.settlement.approve' },
};

export async function decideApproval(req: Request, actionId: string, decision: 'APPROVED' | 'REJECTED', reason: string) {
  const actor = req.auth!.user.id;
  const row = await prisma.$transaction(async (tx) => {
    const action = await tx.approvalAction.findUnique({ where: { id: actionId } });
    if (!action) throw new HttpError(404, 'Approval action not found.');
    if (action.decision !== 'PENDING') throw new HttpError(409, 'This action has already been decided.');
    const target = approvalTargets[action.entityType];
    if (!target) throw new HttpError(400, 'Unknown approval type.');
    if (!req.auth!.permissions.has(target.perm)) throw new HttpError(403, 'Your role does not allow this decision.');
    if (action.requestedById === actor && !target.selfDecisionOk) throw new HttpError(403, 'You cannot decide your own request.');

    if (decision === 'APPROVED' && target.onApprove) await target.onApprove(tx, action.entityId, actor);

    const updated = await tx.approvalAction.update({
      where: { id: actionId },
      data: { decision, reason, decidedById: actor, decidedAt: new Date() },
    });
    const value = target.field === 'status' ? (decision === 'APPROVED' ? 'APPROVED' : 'DRAFT') : decision;
    await (tx as any)[target.delegate].update({ where: { id: action.entityId }, data: { [target.field]: value } });
    return updated;
  });
  await audit(req, 'APPROVAL_DECISION_RECORDED', { entityType: row.entityType, entityId: row.id, detail: { decision, reason } });
  return row;
}
