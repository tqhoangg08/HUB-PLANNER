import React, { useEffect, useMemo, useState } from 'react';
import {
    Award,
    BookOpen,
    Calendar,
    Calculator,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    ExternalLink,
    Headset,
    MessageSquare,
    Search,
    X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { playClick } from '../utils/audio';

interface UserGuideModalProps {
    onClose: () => void;
}

type GuideItem = {
    title: string;
    nav: string;
    icon: React.ElementType;
    accent: string;
    bg: string;
    summary: string;
    useFor: string[];
    steps: string[];
    tips: string[];
    cta: string;
    path: string;
    href?: string;
    links?: Array<{
        label: string;
        description: string;
        href?: string;
        path?: string;
        icon: React.ElementType;
    }>;
};

const guideItems: GuideItem[] = [
    {
        title: 'GPA Planner',
        nav: 'GPA',
        icon: Calculator,
        accent: 'text-blue-700',
        bg: 'bg-blue-50',
        summary: 'Dùng để nhập điểm, xem GPA hiện tại và thử đặt mục tiêu tốt nghiệp.',
        useFor: [
            'Biết nhanh GPA hệ 10 và hệ 4 đang ở mức nào.',
            'Xem kỳ nào đang kéo điểm lên hoặc kéo điểm xuống.',
            'Ước lượng các kỳ còn lại cần đạt khoảng bao nhiêu điểm để chạm mục tiêu.',
        ],
        steps: [
            'Vào Tổng quan, kéo đến phần bảng điểm hoặc lộ trình học tập.',
            'Thêm học kỳ, nhập tên môn, số tín chỉ và điểm của từng môn.',
            'Nếu đã có file điểm, dùng nút nhập điểm để đỡ phải gõ lại từng dòng.',
            'Đặt GPA mục tiêu nếu bạn muốn xem các kỳ sau cần cố tới mức nào.',
        ],
        tips: [
            'Môn chưa có điểm thì để trống, đừng nhập đại kẻo GPA bị lệch.',
            'Sau khi sửa điểm hoặc tín chỉ, kiểm tra lại tổng tín chỉ của kỳ đó.',
            'Nếu thấy GPA khác Portal, xem lại các môn không tính vào trung bình chung.',
        ],
        cta: 'Mở GPA Planner',
        path: '/dashboard',
    },
    {
        title: 'Thời khóa biểu',
        nav: 'TKB',
        icon: Calendar,
        accent: 'text-emerald-700',
        bg: 'bg-emerald-50',
        summary: 'Dùng để xem lịch học, lịch thi và tự ghép lịch cá nhân trước khi đăng ký môn.',
        useFor: [
            'Xem hôm nay học môn gì, phòng nào, tiết nào.',
            'Lọc môn theo mã môn, tên môn, giảng viên hoặc lớp học phần.',
            'Thử thêm môn vào lịch để xem có bị trùng giờ học hoặc trùng lịch thi không.',
        ],
        steps: [
            'Vào Thời khóa biểu, chọn tuần hoặc tháng bạn muốn xem.',
            'Tìm môn cần kiểm tra bằng ô tìm kiếm hoặc bộ lọc.',
            'Bấm thêm vào lịch cá nhân nếu muốn giữ môn đó để so lịch.',
            'Khi có cảnh báo trùng, mở chi tiết để xem trùng với môn nào rồi đổi lớp khác.',
        ],
        tips: [
            'Nên kiểm tra cả giờ học lẫn lịch thi, vì có môn học không trùng nhưng thi lại trùng.',
            'Nếu phòng học hoặc giảng viên có vẻ sai, dùng báo lỗi môn để gửi góp ý.',
            'Trước ngày học, vẫn nên xem lại một lần vì lịch trường có thể được cập nhật.',
        ],
        cta: 'Xem thời khóa biểu',
        path: '/schedule',
    },
    {
        title: 'Sự kiện & điểm rèn luyện',
        nav: 'ĐRL',
        icon: Award,
        accent: 'text-orange-700',
        bg: 'bg-orange-50',
        summary: 'Dùng để tìm hoạt động có điểm rèn luyện và lưu lại những sự kiện bạn muốn tham gia.',
        useFor: [
            'Xem sự kiện mới theo từng nhóm điểm rèn luyện.',
            'Biết sự kiện nào còn hạn, sự kiện nào sắp diễn ra.',
            'Góp sự kiện mới để các bạn khác cũng thấy.',
        ],
        steps: [
            'Vào Sự kiện ĐRL, xem danh sách sự kiện đang mở.',
            'Dùng bộ lọc để chọn mục điểm, hình thức hoặc thời gian phù hợp.',
            'Mở chi tiết sự kiện để đọc điều kiện tham gia, hạn đăng ký và điểm dự kiến.',
            'Lưu lại sự kiện quan tâm để quay lại nhanh hơn khi cần.',
        ],
        tips: [
            'Đọc kỹ điều kiện ghi nhận điểm, nhất là minh chứng hoặc form điểm danh.',
            'Sự kiện hết hạn vẫn có thể còn thông tin tham khảo, nhưng đừng dùng để đăng ký muộn.',
            'Nếu thấy thiếu sự kiện từ fanpage trường/khoa, bạn có thể đóng góp link.',
        ],
        cta: 'Tìm sự kiện',
        path: '/events',
    },
    {
        title: 'Tìm đồ thất lạc',
        nav: 'Lost & Found',
        icon: Search,
        accent: 'text-violet-700',
        bg: 'bg-violet-50',
        summary: 'Dùng để đăng tin mất đồ, nhặt được đồ hoặc tìm lại đồ bị thất lạc trong trường.',
        useFor: [
            'Đăng tin khi mất thẻ sinh viên, ví, chìa khóa, tai nghe, laptop hoặc giấy tờ.',
            'Tìm tin theo khu vực nhặt được, loại đồ và thời gian.',
            'Liên hệ người đăng để xác nhận đồ trước khi nhận lại.',
        ],
        steps: [
            'Vào Tìm đồ thất lạc, chọn đăng tin mất đồ hoặc nhặt được đồ.',
            'Ghi rõ món đồ, màu sắc, đặc điểm nhận dạng và khu vực liên quan.',
            'Thêm ảnh nếu có để người khác nhận ra nhanh hơn.',
            'Khi đã tìm được hoặc trả lại đồ, cập nhật trạng thái để tránh người khác nhắn tiếp.',
        ],
        tips: [
            'Không đăng công khai thông tin quá riêng tư như số giấy tờ đầy đủ.',
            'Khi nhận đồ, nên mô tả được đặc điểm riêng để tránh nhận nhầm.',
            'Tin càng rõ khu vực và thời gian thì càng dễ tìm lại.',
        ],
        cta: 'Mở bảng tin',
        path: '/lost-found',
    },
    {
        title: 'Cẩm nang & hỗ trợ',
        nav: 'Hỗ trợ',
        icon: BookOpen,
        accent: 'text-sky-700',
        bg: 'bg-sky-50',
        summary: 'Dùng để tra các thông tin hay cần trong quá trình học và gửi góp ý khi gặp lỗi.',
        useFor: [
            'Tra nhanh quy chế, biểu mẫu, sơ đồ phòng học và câu hỏi thường gặp.',
            'Tìm lại các hướng dẫn nhập điểm, xem lịch, dùng sự kiện hoặc báo lỗi.',
            'Gửi feedback khi thấy nội dung chưa đúng hoặc cần bổ sung.',
        ],
        steps: [
            'Vào Cẩm nang, chọn nhóm nội dung bạn đang cần.',
            'Dùng ô tìm kiếm nếu bạn chỉ nhớ vài từ khóa.',
            'Đọc phần câu hỏi thường gặp trước khi nhắn hỗ trợ.',
            'Nếu vẫn chưa giải quyết được, gửi feedback kèm mô tả ngắn vấn đề bạn gặp.',
        ],
        tips: [
            'Khi báo lỗi, ghi rõ bạn đang ở màn hình nào và đã bấm gì trước đó.',
            'Nếu báo sai dữ liệu môn học hoặc sự kiện, gửi kèm link hoặc ảnh chụp sẽ dễ kiểm tra hơn.',
            'Các nội dung liên quan quy định nên đối chiếu lại với thông báo chính thức khi cần.',
        ],
        cta: 'Mở cẩm nang',
        path: '/handbook',
    },
    {
        title: 'Liên hệ',
        nav: 'Liên hệ',
        icon: Headset,
        accent: 'text-rose-700',
        bg: 'bg-rose-50',
        summary: 'Dùng khi bạn gặp lỗi, thấy dữ liệu chưa đúng hoặc muốn góp ý thêm tính năng.',
        useFor: [
            'Báo lỗi hiển thị, lỗi thao tác hoặc nội dung chưa đúng.',
            'Gửi góp ý để chỉnh dữ liệu môn học, sự kiện, cẩm nang.',
            'Liên hệ trực tiếp khi bạn cần phản hồi rõ hơn.',
        ],
        steps: [
            'Nếu đang ở trong web, dùng nút Feedback trên menu để gửi nhanh.',
            'Fanpage: facebook.com/hubplannerr.',
            'Email hỗ trợ: contact@hotrosinhvienhub.id.vn.',
            'Khi nhắn, ghi rõ bạn đang ở màn hình nào, bấm gì và lỗi xảy ra ra sao.',
        ],
        tips: [
            'Góp ý càng cụ thể thì càng dễ xử lý.',
            'Không gửi mật khẩu hoặc thông tin riêng tư trong nội dung feedback.',
            'Nếu có ảnh chụp màn hình hoặc link liên quan, gửi kèm để dễ kiểm tra hơn.',
        ],
        cta: 'Mở Feedback',
        path: '/handbook/feedback',
        links: [
            {
                label: 'Feedback trong web',
                description: 'Mở đúng form góp ý & báo lỗi của HUB Planner.',
                path: '/handbook/feedback',
                icon: MessageSquare,
            },
            {
                label: 'Fanpage HUB Planner',
                description: 'Nhắn trực tiếp khi cần hỗ trợ hoặc phản hồi rõ hơn.',
                href: 'https://www.facebook.com/hubplannerr',
                icon: Headset,
            },
            {
                label: 'Email hỗ trợ',
                description: 'contact@hotrosinhvienhub.id.vn',
                href: 'mailto:contact@hotrosinhvienhub.id.vn',
                icon: MessageSquare,
            },
        ],
    },
];

export const UserGuideModal: React.FC<UserGuideModalProps> = ({ onClose }) => {
    const [activeIndex, setActiveIndex] = useState(0);
    const navigate = useNavigate();
    const active = guideItems[activeIndex];
    const ActiveIcon = active.icon;

    const progressText = useMemo(() => `${activeIndex + 1}/${guideItems.length}`, [activeIndex]);

    useEffect(() => {
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = originalOverflow;
        };
    }, []);

    const goTo = (index: number) => {
        playClick();
        setActiveIndex(index);
    };

    const goPrev = () => {
        playClick();
        setActiveIndex((current) => Math.max(0, current - 1));
    };

    const goNext = () => {
        playClick();
        setActiveIndex((current) => Math.min(guideItems.length - 1, current + 1));
    };

    const openActiveFeature = () => {
        playClick();
        onClose();
        navigate(active.path);
    };

    const openGuideLink = (link: NonNullable<GuideItem['links']>[number]) => {
        playClick();
        onClose();

        if (link.path) {
            navigate(link.path);
            return;
        }

        if (link.href) {
            window.open(link.href, '_blank', 'noopener,noreferrer');
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/55 p-3 animate-fadeIn">
            <div className="flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-xl animate-scaleIn">
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-3 sm:px-6">
                    <div>
                        <div className="mb-1.5 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.1em] text-slate-500">
                            <span>{progressText}</span>
                            <span>Hướng dẫn nhanh</span>
                        </div>
                        <h3 className="text-2xl font-black leading-tight text-slate-950 sm:text-[28px]">
                            Cách dùng HUB Planner
                        </h3>
                    </div>
                    <button
                        onClick={() => { playClick(); onClose(); }}
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 active:scale-95"
                        title="Đóng"
                    >
                        <X size={19} />
                    </button>
                </div>

                <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[220px_1fr]">
                    <aside className="border-b border-slate-200 bg-slate-50/80 p-3 md:border-b-0 md:border-r">
                        <div className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
                            {guideItems.map((item, index) => {
                                const ItemIcon = item.icon;
                                const isActive = index === activeIndex;

                                return (
                                    <button
                                        key={item.title}
                                        onClick={() => goTo(index)}
                                        className={`flex min-w-max items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-bold transition md:min-w-0 ${
                                            isActive
                                                ? 'bg-white text-slate-950 ring-1 ring-slate-200'
                                                : 'text-slate-500 hover:bg-white/70 hover:text-slate-800'
                                        }`}
                                    >
                                        <span className={`grid h-8 w-8 place-items-center rounded-xl ${isActive ? item.bg : 'bg-white'}`}>
                                            <ItemIcon size={17} className={isActive ? item.accent : 'text-slate-400'} />
                                        </span>
                                        <span>{item.nav}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </aside>

                    <div className="min-h-0 overflow-y-auto p-4 sm:p-5">
                        <div className="mb-4 flex items-start gap-3">
                            <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${active.bg}`}>
                                <ActiveIcon size={24} className={active.accent} />
                            </div>
                            <div>
                                <h4 className="text-xl font-black text-slate-950">{active.title}</h4>
                                <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
                                    {active.summary}
                                </p>
                            </div>
                        </div>

                        {active.links && (
                            <div className="mb-3 grid gap-2.5 sm:grid-cols-2">
                                {active.links.map((link) => {
                                    const LinkIcon = link.icon;
                                    const linkKey = link.path || link.href || link.label;

                                    return (
                                        <button
                                            key={linkKey}
                                            type="button"
                                            onClick={() => openGuideLink(link)}
                                            className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-[#003375]/30 hover:bg-slate-50"
                                        >
                                            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${active.bg}`}>
                                                <LinkIcon size={18} className={active.accent} />
                                            </span>
                                            <span>
                                                <span className="block text-sm font-black text-slate-900">{link.label}</span>
                                                <span className="mt-0.5 block text-[13px] font-semibold leading-5 text-slate-600">{link.description}</span>
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
                            <section className="rounded-2xl border border-slate-200 bg-white p-4">
                                <p className="mb-3 text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Dùng để làm gì</p>
                                <ul className="space-y-3">
                                    {active.useFor.map((item) => (
                                        <li key={item} className="flex gap-2.5 text-sm font-medium leading-6 text-slate-700">
                                            <CheckCircle2 size={16} className={`${active.accent} mt-0.5 shrink-0`} />
                                            <span>{item}</span>
                                        </li>
                                    ))}
                                </ul>
                            </section>

                            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <p className="mb-3 text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Cách dùng nhanh</p>
                                <ol className="space-y-3">
                                    {active.steps.map((step, index) => (
                                        <li key={step} className="flex gap-2.5 text-sm font-medium leading-6 text-slate-700">
                                            <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${active.bg} text-[11px] font-black ${active.accent}`}>
                                                {index + 1}
                                            </span>
                                            <span>{step}</span>
                                        </li>
                                    ))}
                                </ol>
                            </section>
                        </div>

                        <section className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
                            <p className="mb-3 text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Lưu ý nhỏ</p>
                            <div className="grid gap-2.5 sm:grid-cols-3">
                                {active.tips.map((tip) => (
                                    <div key={tip} className="rounded-2xl bg-slate-50 px-3 py-2.5 text-[13px] font-semibold leading-5 text-slate-600">
                                        {tip}
                                    </div>
                                ))}
                            </div>
                        </section>

                        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                            <button
                                onClick={openActiveFeature}
                                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#003375] px-5 py-3 text-sm font-black text-white transition hover:bg-[#082f66] active:scale-[0.98]"
                            >
                                {active.cta}
                                <ExternalLink size={16} />
                            </button>
                            <button
                                onClick={goNext}
                                disabled={activeIndex === guideItems.length - 1}
                                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Sang mục tiếp theo
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:px-7">
                    <button
                        onClick={goPrev}
                        disabled={activeIndex === 0}
                        className="grid h-11 w-11 place-items-center rounded-full border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
                        title="Quay lại"
                    >
                        <ChevronLeft size={18} />
                    </button>

    

                    <button
                        onClick={() => { playClick(); onClose(); }}
                        className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-slate-800 active:scale-[0.98]"
                    >
                        Đã hiểu
                    </button>
                </div>
            </div>
        </div>
    );
};
