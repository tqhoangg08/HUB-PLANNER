import { createClient } from '@supabase/supabase-js';
import { withLogging } from '../middleware.js';
import { handleCors } from '../api-cors.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const subscriptionExpiryForPlan = (plan) => {
  const now = new Date();
  if (plan === 'plus') {
    now.setMonth(now.getMonth() + 1);
    return now.toISOString();
  }
  if (plan === 'pro') {
    now.setMonth(now.getMonth() + 6);
    return now.toISOString();
  }
  return null;
};

const getUserFromRequest = async (request) => {
  const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return data.user;
};

const requireAdmin = async (request) => {
  const user = await getUserFromRequest(request);
  if (!user?.id) {
    const error = new Error('Unauthorized');
    error.statusCode = 401;
    throw error;
  }

  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .or(`id.eq.${user.id},user_id.eq.${user.id}`)
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.role) {
    const forbidden = new Error('Forbidden');
    forbidden.statusCode = 403;
    throw forbidden;
  }

  return user;
};

const upsertSubscription = async ({ userId, plan, sourcePaymentId = null, updatedBy }) => {
  if (!['free', 'plus', 'pro'].includes(plan)) {
    const error = new Error('Invalid subscription plan.');
    error.statusCode = 400;
    throw error;
  }

  const payload = {
    user_id: userId,
    plan,
    status: 'active',
    starts_at: new Date().toISOString(),
    expires_at: subscriptionExpiryForPlan(plan),
    source_payment_id: sourcePaymentId,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('subscriptions')
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) throw error;
  return data;
};

const setSubscription = async (request, response, adminUser) => {
  const { userId, plan } = request.body || {};
  if (!userId || !plan) {
    return response.status(400).json({ error: 'Missing subscription data.' });
  }

  const data = await upsertSubscription({
    userId,
    plan,
    updatedBy: adminUser.id,
  });

  return response.status(200).json({ success: true, data });
};

const approvePaymentRequest = async (request, response, adminUser) => {
  const { requestId } = request.body || {};
  if (!requestId) return response.status(400).json({ error: 'Missing payment request id.' });

  const { data: paymentRequest, error: readError } = await supabase
    .from('payment_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (readError) throw readError;
  if (paymentRequest.status === 'rejected') {
    return response.status(409).json({ error: 'Payment request was rejected.' });
  }

  const { error: updateError } = await supabase
    .from('payment_requests')
    .update({
      status: 'approved',
      paid_at: paymentRequest.paid_at || new Date().toISOString(),
      approved_at: new Date().toISOString(),
      approved_by: adminUser.id,
    })
    .eq('id', requestId);

  if (updateError) throw updateError;

  const data = await upsertSubscription({
    userId: paymentRequest.user_id,
    plan: paymentRequest.plan,
    sourcePaymentId: paymentRequest.id,
    updatedBy: adminUser.id,
  });

  return response.status(200).json({ success: true, data });
};

async function handler(request, response) {
  if (handleCors(request, response, {
    methods: 'POST,OPTIONS',
    headers: 'Content-Type, Authorization',
  })) return;

  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const adminUser = await requireAdmin(request);
    const action = String(request.body?.action || '');

    if (action === 'admin-set-subscription') return await setSubscription(request, response, adminUser);
    if (action === 'approve-payment-request') return await approvePaymentRequest(request, response, adminUser);

    return response.status(400).json({ error: 'Invalid subscription action.' });
  } catch (error) {
    return response.status(error.statusCode || 500).json({
      error: error.message || 'Cannot process subscription request.',
    });
  }
}

export default withLogging(handler);
