import { Subject, GradeStatus, Semester } from '../types';

// HUB Specific Grade Scale based on user provided image
export const getGradeDetails = (score10: number) => {
  // Round score10 to 1 decimal place before checking ranges to ensure accuracy
  const score = Math.round(score10 * 10) / 10;

  if (score >= 9.5) return { scale4: 4.0, letter: 'A+' };
  if (score >= 9.0) return { scale4: 3.7, letter: 'A' };
  if (score >= 8.5) return { scale4: 3.4, letter: 'A-' };
  if (score >= 8.0) return { scale4: 3.2, letter: 'B+' };
  if (score >= 7.5) return { scale4: 3.0, letter: 'B' };
  if (score >= 7.0) return { scale4: 2.8, letter: 'B-' };
  if (score >= 6.5) return { scale4: 2.6, letter: 'C+' };
  if (score >= 6.0) return { scale4: 2.4, letter: 'C' };
  if (score >= 5.5) return { scale4: 2.2, letter: 'C-' };
  if (score >= 5.0) return { scale4: 2.0, letter: 'D+' };
  if (score >= 4.5) return { scale4: 1.8, letter: 'D' };
  if (score >= 4.0) return { scale4: 1.6, letter: 'D-' };
  return { scale4: 0.0, letter: 'F' };
};

export const convertToScale4 = (score10: number): number => {
  return getGradeDetails(score10).scale4;
};

export const calculateSubjectAverage = (s: Subject): number | null => {
  if (s.scoreCC === null || s.scoreProcess === null || s.scoreMid === null || s.scoreFinal === null) {
    return null;
  }
  // Formula: 10% + 20% + 20% + 50%
  const avg = (s.scoreCC * 0.1) + (s.scoreProcess * 0.2) + (s.scoreMid * 0.2) + (s.scoreFinal * 0.5);
  return Math.round(avg * 10) / 10; // Round to 1 decimal
};

export const getSubjectStatus = (score10: number | null): GradeStatus => {
  if (score10 === null) return GradeStatus.UNKNOWN;
  if (score10 < 4.0) return GradeStatus.FAIL;
  if (score10 < 5.5) return GradeStatus.IMPROVE;
  return GradeStatus.PASS;
};

export const calculateSemesterStats = (subjects: Subject[]) => {
  let totalCredits = 0;
  let totalScore10 = 0;
  let totalScore4 = 0;
  let passedCredits = 0;

  subjects.forEach(sub => {
    if (sub.isNonGPA) return;
    
    const avg10 = calculateSubjectAverage(sub);
    if (avg10 !== null) {
      const { scale4 } = getGradeDetails(avg10);
      totalCredits += sub.credits;
      totalScore10 += avg10 * sub.credits;
      totalScore4 += scale4 * sub.credits;

      if (avg10 >= 4.0) {
        passedCredits += sub.credits;
      }
    }
  });

  // Calculate averages
  
  // 1. Calculate RAW (Exact) values for internal calculations (Prediction)
  // Tính chính xác không làm tròn để dùng cho hàm dự báo
  const rawGPA4 = totalCredits > 0 ? totalScore4 / totalCredits : 0;

  // 2. Calculate Display values (Rounded)
  // Làm tròn 1 chữ số thập phân để hiển thị UI (VD: 3.15 -> 3.2)
  const gpa10 = totalCredits > 0 ? Math.round(((totalScore10 / totalCredits) + Number.EPSILON) * 10) / 10 : 0;
  const gpa4 = totalCredits > 0 ? Math.round((rawGPA4 + Number.EPSILON) * 10) / 10 : 0;

  return {
    gpa10,
    gpa4,      // Dùng để hiển thị
    rawGPA4,   // Dùng để tính toán dự báo (MỚI THÊM)
    totalCredits,
    passedCredits,
    hasData: totalCredits > 0
  };
};

export const calculateCumulativeStats = (semesters: { subjects: Subject[] }[]) => {
  const allSubjects = semesters.flatMap(s => s.subjects);
  return calculateSemesterStats(allSubjects);
};

export const calculateYearlyStats = (semesters: Semester[]) => {
    const years: Record<string, Semester[]> = {};
    
    semesters.forEach(sem => {
        let groupKey = 'unknown';
        if (sem.id.startsWith('y')) {
             groupKey = sem.id.split('_')[0]; 
        } else if (sem.id.includes('_20')) {
             const match = sem.id.match(/(\d{4})_(\d{4})/);
             if (match) groupKey = `${match[1]}-${match[2]}`;
             else groupKey = 'Other';
        } else {
            const nameMatch = sem.name.match(/(\d{4})-(\d{4})/);
            if (nameMatch) groupKey = `${nameMatch[1]}-${nameMatch[2]}`;
            else groupKey = 'Other';
        }

        if (!years[groupKey]) years[groupKey] = [];
        years[groupKey].push(sem);
    });

    return Object.entries(years).map(([yearId, sems]) => {
        const stats = calculateCumulativeStats(sems.map(s => ({ subjects: s.subjects })));
        
        let label = yearId;
        if (yearId.startsWith('y')) label = `Năm ${yearId.replace('y', '')}`;
        else if (yearId.includes('-')) label = `Năm học ${yearId}`;

        return {
            yearId,
            label, 
            ...stats
        };
    }).sort((a, b) => a.yearId.localeCompare(b.yearId));
};

export const getDegreeClassification = (gpa4: number) => {
  const roundedGPA = Math.round(gpa4 * 10) / 10;

  if (roundedGPA >= 3.6) return "Xuất sắc";
  if (roundedGPA >= 3.2) return "Giỏi"; 
  if (roundedGPA >= 2.5) return "Khá"; 
  if (roundedGPA >= 2.0) return "Trung bình"; 
  if (roundedGPA >= 1.0) return "Yếu"; 
  return "Kém"; 
};

export const analyzeTrend = (semesters: Semester[]) => {
    const semStats = semesters.map(s => calculateSemesterStats(s.subjects));
    const activeStats = semStats.filter(s => s.hasData);
    
    if (activeStats.length < 2) return "Chưa đủ dữ liệu để đánh giá xu hướng.";

    const current = activeStats[activeStats.length - 1].gpa4;
    const previous = activeStats[activeStats.length - 2].gpa4;
    const diff = current - previous;

    if (diff >= 0.2) return "🎉 Phong độ đang đi lên! Kết quả kỳ này tốt hơn kỳ trước.";
    if (diff <= -0.2) return "⚠️ Phong độ đang giảm sút. Cần tập trung hơn vào kỳ tới.";
    return "➡️ Phong độ ổn định. Hãy cố gắng bứt phá!";
};

export const getScholarshipStatus = (gpa: number, drl: number, credits: number) => {
  if (credits < 15 || gpa < 3.2 || drl < 80) {
    return {
      type: 'none',
      label: 'Chưa đủ điều kiện',
      color: 'text-gray-500'
    };
  }

  if (gpa >= 3.6 && drl >= 90) {
    return {
      type: 'excellent',
      label: 'Học bổng Xuất sắc',
      color: 'text-yellow-600'
    };
  }

  return {
    type: 'good',
    label: 'Học bổng Giỏi',
    color: 'text-green-600'
  };
};

export const calculateRequiredGPA = (
    currentRawGPA4: number, // CHÚ Ý: Truyền rawGPA4 vào đây thay vì gpa4
    passedCredits: number,
    totalCreditsRequired: number,
    targetGPA: number
  ) => {
    const remainingCredits = Math.max(0, totalCreditsRequired - passedCredits);
    
    if (remainingCredits === 0) return null; 
  
    // Tổng điểm mục tiêu (Chính xác tuyệt đối)
    const targetTotalScore = targetGPA * totalCreditsRequired;
    
    // Tổng điểm hiện tại (Dùng GPA thô để chính xác)
    const currentTotalScore = currentRawGPA4 * passedCredits;
  
    // Tổng điểm cần đạt cho các tín chỉ còn lại
    const requiredTotalScore = targetTotalScore - currentTotalScore;
  
    // GPA trung bình cần đạt cho quãng đường còn lại
    const requiredGPA = requiredTotalScore / remainingCredits;
  
    return {
        requiredGPA,
        remainingCredits,
        isPossible: requiredGPA <= 4.0 && requiredGPA >= 0
    };
  };