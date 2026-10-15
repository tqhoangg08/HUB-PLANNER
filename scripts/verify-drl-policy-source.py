"""Read-only verification against the owner-provided DOCX; never copies it into Git."""
import hashlib
import json
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

source = Path(sys.argv[1])
data = (Path(__file__).resolve().parent.parent / 'utils/drlPolicy2026.ts').read_text(encoding='utf8')
expected_hash = re.search(r'export const DRL_SOURCE_SHA256 = "([a-f0-9]+)"', data).group(1)
assert hashlib.sha256(source.read_bytes()).hexdigest() == expected_hash, 'Source DOCX hash differs; review required'
ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
with zipfile.ZipFile(source) as archive:
    root = ET.fromstring(archive.read('word/document.xml'))
rows = [[ ''.join(t.text or '' for t in cell.findall('.//w:t', ns))
         for cell in row.findall('w:tc', ns)]
        for row in root.findall('.//w:body/w:tbl', ns)[-1].findall('w:tr', ns)]
expected_rows = json.loads(re.search(r'export const DRL_APPENDIX_ROWS = (.*?) as const;', data, re.S).group(1))
assert rows == expected_rows, 'Appendix transcription differs'
text = '\n'.join(t.text or '' for t in root.findall('.//w:t', ns))
for fragment in ['5549/QĐ-ĐHNH', '02 tháng 10 năm 2026', '2026 - 2027']:
    assert fragment in text, f'Missing decision/effective-year marker: {fragment}'
notes = json.loads(re.search(r'export const DRL_NOTES = (.*?) as const;', data, re.S).group(1))
paragraphs = [''.join(t.text or '' for t in p.findall('.//w:t', ns)) for p in root.findall('.//w:p', ns)]
for note in notes:
    assert any(note in paragraph for paragraph in paragraphs), 'Source note differs'
start = next(i for i, p in enumerate(paragraphs) if p.startswith('Điều 8.'))
end = next(i for i, p in enumerate(paragraphs) if p.startswith('Điều 9.'))
special = json.loads(re.search(r'export const DRL_SPECIAL_CASES = (.*?) as const;', data, re.S).group(1))
assert paragraphs[start + 1:end] == special, 'Article 8 special-case transcription differs'
print(json.dumps({'source_hash_verified': True, 'appendix_rows_verified': len(rows), 'notes_verified': len(notes), 'special_cases_verified': len(special)}, ensure_ascii=True))
