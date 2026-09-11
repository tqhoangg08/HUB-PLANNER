import type { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { ANNOUNCEMENT_SOURCES, crawlAnnouncementSourceChunk } from './announcement-crawler.ts';
import { syncCrawledSchoolAnnouncements } from './announcement-store.ts';

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

type AnnouncementCrawlerWorkflowParams = {
  scheduledAt?: number;
  sourceId: string;
  startPage?: number;
  lastPage?: number;
  lastFingerprint?: string | null;
};

/**
 * A scheduled Workflow is intentionally the sole upstream crawler authority.
 * The ordinary Worker cron has a short CPU budget; durable Workflow steps do
 * not, and retain the crawler's existing source/D1 dedupe contract.
 */
export class AnnouncementCrawlerWorkflow extends WorkflowEntrypointBase<DisabledWorkflowEnv, AnnouncementCrawlerWorkflowParams> {
  async run(event: Readonly<WorkflowEvent<AnnouncementCrawlerWorkflowParams>>, step: WorkflowStep) {
    const params = event.payload;
    const source = ANNOUNCEMENT_SOURCES.find(([id]) => id === params.sourceId);
    if (!source) throw new Error('ANNOUNCEMENT_SOURCE_NOT_FOUND');
    const [id] = source;
    const startPage = Math.max(1, params.startPage || 1);
    const chunk = await step.do(
      `crawl-${id}-pages-${startPage}-${Math.min(80, startPage + 19)}`,
      { retries: { limit: 1, delay: '30 seconds', backoff: 'constant' }, timeout: '2 minutes' },
      () => crawlAnnouncementSourceChunk({
        source,
        after: '2026-08-05',
        startPage,
        lastPage: params.lastPage || 1,
        maxPages: 80,
        chunkPages: 20,
        previousFingerprint: params.lastFingerprint || null,
      }),
    );
    const sourceSummary = {
      id,
      pages: chunk.pages,
      rows: chunk.items.length,
      undated: chunk.undated,
      complete: chunk.complete,
      error: chunk.error || (chunk.undated ? 'SOURCE_DATE_MISSING' : null),
    };
    const summary = await step.do(
      `sync-${id}-pages-${startPage}-${Math.max(startPage, chunk.nextPage - 1)}`,
      {
        retries: { limit: 1, delay: '2 minutes', backoff: 'constant' },
        timeout: '2 minutes',
      },
      async () => {
        const result = await syncCrawledSchoolAnnouncements(
          this.env as unknown as Parameters<typeof syncCrawledSchoolAnnouncements>[0],
          { items: chunk.items, sources: [sourceSummary], complete: sourceSummary.complete && !sourceSummary.error },
          { allowIncomplete: true },
        );
        return {
          complete: result.complete,
          candidates: result.candidates,
          inserted: result.inserted,
          updated: result.updated,
          authority: result.authority,
          newestUpstreamDate: result.newestUpstreamDate,
          sourceErrors: result.sources.filter((source) => source.error).map((source) => source.id),
        };
      },
    );
    if (sourceSummary.error) throw new Error(`ANNOUNCEMENT_CRAWL_INCOMPLETE:${id}:${sourceSummary.error}`);
    let continuationId: string | null = null;
    if (!chunk.complete) {
      const continuation = await (this.env as unknown as Env).ANNOUNCEMENT_CRAWLER_WORKFLOW.create({
        params: {
          sourceId: id,
          scheduledAt: params.scheduledAt,
          startPage: chunk.nextPage,
          lastPage: chunk.lastPage,
          lastFingerprint: chunk.lastFingerprint,
        },
      });
      continuationId = continuation.id;
    }
    const result = { ...summary, sourceId: id, startPage, nextPage: chunk.nextPage, continuationId };
    console.log('announcement_crawl_chunk_complete', result);
    return result;
  }
}
