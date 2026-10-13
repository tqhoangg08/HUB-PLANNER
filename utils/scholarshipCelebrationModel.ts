import type { MyScholarshipsResponse, OwnAward } from './scholarshipApi';

export function refreshedOwnAward(response: MyScholarshipsResponse, selected: OwnAward): OwnAward | null {
  if (!response.verified) return null;
  return response.awards.find(award => award.id === selected.id && award.campaignSlug === selected.campaignSlug
    && award.studentCode === selected.studentCode) || null;
}
