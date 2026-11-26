import assert from 'node:assert/strict';
import { alpha2ToAlpha3, alpha3ToAlpha2 } from '../src/lib/countryCodes';
import { approvalTargets } from '../src/lib/approvals';
import { ROLES } from '../src/rbac/catalog';
import { formatDemandReference } from '../src/lib/demandReference';

for (const [alpha3, alpha2] of [['NPL', 'NP'], ['ROU', 'RO'], ['IND', 'IN'], ['ARE', 'AE'], ['JPN', 'JP']]) {
  assert.equal(alpha3ToAlpha2.get(alpha3), alpha2);
  assert.equal(alpha2ToAlpha3.get(alpha2), alpha3);
}
assert.equal(alpha3ToAlpha2.size, 249);
assert.equal(alpha3ToAlpha2.has('XXX'), false);
assert.equal(formatDemandReference(2026, 42n), 'DMD-2026-000042');
assert.equal(formatDemandReference(2026, 1_000_000n), 'DMD-2026-1000000');
assert.deepEqual(Object.keys(approvalTargets).filter((key) => key.startsWith('JOB_')), ['JOB_PRICE_VERSION']);

const ceoAdmin = ROLES.find((role) => role.code === 'CEO_ADMIN')!;
assert.ok(ceoAdmin.permissions.includes('catalogue.manage'));
assert.ok(!ceoAdmin.permissions.includes('catalogue.eligibility.manage'));
assert.ok(!ceoAdmin.permissions.includes('catalogue.approve'));
console.log('Catalogue smoke checks passed: alpha-3 mapping, price-only catalogue approvals, and separate role permissions.');
