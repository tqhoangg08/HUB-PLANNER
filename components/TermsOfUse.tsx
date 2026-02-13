import React from 'react';

// 👇 Quan trọng: Phải có chữ "export const" thì bên App.tsx mới dùng được
export const TermsOfUse: React.FC = () => {
  return (
    <div className="min-h-screen bg-white text-gray-900 px-6 sm:px-10 py-12 flex justify-center">
      <div className="w-full max-w-4xl space-y-10 text-base leading-relaxed">
        
        {/* HEADER */}
        <header className="space-y-3 text-center border-b border-gray-200 pb-6">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-wide uppercase text-[#003375]">
            ĐIỀU KHOẢN SỬ DỤNG DỊCH VỤ
          </h1>
          <p className="text-sm text-gray-600">Phiên bản 1.0 - Ngày hiệu lực: 17/01/2026</p>
        </header>

        {/* MỤC LỤC */}
        <nav className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-600 mb-3">
            Mục lục
          </h2>
          <ul className="grid gap-2 text-sm sm:grid-cols-2 text-blue-600 font-medium">
            <li><a href="#dieu-1" className="hover:underline">Điều 1. Chấp thuận điều khoản</a></li>
            <li><a href="#dieu-2" className="hover:underline">Điều 2. Mô tả dịch vụ & Giới hạn</a></li>
            <li><a href="#dieu-3" className="hover:underline">Điều 3. Tuyên bố miễn trừ trách nhiệm</a></li>
            <li><a href="#dieu-4" className="hover:underline">Điều 4. Tài khoản & Bảo mật</a></li>
            <li><a href="#dieu-5" className="hover:underline">Điều 5. Quy tắc ứng xử & Hành vi cấm</a></li>
            <li><a href="#dieu-6" className="hover:underline">Điều 6. Quyền sở hữu trí tuệ</a></li>
            <li><a href="#dieu-7" className="hover:underline">Điều 7. Chính sách Ủng hộ (Donate)</a></li>
            <li><a href="#dieu-8" className="hover:underline">Điều 8. Giới hạn trách nhiệm pháp lý</a></li>
            <li><a href="#dieu-9" className="hover:underline">Điều 9. Thay đổi điều khoản</a></li>
            <li><a href="#dieu-10" className="hover:underline">Điều 10. Liên hệ</a></li>
          </ul>
        </nav>

        {/* NỘI DUNG CHI TIẾT */}
        
        <section id="dieu-1" className="space-y-3">
          <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 1. CHẤP THUẬN ĐIỀU KHOẢN</h2>
          <p>
            Chào mừng bạn đến với <strong>HUB Planner</strong> ("Dịch vụ", "Ứng dụng", "Chúng tôi"). 
            Bằng việc truy cập, đăng ký tài khoản hoặc sử dụng bất kỳ tính năng nào của ứng dụng (trên nền tảng Web hoặc Mobile), 
            bạn xác nhận rằng bạn đã đọc, hiểu rõ và đồng ý tuân thủ vô điều kiện toàn bộ các quy định trong bản Điều khoản này.
          </p>
          <p>
            Nếu bạn không đồng ý với bất kỳ phần nào của các điều khoản này, vui lòng <strong>ngưng sử dụng dịch vụ ngay lập tức</strong>.
          </p>
        </section>

        <section id="dieu-2" className="space-y-3">
          <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 2. MÔ TẢ DỊCH VỤ VÀ GIỚI HẠN</h2>
          <p>
            HUB Planner là một dự án phần mềm tiện ích hỗ trợ sinh viên, cung cấp các công cụ:
          </p>
          <ul className="list-disc pl-6 space-y-1 text-gray-700">
            <li>Tính toán điểm trung bình tích lũy (GPA) hệ 4 và hệ 10.</li>
            <li>Theo dõi tiến độ học tập và gợi ý mục tiêu điểm số.</li>
            <li>Cung cấp thông tin tra cứu (Xe buýt, Số điện thoại các phòng ban, Sơ đồ trường).</li>
            <li>Nền tảng đăng tin tìm đồ thất lạc (Lost & Found).</li>
            <li>Cập nhật tin tức sự kiện và điểm rèn luyện.</li>
          </ul>
          <p>
            Chúng tôi có quyền thay đổi, tạm ngưng hoặc chấm dứt cung cấp một phần hoặc toàn bộ dịch vụ bất cứ lúc nào mà không cần báo trước để bảo trì, nâng cấp hoặc vì lý do vận hành.
          </p>
        </section>

        <section id="dieu-3" className="space-y-4">
          <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 3. TUYÊN BỐ MIỄN TRỪ TRÁCH NHIỆM (QUAN TRỌNG)</h2>
          <div className="bg-red-50 border-l-4 border-red-500 p-4 text-gray-800">
            <h3 className="font-bold text-red-700 mb-2">3.1. Tính không chính danh</h3>
            <p className="mb-2">
              HUB Planner là dự án độc lập được phát triển bởi nhóm sinh viên, hoạt động phi lợi nhuận. 
              Chúng tôi khẳng định ứng dụng này <strong>KHÔNG PHẢI</strong> là sản phẩm chính thức, không trực thuộc và không đại diện cho 
              <strong> Trường Đại học Ngân hàng TP.HCM (HUB)</strong> dưới bất kỳ hình thức nào.
            </p>
            
            <h3 className="font-bold text-red-700 mb-2">3.2. Độ chính xác của dữ liệu</h3>
            <p>
              Các tính năng tính toán (GPA, ĐRL) chỉ mang tính chất <strong>tham khảo</strong>. 
              Mặc dù chúng tôi nỗ lực tối đa để thuật toán bám sát quy chế tín chỉ mới nhất, nhưng sai số có thể xảy ra do các trường hợp đặc biệt (học lại, cải thiện, chuyển điểm...).
              Sinh viên có trách nhiệm và nghĩa vụ đối chiếu lại kết quả với <strong>Cổng thông tin đào tạo chính thức (Portal)</strong> của Nhà trường trước khi đưa ra các quyết định quan trọng.
            </p>
          </div>
        </section>

        <section id="dieu-4" className="space-y-3">
          <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 4. TÀI KHOẢN VÀ BẢO MẬT</h2>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>
              <strong>Đăng ký:</strong> Bạn đồng ý cung cấp thông tin trung thực, chính xác khi đăng nhập qua Google. Chúng tôi khuyến khích sử dụng email sinh viên (@st.buh.edu.vn) để được hỗ trợ tốt nhất.
            </li>
            <li>
              <strong>Bảo mật:</strong> Bạn chịu trách nhiệm bảo mật thông tin đăng nhập của mình. Bạn không được chia sẻ tài khoản cho người khác sử dụng.
            </li>
            <li>
              <strong>Thiết bị công cộng:</strong> Khi sử dụng HUB Planner trên thiết bị công cộng (Thư viện, Quán nét), bạn có trách nhiệm <strong>Đăng xuất</strong> và sử dụng tính năng <strong>"Xóa dữ liệu (Reset)"</strong> trước khi rời đi để tránh lộ bảng điểm cá nhân.
            </li>
            <li>
              <strong>Xử lý vi phạm:</strong> Chúng tôi có quyền khóa vĩnh viễn hoặc tạm ngưng tài khoản nếu phát hiện dấu hiệu hack, cheat, spam dữ liệu hoặc mạo danh người khác.
            </li>
          </ul>
        </section>

        <section id="dieu-5" className="space-y-3">
          <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 5. QUY TẮC ỨNG XỬ & HÀNH VI CẤM</h2>
          <p>Khi sử dụng dịch vụ, bạn cam kết <strong>KHÔNG</strong> thực hiện các hành vi sau:</p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Sử dụng ứng dụng vào mục đích vi phạm pháp luật, lừa đảo hoặc phát tán mã độc.</li>
            <li>
              Thu thập trái phép dữ liệu (Crawling/Scraping) từ hệ thống của chúng tôi hoặc từ website nhà trường thông qua ứng dụng này.
            </li>
            <li>
              Đăng tải nội dung sai sự thật, xúc phạm, thù địch, khiêu dâm hoặc vi phạm thuần phong mỹ tục lên các mục cộng đồng (như Lost & Found, Góp ý).
            </li>
            <li>
              Cố tình tấn công từ chối dịch vụ (DDoS) hoặc gây quá tải cho hệ thống máy chủ.
            </li>
          </ul>
        </section>

        <section id="dieu-6" className="space-y-3">
            <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 6. QUYỀN SỞ HỮU TRÍ TUỆ</h2>
            <p>
                <strong>6.1. Tài sản của HUB Planner:</strong> Toàn bộ giao diện, thiết kế, mã nguồn (source code), logo, dữ liệu biên tập (trừ dữ liệu người dùng) và các tài sản trí tuệ khác trên ứng dụng đều thuộc quyền sở hữu duy nhất của đội ngũ phát triển HUB Planner.
                Bạn <strong>không được phép</strong> sao chép, chỉnh sửa, tái phân phối, đảo ngược mã nguồn (reverse engineer) hoặc sử dụng bất kỳ phần nào của ứng dụng cho mục đích thương mại khi chưa có sự đồng ý bằng văn bản.
            </p>
            <p>
                <strong>6.2. Nội dung người dùng (User Content):</strong> Khi bạn đăng tải nội dung lên hệ thống (ví dụ: đăng tin tìm đồ thất lạc, gửi góp ý, bình luận), bạn vẫn giữ quyền sở hữu đối với nội dung đó. Tuy nhiên, bằng việc đăng tải, bạn đồng ý cấp cho chúng tôi quyền sử dụng miễn phí, không độc quyền để hiển thị, lưu trữ và chia sẻ nội dung đó trên nền tảng của HUB Planner nhằm phục vụ cộng đồng.
            </p>
        </section>

        <section id="dieu-7" className="space-y-3">
            <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 7. CHÍNH SÁCH VỀ TÍNH NĂNG "ỦNG HỘ & TRI ÂN" (DONATE)</h2>
            <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li>
                    <strong>Nguyên tắc tự nguyện:</strong> Tính năng "Ủng hộ" (Donate) được xây dựng nhằm mục đích gây quỹ duy trì máy chủ (Server), tên miền và phát triển các tính năng mới cho ứng dụng. Mọi khoản đóng góp đều xuất phát từ sự <strong>tự nguyện</strong> của người dùng, không mang tính chất bắt buộc hay trao đổi mua bán hàng hóa/dịch vụ.
                </li>
                <li>
                    <strong>Chính sách không hoàn lại:</strong> Xin lưu ý rằng, mọi khoản ủng hộ gửi đến HUB Planner được xem là quà tặng. Chúng tôi <strong>KHÔNG</strong> áp dụng chính sách hoàn tiền (refund) trong bất kỳ trường hợp nào sau khi giao dịch đã thành công.
                </li>
                <li>
                    <strong>Vinh danh:</strong> Để tri ân tấm lòng của bạn, chúng tôi sẽ hiển thị tên và lời nhắn của bạn tại mục "Bảng vàng Tri ân" (trừ khi bạn yêu cầu ẩn danh hoặc để trống thông tin). Chúng tôi cam kết sử dụng số tiền ủng hộ đúng mục đích để duy trì và phát triển dự án phục vụ sinh viên.
                </li>
            </ul>
        </section>

        <section id="dieu-8" className="space-y-3">
            <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 8. GIỚI HẠN TRÁCH NHIỆM PHÁP LÝ</h2>
            <p>Trong phạm vi tối đa mà pháp luật cho phép, đội ngũ phát triển HUB Planner và các bên liên quan sẽ <strong>KHÔNG</strong> chịu trách nhiệm đối với:</p>
            <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li>Bất kỳ thiệt hại trực tiếp, gián tiếp, ngẫu nhiên hoặc mang tính hậu quả nào (bao gồm nhưng không giới hạn: mất dữ liệu, gián đoạn việc học tập, bỏ lỡ thời hạn đăng ký tín chỉ...).</li>
                <li>Các sai sót trong tính toán điểm số (GPA/ĐRL) dẫn đến việc hiểu sai lệch về kết quả học tập thực tế.</li>
                <li>Bất kỳ nội dung hoặc hành vi nào của bên thứ ba (bao gồm người dùng khác) trên dịch vụ.</li>
                <li>Việc truy cập trái phép vào máy chủ hoặc dữ liệu của bạn do lỗi bảo mật từ phía thiết bị người dùng.</li>
            </ul>
        </section>

        <section id="dieu-9" className="space-y-3">
            <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 9. THAY ĐỔI ĐIỀU KHOẢN</h2>
            <p>
                Chúng tôi có quyền sửa đổi, bổ sung hoặc thay thế bất kỳ điều khoản nào trong bản thỏa thuận này vào bất cứ lúc nào. Các thay đổi sẽ có hiệu lực ngay lập tức khi được cập nhật trên website/ứng dụng.
            </p>
            <p>
                Trách nhiệm của bạn là thường xuyên kiểm tra lại trang này. Việc bạn tiếp tục sử dụng dịch vụ sau khi có các thay đổi đồng nghĩa với việc bạn chấp nhận và đồng ý tuân thủ các điều khoản mới.
            </p>
        </section>

        <section id="dieu-10" className="space-y-4">
          <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 10. LIÊN HỆ</h2>
          <p>
            Nếu bạn có bất kỳ câu hỏi, thắc mắc về Điều khoản sử dụng hoặc cần hỗ trợ giải quyết tranh chấp, vui lòng liên hệ với đại diện nhóm phát triển:
          </p>
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
             <ul className="space-y-2 text-gray-800">
                <li><strong>Họ tên:</strong> Trần Quốc Hoàng (Đại diện nhóm phát triển)</li>
                <li><strong>Số điện thoại / Zalo:</strong> <a href="tel:0389342812" className="text-blue-600 hover:underline">0389342812</a></li>
                <li><strong>Email:</strong> <a href="mailto:contact@hotrosinhvienhub.id.vn" className="text-blue-600 hover:underline">contact@hotrosinhvienhub.id.vn</a></li>
                <li><strong>Đơn vị:</strong> Sinh viên Khoa Kinh tế Quốc tế - Trường Đại học Ngân hàng TP.HCM (HUB).</li>
             </ul>
          </div>
        </section>
      </div>
    </div>
  );
};