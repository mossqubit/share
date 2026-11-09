import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import * as model from '../payload/lib/account-performance.ts';
async function loader() {
  const module = new SourceTextModule(stripTypeScriptTypes(readFileSync(new URL('../payload/lib/account-performance-loader.ts', import.meta.url), 'utf8')));
  await module.link(async name => { assert.equal(name, './account-performance'); return new SyntheticModule(Object.keys(model), function () { for (const [key, value] of Object.entries(model)) this.setExport(key, value); }); });
  await module.evaluate(); return module.namespace.loadAccountPerformance;
}
test('runtime account identities use existing cache GETs, isolate corrupt reports and never expose raw errors', async () => {
  const load = await loader(); const calls = [];
  const accounts = [{ id: 'example-a', store: 'example.test' }, { id: 'network-error', store: 'example.test' }, { id: 'malformed', store: 'example.test' }, { id: 'example-app', store: 'AppLovin · example.test' }];
  const fetcher = async (url, options) => {
    calls.push([url, options]);
    if (url.includes('network-error')) throw Error('private internal detail');
    if (url.includes('malformed')) return new Response('invalid json');
    if (url === '/api/applovin') return new Response('', { status: 404 });
    return Response.json({ meta: { startDate: '2026-11-01', endDate: '2026-11-08', updatedAt: '2026-11-09T01:00:00Z' }, campaigns: [] });
  };
  const result = await load(accounts, { date: '2026-11-07', start: 0, end: 24, compare: 'previous' }, undefined, fetcher, new Date('2026-11-10T02:00:00Z'));
  assert.equal(result.length, 4); assert.equal(calls.length, 4); assert.ok(calls.every(([, options]) => options.method === 'GET' && options.cache === 'no-store'));
  assert.equal(result[0].status, 'ready'); assert.equal(result[0].current.spend, 0); assert.equal(result[1].status, 'error'); assert.equal(result[2].status, 'error'); assert.equal(result[3].status, 'unavailable');
  assert.equal(JSON.stringify(result).includes('private internal'), false); assert.equal(calls[3][0], '/api/applovin');
});
test('abort propagates and runtime account IDs are URL encoded', async () => {
  const load = await loader(); const controller = new AbortController(); controller.abort();
  const query = { date: 'today', start: 0, end: 24, compare: 'previous' };
  await assert.rejects(load([{ id: 'example', store: 'example.test' }], query, controller.signal, async () => { throw Error('aborted'); }));
  let requested; await load([{ id: 'example & test', store: 'example.test' }], query, undefined, async url => { requested = url; return new Response('', { status: 404 }); });
  assert.equal(requested, '/api/dashboard?account=example%20%26%20test');
});
