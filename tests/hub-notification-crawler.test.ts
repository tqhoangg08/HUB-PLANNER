import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildAnnouncementCandidates,
  isFreshAnnouncementDate,
  normalizeAnnouncementTitle,
} from '../scripts/hub_notification_crawler_core.ts'

test('announcement crawler writes the production school_announcements shape and deduplicates link/title', () => {
  const candidates = buildAnnouncementCandidates([
    { title: ' Thông báo   mới ', detail_url: 'https://hub.edu.vn/thong-bao/moi.html', published_date: '2026-09-07' },
    { title: 'THÔNG BÁO MỚI', detail_url: 'https://hub.edu.vn/thong-bao/trung-tieu-de.html', published_date: '2026-09-07' },
    { title: 'Đã có', detail_url: 'https://hub.edu.vn/thong-bao/existing.html', published_date: '2026-09-06' },
  ], {
    existingLinks: new Set(['https://hub.edu.vn/thong-bao/existing.html']),
    existingTitles: new Set(),
  }, { maxItems: 8, now: new Date('2026-09-07T12:00:00Z'), pushFreshnessDays: 3 })

  assert.deepEqual(candidates, [{
    title: 'Thông báo mới',
    link: 'https://hub.edu.vn/thong-bao/moi.html',
    date: '2026-09-07',
    isNew: true,
  }])
  assert.equal(normalizeAnnouncementTitle(' THÔNG BÁO  MỚI '), normalizeAnnouncementTitle('Thông báo mới'))
})

test('backlog announcements are imported without becoming push-eligible', () => {
  const candidates = buildAnnouncementCandidates([
    { title: 'Thông báo tồn đọng', detail_url: 'https://hub.edu.vn/thong-bao/cu.html', published_date: '2026-08-24' },
  ], { existingLinks: new Set(), existingTitles: new Set() }, {
    maxItems: 1,
    now: new Date('2026-09-07T12:00:00Z'),
    pushFreshnessDays: 3,
  })

  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].isNew, false)
  assert.equal(isFreshAnnouncementDate('2026-09-06', new Date('2026-09-07T12:00:00Z'), 3), true)
})
