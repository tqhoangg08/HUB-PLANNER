import {
  handleAuthRuntimeRequest,
  type AuthRuntimeEnv,
  type AuthRuntimeProfile,
} from "./auth-production.ts";

export const AUTH_INTEGRATION_STAGE2_ORIGIN =
  "https://hub-planner-public-dev-api-preview.tqhoangg2.workers.dev";
export const AUTH_INTEGRATION_STAGE2_HOSTNAME =
  "hub-planner-public-dev-api-preview.tqhoangg2.workers.dev";

export const INTEGRATION_STAGE2_AUTH_PROFILE = {
  kind: "integration-stage2",
  appName: "HUB Planner Integration authentication test",
  origin: AUTH_INTEGRATION_STAGE2_ORIGIN,
  trustedOrigins: [AUTH_INTEGRATION_STAGE2_ORIGIN],
  cookiePrefix: "hubplanner_auth_integration_stage2",
  serviceName: "hub-planner-auth-integration",
  routeSurface: "integration-stage2",
  providers: "email-only",
  resetPage: `${AUTH_INTEGRATION_STAGE2_ORIGIN}/reset-password`,
  expectedHostname: AUTH_INTEGRATION_STAGE2_HOSTNAME,
  eligibilityPolicy: "integration-synthetic-user",
  emailBrand: "integration-test",
} as const satisfies AuthRuntimeProfile;

export type AuthIntegrationStage2Env = AuthRuntimeEnv;

export function handleAuthIntegrationStage2Request(
  request: Request,
  env: AuthIntegrationStage2Env,
  context: ExecutionContext,
): Promise<Response> {
  return handleAuthRuntimeRequest(
    request,
    env,
    context,
    INTEGRATION_STAGE2_AUTH_PROFILE,
  );
}
