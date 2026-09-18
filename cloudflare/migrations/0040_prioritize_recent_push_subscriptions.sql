-- Keeps bounded push fan-out realtime for devices that have just confirmed
-- their subscription, without changing recipients or delivery semantics.
CREATE INDEX IF NOT EXISTS push_subscriptions_updated_at_idx
  ON push_subscriptions(updated_at DESC, id);
