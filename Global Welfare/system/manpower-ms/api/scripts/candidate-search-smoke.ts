import assert from 'node:assert/strict';
import { candidateSearchWhere } from '../src/lib/candidateSearch';

const permitted = candidateSearchWhere('AB123456', true, ['NP', 'IN', 'PH']);
assert.ok(permitted);
const terms = (permitted as { OR: Array<Record<string, unknown>> }).OR;
assert.ok(terms.some((term) => term.candidateCode !== undefined), 'candidate code search is included');
const passport = terms.find((term) => term.passports !== undefined) as { passports: { some: { passportLookupHmac: { in: string[] } } } } | undefined;
assert.deepEqual(passport?.passports.some.passportLookupHmac.in.length, 3, 'passport lookup checks each configured issuing country hash');

const withoutPermission = candidateSearchWhere('AB123456', false, ['NP', 'IN']);
assert.ok(withoutPermission);
assert.ok(!(withoutPermission as { OR: Array<Record<string, unknown>> }).OR.some((term) => term.passports !== undefined), 'passport lookup remains permission-gated');

const name = candidateSearchWhere('Mina Gurung', false);
assert.ok(name);
assert.ok(JSON.stringify(name).includes('mina') && JSON.stringify(name).includes('gurung'), 'multiword name searches include every normalized word');
console.log('Candidate search smoke checks passed: names, codes, multi-country passport hashes, and permission gating.');
