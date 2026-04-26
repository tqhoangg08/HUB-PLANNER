import React, { useEffect } from 'react';
import { 
    BookOpen, X, Calculator, Calendar, Bell, Award, 
    Search, MessageSquare, ShieldCheck, Target, 
    BarChart3, Clock, HelpCircle, ArrowRight,
    Headset, Mail, Globe, MessageCircle
} from 'lucide-react';
import { playClick } from '../utils/audio';

interface UserGuideModalProps {
    onClose: () => void;
}

export const UserGuideModal: React.FC<UserGuideModalProps> = ({ onClose }) => {
    // 👇 ĐÃ THÊM: KHÓA CUỘN NỀN TRANG WEB KHI MỞ CẨM NANG 👇
    useEffect(() => {
        // Khi Modal được mount (mở lên) -> Khóa cuộn
        document.body.style.overflow = 'hidden';
        
        // Khi Modal bị unmount (đóng lại) -> Mở khóa cuộn
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, []);

    return (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-2 sm:p-4 animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col animate-scaleIn border border-gray-200 overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-[#003375] to-[#004b99] p-4 sm:p-5 flex justify-between items-center text-white shrink-0 shadow-md z-10 relative">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/20 p-2 rounded-xl">
                            <BookOpen size={24} className="text-yellow-300" />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg sm:text-xl leading-tight">Cẩm nang sử dụng HUB Planner</h3>
                            <p className="text-blue-200 text-xs sm:text-sm mt-0.5">Khám phá toàn bộ sức mạnh của "Trợ lý ảo học tập"</p>
                        </div>
                    </div>
                    <button
                        onClick={() => { playClick(); onClose(); }}
                        className="hover:bg-white/20 bg-white/10 p-2 rounded-full transition-colors active:scale-90"
                        title="Đóng"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar text-sm space-y-6 text-gray-700 leading-relaxed bg-slate-50">
                    
                    {/* Lời chào */}
                    <div className="bg-white border-l-4 border-blue-500 rounded-r-xl p-5 shadow-sm">
                        <p className="text-base text-gray-800">
                            👋 <strong>Chào mừng bạn đến với hệ sinh thái HUB Planner!</strong><br/>
                            Được phát triển với mục tiêu tự động hóa tối đa quy trình học tập, nền tảng này cung cấp các công cụ phân tích dữ liệu, tra cứu thời khóa biểu thông minh và tổng hợp thông tin đa luồng dành riêng cho sinh viên Đại học Ngân hàng TP.HCM. Dưới đây là hướng dẫn chi tiết cách khai thác từng tính năng.
                        </p>
                    </div>

                    <div className="space-y-6">
                        {/* Mục 1: GPA */}
                        <section className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-100 shadow-sm">
                            <div className="flex items-center gap-3 mb-4 border-b border-gray-100 pb-3">
                                <div className="p-2.5 bg-blue-100 text-blue-600 rounded-xl"><Calculator size={22}/></div>
                                <h4 className="font-bold text-[#003375] text-lg">1. Hệ thống Quản lý Điểm & Dự báo Lộ trình (GPA)</h4>
                            </div>
                            <div className="space-y-4 px-2">
                                <p>Mô-đun này không chỉ tính toán máy móc mà còn đóng vai trò là một cố vấn học tập thực thụ:</p>
                                <ul className="space-y-3">
                                    <li className="flex items-start gap-2">
                                        <ArrowRight size={16} className="text-blue-400 mt-0.5 shrink-0" />
                                        <span><strong>Tính GPA Tự động:</strong> Bạn chỉ cần nhập số tín chỉ và điểm số/điểm chữ. Hệ thống sẽ tự động sử dụng thuật toán để quy đổi giữa Hệ 10 và Hệ 4, đồng thời tự loại bỏ các môn không tính vào trung bình chung (như GDTC, GDQP).</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <Target size={16} className="text-blue-400 mt-0.5 shrink-0" />
                                        <span><strong>Giả lập & Dự báo mục tiêu (MỚI):</strong> Đặt mục tiêu điểm tốt nghiệp mong muốn (VD: 3.2 để được loại Giỏi). Hệ thống sẽ phân tích dữ liệu hiện tại và tính toán chính xác <em>"Trong các học kỳ còn lại, trung bình mỗi kỳ bạn phải đạt bao nhiêu điểm để hoàn thành mục tiêu"</em>.</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <BarChart3 size={16} className="text-blue-400 mt-0.5 shrink-0" />
                                        <span><strong>Biểu đồ so sánh học lực:</strong> Cung cấp đồ thị phân bố điểm số trực quan, giúp bạn dễ dàng so sánh thứ hạng của mình so với dữ liệu điểm của toàn trường ở học kỳ trước.</span>
                                    </li>
                                </ul>
                            </div>
                        </section>

                        {/* Mục 2: Thời khóa biểu */}
                        <section className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-100 shadow-sm">
                            <div className="flex items-center gap-3 mb-4 border-b border-gray-100 pb-3">
                                <div className="p-2.5 bg-emerald-100 text-emerald-600 rounded-xl"><Calendar size={22}/></div>
                                <h4 className="font-bold text-[#003375] text-lg">2. Thời Khóa Biểu & Lịch Thi Thông Minh</h4>
                            </div>
                            <div className="space-y-4 px-2">
                                <p>Thay vì phải nhìn vào bảng Excel nhàm chán, HUB Planner số hóa toàn bộ lịch học với các tính năng ưu việt:</p>
                                <ul className="space-y-3">
                                    <li className="flex items-start gap-2">
                                        <ArrowRight size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                                        <span><strong>Giao diện Kéo - Thả mượt mà:</strong> Hỗ trợ thao tác nhấn giữ và kéo chuột (Drag to Scroll) trên PC hệt như vuốt chạm trên điện thoại. Bạn có thể xem lịch chi tiết theo từng Tuần hoặc xem Tổng quát theo Tháng.</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <ShieldCheck size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                                        <span><strong>Bảo mật thông tin nội bộ:</strong> Tên giảng viên, số phòng học và mã lớp là thông tin nhạy cảm. Hệ thống yêu cầu bạn phải <strong>Đăng nhập tài khoản sinh viên HUB</strong> mới được phép tra cứu, đảm bảo an toàn dữ liệu nhà trường.</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <Clock size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                                        <span><strong>Thuật toán Cảnh báo Trùng lịch:</strong> Ngay khi bạn bấm thêm một môn học mới vào TKB cá nhân, trí tuệ nhân tạo sẽ quét qua 24 tuần. Nếu phát hiện <strong>trùng giờ học</strong> hoặc <strong>trùng ca thi</strong> với môn đã có, nó sẽ bật cảnh báo Đỏ để ngăn chặn bạn đăng ký nhầm!</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <HelpCircle size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                                        <span><strong>Cộng đồng tự kiểm duyệt:</strong> Nếu phát hiện phòng học/giảng viên bị sai lệch so với thực tế, hoặc không tìm thấy môn mình cần, bạn có thể dùng nút "Báo lỗi môn" và "Yêu cầu thêm môn" để gửi tín hiệu trực tiếp về cho Ban quản trị xử lý.</span>
                                    </li>
                                </ul>
                            </div>
                        </section>

                        {/* Mục 4: ĐRL */}
                        <section className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-100 shadow-sm">
                            <div className="flex items-center gap-3 mb-4 border-b border-gray-100 pb-3">
                                <div className="p-2.5 bg-orange-100 text-orange-600 rounded-xl"><Award size={22}/></div>
                                <h4 className="font-bold text-[#003375] text-lg">3. Mạng Lưới Sự Kiện & Điểm Rèn Luyện</h4>
                            </div>
                            <div className="space-y-4 px-2">
                                <p>Công cụ đắc lực giúp bạn săn đủ 100 Điểm Rèn Luyện (ĐRL) mà không tốn nhiều công sức:</p>
                                <ul className="space-y-3">
                                    <li className="flex items-start gap-2">
                                        <ArrowRight size={16} className="text-orange-400 mt-0.5 shrink-0" />
                                        <span><strong>Phân loại chuẩn hóa:</strong> Mọi hội thảo, chiến dịch tình nguyện, cuộc thi học thuật đều được gán sẵn các Mục (I, II, III, IV, V) và số điểm dự kiến dựa theo đúng bộ Quy chế đánh giá kết quả rèn luyện hiện hành của HUB.</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <ArrowRight size={16} className="text-orange-400 mt-0.5 shrink-0" />
                                        <span><strong>Theo dõi Minh chứng:</strong> Bấm vào biểu tượng <em>Cờ lưu (Bookmark)</em> ở những sự kiện bạn đã tham gia. Hệ thống sẽ gom chúng vào một Tab riêng để cuối kỳ bạn có thể lấy link điền minh chứng một cách nhanh chóng.</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <ArrowRight size={16} className="text-orange-400 mt-0.5 shrink-0" />
                                        <span><strong>Quyền lực thuộc về người dùng:</strong> Bạn tìm thấy một minigame mới trên Fanpage trường? Hãy dùng nút "Đóng góp sự kiện" để chia sẻ cho mọi người. Nếu thấy thông tin sự kiện bị sai, bấm "Báo cáo ngay" để Admin tiến hành đính chính.</span>
                                    </li>
                                </ul>
                            </div>
                        </section>

                        {/* Mục 5: Tiện ích phụ */}
                        <section className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-100 shadow-sm">
                            <div className="flex items-center gap-3 mb-4 border-b border-gray-100 pb-3">
                                <div className="p-2.5 bg-purple-100 text-purple-600 rounded-xl"><Search size={22}/></div>
                                <h4 className="font-bold text-[#003375] text-lg">4. Không Gian Tiện Ích Sinh Viên</h4>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="bg-purple-50/50 p-4 rounded-xl border border-purple-100 hover:bg-purple-50 transition-colors">
                                    <p className="font-bold text-purple-800 mb-2 flex items-center gap-2"><Search size={16}/> Chợ tìm đồ thất lạc</p>
                                    <p className="text-xs text-gray-600 leading-relaxed">Nơi đăng tin báo mất thẻ sinh viên, chìa khóa, máy tính... hoặc báo nhặt được của rơi. Một cộng đồng HUB văn minh và hỗ trợ lẫn nhau.</p>
                                </div>
                                <div className="bg-purple-50/50 p-4 rounded-xl border border-purple-100 hover:bg-purple-50 transition-colors">
                                    <p className="font-bold text-purple-800 mb-2 flex items-center gap-2"><BookOpen size={16}/> Cẩm nang sổ tay</p>
                                    <p className="text-xs text-gray-600 leading-relaxed">Kho dữ liệu số hóa chứa sơ đồ phòng học các cơ sở, link download biểu mẫu đơn từ, và tóm tắt nhanh các quy chế học vụ quan trọng.</p>
                                </div>
                                <div className="bg-purple-50/50 p-4 rounded-xl border border-purple-100 hover:bg-purple-50 transition-colors sm:col-span-2">
                                    <p className="font-bold text-purple-800 mb-2 flex items-center gap-2"><MessageSquare size={16}/> Tính năng Thảo luận (Comments)</p>
                                    <p className="text-xs text-gray-600 leading-relaxed">Được tích hợp ở hầu hết các phân hệ (Sự kiện, Tìm đồ...). Bạn có thể để lại bình luận, tag tên bạn bè hoặc hỏi đáp trực tiếp với Admin ngay bên dưới mỗi bài viết.</p>
                                </div>
                            </div>
                        </section>

                        {/* Mục 6: LIÊN HỆ & HỖ TRỢ */}
                        <section className="bg-gradient-to-br from-sky-50 to-blue-50 p-5 sm:p-6 rounded-2xl border border-sky-100 shadow-sm">
                            <div className="flex items-center gap-3 mb-4 border-b border-sky-200/50 pb-3">
                                <div className="p-2.5 bg-sky-500 text-white rounded-xl shadow-md shadow-sky-500/30"><Headset size={22}/></div>
                                <h4 className="font-bold text-[#003375] text-lg">5. Liên hệ & Hỗ trợ kỹ thuật</h4>
                            </div>
                            <div className="px-2 mb-4 text-sky-900/80">
                                Nếu bạn gặp lỗi trong quá trình sử dụng, cần đóng góp ý tưởng tính năng mới, hoặc muốn hợp tác phát triển dự án, đừng ngần ngại liên hệ với đội ngũ phát triển nhé:
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-2">
                                {/* Kênh Email */}
                                <a href="mailto:admin@hotrosinhvienhub.id.vn" className="flex items-center gap-3 bg-white p-3 rounded-xl border border-sky-100 hover:border-sky-300 hover:shadow-md transition-all group">
                                    <div className="p-2 bg-red-50 text-red-500 rounded-lg group-hover:scale-110 transition-transform"><Mail size={18}/></div>
                                    <div>
                                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Email Hỗ Trợ</p>
                                        <p className="font-bold text-[#003375] text-sm">contact@hotrosinhvienhub.id.vn</p>
                                    </div>
                                </a>

                                {/* Kênh Zalo/Hotline */}
                                <a href="#" className="flex items-center gap-3 bg-white p-3 rounded-xl border border-sky-100 hover:border-sky-300 hover:shadow-md transition-all group">
                                    <div className="p-2 bg-blue-50 text-blue-500 rounded-lg group-hover:scale-110 transition-transform"><MessageCircle size={18}/></div>
                                    <div>
                                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Zalo Hỗ Trợ / Phản hồi</p>
                                        <p className="font-bold text-[#003375] text-sm">0389.342.812 (Trần Quốc Hoàng)</p>
                                    </div>
                                </a>

                                {/* Kênh Facebook */}
                                <a href="#" target="_blank" rel="noreferrer" className="flex items-center gap-3 bg-white p-3 rounded-xl border border-sky-100 hover:border-sky-300 hover:shadow-md transition-all group">
                                    <div className="p-2 bg-indigo-50 text-indigo-500 rounded-lg group-hover:scale-110 transition-transform"><Globe size={18}/></div>
                                    <div>
                                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Cộng đồng sinh viên</p>
                                        <p className="font-bold text-[#003375] text-sm hover:underline">Fanpage HUB Planner</p>
                                    </div>
                                </a>

                                {/* Tính năng Feedback nội bộ */}
                                <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-sky-100 hover:border-sky-300 hover:shadow-md transition-all group cursor-default">
                                    <div className="p-2 bg-emerald-50 text-emerald-500 rounded-lg group-hover:scale-110 transition-transform"><MessageSquare size={18}/></div>
                                    <div>
                                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Góp ý trực tiếp</p>
                                        <p className="font-bold text-[#003375] text-sm">Sử dụng nút "Feedback" trên Menu</p>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>
                    
                    <div className="text-center pt-4 pb-2 text-gray-400 text-xs italic">
                        Dự án phi lợi nhuận phục vụ sinh viên Trường Đại học Ngân hàng TP.HCM (HUB) <br/>
                        Gặp lỗi hoặc cần hỗ trợ? Vui lòng gửi phản hồi qua tính năng Feedback.
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 sm:p-5 border-t border-gray-200 bg-white flex justify-center shrink-0 z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                    <button
                        onClick={() => { playClick(); onClose(); }}
                        className="w-full sm:w-auto px-10 py-3 sm:py-3.5 bg-gradient-to-r from-[#003375] to-blue-700 text-white font-bold text-base rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                        Đã hiểu & Bắt đầu trải nghiệm ngay!
                    </button>
                </div>
            </div>
        </div>
    );
};