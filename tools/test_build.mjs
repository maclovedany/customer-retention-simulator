// src/lib/buildData.js 검증: 파이썬 기준 구현(build_data.py)의 결과와 같아야 한다. 실행: node tools/test_build.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildData } from '../src/lib/buildData.js';

const read = name => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const RAW = read('../src/data/raw.json'), EXPECTED = read('./expected_current.json');
const fresh = () => structuredClone(RAW);
const churned = d => d.firms.filter(f => f.churned);

// 숫자는 오차 1e-9 안에서, 나머지는 정확히 같아야 한다
function same(a, b, path) {
  if (typeof a === 'number' && typeof b === 'number') return assert.ok(Math.abs(a - b) < 1e-9, `${path}: ${a} != ${b}`);
  if (a && b && typeof a === 'object') {
    assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), `${path}의 키가 다르다`);
    for (const k of Object.keys(a)) same(a[k], b[k], `${path}.${k}`);
    return;
  }
  assert.equal(a, b, path);
}

// 1 현재 원자료: 파이썬 결과와 완전히 같다
const d = buildData(fresh());
same(d, EXPECTED, 'data');
assert.equal(churned(d).length, 137);
assert.ok(d.firms.every(f => !('company_name' in f)));

// 2 해지 확정 1건을 방어 성공으로 바꾸면 해지 기업이 1 준다
let raw = fresh();
const counts = {};
raw.churn_requests.forEach(r => { counts[r.company_id] = (counts[r.company_id] || 0) + 1; });
raw.churn_requests.find(r => counts[r.company_id] === 1 && r.outcome === '해지 확정').outcome = '방어 성공(유지)';
assert.equal(churned(buildData(raw)).length, 136);

// 3 분류표에 없는 서술은 선택 사유로 분류하고 건수를 센다
raw = fresh();
const target = raw.churn_requests.find(r => r.churn_kind === '자발' && r.outcome === '해지 확정' && r.reason_selected === '비용 부담');
target.reason_text = '새로운 문장입니다';
let out = buildData(raw);
assert.equal(out.firms.find(f => f.id === target.company_id).type, '비용 절감형');
assert.equal(out.meta.unknownDescriptions, 1);

// 4 열이 없으면 표와 열 이름을 알려 주고 멈춘다
raw = fresh();
raw.churn_requests.forEach(r => { delete r.outcome; });
assert.throws(() => buildData(raw), e => e.message.includes('churn_requests') && e.message.includes('outcome'));
raw = fresh(); delete raw.payments;
assert.throws(() => buildData(raw), e => e.message.includes('payments'));

// 5 상담이 한 건도 없으면 방어율 참고값은 없다
raw = fresh();
raw.churn_requests.forEach(r => { r.consulted = 'N'; });
out = buildData(raw);
assert.equal(out.refs.saveRate, null); assert.equal(out.refs.consultRate, 0);

// 6 알 수 없는 요금제는 이름을 알려 주고 멈춘다
raw = fresh();
raw.companies[0].plan = '엔터프라이즈'; raw.payments = raw.payments.filter(p => p.company_id !== raw.companies[0].company_id);
assert.throws(() => buildData(raw), e => e.message.includes('엔터프라이즈'));

// 7 해지 요청일이 비어 있거나 관측 기간 밖이면 기업을 알려 주고 멈춘다
raw = fresh();
raw.churn_requests.find(r => r.outcome === '해지 확정').request_date = null;
assert.throws(() => buildData(raw), e => /해지요청일|request_date/.test(e.message));
raw = fresh();
raw.churn_requests.find(r => r.outcome === '해지 확정').request_date = '2030-01-15';
assert.throws(() => buildData(raw), e => e.message.includes('관측 기간'));

// 8 표가 비어 있어도 설명 있는 오류로 멈추거나 빈 결과를 낸다 (예외 메시지 없는 실패는 안 된다)
raw = fresh(); raw.usage_logs = [];
assert.throws(() => buildData(raw), e => e.message.includes('usage_logs'));
raw = fresh(); raw.churn_requests = [];
out = buildData(raw);
assert.equal(churned(out).length, 0); assert.equal(out.refs.consultRate, null);

// 9 Supabase가 주는 형식(날짜에 시각이 붙은 문자열, 숫자 문자열)도 같은 결과를 낸다
raw = fresh();
raw.companies.forEach(c => { c.signup_date += 'T00:00:00+00:00'; });
raw.payments.forEach(p => { p.consecutive_failures = String(p.consecutive_failures); });
same(buildData(raw), EXPECTED, 'data(형식 변형)');

console.log('OK');
