const normalizeStudentCode = (value: unknown) => String(value || '').trim();

type ProfileRouteFetchers = {
  fetchOwnProfile: () => Promise<{
    publicProfile: Record<string, any> | null;
  }>;
  fetchPublicProfile: (studentCode: string) => Promise<Record<string, any>>;
};

const ownProfileView = (profile: Record<string, any>) => ({
  ...profile,
  isOwnProfile: true,
  isPrivatePreview: profile.public_profile_enabled !== true,
});

export const isOwnProfileRoute = (
  routeStudentCode: unknown,
  sessionStudentCode: unknown,
) => {
  const routeCode = normalizeStudentCode(routeStudentCode);
  const ownCode = normalizeStudentCode(sessionStudentCode);
  return Boolean(routeCode && ownCode && routeCode === ownCode);
};

export const fetchProfileForRoute = async (
  routeStudentCode: string,
  sessionStudentCode: string,
  currentUserId: string | null,
  fetchers: ProfileRouteFetchers,
) => {
  if (isOwnProfileRoute(routeStudentCode, sessionStudentCode)) {
    const own = await fetchers.fetchOwnProfile();
    if (!own.publicProfile) throw new Error('Không tìm thấy hồ sơ cá nhân.');
    return ownProfileView(own.publicProfile);
  }

  // OAuth identities are not guaranteed to encode MSSV in their email. Use
  // the owner-scoped endpoint to resolve the canonical student code before
  // deciding that this is another user's profile.
  if (currentUserId) {
    const own = await fetchers.fetchOwnProfile().catch(() => null);
    if (
      own?.publicProfile
      && isOwnProfileRoute(routeStudentCode, own.publicProfile.student_code)
    ) {
      return ownProfileView(own.publicProfile);
    }
  }

  return {
    ...await fetchers.fetchPublicProfile(routeStudentCode),
    isOwnProfile: false,
    isPrivatePreview: false,
  };
};
