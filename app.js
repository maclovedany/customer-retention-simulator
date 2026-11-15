// 조작부와 지표 카드. 레버가 바뀔 때마다 Sim.run 결과를 화면과 Charts.update에 넘긴다.
(function () {
  'use strict';

  var data = window.SIM_DATA, Sim = window.Sim;
  var levers = Sim.levers(data.refs), presets = Sim.presets(data.refs);
  var values = Object.assign({}, presets.current);
  var inputs = {}, outputs = {};

  var GROUPS = [
    { id: 'A', title: 'A 채용 외 HR 서비스', report: '보고서 개선 방안 1·2' },
    { id: 'B', title: 'B 결제·구독 시스템', report: '보고서 개선 방안 3' },
    { id: 'C', title: 'C 징후 감지·맞춤 대응', report: '보고서 개선 방안 4' },
    { id: 'X', title: '공통 가정', report: '' }
  ];

  // ---- 표시 형식
  var pct = function (x, digits) {
    var m = Math.pow(10, digits === undefined ? 1 : digits);
    return (Math.round(x * 100 * m) / m).toFixed(digits === undefined ? 1 : digits) + '%';
  };
  var won = function (x) {   // 원 → '1,234만 원' 또는 '1.2억 원'
    var man = x / 1e4;
    if (man >= 1e4) return (Math.round(man / 1e3) / 10).toLocaleString('ko-KR', { minimumFractionDigits: 1 }) + '억 원';
    return Math.round(man).toLocaleString('ko-KR') + '만 원';
  };
  var count = function (x) { var r = Math.round(x * 10) / 10; return (r % 1 === 0 ? r.toFixed(0) : r.toFixed(1)); };
  var el = function (tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  // ---- 조작부
  function leverMeta(l) {
    var p = el('p', 'lever-meta'), parts = [];
    var n = Sim.targetCount(data, l.key);
    var full = [];
    if (n !== null) { parts.push('대상 <b>' + n + '개사</b>'); full.push('대상: ' + l.targetLabel + ' ' + n + '개사'); }
    if (l.ref) {
      var ref = data.refs[l.ref];
      if (ref === null || ref === undefined) { parts.push('근거 없음 (가정)'); full.push('근거 없음 (가정)'); }
      else { parts.push(l.refLabel + ' <b>' + pct(ref, 0) + '</b>'); full.push(l.note + ' ' + pct(ref, 0)); }
    } else {
      parts.push(l.note ? '가정, ' + l.note : '가정'); full.push('데이터 근거 없음 (가정)' + (l.note ? ', ' + l.note : ''));
    }
    if (l.targetLabel) parts.push(l.targetLabel);
    p.innerHTML = parts.join(' · ');
    p.title = full.join(' / ');
    return p;
  }

  function buildLevers() {
    var host = document.getElementById('levers');
    GROUPS.forEach(function (g) {
      var items = levers.filter(function (l) { return (l.group || 'X') === g.id; });
      if (!items.length) return;
      var box = el('div', 'group'); box.dataset.group = g.id;
      var h = el('h3', null, g.title);
      if (g.report) h.appendChild(el('span', null, g.report));
      box.appendChild(h);
      items.forEach(function (l) {
        var wrap = el('div', 'lever'), top = el('div', 'lever-top');
        var label = el('label', null, l.label), out = el('output');
        var input = document.createElement('input');
        input.type = 'range'; input.id = 'lever-' + l.key;
        input.min = Math.round(l.min * 100); input.max = Math.round(l.max * 100); input.step = 1;
        label.htmlFor = input.id; out.htmlFor = input.id;
        input.setAttribute('aria-label', l.label + ' ' + l.unit);
        input.addEventListener('input', function () {
          values[l.key] = Number(input.value) / 100;
          markPreset(null); paintLever(l.key); schedule();
        });
        top.appendChild(label); top.appendChild(out);
        wrap.appendChild(top); wrap.appendChild(input); wrap.appendChild(leverMeta(l));
        box.appendChild(wrap);
        inputs[l.key] = input; outputs[l.key] = out;
      });
      host.appendChild(box);
    });
  }

  function paintLever(key) {
    var input = inputs[key], v = Math.round(values[key] * 100);
    input.value = v;
    outputs[key].textContent = v + '%';
    var span = input.max - input.min;
    input.style.setProperty('--fill', (span ? (v - input.min) / span * 100 : 0) + '%');
  }

  function markPreset(name) {
    document.querySelectorAll('.presets button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.preset === name));
    });
  }

  function applyPreset(name) {
    if (!presets[name]) return;
    values = Object.assign({}, presets[name]);
    levers.forEach(function (l) { paintLever(l.key); });
    markPreset(name); schedule();
  }

  // ---- 지표 카드
  var KPIS = [
    { key: 'retention', title: data.meta.months.length + '개월 유지율', kind: 'rate', digits: 1, goodWhen: 1 },
    { key: 'monthlyChurn', title: '월평균 이탈률', kind: 'rate', digits: 2, goodWhen: -1 },
    { key: 'renewalRate', title: '연 결제 재계약률', kind: 'rate', digits: 1, goodWhen: 1 },
    { key: 'savedMrr', title: '방어한 월 매출 (MRR)', kind: 'money' },
    { key: 'savedRevenue', title: data.meta.months.length + '개월 누적 방어 매출', kind: 'money' }
  ];
  var cards = {};

  function buildKpis() {
    var host = document.getElementById('kpis');
    KPIS.forEach(function (k) {
      var card = el('article', 'kpi' + (k.kind === 'money' ? ' money' : ''));
      var value = el('p', 'value'), sub = el('p', 'sub');
      card.appendChild(el('h2', null, k.title)); card.appendChild(value); card.appendChild(sub);
      host.appendChild(card);
      cards[k.key] = { value: value, sub: sub };
    });
  }

  function paintKpis(r) {
    KPIS.forEach(function (k) {
      var c = cards[k.key], now = r.kpi[k.key], base = r.baseline[k.key];
      if (k.kind === 'rate') {
        c.value.textContent = pct(now, k.digits);
        var diff = (now - base) * 100, m = Math.pow(10, k.digits), shown = Math.round(diff * m) / m;
        c.sub.textContent = '현재 ' + pct(base, k.digits);
        var d = el('span', 'delta' + (shown * k.goodWhen > 0 ? ' good' : ''),
          shown === 0 ? '변화 없음' : (shown > 0 ? '+' : '−') + Math.abs(shown).toFixed(k.digits) + '%p');
        c.sub.appendChild(d);
      } else {
        c.value.textContent = won(now);
        c.value.classList.toggle('active', now > 0);
        c.sub.textContent = k.key === 'savedMrr'
          ? '해지로 잃던 ' + won(r.churnMrr.base) + ' 중 ' + pct(r.churnMrr.base ? now / r.churnMrr.base : 0, 0)
          : '방어 기업 ' + count(r.kpi.savedCount) + '개사의 남은 기간 구독료';
      }
    });
  }

  // ---- 갱신. 계산이 가벼워 입력 이벤트마다 바로 다시 그린다 (requestAnimationFrame은 가려진 탭에서 멈춘다).
  function schedule() { update(); }
  function update() {
    var r = Sim.run(data, values);
    paintKpis(r);
    if (window.Charts) window.Charts.update(r);
  }

  // ---- 시작
  function init() {
    var months = data.meta.months, n = data.firms.length;
    document.getElementById('source-line').textContent =
      n + '개 기업, ' + months[0].replace('-', '.') + '~' + months[months.length - 1].replace('-', '.') + ' 구독 데이터';
    document.getElementById('dots-title').textContent = n + '개 기업, 전략을 적용하면';
    buildLevers(); buildKpis();
    if (window.Charts) window.Charts.init(data);
    document.querySelectorAll('.presets button').forEach(function (b) {
      b.addEventListener('click', function () { applyPreset(b.dataset.preset); });
    });
    document.getElementById('reset').addEventListener('click', function () { applyPreset('current'); });
    var start = new URLSearchParams(location.search).get('preset');
    applyPreset(presets[start] ? start : 'current');
  }

  if (!data || !Sim) {
    document.body.textContent = 'data.js 또는 sim.js를 읽지 못했습니다. tools/build_data.py를 실행해 data.js를 만든 뒤 다시 열어 주세요.';
    return;
  }
  init();
})();
