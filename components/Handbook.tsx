import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom'; 
import {
    Search, Phone, Mail, MapPin, Users, Book, Award,
    Copy, Check, HelpCircle, ExternalLink, Info, Heart, Facebook, User,
    MessageSquarePlus, Crown, ShieldCheck, ChevronDown
} from 'lucide-react';
import { playClick } from '../utils/audio';
import { supabase } from '../utils/supabase';
import { notifyModerators } from '../utils/moderatorNotifications';
import { TurnstileBox } from './TurnstileBox';
import { protectedSubmit } from '../utils/protectedSubmit';
import { HANDBOOK_FAQS } from '../utils/handbookFaqs';

type TabType = 'contacts' | 'clubs' | 'scholarships' | 'regulations' | 'faqs' | 'plagiarism' | 'canva' | 'about' | 'feedback' | 'donate';

const VALID_TABS: TabType[] = ['contacts', 'clubs', 'scholarships', 'regulations', 'faqs', 'plagiarism', 'canva', 'about', 'feedback', 'donate'];

export const Handbook: React.FC = () => {
    const { tab } = useParams<{ tab: string }>(); 

    const [activeTab, setActiveTab] = useState<TabType>(() => {
        if (tab && VALID_TABS.includes(tab as TabType)) {
            return tab as TabType;
        }
        return 'contacts';
    });

    const [searchTerm, setSearchTerm] = useState('');
    const [faqSearchTerm, setFaqSearchTerm] = useState('');
    const [openFaqItem, setOpenFaqItem] = useState('0-0');
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const [feedbackType, setFeedbackType] = useState<'bug' | 'idea'>('idea');
    const [feedbackContent, setFeedbackContent] = useState('');
    const [contactInfo, setContactInfo] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [feedbackTurnstileToken, setFeedbackTurnstileToken] = useState('');

    const [donateForm, setDonateForm] = useState({ name: '', mssv: '', amount: '', message: '' });
    const [isDonating, setIsDonating] = useState(false);
    const [donateTurnstileToken, setDonateTurnstileToken] = useState('');
    const [donors, setDonors] = useState<any[]>([]);
    const [loadingDonors, setLoadingDonors] = useState(false);
    const [canvaForm, setCanvaForm] = useState({ email: '', fullName: '', cohort: '', major: '' });
    const [isCanvaContactReady, setIsCanvaContactReady] = useState(false);
    const [isCanvaSubmitting, setIsCanvaSubmitting] = useState(false);
    const [canvaSubmitStatus, setCanvaSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [canvaTurnstileToken, setCanvaTurnstileToken] = useState('');
    const [canvaRequestId, setCanvaRequestId] = useState<number | null>(null);
    const [isCanvaModalOpen, setIsCanvaModalOpen] = useState(false);

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
            .select('id,name,amount,message,student_id,created_at')
            .order('amount', { ascending: false }); 
        
        if (!error && data) {
            setDonors(data);
        }
        setLoadingDonors(false);
    };

    const handleDonateSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!donateForm.name || !donateForm.amount) return;

        setIsDonating(true);
        try {
            const cleanAmount = parseInt(donateForm.amount.replace(/\D/g, '')) || 0;

            await protectedSubmit({
                action: 'donation',
                turnstileToken: donateTurnstileToken,
                payload: {
                    name: donateForm.name,
                    student_id: donateForm.mssv,
                    message: donateForm.message,
                    amount: cleanAmount,
                },
            });

            setDonateTurnstileToken('');
            alert("Cảm ơn tấm lòng vàng của bạn! ❤️");
            setDonateForm({ name: '', mssv: '', amount: '', message: '' }); 
            fetchDonors(); 
        } catch (error) {
            console.error("Lỗi:", error);
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
            const { data: sessionData } = await supabase.auth.getSession();
            const user = sessionData?.session?.user || null;
            let profile: { full_name?: string | null; student_code?: string | null; email?: string | null } | null = null;

            if (user?.id) {
                const { data: profileData } = await supabase
                    .from('profiles')
                    .select('full_name, student_code, email')
                    .eq('id', user.id)
                    .maybeSingle();
                profile = profileData;
            }

            const feedbackPayload = {
                type: feedbackType,
                content: feedbackContent,
                contact: contactInfo,
                user_id: user?.id || null,
                full_name: profile?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || null,
                student_code: profile?.student_code || user?.email?.split('@')[0] || null,
                email: profile?.email || user?.email || null,
            };

            const data = await protectedSubmit<{ id?: number }>({
                action: 'feedback',
                payload: feedbackPayload,
                turnstileToken: feedbackTurnstileToken,
            });
            void notifyModerators('feedback', data?.id);
            setFeedbackTurnstileToken('');

            setSubmitStatus('success');
            setFeedbackContent('');
            setContactInfo('');
            setTimeout(() => setSubmitStatus('idle'), 5000);
        } catch (error) {
            console.error("Lỗi gửi feedback:", error);
            setSubmitStatus('error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const contacts = [
        { name: 'Phòng Đào tạo', email: 'phongdaotao@hub.edu.vn', phone: '028.38.212.430', loc: '56 Hoàng Diệu 2 & 36 Tôn Thất Đạm' },
        { name: 'Phòng Công tác Sinh viên (TT SV&QHDN)', email: 'trungtamsvvaqhdn@hub.edu.vn', phone: '028.38.971.636', loc: '56 Hoàng Diệu 2' },
        { name: 'Phòng Khảo thí & ĐBCL', email: 'phongktdbcl@hub.edu.vn', phone: '028.39.144.932', loc: '56 Hoàng Diệu 2' },
        { name: 'Phòng Tài chính – Kế toán', email: 'phongketoan@hub.edu.vn', phone: '028.38.212.591', loc: '36 Tôn Thất Đạm' },
        { name: 'Thư viện', email: 'thuvien@hub.edu.vn', phone: '028.38.971.651', loc: '56 Hoàng Diệu 2' },
        { name: 'Trạm Y tế', email: 'toyte.tccb@hub.edu.vn', phone: '0912.048.079', loc: 'Các cơ sở' },
        { name: 'Khoa Tài chính', email: 'khoatc@hub.edu.vn', phone: '028.38.971.631', loc: 'Tầng 1 - Khu B - 56 HD2' },
        { name: 'Khoa Ngân hàng', email: 'khoanh@hub.edu.vn', phone: '028.38.971.624', loc: 'Tầng 1 - Khu B - 56 HD2' },
        { name: 'Khoa Quản trị kinh doanh', email: 'khoaktqt@hub.edu.vn', phone: '028.38.971.639', loc: 'Tầng 2 - Khu B - 56 HD2' },
        { name: 'Khoa Kế toán – Kiểm toán', email: 'khoaktkt@hub.edu.vn', phone: '028.38.971.641', loc: 'Tầng 1 - Khu B - 56 HD2' },
        { name: 'Khoa Hệ thống thông tin QL', email: 'khoahtttql@hub.edu.vn', phone: '028.38.971.655', loc: 'Tầng 2 - Khu B - 56 HD2' },
        { name: 'Khoa Ngoại ngữ', email: 'khoangoaingu@hub.edu.vn', phone: '028.38.214.305', loc: 'Tầng 2 - Khu B - 56 HD2' },
        { name: 'Khoa Luật kinh tế', email: 'khoalkt@hub.edu.vn', phone: '028.37.200.151', loc: 'Tầng 2 - Khu B - 56 HD2' },
        { name: 'Khoa Kinh tế Quốc tế', email: 'khoaktqt@hub.edu.vn', phone: '028.38.971.640', loc: 'Tầng 1 - Khu B - 56 HD2' },
    ];

    const clubs = [
        {
            type: 'Học thuật', list: [
                { name: 'CLB Ngân hàng Quốc tế (IBC)', link: 'https://www.facebook.com/CLBIBC', email: 'ibc@hub.edu.vn', manager: 'Đoàn trường' },
                { name: 'CLB Anh văn STEP', link: 'https://www.facebook.com/stepclubhub', email: 'clb.step@hub.edu.vn', manager: 'Đoàn trường' },
                { name: 'CLB Anh văn BEE', link: 'https://www.facebook.com/BeeClubHUB', email: 'clb.bee@hub.edu.vn', manager: 'Đoàn trường' },
                { name: 'CLB SV Nghiên cứu Khoa học (SRC)', link: 'https://www.facebook.com/spyclubhub', email: 'clb.nckh@hub.edu.vn', manager: 'Đoàn trường' },
                { name: 'Đội Enactus BU', link: 'https://www.facebook.com/EBankingUniversity', email: 'clb.enactus@hub.edu.vn', manager: 'Hội SV' },
                { name: 'CLB Tài chính (BUSF)', link: 'https://www.facebook.com/BUSFClub', email: 'busf@hub.edu.vn', manager: 'Đoàn khoa TC' },
                { name: 'CLB Quản trị và Marketing (MMC)', link: 'https://www.facebook.com/HUBMMC', email: 'mmc@hub.edu.vn', manager: 'Đoàn khoa QTKD' },
                { name: 'CLB Anh ngữ Quốc tế (IEC)', link: 'https://www.facebook.com/iec.hub', email: 'iec@hub.edu.vn', manager: 'Đoàn khoa KTQT' },
                { name: 'CLB Kinh doanh và KT Quốc tế (IBEC)', link: 'https://www.facebook.com/IBEC.HUB', email: 'ibec.hub@gmail.com', manager: 'Đoàn khoa KTQT' },
                { name: 'CLB Kết nối nghề nghiệp (Career Link)', link: '', email: 'clb.careerlink@hub.edu.vn', manager: 'Đoàn khoa NH' },
                { name: 'CLB Nghiên cứu ứng dụng (SARA)', link: '', email: 'sara@hub.edu.vn', manager: 'Đoàn khoa KTKT' },
                { name: 'CLB Kế toán Kiểm toán (FAAC)', link: 'https://www.facebook.com/hub.faac', email: 'faac.hub@gmail.com', manager: 'Đoàn khoa KTKT' },
                { name: 'CLB Pháp lý', link: 'https://www.facebook.com/CLBPHAPLYHUB', email: 'clb.phaply@hub.edu.vn', manager: 'Đoàn khoa Luật' },
                { name: 'CLB Học thuật GIEO', link: '', email: 'gieoclub@hub.edu.vn', manager: 'Đoàn khoa HTTTQL' },
                { name: 'CLB DATA LAB', link: 'https://www.facebook.com/profile.php?id=61576925573439', email: '', manager: 'Đoàn khoa Khoa học dữ liệu' },
                { name: 'CLB Nghiên cứu - Ứng dụng Phân tích Dữ liệu & Phát triển Bền vững trong Kế toán - Kiểm toán (AICAS)', link: 'https://www.facebook.com/clbaicashub', email: 'clbaicashub@gmail.com', manager: 'Đoàn khoa Kế toán - Kiểm toán' }
            ]
        },
        {
            type: 'Kỹ năng', list: [
                { name: 'Ban Sự kiện', link: 'https://www.facebook.com/bansukienhub', email: 'bansukien@hub.edu.vn', manager: 'Đoàn trường' },
                { name: 'CLB Mầm sống', link: 'https://www.facebook.com/mamsong.hub', email: 'clb.mamsong@hub.edu.vn', manager: 'Đoàn trường' },
                { name: 'CLB Kỹ năng', link: 'https://www.facebook.com/clbknbuh', email: 'clb.kynang@hub.edu.vn', manager: 'Đoàn trường' },
                { name: 'CLB Khởi nghiệp (FIC)', link: 'https://www.facebook.com/ficstart', email: 'fic@hub.edu.vn', manager: 'Hội SV' },
                { name: 'CLB Youth For Chance (YFC)', link: 'https://www.facebook.com/youthforchance', email: 'clb.youthforchance@hub.edu.vn', manager: 'Hội SV' },
                { name: 'Đội Lửa xanh (Blue Fire)', link: 'https://www.facebook.com/luaxanhdoi.hub/', email: 'doi.bluefire@hub.edu.vn', manager: 'Hội SV' },
                { name: 'CLB Hội nhập Quốc tế (IIC)', link: 'https://www.facebook.com/iic.qtkd.hub', email: 'iic.hub@gmail.com', manager: 'Đoàn khoa QTKD' },
                { name: 'CLB Thể thao trí tuệ (ISTHub)', link: 'https://www.facebook.com/is.hub22', email: 'ISTHub@gmail.com', manager: 'Đoàn hệ CLC' }
            ]
        },
        {
            type: 'Sở thích & Văn thể', list: [
                { name: 'Ban Thông tin Truyền thông (B4T)', link: 'https://www.facebook.com/b4t.hub', email: 'ban4t@hub.edu.vn', manager: 'Hội SV' },
                { name: 'CLB Bóng chuyền', link: 'https://www.facebook.com/HUBvolleyball', email: 'clb.bongchuyen@hub.edu.vn', manager: 'Hội SV' },
                { name: 'CLB Bóng đá (BUFC)', link: 'https://www.facebook.com/footballclubbuh', email: 'clb.bongda@hub.edu.vn', manager: 'Hội SV' },
                { name: 'CLB Bóng rổ', link: 'https://www.facebook.com/bankingbasketball', email: 'clb.bongro@hub.edu.vn', manager: 'Hội SV' },
                { name: 'CLB Cầu lông (BBC)', link: 'https://www.facebook.com/hubbadminton', email: 'clb.caulong@hub.edu.vn', manager: 'Hội SV' },
                { name: 'CLB Dân Ca & Nhạc Cổ Truyền', link: 'https://www.facebook.com/HUB.DanCa', email: 'clb.danca@hub.edu.vn', manager: 'Hội SV' },
                { name: 'CLB Guitar', link: 'https://www.facebook.com/guitarclub.hub', email: 'clb.guitar@hub.edu.vn', manager: 'Hội SV' },
                { name: 'CLB Điện ảnh và Nghệ thuật (3F)', link: 'https://www.facebook.com/3FProductionfilm', email: 'clb.3f@hub.edu.vn', manager: 'Hội SV' },
                { name: 'Đội Văn nghệ Xung kích (VNXK)', link: 'https://www.facebook.com/vnxuki.hub', email: 'vnxk@hub.edu.vn', manager: 'Hội SV' },
                { name: 'CLB Vovinam', link: 'https://www.facebook.com/vovinam.hub', email: 'clb.vovinam@hub.edu.vn', manager: 'Hội SV' },
                { name: 'CLB Nữ sinh (GCBU)', link: 'https://www.facebook.com/clbnusinh', email: 'clb.nusinh@hub.edu.vn', manager: 'Hội SV' },
                { name: 'CLB Phát thanh (VoBU)', link: 'https://www.facebook.com/ClbPhatthanhDHNH', email: 'clb.phatthanh@hub.edu.vn', manager: 'Hội SV' },
                { name: 'CLB Cờ Vua (ICC)', link: 'https://www.facebook.com/chessclubbuh', email: 'iic@hub.edu.vn', manager: 'Đoàn khoa KTQT' }
            ]
        },
        {
            type: 'Tình nguyện', list: [
                { name: 'CLB Hỗ trợ SV Trực tuyến (OSAC)', link: 'https://www.facebook.com/hotrosinhvientructuyen', email: 'osac@hub.edu.vn', manager: 'Đoàn trường' },
                { name: 'CLB Tủ sách tình bạn', link: 'https://www.facebook.com/clbtusachtinhban', email: 'clb.tstb@hub.edu.vn', manager: 'Hội SV' },
                { name: 'Đội Tình nguyện Mầm Xanh', link: 'https://www.facebook.com/mamxanhtinhnguyen', email: 'mamxanhtn@hub.edu.vn', manager: 'Hội SV' },
                { name: 'Đội Công tác Xã hội', link: 'https://www.facebook.com/HUB.QTKD.CTXH', email: 'ctxh.qtkd@hub.edu.vn', manager: 'Đoàn khoa QTKD' }
            ]
        }
    ];

    const faqs = HANDBOOK_FAQS;

    const filteredContacts = contacts.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const normalizedFaqSearch = faqSearchTerm.trim().toLowerCase();
    const filteredFaqs = faqs
        .map(group => ({
            ...group,
            items: group.items.filter(item =>
                !normalizedFaqSearch ||
                item.q.toLowerCase().includes(normalizedFaqSearch) ||
                item.a.toLowerCase().includes(normalizedFaqSearch) ||
                group.group.toLowerCase().includes(normalizedFaqSearch)
            ),
        }))
        .filter(group => group.items.length > 0);

    const copyToClipboard = (text: string, id: string) => {
        playClick();
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleCanvaFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canvaForm.email.trim().toLowerCase().endsWith('@st.buh.edu.vn') || !canvaForm.fullName.trim() || !canvaForm.cohort.trim() || !canvaForm.major.trim()) {
            setCanvaSubmitStatus('error');
            return;
        }

        setIsCanvaSubmitting(true);
        setCanvaSubmitStatus('idle');
        try {
            const data = await protectedSubmit<{ id?: number }>({
                action: 'canva-pro-request',
                turnstileToken: canvaTurnstileToken,
                payload: {
                    email: canvaForm.email,
                    full_name: canvaForm.fullName,
                    student_batch: canvaForm.cohort,
                    major: canvaForm.major,
                },
            });
            setCanvaRequestId(data?.id || null);
            setCanvaTurnstileToken('');
            setCanvaSubmitStatus('success');
            setIsCanvaContactReady(true);
            playClick();
        } catch (error) {
            console.error('Không thể lưu đăng ký Canva Pro:', error);
            setCanvaSubmitStatus('error');
            setIsCanvaContactReady(false);
        } finally {
            setIsCanvaSubmitting(false);
        }
    };

    const updateCanvaForm = (field: keyof typeof canvaForm, value: string) => {
        setCanvaForm(prev => ({ ...prev, [field]: value }));
        setIsCanvaContactReady(false);
        setCanvaSubmitStatus('idle');
        setCanvaRequestId(null);
    };

    const canvaApprovalMessage = [
        'Đăng ký Canva Pro - HUB Planner',
        ...(canvaRequestId ? [`Mã đăng ký: #${canvaRequestId}`] : []),
        `Email: ${canvaForm.email}`,
        `Họ tên: ${canvaForm.fullName}`,
        `Khóa: ${canvaForm.cohort}`,
        `Ngành: ${canvaForm.major}`,
    ].join('\n');

const renderContent = () => {
        switch (activeTab) {
            case 'contacts':
                return (
                    <div className="animate-fadeIn">
                        <div className="mb-4 relative">
                            <input
                                type="text"
                                placeholder="Tìm khoa, phòng ban..."
                                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 focus:border-[#003375] focus:ring-1 focus:ring-[#003375] transition-all outline-none"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                        </div>
                        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                            {filteredContacts.map((c, idx) => (
                                <div
                                    key={idx}
                                    className="bg-white p-4 rounded-xl border border-gray-300 transition-colors duration-200 cursor-pointer group relative hover:border-[#003375]"
                                    onClick={() => copyToClipboard(c.email, `email-${idx}`)}
                                    title="Nhấn để sao chép Email"
                                >
                                    <div className="absolute top-4 right-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                        {copiedId === `email-${idx}` ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
                                    </div>
                                    <h3 className="font-bold text-[#003375] mb-2">{c.name}</h3>
                                    <div className="space-y-1 text-sm text-gray-600">
                                        <div className="flex items-center gap-2"><Mail size={14} className="text-gray-400" /> {c.email}</div>
                                        <div className="flex items-center gap-2"><Phone size={14} className="text-gray-400" /> {c.phone}</div>
                                        <div className="flex items-center gap-2"><MapPin size={14} className="text-gray-400 shrink-0" /> <span className="truncate">{c.loc}</span></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            case 'clubs':
                return (
                    <div className="space-y-6 animate-fadeIn">
                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 mb-4 cursor-default">
                            <h3 className="font-bold text-[#003375] flex items-center gap-2 mb-1">
                                <Users size={20} /> Hoạt động Đoàn - Hội
                            </h3>
                            <p className="text-sm text-blue-800">
                                HUB có 41 CLB/Đội/Nhóm. Tham gia để rèn luyện kỹ năng và cộng điểm rèn luyện!
                            </p>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {clubs.map((group, idx) => (
                                <div key={idx} className="bg-white p-5 rounded-xl border border-gray-300 transition-colors duration-200 hover:border-[#003375]">
                                    <h4 className="font-bold text-[#990000] border-b border-gray-200 pb-2 mb-3">{group.type}</h4>
                                    <ul className="space-y-2">
                                        {group.list.map((item, i) => {
                                            let badgeColor = "bg-gray-100 text-gray-600";
                                            if (item.manager === 'Đoàn trường') badgeColor = "bg-blue-100 text-blue-800";
                                            else if (item.manager === 'Hội SV') badgeColor = "bg-orange-100 text-orange-800";
                                            else if (item.manager.includes('Đoàn khoa')) badgeColor = "bg-purple-100 text-purple-800";

                                            return (
                                                <li key={i} className="group/item border-b border-gray-100 last:border-0 pb-2 mb-2 last:mb-0 last:pb-0">
                                                    <div className="flex justify-between items-start">
                                                        <span className="text-sm font-semibold text-gray-800 mb-1 block group-hover/item:text-[#003375] transition-colors">{item.name}</span>
                                                        {item.link && (
                                                            <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-500" onClick={playClick}>
                                                                <ExternalLink size={14} />
                                                            </a>
                                                        )}
                                                    </div>

                                                    <div className="flex flex-wrap items-center gap-2 mt-1">
                                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border border-transparent ${badgeColor}`}>
                                                            {item.manager}
                                                        </span>
                                                        {item.email && (
                                                            <button
                                                                className="text-[11px] text-gray-500 hover:text-[#003375] flex items-center gap-1 hover:bg-gray-50 px-1 rounded transition-colors"
                                                                onClick={() => copyToClipboard(item.email, `club-${idx}-${i}`)}
                                                                title="Sao chép Email"
                                                            >
                                                                <Mail size={10} /> <span className="truncate max-w-[120px]">{item.email}</span>
                                                                {copiedId === `club-${idx}-${i}` && <Check size={10} className="text-green-600" />}
                                                            </button>
                                                        )}
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </div>
                );

            case 'scholarships':
                return (
                    <div className="space-y-4 animate-fadeIn max-w-4xl mx-auto">
                        <h3 className="text-lg font-bold text-[#003375] mb-2 flex items-center gap-2">
                            <Award className="text-[#990000]" /> Học bổng Khuyến khích học tập
                        </h3>

                        <div className="bg-white rounded-xl border border-gray-300 overflow-hidden transition-colors duration-200 hover:border-[#003375]" onClick={playClick}>
                            <table className="w-full text-sm">
                                <thead className="bg-[#003375] text-white">
                                    <tr>
                                        <th className="p-3 text-left">Loại HB</th>
                                        <th className="p-3 text-center">GPA (Hệ 4)</th>
                                        <th className="p-3 text-center">ĐRL</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    <tr className="hover:bg-gray-50 transition-colors">
                                        <td className="p-3 font-medium">Xuất sắc</td>
                                        <td className="p-3 text-center font-bold text-green-600">3.6 - 4.0</td>
                                        <td className="p-3 text-center">Xuất sắc (90-100)</td>
                                    </tr>
                                    <tr className="hover:bg-gray-50 transition-colors">
                                        <td className="p-3 font-medium">Giỏi</td>
                                        <td className="p-3 text-center font-bold text-blue-600">3.2 - 3.5</td>
                                        <td className="p-3 text-center">Tốt hoặc Xuất sắc (80-100)</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <p className="text-xs text-gray-500 italic">* Điều kiện: Tích lũy tối thiểu 15 tín chỉ/kỳ, ĐRL 80 trở lên, không rớt môn nào, không bị kỷ luật.</p>

                        <h3 className="text-lg font-bold text-[#003375] mt-6 mb-2 flex items-center gap-2">
                            <Book className="text-[#990000]" /> Chế độ miễn giảm học phí
                        </h3>
                        <div className="grid gap-2">
                            <div className="p-3 bg-gray-50 rounded-lg border border-gray-300 text-sm transition-colors duration-200 cursor-pointer hover:border-[#003375]" onClick={playClick}>
                                <span className="font-bold block text-gray-800">Miễn 100% học phí</span>
                                SV khuyết tật, mồ côi cả cha lẫn mẹ, người dân tộc thiểu số rất ít người vùng khó khăn, con liệt sĩ/thương binh...
                            </div>
                            <div className="p-3 bg-gray-50 rounded-lg border border-gray-300 text-sm transition-colors duration-200 cursor-pointer hover:border-[#003375]" onClick={playClick}>
                                <span className="font-bold block text-gray-800">Giảm 70% học phí</span>
                                SV dân tộc thiểu số ở thôn/bản đặc biệt khó khăn.
                            </div>
                            <div className="p-3 bg-gray-50 rounded-lg border border-gray-300 text-sm transition-colors duration-200 cursor-pointer hover:border-[#003375]" onClick={playClick}>
                                <span className="font-bold block text-gray-800">Giảm 50% học phí</span>
                                Con của cán bộ CNV chức bị tai nạn lao động, bệnh nghề nghiệp.
                            </div>
                        </div>
                    </div>
                );

            case 'faqs':
                return (
                    <div className="space-y-3 animate-fadeIn max-w-4xl mx-auto">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="text"
                                value={faqSearchTerm}
                                onChange={(e) => setFaqSearchTerm(e.target.value)}
                                placeholder="Tìm câu hỏi về bảo mật, tài khoản, nhập điểm..."
                                className="w-full rounded-xl border border-gray-300 bg-white py-3 pl-10 pr-4 text-sm font-medium outline-none transition-all focus:border-[#003375] focus:ring-1 focus:ring-[#003375]"
                            />
                        </div>

                        {filteredFaqs.map((group, idx) => (
                            <div key={idx} className="bg-white rounded-xl border border-gray-300 overflow-hidden">
                                <div className="bg-gray-50 px-4 py-2.5 text-[#003375] font-bold text-xs sm:text-sm uppercase tracking-wide border-b border-gray-200">
                                    {group.group}
                                </div>
                                <div className="divide-y divide-gray-200">
                                    {group.items.map((item, i) => (
                                        <div key={i} className="hover:bg-blue-50/30 transition-colors">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    playClick();
                                                    const itemKey = `${idx}-${i}`;
                                                    setOpenFaqItem(openFaqItem === itemKey ? '' : itemKey);
                                                }}
                                                aria-expanded={openFaqItem === `${idx}-${i}`}
                                                className="w-full flex items-start justify-between gap-3 px-4 py-3 text-left"
                                            >
                                                <span className="font-bold text-sm text-gray-900 leading-snug">{item.q}</span>
                                                <ChevronDown size={18} className={`mt-0.5 shrink-0 text-gray-400 transition-transform ${openFaqItem === `${idx}-${i}` ? 'rotate-180 text-[#003375]' : ''}`} />
                                            </button>
                                            {openFaqItem === `${idx}-${i}` && (
                                                <div className="px-4 pb-4 -mt-1">
                                                    <p className="text-gray-600 text-sm leading-relaxed border-l-2 border-blue-100 pl-3">
                                                        {item.a}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}

                        {filteredFaqs.length === 0 && (
                            <div className="bg-white rounded-xl border border-gray-300 p-5 text-center text-sm text-gray-500">
                                Chưa tìm thấy câu hỏi phù hợp. Bạn có thể gửi góp ý để team bổ sung thêm.
                            </div>
                        )}
                    </div>
                );

            case 'plagiarism':
                return (
                    <div className="animate-fadeIn max-w-4xl mx-auto grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
                        <div className="bg-white p-5 rounded-xl border border-gray-300">
                            <div className="flex items-start gap-3">
                                <div className="rounded-xl bg-violet-100 p-2.5 text-violet-700">
                                    <ShieldCheck size={24} />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-lg font-black text-[#003375]">Cần check đạo văn?</h3>
                                    <p className="mt-1 text-sm text-gray-600 leading-relaxed">
                                        Gửi tài liệu qua Zalo để được hỗ trợ kiểm tra mức độ trùng lặp nội dung bằng Turnitin.
                                    </p>
                                    <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                                        Turnitin là hệ thống đối chiếu nội dung bài viết với nhiều nguồn học thuật, website và tài liệu đã có để phát hiện phần trùng lặp, hỗ trợ bạn rà soát bài trước khi nộp.
                                    </p>
                                </div>
                            </div>

                            <div className="mt-4 rounded-xl bg-gray-50 border border-gray-300 p-4">
                                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Liên hệ nhanh</p>
                                <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
                                    <span className="text-2xl font-black text-[#003375]">0389342812</span>
                                    <a
                                        href="https://zalo.me/0389342812"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={playClick}
                                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0068ff] px-5 py-3 text-sm font-bold text-white hover:bg-[#005be0] transition-colors"
                                    >
                                        <Phone size={18} />
                                        Liên hệ Zalo
                                    </a>
                                </div>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                                {['Tiểu luận', 'Báo cáo', 'Khóa luận'].map((item) => (
                                    <span key={item} className="rounded-full border border-gray-300 bg-gray-50 px-3 py-1 text-xs font-bold text-violet-700">
                                        {item}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className="bg-white p-5 rounded-xl border border-gray-300">
                            <h4 className="font-black text-gray-900">Quy trình sử dụng</h4>
                            <div className="mt-4 space-y-3">
                                {[
                                    ['Gửi file qua Zalo', 'Gửi tài liệu cần kiểm tra và yêu cầu cụ thể nếu có.'],
                                    ['Chờ kiểm tra', 'Team tiếp nhận file và xử lý theo lượt.'],
                                    ['Nhận kết quả', 'Kết quả được gửi lại qua Zalo để bạn tiện theo dõi.'],
                                ].map(([title, desc], index) => (
                                    <div key={title} className="flex gap-3">
                                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#003375] text-xs font-black text-white">
                                            {index + 1}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-gray-900">{title}</p>
                                            <p className="mt-0.5 text-sm leading-relaxed text-gray-600">{desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
                                Lưu ý: Chuẩn bị file hoàn chỉnh và ghi rõ nhu cầu kiểm tra để nhận hỗ trợ nhanh hơn.
                            </div>
                        </div>
                    </div>
                );

            case 'canva':
                return (
                    <div className="animate-fadeIn max-w-6xl mx-auto grid min-h-[620px] gap-4 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
                        <div className="bg-white p-6 rounded-xl border border-gray-300">
                            <div className="flex items-start gap-3">
                                <div className="rounded-xl bg-sky-100 p-2.5 text-sky-700">
                                    <Crown size={24} />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-lg font-black text-[#003375]">Cần Canva Pro?</h3>
                                    <p className="mt-1 text-sm text-gray-600 leading-relaxed">
                                        HUB Planner hỗ trợ Canva Pro, cung cấp mail HUB để sử dụng và kích hoạt theo hướng dẫn.
                                    </p>
                                    <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                                        Nhập thông tin bên dưới trước, sau đó liên hệ Zalo để được duyệt và hướng dẫn nhận mail HUB.
                                    </p>
                                </div>
                            </div>

                            <div className="mt-5 rounded-xl border border-sky-100 bg-sky-50/70 p-4">
                                <h4 className="text-sm font-black text-[#003375]">Canva Pro là gì?</h4>
                                <p className="mt-2 text-sm leading-relaxed text-gray-600">
                                    Canva Pro là gói thiết kế nâng cao của Canva, mở khóa nhiều mẫu, ảnh, icon, font chữ và công cụ chỉnh sửa nhanh hơn bản miễn phí.
                                </p>
                                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                    {[
                                        'Làm slide thuyết trình đẹp hơn',
                                        'Thiết kế poster, banner, CV',
                                        'Xóa nền và chỉnh ảnh nhanh',
                                        'Dùng kho template Pro cho bài học',
                                    ].map((item) => (
                                        <div key={item} className="flex items-start gap-2 text-sm font-semibold text-gray-700">
                                            <Check size={16} className="mt-0.5 shrink-0 text-sky-700" />
                                            <span>{item}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => { playClick(); setIsCanvaModalOpen(true); }}
                                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#003375] px-5 py-3 text-sm font-bold text-white hover:bg-[#00265a] transition-colors"
                            >
                                <Crown size={18} />
                                Đăng ký Canva Pro
                            </button>

                            {isCanvaContactReady && (
                                <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
                                    Đã lưu đăng ký #{canvaRequestId}. Tiếp tục liên hệ Zalo để được duyệt.
                                </div>
                            )}

                            <div className="mt-4 flex flex-wrap gap-2">
                                {['Canva Pro', 'Mail HUB', 'Hỗ trợ kích hoạt'].map((item) => (
                                    <span key={item} className="rounded-full border border-gray-300 bg-gray-50 px-3 py-1 text-xs font-bold text-sky-700">
                                        {item}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {isCanvaModalOpen && (
                            <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/50 px-4 py-6">
                                <div className="max-h-[calc(100dvh-48px)] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
                                    <div className="flex items-start justify-between gap-4 border-b border-gray-100 pb-4">
                                        <div>
                                            <h3 className="text-xl font-black text-[#003375]">Đăng ký Canva Pro</h3>
                                            <p className="mt-1 text-sm text-gray-600">Nhập thông tin sinh viên để team lưu yêu cầu và duyệt qua Zalo.</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => { playClick(); setIsCanvaModalOpen(false); }}
                                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xl font-bold text-gray-500 hover:bg-gray-200"
                                            aria-label="Đóng"
                                        >
                                            ×
                                        </button>
                                    </div>

                                    <form onSubmit={handleCanvaFormSubmit} className="mt-5 space-y-4">
                                        <div className="grid gap-4 sm:grid-cols-2">
                                            <div>
                                                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">Email của bạn</label>
                                                <input type="email" required pattern="^[^@\s]+@st\.buh\.edu\.vn$" title="Vui lòng nhập email sinh viên có đuôi @st.buh.edu.vn" value={canvaForm.email} onChange={(e) => updateCanvaForm('email', e.target.value)} placeholder="mssv@st.buh.edu.vn" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-900 outline-none transition-colors focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
                                                <p className="mt-1 text-xs font-semibold text-gray-500">Chỉ chấp nhận email sinh viên đuôi @st.buh.edu.vn.</p>
                                            </div>
                                            <div>
                                                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">Họ tên</label>
                                                <input type="text" required value={canvaForm.fullName} onChange={(e) => updateCanvaForm('fullName', e.target.value)} placeholder="Nguyễn Văn A" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-900 outline-none transition-colors focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
                                            </div>
                                            <div>
                                                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">Khóa</label>
                                                <input type="text" required value={canvaForm.cohort} onChange={(e) => updateCanvaForm('cohort', e.target.value)} placeholder="K48" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-900 outline-none transition-colors focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
                                            </div>
                                            <div>
                                                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">Ngành</label>
                                                <input type="text" required value={canvaForm.major} onChange={(e) => updateCanvaForm('major', e.target.value)} placeholder="Tài chính - Ngân hàng" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-900 outline-none transition-colors focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
                                            </div>
                                        </div>
                                        {canvaSubmitStatus === 'error' && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">Không thể lưu thông tin đăng ký. Vui lòng dùng email @st.buh.edu.vn, xác minh bảo mật rồi thử lại.</div>}
                                        {canvaSubmitStatus === 'success' && <div className="rounded-lg bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">Đã lưu thông tin đăng ký. Bạn có thể sao chép thông tin và liên hệ Zalo để được duyệt.</div>}
                                        <TurnstileBox token={canvaTurnstileToken} onTokenChange={setCanvaTurnstileToken} />
                                        <button type="submit" disabled={isCanvaSubmitting || !canvaTurnstileToken} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#003375] px-5 py-3 text-sm font-bold text-white hover:bg-[#00265a] transition-colors disabled:cursor-not-allowed disabled:opacity-50">
                                            <Check size={18} />
                                            {isCanvaSubmitting ? 'Đang lưu...' : 'Lưu thông tin đăng ký'}
                                        </button>
                                    </form>

                                    {isCanvaContactReady && (
                                        <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4">
                                            <p className="text-xs font-bold uppercase tracking-wide text-sky-700">Thông tin duyệt</p>
                                            <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-white p-3 text-xs leading-relaxed text-gray-700">{canvaApprovalMessage}</pre>
                                            <div className="mt-3 flex flex-col sm:flex-row gap-2">
                                                <button type="button" onClick={() => copyToClipboard(canvaApprovalMessage, 'canva-approval')} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-sky-200 bg-white px-4 py-3 text-sm font-bold text-sky-700 hover:bg-sky-50 transition-colors">
                                                    {copiedId === 'canva-approval' ? <Check size={18} /> : <Copy size={18} />}
                                                    {copiedId === 'canva-approval' ? 'Đã sao chép' : 'Sao chép thông tin'}
                                                </button>
                                                <a href="https://zalo.me/0389342812" target="_blank" rel="noopener noreferrer" onClick={playClick} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#0068ff] px-5 py-3 text-sm font-bold text-white hover:bg-[#005be0] transition-colors">
                                                    <Phone size={18} />
                                                    Liên hệ Zalo để duyệt
                                                </a>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="bg-white p-5 rounded-xl border border-gray-300">
                            <h4 className="font-black text-gray-900">Thông tin cần gửi</h4>
                            <div className="mt-4 space-y-3">
                                {[
                                    ['Email của bạn', 'Dùng để đối chiếu và trao đổi thông tin duyệt.'],
                                    ['Họ tên', 'Ghi đúng họ tên sinh viên cần hỗ trợ Canva Pro.'],
                                    ['Khóa & ngành', 'Cho biết khóa học và ngành đang theo học tại HUB.'],
                                ].map(([title, desc], index) => (
                                    <div key={title} className="flex gap-3">
                                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#003375] text-xs font-black text-white">
                                            {index + 1}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-gray-900">{title}</p>
                                            <p className="mt-0.5 text-sm leading-relaxed text-gray-600">{desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            
                        </div>

                        <div className="lg:col-span-2 grid gap-4 md:grid-cols-3">
                            <div className="rounded-xl border border-gray-300 bg-white p-5">
                                <div className="flex items-center gap-2 text-[#003375]">
                                    <Info size={18} />
                                    <h4 className="font-black text-gray-900">Lưu ý</h4>
                                </div>
                                <p className="mt-3 text-sm leading-relaxed text-gray-600">
                                    Mỗi bạn nên gửi đúng email sinh viên đuôi @st.buh.edu.vn để team đối chiếu nhanh và tránh cấp nhầm tài khoản.
                                </p>
                            </div>

                            <div className="rounded-xl border border-gray-300 bg-white p-5">
                                <div className="flex items-center gap-2 text-[#003375]">
                                    <Check size={18} />
                                    <h4 className="font-black text-gray-900">Thời gian xử lý</h4>
                                </div>
                                <p className="mt-3 text-sm leading-relaxed text-gray-600">
                                    Yêu cầu được kiểm tra theo lượt. Sau khi lưu thông tin, hãy nhắn Zalo kèm nội dung đã sao chép để được duyệt.
                                </p>
                            </div>

                            <div className="rounded-xl border border-gray-300 bg-white p-5">
                                <div className="flex items-center gap-2 text-[#003375]">
                                    <HelpCircle size={18} />
                                    <h4 className="font-black text-gray-900">FAQ nhanh</h4>
                                </div>
                                <div className="mt-3 space-y-2 text-sm leading-relaxed text-gray-600">
                                    <p><span className="font-bold text-gray-900">Có cần dùng mail HUB?</span> Có, team sẽ hướng dẫn nhận mail HUB sau khi duyệt.</p>
                                    <p><span className="font-bold text-gray-900">Email cá nhân được không?</span> Không, chỉ nhận email sinh viên HUB.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                );

            case 'feedback':
                return (
                    <div className="animate-fadeIn space-y-3 max-w-4xl mx-auto">
                        <div className="bg-white p-5 rounded-xl border border-gray-300 shadow-sm">
                            {submitStatus === 'success' ? (
                                <div className="text-center py-8 animate-scaleIn">
                                    <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Check size={32} />
                                    </div>
                                    <h4 className="text-xl font-bold text-gray-800 mb-2">Đã gửi thành công!</h4>
                                    <p className="text-gray-500">Cảm ơn bạn đã đóng góp ý kiến cho HUB Planner.</p>
                                    <button
                                        onClick={() => setSubmitStatus('idle')}
                                        className="mt-4 text-[#003375] font-semibold hover:underline"
                                    >
                                        Gửi phản hồi khác
                                    </button>
                                </div>
                            ) : (
                                <form onSubmit={handleSubmitFeedback} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Bạn muốn gửi nội dung gì?</label>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setFeedbackType('bug')}
                                                className={`p-3 rounded-lg border flex items-center gap-3 text-left transition-all ${feedbackType === 'bug' ? 'bg-red-50 border-red-500 text-red-700 ring-1 ring-red-500' : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'}`}
                                            >
                                                <div className={`p-2 rounded-full ${feedbackType === 'bug' ? 'bg-red-200' : 'bg-gray-100'}`}>
                                                    <Mail size={20} />
                                                </div>
                                                <span className="font-bold text-sm">Báo lỗi kỹ thuật</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setFeedbackType('idea')}
                                                className={`p-3 rounded-lg border flex items-center gap-3 text-left transition-all ${feedbackType === 'idea' ? 'bg-blue-50 border-blue-500 text-blue-700 ring-1 ring-blue-500' : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'}`}
                                            >
                                                <div className={`p-2 rounded-full ${feedbackType === 'idea' ? 'bg-blue-200' : 'bg-gray-100'}`}>
                                                    <ExternalLink size={20} />
                                                </div>
                                                <span className="font-bold text-sm">Đóng góp ý tưởng</span>
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">
                                            Nội dung chi tiết <span className="text-red-500">*</span>
                                        </label>
                                        <textarea
                                            required
                                            rows={4}
                                            placeholder={feedbackType === 'bug' ? "Mô tả lỗi bạn gặp, thiết bị đang dùng và thời điểm xảy ra lỗi..." : "Bạn muốn HUB Planner có thêm tính năng gì? Tính năng đó giúp ích như thế nào?"}
                                            className="w-full p-3 rounded-lg border border-gray-300 focus:border-[#003375] outline-none transition-all"
                                            value={feedbackContent}
                                            onChange={(e) => setFeedbackContent(e.target.value)}
                                        ></textarea>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">
                                            Thông tin liên hệ (Không bắt buộc)
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="Email hoặc SĐT (để chúng mình liên hệ lại nếu cần)"
                                            className="w-full p-3 rounded-lg border border-gray-300 focus:border-[#003375] outline-none transition-all"
                                            value={contactInfo}
                                            onChange={(e) => setContactInfo(e.target.value)}
                                        />
                                    </div>

                                    {submitStatus === 'error' && (
                                        <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                                            <Info size={16} /> Có lỗi xảy ra, vui lòng thử lại sau.
                                        </div>
                                    )}

                                    <TurnstileBox token={feedbackTurnstileToken} onTokenChange={setFeedbackTurnstileToken} />

                                    <button 
                                        type="submit"
                                        disabled={isSubmitting || !feedbackContent.trim() || !feedbackTurnstileToken}
                                        className="w-full bg-[#003375] hover:bg-[#002855] text-white font-bold py-3 rounded-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {isSubmitting ? (
                                            <>Đang gửi...</>
                                        ) : (
                                            <>Gửi phản hồi <MessageSquarePlus size={18} /></>
                                        )}
                                    </button>
                                </form>
                            )}
                        </div>

                        <div className="bg-gray-50 p-3 rounded-xl border border-gray-300 text-center text-sm text-gray-600">
                            Bạn cũng có thể liên hệ trực tiếp qua Fanpage <a href="https://www.facebook.com/hubplannerr" target="_blank" rel="noopener noreferrer" className="font-bold text-[#003375] hover:underline">HUB Planner</a>.
                        </div>
                    </div>
                );

            case 'donate':
                return (
                    <div className="animate-fadeIn pb-10 max-w-6xl mx-auto">
                        {/* 1. HEADER KÊU GỌI & QR CODE */}
                        <div className="bg-gradient-to-r from-pink-500 to-rose-500 rounded-2xl p-8 text-white mb-10 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-10 rounded-full -translate-y-1/2 translate-x-1/3"></div>
                            
                            <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
                                <div className="flex-1 text-center md:text-left">
                                    <div className="inline-flex items-center gap-2 bg-white/20 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-4 border border-white/30">
                                        <Heart size={14} className="fill-current" /> Đồng hành cùng HUB Planner
                                    </div>
                                    <h2 className="text-3xl font-black mb-4 leading-tight">
                                        Chung tay phát triển <br/> Cộng đồng sinh viên
                                    </h2>
                                    <p className="text-pink-100 text-lg mb-6 leading-relaxed">
                                        Dự án phi lợi nhuận cần sự hỗ trợ của bạn để duy trì Server và phát triển tính năng mới. 
                                        Mọi sự đóng góp dù nhỏ nhất đều là động lực to lớn với chúng mình!
                                    </p>
                                </div>

                                {/* KHUNG M QR */}
                                <div className="shrink-0 bg-white p-4 rounded-2xl">
                                    <div className="w-48 h-48 bg-gray-100 rounded-lg overflow-hidden mb-2">
                                        <img src="/qr-code.png" alt="QR Code Momo/Bank" className="w-full h-full object-cover" />
                                    </div>
                                    <p className="text-center text-gray-500 text-xs font-bold uppercase tracking-wider">Quét mã ủng hộ</p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            {/* 2. FORM XÁC NHẬN ỦNG HỘ */}
                            <div className="bg-white p-6 rounded-xl border border-gray-300 h-fit">
                                <h3 className="text-xl font-bold text-[#003375] mb-1">Xác nhận ủng hộ</h3>
                                <p className="text-sm text-gray-500 mb-6">Điền thông tin để chúng mình vinh danh bạn trên Bảng vàng nhé!</p>
                                
                                <form onSubmit={handleDonateSubmit} className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Họ tên <span className="text-red-500">*</span></label>
                                            <input 
                                                type="text" required 
                                                className="w-full p-2.5 rounded-lg border border-gray-300 focus:border-pink-500 outline-none transition-all"
                                                placeholder="Nguyễn Văn A"
                                                value={donateForm.name}
                                                onChange={e => setDonateForm({...donateForm, name: e.target.value})}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Số tiền <span className="text-red-500">*</span></label>
                                            <input 
                                                type="text" required 
                                                className="w-full p-2.5 rounded-lg border border-gray-300 focus:border-pink-500 outline-none transition-all"
                                                placeholder="Ví dụ: 20.000"
                                                value={donateForm.amount}
                                                onChange={e => setDonateForm({...donateForm, amount: e.target.value})}
                                            />
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">MSSV (Tùy chọn)</label>
                                        <input 
                                            type="text" 
                                            className="w-full p-2.5 rounded-lg border border-gray-300 focus:border-pink-500 outline-none transition-all"
                                            placeholder="Để trống nếu muốn ẩn danh"
                                            value={donateForm.mssv}
                                            onChange={e => setDonateForm({...donateForm, mssv: e.target.value})}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Lời nhắn gửi</label>
                                        <textarea 
                                            rows={3}
                                            className="w-full p-2.5 rounded-lg border border-gray-300 focus:border-pink-500 outline-none transition-all"
                                            placeholder="Gửi lời yêu thương đến team..."
                                            value={donateForm.message}
                                            onChange={e => setDonateForm({...donateForm, message: e.target.value})}
                                        ></textarea>
                                    </div>

                                    <TurnstileBox token={donateTurnstileToken} onTokenChange={setDonateTurnstileToken} />

                                    <button 
                                        type="submit" 
                                        disabled={isDonating || !donateTurnstileToken}
                                        className="w-full bg-pink-600 hover:bg-pink-700 text-white font-bold py-3 rounded-lg transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {isDonating ? 'Đang gửi...' : <><Heart size={18} className="fill-current"/> Gửi thông tin</>}
                                    </button>
                                </form>
                            </div>

                            {/* 3. BẢNG VÀNG TRI ÂN */}
                            <div className="bg-white rounded-xl border border-gray-300 overflow-hidden flex flex-col h-[500px]">
                                <div className="bg-yellow-50 p-4 border-b border-yellow-200 flex items-center justify-between">
                                    <div>
                                        <h3 className="text-lg font-black text-yellow-800 flex items-center gap-2 uppercase tracking-wide">
                                            <Crown size={20} className="fill-yellow-500 text-yellow-600"/> Bảng vàng tri ân
                                        </h3>
                                        <p className="text-xs text-yellow-700 mt-1">Cập nhật realtime từ hệ thống</p>
                                    </div>
                                    <div className="bg-white px-3 py-1 rounded-full text-xs font-bold text-yellow-700 border border-yellow-200">
                                        {donors.length} lượt ủng hộ
                                    </div>
                                </div>

                                <div className="overflow-y-auto custom-scrollbar flex-1 p-2 space-y-2">
                                    {loadingDonors ? (
                                        <div className="text-center py-10 text-gray-400">Đang tải danh sách...</div>
                                    ) : donors.length === 0 ? (
                                        <div className="text-center py-10 text-gray-400 italic">Chưa có ai, hãy là người đầu tiên! 🥇</div>
                                    ) : (
                                        donors.map((donor, idx) => (
                                            <div key={idx} className="bg-white p-3 rounded-lg border border-gray-300 flex items-start gap-3 hover:bg-gray-50 transition-colors">
                                                <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm 
                                                    ${idx === 0 ? 'bg-yellow-400 text-white ring-2 ring-yellow-200' : 
                                                      idx === 1 ? 'bg-gray-300 text-white' : 
                                                      idx === 2 ? 'bg-orange-300 text-white' : 'bg-blue-50 text-blue-600'}`}
                                                >
                                                    {idx + 1}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-start">
                                                        <h4 className="font-bold text-gray-800 text-sm truncate">{donor.name}</h4>
                                                        <span className="text-green-600 font-bold text-sm bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                                                            {formatCurrency(donor.amount)}
                                                        </span>
                                                    </div>
                                                    {donor.message && (
                                                        <p className="text-xs text-gray-500 italic mt-1 line-clamp-2">"{donor.message}"</p>
                                                    )}
                                                    {donor.student_id && (
                                                        <p className="text-[10px] text-gray-400 mt-1 uppercase">MSSV: {donor.student_id}</p>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                );

            case 'about':
                const founder = {
                    name: 'Trần Quốc Hoàng',
                    role: 'Founder',
                    phone: '0389342812',
                    email: 'contact@hotrosinhvienhub.id.vn',
                    fb: 'http://facebook.com/tqhoangg.05'
                };

                const collaborators = [
                    { name: 'Nguyễn Hoàng Khiêm', role: 'Cộng tác viên', phone: '0932142577', email: 'khiempisces2@gmail.com', fb: 'https://www.facebook.com/nguyen.hoang.khiem.975396' },
                    { name: 'Nguyễn Thùy Thương', role: 'Cộng tác viên', phone: '0385234814', email: 'nguyenthuythuong12032006@gmail.com', fb: 'https://www.facebook.com/thuong.nguyen.197154' },
                    { name: 'Nguyễn Xuân Bách', role: 'Cộng tác viên', phone: '0353748683', email: 'bachalone2912@gmail.com', fb: 'https://www.facebook.com/nguyen.bach.919988' },
                    { name: 'Lai Quế Anh', role: 'Cộng tác viên', phone: '0888041106', email: 'queanh041195@gmail.com', fb: 'https://www.facebook.com/share/14deFjLJSet/?mibextid=wwXIfr' },
                    { name: 'Đang cập nhật...', role: 'Đang cập nhật', isPlaceholder: true },
                ];

                return (
                    <div className="animate-fadeIn pb-10 max-w-6xl mx-auto">
                        {/* Hero Section */}
                        <div className="bg-white rounded-2xl border border-gray-300 p-8 mb-10 flex flex-col md:flex-row items-center gap-8 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
                            <div className="flex-1 relative z-10">
                                <div className="inline-block bg-blue-100 text-[#003375] px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-4 border border-blue-200">
                                    Về dự án
                                </div>
                                <h2 className="text-3xl md:text-4xl font-black text-[#003375] mb-6 uppercase tracking-tight">
                                    Về chúng mình
                                </h2>
                                <p className="text-gray-600 leading-relaxed text-base md:text-lg text-justify">
                                    <span className="font-bold text-[#003375]">HUB PLANNER</span> là dự án phi lợi nhuận được phát triển bởi chính sinh viên trường Đại học Ngân hàng TP.HCM. Xuất phát từ nhu cầu thực tế, chúng mình tạo ra HUB PLANNER với sứ mệnh đơn giản hóa đời sống sinh viên, từ quản lý điểm số đến kết nối cộng đồng. Chúng mình luôn nỗ lực hoàn thiện từng ngày để mang lại trải nghiệm tốt nhất cho các bạn.
                                </p>
                                <div className="mt-6 flex items-center gap-2 text-[#990000] font-bold text-sm">
                                    <Heart className="fill-current animate-pulse" size={18} />
                                    <span>Made with love for HUB Students</span>
                                </div>
                            </div>
                            {/* Logo Section */}
                            <div className="shrink-0 relative z-10 flex items-center justify-center w-64 h-64">
                                <img
                                    src="/logo.png"
                                    alt="HUB Planner Logo"
                                    className="w-full h-full object-contain"
                                />
                            </div>
                        </div>

                        {/* Team Section */}
                        <div className="text-center mb-10">
                            <h3 className="text-2xl font-black text-gray-800 uppercase tracking-widest relative inline-block pb-2">
                                Humans of HUB Planner
                                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-1 bg-[#990000] rounded-full"></div>
                            </h3>
                        </div>

                        {/* Founder Card */}
                        <div className="max-w-md mx-auto mb-10">
                            <div className="bg-gradient-to-br from-[#003375] to-[#00509d] rounded-2xl overflow-hidden text-white relative group cursor-default">
                                <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                                <div className="p-8 text-center relative z-10">
                                    <div className="w-24 h-24 mx-auto bg-white rounded-full p-1 mb-4 flex items-center justify-center text-[#003375] font-bold text-3xl">
                                        H
                                    </div>
                                    <h4 className="text-2xl font-bold mb-1">{founder.name}</h4>
                                    <p className="text-blue-200 text-sm font-semibold uppercase tracking-widest mb-6 bg-white/10 inline-block px-3 py-1 rounded-full border border-white/20">{founder.role}</p>

                                    <div className="flex justify-center gap-4 mt-6">
                                        {/* Phone */}
                                        <a href={`tel:${founder.phone}`} className="p-3 bg-white/10 hover:bg-white text-white hover:text-[#003375] rounded-full transition-all active:scale-95 relative group/icon">
                                            <Phone size={20} />
                                        </a>
                                        {/* Mail */}
                                        <a href={`mailto:${founder.email}`} className="p-3 bg-white/10 hover:bg-white text-white hover:text-[#990000] rounded-full transition-all active:scale-95 relative group/icon">
                                            <Mail size={20} />
                                        </a>
                                        {/* FB */}
                                        <a href={founder.fb} target="_blank" rel="noopener noreferrer" className="p-3 bg-white/10 hover:bg-white text-white hover:text-blue-600 rounded-full transition-all active:scale-95 relative group/icon">
                                            <Facebook size={20} />
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Collaborators Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            {collaborators.map((member, idx) => (
                                <div
                                    key={idx}
                                    className={`bg-white rounded-xl border p-6 flex flex-col items-center text-center transition-all duration-300 ${member.isPlaceholder ? 'border-dashed border-gray-300 opacity-60' : 'border-gray-300 hover:border-[#003375]'}`}
                                >
                                    <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-3 ${member.isPlaceholder ? 'bg-gray-100 text-gray-400' : 'bg-blue-50 text-[#003375]'}`}>
                                        <User size={32} />
                                    </div>
                                    <h5 className={`font-bold text-lg mb-1 ${member.isPlaceholder ? 'text-gray-400' : 'text-gray-800'}`}>{member.name}</h5>
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{member.role}</p>

                                    {!member.isPlaceholder && (
                                        <div className="flex gap-4 mt-auto pt-4 border-t border-gray-200 w-full justify-center">
                                            {member.phone && (
                                                <a href={`tel:${member.phone}`} className="text-gray-400 hover:text-green-600 transition-colors bg-gray-50 p-2 rounded-full hover:bg-green-50">
                                                    <Phone size={18} />
                                                </a>
                                            )}
                                            {member.email && (
                                                <a href={`mailto:${member.email}`} className="text-gray-400 hover:text-[#990000] transition-colors bg-gray-50 p-2 rounded-full hover:bg-red-50">
                                                    <Mail size={18} />
                                                </a>
                                            )}
                                            {member.fb && (
                                                <a href={member.fb} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-600 transition-colors bg-gray-50 p-2 rounded-full hover:bg-blue-50">
                                                    <Facebook size={18} />
                                                </a>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                );

            default:
                return null;
        }
    };

    // Helper: Định dạng lại tiêu đề Header cho từng Tab
    const getTabHeaderInfo = (tab: TabType) => {
        switch (tab) {
            case 'contacts': return { title: 'Danh bạ & Khoa', sub: 'Thông tin liên hệ các phòng ban' };
            case 'clubs': return { title: 'CLB - Đội - Nhóm', sub: 'Hoạt động ngoại khóa & Đoàn - Hội' };
            case 'scholarships': return { title: 'Học bổng & Quy chế', sub: 'Thông tin học vụ & Chế độ' };
            case 'faqs': return { title: 'Câu hỏi thường gặp', sub: 'Hỗ trợ giải đáp (FAQs)' };
            case 'plagiarism': return { title: 'Check đạo văn Turnitin', sub: 'Kiểm tra tỷ lệ trùng lắp' };
            case 'canva': return { title: 'Canva Pro', sub: 'Đăng ký tài khoản Canva' };
            case 'feedback': return { title: 'Góp ý & Phản hồi', sub: 'Đóng góp ý tưởng phát triển' };
            case 'donate': return { title: 'Ủng hộ & Tri ân', sub: 'Đồng hành cùng dự án' };
            case 'about': return { title: 'Về chúng mình', sub: 'Đội ngũ HUB Planner' };
            default: return { title: 'Cẩm nang', sub: 'Thông tin sinh viên' };
        }
    };

    const headerInfo = getTabHeaderInfo(activeTab);

    return (
        <div className="w-full max-w-6xl mx-auto pb-10">
            {/* HEADER CHUẨN DASHBOARD */}
            <div className="flex flex-col mb-3 px-1 overflow-hidden">
                <h1 className="text-[22px] sm:text-2xl font-black text-[#003375] leading-tight">
                    {headerInfo.title}
                </h1>
                <div className="flex items-center gap-1.5 mt-1.5 text-[12px] text-gray-500 overflow-x-auto whitespace-nowrap custom-scrollbar pb-1">
                    <span className="shrink-0">Cẩm nang</span>
                    <span className="text-gray-300 shrink-0">•</span>
                    <span className="font-bold text-gray-700 shrink-0">{headerInfo.sub}</span>
                </div>
            </div>

            {/* CONTENT TRÀN FULL MÀN HÌNH */}
            <div className="w-full">
                {renderContent()}
            </div>
        </div>
    );
};
