import React, { useState, useEffect } from 'react';
import { Crown, Check, Sparkles, Zap, Shield, MessageSquare, FileText, Star, ArrowLeft, Loader2, Copy, CheckCircle2, X } from 'lucide-react';
import { fetchPremiumPlans, PremiumPlan, PlanId } from '../hooks/useSubscription';
import { supabase } from '../utils/supabase';
import { playClick } from '../utils/audio';
import { useNavigate } from 'react-router-dom';

interface PricingPageProps {
    userId?: string;
    isPremium?: boolean;
    currentPlan?: PlanId;
    onClose?: () => void;
}

const BANK_INFO = {
    bank: 'MB Bank',
    accountNumber: '0987654321',
    accountName: 'TRAN QUOC HOANG',
    content: 'HUBPREMIUM',
};

export const PricingPage: React.FC<PricingPageProps> = ({ userId, isPremium, currentPlan, onClose }) => {
    const navigate = useNavigate();
    const [plans, setPlans] = useState<PremiumPlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPlan, setSelectedPlan] = useState<PremiumPlan | null>(null);
    const [showPayment, setShowPayment] = useState(false);
    const [copied, setCopied] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [paymentRef, setPaymentRef] = useState('');
    const [showSuccess, setShowSuccess] = useState(false);

    useEffect(() => {
        const loadPlans = async () => {
            const data = await fetchPremiumPlans();
            setPlans(data.filter(p => p.id !== 'free'));
            setLoading(false);
        };
        loadPlans();
    }, []);

    const formatPrice = (price: number) => {
        return new Intl.NumberFormat('vi-VN').format(price) + 'đ';
    };

    const getPricePerDay = (plan: PremiumPlan) => {
        if (plan.duration_days === 0) return '0đ';
        return Math.round(plan.price / plan.duration_days).toLocaleString('vi-VN') + 'đ/ngày';
    };

    const getDiscount = (plan: PremiumPlan) => {
        const monthlyPlan = plans.find(p => p.id === 'premium_monthly');
        if (!monthlyPlan || plan.id === 'premium_monthly') return null;
        const monthlyEquivalent = (monthlyPlan.price / 30) * plan.duration_days;
        const discount = Math.round((1 - plan.price / monthlyEquivalent) * 100);
        return discount > 0 ? discount : null;
    };

    const handleSelectPlan = (plan: PremiumPlan) => {
        playClick();
        setSelectedPlan(plan);
        setShowPayment(true);
    };

    const handleCopy = (text: string, field: string) => {
        navigator.clipboard.writeText(text);
        setCopied(field);
        setTimeout(() => setCopied(''), 2000);
    };

    const handleSubmitPayment = async () => {
        if (!userId || !selectedPlan || !paymentRef.trim()) return;
        playClick();
        setSubmitting(true);

        try {
            // Tạo payment record với status pending
            const { error } = await supabase
                .from('payment_history')
                .insert({
                    user_id: userId,
                    amount: selectedPlan.price,
                    method: 'bank_transfer',
                    transaction_ref: paymentRef.trim(),
                    status: 'pending',
                    note: `Đăng ký ${selectedPlan.name}`,
                });

            if (error) throw error;

            setShowSuccess(true);
            setShowPayment(false);
        } catch (err) {
            console.error('Lỗi gửi xác nhận:', err);
            alert('Có lỗi xảy ra, vui lòng thử lại!');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <Loader2 className="animate-spin text-blue-500" size={32} />
            </div>
        );
    }

    // Success Screen
    if (showSuccess) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center animate-fadeIn">
                <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-4">
                    <CheckCircle2 size={40} className="text-green-500" />
                </div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Gửi xác nhận thành công!</h2>
                <p className="text-gray-600 max-w-md mb-6">
                    Chúng tôi sẽ xác nhận thanh toán trong vòng <strong>5-30 phút</strong> (giờ hành chính).
                    Sau khi xác nhận, tài khoản sẽ được nâng cấp Premium tự động.
                </p>
                <button
                    onClick={() => onClose ? onClose() : navigate(-1)}
                    className="px-6 py-3 bg-[#003375] text-white rounded-xl font-medium hover:bg-[#002255] transition-colors"
                >
                    Quay lại ứng dụng
                </button>
            </div>
        );
    }

    // Payment Modal
    if (showPayment && selectedPlan) {
        const transferContent = `${BANK_INFO.content} ${userId?.slice(0, 8).toUpperCase()}`;

        return (
            <div className="min-h-screen bg-gray-50 p-4 sm:p-6 animate-fadeIn">
                <div className="max-w-lg mx-auto">
                    {/* Header */}
                    <button
                        onClick={() => setShowPayment(false)}
                        className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-6"
                    >
                        <ArrowLeft size={20} />
                        <span>Quay lại</span>
                    </button>

                    <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center">
                                <Crown size={20} className="text-white" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-gray-800">Thanh toán {selectedPlan.name}</h2>
                                <p className="text-sm text-gray-500">{formatPrice(selectedPlan.price)} / {selectedPlan.duration_days} ngày</p>
                            </div>
                        </div>

                        {/* Bank Transfer Info */}
                        <div className="bg-blue-50 rounded-xl p-4 mb-6 space-y-3">
                            <h3 className="font-semibold text-blue-900 text-sm uppercase tracking-wide">Thông tin chuyển khoản</h3>
                            
                            {[
                                { label: 'Ngân hàng', value: BANK_INFO.bank, key: 'bank' },
                                { label: 'Số tài khoản', value: BANK_INFO.accountNumber, key: 'account' },
                                { label: 'Tên TK', value: BANK_INFO.accountName, key: 'name' },
                                { label: 'Nội dung CK', value: transferContent, key: 'content' },
                                { label: 'Số tiền', value: formatPrice(selectedPlan.price), key: 'amount' },
                            ].map(item => (
                                <div key={item.key} className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs text-blue-700">{item.label}</p>
                                        <p className="font-semibold text-blue-900">{item.value}</p>
                                    </div>
                                    <button
                                        onClick={() => handleCopy(item.value, item.key)}
                                        className="p-2 rounded-lg hover:bg-blue-100 transition-colors"
                                        title="Sao chép"
                                    >
                                        {copied === item.key ? (
                                            <CheckCircle2 size={16} className="text-green-500" />
                                        ) : (
                                            <Copy size={16} className="text-blue-600" />
                                        )}
                                    </button>
                                </div>
                            ))}
                        </div>

                        {/* QR Code placeholder */}
                        <div className="bg-gray-50 rounded-xl p-4 mb-6 text-center">
                            <div className="w-48 h-48 mx-auto bg-white rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center mb-2">
                                <div className="text-center">
                                    <Zap size={32} className="mx-auto text-gray-400 mb-2" />
                                    <p className="text-xs text-gray-500">QR Chuyển khoản</p>
                                    <p className="text-xs text-gray-400">Sẽ được cập nhật</p>
                                </div>
                            </div>
                            <p className="text-xs text-gray-500">Quét mã QR bằng app ngân hàng để thanh toán nhanh</p>
                        </div>

                        {/* Transaction Reference Input */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Mã giao dịch (sau khi chuyển khoản)
                            </label>
                            <input
                                type="text"
                                value={paymentRef}
                                onChange={(e) => setPaymentRef(e.target.value)}
                                placeholder="VD: FT26051100123456"
                                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                            />
                            <p className="text-xs text-gray-500 mt-1">Nhập mã giao dịch từ tin nhắn ngân hàng để xác nhận nhanh hơn</p>
                        </div>

                        {/* Submit Button */}
                        <button
                            onClick={handleSubmitPayment}
                            disabled={submitting || !paymentRef.trim()}
                            className="w-full py-3.5 bg-gradient-to-r from-[#003375] to-[#0055cc] text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg transition-all flex items-center justify-center gap-2"
                        >
                            {submitting ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" />
                                    Đang gửi...
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 size={18} />
                                    Xác nhận đã thanh toán
                                </>
                            )}
                        </button>

                        <p className="text-xs text-center text-gray-500 mt-4">
                            Tài khoản sẽ được kích hoạt Premium trong 5-30 phút sau khi xác nhận thành công
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // Main Pricing Page
    return (
        <div className="min-h-screen bg-gradient-to-b from-[#f0f4ff] to-white p-4 sm:p-6 animate-fadeIn">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <button
                        onClick={() => onClose ? onClose() : navigate(-1)}
                        className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
                    >
                        <ArrowLeft size={20} />
                        <span className="hidden sm:inline">Quay lại</span>
                    </button>
                    {isPremium && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-yellow-100 to-orange-100 rounded-full">
                            <Crown size={14} className="text-orange-500" />
                            <span className="text-xs font-semibold text-orange-700">Đang dùng Premium</span>
                        </div>
                    )}
                </div>

                {/* Hero Section */}
                <div className="text-center mb-10">
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full text-white text-sm font-medium mb-4 shadow-lg shadow-orange-200">
                        <Sparkles size={16} />
                        <span>Nâng cấp trải nghiệm</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
                        HUB Planner <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-500 to-orange-500">Premium</span>
                    </h1>
                    <p className="text-gray-600 max-w-md mx-auto">
                        Mở khóa toàn bộ sức mạnh AI và các tính năng nâng cao dành riêng cho sinh viên BUH
                    </p>
                </div>

                {/* Feature Comparison */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-10">
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <Zap size={20} className="text-yellow-500" />
                        So sánh tính năng
                    </h3>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                        <div className="font-medium text-gray-600 py-2">Tính năng</div>
                        <div className="font-semibold text-center text-gray-800 py-2">Miễn phí</div>
                        <div className="font-semibold text-center text-orange-600 py-2 flex items-center justify-center gap-1">
                            <Crown size={14} /> Premium
                        </div>

                        {[
                            { feature: 'Quản lý điểm số', free: true, premium: true },
                            { feature: 'Xem lịch học', free: true, premium: true },
                            { feature: 'Sự kiện & Lost Found', free: true, premium: true },
                            { feature: 'AI Advisor', free: '5 tin/ngày', premium: 'Không giới hạn' },
                            { feature: 'Phân tích điểm nâng cao', free: false, premium: true },
                            { feature: 'Xuất PDF chuyên nghiệp', free: false, premium: true },
                            { feature: 'Huy hiệu Premium', free: false, premium: true },
                            { feature: 'Ưu tiên hỗ trợ', free: false, premium: true },
                        ].map((row, i) => (
                            <React.Fragment key={i}>
                                <div className="py-2.5 text-gray-700 border-t border-gray-50">{row.feature}</div>
                                <div className="py-2.5 text-center border-t border-gray-50">
                                    {row.free === true ? (
                                        <Check size={16} className="inline text-green-500" />
                                    ) : row.free === false ? (
                                        <X size={16} className="inline text-gray-300" />
                                    ) : (
                                        <span className="text-xs text-gray-500">{row.free}</span>
                                    )}
                                </div>
                                <div className="py-2.5 text-center border-t border-gray-50">
                                    {row.premium === true ? (
                                        <Check size={16} className="inline text-orange-500" />
                                    ) : (
                                        <span className="text-xs font-medium text-orange-600">{row.premium}</span>
                                    )}
                                </div>
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                {/* Pricing Cards */}
                <div className="grid sm:grid-cols-3 gap-4 mb-10">
                    {plans.map((plan) => {
                        const discount = getDiscount(plan);
                        const isPopular = plan.id === 'premium_semester';
                        const isCurrent = currentPlan === plan.id;

                        return (
                            <div
                                key={plan.id}
                                className={`relative bg-white rounded-2xl p-6 border-2 transition-all hover:shadow-xl ${
                                    isPopular
                                        ? 'border-orange-400 shadow-lg shadow-orange-100 scale-[1.02]'
                                        : 'border-gray-100 hover:border-blue-200'
                                }`}
                            >
                                {/* Popular Badge */}
                                {isPopular && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-orange-400 to-yellow-400 rounded-full text-white text-xs font-bold shadow-md">
                                        PHỔ BIẾN NHẤT
                                    </div>
                                )}

                                {/* Discount Badge */}
                                {discount && (
                                    <div className="absolute -top-2 -right-2 w-12 h-12 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold shadow-md">
                                        -{discount}%
                                    </div>
                                )}

                                <div className="text-center mb-4">
                                    <h3 className="font-bold text-gray-800 text-lg">{plan.name}</h3>
                                    <p className="text-xs text-gray-500 mt-1">{plan.duration_days} ngày sử dụng</p>
                                </div>

                                <div className="text-center mb-4">
                                    <span className="text-3xl font-extrabold text-gray-900">{formatPrice(plan.price)}</span>
                                    <p className="text-xs text-gray-500 mt-1">{getPricePerDay(plan)}</p>
                                </div>

                                {/* Features */}
                                <ul className="space-y-2 mb-6">
                                    {plan.features.map((feature, i) => (
                                        <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                                            <Check size={14} className="text-green-500 mt-0.5 flex-shrink-0" />
                                            <span>{feature}</span>
                                        </li>
                                    ))}
                                </ul>

                                {/* CTA Button */}
                                <button
                                    onClick={() => handleSelectPlan(plan)}
                                    disabled={isCurrent}
                                    className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
                                        isCurrent
                                            ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                                            : isPopular
                                            ? 'bg-gradient-to-r from-orange-400 to-yellow-400 text-white hover:shadow-lg hover:shadow-orange-200'
                                            : 'bg-[#003375] text-white hover:bg-[#002255] hover:shadow-lg'
                                    }`}
                                >
                                    {isCurrent ? 'Đang sử dụng' : 'Chọn gói này'}
                                </button>
                            </div>
                        );
                    })}
                </div>

                {/* Trust Signals */}
                <div className="grid grid-cols-3 gap-4 mb-8">
                    {[
                        { icon: Shield, label: 'Bảo mật tuyệt đối', desc: 'Dữ liệu được mã hóa' },
                        { icon: MessageSquare, label: 'Hỗ trợ 24/7', desc: 'Qua Zalo & Email' },
                        { icon: Star, label: 'Hoàn tiền', desc: 'Trong 3 ngày đầu' },
                    ].map(({ icon: Icon, label, desc }, i) => (
                        <div key={i} className="text-center p-3">
                            <Icon size={24} className="mx-auto text-blue-500 mb-2" />
                            <p className="text-xs font-semibold text-gray-800">{label}</p>
                            <p className="text-xs text-gray-500">{desc}</p>
                        </div>
                    ))}
                </div>

                {/* FAQ */}
                <div className="bg-white rounded-2xl p-6 border border-gray-100">
                    <h3 className="font-bold text-gray-800 mb-4">Câu hỏi thường gặp</h3>
                    {[
                        {
                            q: 'Thanh toán như thế nào?',
                            a: 'Chuyển khoản ngân hàng với nội dung theo hướng dẫn. Tài khoản được kích hoạt trong 5-30 phút.',
                        },
                        {
                            q: 'Có thể hoàn tiền không?',
                            a: 'Có! Trong 3 ngày đầu nếu bạn không hài lòng, chúng tôi hoàn tiền 100%.',
                        },
                        {
                            q: 'Premium hết hạn thì sao?',
                            a: 'Tài khoản tự động chuyển về gói Miễn phí. Dữ liệu vẫn được giữ nguyên.',
                        },
                        {
                            q: 'AI Advisor miễn phí khác gì Premium?',
                            a: 'Gói miễn phí giới hạn 5 tin nhắn/ngày. Premium không giới hạn và có phản hồi nhanh hơn.',
                        },
                    ].map((item, i) => (
                        <details key={i} className="group mb-2">
                            <summary className="cursor-pointer py-2 text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors list-none flex items-center justify-between">
                                {item.q}
                                <span className="text-gray-400 group-open:rotate-180 transition-transform">▾</span>
                            </summary>
                            <p className="text-sm text-gray-600 pb-2 pl-0">{item.a}</p>
                        </details>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default PricingPage;
