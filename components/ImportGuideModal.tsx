import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Chrome, FileUp, Globe, HelpCircle, Monitor, Smartphone, X } from 'lucide-react';
import { playClick } from '../utils/audio';

interface ImportGuideModalProps {
    onClose: () => void;
    onFileClick: () => void;
    onFileDrop?: (file: File) => void;
    securitySlot?: React.ReactNode;
    canSelectFile?: boolean;
}

type DeviceType = 'windows-chrome' | 'ios-safari' | 'ios-chrome' | 'android-chrome';

export const ImportGuideModal: React.FC<ImportGuideModalProps> = ({ onClose, onFileClick, securitySlot, canSelectFile = true }) => {
    const [activeTab, setActiveTab] = useState<DeviceType>('windows-chrome');

    const chooseFile = () => {
        if (!canSelectFile) return;
        playClick();
        onFileClick();
    };

    const guides: Record<DeviceType, { label: string; icon: React.ReactNode; steps: React.ReactNode[] }> = {
        'windows-chrome': {
            label: 'Laptop / PC',
            icon: <Monitor size={18} />,
            steps: [
                <span>
                    Truy cập Hub Portal{' '}
                    <a href="https://online.hub.edu.vn" target="_blank" rel="noreferrer" className="font-semibold text-blue-600 underline">
                        https://online.hub.edu.vn
                    </a>{' '}
                    → Đăng nhập → Vào mục <b>"Xem điểm"</b>
                </span>,
                'Bấm tổ hợp phím "Ctrl + P" hoặc chuột phải chọn In',
                'Tại hộp thoại in, mục Máy in chọn "Lưu dưới dạng PDF" (Save as PDF)',
                'Bấm "Lưu"',
                'Lưu file vào vị trí bạn muốn, sau đó quay lại web để upload',
            ],
        },
        'ios-safari': {
            label: 'iOS - Safari',
            icon: <div className="flex items-center gap-1"><Smartphone size={16} /><Globe size={14} /></div>,
            steps: [
                <span>
                    Truy cập Hub Portal{' '}
                    <a href="https://online.hub.edu.vn" target="_blank" rel="noreferrer" className="font-semibold text-blue-600 underline">
                        https://online.hub.edu.vn
                    </a>{' '}
                    → Đăng nhập → Vào mục <b>"Xem điểm"</b>
                </span>,
                'Bấm nút Chia sẻ trên Safari',
                'Chọn Tùy chọn (Options)',
                'Chọn định dạng PDF',
                'Bấm "Lưu vào Tệp" (Save to Files)',
                'Chọn vị trí lưu file, rồi quay lại web để upload',
            ],
        },
        'ios-chrome': {
            label: 'iOS - Chrome',
            icon: <div className="flex items-center gap-1"><Smartphone size={16} /><Chrome size={14} /></div>,
            steps: [
                <span>
                    Truy cập Hub Portal{' '}
                    <a href="https://online.hub.edu.vn" target="_blank" rel="noreferrer" className="font-semibold text-blue-600 underline">
                        https://online.hub.edu.vn
                    </a>{' '}
                    → Đăng nhập → Vào mục <b>"Xem điểm"</b>
                </span>,
                'Bấm nút Chia sẻ cạnh thanh địa chỉ',
                'Trong danh sách, chọn "In"',
                'Ở màn hình in, bấm nút Chia sẻ',
                'Chọn "Lưu vào Tệp"',
                'Chọn vị trí lưu file, rồi quay lại web để upload',
            ],
        },
        'android-chrome': {
            label: 'Android - Chrome',
            icon: <div className="flex items-center gap-1"><Smartphone size={16} /><Chrome size={14} /></div>,
            steps: [
                <span>
                    Truy cập Hub Portal{' '}
                    <a href="https://online.hub.edu.vn" target="_blank" rel="noreferrer" className="font-semibold text-blue-600 underline">
                        https://online.hub.edu.vn
                    </a>{' '}
                    → Đăng nhập → Vào mục <b>"Xem điểm"</b>
                </span>,
                'Bấm nút ba chấm trên Chrome',
                'Chọn "Chia sẻ..."',
                'Chọn "In"',
                'Chọn "Lưu dưới dạng PDF" rồi bấm nút tải xuống',
                'Chọn vị trí lưu file, rồi quay lại web để upload',
            ],
        },
    };

    const activeGuide = guides[activeTab];

    return createPortal(
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/60 p-4 animate-fadeIn">
            <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl animate-scaleIn">
                <div className="flex shrink-0 items-center justify-between bg-[#003375] p-4 text-white">
                    <div className="flex items-center gap-2">
                        <FileUp className="text-white/90" size={20} />
                        <h3 className="text-lg font-bold">Hướng dẫn lấy file bảng điểm</h3>
                    </div>
                    <button onClick={() => { playClick(); onClose(); }} className="rounded-full p-2 transition-colors hover:bg-white/20 active:scale-90">
                        <X size={20} />
                    </button>
                </div>

                <div className="no-scrollbar flex shrink-0 overflow-x-auto border-b border-gray-200 bg-gray-50">
                    {(Object.keys(guides) as DeviceType[]).map((key) => (
                        <button
                            key={key}
                            onClick={() => { playClick(); setActiveTab(key); }}
                            className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-bold transition-all ${
                                activeTab === key ? 'border-[#990000] bg-white text-[#990000]' : 'border-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                            }`}
                        >
                            {guides[key].icon} {guides[key].label}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto bg-gray-50/50 p-6">
                    <div className="space-y-4">
                        {activeGuide.steps.map((step, index) => (
                            <div key={index} className="flex gap-4">
                                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#003375] text-sm font-bold text-white shadow-sm">
                                    {index + 1}
                                </div>
                                <p className="mt-1 text-sm font-medium leading-relaxed text-gray-800">{step}</p>
                            </div>
                        ))}
                    </div>

                    <div className="mt-6 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
                        <HelpCircle className="mt-0.5 shrink-0 text-blue-600" size={18} />
                        <div className="text-sm text-blue-800">
                            <p className="mb-1 font-bold">Cần hỗ trợ?</p>
                            <p>
                                Nếu không rõ bước nào, liên hệ qua{' '}
                                <a href="https://www.facebook.com/hubplannerr" target="_blank" rel="noreferrer" className="font-semibold underline hover:text-blue-900">
                                    Fanpage HUB Planner
                                </a>{' '}
                                giúp mình nha.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="z-10 shrink-0 border-t border-gray-200 bg-white p-4">
                    {securitySlot && <div className="mb-4 flex justify-center">{securitySlot}</div>}
                    <div className="flex items-center justify-between gap-3">
                        <button
                            onClick={() => {
                                playClick();
                                window.open('https://hotrosinhvienhub.id.vn/handbook/feedback', '_blank');
                            }}
                            className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-bold text-red-500 transition-colors hover:bg-red-50 hover:text-red-700"
                            title="Báo cáo nếu file không đọc được"
                        >
                            <AlertTriangle size={16} /> Báo lỗi
                        </button>

                        <div className="flex gap-3">
                            <button onClick={() => { playClick(); onClose(); }} className="rounded-xl border border-gray-300 px-5 py-2.5 font-medium text-gray-700 transition hover:bg-gray-50 active:scale-95">
                                Để sau
                            </button>
                            <button
                                onClick={chooseFile}
                                disabled={!canSelectFile}
                                className="flex items-center gap-2 rounded-xl bg-[#990000] px-5 py-2.5 font-bold text-white transition-all hover:bg-[#7a0000] hover:shadow-lg active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none"
                            >
                                <FileUp size={18} /> Chọn file PDF
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
};
