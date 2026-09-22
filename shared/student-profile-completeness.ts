/**
 * The six fields below are the single definition of a completed student
 * profile.  Keep this module dependency-free: it is shared by the browser
 * and the Worker, so neither side can accidentally invent a different
 * onboarding rule.
 */
export interface StudentProfileCompletenessInput {
  fullName?: unknown;
  className?: unknown;
  programName?: unknown;
  cohort?: unknown;
  majorName?: unknown;
  specializationName?: unknown;
}

export const requiredStudentProfileText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

export const isStudentProfileComplete = (profile?: StudentProfileCompletenessInput | null): boolean =>
  Boolean(
    profile
    && requiredStudentProfileText(profile.fullName)
    && requiredStudentProfileText(profile.className)
    && requiredStudentProfileText(profile.programName)
    && requiredStudentProfileText(profile.cohort)
    && requiredStudentProfileText(profile.majorName)
    && requiredStudentProfileText(profile.specializationName),
  );
