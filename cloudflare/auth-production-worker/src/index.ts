import {
  handleAuthProductionRequest,
  type AuthProductionEnv,
} from "./auth-production";

const worker = {
  fetch(request, env, context) {
    return handleAuthProductionRequest(request, env, context);
  },
} satisfies ExportedHandler<AuthProductionEnv>;

export default worker;

