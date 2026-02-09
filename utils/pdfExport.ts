import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { UserData } from '../types';
import { calculateCumulativeStats, calculateSemesterStats, calculateSubjectAverage, getGradeDetails } from './calculations';

export const exportTranscriptToPdf = (data: UserData) => {
  const doc = new jsPDF();

  // --- Header Information ---
  doc.setFontSize(16);
  doc.setTextColor(0, 51, 117); // HUB Blue
  doc.text('BANG KET QUA HOC TAP - HUB PLANNER', 105, 15, { align: 'center' });
  
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Ngay xuat: ${new Date().toLocaleDateString('vi-VN')}`, 105, 22, { align: 'center' });

  // Student Info Box
  doc.setDrawColor(200);
  doc.setFillColor(248, 249, 250);
  doc.rect(14, 28, 182, 35, 'FD');

  doc.setFontSize(11);
  doc.setTextColor(0);
  
  const col1X = 20;
  const col2X = 110;
  const startY = 36;
  const gap = 8;

  doc.text(`Ho va ten: ${removeVietnameseTones(data.studentName)}`, col1X, startY);
  doc.text(`Ma so / Khoa: ${data.cohort}`, col1X, startY + gap);
  doc.text(`Chuong trinh: ${removeVietnameseTones(data.programName)}`, col1X, startY + gap * 2);

  doc.text(`Nganh: ${removeVietnameseTones(data.majorName)}`, col2X, startY);
  doc.text(`Chuyen nganh: ${removeVietnameseTones(data.specializationName)}`, col2X, startY + gap);

  // --- Cumulative Stats ---
  const stats = calculateCumulativeStats(data.semesters);
  
  doc.setFontSize(10);
  doc.setTextColor(0, 51, 117);
  doc.text(`GPA (He 4): ${stats.gpa4.toFixed(2)}  |  GPA (He 10): ${stats.gpa10.toFixed(2)}  |  Tin chi tich luy: ${stats.passedCredits}/${data.totalCreditsRequired}`, 105, 70, { align: 'center' });

  // --- Semesters Tables ---
  let currentY = 75;

  data.semesters.forEach((sem) => {
    // Check if new page is needed for semester title
    if (currentY > 270) {
        doc.addPage();
        currentY = 15;
    }

    const semStats = calculateSemesterStats(sem.subjects);
    if (!semStats.hasData && sem.subjects.length === 0) return; // Skip empty semesters

    // Semester Header
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.setFont(undefined, 'bold');
    doc.text(`${removeVietnameseTones(sem.name)}`, 14, currentY + 5);
    
    // Semester Summary
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(100);
    const summaryText = `GPA(4): ${semStats.gpa4.toFixed(2)}  |  GPA(10): ${semStats.gpa10.toFixed(2)}  |  DRL: ${sem.trainingScore ?? '-'}`;
    doc.text(summaryText, 196, currentY + 5, { align: 'right' });

    // Table Data
    const tableBody = sem.subjects.map((sub, index) => {
        const avg10 = calculateSubjectAverage(sub);
        const { scale4, letter } = avg10 !== null ? getGradeDetails(avg10) : { scale4: null, letter: '-' };
        
        return [
            index + 1,
            removeVietnameseTones(sub.name) + (sub.isNonGPA ? ' (*)' : ''),
            sub.credits,
            avg10 !== null ? avg10.toFixed(1) : '-',
            scale4 !== null ? scale4.toFixed(1) : '-',
            letter
        ];
    });

    // Generate Table
    autoTable(doc, {
        startY: currentY + 8,
        head: [['STT', 'Mon hoc', 'TC', 'Diem (10)', 'Diem (4)', 'Chu']],
        body: tableBody,
        theme: 'grid',
        headStyles: { 
            fillColor: [0, 51, 117], 
            textColor: 255,
            fontSize: 9,
            halign: 'center'
        },
        styles: { 
            fontSize: 9, 
            cellPadding: 3,
            textColor: 50
        },
        columnStyles: {
            0: { halign: 'center', cellWidth: 15 },
            1: { cellWidth: 'auto' },
            2: { halign: 'center', cellWidth: 15 },
            3: { halign: 'center', cellWidth: 25 },
            4: { halign: 'center', cellWidth: 25 },
            5: { halign: 'center', cellWidth: 20 },
        },
        didDrawPage: (data) => {
            // Footer on each page
            const pageSize = doc.internal.pageSize;
            const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text('Tao boi HUB Grade Planner', 14, pageHeight - 10);
            doc.text(`Trang ${doc.getNumberOfPages()}`, 196, pageHeight - 10, { align: 'right' });
        }
    });

    // Update Y for next table
    currentY = (doc as any).lastAutoTable.finalY + 10;
  });

  // Footer Note
  if (currentY < 270) {
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.setFont(undefined, 'italic');
      doc.text('(*) Mon hoc khong tinh vao diem trung binh (GPA).', 14, currentY);
  }

  doc.save(`${removeVietnameseTones(data.studentName).replace(/\s+/g, '_')}_Transcript.pdf`);
};

// Helper to handle Vietnamese characters in basic fonts
// Since jsPDF default font doesn't support full Vietnamese charset, we strip tones for compatibility
function removeVietnameseTones(str: string): string {
    if (!str) return '';
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
    str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
    str = str.replace(/đ/g, "d");
    str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
    str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
    str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
    str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
    str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
    str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
    str = str.replace(/Đ/g, "D");
    // Some system encoded characters
    str = str.replace(/\u0300|\u0301|\u0303|\u0309|\u0323/g, ""); 
    return str;
}
