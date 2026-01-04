import { Subject, GradeStatus, Semester } from '../types';
import { StudentRecord } from './rankingData';

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
  // Based on the image, any D- (1.6) or above is "Đạt" (Pass)
  // But typically standard improvement range is D grades.
  if (score10 < 5.5) return GradeStatus.IMPROVE; // C- and below might consider improving
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

  // Calculate averages and explicitly round to 1 decimal place using Math.round
  // This ensures 3.55 becomes 3.6
  const gpa10 = totalCredits > 0 ? Math.round((totalScore10 / totalCredits) * 10) / 10 : 0;
  const gpa4 = totalCredits > 0 ? Math.round((totalScore4 / totalCredits) * 10) / 10 : 0;

  return {
    gpa10,
    gpa4,
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
    
    // Group semesters by year ID prefix or logic
    // We try to group by the year string found in the ID or Name
    semesters.forEach(sem => {
        // Try to extract year from ID e.g., "imported_2023_2024..." -> "2023-2024"
        // Or "y1_..." -> "y1"
        let groupKey = 'unknown';
        if (sem.id.startsWith('y')) {
             groupKey = sem.id.split('_')[0]; // y1, y2
        } else if (sem.id.includes('_20')) {
             // extract 20xx_20xx
             const match = sem.id.match(/(\d{4})_(\d{4})/);
             if (match) groupKey = `${match[1]}-${match[2]}`;
             else groupKey = 'Other';
        } else {
            // Fallback to name parsing
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

// Updated based on image for Credit System (Scale 4)
export const getDegreeClassification = (gpa4: number) => {
  // Ensure we classify based on the rounded value
  // Example: 3.55 -> 3.6 -> Xuất sắc
  const roundedGPA = Math.round(gpa4 * 10) / 10;

  // Check strict ranges from top down
  if (roundedGPA >= 3.6) return "Xuất sắc";
  if (roundedGPA >= 3.2) return "Giỏi"; // 3.2 to < 3.6
  if (roundedGPA >= 2.5) return "Khá"; // 2.5 to < 3.2
  if (roundedGPA >= 2.0) return "Trung bình"; // 2.0 to < 2.5
  if (roundedGPA >= 1.0) return "Yếu"; // 1.0 to < 2.0
  return "Kém"; // < 1.0
};

export const analyzeTrend = (semesters: Semester[]) => {
    const semStats = semesters.map(s => calculateSemesterStats(s.subjects));
    // Filter only semesters with data
    const activeStats = semStats.filter(s => s.hasData);
    
    if (activeStats.length < 2) return "Chưa đủ dữ liệu để đánh giá xu hướng.";

    const current = activeStats[activeStats.length - 1].gpa4;
    const previous = activeStats[activeStats.length - 2].gpa4;
    const diff = current - previous;

    if (diff >= 0.2) return "🎉 Phong độ đang đi lên! Kết quả kỳ này tốt hơn kỳ trước.";
    if (diff <= -0.2) return "⚠️ Phong độ đang giảm sút. Cần tập trung hơn vào kỳ tới.";
    return "➡️ Phong độ ổn định. Hãy cố gắng bứt phá!";
};

export const calculateRequiredGPA = (
    currentGPA4: number,
    passedCredits: number,
    totalCreditsRequired: number,
    targetGPA: number
  ) => {
    const remainingCredits = Math.max(0, totalCreditsRequired - passedCredits);
    
    // If goal is already reached or impossible (credits overflow), handle gracefully
    if (remainingCredits === 0) return null; 
  
    // Target Total Points = TargetGPA * TotalCredits
    const targetTotalScore = targetGPA * totalCreditsRequired;
    
    // Current Total Points = CurrentGPA * PassedCredits
    const currentTotalScore = currentGPA4 * passedCredits;
  
    // Required Points for the remaining credits
    const requiredTotalScore = targetTotalScore - currentTotalScore;
  
    // Required Average GPA for remaining credits
    const requiredGPA = requiredTotalScore / remainingCredits;
  
    return {
        requiredGPA,
        remainingCredits,
        isPossible: requiredGPA <= 4.0 && requiredGPA >= 0
    };
  };

export const calculateForecastRank = (
    currentUser: { gpa4: number; credits: number; drl: number },
    historicalData: StudentRecord[]
) => {
    // 1. Combine user with history
    const userWithFlag = { ...currentUser, isUser: true };
    const combinedData = [...historicalData.map(d => ({ ...d, isUser: false })), userWithFlag];

    // 2. Sort Logic (Strict Priority: GPA4 -> Credits -> DRL)
    combinedData.sort((a, b) => {
        if (b.gpa4 !== a.gpa4) return b.gpa4 - a.gpa4;
        if (b.credits !== a.credits) return b.credits - a.credits;
        return b.drl - a.drl;
    });

    // 3. Find User Rank
    const userIndex = combinedData.findIndex(item => item.isUser);
    const rank = userIndex + 1;
    const totalStudents = combinedData.length;
    const percentile = (rank / totalStudents) * 100;

    // 4. Calculate Gap to Next Rank
    let gapInfo = null;
    if (userIndex > 0) {
        const nextPerson = combinedData[userIndex - 1]; // The person immediately above
        
        let type = '';
        let diff = 0;
        let message = '';

        if (nextPerson.gpa4 > currentUser.gpa4) {
            type = 'gpa';
            diff = nextPerson.gpa4 - currentUser.gpa4;
            // Rounded to avoid floating point weirdness
            message = `Cần +${diff.toFixed(2)} GPA`;
        } else if (nextPerson.credits > currentUser.credits) {
            type = 'credits';
            diff = nextPerson.credits - currentUser.credits;
            message = `Cần +${diff} Tín chỉ`;
        } else if (nextPerson.drl > currentUser.drl) {
            type = 'drl';
            diff = nextPerson.drl - currentUser.drl;
            message = `Cần +${diff} ĐRL`;
        } else {
             // This case theoretically shouldn't happen unless exact tie on all fields but pushed down by stability sort?
             // Since we just inserted, if identical, user might be below or above depending on browser sort. 
             // Assume minimal nudge needed.
             message = "Cần cải thiện chỉ số phụ";
        }

        gapInfo = {
            type,
            diff,
            message
        };
    }

    return {
        rank,
        totalStudents,
        percentile,
        percentileText: `Top ${percentile.toFixed(1)}%`,
        gapInfo
    };
};
