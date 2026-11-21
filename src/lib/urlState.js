// 주소의 쿼리 ↔ 프리셋·레버 값. 프리셋은 ?preset=base, 직접 조정한 값은 ?salary=44&pause=29… (퍼센트 정수)로 담는다.

// 반환: { preset, values }. 레버 값이 하나라도 있으면 직접 조정 상태(preset === null)이고, 빠진 레버는 현재 값이다.
export function parseQuery(search, levers, presets) {
  const q = new URLSearchParams(search);
  const given = levers.filter(l => q.get(l.key) && Number.isFinite(Number(q.get(l.key))));
  if (given.length) {
    const values = { ...presets.current };
    given.forEach(l => { values[l.key] = Math.min(l.max, Math.max(l.min, Number(q.get(l.key)) / 100)); });
    return { preset: null, values };
  }
  const name = Object.hasOwn(presets, q.get('preset') || '') ? q.get('preset') : 'current';
  return { preset: name, values: presets[name] };
}

// 보고 있는 화면. ?view=churn 같은 값이 없거나 모르는 값이면 기본 화면(fallback)
export function viewOf(search, ids, fallback) {
  const v = new URLSearchParams(search).get('view');
  return ids.includes(v) ? v : fallback;
}

export function toQuery(preset, values, levers) {
  if (preset === 'current') return '';
  if (preset) return `?preset=${preset}`;
  return '?' + levers.map(l => `${l.key}=${Math.round(values[l.key] * 100)}`).join('&');
}
