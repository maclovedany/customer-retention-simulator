import { targetCount } from '../lib/sim.js';
import { clock, pct } from '../lib/format.js';
import useTween from '../lib/useTween.js';

const GROUPS = [
  { id: 'A', title: 'A 채용 외 HR 서비스', report: '보고서 개선 방안 1·2' },
  { id: 'B', title: 'B 결제·구독 시스템', report: '보고서 개선 방안 3' },
  { id: 'C', title: 'C 징후 감지·맞춤 대응', report: '보고서 개선 방안 4' },
  { id: 'X', title: '공통 가정', report: '' },
];
const PRESETS = [['current', '현재'], ['conservative', '보수적'], ['base', '기본'], ['aggressive', '적극적']];

// 레버 아래 한 줄: 대상 기업 수, 참고값(또는 가정), 대상 설명. 전체 설명은 title로 보여 준다.
function LeverMeta({ lever, data }) {
  const parts = [], full = [];
  const n = targetCount(data, lever.key);
  if (n !== null) {
    parts.push(<span key="n">대상 <b>{n}개사</b></span>);
    full.push(`대상: ${lever.targetLabel} ${n}개사`);
  }
  if (lever.ref) {
    const ref = data.refs[lever.ref];
    if (ref === null || ref === undefined) { parts.push(<span key="r">근거 없음 (가정)</span>); full.push('근거 없음 (가정)'); }
    else { parts.push(<span key="r">{lever.refLabel} <b>{pct(ref, 0)}</b></span>); full.push(`${lever.note} ${pct(ref, 0)}`); }
  } else {
    parts.push(<span key="r">{lever.note ? `가정, ${lever.note}` : '가정'}</span>);
    full.push('데이터 근거 없음 (가정)' + (lever.note ? `, ${lever.note}` : ''));
  }
  if (lever.targetLabel) parts.push(<span key="t">{lever.targetLabel}</span>);
  return (
    <p className="lever-meta" title={full.join(' / ')}>
      {parts.map((p, i) => <span key={i}>{i > 0 ? ' · ' : ''}{p}</span>)}
    </p>
  );
}

function Lever({ lever, value, data, onChange }) {
  const min = Math.round(lever.min * 100), max = Math.round(lever.max * 100), v = Math.round(value * 100);
  const fill = max > min ? ((v - min) / (max - min)) * 100 : 0;
  const id = `lever-${lever.key}`;
  return (
    <div className="lever">
      <div className="lever-top">
        <label htmlFor={id}>{lever.label}</label>
        <output htmlFor={id}>{v}%</output>
      </div>
      <input id={id} type="range" min={min} max={max} step={1} value={v} style={{ '--fill': `${fill}%` }}
        aria-label={`${lever.label} ${lever.unit}`} onChange={e => onChange(lever.key, Number(e.target.value) / 100)} />
      <LeverMeta lever={lever} data={data} />
    </div>
  );
}

function DataStatus({ load, loading, onReload }) {
  const fromDb = load.source === 'supabase';
  return (
    <>
      <div className="data-status" data-source={load.source} data-error={String(Boolean(load.error))}>
        <i className="dot" />
        <span>{fromDb ? `Supabase 데이터, ${clock(load.loadedAt)} 불러옴` : '내장 데이터 사용 중'}</span>
        <button type="button" onClick={onReload} disabled={loading}>{loading ? '불러오는 중' : '다시 불러오기'}</button>
      </div>
      {load.error && <p className="data-error" title={load.error}>Supabase에서 읽지 못해 내장 데이터를 씁니다. {load.error}</p>}
    </>
  );
}

export default function Rail({ data, load, loading, levers, values, preset, onLever, onPreset, onReload }) {
  const months = data.meta.months;
  // 프리셋을 누르면 손잡이가 새 값까지 미끄러진다. 직접 끌 때(preset === null)는 손을 바로 따라간다.
  const shown = useTween(values, preset === null);
  return (
    <aside className="rail" aria-label="전략 조작부">
      <div className="rail-head">
        <h1>해지 방어 전략<br />시뮬레이터</h1>
        <p>{data.firms.length}개 기업, {months[0].replace('-', '.')}~{months[months.length - 1].replace('-', '.')} 구독 데이터</p>
        <DataStatus load={load} loading={loading} onReload={onReload} />
      </div>
      <div className="presets" role="group" aria-label="시나리오 프리셋">
        {PRESETS.map(([key, label]) => (
          <button key={key} type="button" aria-pressed={preset === key} onClick={() => onPreset(key)}>{label}</button>
        ))}
      </div>
      <div className="levers">
        {GROUPS.map(g => {
          const items = levers.filter(l => (l.group || 'X') === g.id);
          if (!items.length) return null;
          return (
            <div className="group" data-group={g.id} key={g.id}>
              <h3>{g.title}{g.report && <span>{g.report}</span>}</h3>
              {items.map(l => <Lever key={l.key} lever={l} value={shown[l.key]} data={data} onChange={onLever} />)}
            </div>
          );
        })}
      </div>
      <button type="button" className="reset" onClick={() => onPreset('current')}>현재 상태로 되돌리기</button>
    </aside>
  );
}
