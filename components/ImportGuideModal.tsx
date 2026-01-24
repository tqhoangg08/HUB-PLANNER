import React from 'react';
import { ExternalLink, X, FileUp, AlertTriangle } from 'lucide-react';
import { playClick } from '../utils/audio';

interface ImportGuideModalProps {
    onClose: () => void;
    onFileClick: () => void;
}

export const ImportGuideModal: React.FC<ImportGuideModalProps> = ({ onClose, onFileClick }) => (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-scaleIn border border-gray-200">
            <div className="bg-[#003375] p-4 flex justify-between items-center text-white">
                <h3 className="font-bold text-lg flex items-center gap-2">
                    <FileUp size={20} /> Hướng dẫn lấy file bảng điểm
                </h3>
                <button
                    onClick={() => { playClick(); onClose(); }}
                    className="hover:bg-white/20 p-2 rounded-full transition-colors active:scale-90"
                >
                    <X size={20} />
                </button>
            </div>

            <div className="p-6 space-y-6">
                <div className="space-y-4">
                    <div className="flex gap-4 group">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-[#003375] font-bold flex items-center justify-center flex-shrink-0 group-hover:bg-[#003375] group-hover:text-white transition-colors duration-300">1</div>
                        <div>
                            <p className="font-medium text-gray-900 mb-1">Truy cập Hub Portal</p>
                            <a
                                href="https://online.hub.edu.vn"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#003375] underline flex items-center gap-1 hover:text-blue-700 text-sm font-semibold hover:translate-x-1 transition-transform"
                                onClick={playClick}
                            >
                                https://online.hub.edu.vn <ExternalLink size={14} />
                            </a>
                        </div>
                    </div>

                    <div className="flex gap-4 group">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-[#003375] font-bold flex items-center justify-center flex-shrink-0 group-hover:bg-[#003375] group-hover:text-white transition-colors duration-300">2</div>
                        <div>
                            <p className="font-medium text-gray-900">Đăng nhập tài khoản sinh viên</p>
                        </div>
                    </div>

                    <div className="flex gap-4 group">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-[#003375] font-bold flex items-center justify-center flex-shrink-0 group-hover:bg-[#003375] group-hover:text-white transition-colors duration-300">3</div>
                        <div>
                            <p className="font-medium text-gray-900">Vào mục "Xem điểm"</p>
                        </div>
                    </div>

                    <div className="flex gap-4 group">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-[#003375] font-bold flex items-center justify-center flex-shrink-0 group-hover:bg-[#003375] group-hover:text-white transition-colors duration-300">4</div>
                        <div>
                            <p className="font-medium text-gray-900">Bấm tổ hợp phím <span className="bg-gray-100 px-2 py-0.5 rounded border border-gray-300 font-mono text-sm text-[#990000]">CTRL + P</span></p>
                        </div>
                    </div>

                    <div className="flex gap-4 group">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-[#003375] font-bold flex items-center justify-center flex-shrink-0 group-hover:bg-[#003375] group-hover:text-white transition-colors duration-300">5</div>
                        <div>
                            <p className="font-medium text-gray-900">Tại hộp thoại in, chọn "Lưu dưới dạng PDF" (Save as PDF) và bấm Lưu</p>
                        </div>
                    </div>
                </div>

                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex gap-3 items-start text-sm text-orange-800">
                    <AlertTriangle size={20} className="shrink-0 mt-0.5" />
                    <div className="space-y-2">
                        <p>
                            <strong>Lưu ý quan trọng: HIỆN TẠI WEB ĐANG BẢO TRÌ TÍNH NĂNG NHẬP BẢNG ĐIỂM BẰNG PDF, MỌI NGƯỜI TẠM THỜI NHẬP THỦ CÔNG BẰNG TAY GIÚP SỐP VỚI NHÉ HIC. SỐP SẼ SỚM QUAY TRỞ LẠI Ạ</strong>
                        </p>
                    </div>
                </div>

                <div className="pt-4 border-t border-gray-100 flex gap-3">
                    <button
                        onClick={() => { playClick(); onClose(); }}
                        className="flex-1 py-3 text-gray-600 font-medium hover:bg-gray-100 rounded-xl transition-all active:scale-95"
                    >
                        Để sau
                    </button>
                    <button
                        onClick={() => { playClick(); onFileClick(); }}
                        className="flex-1 bg-[#990000] text-white py-3 rounded-xl font-bold hover:bg-[#7a0000] hover:shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95 transform hover:-translate-y-0.5"
                    >
                        <FileUp size={18} />
                        Chọn file PDF
                    </button>
                </div>
            </div>
        </div>
    </div>
);
