export type PushEventType = 'school' | 'lost_found' | 'event' | 'schedule';
export type PushEventMessage = { v: 1; type: PushEventType; sourceId: string | number };

export interface PushEventQueueEnv {
  PUSH_EVENTS_QUEUE?: Queue<PushEventMessage>;
}

export const publishPushEvent = async (env: PushEventQueueEnv, message: PushEventMessage) => {
  if (!env.PUSH_EVENTS_QUEUE) return false;
  try {
    await env.PUSH_EVENTS_QUEUE.send(message);
    return true;
  } catch {
    // D1 is the durable source of truth. A signal transport failure is
    // intentionally recovered by the hourly fallback, not by rolling back it.
    console.warn('push_event_signal_failed', { type: message.type });
    return false;
  }
};

export const isPushEventMessage = (value: unknown): value is PushEventMessage => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  const sourceId = message.sourceId;
  const numericSource = typeof sourceId === 'number' && Number.isSafeInteger(sourceId) && sourceId > 0;
  const sourceIsNumeric = typeof sourceId === 'string' && /^\d{1,20}$/.test(sourceId);
  const sourceIsOutboxId = typeof sourceId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sourceId);
  const type = message.type;
  return message.v === 1 && (type === 'school' || type === 'lost_found' || type === 'event' || type === 'schedule') &&
    (type === 'schedule' ? sourceIsOutboxId : numericSource || sourceIsNumeric);
};
