import type { MyScholarshipsResponse, OwnAward } from './scholarshipApi';

export function refreshedOwnAward(response: MyScholarshipsResponse, selected: OwnAward): OwnAward | null {
  if (!response.verified) return null;
  return response.awards.find(award => award.id === selected.id && award.campaignSlug === selected.campaignSlug
    && award.studentCode === selected.studentCode) || null;
}

export function celebrationScoreLines(parts: string[], measure: (text: string) => number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const part of parts) {
    const last = lines.length - 1;
    const joined = last >= 0 ? `${lines[last]}  |  ${part}` : part;
    if (last >= 0 && measure(joined) <= maxWidth) lines[last] = joined;
    else lines.push(part);
  }
  return lines;
}
