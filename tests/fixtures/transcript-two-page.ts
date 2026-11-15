import type { PositionedPdfRow } from '../../utils/hubTranscriptParser.ts';

// Entirely synthetic: no student identity, actual course code, or actual grade.
export const transcriptRow = (pageNumber: number, y: number, cells: Array<[string, number]>): PositionedPdfRow => ({
    pageNumber, y,
    items: cells.map(([text, x]) => ({ text, x, y, width: Math.min(100, text.length * 3) })),
    text: cells.map(([text]) => text).join(' | '),
});
export const transcriptHeader = (page: number, y: number) => transcriptRow(page, y, [
    ['STT', 169], ['Mã học phần', 190], ['Tên học phần', 244], ['Tín chỉ', 400],
    ['Loại môn học', 431], ['Tổng điểm', 478], ['Kết quả', 515], ['Chi tiết', 546],
]);

export const twoPageTranscriptFixture = (startYear = 2031): PositionedPdfRow[] => {
    const rows: PositionedPdfRow[] = [];
    let page = 1, y = 740;
    const add = (cells: Array<[string, number]>) => { rows.push(transcriptRow(page, y, cells)); y -= 14; };
    for (const [term, count] of [11, 10, 9, 9, 3].entries()) {
        const year = startYear + Math.floor(term / 2);
        add([[`Học kỳ ${term % 2 + 1}/${year}-${year + 1}`, 165]]);
        rows.push(transcriptHeader(page, y)); y -= 14;
        for (let course = 1; course <= count; course++) {
            if (term === 3 && course === 7) {
                page = 2; y = 760; // Continuation has neither semester title nor column header.
            }
            const grade = term === 4 ? [] : [[course === 2 ? 'M' : course === 1 ? '0' : '8,5', 493] as [string, number]];
            add([[String(course), 171], [`DEMO_${term}_${course}`, 192], [`Môn kiểm thử ${term + 1}.${course}`, 246],
                ['3', 414], ['Bắt Buộc', 444], ...grade, ['Chi tiết', 552]]);
        }
        add([[`STC Đậu (${term === 4 ? 0 : (count - 1) * 3}) + STC Rớt (${term === 4 ? 0 : 3}) =`, 290],
            [String(count * 3), 414], ['Điểm Trung Bình : 0.00', 430]]);
        add([['Điểm rèn luyện =', 334], ['80', 414]]);
    }
    return rows;
};
