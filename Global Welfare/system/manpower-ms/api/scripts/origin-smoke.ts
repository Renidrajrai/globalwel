import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { checkOrigin } from '../src/auth/middleware';

type Result = { passed: boolean; status?: number; body?: unknown; headers: Record<string, string> };
function request(origin: string | undefined, method: string): Result {
  const result: Result = { passed: false, headers: {} };
  const req = { method, get: (name: string) => name.toLowerCase() === 'origin' ? origin : undefined } as Request;
  const res = {
    setHeader: (name: string, value: string) => { result.headers[name] = value; },
    status: (status: number) => { result.status = status; return res; },
    json: (body: unknown) => { result.body = body; return res; },
    sendStatus: (status: number) => { result.status = status; return res; },
  } as unknown as Response;
  checkOrigin(req, res, () => { result.passed = true; });
  return result;
}

const trusted = request('http://localhost:5173', 'POST');
assert.equal(trusted.passed, true, 'configured development origin should pass');
const preflight = request('http://localhost:5173', 'OPTIONS');
assert.equal(preflight.status, 204, 'trusted preflight should return 204');
assert.equal(preflight.headers['Access-Control-Allow-Credentials'], 'true');
assert.match(preflight.headers['Access-Control-Allow-Headers'], /X-CSRF-Token/);
const rejected = request('https://untrusted.invalid', 'OPTIONS');
assert.equal(rejected.status, 403, 'untrusted origin should be denied');
assert.equal((rejected.body as { error: string }).error, 'Request origin is not allowed.');
assert.equal(request(undefined, 'POST').passed, true, 'server-to-server requests without Origin remain supported');
console.log('Origin smoke checks passed: trusted, preflight, rejected, and originless requests.');
