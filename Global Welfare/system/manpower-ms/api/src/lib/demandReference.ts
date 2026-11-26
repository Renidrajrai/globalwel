import type { Prisma } from '@prisma/client';

export const formatDemandReference = (year: number | string, sequence: bigint | number | string) =>
  `DMD-${year}-${String(sequence).padStart(6, '0')}`;

export async function nextDemandReference(tx: Prisma.TransactionClient) {
  const [row] = await tx.$queryRaw<{ year: number; sequence: bigint }[]>`
    SELECT EXTRACT(YEAR FROM CURRENT_DATE)::int AS year, nextval('job_demand_reference_seq') AS sequence
  `;
  return formatDemandReference(row.year, row.sequence);
}
