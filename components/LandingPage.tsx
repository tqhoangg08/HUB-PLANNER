import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, TrendingUp, Award, Search, ArrowRight, CheckCircle2, Shield } from 'lucide-react';
import { playClick } from '../utils/audio';

// ============================================================================
// COMPONENT HIỆU ỨNG: Mờ dần và trượt từ dưới lên khi lướt tới
// ============================================================================
const FadeInUp = ({ children, delay = 0 }: { children: React.ReactNode, delay?: number }) => {
    const [isVisible, setIsVisible] = useState(false);
    const domRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    // Sau khi hiện rồi thì ngừng theo dõi để không bị giật khi cuộn lên cuộn xuống
                    if (domRef.current) observer.unobserve(domRef.current);
                }
            });
        }, { rootMargin: '0px 0px -50px 0px' }); // Kích hoạt khi phần tử cách đáy màn hình 50px

        if (domRef.current) observer.observe(domRef.current);
        return () => observer.disconnect();
    }, []);

    return (
        <div
            ref={domRef}
            className={`transition-all duration-1000 ease-out ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
            }`}
            style={{ transitionDelay: `${delay}ms` }}
        >
            {children}
        </div>
    );
};

// ============================================================================
// MAIN COMPONENT: LANDING PAGE
// ============================================================================
export const LandingPage: React.FC = () => {
    const navigate = useNavigate();

    const handleStart = () => {
        playClick();
        navigate('/role'); // Chuyển hướng sang trang chọn vai trò
    };

    return (
        // 60% Trắng/Xám nhạt cho toàn bộ nền
        <div className="min-h-screen bg-[#F8FAFC] font-sans text-gray-800 overflow-x-hidden selection:bg-[#003375] selection:text-white">
            
            {/* NAVBAR */}
            <nav className="fixed top-0 left-0 w-full bg-white/80 backdrop-blur-md border-b border-gray-100 z-50">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <img src="logo.png" alt="HUB Logo" className="h-8 w-8 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        <span className="font-black text-[#003375] text-lg tracking-tight uppercase">HUB Planner</span>
                    </div>
                    <button onClick={handleStart} className="text-sm font-bold text-[#003375] hover:text-[#990000] transition-colors">
                        Đăng nhập
                    </button>
                </div>
            </nav>

            {/* HERO SECTION (Phần đầu tiên đập vào mắt) */}
            <section className="pt-32 pb-20 px-4 sm:px-6 relative">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-100 rounded-full blur-3xl opacity-30 pointer-events-none"></div>
                
                <div className="max-w-4xl mx-auto text-center relative z-10">
                    <FadeInUp>
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-blue-700 font-semibold text-xs mb-6 uppercase tracking-wider">
                            <Shield size={14} /> Dự án hỗ trợ sinh viên HUB
                        </div>
                    </FadeInUp>
                    
                    <FadeInUp delay={100}>
                        <h1 className="text-4xl md:text-6xl font-black text-gray-900 tracking-tight leading-tight mb-6">
                            Quản lý học tập thông minh <br className="hidden md:block"/>
                            dành riêng cho <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#003375] to-blue-500">Sinh Viên HUB</span>
                        </h1>
                    </FadeInUp>

                    <FadeInUp delay={200}>
                        <p className="text-lg text-gray-500 mb-10 max-w-2xl mx-auto leading-relaxed">
                            Công cụ toàn diện giúp bạn đồng bộ thời khóa biểu, tính toán điểm GPA, theo dõi điểm rèn luyện và lập kế hoạch học tập hiệu quả.
                        </p>
                    </FadeInUp>

                    <FadeInUp delay={300}>
                        <button 
                            onClick={handleStart}
                            className="bg-[#003375] text-white px-8 py-4 rounded-full font-bold text-lg hover:bg-[#002855] hover:shadow-lg hover:shadow-blue-900/20 transition-all active:scale-95 flex items-center gap-2 mx-auto"
                        >
                            Khám phá ngay <ArrowRight size={20} />
                        </button>
                        <p className="text-xs text-gray-400 mt-4">Không yêu cầu cài đặt phần mềm • Trải nghiệm miễn phí</p>
                    </FadeInUp>
                </div>
            </section>

            {/* FEATURES SECTION (Các tính năng chính) */}
            <section className="py-20 bg-white border-y border-gray-100">
                <div className="max-w-6xl mx-auto px-4 sm:px-6">
                    <FadeInUp>
                        <div className="text-center mb-16">
                            <h2 className="text-3xl font-extrabold text-gray-900 mb-4">Mọi thứ bạn cần, trong một nền tảng</h2>
                            <p className="text-gray-500">Được thiết kế dựa trên cấu trúc chương trình học thực tế của trường.</p>
                        </div>
                    </FadeInUp>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                        <FadeInUp delay={100}>
                            <FeatureCard 
                                icon={<Calendar size={28} className="text-[#003375]" />}
                                title="Thời Khóa Biểu"
                                description="Tự động trích xuất từ file PDF của trường. Cảnh báo trùng lịch, xem lịch học theo tuần và tháng."
                            />
                        </FadeInUp>
                        <FadeInUp delay={200}>
                            <FeatureCard 
                                icon={<TrendingUp size={28} className="text-[#990000]" />}
                                title="Tính Điểm GPA"
                                description="Tính toán chính xác GPA hệ 4, hệ 10. Dự báo điểm cần đạt để nhận học bổng hoặc ra trường đúng hạn."
                            />
                        </FadeInUp>
                        <FadeInUp delay={300}>
                            <FeatureCard 
                                icon={<Award size={28} className="text-green-600" />}
                                title="Sự Kiện ĐRL"
                                description="Tổng hợp nhanh chóng các hội thảo, cuộc thi trong & ngoài trường giúp bạn tích lũy ĐRL dễ dàng."
                            />
                        </FadeInUp>
                        <FadeInUp delay={400}>
                            <FeatureCard 
                                icon={<Search size={28} className="text-orange-500" />}
                                title="Tìm Đồ Thất Lạc"
                                description="Cộng đồng chia sẻ, tìm kiếm đồ đạc đánh rơi ngay trong khuôn viên cơ sở Thủ Đức và Quận 1."
                            />
                        </FadeInUp>
                    </div>
                </div>
            </section>

            {/* CALL TO ACTION BOTTOM */}
            <section className="py-24 px-4 sm:px-6 bg-[#F8FAFC]">
                <div className="max-w-4xl mx-auto bg-gradient-to-br from-[#003375] to-[#001f4d] rounded-3xl p-10 md:p-16 text-center shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                    
                    <FadeInUp>
                        <h2 className="text-3xl md:text-4xl font-black text-white mb-6">
                            Sẵn sàng tối ưu hóa lộ trình của bạn?
                        </h2>
                        <p className="text-blue-100 mb-10 max-w-xl mx-auto">
                            Gia nhập cùng cộng đồng sinh viên HUB để việc học trở nên nhẹ nhàng và hệ thống hơn bao giờ hết.
                        </p>
                        <div className="flex flex-col sm:flex-row justify-center gap-4">
                            <button 
                                onClick={handleStart}
                                className="bg-white text-[#003375] px-8 py-4 rounded-full font-bold text-lg hover:bg-gray-50 transition-all active:scale-95 shadow-lg"
                            >
                                Bắt đầu sử dụng
                            </button>
                        </div>
                        <div className="flex flex-wrap justify-center items-center gap-4 sm:gap-8 mt-8 text-blue-200 text-sm font-medium">
                            <span className="flex items-center gap-1.5"><CheckCircle2 size={16} className="text-green-400"/> Miễn phí</span>
                            <span className="flex items-center gap-1.5"><CheckCircle2 size={16} className="text-green-400"/> Dễ sử dụng</span>
                            <span className="flex items-center gap-1.5"><CheckCircle2 size={16} className="text-green-400"/> Bảo mật cao</span>
                        </div>
                    </FadeInUp>
                </div>
            </section>

            {/* FOOTER */}
            <footer className="text-center py-8 border-t border-gray-200 text-gray-500 bg-white">
                <p className="text-xs font-medium tracking-wide mb-2 uppercase">Web designed by tqhoangg</p>
                <div className="flex items-center justify-center gap-4 text-xs font-semibold tracking-wide text-gray-400">
                    <span className="hover:text-[#003375] cursor-pointer">Chính sách bảo mật</span>
                    <span>•</span>
                    <span className="hover:text-[#003375] cursor-pointer">Điều khoản sử dụng</span>
                </div>
            </footer>
        </div>
    );
};

// --- COMPONENT THẺ TÍNH NĂNG ---
const FeatureCard = ({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) => {
    return (
        <div className="bg-[#F8FAFC] p-8 rounded-[1.5rem] border border-gray-100 hover:border-blue-200 hover:shadow-lg transition-all duration-300 group hover:-translate-y-2 text-left">
            <div className="w-14 h-14 bg-white rounded-xl shadow-sm flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                {icon}
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">{title}</h3>
            <p className="text-gray-500 leading-relaxed text-sm">{description}</p>
        </div>
    );
};