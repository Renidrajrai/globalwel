import type { Prisma } from '@prisma/client';

export async function nextDemandReference(tx: Prisma.TransactionClient) {
  const [row] = await tx.$queryRaw<{ reference: string }[]>`
    SELECT 'DMD-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(nextval('job_demand_reference_seq')::text, 6, '0') AS reference
  `;
  return row.reference;
}
