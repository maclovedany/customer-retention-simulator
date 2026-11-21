import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import EChart from './components/EChart.jsx';
import Rail from './components/Rail.jsx';
import Report from './components/Report.jsx';
import { dotOrderOf, dotsOption, flowOption, monthlyOption, readTheme, STATUS_LABEL, typesOption, waterfallOption } from './lib/chartOptions.js';
import { man, one, pct, won } from './lib/format.js';
import { loadData } from './lib/loadData.js';
import { levers as leversOf, presets as presetsOf, run } from './lib/sim.js';
import { parseQuery, toQuery, viewOf } from './lib/urlState.js';
import { PLAN, REPORTS, VIEWS } from './reports/content.js';
import useTween from './lib/useTween.js';

const SUPABASE = { url: import.meta.env.VITE_SUPABASE_URL || '', key: import.meta.env.VITE_SUPABASE_ANON_KEY || '' };
const loadSnapshot = () => import('./data/raw.json').then(m => m.default);

function Kpi({ title, value, sub, delta, good, money, active }) {
  return (
    <article className={'kpi' + (money ? ' money' : '')}>
      <h2>{title}</h2>
      <p className={'value' + (active ? ' active' : '')}>{value}</p>
      <p className="sub">{sub}{delta && <span className={'delta' + (good ? ' good' : '')}>{delta}</span>}</p>
    </article>
  );
}

function RateKpi({ title, now, base, digits, goodWhen }) {
  const m = 10 ** digits, shown = Math.round((now - base) * 100 * m) / m;
  const delta = shown === 0 ? '변화 없음' : (shown > 0 ? '+' : '−') + Math.abs(shown).toFixed(digits) + '%p';
  return <Kpi title={title} value={pct(now, digits)} sub={`현재 ${pct(base, digits)}`} delta={delta} good={shown * goodWhen > 0} />;
}

function Panel({ area, title, summary, children }) {
  return (
    <section className={`panel panel-${area}`}>
      <header><h2>{title}</h2><p>{summary}</p></header>
      {children}
    </section>
  );
}

// 지표 카드: 값이 바뀌면 숫자가 이전 값에서 새 값까지 올라가거나 내려간다.
function Kpis({ r, months }) {
  const kpi = useTween(r.kpi);
  return (
    <section className="kpis" aria-label="핵심 지표">
      <RateKpi title={`${months}개월 유지율`} now={kpi.retention} base={r.baseline.retention} digits={1} goodWhen={1} />
      <RateKpi title="월평균 이탈률" now={kpi.monthlyChurn} base={r.baseline.monthlyChurn} digits={2} goodWhen={-1} />
      <RateKpi title="연 결제 재계약률" now={kpi.renewalRate} base={r.baseline.renewalRate} digits={1} goodWhen={1} />
      <Kpi money title="방어한 월 매출 (MRR)" value={won(kpi.savedMrr)} active={kpi.savedMrr > 0}
        sub={`해지로 잃던 ${won(r.churnMrr.base)} 중 ${pct(r.churnMrr.base ? kpi.savedMrr / r.churnMrr.base : 0, 0)}`} />
      <Kpi money title={`${months}개월 누적 방어 매출`} value={won(kpi.savedRevenue)} active={kpi.savedRevenue > 0}
        sub={`방어 ${one(kpi.savedCount)}개사, 월 이탈 ${pct(r.baseline.monthlyChurn, 2)} 반영`} />
    </section>
  );
}

// 흐름도(sankey)는 ECharts가 갱신 때 통째로 다시 그려 전환이 없다. 값을 직접 보간해 프레임마다 다시 그린다.
function FlowChart({ flow, theme }) {
  const shown = useTween(flow);
  const build = useCallback(size => flowOption({ flow: shown }, theme, size), [shown, theme]);
  return <EChart build={build} replace label="자발 해지 요청의 상담과 방어 흐름" />;
}

function Dashboard({ data, load, loading, onReload, active }) {
  const levers = useMemo(() => leversOf(data.refs), [data]);
  const presets = useMemo(() => presetsOf(data.refs), [data]);
  const dotOrder = useMemo(() => dotOrderOf(data), [data]);
  const [start] = useState(() => parseQuery(window.location.search, levers, presets));
  const [preset, setPreset] = useState(start.preset);
  const [values, setValues] = useState(start.values);
  const [theme, setTheme] = useState(readTheme);

  // 데이터를 다시 불러오면 참고값이 바뀔 수 있다: 프리셋이면 새 값으로, 직접 조정한 값이면 범위 안으로 맞춘다
  useEffect(() => {
    setValues(v => (preset ? presets[preset]
      : Object.fromEntries(levers.map(l => [l.key, Math.min(l.max, Math.max(l.min, v[l.key]))]))));
  }, [presets]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onResize = () => setTheme(readTheme());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 지금 상태를 주소에 담아 새로고침하거나 링크로 넘겨도 같은 화면이 뜨게 한다. 슬라이더를 끄는 동안에는 멈춘 뒤 한 번만 쓴다.
  // 보고서 화면을 보는 동안에는 주소를 건드리지 않고, 돌아오면 다시 쓴다.
  useEffect(() => {
    if (!active) return undefined;
    const id = setTimeout(() => window.history.replaceState(null, '', window.location.pathname + toQuery(preset, values, levers)), 300);
    return () => clearTimeout(id);
  }, [preset, values, levers, active]);

  const onLever = useCallback((key, v) => { setPreset(null); setValues(prev => ({ ...prev, [key]: v })); }, []);
  const onPreset = useCallback(name => { setPreset(name); setValues(presets[name]); }, [presets]);

  const r = useMemo(() => run(data, values), [data, values]);
  const counts = useMemo(() => {
    const n = { kept: 0, saved: 0, churned: 0 };
    r.firms.forEach(f => { n[f.status] += 1; });
    return n;
  }, [r]);
  const best = r.byType.reduce((a, t) => (t.base - t.sim > a.base - a.sim ? t : a), { type: '', base: 0, sim: 0 });
  const months = data.meta.months.length;

  const buildDots = useCallback(size => dotsOption(r, theme, size, dotOrder), [r, theme, dotOrder]);
  const buildMonthly = useCallback(() => monthlyOption(r, theme), [r, theme]);
  const buildWaterfall = useCallback(() => waterfallOption(r, theme), [r, theme]);
  const buildTypes = useCallback(() => typesOption(r, theme), [r, theme]);

  return (
    <div className="app" hidden={!active}>
      <Rail data={data} load={load} loading={loading} levers={levers} values={values} preset={preset}
        onLever={onLever} onPreset={onPreset} onReload={onReload} />
      <main className="stage">
        <Kpis r={r} months={months} />

        <Panel area="dots" title={`${data.firms.length}개 기업, 전략을 적용하면`}
          summary={counts.saved + counts.churned === 0 ? '해지 기업 없음'
            : <>해지 {counts.saved + counts.churned}개사 중 <b>{counts.saved}개사 방어</b></>}>
          <EChart build={buildDots} label="기업별 유지·해지·방어 결과" />
          <ul className="legend">
            {['kept', 'saved', 'churned'].map(k => (
              <li key={k}><i style={{ background: theme.colors[k] }} />{STATUS_LABEL[k]} <b>{counts[k]}</b></li>
            ))}
            <li className="size-note">점이 클수록 비싼 요금제</li>
          </ul>
        </Panel>

        <Panel area="monthly" title="월별 이탈률"
          summary={<>월평균 {pct(r.baseline.monthlyChurn, 2)} → <b>{pct(r.kpi.monthlyChurn, 2)}</b></>}>
          <EChart build={buildMonthly} label="월별 이탈률, 현재와 전략 적용 후" />
        </Panel>

        <Panel area="waterfall" title="해지로 잃는 월 매출"
          summary={<>단위 만 원, {man(r.churnMrr.base)} → <b>{man(r.churnMrr.sim)}</b></>}>
          <EChart build={buildWaterfall} label="해지로 잃는 월 매출과 전략 묶음별 방어분" />
        </Panel>

        <Panel area="types" title="해지 유형별 기업 수"
          summary={best.base - best.sim > 0.05 ? <>최대 감소 <b>{best.type} −{one(best.base - best.sim)}</b></> : '전략 적용 전'}>
          <EChart build={buildTypes} label="해지 유형별 기업 수, 현재와 전략 적용 후" />
        </Panel>

        <Panel area="flow" title="해지 요청 처리 흐름"
          summary={r.flow.requests ? <>요청 {one(r.flow.requests)}건 중 <b>방어 {one(r.flow.saved)}건</b></> : '해지 요청 없음'}>
          <FlowChart flow={r.flow} theme={theme} />
        </Panel>

        <footer className="notice">가정 기반 시나리오입니다. 효과 크기는 발표자가 넣은 가정이며 예측이 아닙니다. 교육용 가상 데이터를 사용했습니다.</footer>
      </main>
    </div>
  );
}

// 화면 맨 위 메뉴: 보고서 5종과 시뮬레이터(해지 방어 전략 실행안)를 오간다.
function TopNav({ view, onGo }) {
  const nav = useRef(null);
  // 좁은 화면에서는 메뉴가 가로로 넘친다: 고른 메뉴가 보이는 자리로 오게 한다
  useEffect(() => {
    nav.current.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [view]);
  return (
    <header className="topbar">
      <strong>구독 유지 전략</strong>
      <nav aria-label="산출물" ref={nav}>
        {VIEWS.map((v, i) => (
          <button key={v.id} type="button" aria-current={view === v.id ? 'page' : undefined} onClick={() => onGo(v.id)}>
            <i>{i + 1}</i>{v.menu}
          </button>
        ))}
      </nav>
    </header>
  );
}

const VIEW_IDS = VIEWS.map(v => v.id);

export default function App() {
  const [view, setView] = useState(() => viewOf(window.location.search, VIEW_IDS, PLAN.id));
  const [planSeen, setPlanSeen] = useState(view === PLAN.id);   // 시뮬레이터는 처음 열 때 만들고, 그 뒤로는 레버 값을 간직한 채 숨겨 둔다
  const [load, setLoad] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState(null);

  const reload = useCallback(() => {
    setLoading(true);
    loadData({ ...SUPABASE, loadSnapshot })
      .then(res => { setLoad(res); setFatal(null); })
      .catch(e => setFatal(e.message || String(e)))   // 내장 데이터까지 읽지 못한 경우
      .finally(() => setLoading(false));
  }, []);
  useEffect(reload, [reload]);

  const go = useCallback(id => {
    setView(id);
    if (id === PLAN.id) setPlanSeen(true);
    else window.history.replaceState(null, '', `${window.location.pathname}?view=${id}`);
    window.scrollTo(0, 0);
  }, []);

  const report = REPORTS.find(r => r.id === view);
  return (
    <div className="shell">
      <TopNav view={view} onGo={go} />
      {report && <Report key={report.id} report={report} />}
      {planSeen && load && <Dashboard data={load.data} load={load} loading={loading} onReload={reload} active={view === PLAN.id} />}
      {view === PLAN.id && !load && (
        <div className="loading"><p>{fatal ? `데이터를 읽지 못했습니다. ${fatal}` : '데이터를 불러오는 중입니다.'}</p></div>
      )}
    </div>
  );
}
