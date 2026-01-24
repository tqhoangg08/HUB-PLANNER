import React from 'react';
import { BookOpen, X } from 'lucide-react';
import { playClick } from '../utils/audio';

interface UserGuideModalProps {
    onClose: () => void;
}

export const UserGuideModal: React.FC<UserGuideModalProps> = ({ onClose }) => (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-fadeIn">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col animate-scaleIn border border-gray-200 overflow-hidden">
            <div className="bg-[#003375] p-4 flex justify-between items-center text-white shrink-0">
                <h3 className="font-bold text-lg flex items-center gap-2">
                    <BookOpen size={20} className="text-yellow-300" /> Hướng dẫn sử dụng HUB Planner
                </h3>
                <button
                    onClick={() => { playClick(); onClose(); }}
                    className="hover:bg-white/20 p-2 rounded-full transition-colors active:scale-90"
                >
                    <X size={20} />
                </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar text-sm space-y-6 text-gray-700 leading-relaxed">
                <p>Ứng dụng này được thiết kế như một "trợ lý học tập" toàn diện, giúp sinh viên quản lý điểm số, lập kế hoạch GPA, theo dõi điểm rèn luyện và tìm kiếm thông tin tiện ích.</p>
                <div className="space-y-4">
                    <section>
                        <h4 className="font-bold text-[#003375] text-base mb-2">1. Bảng điểm cá nhân</h4>
                        <ul className="list-disc pl-5 space-y-1">
                            <li>Nhập điểm từng môn để hệ thống tự động tính GPA (Hệ 4 & Hệ 10).</li>
                            <li>Theo dõi tiến độ tích lũy tín chỉ và xếp loại học lực.</li>
                            <li>Sử dụng tính năng "Dự báo mục tiêu" để biết cần đạt bao nhiêu điểm mỗi kỳ tới.</li>
                        </ul>
                    </section>

                    <section>
                        <h4 className="font-bold text-[#003375] text-base mb-2">2. Xếp hạng & So sánh</h4>
                        <ul className="list-disc pl-5 space-y-1">
                            <li>Xem thứ hạng dự báo của bạn so với dữ liệu quá khứ.</li>
                            <li>Biểu đồ phân bố điểm giúp bạn biết mình đang ở đâu so với mặt bằng chung.</li>
                        </ul>
                    </section>

                    <section>
                        <h4 className="font-bold text-[#003375] text-base mb-2">3. Tiện ích khác</h4>
                        <ul className="list-disc pl-5 space-y-1">
                            <li><strong>Sự kiện ĐRL:</strong> Cập nhật các hoạt động ngoại khóa mới nhất.</li>
                            <li><strong>Tìm đồ thất lạc:</strong> Đăng tin tìm đồ hoặc báo nhặt được đồ.</li>
                            <li><strong>Cẩm nang:</strong> Tổng hợp quy chế, biểu mẫu và thông tin cần thiết.</li>
                        </ul>
                    </section>
                </div>
            </div>
        </div>
    </div>
);
