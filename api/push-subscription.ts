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
  let query = adminSupabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint);

  if (exceptUserId) {
    query = query.neq('user_id', exceptUserId);
  }

  const { error: deleteError } = await query;
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

    const { data: existingRows, error: lookupError } = await adminSupabase
      .from('push_subscriptions')
      .select('id')
      .eq('endpoint', endpoint)
      .limit(1);

    if (lookupError) throw lookupError;

    if (existingRows && existingRows.length > 0) {
      const { error: updateError } = await adminSupabase
        .from('push_subscriptions')
        .update({
          user_id: user.id,
          subscription,
          endpoint,
        })
        .eq('id', existingRows[0].id);

      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await adminSupabase
        .from('push_subscriptions')
        .insert({
          user_id: user.id,
          subscription,
          endpoint,
        });

      if (insertError) throw insertError;
    }

    return res.status(200).json({ success: true, userId: user.id });
  } catch (error) {
    console.error('Push subscription sync failed:', error);
    return res.status(500).json({
      error: 'Cannot sync push subscription',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
