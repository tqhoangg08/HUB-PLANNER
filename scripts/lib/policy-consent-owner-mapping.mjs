const normalized = (value) => String(value || '').trim();
export const normalizeEmail = (value) => normalized(value).toLowerCase();
export const normalizeStudentCode = (value) => normalized(value).toUpperCase();
export const normalizeGoogleSubject = (value) => normalized(value);

/**
 * Resolve a legacy Supabase owner only through canonical Better Auth keys.
 * A disagreement between exact keys is deliberately unresolved: guessing an
 * owner would be worse than leaving that consent for a later manual repair.
 */
export const mapLegacyPolicyConsentOwners = (owners, lookups) => {
  const mapped = [];
  let directMatches = 0;
  let googleMapped = 0;
  let legacyMapped = 0;
  let unresolved = 0;
  let conflicts = 0;

  for (const owner of owners) {
    const candidates = new Set();
    let hasDirectMatch = false;
    let hasGoogleMatch = false;
    const legacyUserId = normalized(owner.legacyUserId);
    if (lookups.userIds.has(legacyUserId)) {
      candidates.add(legacyUserId);
      hasDirectMatch = true;
    }

    for (const email of [owner.profileEmail, owner.legacyAuthEmail]) {
      const canonicalUserId = lookups.userByEmail.get(normalizeEmail(email));
      if (canonicalUserId) candidates.add(canonicalUserId);
    }
    const byStudentCode = lookups.userByStudentCode.get(normalizeStudentCode(owner.studentCode));
    if (byStudentCode) candidates.add(byStudentCode);
    for (const subject of owner.googleSubjects || []) {
      const canonicalUserId = lookups.userByGoogleSubject.get(normalizeGoogleSubject(subject));
      if (canonicalUserId) {
        candidates.add(canonicalUserId);
        hasGoogleMatch = true;
      }
    }

    if (candidates.size !== 1) {
      unresolved += 1;
      if (candidates.size > 1) conflicts += 1;
      continue;
    }

    const [userId] = candidates;
    mapped.push({ legacyUserId, userId });
    if (hasDirectMatch) directMatches += 1;
    else if (hasGoogleMatch) googleMapped += 1;
    else legacyMapped += 1;
  }

  return {
    mapped,
    summary: {
      totalOwners: owners.length,
      directMatches,
      googleMapped,
      mappedLegacyOwners: legacyMapped,
      unresolvedOwners: unresolved,
      mappingConflicts: conflicts,
    },
  };
};
