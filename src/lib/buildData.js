// 원자료 4개 표 → 화면용 데이터 (설계안 5.1). tools/build_data.py와 같은 규칙이며 test_build.mjs가 두 결과를 비교한다.
// 입력: { source?, companies: [...], payments: [...], usage_logs: [...], churn_requests: [...] } (열 이름은 supabase/01_schema.sql)

export const REQUIRED = {
  companies: ['company_id', 'industry', 'size_segment', 'signup_date', 'account_manager', 'plan', 'billing_cycle', 'payment_method'],
  payments: ['company_id', 'due_date', 'plan', 'billing_cycle', 'status', 'consecutive_failures'],
  usage_logs: ['company_id', 'month', 'logins', 'job_posts', 'talent_searches', 'salary_views', 'review_views', 'active_accounts'],
  churn_requests: ['company_id', 'request_date', 'churn_kind', 'reason_selected', 'reason_text', 'consulted', 'outcome'],
};

const PRICE = { '베이직': 300000, '스탠다드': 800000, '프리미엄': 2500000 };
const ANNUAL_DISCOUNT = 0.85;
const INDUSTRY_FIX = { '제조업': '제조', 'IT/소프트웨어': 'IT·소프트웨어' };
export const TYPES = ['결제 실패형', '채용 종료형', '지원 불만형', '결제·계약 불편형', '비용 절감형', '기타'];

const DESC_GROUP = {};
const groupOf = (group, sentences) => sentences.forEach(s => { DESC_GROUP[s] = group; });
groupOf('채용', ['올해 채용 계획이 없어 당분간 쓸 일이 없습니다', '채용 동결로 서비스가 필요 없어졌습니다',
  '채용이 끝나서 더 이상 이용하지 않습니다', '공고 올릴 일이 없는데 구독료만 나가고 있습니다', '채용 말고는 활용할 기능이 없네요']);
groupOf('지원', ['도입 후 활용 안내가 없었습니다', '문의에 대한 응대가 느립니다',
  '우리 회사 상황에 맞는 제안이 없었습니다', '담당자 연락을 한 번도 받지 못했습니다']);
groupOf('계약', ['잠시 쉬고 싶은데 일시정지가 안 돼서 해지합니다', '결제 수단 변경과 세금계산서 처리가 번거롭습니다',
  '카드 재등록을 요구받았는데 절차가 복잡했습니다', '월 결제가 부담인데 요금제 조정이 어렵습니다']);
groupOf(null, ['예산이 삭감되었습니다', '비용 대비 효과가 낮습니다', '내부 사정으로 해지합니다',
  '경쟁사에서 더 좋은 조건과 전담 지원을 제안받았습니다']);

// ---- 날짜 (모두 'YYYY-MM-DD' 문자열로 다룬다)
const day = v => (v === null || v === undefined || v === '' ? null : String(v).replace(/[./]/g, '-').slice(0, 10));
const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const pad = n => String(n).padStart(2, '0');
function addYears(d, k) {
  const y = Number(d.slice(0, 4)) + k, m = d.slice(5, 7);
  let dd = d.slice(8, 10);
  if (m === '02' && dd === '29' && !isLeap(y)) dd = '28';
  return `${y}-${m}-${dd}`;
}
function addDays(d, n) {
  const t = new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)) + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
function monthEnd(month) {
  const t = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0));
  return `${month}-${pad(t.getUTCDate())}`;
}

const num = v => (v === null || v === undefined || v === '' ? null : Number(v));
const ratio = (a, b) => (b ? a / b : null);
const reduction = (low, high) => (low === null || !high ? null : Math.max(0, 1 - low / high));
const sum = xs => xs.reduce((s, x) => s + x, 0);
const mean = xs => sum(xs) / xs.length;
function median(xs) {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b), mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function checkColumns(raw) {
  Object.entries(REQUIRED).forEach(([table, cols]) => {
    const rows = raw ? raw[table] : null;
    if (!Array.isArray(rows)) throw new Error(`표 '${table}'의 데이터가 없습니다.`);
    rows.forEach(r => {
      const missing = cols.filter(c => r[c] === undefined);
      if (missing.length) throw new Error(`표 '${table}'에 열 ${missing.join(', ')}이(가) 없습니다.`);
    });
  });
}

function churnType(voluntary, selected, description) {
  const group = DESC_GROUP[description];
  if (!voluntary) return '결제 실패형';
  if (selected === '채용 계획 없음' || group === '채용') return '채용 종료형';
  if (selected === '서비스·지원 불만족' || group === '지원') return '지원 불만형';
  if (selected === '결제·계약 불편' || group === '계약') return '결제·계약 불편형';
  if (selected === '비용 부담') return '비용 절감형';
  return '기타';
}

export function buildData(raw) {
  checkColumns(raw);

  // ---- 정제
  const companies = raw.companies.map(c => ({ ...c, signup_date: day(c.signup_date) }));
  const payments = raw.payments.map(p => ({ ...p, due: day(p.due_date), fails: num(p.consecutive_failures) }));
  const seen = new Set();
  const usage = [];
  raw.usage_logs.forEach(u => {   // 완전 중복 행 제거
    const row = { company_id: u.company_id, month: String(u.month), logins: num(u.logins), job_posts: num(u.job_posts),
      talent_searches: num(u.talent_searches), salary_views: num(u.salary_views), review_views: num(u.review_views),
      active_accounts: num(u.active_accounts) };
    const key = JSON.stringify(Object.values(row));
    if (!seen.has(key)) { seen.add(key); usage.push(row); }
  });
  usage.sort((a, b) => byText(a.company_id, b.company_id) || byText(a.month, b.month));
  const requests = raw.churn_requests.map((r, i) => ({ ...r, date: day(r.request_date), order: i }));
  requests.sort((a, b) => byText(a.company_id, b.company_id) || byText(a.date || '9999', b.date || '9999') || a.order - b.order);

  const months = [...new Set(usage.map(u => u.month))].sort();
  if (!months.length) throw new Error("표 'usage_logs'에 데이터가 없어 관측 기간을 알 수 없습니다.");
  const start = `${months[0]}-01`, end = monthEnd(months[months.length - 1]);

  // ---- 해지 기업 (기업당 마지막 해지 확정 건), 최근 요금제
  const final = {};
  requests.forEach(r => { if (r.outcome === '해지 확정') final[r.company_id] = r; });
  const lastPlan = {};
  payments.slice().sort((a, b) => byText(a.due || '', b.due || '')).forEach(p => { lastPlan[p.company_id] = p.plan; });

  const logs = {};
  usage.forEach(u => { (logs[u.company_id] = logs[u.company_id] || []).push(u); });
  const salaryMean = {};
  Object.entries(logs).forEach(([id, rows]) => { salaryMean[id] = mean(rows.map(r => r.salary_views || 0)); });
  const salaryMedian = median(Object.values(salaryMean));

  let unknownDescriptions = 0, alertEligible = 0, alertHit = 0;
  const firms = companies.map(c => {
    const id = c.company_id, plan = lastPlan[id] || c.plan, price = PRICE[plan];
    if (price === undefined) throw new Error(`기업 ${id}의 요금제 '${plan}'은(는) 알 수 없는 요금제입니다. MRR을 계산할 수 없습니다.`);
    const f = final[id];
    const firm = { id, size: c.size_segment, industry: INDUSTRY_FIX[c.industry] || c.industry, plan, cycle: c.billing_cycle,
      method: c.payment_method, am: c.account_manager, mrr: price * (c.billing_cycle === '연' ? ANNUAL_DISCOUNT : 1),
      churned: Boolean(f), churnMonth: null, voluntary: null, type: null, consulted: null, dropAlert: false };
    if (!f) return firm;
    if (!f.date) throw new Error(`기업 ${id}의 해지 확정 건에 해지요청일(request_date)이 비어 있습니다.`);
    const desc = typeof f.reason_text === 'string' ? f.reason_text : null;
    if (desc !== null && !(desc in DESC_GROUP)) unknownDescriptions += 1;
    firm.churnMonth = f.date.slice(0, 7);
    firm.voluntary = f.churn_kind === '자발';
    firm.type = churnType(firm.voluntary, f.reason_selected, desc);
    firm.consulted = f.consulted === 'Y';
    if (!months.includes(firm.churnMonth)) {
      throw new Error(`기업 ${id}의 해지 월 ${firm.churnMonth}이(가) 관측 기간(${months[0]}~${months[months.length - 1]}) 밖입니다.`);
    }
    // 직전월 급락: 해지 직전 월 로그인 < 그 앞 3개월 평균의 50%
    const before = (logs[id] || []).filter(r => r.month < firm.churnMonth);
    if (before.length >= 4) {
      const prev3 = before.slice(-4, -1).map(r => r.logins);
      if (prev3.every(v => v !== null)) {
        alertEligible += 1;
        const last = before[before.length - 1].logins;
        if (last !== null && last < 0.5 * mean(prev3)) { firm.dropAlert = true; alertHit += 1; }
      }
    }
    return firm;
  });
  const byId = {};
  firms.forEach(f => { byId[f.id] = f; });
  const churnedFirms = firms.filter(f => f.churned);

  // ---- 월별 집계
  const activeSets = {};
  usage.forEach(u => { (activeSets[u.month] = activeSets[u.month] || new Set()).add(u.company_id); });
  const monthly = months.map(m => ({ month: m, active: activeSets[m].size, churned: churnedFirms.filter(f => f.churnMonth === m).length }));

  // ---- 연 결제 갱신 도래 수
  let renewalsDue = 0;
  companies.filter(c => c.billing_cycle === '연' && c.signup_date).forEach(c => {
    const limit = final[c.company_id] ? addDays(final[c.company_id].date, 45) : null;
    for (let k = 1, d = addYears(c.signup_date, 1); d <= end; k += 1, d = addYears(c.signup_date, k)) {
      if (d >= start && (limit === null || d <= limit)) renewalsDue += 1;
    }
  });

  // ---- 자발 해지 요청 (요청 단위)
  const vol = requests.filter(r => r.churn_kind === '자발');
  const consulted = vol.filter(r => r.consulted === 'Y');
  const saved = consulted.filter(r => String(r.outcome).startsWith('방어'));
  const rechurned = saved.filter(r => byId[r.company_id] && byId[r.company_id].churned).length;

  // ---- 결제 실패 회복률: 월 결제에서 2회 연속 실패 뒤 다음 결제 성공 비율
  const monthlyPay = payments.filter(p => p.billing_cycle === '월')
    .sort((a, b) => byText(a.company_id, b.company_id) || byText(a.due || '', b.due || ''));
  let twoFails = 0, recovered = 0;
  monthlyPay.forEach((p, i) => {
    const next = monthlyPay[i + 1];
    if (p.fails === 2 && next && next.company_id === p.company_id) { twoFails += 1; if (next.status === '성공') recovered += 1; }
  });

  // ---- 연봉 기능 이탈 감소율: 최근 3개월 공고 0인 기업을 연봉 조회 중앙값 이상/미만으로 비교
  let hi = 0, lo = 0, hiChurn = 0, loChurn = 0;
  firms.forEach(f => {
    const g = logs[f.id];
    if (!g) return;
    const recent = f.churned ? g.slice(-4, -1) : g.slice(-3);
    if (sum(recent.map(r => r.job_posts || 0)) !== 0) return;
    if (salaryMean[f.id] >= salaryMedian) { hi += 1; hiChurn += f.churned ? 1 : 0; } else { lo += 1; loChurn += f.churned ? 1 : 0; }
  });

  // ---- 연 결제 전환 계수: 1 − 연 결제 월 이탈률 ÷ 월 결제 월 이탈률
  const exposure = {};
  Object.entries(logs).forEach(([id, rows]) => { exposure[id] = new Set(rows.map(r => r.month)).size; });
  const monthlyRate = cycle => {
    const group = firms.filter(f => f.cycle === cycle);
    return ratio(group.filter(f => f.churned).length, sum(group.map(f => exposure[f.id] || 0)));
  };

  const refs = {
    consultRate: ratio(consulted.length, vol.length),
    saveRate: ratio(saved.length, consulted.length),
    rechurnRate: ratio(rechurned, saved.length),
    payRecoveryRate: ratio(recovered, twoFails),
    salaryReduction: reduction(ratio(hiChurn, hi), ratio(loChurn, lo)),
    annualFactor: reduction(monthlyRate('연'), monthlyRate('월')),
    alertRecall: ratio(alertHit, alertEligible),
  };

  return {
    meta: { source: raw.source || 'Supabase', months, types: TYPES, unknownDescriptions },
    firms,
    monthly,
    renewalsDue,
    requests: { voluntary: vol.length, consulted: consulted.length, saved: saved.length },
    refs,
  };
}
