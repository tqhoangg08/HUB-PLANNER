import {
  handleAuthIntegrationStage2Request,
  type AuthIntegrationStage2Env,
} from "./auth-integration-stage2-profile.ts";

const worker = {
  fetch(request, env, context) {
    return handleAuthIntegrationStage2Request(request, env, context);
  },
} satisfies ExportedHandler<AuthIntegrationStage2Env>;

export default worker;
