import React, { useState, useRef, useEffect } from 'react';
import { X, FileUp, Smartphone, Monitor, Globe, Chrome, HelpCircle } from 'lucide-react';
import { playClick } from '../utils/audio';

interface ImportGuideModalProps {
    onClose: () => void;
    onFileClick: () => void;
}

type DeviceType = 'ios-safari' | 'ios-chrome' | 'android-chrome' | 'windows-chrome';

export const ImportGuideModal: React.FC<ImportGuideModalProps> = ({ onClose, onFileClick }) => {
    const [activeTab, setActiveTab] = useState<DeviceType>('windows-chrome');
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (contentRef.current) {
            contentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, [activeTab]);

    const guides: Record<DeviceType, { 
        label: string; 
        icon: React.ReactNode; 
        steps: { text: React.ReactNode; image?: string }[] 
    }> = {
        'windows-chrome': {
            label: 'Laptop / PC',
            icon: <Monitor size={18} />,
            steps: [
                { 
                    text: <span>Truy cập Hub Portal <a href="https://online.hub.edu.vn" target="_blank" rel="noreferrer" className="text-blue-600 underline font-semibold" onClick={playClick}>https://online.hub.edu.vn</a> &rarr; Đăng nhập &rarr; Vào mục <b>"Xem điểm"</b></span>,
                },
                { 
                    text: 'Bấm tổ hợp phím "CTRL + P" (hoặc chuột phải chọn In)',
                },
                { 
                    text: 'Tại hộp thoại in, mục Máy in chọn "Lưu dưới dạng PDF" (Save as PDF)',
                    image: '/guides/windows_chrome_b2.png'
                },
                { 
                    text: 'Bấm "Lưu"',
                    image: '/guides/windows_chrome_b3.png'
                },
                { 
                    text: 'Lưu tại vị trí bạn muốn chọn -> Hoàn thành rồi upload lên web nhé',
                }
            ]
        },
        'ios-safari': {
            label: 'iOS - Safari',
            icon: <div className="flex items-center gap-1"><Smartphone size={16} /><Globe size={14} /></div>,
            steps: [
                { 
                    text: <span>Truy cập <a href="https://online.hub.edu.vn" target="_blank" rel="noreferrer" className="text-blue-600 underline font-semibold" onClick={playClick}>online.hub.edu.vn</a> &rarr; Đăng nhập &rarr; Vào mục <b>"Xem điểm"</b></span>,
                },
                { 
                    text: 'Bấm vào mục xem thêm (nút ba chấm) -> Chia sẻ (hoặc nút Chia sẻ ở thanh công cụ dưới cùng)',
                    image: '/guides/iphone_safari_b1.png'
                },
                { 
                    text: 'Bấm nút tùy chọn (Options)',
                    image: '/guides/iphone_safari_b2.png'
                },
                { 
                    text: 'Bấm PDF',
                    image: '/guides/iphone_safari_b3.png'
                },
                { 
                    text: 'Lưu vào tệp (Save to Files)',
                    image: '/guides/iphone_safari_b4.png'
                },
                { 
                    text: 'Lưu tại vị trí bạn muốn chọn -> Hoàn thành rồi upload lên web nhé',
                    image: '/guides/iphone_safari_b5.png'
                }
            ]
        },
        'ios-chrome': {
            label: 'iOS - Chrome',
            icon: <div className="flex items-center gap-1"><Smartphone size={16} /><Chrome size={14} /></div>,
            steps: [
                { 
                    text: <span>Truy cập <a href="https://online.hub.edu.vn" target="_blank" rel="noreferrer" className="text-blue-600 underline font-semibold" onClick={playClick}>online.hub.edu.vn</a> &rarr; Đăng nhập &rarr; Vào mục <b>"Xem điểm"</b></span>,
                },
                { 
                    text: 'Bấm vào nút chia sẻ kế bên đường dẫn',
                    image: '/guides/iphone_chrome_b1.png'
                },
                { 
                    text: 'Tại danh mục chọn “In”',
                    image: '/guides/iphone_chrome_b2.png'
                },
                { 
                    text: 'Tại danh mục Tùy chọn, chọn “Chia sẻ” (hoặc biểu tượng chia sẻ ở trang In)',
                    image: '/guides/iphone_chrome_b3.png'
                },
                { 
                    text: 'Bấm “Lưu vào tệp”',
                    image: '/guides/iphone_chrome_b4.png'
                },
                { 
                    text: 'Lưu tại vị trí bạn muốn chọn -> Hoàn thành rồi upload lên web nhé',
                    image: '/guides/iphone_chrome_b5.png'
                }
            ]
        },
        'android-chrome': {
            label: 'Android - Chrome',
            icon: <div className="flex items-center gap-1"><Smartphone size={16} /><Chrome size={14} /></div>,
            steps: [
                { 
                    text: <span>Truy cập <a href="https://online.hub.edu.vn" target="_blank" rel="noreferrer" className="text-blue-600 underline font-semibold" onClick={playClick}>online.hub.edu.vn</a> &rarr; Đăng nhập &rarr; Vào mục <b>"Xem điểm"</b></span>,
                },
                { 
                    text: 'Bấm vào mục xem thêm (nút ba chấm)',
                    image: '/guides/android_chrome_b1.png'
                },
                { 
                    text: 'Tại danh mục chọn “Chia sẻ…”',
                    image: '/guides/android_chrome_b2.png'
                },
                { 
                    text: 'Bấm “In”',
                    image: '/guides/android_chrome_b3.png'
                },
                { 
                    text: 'Chọn “Lưu dưới dạng PDF” -> Bấm nút “Tải xuống” (biểu tượng PDF)',
                    image: '/guides/android_chrome_b4.png'
                },
                { 
                    text: 'Lưu tại vị trí bạn muốn chọn -> Hoàn thành rồi upload lên web nhé',
                    image: '/guides/android_chrome_b5.png'
                }
            ]
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl h-[85vh] flex flex-col overflow-hidden border border-gray-200 animate-scaleIn">
                
                {/* --- HEADER --- */}
                <div className="bg-[#003375] p-4 flex justify-between items-center text-white flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <FileUp className="text-white/90" size={20} />
                        <h3 className="font-bold text-lg">Hướng dẫn lấy file bảng điểm</h3>
                    </div>
                    <button
                        onClick={() => { playClick(); onClose(); }}
                        className="hover:bg-white/20 p-2 rounded-full transition-colors active:scale-90"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* --- TABS --- */}
                <div className="flex border-b border-gray-200 overflow-x-auto no-scrollbar flex-shrink-0 bg-gray-50">
                    {(Object.keys(guides) as DeviceType[]).map((key) => (
                        <button
                            key={key}
                            onClick={() => { playClick(); setActiveTab(key); }}
                            className={`flex items-center gap-2 px-5 py-3 text-sm font-bold whitespace-nowrap transition-all border-b-2 ${
                                activeTab === key 
                                    ? 'border-[#990000] text-[#990000] bg-white' 
                                    : 'border-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                            }`}
                        >
                            {guides[key].icon}
                            {guides[key].label}
                        </button>
                    ))}
                </div>

                {/* --- BODY --- */}
                <div ref={contentRef} className="flex-1 overflow-y-auto p-0 bg-gray-50/50 scroll-smooth">
                    <div className="p-5 space-y-6">
                        {guides[activeTab].steps.map((step, index) => (
                            <div key={index} className="flex gap-4">
                                <div className="flex-shrink-0">
                                    <div className="w-8 h-8 rounded-full bg-[#003375] text-white flex items-center justify-center font-bold text-sm shadow-sm">
                                        {index} 
                                    </div>
                                    {index < guides[activeTab].steps.length - 1 && (
                                        <div className="w-0.5 h-full bg-gray-200 mx-auto mt-1" />
                                    )}
                                </div>
                                <div className="flex-1 pb-2">
                                    <p className="text-gray-800 font-medium text-sm leading-relaxed mb-3 mt-1.5">
                                        {step.text}
                                    </p>
                                    
                                    {step.image && (
                                        <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-gray-50 mt-3 flex justify-center p-2">
                                            <img 
                                                src={step.image} 
                                                alt={`Bước ${index}`} 
                                                className="w-auto h-auto object-contain max-h-[150px] rounded-lg border border-gray-100"
                                                onError={(e) => {
                                                    e.currentTarget.style.display = 'none'; 
                                                    e.currentTarget.parentElement!.style.display = 'none'; 
                                                }}
                                            />
                                        </div>
                                    )}
                                    {/* --------------------------------------- */}
                                </div>
                            </div>
                        ))}

                        {/* Footer Note */}
                        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3 mt-4">
                            <HelpCircle className="text-blue-600 flex-shrink-0 mt-0.5" size={18} />
                            <div className="text-sm text-blue-800">
                                <p className="font-bold mb-1">Cần hỗ trợ?</p>
                                <p>Mọi thắc mắc, không rõ ở bước nào thì liên hệ qua <a href="https://www.facebook.com/hubplannerr" target="_blank" rel="noreferrer" className="underline font-semibold hover:text-blue-900" onClick={playClick}>Fanpage</a> giúp mình nhenn.</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* --- FOOTER --- */}
                <div className="p-4 border-t border-gray-200 bg-white flex justify-end gap-3 flex-shrink-0 z-10">
                    <button
                        onClick={() => { playClick(); onClose(); }}
                        className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition active:scale-95"
                    >
                        Để sau
                    </button>
                    <button
                        onClick={() => { playClick(); onFileClick(); }}
                        className="px-5 py-2.5 rounded-xl bg-[#990000] text-white font-bold hover:bg-[#7a0000] hover:shadow-lg transition-all flex items-center gap-2 active:scale-95 transform hover:-translate-y-0.5"
                    >
                        <FileUp size={18} />
                        Chọn file PDF
                    </button>
                </div>
                
            </div>
        </div>
    );
};