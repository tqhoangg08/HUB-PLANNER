export type AcademicGradeSubject = {
  credits: number;
  scoreCC: number | null;
  scoreProcess: number | null;
  scoreMid: number | null;
  scoreFinal: number | null;
  isNonGPA: boolean;
};

// This module deliberately has no UI/type imports so it is safe in both the
// browser bundle and the Cloudflare Worker. Keep these calculations canonical.
export const getGradeDetails = (score10: number) => {
  const score = Math.round((score10 + 0.000001) * 10) / 10;
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

export const calculateSubjectAverage = (subject: AcademicGradeSubject): number | null => {
  if (subject.scoreCC === null || subject.scoreProcess === null || subject.scoreMid === null || subject.scoreFinal === null) return null;
  const average = (subject.scoreCC * 0.1) + (subject.scoreProcess * 0.2) + (subject.scoreMid * 0.2) + (subject.scoreFinal * 0.5);
  return Math.round((average + 0.000001) * 10) / 10;
};

export const calculateSemesterStats = (subjects: AcademicGradeSubject[]) => {
  let totalCredits = 0;
  let totalScore10 = 0;
  let totalScore4 = 0;
  let passedCredits = 0;
  for (const subject of subjects) {
    if (subject.isNonGPA) continue;
    const average = calculateSubjectAverage(subject);
    if (average === null) continue;
    const { scale4 } = getGradeDetails(average);
    totalCredits += subject.credits;
    totalScore10 += average * subject.credits;
    totalScore4 += scale4 * subject.credits;
    if (average >= 4) passedCredits += subject.credits;
  }
  const rawGPA4 = totalCredits > 0 ? totalScore4 / totalCredits : 0;
  const rawGPA10 = totalCredits > 0 ? totalScore10 / totalCredits : 0;
  const gpa10 = totalCredits > 0
    ? Math.round((Math.round((rawGPA10 + 0.000001) * 100) / 100 + 0.000001) * 10) / 10
    : 0;
  const gpa4 = totalCredits > 0
    ? Math.round((Math.round((rawGPA4 + 0.000001) * 100) / 100 + 0.000001) * 10) / 10
    : 0;
  return { gpa10, gpa4, rawGPA4, rawGPA10, totalCredits, passedCredits, hasData: totalCredits > 0 };
};

export const calculateCumulativeStats = (semesters: { subjects: AcademicGradeSubject[] }[]) =>
  calculateSemesterStats(semesters.flatMap((semester) => semester.subjects));
