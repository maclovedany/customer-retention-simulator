"""원자료 엑셀 → Supabase 적재용 SQL(supabase/*.sql)과 내장 스냅숏(src/data/raw.json).

실행: uv run -q --with pandas --with openpyxl python -I export_raw.py [엑셀 경로]
값은 정제하지 않고 그대로 옮긴다. 정제는 화면(src/lib/buildData.js)에서 한다.
"""
import json
import os
import sys

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_XLSX = os.path.join(HERE, '..', '..', 'HR플랫폼_B2B구독_더미데이터.xlsx')
SQL_DIR = os.path.join(HERE, '..', 'supabase')
RAW_JSON = os.path.join(HERE, '..', 'src', 'data', 'raw.json')
CHUNK = 500          # INSERT 한 문장에 넣는 행 수
FILE_ROWS = 3500     # SQL 파일 하나에 넣는 행 수 (SQL 편집기에 붙여 넣기 좋은 크기)

# 표 이름, 시트 이름, (엑셀 열 → DB 열, 종류). 종류: text | int | date | rawdate(문자 그대로)
TABLES = [
    ('companies', '1_기업회원', [
        ('기업ID', 'company_id', 'text'), ('기업명', 'company_name', 'text'), ('업종', 'industry', 'text'),
        ('규모구분', 'size_segment', 'text'), ('임직원수', 'employees', 'int'), ('지역', 'region', 'text'),
        ('가입일', 'signup_date', 'date'), ('담당영업', 'account_manager', 'text'), ('가입요금제', 'plan', 'text'),
        ('결제주기', 'billing_cycle', 'text'), ('결제수단', 'payment_method', 'text')]),
    ('payments', '2_결제이력', [
        ('결제ID', 'payment_id', 'text'), ('기업ID', 'company_id', 'text'), ('결제예정일', 'due_date', 'rawdate'),
        ('요금제', 'plan', 'text'), ('결제주기', 'billing_cycle', 'text'), ('청구금액', 'amount', 'int'),
        ('결제수단', 'payment_method', 'text'), ('결제상태', 'status', 'text'), ('연속실패횟수', 'consecutive_failures', 'int')]),
    ('usage_logs', '3_월별이용로그', [
        ('기업ID', 'company_id', 'text'), ('기준월', 'month', 'text'), ('로그인수', 'logins', 'int'),
        ('공고등록수', 'job_posts', 'int'), ('인재검색수', 'talent_searches', 'int'), ('연봉데이터조회수', 'salary_views', 'int'),
        ('기업리뷰조회수', 'review_views', 'int'), ('활성계정수', 'active_accounts', 'int')]),
    ('churn_requests', '4_해지요청', [
        ('요청ID', 'request_id', 'text'), ('기업ID', 'company_id', 'text'), ('해지요청일', 'request_date', 'date'),
        ('해지구분', 'churn_kind', 'text'), ('해지사유_선택', 'reason_selected', 'text'), ('해지사유_서술', 'reason_text', 'text'),
        ('상담진행여부', 'consulted', 'text'), ('방어제안', 'offer', 'text'), ('최종결과', 'outcome', 'text')]),
]
# 화면이 쓰는 열만 스냅숏에 담는다 (기업명 등은 제외)
SNAPSHOT_COLS = {
    'companies': ['company_id', 'industry', 'size_segment', 'signup_date', 'account_manager', 'plan', 'billing_cycle', 'payment_method'],
    'payments': ['company_id', 'due_date', 'plan', 'billing_cycle', 'status', 'consecutive_failures'],
    'usage_logs': ['company_id', 'month', 'logins', 'job_posts', 'talent_searches', 'salary_views', 'review_views', 'active_accounts'],
    'churn_requests': ['company_id', 'request_date', 'churn_kind', 'reason_selected', 'reason_text', 'consulted', 'outcome'],
}

SCHEMA = """-- 구독 유지·해지 방어 전략 시뮬레이터: 표 만들기와 읽기 전용 공개 설정
-- Supabase 대시보드의 SQL Editor에 붙여 넣고 실행합니다. 이미 표가 있으면 지우고 다시 만듭니다.

drop table if exists public.churn_requests, public.usage_logs, public.payments, public.companies;

create table public.companies (
  company_id       text primary key,          -- 기업ID
  company_name     text,                      -- 기업명
  industry         text,                      -- 업종
  size_segment     text,                      -- 규모구분
  employees        integer,                   -- 임직원수
  region           text,                      -- 지역
  signup_date      date,                      -- 가입일
  account_manager  text,                      -- 담당영업
  plan             text,                      -- 가입요금제 (베이직 / 스탠다드 / 프리미엄)
  billing_cycle    text,                      -- 결제주기 (월 / 연)
  payment_method   text                       -- 결제수단
);

create table public.payments (
  payment_id            text primary key,     -- 결제ID
  company_id            text,                 -- 기업ID
  due_date              text,                 -- 결제예정일 (원자료 표기 그대로, 예: 2026.09.04)
  plan                  text,                 -- 요금제
  billing_cycle         text,                 -- 결제주기
  amount                bigint,               -- 청구금액
  payment_method        text,                 -- 결제수단
  status                text,                 -- 결제상태 (성공 / 실패)
  consecutive_failures  integer               -- 연속실패횟수
);

create table public.usage_logs (
  id               bigint generated always as identity primary key,
  company_id       text,                      -- 기업ID
  month            text,                      -- 기준월 (YYYY-MM)
  logins           integer,                   -- 로그인수
  job_posts        integer,                   -- 공고등록수
  talent_searches  integer,                   -- 인재검색수
  salary_views     integer,                   -- 연봉데이터조회수
  review_views     integer,                   -- 기업리뷰조회수
  active_accounts  integer                    -- 활성계정수
);

create table public.churn_requests (
  request_id       text primary key,          -- 요청ID
  company_id       text,                      -- 기업ID
  request_date     date,                      -- 해지요청일
  churn_kind       text,                      -- 해지구분 (자발 / 비자발(결제 실패 자동 해지))
  reason_selected  text,                      -- 해지사유_선택
  reason_text      text,                      -- 해지사유_서술
  consulted        text,                      -- 상담진행여부 (Y / N)
  offer            text,                      -- 방어제안
  outcome          text                       -- 최종결과 (해지 확정 / 방어 성공(유지))
);

create index on public.payments (company_id);
create index on public.usage_logs (company_id);
create index on public.churn_requests (company_id);

-- 사이트 방문자는 조회만 할 수 있다. 수정은 대시보드(Table Editor)에서 한다.
alter table public.companies       enable row level security;
alter table public.payments        enable row level security;
alter table public.usage_logs      enable row level security;
alter table public.churn_requests  enable row level security;

create policy "public read" on public.companies       for select to anon, authenticated using (true);
create policy "public read" on public.payments        for select to anon, authenticated using (true);
create policy "public read" on public.usage_logs      for select to anon, authenticated using (true);
create policy "public read" on public.churn_requests  for select to anon, authenticated using (true);

grant select on public.companies, public.payments, public.usage_logs, public.churn_requests to anon, authenticated;
"""


def value(v, kind):
    """엑셀 값 → 파이썬 기본형 (None, int, str)."""
    if v is None or (isinstance(v, float) and pd.isna(v)) or v is pd.NaT:
        return None
    if kind == 'int':
        return int(v)
    if kind == 'date':
        return pd.Timestamp(v).strftime('%Y-%m-%d')
    if kind == 'rawdate':   # 날짜형이면 YYYY-MM-DD, 문자열이면 원자료 표기 그대로
        return v if isinstance(v, str) else pd.Timestamp(v).strftime('%Y-%m-%d')
    return str(v)


def sql_literal(v):
    if v is None:
        return 'null'
    if isinstance(v, int):
        return str(v)
    return "'" + v.replace("'", "''") + "'"


def main():
    xlsx = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_XLSX
    book = pd.ExcelFile(xlsx)
    os.makedirs(SQL_DIR, exist_ok=True)
    for name in os.listdir(SQL_DIR):
        if name.endswith('.sql'):
            os.remove(os.path.join(SQL_DIR, name))
    with open(os.path.join(SQL_DIR, '01_schema.sql'), 'w', encoding='utf-8') as fh:
        fh.write(SCHEMA)

    snapshot, file_no, written = {}, 2, ['01_schema.sql']
    for table, sheet, cols in TABLES:
        df = pd.read_excel(book, sheet_name=sheet, dtype=object)
        missing = [c for c, _, _ in cols if c not in df.columns]
        if missing:
            raise SystemExit(f"시트 '{sheet}'에 열 {missing}이(가) 없습니다.")
        rows = [{db: value(rec[src], kind) for src, db, kind in cols} for rec in df.to_dict('records')]
        snapshot[table] = [{k: r[k] for k in SNAPSHOT_COLS[table]} for r in rows]
        names = [db for _, db, _ in cols]
        for start in range(0, len(rows), FILE_ROWS):
            part = rows[start:start + FILE_ROWS]
            fname = f'{file_no:02d}_{table}' + (f'_{start // FILE_ROWS + 1}' if len(rows) > FILE_ROWS else '') + '.sql'
            with open(os.path.join(SQL_DIR, fname), 'w', encoding='utf-8') as fh:
                fh.write(f'-- {sheet} → public.{table}: {start + 1}~{start + len(part)}행 / 전체 {len(rows)}행\n')
                for i in range(0, len(part), CHUNK):
                    fh.write(f"insert into public.{table} ({', '.join(names)}) values\n")
                    fh.write(',\n'.join('  (' + ', '.join(sql_literal(r[n]) for n in names) + ')' for r in part[i:i + CHUNK]))
                    fh.write(';\n')
            written.append(fname)
            file_no += 1
        print(f'{table}: {len(rows)}행')

    os.makedirs(os.path.dirname(RAW_JSON), exist_ok=True)
    with open(RAW_JSON, 'w', encoding='utf-8') as fh:
        json.dump({'source': os.path.basename(xlsx), **snapshot}, fh, ensure_ascii=False, separators=(',', ':'))
    print('SQL:', ', '.join(written))
    print('스냅숏:', os.path.relpath(RAW_JSON, os.path.join(HERE, '..')), f'{os.path.getsize(RAW_JSON) / 1024:.0f}KB')


if __name__ == '__main__':
    main()
