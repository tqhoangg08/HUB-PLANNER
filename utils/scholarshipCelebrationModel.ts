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

export function celebrationTextLayout(text: string, measure: (text: string, size: number) => number, width: number,
  maxSize: number, minSize: number, maxLines: number) {
  const wrap = (size: number) => {
    const lines: string[] = []; let line = '';
    for (const char of Array.from(text)) {
      if (line && measure(line + char, size) > width) { lines.push(line); line = ''; }
      line += char;
    }
    if (line) lines.push(line);
    return lines;
  };
  for (let size = maxSize; size >= minSize; size--) {
    const lines = wrap(size);
    if (lines.length <= maxLines) return {size, lines};
  }
  const lines = wrap(minSize);
  return {size: minSize, lines: [...lines.slice(0,maxLines-1), lines.slice(maxLines-1).join('')]};
}
