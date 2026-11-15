import { useEffect, useRef, useState } from 'react';

// 숫자만 담긴 객체를 이전 값에서 새 값까지 450ms 동안 보간한다 (차트 전환과 같은 길이·곡선).
// snap이 true면 보간 없이 새 값을 바로 돌려준다.
export default function useTween(target, snap = false) {
  const [shown, setShown] = useState(target);
  const last = useRef(target);
  useEffect(() => {
    const from = last.current, t0 = performance.now();
    if (snap) { last.current = target; setShown(target); return undefined; }
    if (from === target) return undefined;
    let raf = requestAnimationFrame(function step(now) {
      const p = Math.min(1, Math.max(0, (now - t0) / 450)), e = 1 - (1 - p) ** 3;
      const next = p === 1 ? target : Object.fromEntries(Object.keys(target).map(k => [k, from[k] + (target[k] - from[k]) * e]));
      last.current = next;
      setShown(next);
      if (p < 1) raf = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(raf);
  }, [target, snap]);
  return snap ? target : shown;
}
