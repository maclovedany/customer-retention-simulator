// 시뮬레이션 계산 (설계안 5.2). 화면과 분리된 순수 함수.

var TYPES = ['결제 실패형', '채용 종료형', '지원 불만형', '결제·계약 불편형', '비용 절감형', '기타'];
var FALLBACK = 0.2;      // 참고값이 없을 때 쓰는 가정값
var PAUSE_REVENUE = 0.5; // 일시정지·요금제 전환으로 남은 고객의 매출 반영 비율

var isType = function () {
  var names = Array.prototype.slice.call(arguments);
  return function (f) { return names.indexOf(f.type) >= 0; };
};

// 레버 정의. target은 대상 기업 조건, 조작 값은 0~1.
var LEVERS = [
  { key: 'salary', group: 'A', label: '보상·연봉 분석 기능 확대', unit: '이탈 감소율', min: 0, max: 0.6,
    ref: 'salaryReduction', refLabel: '참고값', note: '공고가 없는 기업 중 연봉 데이터 이용 기업의 이탈 감소율',
    targetLabel: '채용 종료형 + 비용 절감형', target: isType('채용 종료형', '비용 절감형') },
  { key: 'payRecovery', group: 'B', label: '결제 실패 회수', unit: '회수율', min: 0, max: 1,
    ref: 'payRecoveryRate', refLabel: '참고값', note: '현재 2회 연속 실패 후 회복률',
    targetLabel: '결제 실패형', target: isType('결제 실패형') },
  { key: 'pause', group: 'B', label: '일시정지·요금제 전환 옵션', unit: '옵션 선택률', min: 0, max: 0.6,
    ref: null, note: '매출에는 50%만 반영',
    targetLabel: '채용 종료형 + 결제·계약 불편형', target: isType('채용 종료형', '결제·계약 불편형') },
  { key: 'annual', group: 'B', label: '연 결제 전환 유도', unit: '전환율', min: 0, max: 0.5,
    ref: 'annualFactor', refLabel: '전환 시 이탈 감소', note: '연 결제 전환 시 이탈 감소 계수',
    targetLabel: '월 결제 자발 해지', target: function (f) { return f.cycle === '월' && f.voluntary === true; } },
  { key: 'consultRate', group: 'C', label: '해지 요청 전건 상담', unit: '상담 진행률', min: 0, max: 1,
    ref: 'consultRate', refLabel: '현재', note: '현재 상담 진행률',
    targetLabel: '자발 해지 중 미상담', target: function (f) { return f.voluntary === true && f.consulted === false; } },
  { key: 'saveRate', group: 'C', label: '상담 시 방어율', unit: '방어율', min: 0.2, max: 0.6,
    ref: 'saveRate', refLabel: '현재', note: '현재 상담 시 방어 성공률', targetLabel: null, target: null },
  { key: 'onboarding', group: 'C', label: '담당자 온보딩·응대 개선', unit: '해소율', min: 0, max: 1,
    ref: null, note: null, targetLabel: '지원 불만형', target: isType('지원 불만형') },
  { key: 'alert', group: 'C', label: '이용 급락 경보 선제 대응', unit: '대응 성공률', min: 0, max: 0.5,
    ref: 'alertRecall', refLabel: '경보 감지율', note: '경보가 해지 직전 월을 감지한 비율',
    targetLabel: '직전월 급락이 감지된 자발 해지', target: function (f) { return f.voluntary === true && f.dropAlert === true; } },
  { key: 'rechurn', group: null, label: '방어 후 재해지율', unit: '재해지율', min: 0, max: 0.6,
    ref: 'rechurnRate', refLabel: '실제', note: '실제 방어 성공 건 중 다시 해지한 비율', targetLabel: null, target: null }
];
// 기업별 방어 확률을 만드는 레버 (saveRate와 rechurn은 다른 레버의 계수)
var ACTING = ['salary', 'payRecovery', 'pause', 'annual', 'consultRate', 'onboarding', 'alert'];
var byKey = {};
LEVERS.forEach(function (l) { byKey[l.key] = l; });

var round2 = function (x) { return Math.round(x * 100) / 100; };
var clamp = function (x, lo, hi) { return Math.min(hi, Math.max(lo, x)); };
var ratio = function (a, b) { return b ? a / b : 0; };
var refOr = function (refs, name, fallback) {
  var v = refs ? refs[name] : null;
  return typeof v === 'number' && isFinite(v) ? v : fallback;
};

function levers(refs) {
  return LEVERS.map(function (l) {
    var c = Object.assign({}, l);
    if (c.key === 'consultRate') c.min = round2(clamp(refOr(refs, 'consultRate', 0), 0, 1));
    return c;
  });
}

function presets(refs) {
  var defs = levers(refs), range = {};
  defs.forEach(function (l) { range[l.key] = l; });
  var fit = function (key, x) { return clamp(round2(x), range[key].min, range[key].max); };
  var salary = refOr(refs, 'salaryReduction', FALLBACK), pay = refOr(refs, 'payRecoveryRate', FALLBACK);
  var c = refOr(refs, 'consultRate', 0), save = refOr(refs, 'saveRate', FALLBACK), rechurn = refOr(refs, 'rechurnRate', FALLBACK);
  var make = function (m) {
    return {
      salary: fit('salary', salary * m.scale), payRecovery: fit('payRecovery', pay * m.scale),
      pause: fit('pause', m.assume), annual: fit('annual', m.assume),
      consultRate: fit('consultRate', m.consult), saveRate: fit('saveRate', save * m.saveScale),
      onboarding: fit('onboarding', m.assume), alert: fit('alert', m.assume), rechurn: fit('rechurn', rechurn)
    };
  };
  return {
    current: make({ scale: 0, assume: 0, consult: c, saveScale: 1 }),
    conservative: make({ scale: 0.5, assume: 0.1, consult: (c + 1) / 2, saveScale: 1 }),
    base: make({ scale: 1, assume: 0.2, consult: 1, saveScale: 1 }),
    aggressive: make({ scale: 1.5, assume: 0.3, consult: 1, saveScale: 1.2 })
  };
}

// 슬라이더는 1% 단위라 최솟값이 반올림된 참고값이다. 최솟값 이하는 "현재 진행률 그대로"로 본다.
function effectiveConsult(values, refs) {
  var c = clamp(refOr(refs, 'consultRate', 0), 0, 1);
  return values.consultRate <= round2(c) ? c : Math.min(1, values.consultRate);
}

// 방어율도 같은 이유로, 슬라이더가 반올림된 참고값에 있으면 반올림 전 참고값을 쓴다.
function effectiveSave(values, refs) {
  var s = refOr(refs, 'saveRate', null);
  return s !== null && values.saveRate === round2(s) ? s : values.saveRate;
}

// 해지 기업 한 곳에 대한 레버별 방어 확률
function probabilities(f, values, refs) {
  var c = clamp(refOr(refs, 'consultRate', 0), 0, 1), p = {};
  ACTING.forEach(function (key) {
    var v = 0;
    if (byKey[key].target(f)) {
      if (key === 'annual') v = values.annual * refOr(refs, 'annualFactor', 0);
      else if (key === 'consultRate') v = c >= 1 ? 0 : (effectiveConsult(values, refs) - c) / (1 - c) * effectiveSave(values, refs);
      else v = values[key];
    }
    p[key] = clamp(v || 0, 0, 1);
  });
  return p;
}

function targetCount(data, key) {
  var l = byKey[key];
  return l && l.target ? data.firms.filter(function (f) { return f.churned && l.target(f); }).length : null;
}

function run(data, values) {
  var refs = data.refs || {}, months = data.meta.months, firms = data.firms;
  var types = data.meta.types || TYPES;
  var monthIndex = {};
  months.forEach(function (m, i) { monthIndex[m] = i; });

  var byGroup = { A: { firms: 0, mrr: 0 }, B: { firms: 0, mrr: 0 }, C: { firms: 0, mrr: 0 } };
  var typeBase = {}, typeSim = {};
  types.forEach(function (t) { typeBase[t] = 0; typeSim[t] = 0; });
  var simChurnByMonth = months.map(function () { return 0; }), savedByMonth = months.map(function () { return 0; });
  var churnedCount = 0, savedCount = 0, savedMrr = 0, savedRevenue = 0, baseMrr = 0;
  var annualBase = 0, annualSim = 0, saveProb = {};

  // 방어된 기업도 남은 기간에 기준 월평균 이탈률만큼 줄어든다고 본다: 남은 n개월의 기대 유지 개월 수
  var keep = 1 - ratio(data.monthly.reduce(function (a, m) { return a + m.churned; }, 0),
                       data.monthly.reduce(function (a, m) { return a + m.active; }, 0));
  var stayMonths = function (n) {
    var total = 0, alive = 1;
    for (var j = 0; j < n; j += 1) { alive *= keep; total += alive; }
    return total;
  };

  firms.forEach(function (f) {
    if (!f.churned) return;
    var p = probabilities(f, values, refs), survive = 1, sum = 0;
    ACTING.forEach(function (k) { survive *= 1 - p[k]; sum += p[k]; });
    var s = (1 - survive) * (1 - clamp(values.rechurn || 0, 0, 1));
    var idx = monthIndex[f.churnMonth], left = months.length - 1 - idx, firmMrr = 0;
    ACTING.forEach(function (k) {
      if (!sum) return;
      var share = s * p[k] / sum, g = byGroup[byKey[k].group];
      var money = share * f.mrr * (k === 'pause' ? PAUSE_REVENUE : 1);
      g.firms += share; g.mrr += money; firmMrr += money;
    });
    saveProb[f.id] = s;
    churnedCount += 1 - s; savedCount += s; savedMrr += firmMrr; savedRevenue += firmMrr * stayMonths(left); baseMrr += f.mrr;
    if (f.type in typeBase) { typeBase[f.type] += 1; typeSim[f.type] += 1 - s; }
    if (idx >= 0) { simChurnByMonth[idx] += 1 - s; savedByMonth[idx] += s; }
    if (f.cycle === '연') { annualBase += 1; annualSim += 1 - s; }
  });

  var baseChurned = firms.filter(function (f) { return f.churned; }).length;
  var cumSaved = 0, sumBaseChurn = 0, sumBaseActive = 0, sumSimChurn = 0, sumSimActive = 0;
  var monthly = data.monthly.map(function (m, i) {
    var simActive = m.active + cumSaved;   // 이전 달까지 방어된 기업이 남아 있다
    cumSaved += savedByMonth[i];
    sumBaseChurn += m.churned; sumBaseActive += m.active; sumSimChurn += simChurnByMonth[i]; sumSimActive += simActive;
    return { month: m.month, baseRate: ratio(m.churned, m.active), simRate: ratio(simChurnByMonth[i], simActive),
             baseActive: m.active, simActive: simActive };
  });

  var n = firms.length;
  var kpi = function (churned, monthlyChurn, annualChurned, mrr, revenue, saved) {
    return { retention: n ? 1 - churned / n : 0, monthlyChurn: monthlyChurn,
             renewalRate: data.renewalsDue ? 1 - annualChurned / data.renewalsDue : 0,
             savedMrr: mrr, savedRevenue: revenue, churnedCount: churned, savedCount: saved };
  };

  // 점 격자: 방어 확률이 높은 기업부터 기대 방어 기업 수만큼 '방어됨'으로 표시
  var savedN = Math.round(savedCount);
  var ranked = firms.filter(function (f) { return f.churned; }).sort(function (a, b) {
    return saveProb[b.id] - saveProb[a.id] || (a.id < b.id ? -1 : 1);
  });
  var savedIds = {};
  ranked.slice(0, savedN).forEach(function (f) { if (saveProb[f.id] > 0) savedIds[f.id] = true; });

  // 흐름도(요청 단위)도 같은 모델을 따른다: 실제 상담·방어 건수에, 새로 상담하게 되는 건의 방어분만 더한다.
  var req = data.requests || { voluntary: 0, consulted: 0, saved: 0 };
  var requests = req.voluntary, cNow = clamp(refOr(refs, 'consultRate', 0), 0, 1);
  var extraShare = cNow >= 1 ? 0 : (effectiveConsult(values, refs) - cNow) / (1 - cNow);
  var extraConsulted = (requests - req.consulted) * clamp(extraShare, 0, 1);
  var consulted = req.consulted + extraConsulted;
  var saved = req.saved + extraConsulted * effectiveSave(values, refs) * (1 - clamp(values.rechurn || 0, 0, 1));

  return {
    baseline: kpi(baseChurned, ratio(sumBaseChurn, sumBaseActive), annualBase, 0, 0, 0),
    kpi: kpi(churnedCount, ratio(sumSimChurn, sumSimActive), annualSim, savedMrr, savedRevenue, savedCount),
    monthly: monthly,
    byType: types.map(function (t) { return { type: t, base: typeBase[t], sim: typeSim[t] }; }),
    byGroup: byGroup,
    churnMrr: { base: baseMrr, sim: baseMrr - savedMrr },
    firms: firms.map(function (f) {
      return { id: f.id, status: !f.churned ? 'kept' : savedIds[f.id] ? 'saved' : 'churned', s: saveProb[f.id] || 0,
               plan: f.plan, cycle: f.cycle, method: f.method, type: f.type, mrr: f.mrr, churnMonth: f.churnMonth };
    }),
    flow: { requests: requests, consulted: consulted, notConsulted: requests - consulted, saved: saved,
            churnedAfterConsult: consulted - saved }
  };
}

export { LEVERS, levers, presets, run, targetCount };
