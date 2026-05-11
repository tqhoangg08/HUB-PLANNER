import { createClient } from '@supabase/supabase-js';
import { withLogging } from '../server/middleware.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Xác thực user từ token Bearer
const getUserFromToken = async (req) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return null;

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
};

// Kiểm tra quyền admin
const isAdmin = async (userId) => {
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.role === 'admin';
};

async function handler(request, response) {
  const { method } = request;
  const action = request.query?.action || request.body?.action;

  // ============================================================
  // GET: Lấy thông tin subscription của user
  // ============================================================
  if (method === 'GET') {
    const user = await getUserFromToken(request);
    if (!user) return response.status(401).json({ error: 'Chưa đăng nhập' });

    const resource = request.query?.resource;

    // GET ?resource=my-subscription
    if (resource === 'my-subscription') {
      const { data, error } = await supabase
        .from('user_subscriptions')
        .select('*, premium_plans(*)')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .order('expires_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) return response.status(500).json({ error: error.message });
      return response.status(200).json({ subscription: data, isPremium: !!data && data.plan_id !== 'free' });
    }

    // GET ?resource=plans
    if (resource === 'plans') {
      const { data, error } = await supabase
        .from('premium_plans')
        .select('*')
        .eq('is_active', true)
        .order('price', { ascending: true });

      if (error) return response.status(500).json({ error: error.message });
      return response.status(200).json({ plans: data });
    }

    // GET ?resource=usage
    if (resource === 'usage') {
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('ai_usage_daily')
        .select('message_count')
        .eq('user_id', user.id)
        .eq('date', today)
        .maybeSingle();

      return response.status(200).json({ usage: data?.message_count || 0, date: today });
    }

    // GET ?resource=payment-history
    if (resource === 'payment-history') {
      const { data, error } = await supabase
        .from('payment_history')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) return response.status(500).json({ error: error.message });
      return response.status(200).json({ payments: data });
    }

    // GET ?resource=admin-pending (Admin only)
    if (resource === 'admin-pending') {
      if (!await isAdmin(user.id)) return response.status(403).json({ error: 'Không có quyền' });

      const { data, error } = await supabase
        .from('payment_history')
        .select('*, profiles:user_id(full_name, student_code, avatar_url)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (error) return response.status(500).json({ error: error.message });
      return response.status(200).json({ pending: data });
    }

    return response.status(400).json({ error: 'Thiếu resource parameter' });
  }

  // ============================================================
  // POST: Các action liên quan subscription
  // ============================================================
  if (method === 'POST') {
    const user = await getUserFromToken(request);
    if (!user) return response.status(401).json({ error: 'Chưa đăng nhập' });

    // POST action=confirm-payment (Admin xác nhận thanh toán)
    if (action === 'confirm-payment') {
      if (!await isAdmin(user.id)) return response.status(403).json({ error: 'Không có quyền admin' });

      const { paymentId, planId } = request.body;
      if (!paymentId || !planId) return response.status(400).json({ error: 'Thiếu paymentId hoặc planId' });

      try {
        // 1. Lấy thông tin payment
        const { data: payment, error: payErr } = await supabase
          .from('payment_history')
          .select('*')
          .eq('id', paymentId)
          .single();

        if (payErr || !payment) return response.status(404).json({ error: 'Không tìm thấy giao dịch' });
        if (payment.status === 'confirmed') return response.status(400).json({ error: 'Giao dịch đã được xác nhận trước đó' });

        // 2. Lấy plan info
        const { data: plan, error: planErr } = await supabase
          .from('premium_plans')
          .select('*')
          .eq('id', planId)
          .single();

        if (planErr || !plan) return response.status(404).json({ error: 'Không tìm thấy gói' });

        // 3. Tạo subscription
        const expiresAt = new Date(Date.now() + plan.duration_days * 24 * 60 * 60 * 1000).toISOString();

        // Hủy subscription cũ (nếu có)
        await supabase
          .from('user_subscriptions')
          .update({ status: 'expired', updated_at: new Date().toISOString() })
          .eq('user_id', payment.user_id)
          .eq('status', 'active');

        // Tạo subscription mới
        const { data: newSub, error: subErr } = await supabase
          .from('user_subscriptions')
          .insert({
            user_id: payment.user_id,
            plan_id: planId,
            status: 'active',
            started_at: new Date().toISOString(),
            expires_at: expiresAt,
            payment_method: payment.method,
            payment_ref: payment.transaction_ref,
            amount_paid: payment.amount,
          })
          .select()
          .single();

        if (subErr) throw subErr;

        // 4. Cập nhật payment status
        await supabase
          .from('payment_history')
          .update({
            status: 'confirmed',
            subscription_id: newSub.id,
            confirmed_by: user.id,
          })
          .eq('id', paymentId);

        return response.status(200).json({
          success: true,
          message: `Đã kích hoạt ${plan.name} cho user ${payment.user_id} đến ${expiresAt}`,
          subscription: newSub,
        });
      } catch (err) {
        console.error('Lỗi confirm-payment:', err);
        return response.status(500).json({ error: err.message || 'Lỗi hệ thống' });
      }
    }

    // POST action=reject-payment (Admin từ chối thanh toán)
    if (action === 'reject-payment') {
      if (!await isAdmin(user.id)) return response.status(403).json({ error: 'Không có quyền admin' });

      const { paymentId, reason } = request.body;
      if (!paymentId) return response.status(400).json({ error: 'Thiếu paymentId' });

      const { error } = await supabase
        .from('payment_history')
        .update({
          status: 'failed',
          note: reason || 'Admin từ chối',
        })
        .eq('id', paymentId);

      if (error) return response.status(500).json({ error: error.message });
      return response.status(200).json({ success: true, message: 'Đã từ chối giao dịch' });
    }

    // POST action=grant-premium (Admin cấp Premium miễn phí)
    if (action === 'grant-premium') {
      if (!await isAdmin(user.id)) return response.status(403).json({ error: 'Không có quyền admin' });

      const { targetUserId, planId, reason } = request.body;
      if (!targetUserId || !planId) return response.status(400).json({ error: 'Thiếu targetUserId hoặc planId' });

      const { data: plan } = await supabase
        .from('premium_plans')
        .select('*')
        .eq('id', planId)
        .single();

      if (!plan) return response.status(404).json({ error: 'Không tìm thấy gói' });

      const expiresAt = new Date(Date.now() + plan.duration_days * 24 * 60 * 60 * 1000).toISOString();

      // Hủy subscription cũ
      await supabase
        .from('user_subscriptions')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('user_id', targetUserId)
        .eq('status', 'active');

      // Tạo subscription mới
      const { data: newSub, error: subErr } = await supabase
        .from('user_subscriptions')
        .insert({
          user_id: targetUserId,
          plan_id: planId,
          status: 'active',
          started_at: new Date().toISOString(),
          expires_at: expiresAt,
          payment_method: 'admin_grant',
          payment_ref: `ADMIN_${user.id.slice(0, 8)}_${Date.now()}`,
          amount_paid: 0,
        })
        .select()
        .single();

      if (subErr) return response.status(500).json({ error: subErr.message });

      // Ghi payment history
      await supabase.from('payment_history').insert({
        user_id: targetUserId,
        subscription_id: newSub.id,
        amount: 0,
        method: 'admin_grant',
        transaction_ref: newSub.payment_ref,
        status: 'confirmed',
        note: reason || `Admin ${user.email} cấp miễn phí`,
        confirmed_by: user.id,
      });

      return response.status(200).json({
        success: true,
        message: `Đã cấp ${plan.name} cho user ${targetUserId}`,
        subscription: newSub,
      });
    }

    // POST action=cancel-subscription (User tự hủy)
    if (action === 'cancel-subscription') {
      const { error } = await supabase
        .from('user_subscriptions')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('status', 'active');

      if (error) return response.status(500).json({ error: error.message });
      return response.status(200).json({ success: true, message: 'Đã hủy đăng ký Premium' });
    }

    return response.status(400).json({ error: 'Action không hợp lệ' });
  }

  return response.status(405).json({ error: 'Method not allowed' });
}

export default withLogging(handler);
