import React from 'react';

export const TermsOfUse: React.FC = () => {
  return (
    <div className="min-h-screen bg-white text-gray-900 px-6 sm:px-10 py-12 flex justify-center">
      <div className="w-full max-w-4xl space-y-10 text-base leading-relaxed text-justify">
        
        {/* HEADER */}
        <header className="space-y-3 text-center border-b border-gray-200 pb-6">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-wide uppercase text-[#003375]">
            ĐIỀU KHOẢN SỬ DỤNG DỊCH VỤ
          </h1>
          <p className="text-sm text-gray-600 italic">Phiên bản 1.1 - Ngày cập nhật: 25/02/2026</p>
        </header>

        {/* MỤC LỤC */}
        <nav className="bg-gray-50 border border-gray-200 rounded-lg p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-600 mb-4 border-b pb-2">
            Mục lục nội dung
          </h2>
          <ul className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 text-blue-600 font-medium">
            <li><a href="#dieu-1" className="hover:underline">Điều 1. Chấp thuận điều khoản</a></li>
            <li><a href="#dieu-2" className="hover:underline">Điều 2. Mô tả dịch vụ & Giới hạn</a></li>
            <li><a href="#dieu-3" className="hover:underline">Điều 3. Tuyên miễn trừ trách nhiệm</a></li>
            <li><a href="#dieu-4" className="hover:underline">Điều 4. Tài khoản & Bảo mật</a></li>
            <li><a href="#dieu-5" className="hover:underline">Điều 5. Quy tắc ứng xử & Hành vi cấm</a></li>
            <li><a href="#dieu-6" className="hover:underline">Điều 6. Quyền sở hữu trí tuệ</a></li>
            <li><a href="#dieu-7" className="hover:underline">Điều 7. Chính sách Ủng hộ (Donate)</a></li>
            <li><a href="#dieu-8" className="hover:underline">Điều 8. Giới hạn trách nhiệm pháp lý</a></li>
            <li><a href="#dieu-9" className="hover:underline">Điều 9. Tính năng báo cáo sai sót</a></li>
            <li><a href="#dieu-10" className="hover:underline">Điều 10. Thay đổi điều khoản</a></li>
            <li><a href="#dieu-11" className="hover:underline">Điều 11. Thông tin liên hệ</a></li>
          </ul>
        </nav>

        {/* CHI TIẾT ĐIỀU KHOẢN */}
        
        <section id="dieu-1" className="space-y-3 scroll-mt-20">
          <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 1. CHẤP THUẬN ĐIỀU KHOẢN</h2>
          <p>
            Chào mừng bạn đến với <strong>HUB Planner</strong> ("Dịch vụ", "Ứng dụng", "Chúng tôi"). Bằng việc truy cập, đăng ký tài khoản hoặc sử dụng bất kỳ tính năng nào của ứng dụng (trên nền tảng Web hoặc Mobile), bạn xác nhận rằng bạn đã đọc, hiểu rõ và đồng ý tuân thủ vô điều kiện toàn bộ các quy định trong bản Điều khoản này.
          </p>
          <p>
            Nếu bạn không đồng ý với bất kỳ phần nào của các điều khoản này, vui lòng <strong>ngưng sử dụng dịch vụ ngay lập tức</strong>. Việc bạn tiếp tục sử dụng ứng dụng sau khi các thay đổi về Điều khoản được đăng tải sẽ được coi là sự chấp nhận đối với các thay đổi đó.
          </p>
        </section>

        <section id="dieu-2" className="space-y-3 scroll-mt-20">
          <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 2. MÔ TẢ DỊCH VỤ VÀ GIỚI HẠN</h2>
          <p>
            HUB Planner là một dự án phần mềm tiện ích hỗ trợ sinh viên, cung cấp các công cụ:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Tính toán điểm trung bình tích lũy (GPA) hệ 4 và hệ 10 dựa trên dữ liệu người dùng nhập hoặc đồng bộ.</li>
            <li>Theo dõi tiến độ học tập, lập biểu đồ phát triển và gợi ý mục tiêu điểm số cho các học kỳ kế tiếp.</li>
            <li><strong>Lập kế hoạch học tập cá nhân: Cung cấp giao diện tra cứu Thời khóa biểu, Lịch thi dự kiến và thông tin Giảng viên phụ trách học phần.</strong></li>
            <li>Cung cấp thông tin tra cứu tiện ích (Lộ trình xe buýt, Số điện thoại các phòng ban nội bộ, Sơ đồ khuôn viên trường).</li>
            <li>Nền tảng cộng đồng hỗ trợ đăng tin và tìm kiếm đồ thất lạc (Lost & Found).</li>
            <li>Cập nhật các tin tức sự kiện từ phía nhà trường và theo dõi điểm rèn luyện cá nhân.</li>
          </ul>
          <p>
            Chúng tôi có quyền thay đổi, tạm ngưng hoặc chấm dứt cung cấp một phần hoặc toàn bộ dịch vụ bất cứ lúc nào mà không cần báo trước để bảo trì, nâng cấp hệ thống hoặc vì bất kỳ lý do vận hành nào khác.
          </p>
        </section>

        <section id="dieu-3" className="space-y-4 scroll-mt-20">
          <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 3. TUYÊN BỐ MIỄN TRỪ TRÁCH NHIỆM (QUAN TRỌNG)</h2>
          <div className="bg-red-50 border-l-4 border-red-500 p-5 space-y-4">
            <div>
              <h3 className="font-bold text-red-700 mb-1">3.1. Tính không chính danh</h3>
              <p className="text-gray-800">
                HUB Planner là dự án độc lập được phát triển bởi nhóm sinh viên, hoạt động phi lợi nhuận. Chúng tôi khẳng định ứng dụng này <strong>KHÔNG PHẢI</strong> là sản phẩm chính thức, không trực thuộc và không đại diện cho <strong>Trường Đại học Ngân hàng TP.HCM (HUB)</strong> dưới bất kỳ hình thức nào.
              </p>
            </div>
            
            <div>
              <h3 className="font-bold text-red-700 mb-1">3.2. Độ chính xác của dữ liệu</h3>
              <p className="text-gray-800 mb-2">
                Dữ liệu về <strong>Thời khóa biểu, Lịch thi và Giảng viên</strong> được đồng bộ tham khảo từ Cổng thông tin đào tạo (online.hub.edu.vn). Do các yếu tố khách quan về cập nhật hệ thống hoặc xử lý kỹ thuật, thông tin hiển thị trên HUB Planner có thể có độ trễ hoặc sai lệch so với thực tế.
              </p>
              <p className="text-gray-800">
                Các tính năng tính toán (GPA, ĐRL) chỉ mang tính chất <strong>tham khảo</strong>. Mặc dù chúng tôi nỗ lực tối đa để thuật toán bám sát quy chế tín chỉ mới nhất, nhưng sai số vẫn có thể xảy ra trong các trường hợp đặc biệt. Sinh viên có trách nhiệm và nghĩa vụ đối chiếu lại kết quả với <strong>Cổng thông tin đào tạo chính thức (Portal)</strong> của Nhà trường trước khi đưa ra các quyết định quan trọng liên quan đến học tập.
              </p>
            </div>
          </div>
        </section>

        <section id="dieu-4" className="space-y-3 scroll-mt-20">
          <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 4. TÀI KHOẢN VÀ BẢO MẬT</h2>
          <ul className="list-disc pl-6 space-y-3 text-gray-700">
            <li>
              <strong>Đăng ký:</strong> Bạn đồng ý cung cấp thông tin trung thực, chính xác khi đăng nhập qua Google. Chúng tôi khuyến khích sử dụng email sinh viên (@st.buh.edu.vn) để nhận được sự hỗ trợ tốt nhất từ hệ thống.
            </li>
            <li>
              <strong>Bảo mật:</strong> Bạn hoàn toàn chịu trách nhiệm về việc bảo mật thông tin đăng nhập cá nhân của mình. Bạn không được chia sẻ tài khoản cho người khác sử dụng dưới mọi hình thức.
            </li>
            <li>
              <strong>Thiết bị công cộng:</strong> Khi sử dụng HUB Planner trên các thiết bị công cộng (Thư viện, Quán nét...), bạn có trách nhiệm <strong>Đăng xuất</strong> và sử dụng tính năng <strong>"Xóa dữ liệu (Reset)"</strong> trước khi rời đi để tránh việc lộ bảng điểm và thông tin cá nhân.
            </li>
            <li>
              <strong>Xử lý vi phạm:</strong> Chúng tôi có quyền khóa vĩnh viễn hoặc tạm ngưng tài khoản của bạn mà không cần báo trước nếu phát hiện bất kỳ dấu hiệu hack, cheat, spam dữ liệu hoặc hành vi mạo danh người khác.
            </li>
          </ul>
        </section>

        <section id="dieu-5" className="space-y-3 scroll-mt-20">
          <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 5. QUY TẮC ỨNG XỬ & HÀNH VI CẤM</h2>
          <p>Khi sử dụng dịch vụ, bạn cam kết <strong>KHÔNG</strong> thực hiện các hành vi sau:</p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Sử dụng ứng dụng vào các mục đích vi phạm pháp luật, lừa đảo hoặc phát tán mã độc gây hại.</li>
            <li>
              Thu thập trái phép dữ liệu (Crawling/Scraping) từ hệ thống của HUB Planner hoặc cố tình can thiệp vào website nhà trường thông qua các công cụ của ứng dụng này.
            </li>
            <li>
              Đăng tải nội dung sai sự thật, xúc phạm, thù địch, khiêu dâm hoặc vi phạm thuần phong mỹ tục lên các mục cộng đồng công cộng (Lost & Found, Góp ý).
            </li>
            <li>
              Cố tình thực hiện các hành vi tấn công từ chối dịch vụ (DDoS) hoặc bất kỳ hình thức nào gây quá tải và gián đoạn hệ thống máy chủ của chúng tôi.
            </li>
          </ul>
        </section>

        <section id="dieu-6" className="space-y-3 scroll-mt-20">
            <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 6. QUYỀN SỞ HỮU TRÍ TUỆ</h2>
            <p>
                <strong>6.1. Tài sản của HUB Planner:</strong> Toàn bộ giao diện người dùng, phong cách thiết kế, mã nguồn (source code), logo, dữ liệu biên tập nội bộ (trừ dữ liệu cá nhân của người dùng) và các tài sản trí tuệ khác trên ứng dụng đều thuộc quyền sở hữu duy nhất của đội ngũ phát triển HUB Planner. Bạn <strong>không được phép</strong> sao chép, chỉnh sửa, tái phân phối, đảo ngược mã nguồn (reverse engineer) hoặc sử dụng bất kỳ phần nào của ứng dụng cho mục đích thương mại khi chưa có sự đồng ý bằng văn bản từ chúng tôi.
            </p>
            <p>
                <strong>6.2. Nội dung người dùng (User Content):</strong> Khi bạn đăng tải nội dung lên hệ thống (ví dụ: đăng tin tìm đồ thất lạc, gửi góp ý, bình luận), bạn vẫn giữ quyền sở hữu đối với nội dung đó. Tuy nhiên, bằng việc đăng tải, bạn đồng ý cấp cho chúng tôi quyền sử dụng miễn phí, không độc quyền để hiển thị, lưu trữ và chia sẻ nội dung đó trên các nền tảng của HUB Planner nhằm phục vụ mục đích chung của cộng đồng sinh viên.
            </p>
        </section>

        <section id="dieu-7" className="space-y-3 scroll-mt-20">
            <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 7. CHÍNH SÁCH VỀ TÍNH NĂNG "ỦNG HỘ & TRI ÂN" (DONATE)</h2>
            <ul className="list-disc pl-6 space-y-3 text-gray-700">
                <li>
                    <strong>Nguyên tắc tự nguyện:</strong> Tính năng "Ủng hộ" (Donate) được xây dựng nhằm mục đích gây quỹ duy trì máy chủ (Server), duy trì tên miền và phát triển các tính năng mới cho ứng dụng. Mọi khoản đóng góp đều xuất phát hoàn toàn từ sự <strong>tự nguyện</strong> của người dùng, không mang tính chất bắt buộc hay trao đổi mua bán hàng hóa/dịch vụ.
                </li>
                <li>
                    <strong>Chính sách không hoàn lại:</strong> Xin lưu ý rằng, mọi khoản ủng hộ gửi đến HUB Planner được xem là quà tặng tri ân. Chúng tôi <strong>KHÔNG</strong> áp dụng chính sách hoàn tiền (refund) trong bất kỳ trường hợp nào sau khi giao dịch đã thực hiện thành công.
                </li>
                <li>
                    <strong>Vinh danh:</strong> Để tri ân tấm lòng của người dùng, chúng tôi sẽ hiển thị tên và lời nhắn của bạn tại mục "Bảng vàng Tri ân" (trừ trường hợp bạn yêu cầu ẩn danh). Chúng tôi cam kết sử dụng số tiền ủng hộ đúng mục đích để duy trì dự án phục vụ sinh viên HUB.
                </li>
            </ul>
        </section>

        <section id="dieu-8" className="space-y-3 scroll-mt-20">
            <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 8. GIỚI HẠN TRÁCH NHIỆM PHÁP LÝ</h2>
            <p>Trong phạm vi tối đa mà pháp luật hiện hành cho phép, đội ngũ phát triển HUB Planner và các bên liên quan sẽ <strong>KHÔNG</strong> chịu trách nhiệm đối với:</p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li>Bất kỳ thiệt hại trực tiếp, gián tiếp, ngẫu nhiên hoặc mang tính hậu quả nào (bao gồm nhưng không giới hạn: mất mát dữ liệu cá nhân, gián đoạn việc học tập, bỏ lỡ thời hạn thi cử hoặc đăng ký tín chỉ do sai lệch thông tin thời khóa biểu).</li>
                <li>Các sai sót phát sinh trong quá trình tính toán điểm số (GPA/ĐRL) dẫn đến việc người dùng hiểu sai lệch về kết quả học tập thực tế tại trường.</li>
                <li>Bất kỳ nội dung thông tin hoặc hành vi ứng xử nào của bên thứ ba (bao gồm cả những người dùng khác) trên nền tảng dịch vụ.</li>
                <li>Việc truy cập trái phép vào dữ liệu cá nhân của bạn do lỗi bảo mật từ phía thiết bị hoặc đường truyền internet của người dùng.</li>
            </ul>
        </section>

        <section id="dieu-9" className="space-y-3 scroll-mt-20">
            <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 9. TÍNH NĂNG BÁO CÁO SAI SÓT</h2>
            <p>
              Nhằm hoàn thiện hệ thống dữ liệu, HUB Planner cung cấp công cụ cho phép người dùng báo cáo các sai sót về thông tin học phần, giảng viên hoặc lịch học. Chúng tôi cam kết sẽ tiếp nhận, kiểm tra và cập nhật các thông tin phản hồi từ người dùng trong thời gian sớm nhất có thể. Tuy nhiên, chúng tôi không cam kết việc sửa đổi sẽ diễn ra ngay lập tức và không đảm bảo tính chính xác tuyệt đối 100% của dữ liệu sau khi chỉnh sửa.
            </p>
        </section>

        <section id="dieu-10" className="space-y-3 scroll-mt-20">
            <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 10. THAY ĐỔI ĐIỀU KHOẢN</h2>
            <p>
                Chúng tôi có quyền sửa đổi, bổ sung hoặc thay thế bất kỳ điều khoản nào trong bản thỏa thuận này vào bất cứ lúc nào theo quyết định của nhóm phát triển. Các thay đổi sẽ có hiệu lực ngay lập tức kể từ khi được cập nhật công khai trên website hoặc ứng dụng.
            </p>
            <p>
                Trách nhiệm của bạn là thường xuyên kiểm tra lại trang Điều khoản này. Việc bạn tiếp tục sử dụng dịch vụ sau khi có các thay đổi đồng nghĩa với việc bạn hoàn toàn chấp nhận và đồng ý tuân thủ các quy định mới nhất.
            </p>
        </section>

        <section id="dieu-11" className="space-y-4 scroll-mt-20">
          <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 11. THÔNG TIN LIÊN HỆ</h2>
          <p>
            Nếu bạn có bất kỳ câu hỏi, thắc mắc nào về bản Điều khoản sử dụng này hoặc cần hỗ trợ giải quyết các vấn đề phát sinh trong quá trình sử dụng, vui lòng liên hệ với chúng tôi:
          </p>
          <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 shadow-sm">
             <ul className="space-y-3 text-gray-800">
                <li><span className="font-bold w-32 inline-block">Họ tên:</span> <strong>Trần Quốc Hoàng</strong> (Đại diện nhóm phát triển)</li>
                <li><span className="font-bold w-32 inline-block">Zalo / SĐT:</span> <a href="tel:0389342812" className="text-blue-600 hover:underline">0389342812</a></li>
                <li><span className="font-bold w-32 inline-block">Email:</span> <a href="mailto:contact@hotrosinhvienhub.id.vn" className="text-blue-600 hover:underline">contact@hotrosinhvienhub.id.vn</a></li>
                <li><span className="font-bold w-32 inline-block">Đơn vị công tác:</span> Sinh viên Khoa Kinh tế Quốc tế - Trường Đại học Ngân hàng TP.HCM (HUB).</li>
             </ul>
          </div>
        </section>

        <footer className="text-center pt-10 border-t border-gray-100 text-gray-400 text-xs">
          <p>© 2026 HUB Planner. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
};