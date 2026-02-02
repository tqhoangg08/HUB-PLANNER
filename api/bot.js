import Groq from "groq-sdk";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createClient } from '@supabase/supabase-js';

// ============================================================
// 1. CẤU HÌNH KEY
// ============================================================
const CHAT_API_KEY = process.env.GROQ_CHAT_KEY || process.env.GROQ_API_KEY;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

// Redis Rate Limit
const redis = (UPSTASH_URL && UPSTASH_TOKEN)
  ? new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN })
  : null;

const ratelimit = redis
  ? new Ratelimit({ redis: redis, limiter: Ratelimit.slidingWindow(100, "1 d"), analytics: true })
  : null;

// Supabase
const supabase = (SUPABASE_URL && SUPABASE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (!CHAT_API_KEY) {
        console.error("❌ LỖI: Thiếu biến GROQ_CHAT_KEY trên Vercel");
        throw new Error("Server chưa cấu hình Key Chat.");
    }

    // Rate Limit
    if (ratelimit) {
      const ip = req.headers['x-forwarded-for'] || '127.0.0.1';
      const { success } = await ratelimit.limit(ip + "_chat_v3");
      if (!success) return res.status(429).json({ reply: "Bạn chat nhanh quá, nghỉ tay chút nhé! 😴" });
    }

    const { message, history } = req.body;

    // 👇👇👇 DỮ LIỆU CẨM NANG FULL (ĐÃ ĐƯỢC CHÈN CHUẨN XÁC) 👇👇👇
    const KNOWLEDGE_BASE = `
[1. GIỚI THIỆU CHUNG]
- Tên website: HUB Planner (Hỗ trợ sinh viên HUB).
- Đối tượng phục vụ: Sinh viên trường Đại học Ngân hàng TP.HCM (HUB).
- Tác giả: Được phát triển bởi nhóm sinh viên HUB đam mê công nghệ (Project phi lợi nhuận), KHÔNG PHẢI sản phẩm chính thức của nhà trường. Không phải của nhà trường.
- Mục tiêu: Giúp sinh viên quản lý học tập, tính điểm và cập nhật hoạt động dễ dàng hơn portal cũ.

[CẨM NANG SINH VIÊN HUB]

Phần I: Tổng quan về Trường Đại học Ngân hàng TP. Hồ Chí Minh
1. Thông tin chung và Lịch sử hình thành (Mục 1.1)
• Loại hình: Trường đại học công lập.
• Cơ quan chủ quản: Trực thuộc Ngân hàng Nhà nước Việt Nam.
• Lịch sử: Đã có gần 50 năm xây dựng và phát triển.
• Thành tích khen thưởng cấp Nhà nước:
    ◦ Huân chương Độc lập hạng Nhì (2016).
    ◦ Huân chương Độc lập hạng Ba (2006).
    ◦ Huân chương Lao động hạng Nhất (2001).
    ◦ Huân chương Lao động hạng Nhì (1992).
    ◦ Huân chương Lao động hạng Ba (1987).

2. Sứ mạng (Mục 1.2)
• Sứ mạng của HUB: Cung cấp cho xã hội và ngành ngân hàng nguồn nhân lực chất lượng cao, các nghiên cứu có tầm ảnh hưởng, cùng với dịch vụ tư vấn và hoạt động phục vụ cộng đồng. HUB kiến tạo hệ sinh thái giáo dục, mang đến cơ hội học tập suốt đời.

3. Thông tin liên hệ các Cơ sở đào tạo (Mục 1.3)
• Trụ sở chính (Cơ sở Quận 1):
    ◦ Địa chỉ: 36 Tôn Thất Đạm, Phường Nguyễn Thái Bình, Quận 1, TP. HCM.
    ◦ Điện thoại: (028) 38.291.901 – 38.291.224.
    ◦ Fax: (028) 38.212.584.
    ◦ Hotline: 028.387.1636.
    ◦ Trực bảo vệ: (028) 38.212.589.
• Cơ sở Hàm Nghi:
    ◦ Địa chỉ: 39 Hàm Nghi, Phường Nguyễn Thái Bình, Quận 1, TP. HCM.
    ◦ Trực bảo vệ: (028) 38.213.763.
• Cơ sở Thủ Đức:
    ◦ Địa chỉ: 56 Hoàng Diệu 2, Phường Linh Chiểu, TP. Thủ Đức, TP. HCM.
    ◦ Điện thoại: (028) 38.971.629.
    ◦ Fax: (028) 38.971.652.
    ◦ Trực bảo vệ: (028) 38.966.657.

4. Ban Lãnh đạo Nhà trường (Mục 1.4.2)
• Chủ tịch Hội đồng trường: PGS. TS. Đoàn Thanh Hà.
• Hiệu trưởng: PGS. TS. Nguyễn Đức Trung.
• Phó Hiệu trưởng: PGS. TS. Hạ Thị Thiều Dao.
• Phó Hiệu trưởng: TS. Nguyễn Trần Phúc.

5. Danh bạ các Khoa đào tạo (Mục 1.4.3)
• Khoa Ngân hàng:
    ◦ Trưởng khoa: PGS. TS. Lê Đình Hạc.
    ◦ Email: khoanh@hub.edu.vn.
    ◦ Địa điểm: 56 Hoàng Diệu 2. Điện thoại: 028.38.971.624.
• Khoa Tài chính:
    ◦ Trưởng khoa: TS. Nguyễn Anh Vũ.
    ◦ Email: khoatc@hub.edu.vn.
    ◦ Địa điểm: 56 Hoàng Diệu 2. Điện thoại: 028.38.971.631.
• Khoa Quản trị Kinh doanh:
    ◦ Trưởng khoa: TS. Nguyễn Văn Tiến.
    ◦ Email: khoaktqt@hub.edu.vn (Lưu ý: Email trong tài liệu gốc ghi giống khoa KTQT, cần kiểm tra lại thực tế nếu có thể, nhưng theo văn bản là vậy).
    ◦ Địa điểm: 56 Hoàng Diệu 2. Điện thoại: 028.38.971.639.
• Khoa Kế toán – Kiểm toán:
    ◦ Trưởng khoa: TS. Đặng Đình Tân.
    ◦ Email: khoaktkt@hub.edu.vn.
    ◦ Địa điểm: 56 Hoàng Diệu 2. Điện thoại: 028.38.971.641.
• Khoa Hệ thống Thông tin Quản lý:
    ◦ Phó Trưởng khoa: TS. Trịnh Hoàng Nam.
    ◦ Email: khoahtttql@hub.edu.vn.
    ◦ Địa điểm: 56 Hoàng Diệu 2. Điện thoại: 028.38.971.655.
• Khoa Kinh tế Quốc tế:
    ◦ Trưởng khoa: PGS. TS. Hà Văn Dũng.
    ◦ Email: khoaktqt@hub.edu.vn.
    ◦ Địa điểm: 56 Hoàng Diệu 2. Điện thoại: 028.38.971.640.
• Khoa Luật Kinh tế:
    ◦ Phó Trưởng khoa: TS. Nguyễn Ngọc Anh Đào.
    ◦ Email: khoalkt@hub.edu.vn.
    ◦ Địa điểm: 56 Hoàng Diệu 2. Điện thoại: 028.37.200.151.
• Khoa Ngoại ngữ:
    ◦ Phó Trưởng khoa (ĐHK): TS. Lê Thị Thùy Nhung.
    ◦ Email: khoangoaingu@hub.edu.vn.
    ◦ Địa điểm: 56 Hoàng Diệu 2. Điện thoại: 028.38.214.305.
• Khoa Khoa học dữ liệu trong Kinh doanh:
    ◦ Trưởng khoa: PGS. TS. Nguyễn Minh Hải.
    ◦ Email: khoakhdltkd@hub.edu.vn.
    ◦ Địa điểm: 56 Hoàng Diệu 2. Điện thoại: 0916.132.429.
• Khoa Khoa học Xã hội:
    ◦ Trưởng khoa: TS. Cung Thị Tuyết Mai.
    ◦ Email: khoakhxh@hub.edu.vn.
    ◦ Địa điểm: 56 Hoàng Diệu 2. Điện thoại: 028.37.200.149.
• Khoa Sau Đại học:
    ◦ Trưởng khoa: PGS. TS. Phan Diên Vỹ.
    ◦ Email: khoasaudaihoc@hub.edu.vn.
    ◦ Địa điểm: 36 Tôn Thất Đạm. Điện thoại: 028.38.212.590.
• Khoa Giáo dục thể chất và Quốc phòng:
    ◦ Trưởng khoa: ThS. Dương Văn Phương.
    ◦ Email: bomongdtc@hub.edu.vn.
    ◦ Địa điểm: 56 Hoàng Diệu 2. Điện thoại: 0932.088.188.

6. Danh bạ các Phòng/Ban/Trung tâm chức năng (Mục 1.4.3)
• Phòng Đào tạo (P.QLĐT):
    ◦ Trưởng phòng: PGS. TS. Hoàng Thị Thanh Hằng.
    ◦ Email: phongdaotao@hub.edu.vn.
    ◦ Điện thoại: 028.38.212.430 (Q.1) - 028.38.971.638 (Thủ Đức).
• Trung tâm Sinh viên & Quan hệ doanh nghiệp (TT.SV&QHDN):
    ◦ Phó GĐ (ĐH TT): ThS. Hoàng Thị Tuyền.
    ◦ Email: trungtamsvvaqhdn@hub.edu.vn.
    ◦ Điện thoại: 028.38.971.636.
• Phòng Khảo thí và Đảm bảo chất lượng (P.KT&ĐBCL):
    ◦ Trưởng phòng: TS. Ông Văn Năm.
    ◦ Email: phongktdbcl@hub.edu.vn.
    ◦ Điện thoại: 028.39.144.932 (Q.1) - 028.37.200.150 (Thủ Đức).
• Phòng Tài chính – Kế toán:
    ◦ Trưởng phòng: TS. Nguyễn Quỳnh Hoa.
    ◦ Email: phongketoan@hub.edu.vn.
    ◦ Điện thoại: 028.38.212.591 (Q.1) - 028.38.971.646 (Thủ Đức).
• Phòng Quản lý Công nghệ thông tin:
    ◦ Trưởng phòng: ThS. Phạm Thanh An.
    ◦ Email: phongqlcntt@hub.edu.vn.
    ◦ Điện thoại: 028.38.216.100 (Q.1) - 028.37.201.034 (Thủ Đức).
• Trung tâm Thông tin - Thư viện:
    ◦ Giám đốc: ThS. Trần Vĩnh Nguyên.
    ◦ Email: thuvien@hub.edu.vn.
    ◦ Điện thoại: 028.38.971.651.
• Trung tâm Quản lý dịch vụ và lưu trú SV (Ký túc xá):
    ◦ Giám đốc: ThS. Nguyễn Trung Trí.
    ◦ Email: trungtamhtsv@hub.edu.vn.
    ◦ Điện thoại: 028.38.971.633.
• Viện Đào tạo Quốc tế (SaigonISB):
    ◦ Phó Viện trưởng: TS. Lương Thị Thu Thủy.
    ◦ Email: trungtamdthtqt@hub.edu.vn.
    ◦ Địa điểm: 39 Hàm Nghi. Điện thoại: 028.38.216.112.
• Trung tâm Đào tạo và đánh giá năng lực Ngoại ngữ - CNTT (FLIC):
    ◦ Giám đốc: TS. Nguyễn Thị Ngọc Nga.
    ◦ Email: trungtamnnth@hub.edu.vn.
    ◦ Điện thoại: 0909.901.277 - 028.38.214.055.

Phần II: Học tập và Nghiên cứu khoa học 
1. Danh mục Ngành và Chuyên ngành đào tạo (Mục 2.1)
Dữ liệu về số tín chỉ (TC) theo từng ngành/chuyên ngành:
Đại học chính quy chuẩn:
• Tài chính – Ngân hàng (7340201): 123 TC (Các chuyên ngành: Tài chính, Ngân hàng, Tài chính và quản trị doanh nghiệp, Tài chính định lượng và quản trị rủi ro).
• Công nghệ tài chính (7340205): 124 TC.
• Quản trị kinh doanh (7340101): 125 TC.
• Kế toán (7340301): 125 TC.
• Marketing (7340115): 125 TC.
• Logistics và quản lý chuỗi cung ứng (7510605): 125 TC.
• Hệ thống thông tin quản lý (7340405): 125 TC (Chuyên ngành: Hệ thống thông tin kinh doanh và chuyển đổi số).
• Khoa học dữ liệu (7460108): 125 TC.
• Kinh tế quốc tế (7310106): 122 TC (Chuyên ngành: Kinh tế quốc tế, Kinh tế và kinh doanh số).
• Kinh doanh quốc tế (7340120): 122 TC.
• Luật Kinh tế (7380107): 121 TC.
• Ngôn ngữ Anh (7220201): 125 TC (Chuyên ngành: Tiếng Anh thương mại, Song ngữ Anh - Trung).
• Kiểm toán (7340302): 125 TC.
• Luật (7380101): 121 TC.
• Trí tuệ nhân tạo (7480107): 125 TC.
• Thương mại điện tử (7340122): 125 TC.
Đại học chính quy chương trình Tiếng Anh bán phần (TABP):
• Tài chính – Ngân hàng: 124 TC.
• Quản trị kinh doanh: 123 TC.
• Kế toán: 123 TC.
• Kinh tế quốc tế: 122 TC.
• Hệ thống thông tin quản lý: 125 TC.
• Luật kinh tế: 124 TC.
Chương trình đặc biệt:
• Ngôn ngữ Anh: 125 TC.

2. Quy chế Đào tạo (Mục 2.2)
Điều kiện tổ chức lớp học phần:
• Sĩ số tối thiểu:
    ◦ Các học phần thông thường: Ít nhất 40 SV.
    ◦ Học phần thuộc khối kiến thức giáo dục đại cương: Ít nhất 60 SV.
    ◦ Học phần ngoại ngữ (gồm cả Tiếng Anh không chuyên): Từ 30 đến 40 SV.
    ◦ Học phần thuộc chương trình Chất lượng cao: Từ 20 đến 40 SV.
• Hủy lớp: Nếu sĩ số dưới mức tối thiểu, lớp sẽ bị hủy. SV phải đăng ký lại hoặc chuyển sang học phần khác.
Khối lượng học tập đăng ký:
• Tối thiểu: Không ít hơn 6 học phần/học kỳ (trừ trường hợp cuối khóa hoặc không đủ môn mở).
• Tối đa:
    ◦ SV xếp loại học lực Yếu/Kém: Tối đa 7 học phần.
    ◦ SV xếp loại học lực Trung bình trở lên: Tối đa 9 học phần.
Thang điểm đánh giá học phần (Hệ 10 sang Hệ 4):
• 9,5 - 10,0: A+ (4.0) - Đạt.
• 9,0 - 9,4: A (3.7) - Đạt.
• 8,5 - 8,9: A- (3.4) - Đạt.
• 8,0 - 8,4: B+ (3.2) - Đạt.
• 7,5 - 7,9: B (3.0) - Đạt.
• 7,0 - 7,4: B- (2.8) - Đạt.
• 6,5 - 6,9: C+ (2.6) - Đạt.
• 6,0 - 6,4: C (2.4) - Đạt.
• 5,5 - 5,9: C- (2.2) - Đạt.
• 5,0 - 5,4: D+ (2.0) - Đạt.
• 4,5 - 4,9: D (1.8) - Đạt.
• 4,0 - 4,4: D- (1.6) - Đạt.
• Dưới 4,0: F (0) - Không đạt.
Xếp loại học lực (Thang điểm hệ 4):
• Xuất sắc: 3.60 - 4.00.
• Giỏi: 3.20 - cận 3.60.
• Khá: 2.50 - cận 3.20.
• Trung bình: 2.00 - cận 2.50.
• Yếu: 1.00 - cận 2.00.
• Kém: Dưới 1.00.
Các điểm đặc biệt:
• F: Cấm thi (tính là 0 điểm) hoặc Vắng thi không phép.
• I: Vắng thi có phép (chưa tích lũy, được thi ghép kỳ sau).
• M: Miễn học (tích lũy nhưng không tính vào ĐTB).
• RT: Rút học phần (không tính điểm, vẫn phải đóng tiền).
Xử lý học vụ (Cảnh báo và Thôi học):
• Cảnh báo học vụ chính thức (áp dụng khi vi phạm một trong các điều sau):
    ◦ Tổng số tín chỉ không đạt trong kỳ > 50% khối lượng đăng ký.
    ◦ Tổng số tín chỉ nợ đọng từ đầu khóa > 24 tín chỉ.
    ◦ Điểm trung bình học kỳ (ĐTBHK): Học kỳ đầu < 0.8; Các kỳ sau < 1.0.
    ◦ Điểm trung bình tích lũy (ĐTBTL):
        ▪ Năm 1: Dưới 1.2.
        ▪ Năm 2: Dưới 1.4.
        ▪ Năm 3: Dưới 1.6.
        ▪ Năm 4 trở đi: Dưới 1.8.
    ◦ Không đăng ký học phần nào trong học kỳ chính (trừ khi được bảo lưu).
• Buộc thôi học (Đuổi học):
    ◦ Bị cảnh báo học vụ chính thức 2 lần liên tiếp.
    ◦ Vượt quá thời gian tối đa được phép học.
    ◦ Bị kỷ luật lần 2 vì lý do thi hộ/nhờ thi hộ.
Xử lý kỷ luật thi cử:
• Thi hộ/Nhờ thi hộ:
    ◦ Lần 1: Điểm 0 học phần + Đình chỉ học tập 1 năm (áp dụng cho cả 2 người nếu là SV trường).
    ◦ Lần 2: Buộc thôi học.
• Đạo văn: Xử lý theo quy chế liêm chính học thuật.
• Văn bằng giả: Buộc thôi học, thu hồi văn bằng.

3. Học cùng lúc hai chương trình đào tạo (Mục 2.4)
• Điều kiện đăng ký:
    ◦ SV đã được xếp trình độ năm thứ 2 của chương trình thứ nhất.
    ◦ Học lực Khá trở lên: Đáp ứng ngưỡng bảo đảm chất lượng của chương trình 2.
    ◦ Học lực Trung bình: Đáp ứng điều kiện trúng tuyển của chương trình 2.
• Quy định trong quá trình học:
    ◦ Nếu ĐTBHK < 2.00 (hệ 4), phải dừng học chương trình 2 ở học kỳ tiếp theo.
    ◦ Thời gian tối đa: Tính theo thời gian tối đa của chương trình thứ nhất.
    ◦ Xét tốt nghiệp chương trình 2: Phải đủ điều kiện tốt nghiệp chương trình 1 và đăng ký xét tốt nghiệp muộn nhất 02 năm trước thời điểm xét chương trình 2.

4. Tài khoản Sinh viên và Email (Mục 2.5)
• Trang tín chỉ: http://dangkytinchi.hub.edu.vn/Login.
• Trang thông tin đào tạo: online.hub.edu.vn.
• Tài khoản đăng nhập: Mã số sinh viên (MSSV). Mật khẩu mặc định ban đầu là MSSV.
• Email sinh viên: MSSV@st.buh.edu.vn.
• Lưu ý: Tuyệt đối không nhờ người khác đăng ký học hộ.

5. Sử dụng Thư viện (Mục 2.7)
• Thời gian mở cửa (Thứ 2 đến Thứ 7):
    ◦ Khu vực kho sách (Tầng 1, 2): Sáng 7h30 – 11h30; Chiều 13h00 – 17h00.
    ◦ Khu vực tự học (Tầng Trệt, Lửng): Thông tầm 7h30 – 17h00.

6. Nghiên cứu Khoa học Sinh viên (Mục 2.6)
• Hình thức: Đề tài cấp Trường, Thành phố, Bộ, Quốc gia; Viết bài báo/tham luận; Tham gia CLB học thuật/Cuộc thi học thuật (Nghiên cứu đầu tư, Bản lĩnh nhà đầu tư...).
• Quyền lợi:
    ◦ Đề tài đạt giải được thưởng tiền.
    ◦ Tham gia nhóm nghiên cứu có bài báo công bố được cộng điểm khóa luận.
    ◦ Được hỗ trợ kinh phí in ấn nếu dự thi cấp cao hơn.

Phần III: HUB Đồng hành và Hỗ trợ sinh viên
1. Quy tắc ứng xử và Văn hóa học đường (Mục 3.1)
• Nguyên tắc chung:
    ◦ Tuân thủ nghiêm túc quy chế đào tạo, công tác sinh viên; đeo thẻ SV, trang phục đúng quy định.
    ◦ Trung thực trong thi cử (không gian lận); ngôn từ trong sáng, không nói tục chửi bậy; không gây xích mích, mất đoàn kết.
    ◦ Ứng xử trên mạng xã hội/Email: Sử dụng email do Trường cấp để liên hệ công việc. Không đăng tin/bình luận tiêu cực, sai sự thật, kích động thù hằn trên mạng xã hội.
    ◦ Học trực tuyến: Nhập đúng họ tên đầy đủ, mở camera khi học, không bình luận nội dung không liên quan.
• Bảo vệ tài sản công: Giữ gìn vệ sinh chung, bảo vệ cảnh quan môi trường và tài sản của Nhà trường.

2. Chế độ Miễn, Giảm học phí và Trợ cấp xã hội (Mục 3.3)
• Quy trình: Trung tâm SV&QHDN thông báo đầu năm học -> SV nộp hồ sơ -> Hội đồng xét duyệt -> Hiệu trưởng ra quyết định -> Chi trả.
• Các đối tượng ưu tiên chính:
    1. Con người có công với cách mạng (Con liệt sĩ, thương binh, bệnh binh, người nhiễm chất độc hóa học...).
    2. Sinh viên khuyết tật.
    3. Sinh viên mồ côi (cả cha lẫn mẹ; hoặc 1 người mất, 1 người mất tích/không đủ khả năng nuôi dưỡng) đến 22 tuổi.
    4. Sinh viên hệ cử tuyển.
    5. Sinh viên dân tộc thiểu số thuộc hộ nghèo/cận nghèo.
    6. Sinh viên dân tộc thiểu số rất ít người ở vùng khó khăn.

3. Quy định về Học bổng (Mục 3.4)
• Học bổng Khuyến khích học tập (KKHT):
    ◦ Điều kiện chung: Tích lũy tối thiểu 15 tín chỉ/học kỳ; Không bị kỷ luật từ mức khiển trách; Không có môn rớt/thi lại trong kỳ xét.
    ◦ Mức Khá: ĐTB học tập và ĐRL đạt loại Khá trở lên.
    ◦ Mức Giỏi: ĐTB học tập đạt Giỏi + ĐRL đạt Tốt trở lên.
    ◦ Mức Xuất sắc: ĐTB học tập và ĐRL đều đạt Xuất sắc.
• Học bổng Tương hỗ:
    ◦ Dành cho SV có ĐTB học tập từ Khá trở lên (không có môn thi lại, tối thiểu 12 tín chỉ).
    ◦ ĐRL đạt từ Khá trở lên.
    ◦ Đạt chuẩn đầu vào/đầu ra Tiếng Anh và Tin học theo quy định.
• Lưu ý: SV đã nhận học bổng tài trợ (doanh nghiệp/ngân hàng) có giá trị gấp 2 lần học phí trở lên sẽ không được xét học bổng xã hội.

4. Quy định về Thi đua - Khen thưởng (Mục 3.5)
• Danh hiệu cá nhân (3 mức):
    ◦ SV Xuất sắc: Học tập và Rèn luyện đều đạt Xuất sắc.
    ◦ SV Giỏi: Học tập Giỏi + Rèn luyện Tốt.
    ◦ SV Khá: Học tập và Rèn luyện đạt Khá trở lên.
• Khen thưởng khác: Có công trình NCKH đạt giải cấp Trường trở lên; Đóng góp tích cực cho công tác Đảng, Đoàn, Hội, an ninh trật tự (được cộng điểm rèn luyện hoặc thưởng tiền).

5. Vay vốn ưu đãi (Mục 3.6)
• Nơi vay: Ngân hàng Chính sách xã hội (NHCSXH) tại địa phương nơi SV cư trú.
• Trường hợp đặc biệt: SV mồ côi hoặc có hoàn cảnh đặc biệt khó khăn (không người lao động) được vay trực tiếp tại NHCSXH nơi Trường đặt trụ sở.

6. Phụ cấp trách nhiệm Cán bộ Lớp/Đoàn/Hội (Mục 3.7)
• Cấp Lớp/Chi đoàn/Chi hội/CLB:
    ◦ Tập thể BCH/Ban chủ nhiệm: 500.000 VNĐ/năm.
• Cấp Khoa:
    ◦ Bí thư Đoàn khoa/Liên chi hội trưởng: 1.000.000 VNĐ/năm.
    ◦ Tập thể BCH Đoàn khoa/Liên chi hội: 1.000.000 VNĐ/năm.
• Cấp Trường (Cá nhân):
    ◦ Phó Bí thư Đoàn trường/Chủ tịch HSV: 1.500.000 VNĐ/năm.
    ◦ Phó Chủ tịch HSV: 1.200.000 VNĐ/năm.
    ◦ UV BTV Đoàn/Ban thư ký HSV: 1.000.000 VNĐ/năm.

7. Quy định Ký túc xá (Nội trú) - Cập nhật giá mới (Mục 3.8)
• Giá phòng (thu 10 tháng/năm học):
    ◦ Phòng chuẩn (8 SV): 600.000 đ/tháng/SV.
    ◦ Phòng dịch vụ (6 SV): 875.000 đ/tháng/SV.
    ◦ Phòng dịch vụ (5 SV): 1.100.000 đ/tháng/SV.
    ◦ Phòng dịch vụ (4 SV): 1.350.000 đ/tháng/SV.
    ◦ Điện nước tính riêng theo giá Nhà nước.
• Quy định:
    ◦ Đóng phí 2 đợt (Đợt 1: 6 tháng, Đợt 2: 4 tháng). Tháng hè (7, 8) đăng ký riêng.
    ◦ Cấm: Nấu ăn, sử dụng rượu bia/thuốc lá, tự ý câu mắc điện/mạng, dẫn người lạ vào.
    ◦ Vi phạm đến lần thứ 3 sẽ bị buộc rời khỏi KTX.
• Đối tượng ưu tiên: Con liệt sĩ/thương binh -> Dân tộc thiểu số vùng cao -> Vùng sâu vùng xa -> Hộ nghèo.

8. Thủ tục hành chính & Cấp phát giấy tờ (Mục 3.9)
• Nơi cấp:
    ◦ Bảng điểm, Giấy giới thiệu thực tập (CLC): Phòng Quản lý đào tạo.
    ◦ Phúc khảo điểm thi: Phòng Khảo thí & ĐBCL.
    ◦ Giấy xác nhận SV, Vay vốn, Tạm hoãn nghĩa vụ quân sự, Điểm rèn luyện: Trung tâm SV&QHDN.
    ◦ Đóng học phí: Phòng Tài chính - Kế toán.
• Quy trình:
    ◦ Đăng ký online tại: http://estudent.hub.edu.vn/ (Mục Tiện ích).
    ◦ Thời gian xử lý: Sau 01 ngày làm việc.

9. Kênh đóng góp ý kiến (Mục 3.10)
• Hình thức:
    ◦ Trực tiếp tại Phòng tiếp dân.
    ◦ Qua GV cố vấn, Cán bộ lớp.
    ◦ Qua Trung tâm SV&QHDN.
    ◦ Hộp thư ý kiến tại: Tầng trệt (36 Tôn Thất Đạm, 39 Hàm Nghi) và Giảng đường A/KTX (56 Hoàng Diệu 2).

Phần IV: Hoạt động Rèn luyện tại HUB 
1. Quy định về Đánh giá Kết quả Rèn luyện (ĐRL) (Mục 4.1)
Mục đích sử dụng kết quả:
• Xét duyệt học bổng, xét khen thưởng/kỷ luật.
• Xét thôi học, ngừng học.
• Xét lưu trú ký túc xá.
• Xét thi tốt nghiệp, làm khóa luận tốt nghiệp.
• Ghi vào Bảng điểm học tập toàn khóa khi ra trường.
Thang điểm và Xếp loại (Thang 100):
• Xuất sắc: Từ 90 – 100 điểm.
• Tốt: Từ 80 – dưới 90 điểm.
• Khá: Từ 65 – dưới 80 điểm.
• Trung bình: Từ 50 – dưới 65 điểm.
• Yếu: Từ 35 – dưới 50 điểm.
• Kém: Dưới 35 điểm.
Xử lý học vụ dựa trên ĐRL:
• Sinh viên xếp loại rèn luyện Yếu, Kém trong 02 học kỳ liên tiếp: Phải tạm ngừng học ít nhất 01 học kỳ tiếp theo.
• Sinh viên xếp loại rèn luyện Yếu, Kém trong 02 học kỳ liên tiếp (lần thứ 2): Sẽ bị Buộc thôi học.
Quy trình đánh giá (5 Bước):
1. SV tự đánh giá: Đăng nhập tại member.youth.hub.edu.vn -> Nhập minh chứng -> Lưu kết quả.
2. Họp lớp: Tập thể lớp đánh giá (cần quá nửa ý kiến đồng ý) -> GVCN khóa điểm -> Nộp biên bản về Khoa.
3. Hội đồng Khoa: Đánh giá, công nhận hoặc chỉnh sửa điểm -> Gửi biên bản về Trung tâm SV&QHDN.
4. Hội đồng Trường: Họp đánh giá và giải quyết thắc mắc (SV có 20 ngày phản hồi sau khi có thông báo).
5. Ra quyết định: Hiệu trưởng ra quyết định công nhận.

2. Sinh hoạt Đoàn Thanh niên - Hội Sinh viên (Mục 4.2)
Thủ tục chuyển sinh hoạt Đoàn:
• Chuyển đến: Liên hệ BCH Đoàn cơ sở -> Nộp hồ sơ về Văn phòng Đoàn trường. Nếu mất sổ Đoàn phải xin xác nhận của đơn vị cũ.
• Chuyển đi: Liên hệ BCH Chi đoàn. Thời gian chuyển thường vào tháng 6 hàng năm cho sinh viên năm cuối.
Gia nhập Hội Sinh viên:
• Đăng ký tự nguyện.
• Nộp đơn + 02 tấm hình về Chi hội để làm thẻ hội viên.

3. Danh sách Câu lạc bộ (CLB), Đội, Nhóm
Nhóm 1: Trực thuộc Hội Sinh viên Trường (18 CLB):
• Văn hóa - Thể thao - Nghệ thuật:
    ◦ Ban Thông tin Truyền thông (B4T).
    ◦ CLB Bóng chuyền.
    ◦ CLB Bóng đá (BUFC).
    ◦ CLB Bóng rổ.
    ◦ CLB Cầu lông (BBC).
    ◦ CLB Văn nghệ xung kích (Grand).
    ◦ CLB Nghệ thuật (3F).
    ◦ CLB Guitar.
    ◦ CLB Nữ sinh (GCBU).
    ◦ CLB Phát thanh (VOBU).
    ◦ CLB Vovinam.
• Kỹ năng - Học thuật - Tình nguyện:
    ◦ CLB Mầm sống (Kỹ năng).
    ◦ CLB Kỹ năng.
    ◦ CLB SV Nghiên cứu Khoa học (Học thuật).
    ◦ CLB FIC - Entrepreneurship (Kỹ năng).
    ◦ CLB Tủ sách tình bạn (Tình nguyện).
    ◦ CLB Youth For Chance (YFC) (Kỹ năng).
Nhóm 2: Trực thuộc Đoàn Khoa (13 CLB):
• Khoa Ngân hàng: CLB Hỗ trợ sinh viên (SSC), CLB Kết nối nghề nghiệp (Career link).
• Khoa Quản trị Kinh doanh: CLB Truyền thông (MMC), Đội công tác xã hội, CLB Hội nhập Quốc tế (IIC).
• Khoa Kinh tế Quốc tế: CLB Anh ngữ quốc tế (IEC), CLB Cờ vua (ICC), CLB Kinh doanh và Kinh tế quốc tế (IBEC).
• Khoa Kế toán - Kiểm toán: CLB Nghiên cứu ứng dụng (SARA), CLB Kế toán Kiểm toán viên tương lai (FAAC).
• Khoa Luật Kinh tế: CLB Pháp lý.
• Khoa HTTT Quản lý: CLB học thuật GIEO.
• Đoàn hệ Chất lượng cao: CLB Thể thao trí tuệ.

Phần V: Thông tin tham khảo
1. Hướng dẫn Bảo hiểm Y tế (BHYT) và Chăm sóc sức khỏe (Mục 5.1)
• Quyền lợi: Chăm sóc sức khỏe ban đầu, khám chữa bệnh ngoại trú/nội trú, phẫu thuật. Sinh viên cài đặt ứng dụng VssID-BHXH số để thay thế thẻ giấy khi đi khám.
• Thời hạn sử dụng thẻ (Đối với Tân SV): 15 tháng (từ 01/10 năm nhập học đến 31/12 năm sau).
• Thời gian đóng phí BHYT:
    ◦ Sinh viên năm nhất: Trước ngày 10/9 hàng năm.
    ◦ Sinh viên các năm còn lại: Trước ngày 30/11 hàng năm.
• Thông tin liên hệ hỗ trợ:
    ◦ Đơn vị: Tổ Y tế.
    ◦ Email: toyte.tccb@hub.edu.vn.
    ◦ Hotline: 0912.048.079 (Cô Hoa).

2. Các tuyến Xe buýt đến trường (Mục 5.2)
• Tuyến số 53 (Lê Hồng Phong – Đại học Quốc gia):
    ◦ Thời gian hoạt động: 5h00 – 19h30.
    ◦ Tần suất: 7 – 15 phút/chuyến.
• Tuyến số 104 (Bến xe An Sương – Đại học Nông Lâm):
    ◦ Thời gian hoạt động: 4h40 – 19h45.
    ◦ Tần suất: 4 – 12 phút/chuyến.
• Tuyến số 168 (Đại học Ngân hàng TP. HCM – Ga Metro Thủ Đức):
    ◦ Thời gian hoạt động: 5h00 – 22h00.
    ◦ Tần suất: 10 – 12 phút/chuyến.

3. Trung tâm Đào tạo và Đánh giá năng lực Ngoại ngữ - Tin học (FLIC) (Mục 5.3)
Chức năng:
• Đào tạo và tổ chức thi các chứng chỉ quốc tế: TOEIC, TOEFL, IELTS, IC3, MOS, ICDL.
• Đào tạo ngoại ngữ khác: Tiếng Trung, Tiếng Nhật, Tiếng Hàn.
Quy định Chuẩn Tiếng Anh (theo khung năng lực ngoại ngữ 6 bậc dùng cho VN):
• ĐH Chính quy chuẩn: Đạt bậc 3/6 (Đủ điều kiện xét tốt nghiệp).
• ĐH Chính quy Tiếng Anh bán phần (CLC): Đạt bậc 4/6 (Đủ điều kiện đăng ký thực tập cuối khóa).
• ĐH Chính quy Quốc tế song bằng: Đạt bậc 4/6 (Đủ điều kiện học giai đoạn 2).
• Thạc sĩ: Đầu vào bậc 3/6; Đầu ra bậc 4/6.
Lộ trình Tin học:
• SV làm bài Test đầu khóa -> Nếu Đạt: Được cấp chứng chỉ CNTT cơ bản (chuẩn đầu vào).
• Nếu Chưa đạt: Tự học hoặc đăng ký học tại FLIC -> Thi lại lấy chứng chỉ hoặc nộp chứng chỉ quốc tế tương đương lên hệ thống estudent.hub.edu.vn.
Lộ trình Tiếng Anh (Đại học chính quy chuẩn):
• Test đầu khóa -> Nếu Đạt (tương đương A2/Bậc 2): Được cấp giấy chứng nhận chuẩn đầu vào.
• Giai đoạn tiếp theo: Tự học hoặc học tại FLIC để thi lấy chứng chỉ Bậc 3/6 (chuẩn đầu ra) hoặc nộp chứng chỉ quốc tế tương đương.
Lộ trình Tiếng Anh (Chương trình Tiếng Anh bán phần/CLC):
• Test đầu khóa -> Nếu Đạt (tương đương Bậc 3/6): Được cấp giấy chứng nhận chuẩn đầu vào.
• Giai đoạn tiếp theo: Tự học hoặc học tại FLIC (định hướng Bậc 4/6 hoặc IELTS 5.5) -> Thi lấy chứng chỉ Bậc 4/6 hoặc IELTS 5.5 (chuẩn đầu ra).
Liên hệ FLIC:
• Cơ sở 1: 39 Hàm Nghi, Q.1.
• Cơ sở 2: 56 Hoàng Diệu 2, TP. Thủ Đức.
• Hotline: 0909.901.277 - 0906.901.277.
• Website: www.flic.edu.vn.

4. Trung tâm Đào tạo từ xa và Tư vấn chuyển giao công nghệ (Mục 5.4)
• Chức năng: Đào tạo thực hành, tư vấn nghiệp vụ kinh tế - tài chính - ngân hàng và kỹ năng mềm cho sinh viên và nhân viên ngân hàng/doanh nghiệp.
• Liên hệ:
    ◦ Địa chỉ: 39 Hàm Nghi, P. Sài Gòn, TP. HCM.
    ◦ Hotline: 0946 947 718.
    ◦ Email: fbc@hub.edu.vn.
    ◦ Website: fbc.hub.edu.vn.
`;

    // System Prompt (Học theo kiến thức trên)
    const SYSTEM_PROMPT = `
I. NHÂN DẠNG:
Bạn là "Trợ lý ảo HUB Planner". Bạn là một người bạn đồng hành thông thái của sinh viên Đại học Ngân hàng TP.HCM (HUB).
- Giọng điệu: Thân thiện, nhiệt tình, dùng emoji 🎓✨, xưng hô "mình - bạn".
- Nhiệm vụ: Trả lời chính xác các câu hỏi dựa trên [DỮ LIỆU NỀN] được cung cấp.

II. NGUYÊN TẮC TRẢ LỜI (BẮT BUỘC):
1. Bám sát dữ liệu: Chỉ trả lời dựa trên thông tin trong KNOWLEDGE_BASE. Nếu không có trong đó, hãy nói "Thông tin này mình chưa tìm thấy trong Cẩm nang sinh viên, bạn thử liên hệ phòng đào tạo nhé! 😅".
2. Tra cứu chính xác: Khi user hỏi về số điện thoại, email, địa chỉ, học phí, quy chế... hãy trích xuất chính xác con số từ dữ liệu.
3. Không ảo tưởng: Không được bịa ra thông tin.
4. Từ chối khéo: Nếu user hỏi chuyện không liên quan đến HUB hoặc học tập, hãy từ chối lịch sự.

III. DỮ LIỆU NỀN (KNOWLEDGE_BASE):
${KNOWLEDGE_BASE}
`;

    const conversation = [
        { role: "system", content: SYSTEM_PROMPT },
        ...(history || []).map(msg => ({ role: msg.role, content: msg.content })),
        { role: "user", content: message }
    ];

    const groq = new Groq({ apiKey: CHAT_API_KEY });
    const completion = await groq.chat.completions.create({
        messages: conversation,
        model: "llama-3.1-8b-instant",
        temperature: 0.3, // Giảm nhiệt độ để AI trả lời chính xác, ít "chém gió"
        max_tokens: 1500,
    });

    const aiResponse = completion.choices[0]?.message?.content || "Xin lỗi, mình đang bị quá tải. Bạn thử lại sau nhé!";

    // --- LƯU LỊCH SỬ CHAT VÀO SUPABASE (Giữ nguyên) ---
    if (req.body.userId) {
        await supabase.from('ai_chat_logs').insert([
            {
                user_id: req.body.userId,
                user_message: message,
                ai_response: aiResponse,
                timestamp: new Date().toISOString()
            }
        ]);
    }

    res.status(200).json({ reply: aiResponse });

  } catch (error) {
    console.error("Error calling Groq API:", error);
    res.status(500).json({ error: "Lỗi server rồi, bạn thử lại sau nhé!" });
  }
}