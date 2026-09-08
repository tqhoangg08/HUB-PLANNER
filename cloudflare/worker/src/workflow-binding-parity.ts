import type { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { crawlAndSyncSchoolAnnouncements } from './index.ts';

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
    const summary = await step.do(
      'crawl-and-sync-school-announcements',
      {
        retries: { limit: 1, delay: '2 minutes', backoff: 'constant' },
        timeout: '10 minutes',
      },
      async () => {
        const result = await crawlAndSyncSchoolAnnouncements(this.env as unknown as Parameters<typeof crawlAndSyncSchoolAnnouncements>[0]);
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
