import React, { useState } from 'react';
import { supabase } from '../utils/supabase';
import { User, BookOpen, GraduationCap, Phone, Send, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { playClick } from '../utils/audio';

interface CTVRegistrationFormProps {
    onSuccess?: () => void;
    onClose?: () => void;
}

export const CTVRegistrationForm: React.FC<CTVRegistrationFormProps> = ({ onSuccess, onClose }) => {
    const [formData, setFormData] = useState({
        full_name: '',
        student_batch: '',
        major: '',
        contact_info: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        playClick();
        setError(null);
        setLoading(true);

        try {
            if (!supabase) {
                // Demo Mode Simulation
                await new Promise(resolve => setTimeout(resolve, 1500));
                setSuccess(true);
                setLoading(false);
                return;
            }

            // 1. Get Current User
            const { data: { user }, error: authError } = await supabase.auth.getUser();
            
            if (authError || !user) {
                throw new Error("Bạn cần đăng nhập để thực hiện đăng ký.");
            }

            // 2. Insert Data
            const { error: insertError } = await supabase
                .from('ctv_requests')
                .insert([
                    {
                        full_name: formData.full_name,
                        student_batch: formData.student_batch,
                        major: formData.major,
                        contact_info: formData.contact_info,
                        user_id: user.id,
                        status: 'pending'
                    }
                ]);

            if (insertError) {
                // Handle duplicate request or other DB errors
                if (insertError.code === '23505') { // Unique violation
                    throw new Error("Bạn đã gửi yêu cầu rồi. Vui lòng chờ phản hồi nhé!");
                }
                throw insertError;
            }

            // 3. Success
            setSuccess(true);
            if (onSuccess) onSuccess();

        } catch (err: any) {
            console.error("Registration Error:", err);
            setError(err.message || "Có lỗi xảy ra. Vui lòng thử lại sau.");
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="flex flex-col items-center justify-center p-6 text-center animate-fadeIn">
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle2 size={32} />
                </div>
                <h3 className="text-xl font-bold text-[#003375] mb-2">Đăng ký thành công!</h3>
                <p className="text-gray-600 mb-6 text-sm">
                    Cảm ơn bạn đã quan tâm. Admin sẽ xem xét hồ sơ và liên hệ với bạn sớm nhất qua thông tin liên lạc bạn cung cấp.
                </p>
                <button 
                    onClick={onClose}
                    className="w-full bg-gray-100 text-gray-700 font-bold py-3 rounded-xl hover:bg-gray-200 transition-colors"
                >
                    Đóng
                </button>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4 p-1 animate-fadeIn">
            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    <span>{error}</span>
                </div>
            )}

            <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">
                    Họ và tên <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        name="full_name"
                        required
                        value={formData.full_name}
                        onChange={handleChange}
                        placeholder="Nguyễn Văn A"
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] focus:border-[#003375] outline-none transition-all placeholder-gray-400"
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">
                        Khóa <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                        <GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            name="student_batch"
                            required
                            value={formData.student_batch}
                            onChange={handleChange}
                            placeholder="VD: K38"
                            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] focus:border-[#003375] outline-none transition-all placeholder-gray-400"
                        />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">
                        Ngành học <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                        <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            name="major"
                            required
                            value={formData.major}
                            onChange={handleChange}
                            placeholder="VD: BIT"
                            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] focus:border-[#003375] outline-none transition-all placeholder-gray-400"
                        />
                    </div>
                </div>
            </div>

            <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">
                    Liên hệ (SĐT / Zalo / FB) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        name="contact_info"
                        required
                        value={formData.contact_info}
                        onChange={handleChange}
                        placeholder="0912..."
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] focus:border-[#003375] outline-none transition-all placeholder-gray-400"
                    />
                </div>
                <p className="text-xs text-gray-500 mt-1 italic">Thông tin này dùng để Admin liên hệ phỏng vấn bạn.</p>
            </div>

            <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#003375] text-white font-bold py-3 rounded-xl hover:bg-[#002855] transition-all active:scale-95 flex items-center justify-center gap-2 shadow-md hover:shadow-lg mt-4 disabled:opacity-70 disabled:cursor-not-allowed"
            >
                {loading ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                {loading ? 'Đang gửi hồ sơ...' : 'Gửi đăng ký'}
            </button>
        </form>
    );
};