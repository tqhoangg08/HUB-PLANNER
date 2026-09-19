import { Subject, GradeStatus, Semester } from '../types';
import {
  calculateCumulativeStats,
  calculateSemesterStats,
  calculateSubjectAverage,
  getGradeDetails,
} from '../shared/academic-grade-calculations.ts';

export { calculateCumulativeStats, calculateSemesterStats, calculateSubjectAverage, getGradeDetails };

export const convertToScale4 = (score10: number): number => {
  return getGradeDetails(score10).scale4;
};

export const getSubjectStatus = (score10: number | null): GradeStatus => {
  if (score10 === null) return GradeStatus.UNKNOWN;
  if (score10 < 4.0) return GradeStatus.FAIL;
  if (score10 < 5.5) return GradeStatus.IMPROVE;
  return GradeStatus.PASS;
};


const extractAcademicYearFromSemester = (sem: Semester): string | null => {
    const nameMatch = sem.name.match(/(\d{4})-(\d{4})/);
    if (nameMatch) return `${nameMatch[1]}-${nameMatch[2]}`;

    const idMatch = sem.id.match(/(\d{4})_(\d{4})/);
    if (idMatch) return `${idMatch[1]}-${idMatch[2]}`;

    return null;
};

const CLASSIFICATION_LABELS = ["Kém", "Yếu", "Trung bình", "Khá", "Giỏi", "Xuất sắc"] as const;

const getDegreeClassificationRank = (gpa4: number): number => {
  if (gpa4 >= 3.6) return 5;
  if (gpa4 >= 3.2) return 4;
  if (gpa4 >= 2.5) return 3;
  if (gpa4 >= 2.0) return 2;
  if (gpa4 >= 1.0) return 1;
  return 0;
};

const getTrainingClassificationRank = (trainingScore: number): number => {
  if (trainingScore >= 90) return 5;
  if (trainingScore >= 80) return 4;
  if (trainingScore >= 65) return 3;
  if (trainingScore >= 50) return 2;
  if (trainingScore >= 35) return 1;
  return 0;
};

export const getDegreeClassification = (gpa4: number) => {
  return CLASSIFICATION_LABELS[getDegreeClassificationRank(gpa4)];
};

export const getTrainingClassification = (trainingScore: number) => {
  const trainingLabels = ["Kém", "Yếu", "Trung bình", "Khá", "Tốt", "Xuất sắc"] as const;
  return trainingLabels[getTrainingClassificationRank(trainingScore)];
};

export const getCombinedYearClassification = (gpa4: number, trainingScore: number) => {
  const combinedRank = Math.min(
    getDegreeClassificationRank(gpa4),
    getTrainingClassificationRank(trainingScore)
  );
  return CLASSIFICATION_LABELS[combinedRank];
};

export const calculateYearlyStats = (semesters: Semester[]) => {
    const years: Record<string, Semester[]> = {};
    
    semesters.forEach(sem => {
        const academicYear = extractAcademicYearFromSemester(sem);
        let groupKey = academicYear || 'unknown';

        if (!academicYear && sem.id.startsWith('y')) {
             groupKey = sem.id.split('_')[0]; 
        } else if (!academicYear) {
             groupKey = 'Other';
        }

        if (!years[groupKey]) years[groupKey] = [];
        years[groupKey].push(sem);
    });

    return Object.entries(years).map(([yearId, sems]) => {
        const stats = calculateCumulativeStats(sems.map(s => ({ subjects: s.subjects })));
        const trainingScores = sems
          .map(semester => semester.trainingScore)
          .filter((score): score is number => (
            typeof score === 'number' &&
            Number.isFinite(score) &&
            score >= 0 &&
            score <= 100
          ));
        const averageTrainingScore = trainingScores.length > 0
          ? trainingScores.reduce((total, score) => total + score, 0) / trainingScores.length
          : null;
        
        let label = yearId;
        if (yearId.startsWith('y')) label = `Năm ${yearId.replace('y', '')}`;
        else if (yearId.includes('-')) label = `Năm học ${yearId}`;

        return {
            yearId,
            label,
            averageTrainingScore,
            trainingClassification: averageTrainingScore === null
              ? null
              : getTrainingClassification(averageTrainingScore),
            combinedClassification: stats.hasData && averageTrainingScore !== null
              ? getCombinedYearClassification(stats.rawGPA4, averageTrainingScore)
              : null,
            ...stats
        };
    }).sort((a, b) => a.yearId.localeCompare(b.yearId));
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
    targetGPA: number,
    currentGpaCredits: number = passedCredits
  ) => {
    // New catalogs may not have an authoritative total yet. Treat that state
    // as unknown instead of dividing by zero or presenting a made-up target.
    if (!Number.isFinite(totalCreditsRequired) || totalCreditsRequired <= 0) {
      return {
        requiredGPA: 0,
        remainingCredits: 0,
        isPossible: false,
        isTargetAchieved: false,
        isTotalCreditsKnown: false,
      };
    }
    const remainingCredits = Math.max(0, totalCreditsRequired - passedCredits);

    // Khi đã hoàn thành đủ/vượt số tín chỉ chương trình, kết quả phụ thuộc
    // trực tiếp vào GPA hiện tại thay vì luôn bị xem là "Không thể".
    if (remainingCredits === 0) {
      const isTargetAchieved = currentRawGPA4 >= targetGPA;
      return {
        requiredGPA: isTargetAchieved ? 0 : Number.POSITIVE_INFINITY,
        remainingCredits,
        isPossible: isTargetAchieved,
        isTargetAchieved,
        isTotalCreditsKnown: true,
      };
    }

    // GPA hiện tại có thể bao gồm cả tín chỉ của môn chưa đạt, trong khi
    // passedCredits chỉ là số tín chỉ đã tích lũy để tốt nghiệp.
    const safeCurrentGpaCredits = Math.max(0, currentGpaCredits);

    // Tổng điểm cần có sau khi hoàn thành các tín chỉ còn lại.
    const finalGpaCredits = safeCurrentGpaCredits + remainingCredits;
    const targetTotalScore = targetGPA * finalGpaCredits;
    
    // Tổng điểm hiện tại (Dùng GPA thô để chính xác)
    const currentTotalScore = currentRawGPA4 * safeCurrentGpaCredits;
  
    // Tổng điểm cần đạt cho các tín chỉ còn lại
    const requiredTotalScore = targetTotalScore - currentTotalScore;
  
    // GPA trung bình cần đạt cho quãng đường còn lại
    const rawRequiredGPA = requiredTotalScore / remainingCredits;
    const isTargetAchieved = rawRequiredGPA <= 0;
  
    return {
        requiredGPA: Math.max(0, rawRequiredGPA),
        remainingCredits,
        isPossible: rawRequiredGPA <= 4.0,
        isTargetAchieved,
        isTotalCreditsKnown: true,
    };
  };
