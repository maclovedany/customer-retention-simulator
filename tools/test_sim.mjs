// sim.js 검증. 실행: node tools/test_sim.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as Sim from '../src/lib/sim.js';
import { buildData } from '../src/lib/buildData.js';

const D = buildData(JSON.parse(readFileSync(new URL('../src/data/raw.json', import.meta.url), 'utf8')));
const P = Sim.presets(D.refs);
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const allFinite = (v, path = 'result') => {
  if (typeof v === 'number') assert.ok(Number.isFinite(v), `${path} = ${v}`);
  else if (v && typeof v === 'object') for (const k of Object.keys(v)) allFinite(v[k], `${path}.${k}`);
};
const typeSim = (r, t) => r.byType.find(x => x.type === t);
const mrrOf = (...types) => D.firms.filter(f => f.churned && types.includes(f.type)).reduce((s, f) => s + f.mrr, 0);

// 1 현재 = 기준값
let r = Sim.run(D, P.current);
assert.deepEqual(r.kpi, r.baseline);
assert.equal(r.kpi.churnedCount, 137);
near(r.kpi.retention, 263 / 400, 1e-12);
assert.equal(+(r.kpi.monthlyChurn * 100).toFixed(2), 1.97);
assert.equal(+(r.kpi.renewalRate * 100).toFixed(1), 87.0);
assert.equal(Math.round(r.churnMrr.base / 1e4), 9731);
assert.equal(r.churnMrr.sim, r.churnMrr.base);
assert.equal(r.kpi.savedMrr, 0);
assert.equal(r.firms.length, 400);
assert.equal(r.firms.filter(f => f.status === 'saved').length, 0);
assert.equal(r.firms.filter(f => f.status === 'churned').length, 137);
assert.deepEqual([r.flow.requests, r.flow.consulted, r.flow.saved].map(Math.round), [137, 83, 31]);
near(r.flow.consulted, 83, 1e-9); near(r.flow.saved, 31, 1e-9);   // 현재 프리셋의 흐름은 실제 건수와 정확히 같다
assert.deepEqual(r.byType.map(t => [t.type, t.base]), [['결제 실패형', 31], ['채용 종료형', 40], ['지원 불만형', 24],
  ['결제·계약 불편형', 10], ['비용 절감형', 29], ['기타', 3]]);
assert.equal(r.monthly.length, 24);
near(r.monthly[1].baseRate, 4 / 258, 1e-12);

// 2 단조성: 레버를 min→max로 올리면 해지 기업 수가 늘지 않는다
const levers = Sim.levers(D.refs);
for (const lv of levers.filter(l => l.key !== 'rechurn')) {
  const lo = Sim.run(D, { ...P.base, [lv.key]: lv.min }), hi = Sim.run(D, { ...P.base, [lv.key]: lv.max });
  assert.ok(hi.kpi.churnedCount <= lo.kpi.churnedCount + 1e-9, `단조성 위반: ${lv.key}`);
}

// 3 상한: 모든 레버 최대, 재해지율 0
const maxed = Object.fromEntries(levers.map(l => [l.key, l.key === 'rechurn' ? 0 : l.max]));
r = Sim.run(D, maxed);
allFinite(r);
assert.ok(r.kpi.churnedCount >= 0 && r.kpi.savedCount <= 137 + 1e-9);
assert.ok(r.kpi.retention <= 1 && r.kpi.renewalRate <= 1 && r.kpi.monthlyChurn >= 0);
assert.ok(r.churnMrr.sim >= -1e-6);
assert.ok(r.firms.filter(f => f.status === 'saved').length <= 137);
assert.ok(r.monthly.every(m => m.simRate >= -1e-12 && m.simRate <= m.baseRate + 1e-12 && m.simActive >= m.baseActive - 1e-9));

// 4 기여 합 = 전체 방어분 (기업 수, 매출)
r = Sim.run(D, P.aggressive);
near(r.byGroup.A.firms + r.byGroup.B.firms + r.byGroup.C.firms, r.baseline.churnedCount - r.kpi.churnedCount);
near(r.byGroup.A.mrr + r.byGroup.B.mrr + r.byGroup.C.mrr, r.kpi.savedMrr, 1e-3);
near(r.churnMrr.base - r.churnMrr.sim, r.kpi.savedMrr, 1e-3);
assert.equal(r.firms.filter(f => f.status === 'saved').length, Math.round(r.kpi.savedCount));

// 5 단일 레버: 결제 실패 회수만 50%
r = Sim.run(D, { ...P.current, payRecovery: 0.5 });
near(typeSim(r, '결제 실패형').sim, 31 * (1 - 0.5 * (1 - P.current.rechurn)));
for (const t of ['채용 종료형', '지원 불만형', '결제·계약 불편형', '비용 절감형', '기타']) near(typeSim(r, t).sim, typeSim(r, t).base);
near(r.byGroup.A.firms, 0); near(r.byGroup.C.firms, 0);

// 6 일시정지는 매출에 50%만 반영
r = Sim.run(D, { ...P.current, pause: 0.4, rechurn: 0 });
near(r.kpi.savedMrr, 0.5 * 0.4 * mrrOf('채용 종료형', '결제·계약 불편형'), 1e-3);
near(r.baseline.churnedCount - r.kpi.churnedCount, 0.4 * 50);

// 6-1 전건 상담: 진행률 100%, 재해지율 0 → 미상담 54개사 × 방어율
r = Sim.run(D, { ...P.current, consultRate: 1, saveRate: 0.5, rechurn: 0 });
near(r.baseline.churnedCount - r.kpi.churnedCount, 54 * 0.5);
assert.deepEqual([r.flow.consulted, r.flow.notConsulted].map(Math.round), [137, 0]);

// 6-1b 흐름도는 지표와 같은 모델을 따른다: 방어율은 새로 상담하는 건에만 적용된다
r = Sim.run(D, { ...P.current, saveRate: 0.6 });
near(r.flow.saved, 31, 1e-9); near(r.kpi.churnedCount, 137);
r = Sim.run(D, { ...P.current, consultRate: 1, saveRate: 0.5, rechurn: 0 });
near(r.flow.saved, 31 + 54 * 0.5); near(r.flow.churnedAfterConsult, 137 - 58);
r = Sim.run(D, { ...P.current, consultRate: 1, saveRate: 0.5, rechurn: 0.2 });
near(r.flow.saved, 31 + 54 * 0.5 * 0.8);

// 6-2 누적 방어 매출: 마지막 달 해지 기업은 남은 개월 수가 0
const lastMonth = D.meta.months.at(-1);
const onlyLast = structuredClone(D);
onlyLast.firms.forEach(f => { if (f.churned && f.churnMonth !== lastMonth) { f.churned = false; f.type = null; } });
r = Sim.run(onlyLast, maxed);
assert.ok(r.kpi.savedMrr > 0); assert.equal(r.kpi.savedRevenue, 0);

// 6-3 누적 방어 매출: 방어된 기업도 남은 기간에 기준 월평균 이탈률만큼 줄어든다고 본다
r = Sim.run(D, { ...P.current, payRecovery: 0.5, rechurn: 0 });
const keep = 1 - r.baseline.monthlyChurn, lastIdx = D.meta.months.length - 1;
let withDecay = 0, noDecay = 0;
D.firms.filter(f => f.churned && f.type === '결제 실패형').forEach(f => {
  const left = lastIdx - D.meta.months.indexOf(f.churnMonth);
  for (let j = 1; j <= left; j += 1) withDecay += 0.5 * f.mrr * keep ** j;
  noDecay += 0.5 * f.mrr * left;
});
near(r.kpi.savedRevenue, withDecay, 1e-3);
assert.ok(r.kpi.savedRevenue < noDecay);

// 7 프리셋 값 (현재 파일 기준)
assert.equal(P.base.payRecovery, 0.46); assert.equal(P.base.salary, 0.44); assert.equal(P.base.consultRate, 1);
assert.equal(P.conservative.consultRate, 0.80); assert.equal(P.conservative.salary, 0.22);
assert.equal(P.aggressive.payRecovery, 0.68); assert.equal(P.aggressive.saveRate, 0.45); assert.equal(P.aggressive.salary, 0.60);
assert.equal(P.current.consultRate, 0.61); assert.equal(P.current.saveRate, 0.37); assert.equal(P.current.rechurn, 0.23);
assert.deepEqual([P.conservative.pause, P.base.pause, P.aggressive.pause], [0.1, 0.2, 0.3]);
for (const p of Object.values(P)) for (const lv of levers) assert.ok(p[lv.key] >= lv.min - 1e-12 && p[lv.key] <= lv.max + 1e-12, `${lv.key} 범위 밖`);

// 8 참고값이 전부 없는 데이터
const noRefs = structuredClone(D);
for (const k of Object.keys(noRefs.refs)) noRefs.refs[k] = null;
const P0 = Sim.presets(noRefs.refs);
assert.equal(P0.base.salary, 0.2); assert.equal(P0.base.payRecovery, 0.2); assert.equal(P0.current.saveRate, 0.2);
for (const p of Object.values(P0)) allFinite(Sim.run(noRefs, p));
near(Sim.run(noRefs, { ...P0.current, annual: 0.5 }).kpi.churnedCount, 137);   // 전환 계수가 없으면 효과 0

// 9 해지 기업이 없는 데이터
const noChurn = structuredClone(D);
noChurn.firms.forEach(f => { f.churned = false; f.type = null; f.churnMonth = null; });
noChurn.monthly.forEach(m => { m.churned = 0; });
r = Sim.run(noChurn, P.aggressive);
allFinite(r);
assert.equal(r.kpi.churnedCount, 0); assert.equal(r.kpi.retention, 1);
assert.equal(r.byType.length, 6); assert.ok(r.byType.every(t => t.base === 0 && t.sim === 0));

// 10 기업이 하나도 없는 데이터
const empty = structuredClone(D); empty.firms = []; empty.monthly = []; empty.renewalsDue = 0;
allFinite(Sim.run(empty, P.base));

console.log('OK');
