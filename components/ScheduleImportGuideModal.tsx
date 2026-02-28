import React, { useState } from 'react';
import { createPortal } from 'react-dom'; 
import { X, FileUp, Smartphone, Monitor, Globe, Chrome, HelpCircle, AlertTriangle } from 'lucide-react'; // ĐÃ THÊM AlertTriangle
import { playClick } from '../utils/audio';

interface Props {
    onClose: () => void;
    onFileClick: () => void;
}

type DeviceType = 'ios-safari' | 'ios-chrome' | 'android-chrome' | 'windows-chrome';

export const ScheduleImportGuideModal: React.FC<Props> = ({ onClose, onFileClick }) => {
    const [activeTab, setActiveTab] = useState<DeviceType>('windows-chrome');

    const guides: Record<DeviceType, { label: string; icon: React.ReactNode; steps: React.ReactNode[] }> = {
        'windows-chrome': {
            label: 'Laptop / PC',
            icon: <Monitor size={18} />,
            steps: [
                <span>Truy cập Hub Portal <a href="https://online.hub.edu.vn" target="_blank" rel="noreferrer" className="text-blue-600 underline font-semibold">https://online.hub.edu.vn</a> &rarr; Đăng nhập &rarr; Vào mục <b>"Thời khóa biểu - Lịch thi"</b></span>,
                'Chọn năm học và học kỳ cần nhập -> Chọn “In thời khóa biểu”',
                'Tại hộp thoại in, chọn "Lưu dưới dạng PDF" (Save as PDF)',
                'Bấm “Lưu”',
                'Lưu tại vị trí bạn muốn chọn -> Hoàn thành rùi upload lên web nhée'
            ]
        },
        'ios-safari': {
            label: 'iOS - Safari',
            icon: <div className="flex items-center gap-1"><Smartphone size={16} /><Globe size={14} /></div>,
            steps: [
                <span>Truy cập Hub Portal <a href="https://online.hub.edu.vn" target="_blank" rel="noreferrer" className="text-blue-600 underline font-semibold">https://online.hub.edu.vn</a> &rarr; Đăng nhập &rarr; Vào mục <b>"Thời khóa biểu - Lịch thi"</b></span>,
                'Chọn năm học và học kỳ cần nhập -> Chọn “In thời khóa biểu”',
                'Tại danh mục Tùy chọn, chọn “Chia sẻ”',
                'Bấm “Lưu vào tệp”',
                'Lưu tại vị trí bạn muốn chọn -> Hoàn thành rùi upload lên web nhée'
            ]
        },
        'ios-chrome': {
            label: 'iOS - Chrome',
            icon: <div className="flex items-center gap-1"><Smartphone size={16} /><Chrome size={14} /></div>,
            steps: [
                <span>Truy cập Hub Portal <a href="https://online.hub.edu.vn" target="_blank" rel="noreferrer" className="text-blue-600 underline font-semibold">https://online.hub.edu.vn</a> &rarr; Đăng nhập &rarr; Vào mục <b>"Thời khóa biểu - Lịch thi"</b></span>,
                'Chọn năm học và học kỳ cần nhập -> Chọn “In thời khóa biểu”',
                'Tại danh mục Tùy chọn, chọn “Chia sẻ”',
                'Bấm “Lưu vào tệp”',
                'Lưu tại vị trí bạn muốn chọn -> Hoàn thành rùi upload lên web nhée'
            ]
        },
        'android-chrome': {
            label: 'Android - Chrome',
            icon: <div className="flex items-center gap-1"><Smartphone size={16} /><Chrome size={14} /></div>,
            steps: [
                <span>Truy cập Hub Portal <a href="https://online.hub.edu.vn" target="_blank" rel="noreferrer" className="text-blue-600 underline font-semibold">https://online.hub.edu.vn</a> &rarr; Đăng nhập &rarr; Vào mục <b>"Thời khóa biểu - Lịch thi"</b></span>,
                'Chọn năm học và học kỳ cần nhập -> Chọn “In thời khóa biểu”',
                'Chọn “Lưu dưới dạng PDF” -> Bấm nút “Tải xuống”',
                'Lưu tại vị trí bạn muốn chọn -> Hoàn thành rùi upload lên web nhée'
            ]
        }
    };

    return createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100000] flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden border border-gray-200 animate-scaleIn">
                <div className="bg-[#003375] p-4 flex justify-between items-center text-white flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <FileUp className="text-white/90" size={20} />
                        <h3 className="font-bold text-lg">Hướng dẫn nhập TKB bằng PDF</h3>
                    </div>
                    <button onClick={() => { playClick(); onClose(); }} className="hover:bg-white/20 p-2 rounded-full transition-colors active:scale-90"><X size={20} /></button>
                </div>

                <div className="flex border-b border-gray-200 overflow-x-auto no-scrollbar flex-shrink-0 bg-gray-50">
                    {(Object.keys(guides) as DeviceType[]).map((key) => (
                        <button
                            key={key}
                            onClick={() => { playClick(); setActiveTab(key); }}
                            className={`flex items-center gap-2 px-4 py-3 text-sm font-bold whitespace-nowrap transition-all border-b-2 ${
                                activeTab === key ? 'border-[#990000] text-[#990000] bg-white' : 'border-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                            }`}
                        >
                            {guides[key].icon} {guides[key].label}
                        </button>
                    ))}
                </div>

                <div className="p-6 space-y-4 bg-gray-50/50">
                    {guides[activeTab].steps.map((step, index) => (
                        <div key={index} className="flex gap-4">
                            <div className="w-7 h-7 rounded-full bg-[#003375] text-white flex items-center justify-center font-bold text-sm shadow-sm shrink-0 mt-0.5">{index + 1}</div>
                            <p className="text-gray-800 font-medium text-sm leading-relaxed mt-1">{step}</p>
                        </div>
                    ))}
                    
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3 mt-6">
                        <HelpCircle className="text-yellow-600 flex-shrink-0 mt-0.5" size={18} />
                        <div className="text-sm text-yellow-800">
                            <p className="font-bold mb-1">Lưu ý quan trọng</p>
                            <p>Mọi thắc mắc, không rõ ở bước nào thì liên hệ qua <a href="https://www.facebook.com/hubplannerr" target="_blank" rel="noreferrer" className="underline font-bold hover:text-yellow-900">Fanpage HUB Planner</a> giúp mình nhenn.</p>
                        </div>
                    </div>
                </div>

                {/* --- FOOTER ĐÃ THÊM NÚT BÁO LỖI --- */}
                <div className="p-4 border-t border-gray-200 bg-white flex justify-between items-center flex-shrink-0 z-10">
                    <button 
                        onClick={() => {
                            playClick();
                            window.open('https://www.facebook.com/hubplannerr', '_blank');
                        }} 
                        className="flex items-center gap-1.5 text-red-500 hover:text-red-700 text-sm font-bold px-2 py-2 rounded-lg hover:bg-red-50 transition-colors"
                        title="Báo cáo nếu file không đọc được"
                    >
                        <AlertTriangle size={16} /> Báo lỗi
                    </button>

                    <div className="flex gap-3">
                        <button onClick={() => { playClick(); onClose(); }} className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition active:scale-95">Để sau</button>
                        <button onClick={() => { playClick(); onFileClick(); }} className="px-5 py-2.5 rounded-xl bg-[#003375] text-white font-bold hover:bg-[#002855] hover:shadow-lg transition-all flex items-center gap-2 active:scale-95">
                            <FileUp size={18} /> Chọn file PDF
                        </button>
                    </div>
                </div>

            </div>
        </div>,
        document.body
    );
};