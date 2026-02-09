export interface Subject {
  id: string;
  name: string;
  credits: number;
  scoreCC: number | null; // 10%
  scoreProcess: number | null; // 20%
  scoreMid: number | null; // 20%
  scoreFinal: number | null; // 50%
  isNonGPA: boolean; // Physical Edu, Defense Edu, etc.
}

export interface Semester {
  id: string;
  name: string;
  subjects: Subject[];
  trainingScore: number | null; // Added training score per semester
}

export interface UserData {
  // Personal Info
  studentName: string;
  cohort: string; // Khóa
  programName: string; // Chương trình (Chuẩn/TABP/Đặc biệt)
  majorName: string; // Ngành
  specializationName: string; // Chuyên ngành
  
  // Academic Data
  semesters: Semester[];
  targetGPA: number;
  // trainingScore: number; // REMOVED: Now calculated from semesters
  totalCreditsRequired: number; // Based on selection
  
  // App State
  hasOnboarded: boolean;
}

export enum GradeStatus {
  PASS = 'PASS',
  FAIL = 'FAIL', // < 4.0
  IMPROVE = 'IMPROVE', // C, D scores
  UNKNOWN = 'UNKNOWN'
}

export const STORAGE_KEY = 'hub_grade_planner_data_v3'; // Bump version to reset structure
