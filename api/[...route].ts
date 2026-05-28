type VercelRequest = {
  method?: string;
  url?: string;
  query: Record<string, string | string[] | undefined>;
  [key: string]: any;
};

type VercelResponse = {
  status: (code: number) => VercelResponse;
  json: (payload: unknown) => void;
  [key: string]: any;
};

type Handler = (req: VercelRequest, res: VercelResponse) => unknown | Promise<unknown>;
type HandlerLoader = () => Promise<{ default: Handler }>;

const handlers: Record<string, HandlerLoader> = {
  auth: () => import('../server/api-handlers/auth.js'),
  bot: () => import('../server/api-handlers/bot.js'),
  chat: () => import('../server/api-handlers/chat.js'),
  courses: () => import('../server/api-handlers/courses.js'),
  cron: () => import('../server/api-handlers/cron.js'),
  'event-candidates': () => import('../server/api-handlers/event-candidates.js'),
  'event-candidates-analyze': () => import('../server/api-handlers/event-candidates-analyze.js'),
  events: () => import('../server/api-handlers/events.js'),
  'moderator-notifications': () => import('../server/api-handlers/moderator-notifications.js'),
  push: () => import('../server/api-handlers/push.js'),
  'schedule-reminders': () => import('../server/api-handlers/schedule-reminders.ts') as Promise<{ default: Handler }>,
  scraper: () => import('../server/api-handlers/scraper.js'),
};

const getRouteParts = (req: VercelRequest) => {
  const fromQuery = req.query.route;
  if (Array.isArray(fromQuery)) return fromQuery.map(String).filter(Boolean);
  if (typeof fromQuery === 'string') return fromQuery.split('/').filter(Boolean);

  const pathname = String(req.url || '').split('?')[0] || '';
  return pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const parts = getRouteParts(req);
  const routeKey = parts[0] || '';

  if (routeKey === 'event-candidates' && parts.length >= 3 && parts[2] === 'analyze') {
    const { default: eventCandidatesAnalyze } = await handlers['event-candidates-analyze']();
    return eventCandidatesAnalyze(req, res);
  }

  const routeLoader = handlers[routeKey];
  if (!routeLoader) {
    return res.status(404).json({
      error: 'API route not found',
      route: parts.join('/'),
    });
  }

  const { default: routeHandler } = await routeLoader();
  return routeHandler(req, res);
}
