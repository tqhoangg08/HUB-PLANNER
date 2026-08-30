// Shared, runtime-neutral canonical field ordering for the profile shadow.
// Validation and hashing stay in the trusted caller, but both reconciliation
// tooling and the Worker construct the exact same canonical object shape.

export const makeProfileShadowProjection = (value) => ({
  user_id: value.user_id,
  student_code: value.student_code,
  full_name: value.full_name,
  avatar_url: value.avatar_url,
  bio: value.bio,
  class_name: value.class_name,
  class_name_overridden: value.class_name_overridden,
  profile_tags_json: value.profile_tags_json,
  public_profile_enabled: value.public_profile_enabled,
  show_profile_stats: value.show_profile_stats,
  public_gpa: value.public_gpa,
  public_completed_semesters: value.public_completed_semesters,
  public_credits: value.public_credits,
  created_at: value.created_at,
  updated_at: value.updated_at,
});

export const makePrivateProfileShadowProjection = (value) => ({
  user_id: value.user_id,
  data_json: value.data_json,
  student_name: value.student_name,
  cohort: value.cohort,
  major_name: value.major_name,
  specialization_name: value.specialization_name,
  program_name: value.program_name,
  semesters_json: value.semesters_json,
  target_gpa: value.target_gpa,
  total_credits_required: value.total_credits_required,
  has_onboarded: value.has_onboarded,
  lookback_seen_json: value.lookback_seen_json,
  updated_at: value.updated_at,
});
