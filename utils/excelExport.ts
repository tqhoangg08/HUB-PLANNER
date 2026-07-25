import { Semester, UserData } from '../types';
import {
    calculateCumulativeStats,
    calculateSemesterStats,
    calculateSubjectAverage,
    calculateRequiredGPA,
    getDegreeClassification,
    getGradeDetails
} from './calculations';

type TranscriptExportScope = 'full' | 'year';

interface TranscriptExcelExportOptions {
    scope?: TranscriptExportScope;
    semesters?: Semester[];
    academicYearLabel?: string;
}

type CellValue = string | number | null | undefined;
type ZipEntry = string | Uint8Array;

interface SheetCell {
    value: CellValue;
    style?: number;
    formula?: string;
    formulaType?: 'number' | 'string';
}

interface AnalysisSheetBuild {
    worksheetXml: string;
}

export interface AdminStudentExcelRow {
    studentCode: string;
    fullName: string;
    className: string;
    majorName: string;
    gpa4: number | null;
    gpa10: number | null;
    credits: number;
    trainingScore: number | null;
    cohort: string;
}

export interface AdminStudentExcelExportOptions {
    rows: AdminStudentExcelRow[];
    academicYearLabel: string;
    semesterLabel: string;
    cohortLabel: string;
    majorLabel: string;
}

const VALID_SEMESTER_NAME_REGEX = /^Học kỳ (1|2|3|Hè) Năm học \d{4}-\d{4}$/;
const HUB_PLANNER_URL = 'https://hotrosinhvienhub.id.vn';
const HUB_PLANNER_LOGO_PATH = '/logo192.png';

const sanitizeFilePart = (value: string) =>
    value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

const extractAcademicYearKey = (label?: string) => {
    if (!label) return null;
    const match = label.match(/(\d{4}-\d{4})/);
    return match ? match[1] : null;
};

const escapeXml = (value: CellValue) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

const columnName = (index: number) => {
    let name = '';
    let value = index;
    while (value > 0) {
        const modulo = (value - 1) % 26;
        name = String.fromCharCode(65 + modulo) + name;
        value = Math.floor((value - modulo) / 26);
    }
    return name;
};

const cellXml = (cell: SheetCell, rowIndex: number, columnIndex: number) => {
    const ref = `${columnName(columnIndex)}${rowIndex}`;
    const style = cell.style !== undefined ? ` s="${cell.style}"` : '';

    if (cell.formula) {
        const formula = `<f>${escapeXml(cell.formula)}</f>`;
        if (cell.formulaType === 'string') {
            return `<c r="${ref}" t="str"${style}>${formula}<v>${escapeXml(cell.value)}</v></c>`;
        }
        return `<c r="${ref}"${style}>${formula}<v>${typeof cell.value === 'number' ? cell.value : ''}</v></c>`;
    }

    if (typeof cell.value === 'number' && Number.isFinite(cell.value)) {
        return `<c r="${ref}"${style}><v>${cell.value}</v></c>`;
    }

    return `<c r="${ref}" t="inlineStr"${style}><is><t>${escapeXml(cell.value)}</t></is></c>`;
};

const buildWorksheetXml = (rows: SheetCell[][], merges: string[], includeLogo: boolean) => {
    const rowXml = rows
        .map((row, rowIndex) => {
            const rowNumber = rowIndex + 1;
            const rowAttrs =
                rowNumber === 1
                    ? ' ht="30" customHeight="1"'
                    : rowNumber === 2
                      ? ' ht="24" customHeight="1"'
                      : rowNumber === 3
                        ? ' ht="34" customHeight="1"'
                        : '';
            const cells = row.map((cell, colIndex) => cellXml(cell, rowNumber, colIndex + 1)).join('');
            return `<row r="${rowNumber}"${rowAttrs}>${cells}</row>`;
        })
        .join('');

    const mergeXml =
        merges.length > 0
            ? `<mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`
            : '';

return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><tabColor rgb="FF003375"/></sheetPr>
<sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A4" sqref="A4"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="18"/>
<cols>
<col min="1" max="1" width="20" customWidth="1"/>
<col min="2" max="2" width="8" customWidth="1"/>
<col min="3" max="3" width="46" customWidth="1"/>
<col min="4" max="4" width="11" customWidth="1"/>
<col min="5" max="5" width="15" customWidth="1"/>
<col min="6" max="6" width="14" customWidth="1"/>
<col min="7" max="7" width="16" customWidth="1"/>
<col min="8" max="8" width="13" customWidth="1"/>
<col min="9" max="12" width="13" customWidth="1"/>
<col min="13" max="13" width="11" customWidth="1"/>
</cols>
<sheetData>${rowXml}</sheetData>
<autoFilter ref="A3:M3"/>
${mergeXml}
<hyperlinks><hyperlink ref="I2" r:id="${includeLogo ? 'rId2' : 'rId1'}" display="Nguồn: HUB Planner"/></hyperlinks>
<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
${includeLogo ? '<drawing r:id="rId1"/>' : ''}
</worksheet>`;
};

const buildStylesXml = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="8">
<font><sz val="12"/><name val="Times New Roman"/></font>
<font><b/><sz val="12"/><name val="Times New Roman"/></font>
<font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Times New Roman"/></font>
<font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Times New Roman"/></font>
<font><i/><sz val="11"/><color rgb="FF475569"/><name val="Times New Roman"/></font>
<font><b/><sz val="12"/><color rgb="FF0F5132"/><name val="Times New Roman"/></font>
<font><u/><sz val="12"/><color rgb="FF0563C1"/><name val="Times New Roman"/></font>
<font><b/><sz val="14"/><color rgb="FF003375"/><name val="Times New Roman"/></font>
</fonts>
<fills count="12">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF003375"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE2F0D9"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEAF4FF"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFCE4D6"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE0F2FE"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="3">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border>
<border><left style="thin"><color rgb="FF94A3B8"/></left><right style="thin"><color rgb="FF94A3B8"/></right><top style="thin"><color rgb="FF94A3B8"/></top><bottom style="medium"><color rgb="FF003375"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="18">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="7" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="4" fillId="8" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="8" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="5" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="9" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="5" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="6" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="7" fillId="10" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="11" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="10" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="4" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyProtection="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/><protection locked="0"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const textCell = (value: CellValue, style = 3): SheetCell => ({ value, style });
const centerCell = (value: CellValue, style = 4): SheetCell => ({ value, style });
const blankCell = (): SheetCell => ({ value: '' });
const numberCell = (value: number | null, style = 4): SheetCell => ({
    value: value === null ? '-' : value,
    style
});
const formulaCell = (formula: string, value: CellValue, style = 4, formulaType: 'number' | 'string' = 'number'): SheetCell => ({
    formula,
    formulaType,
    value,
    style
});

const score10Formula = (row: number) =>
    `IF(OR(I${row}="",J${row}="",K${row}="",L${row}=""),"",ROUND(I${row}*0.1+J${row}*0.2+K${row}*0.2+L${row}*0.5,1))`;

const scale4Formula = (scoreRef: string) =>
    `IF(${scoreRef}="","",IF(${scoreRef}>=9.5,4,IF(${scoreRef}>=9,3.7,IF(${scoreRef}>=8.5,3.4,IF(${scoreRef}>=8,3.2,IF(${scoreRef}>=7.5,3,IF(${scoreRef}>=7,2.8,IF(${scoreRef}>=6.5,2.6,IF(${scoreRef}>=6,2.4,IF(${scoreRef}>=5.5,2.2,IF(${scoreRef}>=5,2,IF(${scoreRef}>=4.5,1.8,IF(${scoreRef}>=4,1.6,0)))))))))))))`;

const letterFormula = (scoreRef: string) =>
    `IF(${scoreRef}="","-",IF(${scoreRef}>=9.5,"A+",IF(${scoreRef}>=9,"A",IF(${scoreRef}>=8.5,"A-",IF(${scoreRef}>=8,"B+",IF(${scoreRef}>=7.5,"B",IF(${scoreRef}>=7,"B-",IF(${scoreRef}>=6.5,"C+",IF(${scoreRef}>=6,"C",IF(${scoreRef}>=5.5,"C-",IF(${scoreRef}>=5,"D+",IF(${scoreRef}>=4.5,"D",IF(${scoreRef}>=4,"D-","F")))))))))))))`;

const passFailFormula = (scoreRef: string) => `IF(${scoreRef}="","-",IF(${scoreRef}<4,"Rớt","Đạt"))`;

const classificationFormula = (gpaRef: string) =>
    `IF(${gpaRef}="","-",IF(${gpaRef}>=3.6,"Xuất sắc",IF(${gpaRef}>=3.2,"Giỏi",IF(${gpaRef}>=2.5,"Khá",IF(${gpaRef}>=2,"Trung bình",IF(${gpaRef}>=1,"Yếu","Kém"))))))`;

const weightedAverageFormula = (valueColumn: string, creditColumn: string, includeColumn: string, startRow: number, endRow: number, totalCreditRef: string) =>
    `IF(${totalCreditRef}=0,"",ROUND(SUMPRODUCT(${valueColumn}${startRow}:${valueColumn}${endRow},${creditColumn}${startRow}:${creditColumn}${endRow},${includeColumn}${startRow}:${includeColumn}${endRow})/${totalCreditRef},2))`;

const buildRows = (data: UserData, semesters: Semester[], academicYearLabel?: string) => {
    const rows: SheetCell[][] = [];
    const merges: string[] = [];
    const stats = calculateCumulativeStats(semesters);
    const title = academicYearLabel ? `BẢNG ĐIỂM ${academicYearLabel.toUpperCase()}` : 'BẢNG ĐIỂM TOÀN KHÓA';
    const emptyWideRow = () => Array.from({ length: 13 }, () => blankCell());

    rows.push([{ value: title, style: 1 }, ...emptyWideRow().slice(1)]);
    merges.push('A1:M1');
    rows.push([
        { value: `Họ tên: ${data.studentName || '-'}`, style: 12 },
        blankCell(),
        { value: `Khóa: ${data.cohort || '-'}`, style: 12 },
        blankCell(),
        { value: `Ngành: ${data.majorName || '-'}`, style: 12 },
        blankCell(),
        { value: `Chuyên ngành: ${data.specializationName || '-'}`, style: 12 },
        blankCell(),
        { value: 'Nguồn: HUB Planner', style: 13 },
        blankCell(),
        blankCell(),
        blankCell(),
        blankCell()
    ]);
    merges.push('A2:B2', 'C2:D2', 'E2:F2', 'G2:H2');
    rows.push([
        { value: 'HỌC KỲ', style: 2 },
        { value: 'STT', style: 2 },
        { value: 'TÊN HỌC PHẦN', style: 2 },
        { value: 'TÍN CHỈ', style: 2 },
        { value: 'THANG ĐIỂM 10', style: 2 },
        { value: 'THANG ĐIỂM 4', style: 2 },
        { value: 'THANG ĐIỂM CHỮ', style: 2 },
        { value: 'XẾP LOẠI', style: 2 },
        { value: 'CC 10%', style: 2 },
        { value: 'QUÁ TRÌNH 20%', style: 2 },
        { value: 'GIỮA KỲ 20%', style: 2 },
        { value: 'CUỐI KỲ 50%', style: 2 },
        { value: 'TÍNH GPA', style: 2 }
    ]);

    const subjectRows: number[] = [];

    semesters.forEach((semester, semesterIndex) => {
        const startRow = rows.length + 1;
        const semesterStyle = semesterIndex % 2 === 0 ? 10 : 6;

        semester.subjects.forEach((subject, index) => {
            const rowNumber = rows.length + 1;
            const avg10 = calculateSubjectAverage(subject);
            const { scale4, letter } = avg10 !== null ? getGradeDetails(avg10) : { scale4: null, letter: '-' };
            const status = avg10 === null ? '-' : avg10 < 4 ? 'Rớt' : 'Đạt';
            subjectRows.push(rowNumber);

            rows.push([
                centerCell(index === 0 ? semester.name : '', semesterStyle),
                centerCell(index + 1),
                textCell(`${subject.name}${subject.isNonGPA ? ' (*)' : ''}`),
                centerCell(subject.credits),
                formulaCell(score10Formula(rowNumber), avg10 ?? '', 4),
                formulaCell(scale4Formula(`E${rowNumber}`), scale4 ?? '', 4),
                formulaCell(letterFormula(`E${rowNumber}`), letter, 4, 'string'),
                formulaCell(passFailFormula(`E${rowNumber}`), status, 4, 'string'),
                centerCell(subject.scoreCC ?? '', 8),
                centerCell(subject.scoreProcess ?? '', 8),
                centerCell(subject.scoreMid ?? '', 8),
                centerCell(subject.scoreFinal ?? '', 8),
                centerCell(subject.isNonGPA ? 0 : 1, 9)
            ]);
        });

        const subjectEndRow = rows.length;
        const summaryRow = rows.length + 1;
        const hasSubjectRows = subjectEndRow >= startRow;
        const totalCreditsFormula = hasSubjectRows ? `SUMPRODUCT(D${startRow}:D${subjectEndRow},M${startRow}:M${subjectEndRow})` : '0';
        const semesterGpa10Formula = hasSubjectRows
            ? weightedAverageFormula('E', 'D', 'M', startRow, subjectEndRow, `D${summaryRow}`)
            : '""';
        const semesterGpa4Formula = hasSubjectRows
            ? weightedAverageFormula('F', 'D', 'M', startRow, subjectEndRow, `D${summaryRow}`)
            : '""';
        const semStats = calculateSemesterStats(semester.subjects);

        rows.push([
            centerCell(semester.subjects.length === 0 ? semester.name : '', semesterStyle),
            centerCell(''),
            { value: 'TRUNG BÌNH KỲ', style: 5 },
            formulaCell(totalCreditsFormula, semStats.totalCredits, 5),
            formulaCell(semesterGpa10Formula, semStats.hasData ? semStats.gpa10 : '', 5),
            formulaCell(semesterGpa4Formula, semStats.hasData ? semStats.gpa4 : '', 5),
            formulaCell(classificationFormula(`F${summaryRow}`), semStats.hasData ? getDegreeClassification(semStats.rawGPA4) : '-', 5, 'string'),
            centerCell(`ĐRL: ${semester.trainingScore ?? '-'}`, 5),
            ...Array.from({ length: 5 }, () => centerCell('', 5))
        ]);

        const endRow = rows.length;
        if (endRow > startRow) merges.push(`A${startRow}:A${endRow}`);
    });

    const firstSubjectRow = subjectRows[0] ?? 4;
    const lastSubjectRow = subjectRows[subjectRows.length - 1] ?? firstSubjectRow;
    const cumulativeRow = rows.length + 1;
    const cumulativeTotalCreditsFormula = subjectRows.length > 0
        ? `SUMPRODUCT(D${firstSubjectRow}:D${lastSubjectRow},M${firstSubjectRow}:M${lastSubjectRow})`
        : '0';
    const cumulativePassedCreditsFormula = subjectRows.length > 0
        ? `SUMPRODUCT(D${firstSubjectRow}:D${lastSubjectRow},M${firstSubjectRow}:M${lastSubjectRow},--(E${firstSubjectRow}:E${lastSubjectRow}>=4))`
        : '0';

    rows.push([
        centerCell(''),
        centerCell(''),
        { value: 'TRUNG BÌNH TÍCH LŨY', style: 11 },
        formulaCell(cumulativeTotalCreditsFormula, stats.totalCredits, 11),
        formulaCell(
            subjectRows.length > 0
                ? weightedAverageFormula('E', 'D', 'M', firstSubjectRow, lastSubjectRow, `D${cumulativeRow}`)
                : '""',
            stats.hasData ? stats.gpa10 : '',
            11
        ),
        formulaCell(
            subjectRows.length > 0
                ? weightedAverageFormula('F', 'D', 'M', firstSubjectRow, lastSubjectRow, `D${cumulativeRow}`)
                : '""',
            stats.hasData ? stats.gpa4 : '',
            11
        ),
        formulaCell(classificationFormula(`F${cumulativeRow}`), stats.hasData ? getDegreeClassification(stats.rawGPA4) : '-', 11, 'string'),
        formulaCell(`"Đạt: "&${cumulativePassedCreditsFormula}`, `Đạt: ${stats.passedCredits}`, 11, 'string'),
        ...Array.from({ length: 5 }, () => centerCell('', 11))
    ]);
    rows.push([{ value: 'Ghi chú: E = ROUND(I*0.1 + J*0.2 + K*0.2 + L*0.5, 1). F/G/H dùng IF theo thang điểm HUB. M = 0 nghĩa là môn không tính GPA.', style: 7 }, ...emptyWideRow().slice(1)]);
    merges.push(`A${rows.length}:M${rows.length}`);

    return { rows, merges };
};

const buildRowsXml = (rows: SheetCell[][]) =>
    rows
        .map((row, rowIndex) => {
            const rowNumber = rowIndex + 1;
            const rowAttrs =
                rowNumber === 1
                    ? ' ht="30" customHeight="1"'
                    : rowNumber === 2
                      ? ' ht="24" customHeight="1"'
                      : rowNumber === 3
                        ? ' ht="34" customHeight="1"'
                        : '';
            const cells = row.map((cell, colIndex) => cellXml(cell, rowNumber, colIndex + 1)).join('');
            return `<row r="${rowNumber}"${rowAttrs}>${cells}</row>`;
        })
        .join('');

const buildMergesXml = (merges: string[]) =>
    merges.length > 0
        ? `<mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`
        : '';

const buildLogoDrawingXml = (name: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<xdr:twoCellAnchor editAs="oneCell">
<xdr:from><xdr:col>0</xdr:col><xdr:colOff>91440</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>91440</xdr:rowOff></xdr:from>
<xdr:to><xdr:col>1</xdr:col><xdr:colOff>548640</xdr:colOff><xdr:row>2</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
<xdr:pic>
<xdr:nvPicPr><xdr:cNvPr id="2" name="${escapeXml(name)}"/><xdr:cNvPicPr/></xdr:nvPicPr>
<xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>
<xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>
</xdr:pic>
<xdr:clientData/>
</xdr:twoCellAnchor>
</xdr:wsDr>`;

const buildAnalysisSheet = (data: UserData, semesters: Semester[], includeLogo: boolean): AnalysisSheetBuild => {
    const rows: SheetCell[][] = [];
    const merges: string[] = [];
    const stats = calculateCumulativeStats(semesters);
    const targetGPA = data.targetGPA || 3.2;
    const totalCreditsRequired = data.totalCreditsRequired || 125;
    const semesterRows = semesters
        .map((semester) => {
            const semStats = calculateSemesterStats(semester.subjects);
            return { semester, semStats };
        })
        .filter(({ semStats }) => semStats.hasData);

    const emptyRow = () => Array.from({ length: 8 }, () => blankCell());
    const sheet = "'Bảng điểm'";
    const score10Range = `${sheet}!E4:E1000`;
    const letterRange = `${sheet}!G4:G1000`;
    const statusRange = `${sheet}!H4:H1000`;
    const gradeClassFormula = classificationFormula('B5');
    const requiredGpaFormula = `IF(B5>=F6,"Đã đạt",IF(D6-B6<=0,"Không đủ tín chỉ còn lại",ROUND(MAX(0,(F6*D6-B5*B6)/(D6-B6)),2)))`;
    const feasibleFormula = `IF(B7="Đã đạt","Đã đạt",IF(B7="Không đủ tín chỉ còn lại","Không khả thi",IF(B7<=4,"Có thể","Khó")))`;

    rows.push([{ value: 'PHÂN TÍCH & DỰ BÁO HỌC TẬP', style: 1 }, ...emptyRow().slice(1)]);
    merges.push('A1:H1');
    rows.push([{ value: 'Nguồn: HUB Planner', style: 13 }, ...emptyRow().slice(1)]);
    merges.push('A2:H2');
    rows.push(emptyRow());
    rows.push([{ value: 'TỔNG QUAN', style: 14 }, ...emptyRow().slice(1)]);
    merges.push('A4:H4');
    rows.push([textCell('GPA tích lũy hệ 4', 15), centerCell(Number(stats.rawGPA4.toFixed(2)), 17), textCell('GPA tích lũy hệ 10', 15), centerCell(stats.gpa10, 17), textCell('Loại tốt nghiệp hiện tại', 15), formulaCell(gradeClassFormula, '', 14, 'string'), blankCell(), blankCell()]);
    rows.push([textCell('Tín chỉ đạt', 15), centerCell(stats.passedCredits, 17), textCell('Tổng tín chỉ yêu cầu', 15), centerCell(totalCreditsRequired, 17), textCell('Mục tiêu GPA', 15), centerCell(targetGPA, 17), blankCell(), blankCell()]);
    rows.push([
        textCell('GPA cần cho phần còn lại', 15),
        formulaCell(requiredGpaFormula, '', 14, 'string'),
        textCell('Tín chỉ còn lại', 15),
        formulaCell('MAX(0,D6-B6)', '', 14),
        textCell('Khả thi?', 15),
        formulaCell(feasibleFormula, '', 14, 'string'),
        blankCell(),
        blankCell()
    ]);
    rows.push([textCell('Nhận xét tự động', 15), formulaCell(`IF(B7="Đã đạt","GPA hiện tại đã đạt hoặc vượt mục tiêu.",IF(F7="Có thể","Cần GPA trung bình khoảng "&TEXT(B7,"0.00")&" cho phần còn lại để đạt mục tiêu "&TEXT(F6,"0.00")&".",IF(F7="Khó","Mục tiêu hiện tại rất khó vì GPA cần vượt 4.00.","Không còn đủ tín chỉ để kéo GPA lên mục tiêu.")))`, '', 15, 'string'), ...emptyRow().slice(2)]);
    merges.push('B8:H8');
    rows.push(emptyRow());

    rows.push([{ value: 'DỮ LIỆU BIỂU ĐỒ GPA THEO KỲ', style: 14 }, ...emptyRow().slice(1)]);
    merges.push('A10:H10');
    rows.push([{ value: 'Học kỳ', style: 2 }, { value: 'GPA hệ 4', style: 2 }, { value: 'GPA hệ 10', style: 2 }, { value: 'Tín chỉ', style: 2 }, { value: 'ĐRL', style: 2 }, blankCell(), blankCell(), blankCell()]);
    semesterRows.forEach(({ semester, semStats }) => {
        rows.push([
            textCell(semester.name, 3),
            centerCell(Number(semStats.rawGPA4.toFixed(2)), 4),
            centerCell(semStats.gpa10, 4),
            centerCell(semStats.totalCredits, 4),
            centerCell(semester.trainingScore ?? '-', 4),
            blankCell(),
            blankCell(),
            blankCell()
        ]);
    });
    rows.push(emptyRow());
    rows.push([{ value: 'DỮ LIỆU BIỂU ĐỒ PHÂN BỐ ĐIỂM CHỮ', style: 14 }, ...emptyRow().slice(1)]);
    merges.push(`A${rows.length}:H${rows.length}`);
    rows.push([{ value: 'Nhóm điểm', style: 2 }, { value: 'Số môn', style: 2 }, { value: 'Tỷ lệ', style: 2 }, blankCell(), blankCell(), blankCell(), blankCell(), blankCell()]);
    const gradeDataStart = rows.length + 1;
    const gradeDataEnd = gradeDataStart + 4;
    ['A', 'B', 'C', 'D', 'F'].forEach((grade) => {
        const row = rows.length + 1;
        const criteria = grade === 'A' ? 'A*' : grade === 'B' ? 'B*' : grade === 'C' ? 'C*' : grade === 'D' ? 'D*' : 'F';
        rows.push([
            textCell(grade, 3),
            formulaCell(`COUNTIF(${letterRange},"${criteria}")`, '', 4),
            formulaCell(`IF(SUM(B$${gradeDataStart}:B$${gradeDataEnd})=0,0,B${row}/SUM(B$${gradeDataStart}:B$${gradeDataEnd}))`, '', 4),
            blankCell(),
            blankCell(),
            blankCell(),
            blankCell()
        ]);
    });
    rows.push(emptyRow());
    rows.push([{ value: 'CẢNH BÁO & GỢI Ý', style: 14 }, ...emptyRow().slice(1)]);
    merges.push(`A${rows.length}:H${rows.length}`);
    rows.push([textCell('Số môn rớt', 15), formulaCell(`COUNTIF(${statusRange},"Rớt")`, '', 14), textCell('Môn cần cải thiện (4.0-5.4)', 15), formulaCell(`COUNTIFS(${score10Range},">=4",${score10Range},"<5.5")`, '', 14), textCell('Môn A/A+', 15), formulaCell(`COUNTIF(${letterRange},"A*")`, '', 14), blankCell(), blankCell()]);
    rows.push([textCell('Tiến độ tín chỉ', 15), formulaCell(`IF(D6=0,"",TEXT(B6/D6,"0%"))`, '', 15, 'string'), ...emptyRow().slice(2)]);
    merges.push(`B${rows.length}:H${rows.length}`);

    const worksheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><tabColor rgb="FF0F766E"/></sheetPr>
<sheetViews><sheetView workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A3" sqref="A3"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="20"/>
<cols><col min="1" max="1" width="30" customWidth="1"/><col min="2" max="2" width="16" customWidth="1"/><col min="3" max="3" width="24" customWidth="1"/><col min="4" max="4" width="16" customWidth="1"/><col min="5" max="8" width="18" customWidth="1"/></cols>
<sheetData>${buildRowsXml(rows)}</sheetData>
<sheetProtection sheet="1" objects="1" scenarios="1"/>
${buildMergesXml(merges)}
<hyperlinks><hyperlink ref="A2" r:id="${includeLogo ? 'rId2' : 'rId1'}" display="Nguồn: HUB Planner"/></hyperlinks>
<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
${includeLogo ? '<drawing r:id="rId1"/>' : ''}
</worksheet>`;
    return {
        worksheetXml
    };
};

const crcTable = (() => {
    const table: number[] = [];
    for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c >>> 0;
    }
    return table;
})();

const crc32 = (bytes: Uint8Array) => {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
        crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
};

const writeUint16 = (target: number[], value: number) => {
    target.push(value & 0xff, (value >>> 8) & 0xff);
};

const writeUint32 = (target: number[], value: number) => {
    target.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
};

const appendBytes = (target: number[], bytes: ArrayLike<number>) => {
    // Do not spread large worksheet XML buffers into Array.push().
    // A workbook with many students can exceed the JavaScript argument stack.
    for (let index = 0; index < bytes.length; index += 1) {
        target.push(bytes[index]);
    }
};

const createZip = (files: Record<string, ZipEntry>) => {
    const encoder = new TextEncoder();
    const output: number[] = [];
    const centralDirectory: number[] = [];

    Object.entries(files).forEach(([name, content]) => {
        const nameBytes = encoder.encode(name);
        const dataBytes = typeof content === 'string' ? encoder.encode(content) : content;
        const crc = crc32(dataBytes);
        const localHeaderOffset = output.length;

        writeUint32(output, 0x04034b50);
        writeUint16(output, 20);
        writeUint16(output, 0);
        writeUint16(output, 0);
        writeUint16(output, 0);
        writeUint16(output, 0);
        writeUint32(output, crc);
        writeUint32(output, dataBytes.length);
        writeUint32(output, dataBytes.length);
        writeUint16(output, nameBytes.length);
        writeUint16(output, 0);
        appendBytes(output, nameBytes);
        appendBytes(output, dataBytes);

        writeUint32(centralDirectory, 0x02014b50);
        writeUint16(centralDirectory, 20);
        writeUint16(centralDirectory, 20);
        writeUint16(centralDirectory, 0);
        writeUint16(centralDirectory, 0);
        writeUint16(centralDirectory, 0);
        writeUint16(centralDirectory, 0);
        writeUint32(centralDirectory, crc);
        writeUint32(centralDirectory, dataBytes.length);
        writeUint32(centralDirectory, dataBytes.length);
        writeUint16(centralDirectory, nameBytes.length);
        writeUint16(centralDirectory, 0);
        writeUint16(centralDirectory, 0);
        writeUint16(centralDirectory, 0);
        writeUint16(centralDirectory, 0);
        writeUint32(centralDirectory, 0);
        writeUint32(centralDirectory, localHeaderOffset);
        appendBytes(centralDirectory, nameBytes);
    });

    const centralDirectoryOffset = output.length;
    appendBytes(output, centralDirectory);
    writeUint32(output, 0x06054b50);
    writeUint16(output, 0);
    writeUint16(output, 0);
    writeUint16(output, Object.keys(files).length);
    writeUint16(output, Object.keys(files).length);
    writeUint32(output, centralDirectory.length);
    writeUint32(output, centralDirectoryOffset);
    writeUint16(output, 0);

    return new Uint8Array(output);
};

const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
};

const buildAdminStudentWorksheetXml = (options: AdminStudentExcelExportOptions) => {
    const title = 'DANH SÁCH KẾT QUẢ HỌC TẬP SINH VIÊN';
    const filterSummary = [
        `Năm học: ${options.academicYearLabel}`,
        `Học kỳ: ${options.semesterLabel}`,
        `Khóa: ${options.cohortLabel}`,
        `Ngành: ${options.majorLabel}`
    ].join('  |  ');
    const headers = [
        'STT',
        'MSSV',
        'Họ và tên',
        'Lớp',
        'Ngành học',
        'Điểm TBCHT (thang 4)',
        'Điểm TBCHT (thang 10)',
        'Số TC',
        'Điểm RL',
        'Khóa'
    ];
    const rows: SheetCell[][] = [
        [{ value: title, style: 1 }, ...Array.from({ length: 9 }, blankCell)],
        [{ value: filterSummary, style: 7 }, ...Array.from({ length: 9 }, blankCell)],
        headers.map(header => ({ value: header, style: 2 })),
        ...options.rows.map((student, index) => [
            centerCell(index + 1),
            centerCell(student.studentCode || '-'),
            textCell(student.fullName || '-'),
            centerCell(student.className || '-'),
            textCell(student.majorName || '-'),
            numberCell(student.gpa4, 4),
            numberCell(student.gpa10, 4),
            centerCell(student.credits),
            numberCell(student.trainingScore, 4),
            centerCell(student.cohort || '-')
        ])
    ];
    const rowXml = rows.map((row, rowIndex) => {
        const rowNumber = rowIndex + 1;
        const height = rowNumber === 1 ? 30 : rowNumber === 2 ? 24 : rowNumber === 3 ? 38 : 22;
        const cells = row.map((cell, columnIndex) => cellXml(cell, rowNumber, columnIndex + 1)).join('');
        return `<row r="${rowNumber}" ht="${height}" customHeight="1">${cells}</row>`;
    }).join('');
    const lastRow = Math.max(3, rows.length);

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetPr><tabColor rgb="FF003375"/></sheetPr>
<sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A4" sqref="A4"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="22"/>
<cols>
<col min="1" max="1" width="7" customWidth="1"/>
<col min="2" max="2" width="17" customWidth="1"/>
<col min="3" max="3" width="30" customWidth="1"/>
<col min="4" max="4" width="18" customWidth="1"/>
<col min="5" max="5" width="30" customWidth="1"/>
<col min="6" max="7" width="20" customWidth="1"/>
<col min="8" max="8" width="11" customWidth="1"/>
<col min="9" max="9" width="13" customWidth="1"/>
<col min="10" max="10" width="12" customWidth="1"/>
</cols>
<sheetData>${rowXml}</sheetData>
<autoFilter ref="A3:J${lastRow}"/>
<mergeCells count="2"><mergeCell ref="A1:J1"/><mergeCell ref="A2:J2"/></mergeCells>
<printOptions horizontalCentered="1"/>
<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
<pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
};

export const exportAdminStudentListToExcel = (options: AdminStudentExcelExportOptions) => {
    const now = new Date().toISOString();
    const files: Record<string, ZipEntry> = {
        '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
        '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>',
        'docProps/app.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>HUB Planner</Application></Properties>',
        'docProps/core.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>HUB Planner</dc:creator><cp:lastModifiedBy>HUB Planner</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`,
        'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Danh sách sinh viên" sheetId="1" r:id="rId1"/></sheets></workbook>',
        'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
        'xl/styles.xml': buildStylesXml(),
        'xl/worksheets/sheet1.xml': buildAdminStudentWorksheetXml(options)
    };
    const zipBytes = createZip(files);
    const blob = new Blob([zipBytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const scopeName = sanitizeFilePart([
        options.academicYearLabel,
        options.semesterLabel,
        options.cohortLabel,
        options.majorLabel
    ].filter(label => label && !label.toLowerCase().startsWith('tất cả')).join('_'));
    downloadBlob(blob, `Danh_Sach_Sinh_Vien${scopeName ? `_${scopeName}` : ''}.xlsx`);
};

const loadLogoBytes = async () => {
    try {
        const response = await fetch(HUB_PLANNER_LOGO_PATH);
        if (!response.ok) return null;
        return new Uint8Array(await response.arrayBuffer());
    } catch {
        return null;
    }
};

export const exportTranscriptToExcel = async (data: UserData, options: TranscriptExcelExportOptions = {}) => {
    const scope = options.scope ?? 'full';
    const isYearExport = scope === 'year';
    const selectedAcademicYear = options.academicYearLabel ?? null;
    const validDataSemesters = (options.semesters ?? data.semesters).filter((semester) =>
        VALID_SEMESTER_NAME_REGEX.test(semester.name)
    );

    if (validDataSemesters.length === 0) {
        alert(
            isYearExport
                ? `Không có dữ liệu học kỳ hợp lệ để xuất Excel cho ${selectedAcademicYear ?? 'năm học đã chọn'}.`
                : 'Chưa có dữ liệu học kỳ hợp lệ để xuất Excel.'
        );
        return;
    }

    const logoBytes = await loadLogoBytes();
    const includeLogo = Boolean(logoBytes);
    const { rows, merges } = buildRows(data, validDataSemesters, selectedAcademicYear ?? undefined);
    const worksheetXml = buildWorksheetXml(rows, merges, includeLogo);
    const analysisSheet = buildAnalysisSheet(data, validDataSemesters, includeLogo);
    const now = new Date().toISOString();
    const logoContentType = includeLogo ? '<Default Extension="png" ContentType="image/png"/>' : '';
    const drawingContentTypes = includeLogo
        ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/><Override PartName="/xl/drawings/drawing2.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>'
        : '';
    const files: Record<string, ZipEntry> = {
        '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${logoContentType}<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${drawingContentTypes}</Types>`,
        '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
        'docProps/app.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>HUB Planner</Application></Properties>`,
        'docProps/core.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>HUB Planner</dc:creator><cp:lastModifiedBy>HUB Planner</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`,
        'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookProtection lockStructure="1"/><sheets><sheet name="Bảng điểm" sheetId="1" r:id="rId1"/><sheet name="Phân tích" sheetId="2" r:id="rId2"/></sheets><calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1"/></workbook>`,
        'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
        'xl/styles.xml': buildStylesXml(),
        'xl/worksheets/sheet1.xml': worksheetXml,
        'xl/worksheets/sheet2.xml': analysisSheet.worksheetXml,
        'xl/worksheets/_rels/sheet1.xml.rels': includeLogo
            ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${HUB_PLANNER_URL}" TargetMode="External"/></Relationships>`
            : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${HUB_PLANNER_URL}" TargetMode="External"/></Relationships>`,
        'xl/worksheets/_rels/sheet2.xml.rels': includeLogo
            ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing2.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${HUB_PLANNER_URL}" TargetMode="External"/></Relationships>`
            : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${HUB_PLANNER_URL}" TargetMode="External"/></Relationships>`
    };

    if (includeLogo && logoBytes) {
        files['xl/media/logo192.png'] = logoBytes;
        files['xl/drawings/drawing1.xml'] = buildLogoDrawingXml('HUB Planner logo - Bảng điểm');
        files['xl/drawings/drawing2.xml'] = buildLogoDrawingXml('HUB Planner logo - Phân tích');
        files['xl/drawings/_rels/drawing1.xml.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo192.png"/></Relationships>`;
        files['xl/drawings/_rels/drawing2.xml.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo192.png"/></Relationships>`;
    }

    const safeFileName = sanitizeFilePart(data.studentName || 'Bang_Diem') || 'Bang_Diem';
    const academicYearKey = extractAcademicYearKey(selectedAcademicYear || '');
    const exportFileSuffix =
        isYearExport && academicYearKey
            ? `Bang_Diem_${sanitizeFilePart(academicYearKey)}`
            : 'Bang_Diem_Toan_Khoa';

    const zipBytes = createZip(files);
    const blob = new Blob([zipBytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    downloadBlob(blob, `${safeFileName}_${exportFileSuffix}.xlsx`);
};
