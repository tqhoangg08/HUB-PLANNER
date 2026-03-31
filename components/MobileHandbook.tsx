import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom'; 
import {
    Search, Phone, Mail, MapPin, Users, Book, Award,
    Copy, Check, HelpCircle, ExternalLink, Info, Heart, Facebook, User,
    MessageSquarePlus, Crown, ChevronLeft
} from 'lucide-react';
import { playClick } from '../utils/audio';
import { supabase } from '../utils/supabase';

// ✨ THÊM 'terms' VÀ 'privacy' VÀO ĐÂY
type TabType = 'contacts' | 'clubs' | 'scholarships' | 'regulations' | 'faqs' | 'about' | 'feedback' | 'donate' | 'terms' | 'privacy';
const VALID_TABS: TabType[] = ['contacts', 'clubs', 'scholarships', 'regulations', 'faqs', 'about', 'feedback', 'donate', 'terms', 'privacy'];

export const MobileHandbook: React.FC = () => {
    const { tab } = useParams<{ tab: string }>(); 
    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState<TabType>(() => {
        if (tab && VALID_TABS.includes(tab as TabType)) return tab as TabType;
        return 'contacts';
    });

    const [searchTerm, setSearchTerm] = useState('');
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const [feedbackType, setFeedbackType] = useState<'bug' | 'idea'>('idea');
    const [feedbackContent, setFeedbackContent] = useState('');
    const [contactInfo, setContactInfo] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');

    const [donateForm, setDonateForm] = useState({ name: '', mssv: '', amount: '', message: '' });
    const [isDonating, setIsDonating] = useState(false);
    const [donors, setDonors] = useState<any[]>([]);
    const [loadingDonors, setLoadingDonors] = useState(false);

    useEffect(() => {
        document.title = "Cẩm nang | HUB Planner";
    }, []);

    useEffect(() => {
        if (tab && VALID_TABS.includes(tab as TabType)) {
            setActiveTab(tab as TabType);
        } else if (!tab) {
            setActiveTab('contacts'); 
        }
    }, [tab]);

    useEffect(() => {
        if (activeTab === 'donate') fetchDonors();
    }, [activeTab]);

    const fetchDonors = async () => {
        setLoadingDonors(true);
        const { data, error } = await supabase.from('donations').select('*').order('amount', { ascending: false }); 
        if (!error && data) setDonors(data);
        setLoadingDonors(false);
    };

    const handleDonateSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!donateForm.name || !donateForm.amount) return;
        setIsDonating(true);
        try {
            const cleanAmount = parseInt(donateForm.amount.replace(/\D/g, '')) || 0;
            const { error } = await supabase.from('donations').insert([{
                name: donateForm.name, student_id: donateForm.mssv, message: donateForm.message, amount: cleanAmount
            }]);
            if (error) throw error;
            alert("Cảm ơn tấm lòng vàng của bạn! ❤️");
            setDonateForm({ name: '', mssv: '', amount: '', message: '' }); 
            fetchDonors(); 
        } catch (error) {
            alert("Có lỗi xảy ra, vui lòng thử lại.");
        } finally {
            setIsDonating(false);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
    };

    const handleSubmitFeedback = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!feedbackContent.trim()) return;
        setIsSubmitting(true);
        try {
            const { error } = await supabase.from('feedback').insert([{ type: feedbackType, content: feedbackContent, contact: contactInfo }]);
            if (error) throw error;
            setSubmitStatus('success');
            setFeedbackContent('');
            setContactInfo('');
            setTimeout(() => setSubmitStatus('idle'), 5000);
        } catch (error) {
            setSubmitStatus('error');
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- DỮ LIỆU ---
    const contacts = [
        { name: 'Phòng Đào tạo', email: 'phongdaotao@hub.edu.vn', phone: '028.38.212.430', loc: '56 HD2 & 36 TTĐ' },
        { name: 'Phòng Công tác SV', email: 'trungtamsvvaqhdn@hub.edu.vn', phone: '028.38.971.636', loc: '56 HD2' },
        { name: 'Phòng Khảo thí', email: 'phongktdbcl@hub.edu.vn', phone: '028.39.144.932', loc: '56 HD2' },
        { name: 'Phòng Kế toán', email: 'phongketoan@hub.edu.vn', phone: '028.38.212.591', loc: '36 TTĐ' },
        { name: 'Thư viện', email: 'thuvien@hub.edu.vn', phone: '028.38.971.651', loc: '56 HD2' },
        { name: 'Trạm Y tế', email: 'toyte.tccb@hub.edu.vn', phone: '0912.048.079', loc: 'Các cơ sở' },
    ];

    const clubs = [
        {
            type: 'Học thuật & Kỹ năng', list: [
                { name: 'CLB Anh văn STEP', link: 'https://www.facebook.com/stepclubhub', email: 'clb.step@hub.edu.vn', manager: 'Đoàn trường' },
                { name: 'CLB SV NCKH (SRC)', link: 'https://www.facebook.com/spyclubhub', email: 'clb.nckh@hub.edu.vn', manager: 'Đoàn trường' },
                { name: 'CLB Tài chính (BUSF)', link: 'https://www.facebook.com/BUSFClub', email: 'busf@hub.edu.vn', manager: 'Đoàn khoa TC' },
                { name: 'Ban Sự kiện', link: 'https://www.facebook.com/bansukienhub', email: 'bansukien@hub.edu.vn', manager: 'Đoàn trường' }
            ]
        }
    ];

    const faqs = [
        {
            group: "Bảo Mật & Tài Khoản",
            items: [
                { q: "Web có lưu mật khẩu Portal không?", a: "Tuyệt đối KHÔNG. Việc đăng nhập Portal chỉ diễn ra cục bộ trên trình duyệt của bạn." },
                { q: "Tại sao đổi máy thì dữ liệu bị mất?", a: "Hãy đăng nhập để hệ thống đồng bộ dữ liệu của bạn lên mây nhé." }
            ]
        }
    ];

    const filteredContacts = contacts.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));

    const copyToClipboard = (text: string, id: string) => {
        playClick();
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const renderContent = () => {
        switch (activeTab) {
            case 'contacts':
                return (
                    <div className="animate-fadeIn pb-6">
                        <div className="mb-4 relative">
                            <input type="text" placeholder="Tìm khoa, phòng ban..." className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 focus:border-[#003375] outline-none text-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        </div>
                        <div className="space-y-3">
                            {filteredContacts.map((c, idx) => (
                                <div key={idx} className="bg-white p-4 rounded-xl border border-gray-200 active:bg-gray-50 transition-colors relative" onClick={() => copyToClipboard(c.email, `email-${idx}`)}>
                                    <div className="absolute top-4 right-4 text-gray-400">
                                        {copiedId === `email-${idx}` ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
                                    </div>
                                    <h3 className="font-bold text-[#003375] text-sm mb-2 pr-6">{c.name}</h3>
                                    <div className="space-y-1.5 text-xs text-gray-600">
                                        <div className="flex items-center gap-2"><Mail size={12} className="text-gray-400" /> {c.email}</div>
                                        <div className="flex items-center gap-2"><Phone size={12} className="text-gray-400" /> {c.phone}</div>
                                        <div className="flex items-start gap-2"><MapPin size={12} className="text-gray-400 mt-0.5 shrink-0" /> <span>{c.loc}</span></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            case 'clubs':
                return (
                    <div className="space-y-4 animate-fadeIn pb-6">
                        {clubs.map((group, idx) => (
                            <div key={idx} className="bg-white p-4 rounded-xl border border-gray-200">
                                <h4 className="font-bold text-[#990000] border-b border-gray-100 pb-2 mb-3 text-sm">{group.type}</h4>
                                <ul className="space-y-3">
                                    {group.list.map((item, i) => (
                                        <li key={i} className="border-b border-gray-50 last:border-0 pb-3 last:pb-0">
                                            <div className="flex justify-between items-start mb-1.5">
                                                <span className="text-xs font-bold text-gray-800">{item.name}</span>
                                                {item.link && <a href={item.link} target="_blank" rel="noopener noreferrer" onClick={playClick} className="text-blue-500 bg-blue-50 p-1.5 rounded-full"><ExternalLink size={12} /></a>}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{item.manager}</span>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                );
            case 'scholarships':
                return (
                    <div className="space-y-4 animate-fadeIn pb-6">
                        <h3 className="text-sm font-bold text-[#003375] mb-2 flex items-center gap-2"><Award className="text-[#990000]" size={16}/> Học bổng KKHT</h3>
                        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-[#003375] text-white">
                                    <tr><th className="p-3">Loại HB</th><th className="p-3 text-center">GPA</th><th className="p-3 text-center">ĐRL</th></tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    <tr><td className="p-3 font-bold">Xuất sắc</td><td className="p-3 text-center font-bold text-green-600">3.6-4.0</td><td className="p-3 text-center text-[10px]">90-100</td></tr>
                                    <tr><td className="p-3 font-bold">Giỏi</td><td className="p-3 text-center font-bold text-blue-600">3.2-3.5</td><td className="p-3 text-center text-[10px]">80-100</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            case 'faqs':
                return (
                    <div className="space-y-4 animate-fadeIn pb-6">
                        {faqs.map((group, idx) => (
                            <div key={idx} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                <div className="bg-gray-50 px-4 py-2.5 text-[#003375] font-bold text-xs uppercase tracking-wide border-b border-gray-200">{group.group}</div>
                                <div className="divide-y divide-gray-100">
                                    {group.items.map((item, i) => (
                                        <div key={i} className="p-4">
                                            <h4 className="font-bold text-gray-800 text-xs mb-2 flex gap-1.5 leading-snug"><span className="text-[#990000]">Q:</span> <span>{item.q}</span></h4>
                                            <p className="text-gray-600 text-xs leading-relaxed pl-4 border-l border-blue-200"><span className="font-bold text-[#003375] mr-1">A:</span> {item.a}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                );
            case 'feedback':
                return (
                    <div className="animate-fadeIn pb-6">
                        {submitStatus === 'success' ? (
                            <div className="bg-white p-6 rounded-xl border border-gray-200 text-center animate-scaleIn">
                                <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3"><Check size={24} /></div>
                                <h4 className="font-bold text-gray-800 mb-1 text-sm">Đã gửi thành công!</h4>
                                <p className="text-xs text-gray-500 mb-4">Cảm ơn bạn đã đóng góp ý kiến.</p>
                                <button onClick={() => setSubmitStatus('idle')} className="text-xs text-[#003375] font-bold bg-blue-50 px-4 py-2 rounded-lg">Gửi phản hồi khác</button>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmitFeedback} className="bg-white p-4 rounded-xl border border-gray-200 space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <button type="button" onClick={() => setFeedbackType('bug')} className={`p-3 rounded-xl border flex flex-col items-center gap-1 ${feedbackType === 'bug' ? 'bg-red-50 border-red-500 text-red-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                                        <span className="font-bold text-xs">Báo lỗi</span>
                                    </button>
                                    <button type="button" onClick={() => setFeedbackType('idea')} className={`p-3 rounded-xl border flex flex-col items-center gap-1 ${feedbackType === 'idea' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                                        <span className="font-bold text-xs">Góp ý</span>
                                    </button>
                                </div>
                                <textarea required rows={4} placeholder="Nội dung chi tiết..." className="w-full p-3 rounded-xl border border-gray-200 focus:border-[#003375] outline-none text-sm" value={feedbackContent} onChange={(e) => setFeedbackContent(e.target.value)}></textarea>
                                <input type="text" placeholder="Email/SĐT (Không bắt buộc)" className="w-full p-3 rounded-xl border border-gray-200 focus:border-[#003375] outline-none text-sm" value={contactInfo} onChange={(e) => setContactInfo(e.target.value)} />
                                <button type="submit" disabled={isSubmitting} className="w-full bg-[#003375] text-white font-bold py-3 rounded-xl active:scale-95 transition-transform text-sm">{isSubmitting ? 'Đang gửi...' : 'Gửi phản hồi'}</button>
                            </form>
                        )}
                    </div>
                );
            case 'donate':
                return (
                    <div className="animate-fadeIn pb-6 space-y-6">
                        <div className="bg-gradient-to-br from-pink-500 to-rose-500 rounded-2xl p-5 text-white text-center shadow-lg">
                            <h2 className="text-xl font-black mb-2">Ủng hộ Server</h2>
                            <p className="text-xs text-pink-100 mb-4 opacity-90">Mọi sự đóng góp dù nhỏ nhất đều là động lực to lớn với dự án phi lợi nhuận này!</p>
                            <div className="w-40 h-40 bg-white p-2 rounded-xl mx-auto shadow-inner"><img src="/qr-code.png" alt="QR" className="w-full h-full object-cover rounded-lg" /></div>
                        </div>
                        <form onSubmit={handleDonateSubmit} className="bg-white p-5 rounded-xl border border-gray-200 space-y-3">
                            <h3 className="font-bold text-sm text-[#003375] mb-2">Xác nhận ủng hộ</h3>
                            <input type="text" required placeholder="Tên của bạn *" className="w-full p-3 rounded-xl border border-gray-200 text-sm outline-none" value={donateForm.name} onChange={e => setDonateForm({...donateForm, name: e.target.value})} />
                            <input type="text" required placeholder="Số tiền (VNĐ) *" className="w-full p-3 rounded-xl border border-gray-200 text-sm outline-none" value={donateForm.amount} onChange={e => setDonateForm({...donateForm, amount: e.target.value})} />
                            <input type="text" placeholder="Lời nhắn..." className="w-full p-3 rounded-xl border border-gray-200 text-sm outline-none" value={donateForm.message} onChange={e => setDonateForm({...donateForm, message: e.target.value})} />
                            <button type="submit" disabled={isDonating} className="w-full bg-pink-600 text-white font-bold py-3 rounded-xl active:scale-95 transition-transform text-sm">{isDonating ? 'Đang gửi...' : 'Xác nhận'}</button>
                        </form>
                        <div className="bg-white p-4 rounded-xl border border-gray-200">
                            <h3 className="font-bold text-sm text-yellow-600 mb-3 flex items-center gap-1"><Crown size={16}/> Bảng vàng tri ân</h3>
                            <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                                {donors.map((d, i) => (
                                    <div key={i} className="flex justify-between items-center p-2.5 bg-gray-50 rounded-lg">
                                        <div><p className="font-bold text-xs text-gray-800">{d.name}</p>{d.message && <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-1 italic">"{d.message}"</p>}</div>
                                        <span className="font-bold text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">{formatCurrency(d.amount)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                );
            case 'about':
                return (
                    <div className="animate-fadeIn pb-6 text-center space-y-6">
                        <img src="/logo.png" alt="Logo" className="w-24 h-24 mx-auto drop-shadow-md" />
                        <div>
                            <h2 className="text-2xl font-black text-[#003375] mb-2">HUB PLANNER</h2>
                            <p className="text-xs text-gray-600 leading-relaxed px-4">Dự án phi lợi nhuận hỗ trợ học tập và đời sống dành riêng cho sinh viên Đại học Ngân hàng TP.HCM.</p>
                        </div>
                        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm text-left mx-2">
                            <h3 className="font-bold text-sm text-gray-800 mb-3 border-b pb-2">Người sáng lập</h3>
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-blue-100 text-[#003375] font-black text-xl flex items-center justify-center rounded-full">H</div>
                                <div>
                                    <p className="font-bold text-sm">Trần Quốc Hoàng</p>
                                    <div className="flex gap-2 mt-1.5">
                                        <a href="tel:0389342812" className="bg-gray-100 p-1.5 rounded-full text-gray-600"><Phone size={14}/></a>
                                        <a href="https://facebook.com/tqhoangg.05" target="_blank" className="bg-blue-50 p-1.5 rounded-full text-blue-600"><Facebook size={14}/></a>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );

            // ✨ CODE MỚI: ĐIỀU KHOẢN SỬ DỤNG
            case 'terms':
                return (
                    <div className="animate-fadeIn pb-6 space-y-5 bg-white p-4 rounded-xl border border-gray-200 text-sm text-gray-700 leading-relaxed text-justify">
                        <div className="text-center border-b border-gray-100 pb-3 mb-3">
                            <p className="text-[11px] text-gray-500 italic">Phiên bản 1.1 - Cập nhật: 25/02/2026</p>
                        </div>
                        <div>
                            <h3 className="font-bold text-[#003375] text-sm mb-1 uppercase">1. Chấp thuận điều khoản</h3>
                            <p>Bằng việc đăng nhập, bạn xác nhận đã đọc, hiểu rõ và đồng ý tuân thủ toàn bộ các quy định trong bản Điều khoản này.</p>
                        </div>
                        <div>
                            <h3 className="font-bold text-[#003375] text-sm mb-1 uppercase">2. Tuyên bố miễn trừ trách nhiệm</h3>
                            <p className="text-red-600 font-medium">HUB Planner KHÔNG PHẢI là sản phẩm chính thức của Trường Đại học Ngân hàng TP.HCM (HUB).</p>
                            <p className="mt-1">Dữ liệu về Thời khóa biểu, Lịch thi được đồng bộ tham khảo từ online.hub.edu.vn. Tính năng GPA/ĐRL chỉ mang tính chất tham khảo. Sinh viên có trách nhiệm đối chiếu lại kết quả với Portal của trường trước khi ra quyết định.</p>
                        </div>
                        <div>
                            <h3 className="font-bold text-[#003375] text-sm mb-1 uppercase">3. Tài khoản và Bảo mật</h3>
                            <p>Khi dùng máy công cộng, bạn có trách nhiệm Đăng xuất hoặc dùng tính năng Xóa dữ liệu (Reset) trước khi rời đi để tránh lộ thông tin.</p>
                        </div>
                        <div>
                            <h3 className="font-bold text-[#003375] text-sm mb-1 uppercase">4. Quyền sở hữu trí tuệ</h3>
                            <p>Mã nguồn, dữ liệu biên tập thuộc sở hữu của HUB Planner. Nghiêm cấm thu thập trái phép (Crawling) từ hệ thống.</p>
                        </div>
                        <div>
                            <h3 className="font-bold text-[#003375] text-sm mb-1 uppercase">5. Chính sách Donate</h3>
                            <p>Mọi khoản đóng góp là tự nguyện gây quỹ duy trì Server. Chúng tôi KHÔNG áp dụng chính sách hoàn tiền.</p>
                        </div>
                    </div>
                );

            // ✨ CODE MỚI: CHÍNH SÁCH BẢO MẬT
            case 'privacy':
                return (
                    <div className="animate-fadeIn pb-6 space-y-5 bg-white p-4 rounded-xl border border-gray-200 text-sm text-gray-700 leading-relaxed text-justify">
                        <div className="text-center border-b border-gray-100 pb-3 mb-3">
                            <p className="text-[11px] text-gray-500 italic">Phiên bản 1.1 - Cập nhật: 25/02/2026</p>
                        </div>
                        <div>
                            <h3 className="font-bold text-[#003375] text-sm mb-1 uppercase">1. Dữ liệu thu thập</h3>
                            <p>Khi đăng nhập Google, chúng tôi chỉ thu thập: Tên, Email và Ảnh đại diện. Dữ liệu học tập do bạn nhập được mã hóa và lưu trữ an toàn.</p>
                            <div className="bg-red-50 text-red-600 p-2 text-xs font-bold mt-2 rounded border border-red-100">
                                ⚠️ TUYÊN BỐ: Chúng tôi KHÔNG BAO GIỜ lấy mật khẩu Portal hay mật khẩu Google của bạn.
                            </div>
                        </div>
                        <div>
                            <h3 className="font-bold text-[#003375] text-sm mb-1 uppercase">2. Mục đích sử dụng</h3>
                            <p>Đồng bộ dữ liệu học tập giữa các thiết bị, tính toán GPA và tùy biến thời khóa biểu cho riêng bạn.</p>
                        </div>
                        <div>
                            <h3 className="font-bold text-[#003375] text-sm mb-1 uppercase">3. Cam kết Không chia sẻ</h3>
                            <p>Chúng tôi TUYỆT ĐỐI KHÔNG bán hoặc cho thuê dữ liệu của bạn cho bất kỳ đơn vị quảng cáo nào.</p>
                        </div>
                        <div>
                            <h3 className="font-bold text-[#003375] text-sm mb-1 uppercase">4. Quyền của bạn</h3>
                            <p>Bạn có toàn quyền chỉnh sửa hoặc yêu cầu XÓA VĨNH VIỄN toàn bộ dữ liệu của mình bằng nút "Xóa dữ liệu" trong mục Cài đặt.</p>
                        </div>
                    </div>
                );
            default: return null;
        }
    };

    const getHeaderInfo = () => {
        switch (activeTab) {
            case 'contacts': return { title: 'Cẩm nang', sub: 'Danh bạ Phòng ban & Khoa' };
            case 'clubs': return { title: 'CLB - Đội - Nhóm', sub: 'Hoạt động ngoại khóa & Đoàn - Hội' };
            case 'scholarships': return { title: 'Học bổng & Quy chế', sub: 'Thông tin học vụ & Chế độ' };
            case 'faqs': return { title: 'Câu hỏi thường gặp', sub: 'Hỗ trợ giải đáp (FAQs)' };
            case 'feedback': return { title: 'Góp ý & Phản hồi', sub: 'Đóng góp ý tưởng phát triển' };
            case 'donate': return { title: 'Ủng hộ & Tri ân', sub: 'Đồng hành cùng dự án' };
            case 'about': return { title: 'Về chúng mình', sub: 'Đội ngũ HUB Planner' };
            case 'terms': return { title: 'Điều khoản dịch vụ', sub: 'Quy định sử dụng' };  // ✨ ĐÃ THÊM
            case 'privacy': return { title: 'Chính sách bảo mật', sub: 'Bảo vệ quyền riêng tư' }; // ✨ ĐÃ THÊM
            default: return { title: 'Cẩm nang', sub: 'Thông tin sinh viên' };
        }
    };

    const headerInfo = getHeaderInfo();

    return (
        <div className="min-h-[100dvh] bg-[#F8FAFC] flex flex-col font-sans relative">
            <div className="bg-[#003375] px-4 pt-12 pb-4 text-white shrink-0 sticky top-0 z-40 shadow-md">
                <div className="flex items-center justify-between">
                    <button onClick={() => { playClick(); navigate(-1); }} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors active:scale-95 -ml-2">
                        <ChevronLeft size={24} />
                    </button>
                    <div className="text-center">
                        <h1 className="text-lg font-bold">{headerInfo.title}</h1>
                        <p className="text-xs text-blue-200">{headerInfo.sub}</p>
                    </div>
                    <div className="w-10"></div>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {renderContent()}
            </div>
        </div>
    );
};