// 차트 옵션 (ECharts). 결과(r)와 테마(t)를 받아 옵션 객체를 만드는 순수 함수들.
import { man, one, pct } from './format.js';

var PLAN_SIZE = { '베이직': 0.44, '스탠다드': 0.62, '프리미엄': 0.84 };
export var STATUS_LABEL = { kept: '유지', saved: '방어됨', churned: '해지' };
var GROUP_LABEL = { A: 'A 채용 외 HR', B: 'B 결제·구독', C: 'C 징후·대응' };

// CSS 변수에서 색과 글꼴을 읽는다. 글자 크기는 화면 높이에 맞춘다.
export function readTheme() {
  var style = getComputedStyle(document.documentElement), colors = {};
  ['ink', 'ink-soft', 'line', 'kept', 'churned', 'saved', 'base-line', 'group-a', 'group-b', 'group-c', 'panel'].forEach(function (k) {
    colors[k] = style.getPropertyValue('--' + k).trim();
  });
  return { colors: colors, font: style.getPropertyValue('--font').trim(), fs: Math.max(10.5, Math.min(15, window.innerHeight / 68)) };
}
var textStyle = function (t) { return { fontFamily: t.font, fontSize: t.fs, color: t.colors['ink-soft'] }; };
var tooltip = function (t, extra) {
  return Object.assign({ backgroundColor: t.colors.ink, borderWidth: 0, textStyle: { color: '#fff', fontSize: t.fs, fontFamily: t.font }, confine: true }, extra);
};

// 점 위치는 고정: 유지 기업을 요금제순으로, 이어서 해지 기업을 유형·해지 월순으로
export function dotOrderOf(data) {
  var typeRank = {}, planRank = { '프리미엄': 0, '스탠다드': 1, '베이직': 2 };
  (data.meta.types || []).forEach(function (t, i) { typeRank[t] = i; });
  return data.firms.slice().sort(function (a, b) {
    if (a.churned !== b.churned) return a.churned ? 1 : -1;
    if (!a.churned) return (planRank[a.plan] - planRank[b.plan]) || (a.id < b.id ? -1 : 1);
    return (typeRank[a.type] - typeRank[b.type]) || (a.churnMonth < b.churnMonth ? -1 : a.churnMonth > b.churnMonth ? 1 : 0) || (a.id < b.id ? -1 : 1);
  }).map(function (f) { return f.id; });
}

// ---------- 1. 400개사 점 격자
function dotLayout(n, size) {
  var w = size.width || 1, h = size.height || 1;
  var cols = Math.max(1, Math.ceil(Math.sqrt(n * w / h))), rows = Math.max(1, Math.ceil(n / cols));
  cols = Math.max(1, Math.ceil(n / rows));
  return { cols: cols, rows: rows, cell: Math.min(w / cols, h / rows) };
}

export function dotsOption(r, t, size, dotOrder) {
  var byId = {};
  r.firms.forEach(function (f) { byId[f.id] = f; });
  var lay = dotLayout(dotOrder.length || 1, size);
  var points = dotOrder.map(function (id, i) {
    var f = byId[id];
    return {
      id: id, name: id, value: [Math.floor(i / lay.rows), lay.rows - 1 - (i % lay.rows)],
      symbolSize: Math.max(3, lay.cell * (PLAN_SIZE[f.plan] || 0.5)),
      itemStyle: { color: t.colors[f.status] }, firm: f
    };
  });
  return {
    animationDurationUpdate: 450, animationEasingUpdate: 'cubicOut',
    grid: { left: 4, right: 4, top: 4, bottom: 4 },
    xAxis: { type: 'value', show: false, min: -0.5, max: lay.cols - 0.5 },
    yAxis: { type: 'value', show: false, min: -0.5, max: lay.rows - 0.5 },
    tooltip: tooltip(t, {
      trigger: 'item',
      formatter: function (p) {
        var f = p.data.firm;
        return '<b>' + f.id + '</b> ' + STATUS_LABEL[f.status] + '<br>' + f.plan + ', ' + f.cycle + ' 결제, ' + f.method +
          '<br>월 구독료 ' + man(f.mrr) + '만 원' +
          (f.type ? '<br>' + f.type + ' (' + f.churnMonth + ' 해지)<br>방어 확률 ' + pct(f.s, 0) : '');
      }
    }),
    series: [{ type: 'scatter', data: points, universalTransition: true, emphasis: { scale: 1.5 } }]
  };
}

// ---------- 2. 월별 이탈률
export function monthlyOption(r, t) {
  var label = function (m) { return m.slice(2).replace('-', '.'); };
  return {
    animationDurationUpdate: 450, animationEasingUpdate: 'cubicOut', textStyle: textStyle(t),
    grid: { left: 8, right: 16, top: t.fs * 2.4, bottom: 4, containLabel: true },
    legend: { top: 0, right: 0, itemWidth: 18, itemHeight: 3, textStyle: { color: t.colors['ink-soft'], fontSize: t.fs }, data: ['현재', '전략 적용 후'] },
    tooltip: tooltip(t, {
      trigger: 'axis',
      formatter: function (ps) {
        var m = r.monthly[ps[0].dataIndex];
        return '<b>' + m.month + '</b><br>현재 ' + pct(m.baseRate, 2) + ' (구독 ' + m.baseActive + '개사)<br>적용 후 ' +
          pct(m.simRate, 2) + ' (구독 ' + one(m.simActive) + '개사)';
      }
    }),
    xAxis: { type: 'category', boundaryGap: false, data: r.monthly.map(function (m) { return label(m.month); }),
             axisLine: { lineStyle: { color: t.colors.line } }, axisTick: { show: false }, axisLabel: { fontSize: t.fs, interval: 2 } },
    yAxis: { type: 'value', min: 0, axisLabel: { fontSize: t.fs, formatter: function (v) { return v + '%'; } },
             splitLine: { lineStyle: { color: t.colors.line } } },
    series: [
      { name: '현재', type: 'line', showSymbol: false, lineStyle: { color: t.colors['base-line'], width: 2, type: 'dashed' },
        itemStyle: { color: t.colors['base-line'] }, data: r.monthly.map(function (m) { return +(m.baseRate * 100).toFixed(3); }) },
      { name: '전략 적용 후', type: 'line', symbolSize: 5, lineStyle: { color: t.colors.saved, width: 3 }, itemStyle: { color: t.colors.saved },
        areaStyle: { color: t.colors.saved, opacity: 0.1 }, data: r.monthly.map(function (m) { return +(m.simRate * 100).toFixed(3); }) }
    ]
  };
}

// ---------- 3. 해지 MRR 워터폴
export function waterfallOption(r, t) {
  var base = r.churnMrr.base / 1e4, g = ['A', 'B', 'C'].map(function (k) { return r.byGroup[k].mrr / 1e4; });
  var after = r.churnMrr.sim / 1e4, running = base, hidden = [0], shown = [base];
  g.forEach(function (v) { running -= v; hidden.push(Math.max(0, running)); shown.push(v); });
  hidden.push(0); shown.push(Math.max(0, after));
  var fills = [t.colors.churned, t.colors['group-a'], t.colors['group-b'], t.colors['group-c'], t.colors.ink];
  return {
    animationDurationUpdate: 450, animationEasingUpdate: 'cubicOut', textStyle: textStyle(t),
    grid: { left: 8, right: 8, top: t.fs * 1.8, bottom: 4, containLabel: true },
    tooltip: tooltip(t, { trigger: 'item', formatter: function (p) {
      return p.seriesName === 'gap' ? '' : '<b>' + p.name.replace('\n', ' ') + '</b><br>월 ' + Math.round(p.value).toLocaleString('ko-KR') + '만 원';
    } }),
    xAxis: { type: 'category', data: ['현재', GROUP_LABEL.A.replace(' ', '\n'), GROUP_LABEL.B.replace(' ', '\n'), GROUP_LABEL.C.replace(' ', '\n'), '적용 후'],
             axisLine: { lineStyle: { color: t.colors.line } }, axisTick: { show: false }, axisLabel: { fontSize: t.fs, interval: 0, lineHeight: t.fs * 1.25 } },
    yAxis: { type: 'value', min: 0, max: Math.max(1, Math.ceil(base / 1000) * 1000), axisLabel: { fontSize: t.fs, formatter: function (v) { return v.toLocaleString('ko-KR'); } },
             splitLine: { lineStyle: { color: t.colors.line } } },
    series: [
      { name: 'gap', type: 'bar', stack: 'w', silent: true, itemStyle: { color: 'transparent' }, data: hidden },
      { name: '월 매출', type: 'bar', stack: 'w', barWidth: '58%',
        data: shown.map(function (v, i) { return { value: v, itemStyle: { color: fills[i], borderRadius: 3 } }; }),
        label: { show: true, position: 'top', fontSize: t.fs, fontWeight: 700, color: t.colors.ink,
                 formatter: function (p) {
                   var v = Math.round(p.value).toLocaleString('ko-KR');
                   return p.dataIndex === 0 || p.dataIndex === 4 ? v : (Math.round(p.value) === 0 ? '0' : '−' + v);
                 } } }
    ]
  };
}

// ---------- 4. 해지 유형별 전/후
export function typesOption(r, t) {
  var names = r.byType.map(function (t) { return t.type; });
  return {
    animationDurationUpdate: 450, animationEasingUpdate: 'cubicOut', textStyle: textStyle(t),
    grid: { left: 4, right: t.fs * 3, top: t.fs * 2.2, bottom: 0, containLabel: true },
    legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: t.colors['ink-soft'], fontSize: t.fs }, data: ['현재', '전략 적용 후'] },
    tooltip: tooltip(t, { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: function (ps) {
      var t = r.byType[ps[0].dataIndex];
      return '<b>' + t.type + '</b><br>현재 ' + t.base + '개사<br>적용 후 ' + one(t.sim) + '개사 (−' + one(t.base - t.sim) + ')';
    } }),
    xAxis: { type: 'value', min: 0, axisLabel: { show: false }, splitLine: { show: false } },
    yAxis: { type: 'category', inverse: true, data: names, axisLine: { show: false }, axisTick: { show: false },
             axisLabel: { fontSize: t.fs, color: t.colors.ink } },
    series: [
      { name: '현재', type: 'bar', barGap: '10%', barCategoryGap: '26%', itemStyle: { color: t.colors.kept, borderRadius: 2 },
        data: r.byType.map(function (t) { return t.base; }),
        label: { show: true, position: 'right', fontSize: t.fs * 0.92, color: t.colors['ink-soft'] } },
      { name: '전략 적용 후', type: 'bar', itemStyle: { color: t.colors.churned, borderRadius: 2 },
        data: r.byType.map(function (t) { return +t.sim.toFixed(2); }),
        label: { show: true, position: 'right', fontSize: t.fs * 0.92, fontWeight: 700, color: t.colors.ink, formatter: function (p) { return one(p.value); } } }
    ]
  };
}

// ---------- 5. 해지 요청 흐름
// 좁은 화면에서는 이름표가 다음 단계 막대와 겹치므로 이름과 건수를 두 줄로 나눈다
export function flowOption(r, t, size) {
  var gap = size && size.width < 420 ? '\n' : ' ';
  var f = r.flow, total = { '자발 해지 요청': f.requests, '상담 진행': f.consulted, '미상담': f.notConsulted,
                            '방어 성공': f.saved, '해지': f.churnedAfterConsult + f.notConsulted };
  var links = [
    ['자발 해지 요청', '상담 진행', f.consulted], ['자발 해지 요청', '미상담', f.notConsulted],
    ['상담 진행', '방어 성공', f.saved], ['상담 진행', '해지', f.churnedAfterConsult], ['미상담', '해지', f.notConsulted]
  ].filter(function (l) { return l[2] > 0.05; });
  var used = {};
  links.forEach(function (l) { used[l[0]] = used[l[1]] = true; });
  var fill = { '자발 해지 요청': t.colors['base-line'], '상담 진행': t.colors['group-c'], '미상담': t.colors.kept, '방어 성공': t.colors.saved, '해지': t.colors.churned };
  return {
    animation: false, textStyle: textStyle(t),   // 링크 구성이 바뀌므로 통째로 다시 그린다
    tooltip: tooltip(t, { trigger: 'item', formatter: function (p) {
      return p.dataType === 'edge' ? p.data.source + ' → ' + p.data.target + '<br><b>' + one(p.data.value) + '건</b>'
        : '<b>' + p.name + '</b> ' + one(total[p.name]) + '건';
    } }),
    series: [{
      type: 'sankey', left: 4, right: t.fs * 7.5, top: 6, bottom: 6, nodeWidth: 14, nodeGap: 14, draggable: false,
      emphasis: { focus: 'adjacency' },
      data: Object.keys(total).filter(function (n) { return used[n]; }).map(function (n) { return { name: n, itemStyle: { color: fill[n] } }; }),
      links: links.map(function (l) { return { source: l[0], target: l[1], value: l[2] }; }),
      lineStyle: { color: 'target', opacity: 0.28, curveness: 0.5 },
      label: { fontSize: t.fs, lineHeight: t.fs * 1.25, color: t.colors.ink, formatter: function (p) { return p.name + gap + one(total[p.name]); } }
    }]
  };
}
