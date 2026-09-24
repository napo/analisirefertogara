"""Read-only extraction of the supplied workbook; no changes to the XLSX."""
import json
from pathlib import Path
import openpyxl

root = Path(__file__).resolve().parents[2]
book = openpyxl.load_workbook(root / 'Analisi Referto di gara di Andrea Fortunati.xlsx')
target = root / 'webapp/src/data'
target.mkdir(exist_ok=True)
data = {sheet.title: {cell.coordinate: cell.value for row in sheet for cell in row
                     if cell.value is not None} for sheet in book}
(target / 'workbook.json').write_text(json.dumps(data, ensure_ascii=False, default=str))
print('Extracted', sum(isinstance(v, str) and v.startswith('=') for s in data.values() for v in s.values()), 'formulas')
