# 구독 유지·해지 방어 전략 시뮬레이터

전략 레버를 움직이면 400개 기업의 유지율·해지율·매출 변화가 지표와 차트에 바로 반영되는 발표 시연용 페이지입니다.
교육용 가상 데이터를 사용하며, 효과 크기는 가정입니다.

React(Vite)로 만들었고 원자료는 Supabase의 표 4개에서 읽습니다. Supabase에 연결할 수 없으면 내장 데이터로 동작합니다.

## 실행

```bash
npm install
cp .env.example .env.local     # VITE_SUPABASE_ANON_KEY를 채운다 (비워 두면 내장 데이터 사용)
npm run dev                    # 개발 서버
npm run build && npm run preview   # 배포본 확인. 인터넷 없이도 이 방식으로 시연할 수 있다
```

주소 뒤에 `?preset=base`(또는 `conservative`, `aggressive`)를 붙이면 그 시나리오로 시작합니다.
슬라이더를 직접 조정하면 주소가 `?salary=44&pause=29…`처럼 레버 값(퍼센트)으로 바뀌므로, 그 주소를 복사하면 같은 상태를 다시 띄우거나 공유할 수 있습니다.

## Supabase 준비

대시보드의 SQL Editor에서 `supabase/` 폴더의 파일을 번호 순서대로 붙여 넣어 실행합니다.

| 파일 | 내용 |
|---|---|
| `01_schema.sql` | 표 4개 만들기, 읽기 전용 공개 설정 (기존 표가 있으면 지우고 다시 만든다) |
| `02_companies.sql` | 기업 400행 |
| `03_payments_1.sql`, `04_payments_2.sql` | 결제 3,698행 |
| `05_usage_logs_1.sql`, `06_usage_logs_2.sql` | 월별 이용 로그 6,974행 |
| `07_churn_requests.sql` | 해지 요청 168행 |

사이트 방문자는 조회만 할 수 있습니다. 값은 대시보드의 Table Editor에서 고치고, 사이트 왼쪽 위의 "다시 불러오기"를 누르면 반영됩니다.

Vercel에는 프로젝트 환경 변수로 `VITE_SUPABASE_URL`과 `VITE_SUPABASE_ANON_KEY`를 넣습니다. 이 키는 브라우저에 공개되는 키이므로 service_role 키를 넣으면 안 됩니다.

### 표와 열

| 표 | 열 (엑셀 열 이름) |
|---|---|
| `companies` | company_id(기업ID), company_name(기업명), industry(업종), size_segment(규모구분), employees(임직원수), region(지역), signup_date(가입일), account_manager(담당영업), plan(가입요금제), billing_cycle(결제주기), payment_method(결제수단) |
| `payments` | payment_id(결제ID), company_id, due_date(결제예정일), plan(요금제), billing_cycle, amount(청구금액), payment_method, status(결제상태), consecutive_failures(연속실패횟수) |
| `usage_logs` | company_id, month(기준월), logins(로그인수), job_posts(공고등록수), talent_searches(인재검색수), salary_views(연봉데이터조회수), review_views(기업리뷰조회수), active_accounts(활성계정수) |
| `churn_requests` | request_id(요청ID), company_id, request_date(해지요청일), churn_kind(해지구분), reason_selected(해지사유_선택), reason_text(해지사유_서술), consulted(상담진행여부), offer(방어제안), outcome(최종결과) |

## 엑셀 원자료에서 다시 만들기

원자료 엑셀(`HR플랫폼_B2B구독_더미데이터.xlsx`)은 이 폴더의 바로 위 폴더에 둡니다.

```bash
cd tools
uv run -q --with pandas --with openpyxl python -I export_raw.py   # supabase/*.sql과 내장 데이터(src/data/raw.json) 다시 만들기
uv run -q --with pandas --with openpyxl python -I build_data.py   # 테스트 기준값(expected_current.json) 다시 만들기
```

## 검증

```bash
npm test                                                                     # 계산, 데이터 정제, 불러오기
cd tools && uv run -q --with pandas --with openpyxl python -I test_build_data.py   # 파이썬 기준 구현
```

`src/lib/buildData.js`(브라우저에서 원자료를 정제)는 `tools/build_data.py`와 같은 결과를 내야 하며, `tools/test_build.mjs`가 두 결과를 비교합니다.

## 구조

| 위치 | 역할 |
|---|---|
| `src/lib/loadData.js` | Supabase에서 표 4개를 읽고, 실패하면 내장 데이터로 대체 |
| `src/lib/buildData.js` | 원자료 정제, 해지 유형 분류, 참고값 계산 |
| `src/lib/sim.js` | 레버 값으로 지표를 계산하는 순수 함수 |
| `src/lib/urlState.js` | 주소의 쿼리와 프리셋·레버 값 변환 |
| `src/lib/chartOptions.js` | 차트 5개의 옵션 |
| `src/App.jsx`, `src/components/` | 화면 |
| `docs/설계안.md` | 설계와 계산식 |
