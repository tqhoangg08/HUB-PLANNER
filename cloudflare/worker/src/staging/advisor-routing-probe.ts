/** Staging-only experiments. Never import from the production entrypoint. */
import {aiAdvisorV2CanaryBucket} from '../ai-advisor-v2-runtime.ts';
import {GeminiFileSearchError} from '../gemini-file-search.ts';

const PROFILES = ['canary-selected', 'canary-unselected', 'selected-completeness-off',
  'legacy-provider-error', 'selected-provider-error'] as const;
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
  const selected = profile !== 'canary-unselected' && profile !== 'legacy-provider-error';
  const bucket = await aiAdvisorV2CanaryBucket(authenticatedUserId);
  // Exercise the real bucket decision for the SAME authenticated staging user.
  // This is not two real student accounts at 7%, and never changes a stored flag.
  return {AI_ADVISOR_V2_MODE: 'canary', AI_ADVISOR_V2_CANARY_PERCENT: String(bucket + (selected ? 1 : 0)),
    AI_ADVISOR_RETRIEVAL_COMPLETENESS_ENABLED: profile === 'selected-completeness-off' ? 'false' : 'true',
    GEMINI_FILE_SEARCH_ENABLED: 'true',
    diagnostic: {profile, expectedSelected: selected, faultInjected: profile.endsWith('provider-error')},
  };
}

export async function injectedGeminiFailure(): Promise<never> {
  throw new GeminiFileSearchError('GEMINI_REQUEST_TIMEOUT', {model: 'staging-fault-injection', durationMs: 0});
}
