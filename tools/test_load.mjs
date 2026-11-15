// src/lib/loadData.js 검증: 가짜 Supabase(REST) 응답으로 페이지 나눠 읽기, 오류, 스냅숏 대체를 확인한다. 실행: node tools/test_load.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchRaw, loadData, PAGE } from '../src/lib/loadData.js';
import { buildData } from '../src/lib/buildData.js';

const read = name => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const RAW = read('../src/data/raw.json'), EXPECTED = read('./expected_current.json');
const URL_ = 'https://example.supabase.co', KEY = 'anon-key';

// PostgREST 흉내: /rest/v1/<표>?select=..&order=..&offset=..&limit=..
function fakeSupabase(tables, calls = []) {
  return async (url, init) => {
    const u = new URL(url), table = u.pathname.split('/').pop();
    calls.push({ table, offset: Number(u.searchParams.get('offset')), headers: init.headers, select: u.searchParams.get('select') });
    if (!tables[table]) return { ok: false, status: 404, json: async () => ({ message: `relation "public.${table}" does not exist` }) };
    const offset = Number(u.searchParams.get('offset')), limit = Number(u.searchParams.get('limit'));
    return { ok: true, status: 200, json: async () => tables[table].slice(offset, offset + limit) };
  };
}
const tables = { companies: RAW.companies, payments: RAW.payments, usage_logs: RAW.usage_logs, churn_requests: RAW.churn_requests };

// 1 모든 행을 페이지로 나눠 읽고, 결과가 기준값과 같다
let calls = [];
let raw = await fetchRaw({ url: URL_, key: KEY, fetchImpl: fakeSupabase(tables, calls) });
assert.equal(raw.usage_logs.length, 6974); assert.equal(raw.payments.length, 3698);
assert.equal(calls.filter(c => c.table === 'usage_logs').length, Math.floor(6974 / PAGE) + 1);
assert.ok(calls.every(c => c.headers.apikey === KEY && c.headers.Authorization === `Bearer ${KEY}`));
assert.ok(calls.every(c => !c.select.includes('company_name')));   // 기업명은 가져오지 않는다
const built = buildData(raw);
assert.equal(built.firms.filter(f => f.churned).length, 137);
assert.deepEqual(built.refs, buildData(structuredClone(RAW)).refs);
assert.deepEqual(built.monthly, EXPECTED.monthly);

// 2 행 수가 정확히 페이지 크기의 배수여도 끝난다
raw = await fetchRaw({ url: URL_, key: KEY, fetchImpl: fakeSupabase({ ...tables, payments: RAW.payments.slice(0, PAGE * 2) }) });
assert.equal(raw.payments.length, PAGE * 2);

// 3 표가 없으면 표 이름과 서버 메시지를 담아 실패한다
await assert.rejects(fetchRaw({ url: URL_, key: KEY, fetchImpl: fakeSupabase({ ...tables, payments: undefined }) }),
  e => e.message.includes('payments') && e.message.includes('does not exist'));

// 4 loadData: 설정이 있으면 Supabase, 결과에 출처와 시각이 붙는다
const snapshot = async () => structuredClone(RAW);
let res = await loadData({ url: URL_, key: KEY, fetchImpl: fakeSupabase(tables), loadSnapshot: snapshot });
assert.equal(res.source, 'supabase'); assert.equal(res.error, null); assert.ok(res.loadedAt instanceof Date);
assert.equal(res.data.firms.length, 400);

// 5 설정이 없으면 스냅숏 (오류 아님)
res = await loadData({ url: '', key: '', fetchImpl: fakeSupabase(tables), loadSnapshot: snapshot });
assert.equal(res.source, 'snapshot'); assert.equal(res.error, null); assert.equal(res.data.firms.length, 400);

// 6 Supabase가 실패하면 스냅숏으로 대체하고 이유를 남긴다 (네트워크 오류, 401)
res = await loadData({ url: URL_, key: KEY, fetchImpl: async () => { throw new TypeError('Failed to fetch'); }, loadSnapshot: snapshot });
assert.equal(res.source, 'snapshot'); assert.ok(res.error.includes('Failed to fetch')); assert.equal(res.data.firms.length, 400);
res = await loadData({ url: URL_, key: 'wrong', loadSnapshot: snapshot,
  fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ message: 'Invalid API key' }) }) });
assert.equal(res.source, 'snapshot'); assert.ok(res.error.includes('Invalid API key'));

// 7 Supabase 데이터가 규칙에 안 맞으면(열 없음 등) 스냅숏으로 대체하고 이유를 남긴다
const broken = { ...tables, churn_requests: RAW.churn_requests.map(({ outcome, ...rest }) => rest) };
res = await loadData({ url: URL_, key: KEY, fetchImpl: fakeSupabase(broken), loadSnapshot: snapshot });
assert.equal(res.source, 'snapshot'); assert.ok(res.error.includes('outcome'));

// 8 표가 비어 있으면(아직 적재 전) 스냅숏으로 대체한다
res = await loadData({ url: URL_, key: KEY, loadSnapshot: snapshot,
  fetchImpl: fakeSupabase({ companies: [], payments: [], usage_logs: [], churn_requests: [] }) });
assert.equal(res.source, 'snapshot'); assert.ok(res.error.includes('usage_logs'));

console.log('OK');
