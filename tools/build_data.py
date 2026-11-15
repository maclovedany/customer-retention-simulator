"""원자료 엑셀 → 화면용 데이터(JSON). 화면의 src/lib/buildData.js와 같은 규칙의 기준 구현이며,
tools/expected_current.json(테스트 기준값)을 만드는 데 쓴다 (설계안 5.1).

실행: uv run -q --with pandas --with openpyxl python -I build_data.py [엑셀 경로] [출력 경로]
"""
import json
import os
import sys

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_XLSX = os.path.join(HERE, '..', '..', 'HR플랫폼_B2B구독_더미데이터.xlsx')   # 프로젝트 폴더 옆의 원자료
DEFAULT_OUT = os.path.join(HERE, 'expected_current.json')

REQUIRED = {
    '1_기업회원': ['기업ID', '업종', '규모구분', '가입일', '담당영업', '가입요금제', '결제주기', '결제수단'],
    '2_결제이력': ['기업ID', '결제예정일', '요금제', '결제주기', '결제상태', '연속실패횟수'],
    '3_월별이용로그': ['기업ID', '기준월', '로그인수', '공고등록수', '연봉데이터조회수'],
    '4_해지요청': ['기업ID', '해지요청일', '해지구분', '해지사유_선택', '해지사유_서술', '상담진행여부', '최종결과'],
}
PRICE = {'베이직': 300000, '스탠다드': 800000, '프리미엄': 2500000}
ANNUAL_DISCOUNT = 0.85
INDUSTRY_FIX = {'제조업': '제조', 'IT/소프트웨어': 'IT·소프트웨어'}
TYPES = ['결제 실패형', '채용 종료형', '지원 불만형', '결제·계약 불편형', '비용 절감형', '기타']

DESC_GROUP = {}
for _group, _sentences in {
    '채용': ['올해 채용 계획이 없어 당분간 쓸 일이 없습니다', '채용 동결로 서비스가 필요 없어졌습니다',
           '채용이 끝나서 더 이상 이용하지 않습니다', '공고 올릴 일이 없는데 구독료만 나가고 있습니다',
           '채용 말고는 활용할 기능이 없네요'],
    '지원': ['도입 후 활용 안내가 없었습니다', '문의에 대한 응대가 느립니다',
           '우리 회사 상황에 맞는 제안이 없었습니다', '담당자 연락을 한 번도 받지 못했습니다'],
    '계약': ['잠시 쉬고 싶은데 일시정지가 안 돼서 해지합니다', '결제 수단 변경과 세금계산서 처리가 번거롭습니다',
           '카드 재등록을 요구받았는데 절차가 복잡했습니다', '월 결제가 부담인데 요금제 조정이 어렵습니다'],
    None: ['예산이 삭감되었습니다', '비용 대비 효과가 낮습니다', '내부 사정으로 해지합니다',
           '경쟁사에서 더 좋은 조건과 전담 지원을 제안받았습니다'],
}.items():
    for _s in _sentences:
        DESC_GROUP[_s] = _group


def read_sheets(path):
    try:
        book = pd.ExcelFile(path)
    except Exception as e:  # 파일 없음, 엑셀 아님
        raise SystemExit(f'엑셀 파일을 열 수 없습니다: {path} ({e})')
    sheets = {}
    for name, cols in REQUIRED.items():
        if name not in book.sheet_names:
            raise SystemExit(f"시트 '{name}'이(가) 없습니다.")
        df = pd.read_excel(book, sheet_name=name)
        missing = [c for c in cols if c not in df.columns]
        if missing:
            raise SystemExit(f"시트 '{name}'에 열 {missing}이(가) 없습니다.")
        sheets[name] = df
    return sheets


def churn_type(voluntary, selected, description):
    group = DESC_GROUP.get(description)
    if not voluntary:
        return '결제 실패형'
    if selected == '채용 계획 없음' or group == '채용':
        return '채용 종료형'
    if selected == '서비스·지원 불만족' or group == '지원':
        return '지원 불만형'
    if selected == '결제·계약 불편' or group == '계약':
        return '결제·계약 불편형'
    if selected == '비용 부담':
        return '비용 절감형'
    return '기타'


def ratio(num, den):
    return None if not den else float(num) / float(den)


def reduction(low_rate, high_rate):
    """1 − low/high. 계산 불가면 None, 음수면 0."""
    if low_rate is None or not high_rate:
        return None
    return max(0.0, 1 - low_rate / high_rate)


def build(xlsx_path):
    s = read_sheets(xlsx_path)
    c, p, u, r = s['1_기업회원'].copy(), s['2_결제이력'].copy(), s['3_월별이용로그'].copy(), s['4_해지요청'].copy()

    # ---- 정제
    c['업종'] = c['업종'].replace(INDUSTRY_FIX)
    c['가입일'] = pd.to_datetime(c['가입일'])
    p['결제예정일'] = pd.to_datetime(p['결제예정일'].astype(str).str.replace(r'[./]', '-', regex=True), format='mixed')
    u = u.drop_duplicates()
    u['기준월'] = u['기준월'].astype(str)
    u = u.sort_values(['기업ID', '기준월'])
    r['해지요청일'] = pd.to_datetime(r['해지요청일'])
    r = r.sort_values(['기업ID', '해지요청일'])

    months = sorted(u['기준월'].unique())
    if not months:
        raise SystemExit("시트 '3_월별이용로그'에 데이터가 없습니다.")
    start = pd.Timestamp(months[0] + '-01')
    end = pd.Timestamp(months[-1] + '-01') + pd.offsets.MonthEnd(0)

    # ---- 해지 기업 (기업당 마지막 해지 확정 건)
    final = r[r['최종결과'] == '해지 확정'].drop_duplicates('기업ID', keep='last').set_index('기업ID')
    last_plan = p.sort_values('결제예정일').groupby('기업ID')['요금제'].last()

    # ---- 이용 로그 기반 기업별 지표
    logs = {fid: g for fid, g in u.groupby('기업ID')}
    salary_mean = u.groupby('기업ID')['연봉데이터조회수'].mean()
    salary_median = salary_mean.median()

    firms, unknown_desc = [], 0
    alert_eligible = alert_hit = 0
    for row in c.itertuples(index=False):
        fid = row.기업ID
        plan = last_plan.get(fid, row.가입요금제)
        price = PRICE.get(plan)
        if price is None:
            raise SystemExit(f"기업 {fid}의 요금제 '{plan}'은(는) 알 수 없는 요금제입니다. MRR을 계산할 수 없습니다.")
        mrr = price * (ANNUAL_DISCOUNT if row.결제주기 == '연' else 1)
        churned = fid in final.index
        firm = {'id': fid, 'size': row.규모구분, 'industry': row.업종, 'plan': plan, 'cycle': row.결제주기,
                'method': row.결제수단, 'am': row.담당영업, 'mrr': float(mrr), 'churned': bool(churned),
                'churnMonth': None, 'voluntary': None, 'type': None, 'consulted': None, 'dropAlert': False}
        if churned:
            f = final.loc[fid]
            desc = f['해지사유_서술'] if isinstance(f['해지사유_서술'], str) else None
            voluntary = f['해지구분'] == '자발'
            if desc is not None and desc not in DESC_GROUP:
                unknown_desc += 1
            firm.update(churnMonth=f['해지요청일'].strftime('%Y-%m'), voluntary=bool(voluntary),
                        type=churn_type(voluntary, f['해지사유_선택'], desc), consulted=bool(f['상담진행여부'] == 'Y'))
            if firm['churnMonth'] not in months:
                raise SystemExit(f"기업 {fid}의 해지 월 {firm['churnMonth']}이(가) 관측 기간({months[0]}~{months[-1]}) 밖입니다.")
            # 직전월 급락: 해지 직전 월 로그인 < 그 앞 3개월 평균의 50%
            g = logs.get(fid)
            if g is not None:
                before = g[g['기준월'] < firm['churnMonth']]
                if len(before) >= 4:
                    prev3 = before['로그인수'].iloc[-4:-1]
                    if prev3.notna().all():
                        alert_eligible += 1
                        last = before['로그인수'].iloc[-1]
                        if pd.notna(last) and last < 0.5 * prev3.mean():
                            firm['dropAlert'] = True
                            alert_hit += 1
        firms.append(firm)

    by_id = {f['id']: f for f in firms}
    churned_firms = [f for f in firms if f['churned']]

    # ---- 월별 집계
    active = u.groupby('기준월')['기업ID'].nunique()
    churn_by_month = pd.Series([f['churnMonth'] for f in churned_firms]).value_counts() if churned_firms else pd.Series(dtype=int)
    monthly = [{'month': m, 'active': int(active.get(m, 0)), 'churned': int(churn_by_month.get(m, 0))} for m in months]

    # ---- 연 결제 갱신 도래 수
    renewals = 0
    for row in c[c['결제주기'] == '연'].itertuples(index=False):
        limit = final.loc[row.기업ID, '해지요청일'] + pd.Timedelta(days=45) if row.기업ID in final.index else None
        d = row.가입일 + pd.DateOffset(years=1)
        while d <= end:
            if d >= start and (limit is None or d <= limit):
                renewals += 1
            d += pd.DateOffset(years=1)

    # ---- 자발 해지 요청 (요청 단위)
    vol = r[r['해지구분'] == '자발']
    consulted = vol[vol['상담진행여부'] == 'Y']
    saved = consulted[consulted['최종결과'].astype(str).str.startswith('방어')]
    rechurned = sum(1 for fid in saved['기업ID'] if by_id.get(fid, {}).get('churned'))

    # ---- 결제 실패 회복률: 월 결제에서 2회 연속 실패 뒤 다음 결제 성공 비율
    pm = p[p['결제주기'] == '월'].sort_values(['기업ID', '결제예정일']).copy()
    pm['다음상태'] = pm.groupby('기업ID')['결제상태'].shift(-1)
    two = pm[(pm['연속실패횟수'] == 2) & pm['다음상태'].notna()]

    # ---- 연봉 기능 이탈 감소율: 최근 3개월 공고 0인 기업을 연봉 조회 중앙값 이상/미만으로 비교
    hi = lo = hi_ch = lo_ch = 0
    for f in firms:
        g = logs.get(f['id'])
        if g is None:
            continue
        recent = g.iloc[-4:-1] if f['churned'] else g.iloc[-3:]
        if recent['공고등록수'].sum() != 0:
            continue
        if salary_mean[f['id']] >= salary_median:
            hi, hi_ch = hi + 1, hi_ch + f['churned']
        else:
            lo, lo_ch = lo + 1, lo_ch + f['churned']

    # ---- 연 결제 전환 계수: 1 − 연 결제 월 이탈률 ÷ 월 결제 월 이탈률
    exposure = u.groupby('기업ID')['기준월'].nunique()
    def monthly_rate(cycle):
        ids = [f['id'] for f in firms if f['cycle'] == cycle]
        return ratio(sum(by_id[i]['churned'] for i in ids), sum(int(exposure.get(i, 0)) for i in ids))

    refs = {
        'consultRate': ratio(len(consulted), len(vol)),
        'saveRate': ratio(len(saved), len(consulted)),
        'rechurnRate': ratio(rechurned, len(saved)),
        'payRecoveryRate': ratio((two['다음상태'] == '성공').sum(), len(two)),
        'salaryReduction': reduction(ratio(hi_ch, hi), ratio(lo_ch, lo)),
        'annualFactor': reduction(monthly_rate('연'), monthly_rate('월')),
        'alertRecall': ratio(alert_hit, alert_eligible),
    }

    # ---- 정합성 검사
    type_counts = {t: sum(1 for f in churned_firms if f['type'] == t) for t in TYPES}
    if sum(type_counts.values()) != len(churned_firms):
        raise SystemExit('유형별 기업 수의 합이 해지 기업 수와 다릅니다.')
    if any(f['mrr'] <= 0 for f in firms):
        raise SystemExit('MRR이 0 이하인 기업이 있습니다.')

    return {
        'meta': {'source': os.path.basename(xlsx_path), 'months': months, 'types': TYPES,
                 'unknownDescriptions': unknown_desc},
        'firms': firms,
        'monthly': monthly,
        'renewalsDue': int(renewals),
        'requests': {'voluntary': int(len(vol)), 'consulted': int(len(consulted)), 'saved': int(len(saved))},
        'refs': refs,
    }


def main():
    xlsx = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_XLSX
    out = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_OUT
    d = build(xlsx)
    with open(out, 'w', encoding='utf-8') as fh:
        json.dump(d, fh, ensure_ascii=False, separators=(',', ':'))
    churned = [f for f in d['firms'] if f['churned']]
    n = len(d['firms'])
    print(f"원자료: {d['meta']['source']}  →  {os.path.abspath(out)}")
    print(f"기업 {n}개사, 해지 {len(churned)}개사, 누적 이탈률 {round(len(churned) / n * 1000 + 1e-9) / 10}%, "
          f"해지 MRR {sum(f['mrr'] for f in churned) / 1e4:,.0f}만 원")
    print('유형별:', ', '.join(f"{t} {sum(1 for f in churned if f['type'] == t)}" for t in d['meta']['types']))
    print('참고값:', ', '.join(f"{k} {'근거 없음' if v is None else f'{v * 100:.0f}%'}" for k, v in d['refs'].items()))
    print(f"분류표에 없는 서술 {d['meta']['unknownDescriptions']}건 (선택 사유로 분류)")


if __name__ == '__main__':
    main()
