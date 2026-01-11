import React, { useState } from 'react';
import { supabase } from '../utils/supabase';
import { Database, Loader2, CheckCircle, AlertCircle, Play } from 'lucide-react';

export const MigrateTool: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);

    // --- HARDCODED DATA (Copied from Handbook.tsx) ---
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

    const busRoutes = [
        { id: '53', name: 'Lê Hồng Phong – ĐH Quốc gia', time: '5h00 – 19h30', freq: '7–15 phút', color: 'bg-blue-600' },
        { id: '104', name: 'Bến xe An Sương – ĐH Nông Lâm', time: '4h40 – 19h45', freq: '4–12 phút', color: 'bg-green-600' },
        { id: '168', name: 'ĐH Ngân hàng – Metro Thủ Đức', time: '5h00 – 22h00', freq: '10–12 phút', color: 'bg-orange-500' },
    ];

    const clubs = [
        {
            type: 'Học thuật',
            list: [
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
                { name: 'CLB Học thuật GIEO', link: '', email: 'gieoclub@hub.edu.vn', manager: 'Đoàn khoa HTTTQL' }
            ]
        },
        {
            type: 'Kỹ năng',
            list: [
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
            type: 'Sở thích & Văn thể',
            list: [
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
            type: 'Tình nguyện',
            list: [
                { name: 'CLB Hỗ trợ SV Trực tuyến (OSAC)', link: 'https://www.facebook.com/hotrosinhvientructuyen', email: 'osac@hub.edu.vn', manager: 'Đoàn trường' },
                { name: 'CLB Tủ sách tình bạn', link: 'https://www.facebook.com/clbtusachtinhban', email: 'clb.tstb@hub.edu.vn', manager: 'Hội SV' },
                { name: 'Đội Tình nguyện Mầm Xanh', link: 'https://www.facebook.com/mamxanhtinhnguyen', email: 'mamxanhtn@hub.edu.vn', manager: 'Hội SV' },
                { name: 'Đội Công tác Xã hội', link: 'https://www.facebook.com/HUB.QTKD.CTXH', email: 'ctxh.qtkd@hub.edu.vn', manager: 'Đoàn khoa QTKD' }
            ]
        }
    ];

    const faqs = [
        {
            group: "Nhóm 1: Về Bảo Mật & Tài Khoản",
            items: [
                {
                    q: "Web có lưu mật khẩu Portal hay thông tin cá nhân của mình không?",
                    a: "Tuyệt đối không. HUB Planner hoạt động theo cơ chế Client-side, nghĩa là mọi dữ liệu (điểm số, tên, mã SV) chỉ được lưu trực tiếp trên trình duyệt của chính máy bạn (LocalStorage). Web không có máy chủ lưu trữ (Database) nên không thể thu thập thông tin của bạn."
                },
                {
                    q: "Tại sao mình tải lại trang hoặc đổi máy thì dữ liệu bị mất?",
                    a: "Vì dữ liệu được lưu trên trình duyệt (như đã nói ở trên) để đảm bảo bảo mật. Nếu bạn dùng tab ẩn danh (Incognito) hoặc xóa cache, dữ liệu sẽ biến mất. Hãy dùng tab thường để dữ liệu được giữ lại cho lần truy cập sau nhé."
                }
            ]
        },
        {
            group: "Nhóm 2: Về Tính Năng Học Tập",
            items: [
                {
                    q: "Làm sao để nhập điểm tự động từ Portal trường thay vì nhập tay?",
                    a: "Rất đơn giản! Bạn vào Portal -> Xem điểm -> Nhấn Ctrl + P để lưu trang web dưới dạng file PDF. Sau đó quay lại HUB Planner, bấm nút \"Nhập PDF\" màu đỏ và tải file đó lên. Hệ thống sẽ tự tách điểm, tên môn và tín chỉ cho bạn trong 1 giây."
                },
                {
                    q: "Công cụ tính điểm GPA hệ 4 hay hệ 10?",
                    a: "Web hỗ trợ tính song song cả hai. Khi bạn nhập điểm thành phần (CC, Giữa kỳ, Cuối kỳ), hệ thống sẽ tự động quy đổi ra điểm tổng kết hệ 10, điểm chữ (A, B, C...) và điểm hệ 4 để bạn tiện theo dõi chuẩn đầu ra."
                },
                {
                    q: "Tính năng \"Xếp hạng dự báo\" (Ranking) có chính xác không?",
                    a: "Đây là tính năng tham khảo dựa trên dữ liệu ẩn danh của các khóa trước. Nó giúp bạn biết mức điểm hiện tại của mình đang nằm ở Top bao nhiêu % (ví dụ: Top 10% giỏi nhất khoa) để có động lực phấn đấu săn học bổng."
                },
                {
                    q: "AI Cố vấn (Gemini) có thể giúp gì cho mình?",
                    a: "Bạn có thể chat với AI để hỏi về lộ trình học, cách cải thiện điểm các môn khó, hoặc nhờ AI tư vấn xem với GPA hiện tại thì cần nỗ lực bao nhiêu để ra trường đúng hạn."
                }
            ]
        },
        {
            group: "Nhóm 3: Tiện ích mở rộng",
            items: [
                {
                    q: "Mình bị mất đồ tại trường (Thủ Đức/Quận 1), làm sao để đăng tin?",
                    a: "Bạn vào mục Lost & Found, bấm nút \"Đăng tin tìm đồ\". Hãy mô tả chi tiết (loại đồ, màu sắc, khu vực rơi) để các bạn khác dễ thấy. Nếu có hình ảnh minh họa càng tốt."
                }
            ]
        }
    ];

    const addLog = (msg: string) => setLogs(prev => [...prev, msg]);

    const handleMigrate = async () => {
        if (!supabase) {
            addLog("⚠️ Lỗi: Chưa kết nối Supabase!");
            return;
        }
        if (!confirm("Bắt đầu đồng bộ? (Dữ liệu cũ sẽ được giữ nguyên, chỉ thêm mới)")) return;

        setLoading(true);
        setLogs([]);
        addLog("🚀 Bắt đầu quá trình đồng bộ...");

        try {
            // 1. Departments
            addLog("📂 Đang xử lý Departments...");
            const deptPayload = contacts.map(c => ({
                name: c.name,
                email: c.email,
                phone: c.phone,
                address: c.loc,
                category: c.name.startsWith('Khoa') ? 'Khoa' : 'PhongBan',
                is_deleted: false
            }));
            const { error: errDept } = await supabase.from('departments').insert(deptPayload);
            if (errDept) throw new Error(`Lỗi Departments: ${errDept.message}`);
            addLog(`✅ Đã thêm ${deptPayload.length} đơn vị vào bảng 'departments'.`);

            // 2. Bus Routes
            addLog("🚌 Đang xử lý Bus Routes...");
            const busPayload = busRoutes.map(b => ({
                route_number: b.id,
                route_name: b.name,
                operating_hours: b.time,
                frequency: b.freq,
                color: b.color,
                is_deleted: false
            }));
            const { error: errBus } = await supabase.from('bus_routes').insert(busPayload);
            if (errBus) throw new Error(`Lỗi Bus: ${errBus.message}`);
            addLog(`✅ Đã thêm ${busPayload.length} tuyến xe buýt vào bảng 'bus_routes'.`);

            // 3. Clubs
            addLog("users Đang xử lý Clubs...");
            let clubPayload: any[] = [];
            clubs.forEach(group => {
                group.list.forEach(item => {
                    clubPayload.push({
                        name: item.name,
                        type: group.type, // Map 'type' from group to 'type' column
                        link: item.link,
                        email: item.email,
                        manager: item.manager,
                        is_deleted: false
                    });
                });
            });
            const { error: errClub } = await supabase.from('clubs').insert(clubPayload);
            if (errClub) throw new Error(`Lỗi Clubs: ${errClub.message}`);
            addLog(`✅ Đã thêm ${clubPayload.length} CLB vào bảng 'clubs'.`);

            // 4. FAQs
            addLog("❓ Đang xử lý FAQs...");
            let faqPayload: any[] = [];
            faqs.forEach(group => {
                group.items.forEach(item => {
                    faqPayload.push({
                        group_name: group.group, // Map 'group' to 'group_name'
                        question: item.q,
                        answer: item.a,
                        is_deleted: false
                    });
                });
            });
            const { error: errFaq } = await supabase.from('faqs').insert(faqPayload);
            if (errFaq) throw new Error(`Lỗi FAQs: ${errFaq.message}`);
            addLog(`✅ Đã thêm ${faqPayload.length} câu hỏi vào bảng 'faqs'.`);

            addLog("🎉 HOÀN TẤT ĐỒNG BỘ DỮ LIỆU!");

        } catch (err: any) {
            console.error(err);
            addLog(`❌ Lỗi nghiêm trọng: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6 bg-white rounded-xl shadow-lg border border-gray-200">
            <h2 className="text-xl font-bold text-[#003375] flex items-center gap-2 mb-4">
                <Database size={24}/> Công cụ Migrate Dữ liệu
            </h2>
            
            <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg mb-6 text-sm text-yellow-800 flex gap-2">
                <AlertCircle className="shrink-0 mt-0.5" size={16}/>
                <div>
                    <p className="font-bold">Lưu ý quan trọng:</p>
                    <ul className="list-disc pl-4 mt-1 space-y-1">
                        <li>Công cụ này sẽ Insert dữ liệu vào Supabase.</li>
                        <li>Nếu chạy nhiều lần, dữ liệu sẽ bị trùng lặp (Duplicate).</li>
                        <li>Chỉ dành cho Admin/Developer.</li>
                    </ul>
                </div>
            </div>

            <button 
                onClick={handleMigrate}
                disabled={loading}
                className="w-full bg-[#990000] hover:bg-[#7a0000] text-white font-bold py-3 rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
            >
                {loading ? <Loader2 className="animate-spin" size={20}/> : <Play size={20}/>}
                {loading ? 'Đang đồng bộ...' : '⚡ ĐỒNG BỘ DATA LÊN SUPABASE'}
            </button>

            <div className="mt-6 bg-gray-900 text-green-400 font-mono text-xs p-4 rounded-lg h-64 overflow-y-auto shadow-inner border border-gray-700">
                {logs.length === 0 ? (
                    <span className="text-gray-500 italic">Logs sẽ hiện ở đây...</span>
                ) : (
                    logs.map((log, i) => <div key={i} className="mb-1">{log}</div>)
                )}
            </div>
        </div>
    );
};