import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminSupabase = createClient(supabaseUrl, serviceRoleKey);

const getUserFromRequest = async (req: VercelRequest) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) return null;

  const { data, error } = await adminSupabase.auth.getUser(token);
  if (error || !data.user) return null;

  return data.user;
};

const deleteSubscriptionsByEndpoint = async (endpoint: string, exceptUserId?: string) => {
  const { data, error } = await adminSupabase
    .from('push_subscriptions')
    .select('user_id, subscription');

  if (error) throw error;

  const staleUserIds = (data || [])
    .filter((row) => row.subscription?.endpoint === endpoint && row.user_id !== exceptUserId)
    .map((row) => row.user_id);

  if (staleUserIds.length === 0) return;

  const { error: deleteError } = await adminSupabase
    .from('push_subscriptions')
    .delete()
    .in('user_id', staleUserIds);

  if (deleteError) throw deleteError;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const { subscription } = body;
    const endpoint = subscription?.endpoint;

    if (!endpoint) {
      return res.status(400).json({ error: 'Missing subscription endpoint' });
    }

    if (req.method === 'DELETE') {
      await deleteSubscriptionsByEndpoint(endpoint);
      return res.status(200).json({ success: true });
    }

    await deleteSubscriptionsByEndpoint(endpoint, user.id);

    const { error } = await adminSupabase.from('push_subscriptions').upsert({
      user_id: user.id,
      subscription,
    });

    if (error) throw error;

    return res.status(200).json({ success: true, userId: user.id });
  } catch (error) {
    console.error('Push subscription sync failed:', error);
    return res.status(500).json({ error: 'Cannot sync push subscription' });
  }
}
