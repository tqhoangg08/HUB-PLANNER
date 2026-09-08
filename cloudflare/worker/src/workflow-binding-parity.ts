import type { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { ANNOUNCEMENT_SOURCES, announcementTitleKey, crawlAnnouncementSourceChunk, type Announcement } from './announcement-crawler.ts';
import { syncCrawledSchoolAnnouncements } from './index.ts';

type DisabledWorkflowEnv = Record<string, unknown>;
type DisabledWorkflowParams = Record<string, unknown>;

// Unit tests execute in Node, where the Workers builtin module is unavailable.
// Deployed Workers always resolve the real runtime class.
const workflowRuntime = await import('cloudflare:workers').catch(() => ({
  WorkflowEntrypoint: class {
    protected env: unknown;
    constructor(_ctx: unknown, env: unknown) { this.env = env; }
  },
}));
const WorkflowEntrypointBase = workflowRuntime.WorkflowEntrypoint as typeof WorkflowEntrypoint;

/**
 * Production exposes these two Workflow entrypoints. The isolated session
 * candidate preserves their binding contract without enabling or invoking the
 * course scraper.
 */
export class HK1CourseScraperWorkflow extends WorkflowEntrypointBase<DisabledWorkflowEnv, DisabledWorkflowParams> {
  async run(_event: Readonly<WorkflowEvent<DisabledWorkflowParams>>, _step: WorkflowStep): Promise<never> {
    throw new Error('COURSE_SCRAPER_DISABLED_IN_ISOLATED_SESSION_CANDIDATE');
  }
}

export class HK1CourseScraperProbeWorkflow extends WorkflowEntrypointBase<DisabledWorkflowEnv, DisabledWorkflowParams> {
  async run(_event: Readonly<WorkflowEvent<DisabledWorkflowParams>>, _step: WorkflowStep): Promise<never> {
    throw new Error('COURSE_SCRAPER_DISABLED_IN_ISOLATED_SESSION_CANDIDATE');
  }
}

type AnnouncementCrawlerWorkflowParams = { scheduledAt?: number };

/**
 * A scheduled Workflow is intentionally the sole upstream crawler authority.
 * The ordinary Worker cron has a short CPU budget; durable Workflow steps do
 * not, and retain the crawler's existing source/D1 dedupe contract.
 */
export class AnnouncementCrawlerWorkflow extends WorkflowEntrypointBase<DisabledWorkflowEnv, AnnouncementCrawlerWorkflowParams> {
  async run(_event: Readonly<WorkflowEvent<AnnouncementCrawlerWorkflowParams>>, step: WorkflowStep) {
    const items: Announcement[] = [];
    const sources: Array<{ id: string; pages: number; rows: number; undated: number; complete: boolean; error: string | null }> = [];
    for (const source of ANNOUNCEMENT_SOURCES) {
      const [id] = source;
      const sourceSummary = { id, pages: 0, rows: 0, undated: 0, complete: false, error: null as string | null };
      let startPage = 1;
      let lastPage = 1;
      let lastFingerprint: string | null = null;
      while (startPage <= 80 && !sourceSummary.complete && !sourceSummary.error) {
        const chunkStart = startPage;
        const chunk = await step.do(
          `crawl-${id}-pages-${chunkStart}-${Math.min(80, chunkStart + 19)}`,
          { retries: { limit: 1, delay: '30 seconds', backoff: 'constant' }, timeout: '2 minutes' },
          () => crawlAnnouncementSourceChunk({
            source,
            after: '2026-08-05',
            startPage: chunkStart,
            lastPage,
            maxPages: 80,
            chunkPages: 20,
            previousFingerprint: lastFingerprint,
          }),
        );
        items.push(...chunk.items);
        sourceSummary.pages += chunk.pages;
        sourceSummary.rows += chunk.items.length;
        sourceSummary.undated += chunk.undated;
        sourceSummary.complete = chunk.complete;
        sourceSummary.error = chunk.error;
        startPage = chunk.nextPage;
        lastPage = chunk.lastPage;
        lastFingerprint = chunk.lastFingerprint;
      }
      if (!sourceSummary.complete && !sourceSummary.error) sourceSummary.error = 'PAGINATION_LIMIT_REACHED';
      if (sourceSummary.undated) { sourceSummary.complete = false; sourceSummary.error = 'SOURCE_DATE_MISSING'; }
      sources.push(sourceSummary);
    }
    const links = new Set<string>();
    const titles = new Set<string>();
    const uniqueItems = items.filter((item) => {
      const title = announcementTitleKey(item.title);
      if (links.has(item.link) || titles.has(title)) return false;
      links.add(item.link);
      titles.add(title);
      return true;
    });
    const summary = await step.do(
      'sync-crawled-school-announcements',
      {
        retries: { limit: 1, delay: '2 minutes', backoff: 'constant' },
        timeout: '2 minutes',
      },
      async () => {
        const result = await syncCrawledSchoolAnnouncements(
          this.env as unknown as Parameters<typeof syncCrawledSchoolAnnouncements>[0],
          { items: uniqueItems, sources, complete: sources.every((source) => source.complete && !source.error) },
        );
        return {
          complete: result.complete,
          candidates: result.candidates,
          inserted: result.inserted,
          newestUpstreamDate: result.newestUpstreamDate,
          sourceErrors: result.sources.filter((source) => source.error).map((source) => source.id),
        };
      },
    );
    console.log('announcement_crawl_complete', summary);
    return summary;
  }
}
