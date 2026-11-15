-- 구독 유지·해지 방어 전략 시뮬레이터: 표 만들기와 읽기 전용 공개 설정
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
