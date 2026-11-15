# 구독 유지·해지 방어 전략 시뮬레이터

전략 레버를 움직이면 400개 기업의 유지율·해지율·매출 변화가 지표와 차트에 바로 반영되는 발표 시연용 페이지입니다. 교육용 가상 데이터를 사용하며, 효과 크기는 가정입니다.

## 여는 법

`index.html`을 브라우저로 엽니다. 설치나 인터넷 연결이 필요 없습니다.
주소 뒤에 `?preset=base`(또는 `conservative`, `aggressive`)를 붙이면 그 시나리오로 시작합니다.

## 원자료를 바꾼 뒤

원자료 엑셀(`HR플랫폼_B2B구독_더미데이터.xlsx`)은 이 폴더의 바로 위 폴더에 둡니다. 시트 이름과 열 이름은 그대로 두고 값만 고친 뒤 실행합니다.

```bash
cd tools && uv run -q --with pandas --with openpyxl python -I build_data.py   # data.js 다시 만들기
cd .. && vercel --prod                                                        # 다시 배포
```

다른 위치의 파일을 쓰려면 `python -I build_data.py <엑셀 경로>`처럼 경로를 넘깁니다.

## 검증

```bash
cd tools && uv run -q --with pandas --with openpyxl python -I test_build_data.py
node tools/test_sim.mjs
```

설계와 계산식은 `docs/설계안.md`에 있습니다.
