import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom'; 
import {
    Search, Phone, Mail, MapPin, Users, Book, Award,
    Copy, Check, HelpCircle, ExternalLink, Info, Heart, Facebook, User,
    MessageSquarePlus, Crown, ChevronLeft
} from 'lucide-react';
import { playClick } from '../utils/audio';
import { supabase } from '../utils/supabase';

type TabType = 'contacts' | 'clubs' | 'scholarships' | 'regulations' | 'faqs' | 'about' | 'feedback' | 'donate';
const VALID_TABS: TabType[] = ['contacts', 'clubs', 'scholarships', 'regulations', 'faqs', 'about', 'feedback', 'donate'];

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
        if (activeTab === 'donate') {
            fetchDonors();
        }
    }, [activeTab]);

    const fetchDonors = async () => {
        setLoadingDonors(true);
        const { data, error } = await supabase
            .from('donations')
            .select('*')
            .order('amount', { ascending: false }); 
        
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
                name: donateForm.name,
                student_id: donateForm.mssv,
                message: donateForm.message,
                amount: cleanAmount
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
        { name: 'Khoa Tài chính', email: 'khoatc@hub.edu.vn', phone: '028.38.971.631', loc: 'Tầng 1 - Khu B' },
        { name: 'Khoa Ngân hàng', email: 'khoanh@hub.edu.vn', phone: '028.38.971.624', loc: 'Tầng 1 - Khu B' },
        { name: 'Khoa QTKD', email: 'khoaktqt@hub.edu.vn', phone: '028.38.971.639', loc: 'Tầng 2 - Khu B' },
        { name: 'Khoa Kế toán', email: 'khoaktkt@hub.edu.vn', phone: '028.38.971.641', loc: 'Tầng 1 - Khu B' },
        { name: 'Khoa HTTTQL', email: 'khoahtttql@hub.edu.vn', phone: '028.38.971.655', loc: 'Tầng 2 - Khu B' },
        { name: 'Khoa Ngoại ngữ', email: 'khoangoaingu@hub.edu.vn', phone: '028.38.214.305', loc: 'Tầng 2 - Khu B' },
        { name: 'Khoa Luật KT', email: 'khoalkt@hub.edu.vn', phone: '028.37.200.151', loc: 'Tầng 2 - Khu B' },
        { name: 'Khoa KTQT', email: 'khoaktqt@hub.edu.vn', phone: '028.38.971.640', loc: 'Tầng 1 - Khu B' },
    ];

    const clubs = [
        {
            type: 'Học thuật', list: [
                { name: 'CLB Ngân hàng Quốc tế (IBC)', link: 'https://www.facebook.com/CLBIBC', email: 'ibc@hub.edu.vn', manager: 'Đoàn trường' },
                { name: 'CLB Anh văn STEP', link: 'https://www.facebook.com/stepclubhub', email: 'clb.step@hub.edu.vn', manager: 'Đoàn trường' },
                { name: 'CLB Anh văn BEE', link: 'https://www.facebook.com/BeeClubHUB', email: 'clb.bee@hub.edu.vn', manager: 'Đoàn trường' },
                { name: 'CLB SV NCKH (SRC)', link: 'https://www.facebook.com/spyclubhub', email: 'clb.nckh@hub.edu.vn', manager: 'Đoàn trường' },
                { name: 'Đội Enactus BU', link: 'https://www.facebook.com/EBankingUniversity', email: 'clb.enactus@hub.edu.vn', manager: 'Hội SV' },
                { name: 'CLB Tài chính (BUSF)', link: 'https://www.facebook.com/BUSFClub', email: 'busf@hub.edu.vn', manager: 'Đoàn khoa TC' },
                { name: 'CLB QTKD & Marketing (MMC)', link: 'https://www.facebook.com/HUBMMC', email: 'mmc@hub.edu.vn', manager: 'Đoàn khoa QTKD' },
                { name: 'CLB Anh ngữ Quốc tế (IEC)', link: 'https://www.facebook.com/iec.hub', email: 'iec@hub.edu.vn', manager: 'Đoàn khoa KTQT' },
                { name: 'CLB Kinh doanh QT (IBEC)', link: 'https://www.facebook.com/IBEC.HUB', email: 'ibec.hub@gmail.com', manager: 'Đoàn khoa KTQT' },
                { name: 'CLB Kết nối nghề nghiệp', link: '', email: 'clb.careerlink@hub.edu.vn', manager: 'Đoàn khoa NH' },
                { name: 'CLB Kế toán Kiểm toán (FAAC)', link: 'https://www.facebook.com/hub.faac', email: 'faac.hub@gmail.com', manager: 'Đoàn khoa KTKT' },
                { name: 'CLB Pháp lý', link: 'https://www.facebook.com/CLBPHAPLYHUB', email: 'clb.phaply@hub.edu.vn', manager: 'Đoàn khoa Luật' },
                { name: 'CLB Học thuật GIEO', link: '', email: 'gieoclub@hub.edu.vn', manager: 'Đoàn khoa HTTTQL' },
                { name: 'CLB DATA LAB', link: '', email: '', manager: 'Đoàn khoa KHDL' },
            ]
        },
        {
            type: 'Kỹ năng & Tình nguyện', list: [
                { name: 'Ban Sự kiện', link: 'https://www.facebook.com/bansukienhub', email: 'bansukien@hub.edu.vn', manager: 'Đoàn trường' },
                { name: 'CLB Kỹ năng', link: 'https://www.facebook.com/clbknbuh', email: 'clb.kynang@hub.edu.vn', manager: 'Đoàn trường' },
                { name: 'CLB Khởi nghiệp (FIC)', link: 'https://www.facebook.com/ficstart', email: 'fic@hub.edu.vn', manager: 'Hội SV' },
                { name: 'CLB Hỗ trợ SV Trực tuyến (OSAC)', link: 'https://www.facebook.com/hotrosinhvientructuyen', email: 'osac@hub.edu.vn', manager: 'Đoàn trường' },
                { name: 'CLB Tủ sách tình bạn', link: 'https://www.facebook.com/clbtusachtinhban', email: 'clb.tstb@hub.edu.vn', manager: 'Hội SV' },
            ]
        },
        {
            type: 'Sở thích & Văn thể', list: [
                { name: 'Ban Truyền thông (B4T)', link: 'https://www.facebook.com/b4t.hub', email: 'ban4t@hub.edu.vn', manager: 'Hội SV' },
                { name: 'CLB Bóng đá (BUFC)', link: 'https://www.facebook.com/footballclubbuh', email: 'clb.bongda@hub.edu.vn', manager: 'Hội SV' },
                { name: 'CLB Cầu lông (BBC)', link: 'https://www.facebook.com/hubbadminton', email: 'clb.caulong@hub.edu.vn', manager: 'Hội SV' },
                { name: 'CLB Guitar', link: 'https://www.facebook.com/guitarclub.hub', email: 'clb.guitar@hub.edu.vn', manager: 'Hội SV' },
                { name: 'Đội Văn nghệ (VNXK)', link: 'https://www.facebook.com/vnxuki.hub', email: 'vnxk@hub.edu.vn', manager: 'Hội SV' },
            ]
        }
    ];

    const faqs = [
        {
            group: "Bảo Mật & Tài Khoản",
            items: [
                { q: "Web có lưu mật khẩu Portal không?", a: "Tuyệt đối KHÔNG. Việc đăng nhập Portal chỉ diễn ra cục bộ trên trình duyệt của bạn để lấy bảng điểm." },
                { q: "Tại sao đổi máy thì dữ liệu bị mất?", a: "Vì nếu bạn chưa đăng nhập Gmail, dữ liệu chỉ lưu trên máy hiện tại. Hãy đăng nhập để hệ thống đồng bộ dữ liệu của bạn lên mây nhé." }
            ]
        },
        {
            group: "Tính Năng Học Tập",
            items: [
                { q: "Làm sao để nhập điểm tự động?", a: "Vào Portal -> Xem điểm -> In ra file PDF. Sau đó tải file đó lên web." },
                { q: "Công cụ tính GPA hệ 4 hay 10?", a: "Hỗ trợ song song cả hai và tự động quy đổi." },
                { q: "AI Cố vấn (Gemini) giúp gì?", a: "Chat để hỏi lộ trình, cách học, mục tiêu điểm số." }
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

    // --- TAB MENU DÀNH CHO MOBILE ---
    const TAB_MENU = [
        { id: 'contacts', label: 'Danh bạ', icon: <Phone size={14} /> },
        { id: 'clubs', label: 'CLB - Đội', icon: <Users size={14} /> },
        { id: 'scholarships', label: 'Học bổng', icon: <Award size={14} /> },
        { id: 'faqs', label: 'Hỏi đáp', icon: <HelpCircle size={14} /> },
        { id: 'feedback', label: 'Góp ý', icon: <MessageSquarePlus size={14} /> },
        { id: 'donate', label: 'Ủng hộ', icon: <Heart size={14} /> },
        { id: 'about', label: 'Về dự án', icon: <Info size={14} /> },
    ];

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
                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mb-2">
                            <h3 className="font-bold text-[#003375] flex items-center gap-2 mb-1 text-sm"><Users size={16} /> Hoạt động Đoàn - Hội</h3>
                            <p className="text-xs text-blue-800 leading-relaxed">HUB có hơn 40 CLB/Đội/Nhóm. Tham gia để rèn luyện kỹ năng và cộng điểm rèn luyện!</p>
                        </div>
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
                        <p className="text-[10px] text-gray-500 italic px-1">* Tích lũy tối thiểu 15TC/kỳ, không rớt môn, không kỷ luật.</p>
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
            default: return null;
        }
    };

    return (
        <div className="min-h-[100dvh] bg-[#F8FAFC] flex flex-col font-sans relative">
            {/* HEADER */}
            <div className="bg-[#003375] px-4 pt-12 pb-4 text-white shrink-0 sticky top-0 z-40 shadow-md">
                <div className="flex items-center justify-between mb-4">
                    <button onClick={() => { playClick(); navigate('/'); }} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors active:scale-95 -ml-2">
                        <ChevronLeft size={24} />
                    </button>
                    <h1 className="text-lg font-bold">Cẩm nang Sinh viên</h1>
                    <div className="w-10"></div> {/* Spacer */}
                </div>
                
                {/* THANH TAB TRƯỢT NGANG */}
                <div className="flex overflow-x-auto no-scrollbar gap-2 pb-1 -mx-4 px-4 snap-x">
                    {TAB_MENU.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => { playClick(); setActiveTab(tab.id as TabType); }}
                            className={`snap-start shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all ${activeTab === tab.id ? 'bg-white text-[#003375] shadow-sm' : 'bg-white/10 text-blue-100 border border-white/10'}`}
                        >
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* NỘI DUNG */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {renderContent()}
            </div>
        </div>
    );
};