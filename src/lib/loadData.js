// 데이터 불러오기. Supabase(REST)에서 원자료 4개 표를 읽어 buildData로 넘기고, 실패하면 내장 스냅숏으로 대체한다.
import { buildData, REQUIRED } from './buildData.js';

export const PAGE = 1000;   // Supabase REST가 한 번에 돌려주는 최대 행 수
const ORDER = { companies: 'company_id', payments: 'payment_id', usage_logs: 'id', churn_requests: 'request_id' };

async function fetchTable(table, { url, key, fetchImpl }) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const q = new URLSearchParams({ select: REQUIRED[table].join(','), order: ORDER[table], offset: String(offset), limit: String(PAGE) });
    let res;
    try {
      res = await fetchImpl(`${url.replace(/\/+$/, '')}/rest/v1/${table}?${q}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    } catch (e) {
      throw new Error(`Supabase 서버에 연결하지 못했습니다 (${e.message || e})`);
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`표 '${table}'을(를) 읽지 못했습니다 (${res.status}): ${body.message || body.error || '응답 없음'}`);
    }
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

export async function fetchRaw({ url, key, fetchImpl = fetch }) {
  const names = Object.keys(REQUIRED);
  const tables = await Promise.all(names.map(t => fetchTable(t, { url, key, fetchImpl })));
  const raw = { source: 'Supabase' };
  names.forEach((t, i) => { raw[t] = tables[i]; });
  return raw;
}

// 반환: { data, source: 'supabase' | 'snapshot', loadedAt, error }. error는 Supabase를 쓰려다 실패한 이유(없으면 null).
export async function loadData({ url, key, fetchImpl = fetch, loadSnapshot }) {
  let error = null;
  if (url && key) {
    try {
      return { data: buildData(await fetchRaw({ url, key, fetchImpl })), source: 'supabase', loadedAt: new Date(), error: null };
    } catch (e) {
      error = e.message || String(e);
    }
  }
  return { data: buildData(await loadSnapshot()), source: 'snapshot', loadedAt: new Date(), error };
}
