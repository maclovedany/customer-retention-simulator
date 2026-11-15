"""build_data.py 검증. 실행: uv run -q --with pandas --with openpyxl python -I test_build_data.py"""
import os
import shutil
import sys
import tempfile
from collections import Counter

import openpyxl

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_data import build  # noqa: E402

from build_data import DEFAULT_XLSX as ORIG  # noqa: E402
TMP = tempfile.mkdtemp()


def edited_copy(name, edit):
    """원본을 임시 폴더에 복사한 뒤 4_해지요청 시트를 edit(ws, 열이름→열번호)로 고친다."""
    path = os.path.join(TMP, name)
    shutil.copy(ORIG, path)
    wb = openpyxl.load_workbook(path)
    ws = wb['4_해지요청']
    cols = {c.value: c.column for c in ws[1]}
    edit(ws, cols)
    wb.save(path)
    return path


def test_current_file():
    d = build(ORIG)
    churned = [f for f in d['firms'] if f['churned']]
    assert len(d['firms']) == 400 and len(churned) == 137
    assert round(sum(f['mrr'] for f in churned) / 1e4) == 9731
    types = Counter(f['type'] for f in churned)
    assert types == {'결제 실패형': 31, '채용 종료형': 40, '비용 절감형': 29,
                     '지원 불만형': 24, '결제·계약 불편형': 10, '기타': 3}, types
    assert sum(1 for f in churned if f['voluntary'] and not f['consulted']) == 54
    assert len(d['meta']['months']) == 24
    assert d['monthly'][0] == {'month': '2024-11', 'active': 245, 'churned': 0}, d['monthly'][0]
    assert d['renewalsDue'] == 261, d['renewalsDue']
    assert d['requests'] == {'voluntary': 137, 'consulted': 83, 'saved': 31}, d['requests']
    r = d['refs']
    got = [round(r[k], 2) for k in ('consultRate', 'saveRate', 'rechurnRate', 'payRecoveryRate',
                                    'salaryReduction', 'annualFactor', 'alertRecall')]
    assert got == [0.61, 0.37, 0.23, 0.46, 0.44, 0.69, 0.66], got
    assert all('name' not in f and '기업명' not in f for f in d['firms'])
    assert all(f['type'] is None and f['churnMonth'] is None for f in d['firms'] if not f['churned'])


def test_flip_one_churn():
    def edit(ws, cols):
        ids = [ws.cell(r, cols['기업ID']).value for r in range(2, ws.max_row + 1)]
        once = {i for i, n in Counter(ids).items() if n == 1}
        for r in range(2, ws.max_row + 1):
            if ws.cell(r, cols['기업ID']).value in once and ws.cell(r, cols['최종결과']).value == '해지 확정':
                ws.cell(r, cols['최종결과']).value = '방어 성공(유지)'
                return
    d = build(edited_copy('flip.xlsx', edit))
    assert sum(f['churned'] for f in d['firms']) == 136


def test_unknown_description():
    target = {}

    def edit(ws, cols):
        for r in range(2, ws.max_row + 1):
            if (ws.cell(r, cols['해지구분']).value == '자발' and ws.cell(r, cols['최종결과']).value == '해지 확정'
                    and ws.cell(r, cols['해지사유_선택']).value == '비용 부담'):
                ws.cell(r, cols['해지사유_서술']).value = '새로운 문장입니다'
                target['id'] = ws.cell(r, cols['기업ID']).value
                return
    d = build(edited_copy('unknown.xlsx', edit))
    firm = next(f for f in d['firms'] if f['id'] == target['id'])
    assert firm['type'] == '비용 절감형', firm
    assert d['meta']['unknownDescriptions'] == 1


def test_missing_column():
    path = edited_copy('missing.xlsx', lambda ws, cols: ws.delete_cols(cols['최종결과']))
    try:
        build(path)
    except SystemExit as e:
        assert '4_해지요청' in str(e) and '최종결과' in str(e), str(e)
    else:
        raise AssertionError('SystemExit이 발생해야 한다')


def test_no_consulted_requests():
    def edit(ws, cols):
        for r in range(2, ws.max_row + 1):
            ws.cell(r, cols['상담진행여부']).value = 'N'
    d = build(edited_copy('noconsult.xlsx', edit))
    assert d['refs']['saveRate'] is None and d['refs']['consultRate'] == 0


if __name__ == '__main__':
    try:
        for name, fn in list(globals().items()):
            if name.startswith('test_'):
                fn()
                print('pass', name)
    finally:
        shutil.rmtree(TMP, ignore_errors=True)
    print('OK')
