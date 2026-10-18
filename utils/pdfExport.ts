import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { GradeStatus, Semester, UserData } from '../types';
import { fetchBetterAuthSession } from './privateApi';
import {
    calculateCumulativeStats,
    calculateSemesterStats,
    calculateSubjectAverage,
    getDegreeClassification,
    getGradeDetails,
    getSubjectStatus
} from './calculations';
import { resolveTotalCreditsRequired } from './programs';

type TranscriptExportScope = 'full' | 'year';

interface TranscriptExportOptions {
    scope?: TranscriptExportScope;
    semesters?: Semester[];
    academicYearLabel?: string;
}

const VALID_SEMESTER_NAME_REGEX = /^Học kỳ (1|2|3|Hè) Năm học \d{4}-\d{4}$/;

// Hàm nạp font từ thư mục public/fonts và chuyển sang Base64
const FONT_FALLBACK_ORIGIN = 'https://hotrosinhvienhub.id.vn';

const fetchFontBase64 = async (url: string): Promise<string> => {
    let response = await fetch(url, { cache: 'force-cache' }).catch(() => null);
    if (!response?.ok) {
        response = await fetch(`${FONT_FALLBACK_ORIGIN}${url.startsWith('/') ? url : `/${url}`}`, { cache: 'force-cache' });
    }
    if (!response.ok) throw new Error(`Lỗi tải font từ: ${url}`);

    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64data = (reader.result as string).split(',')[1];
            resolve(base64data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

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

export const exportTranscriptToPdf = async (data: UserData, options: TranscriptExportOptions = {}) => {
    const doc = new jsPDF();
    const MARGIN_LEFT = 15;
    const PAGE_WIDTH = 210;
    const MARGIN_RIGHT = PAGE_WIDTH - MARGIN_LEFT;
    const scope = options.scope ?? 'full';
    const isYearExport = scope === 'year';
    const selectedAcademicYear = options.academicYearLabel ?? null;

    // 1. TẢI FONT CHUẨN TỪ LOCAL REPO (Bao mượt, không sợ rớt mạng)
    try {
        const [regB64, boldB64, italicB64] = await Promise.all([
            fetchFontBase64('/fonts/times.ttf'),
            fetchFontBase64('/fonts/timesbd.ttf'),
            fetchFontBase64('/fonts/timesi.ttf')
        ]);

        doc.addFileToVFS('times.ttf', regB64);
        doc.addFileToVFS('timesbd.ttf', boldB64);
        doc.addFileToVFS('timesi.ttf', italicB64);

        doc.addFont('times.ttf', 'times', 'normal', 'Identity-H');
        doc.addFont('timesbd.ttf', 'times', 'bold', 'Identity-H');
        doc.addFont('timesi.ttf', 'times', 'italic', 'Identity-H');
        doc.setFont('times', 'normal');
    } catch (error) {
        console.error('❌ Lỗi tải font tiếng Việt từ local:', error);
        alert('⚠️ Lỗi hệ thống: Không thể nạp font chữ. Quá trình xuất PDF đã bị hủy để tránh lỗi hiển thị.');
        return;
    }

    const validDataSemesters = (options.semesters ?? data.semesters).filter((semester) =>
        VALID_SEMESTER_NAME_REGEX.test(semester.name)
    );

    if (validDataSemesters.length === 0) {
        alert(
            isYearExport
                ? `Không có dữ liệu học kỳ hợp lệ để xuất cho ${selectedAcademicYear ?? 'năm học đã chọn'}.`
                : 'Chưa có dữ liệu học kỳ hợp lệ để xuất PDF.'
        );
        return;
    }

    // LẤY MSSV TỰ ĐỘNG
    let studentCode = (data as any).studentCode || (data as any).student_code;
    if (!studentCode) {
        try {
            const session = await fetchBetterAuthSession();
            const email = session?.user?.email || '';
            const schoolSuffix = '@st.buh.edu.vn';
            if (email.toLowerCase().endsWith(schoolSuffix)) {
                studentCode = email.slice(0, -schoolSuffix.length);
            }
        } catch (err) {
            console.log('Không thể xác định MSSV dự phòng', err);
        }
    }
    studentCode = studentCode || '.....................';

    const studentName = data.studentName || '................................';
    const cohort = data.cohort || '.......';
    const majorName = data.majorName || '................................';
    const specName = data.specializationName || '................................';

    const stats = calculateCumulativeStats(validDataSemesters);
    const classification = getDegreeClassification(stats.rawGPA4);
    const titleText = 'GIẤY CHỨNG NHẬN KẾT QUẢ HỌC TẬP';
    const subtitleText = isYearExport
    ? selectedAcademicYear
    : 'Bảng điểm toàn khóa';

    // --- HEADER: QUỐC HIỆU & TIÊU NGỮ ---
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);

    doc.setFont('times', 'bold');
    doc.text('HUB PLANNER', 50, 20, { align: 'center' });
    doc.text('HỆ THỐNG HỖ TRỢ SINH VIÊN', 50, 26, { align: 'center' });
    doc.setLineWidth(0.5);
    doc.line(30, 28, 70, 28);

    doc.text('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', 155, 20, { align: 'center' });
    doc.text('Độc lập - Tự do - Hạnh phúc', 155, 26, { align: 'center' });
    doc.line(125, 28, 185, 28);

    const today = new Date();
    doc.setFont('times', 'italic');
    doc.text(
        `TP. Hồ Chí Minh, ngày ${today.getDate().toString().padStart(2, '0')} tháng ${(today.getMonth() + 1)
            .toString()
            .padStart(2, '0')} năm ${today.getFullYear()}`,
        155,
        34,
        { align: 'center' }
    );

    doc.setFont('times', 'bold');
    doc.setFontSize(16);
    doc.text(titleText, 105, 50, { align: 'center' });

if (subtitleText) {
    doc.setFontSize(13);
    doc.text(subtitleText, 105, 57, { align: 'center' });
}

    // --- THÔNG TIN SINH VIÊN ---
    doc.setFont('times', 'normal');
    doc.setFontSize(12);
        const startY = 69;
        const gapY = 6;
        const col1X = MARGIN_LEFT;
        const col2X = 110;

    doc.text(`Họ và tên SV: ${studentName}`, col1X, startY);
    doc.text(`Khóa: ${cohort}`, col2X, startY);

    doc.text(`Mã số SV: ${studentCode}`, col1X, startY + gapY);
    doc.text(`Ngành đào tạo: ${majorName}`, col2X, startY + gapY);

    doc.text('Hình thức đào tạo: Chính quy', col1X, startY + gapY * 2);
    doc.text(`Chuyên ngành: ${specName}`, col2X, startY + gapY * 2);

    // --- BẢNG ĐIỂM ---
    let currentY = startY + gapY * 2 + 10;

    validDataSemesters.forEach((sem) => {
        const semStats = calculateSemesterStats(sem.subjects);
        if (!semStats.hasData && sem.subjects.length === 0) return;

        doc.setFont('times', 'bold');
        doc.setFontSize(12);
        doc.text(sem.name, MARGIN_LEFT, currentY);

        doc.setFont('times', 'normal');
        doc.text(
            `GPA(4): ${semStats.gpa4.toFixed(2)}  |  GPA(10): ${semStats.gpa10.toFixed(2)}  |  ĐRL: ${sem.trainingScore ?? '-'}`,
            MARGIN_RIGHT,
            currentY,
            { align: 'right' }
        );

        const tableBody = sem.subjects.map((sub, index) => {
            const avg10 = calculateSubjectAverage(sub);
            const { scale4, letter } = avg10 !== null ? getGradeDetails(avg10) : { scale4: null, letter: '-' };
            const status =
                avg10 !== null ? (getSubjectStatus(avg10) === GradeStatus.FAIL ? 'Rớt' : 'Đậu') : '-';

            return [
                index + 1,
                sub.name + (sub.isNonGPA ? ' (*)' : ''),
                sub.credits,
                avg10 !== null ? avg10.toFixed(1) : '-',
                scale4 !== null ? scale4.toFixed(1) : '-',
                letter,
                status
            ];
        });

        autoTable(doc, {
            startY: currentY + 3,
            margin: { left: MARGIN_LEFT, right: MARGIN_LEFT },
            head: [['STT', 'Tên học phần', 'Số tín chỉ', 'Thang 10', 'Thang 4', 'Điểm chữ', 'Kết quả']],
            body: tableBody,
            theme: 'grid',
            styles: {
                font: 'times',
                fontSize: 12,
                cellPadding: 2,
                textColor: 0,
                lineColor: 0,
                lineWidth: 0.1
            },
            headStyles: {
                font: 'times',
                fontStyle: 'bold',
                fillColor: [240, 240, 240],
                textColor: 0,
                halign: 'center'
            },
            columnStyles: {
                0: { halign: 'center', cellWidth: 12 },
                1: { cellWidth: 'auto' },
                2: { halign: 'center', cellWidth: 23 },
                3: { halign: 'center', cellWidth: 18 },
                4: { halign: 'center', cellWidth: 18 },
                5: { halign: 'center', cellWidth: 19 },
                6: { halign: 'center', cellWidth: 18 }
            },
            didDrawPage: () => {
                const pageSize = doc.internal.pageSize;
                const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
                doc.setFontSize(12);
                doc.setFont('times', 'normal');
                doc.text(`Trang ${doc.getNumberOfPages()}`, MARGIN_RIGHT, pageHeight - 10, { align: 'right' });
            }
        });

        currentY = (doc as any).lastAutoTable.finalY + 12;
    });

    if (currentY > 230) {
        doc.addPage();
        currentY = 20;
    }

    const summaryCreditText = isYearExport
        ? `Số tín chỉ đạt trong năm: ${stats.passedCredits}/${stats.totalCredits}`
        : `Số tín chỉ tích lũy: ${stats.passedCredits}/${resolveTotalCreditsRequired({ programName: data.programName, cohort: data.cohort, specializationName: data.specializationName, storedCredits: data.totalCreditsRequired }) || 'chưa cập nhật'}`;

    // --- TỔNG KẾT ---
    doc.setFont('times', 'normal');
    doc.setFontSize(12);
    doc.text(`Điểm trung bình (hệ 4): ${stats.gpa4.toFixed(2)}`, MARGIN_LEFT, currentY);
    doc.text(`Điểm trung bình (hệ 10): ${stats.gpa10.toFixed(2)}`, MARGIN_LEFT, currentY + gapY);

    doc.text(summaryCreditText, 110, currentY);
    doc.text(`Xếp loại học lực: ${classification}`, 110, currentY + gapY);

    doc.text('Ghi chú: (*) Môn học không tính vào điểm trung bình tích lũy.', MARGIN_LEFT, currentY + gapY * 2.5);

    // --- CHỮ KÝ ---
    doc.setFontSize(12);
    doc.setFont('times', 'bold');

    const sigY = currentY + gapY * 5;

    doc.text('NGƯỜI SÁNG LẬP', 155, sigY, { align: 'center' });
    doc.text('HỆ THỐNG HỖ TRỢ SINH VIÊN', 155, sigY + 5, { align: 'center' });

    doc.setFont('times', 'normal');
    doc.text('Trần Quốc Hoàng', 155, sigY + 36, { align: 'center' });

    const safeFileName = sanitizeFilePart(studentName || 'Bang_Diem') || 'Bang_Diem';
    const academicYearKey = extractAcademicYearKey(selectedAcademicYear || '');
    const exportFileSuffix =
        isYearExport && academicYearKey
            ? `Bang_Diem_${sanitizeFilePart(academicYearKey)}`
            : 'Bang_Diem_Toan_Khoa';

    // Keep the origin and reference-only status visible on every exported page.
    doc.setProperties({ creator: 'HUB Planner', author: 'HUB Planner' });
    for (let page = 1; page <= doc.getNumberOfPages(); page += 1) {
        doc.setPage(page);
        doc.setFont('times', 'italic');
        doc.setFontSize(9);
        doc.text(
            'Bản xuất từ HUB Planner để tham khảo, không phải bảng điểm chứng thực của Nhà trường.',
            PAGE_WIDTH / 2,
            doc.internal.pageSize.getHeight() - 5,
            { align: 'center' }
        );
    }

    doc.save(`${safeFileName}_${exportFileSuffix}.pdf`);
};
