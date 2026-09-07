export type AnnouncementListItem = {
  title: string
  published_date: string | null
  detail_url: string
}

export type AnnouncementCandidate = {
  title: string
  link: string
  date: string
  isNew: boolean
}

type ExistingAnnouncementKeys = {
  existingLinks: Set<string>
  existingTitles: Set<string>
}

type CandidateOptions = {
  maxItems: number
  now: Date
  pushFreshnessDays: number
}

export const normalizeAnnouncementTitle = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi')

export function isFreshAnnouncementDate(date: string, now: Date, freshnessDays: number) {
  const published = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(published)) return false
  const cutoff = now.getTime() - Math.max(1, freshnessDays) * 24 * 60 * 60 * 1000
  return published >= cutoff && published <= now.getTime() + 24 * 60 * 60 * 1000
}

export function buildAnnouncementCandidates(
  discovered: AnnouncementListItem[],
  existing: ExistingAnnouncementKeys,
  options: CandidateOptions,
) {
  const seenLinks = new Set(existing.existingLinks)
  const seenTitles = new Set(existing.existingTitles)
  const candidates: AnnouncementCandidate[] = []

  const ordered = [...discovered]
    .filter((item): item is AnnouncementListItem & { published_date: string } => Boolean(item.published_date))
    .sort((left, right) => right.published_date.localeCompare(left.published_date))

  for (const item of ordered) {
    const title = item.title.trim().replace(/\s+/g, ' ')
    const normalizedTitle = normalizeAnnouncementTitle(title)
    const link = item.detail_url.trim()
    if (!title || !link || seenLinks.has(link) || seenTitles.has(normalizedTitle)) continue

    seenLinks.add(link)
    seenTitles.add(normalizedTitle)
    candidates.push({
      title,
      link,
      date: item.published_date,
      isNew: isFreshAnnouncementDate(item.published_date, options.now, options.pushFreshnessDays),
    })
    if (candidates.length >= options.maxItems) break
  }

  return candidates
}
