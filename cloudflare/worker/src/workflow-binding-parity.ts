import type { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';

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
