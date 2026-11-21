// src/lib/urlState.js 검증: 주소의 쿼리 ↔ 프리셋·레버 값. 실행: node tools/test_url.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as Sim from '../src/lib/sim.js';
import { buildData } from '../src/lib/buildData.js';
import { parseQuery, toQuery } from '../src/lib/urlState.js';

const D = buildData(JSON.parse(readFileSync(new URL('../src/data/raw.json', import.meta.url), 'utf8')));
const L = Sim.levers(D.refs), P = Sim.presets(D.refs);

// 1 쿼리가 없거나 모르는 프리셋이면 현재
assert.deepEqual(parseQuery('', L, P), { preset: 'current', values: P.current });
assert.deepEqual(parseQuery('?preset=nope', L, P), { preset: 'current', values: P.current });
assert.deepEqual(parseQuery('?preset=constructor', L, P), { preset: 'current', values: P.current });

// 2 프리셋은 이름만 주소에 담는다. 현재는 쿼리 없음
assert.deepEqual(parseQuery('?preset=base', L, P), { preset: 'base', values: P.base });
assert.equal(toQuery('base', P.base, L), '?preset=base');
assert.equal(toQuery('current', P.current, L), '');

// 3 직접 조정한 값은 레버마다 퍼센트로 담기고, 다시 읽으면 같은 값이 된다
const custom = { ...P.base, pause: 0.29, alert: 0.07 };
const q = toQuery(null, custom, L);
assert.ok(q.includes('pause=29') && q.includes('alert=7'));
const back = parseQuery(q, L, P);
assert.equal(back.preset, null);
assert.deepEqual(back.values, custom);
assert.deepEqual(Sim.run(D, back.values).kpi, Sim.run(D, custom).kpi);

// 4 일부 레버만 있으면 나머지는 현재 값, 범위 밖 값은 범위 안으로, 숫자가 아닌 값은 무시
const part = parseQuery('?pause=999&salary=abc&onboarding=-5', L, P);
assert.equal(part.preset, null);
assert.equal(part.values.pause, 0.6); assert.equal(part.values.onboarding, 0);
assert.equal(part.values.salary, P.current.salary); assert.equal(part.values.saveRate, P.current.saveRate);

// 5 레버 값이 있으면 preset보다 우선한다
assert.equal(parseQuery('?preset=base&pause=10', L, P).preset, null);

console.log('OK');
