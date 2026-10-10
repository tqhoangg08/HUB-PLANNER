/** Staging-only experiments. Never import from the production entrypoint. */
import {aiAdvisorV2CanaryBucket} from '../ai-advisor-v2-runtime.ts';
import {GeminiFileSearchError} from '../gemini-file-search.ts';

const PROFILES = ['canary-selected', 'canary-unselected', 'selected-completeness-off',
  'legacy-provider-error', 'selected-provider-error', 'policy-selected', 'policy-unselected',
  'policy-completeness-off', 'policy-cloudflare-error', 'policy-workers-error', 'policy-gemini-error'] as const;
export type RoutingProbeProfile = typeof PROFILES[number];

export function readRoutingProbeProfile(request: Request, role: string): RoutingProbeProfile {
  const url = new URL(request.url);
  if (!/^https:\/\/hub-advisor-pr88-word-staging\.[a-z0-9-]+\.workers\.dev$/u.test(url.origin)
    || url.pathname !== '/api/staging/ai-advisor-routing') throw Error('STAGING_ISOLATION_REQUIRED');
  if (role !== 'admin') throw Error('STAGING_ADMIN_REQUIRED');
  if (request.method !== 'POST' || [...url.searchParams.keys()].some(key => key !== 'profile')
    || url.searchParams.getAll('profile').length !== 1) throw Error('STAGING_PROBE_INVALID');
  const profile = url.searchParams.get('profile');
  if (!PROFILES.includes(profile as RoutingProbeProfile)) throw Error('STAGING_PROBE_INVALID');
  return profile as RoutingProbeProfile;
}

export async function routingProbeConfig(profile: RoutingProbeProfile, authenticatedUserId: string) {
  const selected = !['canary-unselected','legacy-provider-error','policy-unselected'].includes(profile);
  const bucket = await aiAdvisorV2CanaryBucket(authenticatedUserId);
  // Exercise the real bucket decision for the SAME authenticated staging user.
  // This is not two real student accounts at 7%, and never changes a stored flag.
  return {AI_ADVISOR_V2_MODE: 'canary', AI_ADVISOR_V2_CANARY_PERCENT: String(bucket + (selected ? 1 : 0)),
    AI_ADVISOR_RETRIEVAL_COMPLETENESS_ENABLED: ['selected-completeness-off','policy-completeness-off'].includes(profile) ? 'false' : 'true',
    AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_ENABLED: profile.startsWith('policy-') ? 'true' : 'false',
    GEMINI_FILE_SEARCH_ENABLED: 'true',
    diagnostic: {profile, expectedSelected: selected, faultInjected: profile.endsWith('provider-error') || profile.endsWith('-error'),
      cloudflareFault: profile==='policy-cloudflare-error', workersFault:profile==='policy-workers-error',
      geminiFault:profile.endsWith('provider-error')||profile==='policy-gemini-error'},
  };
}

export async function injectedGeminiFailure(): Promise<never> {
  throw new GeminiFileSearchError('GEMINI_REQUEST_TIMEOUT', {model: 'staging-fault-injection', durationMs: 0});
}
