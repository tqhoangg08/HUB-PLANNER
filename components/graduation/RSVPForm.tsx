import React, { useState } from 'react';
import { CheckCircle2, Send } from 'lucide-react';
import { createRsvp } from './invitationService';
import { RsvpStatus } from './types';

interface RSVPFormProps {
  invitationId: string;
  primaryColor: string;
  onSubmitted?: () => void;
}

const inputClass = 'min-h-12 w-full rounded-2xl border border-black/10 bg-white/90 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white';

export const RSVPForm = ({ invitationId, primaryColor, onSubmitted }: RSVPFormProps) => {
  const [name, setName] = useState('');
  const [phoneOrEmail, setPhoneOrEmail] = useState('');
  const [status, setStatus] = useState<RsvpStatus>('attending');
  const [guestCount, setGuestCount] = useState(1);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [success, setSuccess] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setNotice('Bạn nhập họ tên giúp mình nhé.');
      setSuccess(false);
      return;
    }

    setSaving(true);
    setNotice('');
    try {
      await createRsvp(invitationId, {
        name: name.trim(),
        phoneOrEmail: phoneOrEmail.trim(),
        status,
        guestCount,
        message: message.trim(),
      });
      setName('');
      setPhoneOrEmail('');
      setStatus('attending');
      setGuestCount(1);
      setMessage('');
      setSuccess(true);
      setNotice('Đã lưu xác nhận tham dự. Cảm ơn bạn!');
      onSubmitted?.();
    } catch {
      setSuccess(false);
      setNotice('Chưa lưu được RSVP. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {success && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-left">
          <CheckCircle2 className="mt-0.5 text-emerald-600" size={20} />
          <div>
            <p className="text-sm font-black text-emerald-800">Đã nhận phản hồi</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-emerald-700">Cảm ơn bạn đã xác nhận cho buổi lễ tốt nghiệp.</p>
          </div>
        </div>
      )}

      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Họ tên" className={inputClass} />
      <input value={phoneOrEmail} onChange={(e) => setPhoneOrEmail(e.target.value)} placeholder="Số điện thoại hoặc email" className={inputClass} />
      <select value={status} onChange={(e) => setStatus(e.target.value as RsvpStatus)} className={inputClass}>
        <option value="attending">Tham dự</option>
        <option value="maybe">Có thể tham dự</option>
        <option value="declined">Không tham dự</option>
      </select>
      <input value={guestCount} min={0} type="number" onChange={(e) => setGuestCount(Number(e.target.value) || 0)} placeholder="Số người đi cùng" className={inputClass} />
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Lời nhắn" rows={4} className={`${inputClass} resize-none leading-6`} />
      <button type="submit" disabled={saving} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black text-white shadow-sm transition active:scale-[0.99] disabled:opacity-60" style={{ backgroundColor: primaryColor }}>
        <Send size={16} /> {saving ? 'Đang gửi...' : 'Gửi xác nhận'}
      </button>
      {notice && !success && <p className="text-center text-xs font-bold text-slate-600">{notice}</p>}
    </form>
  );
};
