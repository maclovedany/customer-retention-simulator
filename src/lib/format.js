// 화면 표시 형식
export const pct = (x, digits = 1) => {
  const m = 10 ** digits;
  return (Math.round(x * 100 * m) / m).toFixed(digits) + '%';   // toFixed만 쓰면 65.75가 65.7로 내려갈 수 있다
};
export const man = x => Math.round(x / 1e4).toLocaleString('ko-KR');          // 원 → 만 원 단위 숫자
export const won = x => {                                                      // 원 → '1,234만 원' 또는 '1.2억 원'
  const m = Math.round(x / 1e4);
  return m >= 1e4 ? (Math.round(m / 1e3) / 10).toLocaleString('ko-KR', { minimumFractionDigits: 1 }) + '억 원' : m.toLocaleString('ko-KR') + '만 원';
};
export const one = x => { const r = Math.round(x * 10) / 10; return r % 1 === 0 ? r.toFixed(0) : r.toFixed(1); };
export const clock = d => d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
