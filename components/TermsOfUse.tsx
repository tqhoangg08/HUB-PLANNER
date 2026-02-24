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
          <p className="text-sm text-gray-600">Phiên bản 1.1 - Ngày cập nhật: 25/02/2026</p>
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
            <li><a href="#dieu-9" className="hover:underline">Điều 9. Tính năng báo cáo sai sót</a></li>
            <li><a href="#dieu-10" className="hover:underline">Điều 10. Thay đổi điều khoản</a></li>
            <li><a href="#dieu-11" className="hover:underline">Điều 11. Liên hệ</a></li>
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
            <li><strong>Lập kế hoạch học tập cá nhân: Tra cứu thời khóa biểu, lịch thi và thông tin giảng viên trực quan.</strong></li>
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
            <p className="mb-4">
              HUB Planner là dự án độc lập được phát triển bởi nhóm sinh viên, hoạt động phi lợi nhuận. 
              Chúng tôi khẳng định ứng dụng này <strong>KHÔNG PHẢI</strong> là sản phẩm chính thức, không trực thuộc và không đại diện cho 
              <strong> Trường Đại học Ngân hàng TP.HCM (HUB)</strong> dưới bất kỳ hình thức nào.
            </p>
            
            <h3 className="font-bold text-red-700 mb-2">3.2. Nguồn dữ liệu và Độ chính xác</h3>
            <div className="space-y-2">
              <p>
                <strong>Dữ liệu Thời khóa biểu & Lịch thi:</strong> Được đồng bộ tham khảo từ Cổng thông tin đào tạo (online.hub.edu.vn). Do tính chất cập nhật của hệ thống gốc hoặc các yếu tố kỹ thuật, thông tin trên ứng dụng có thể chậm trễ hoặc sai lệch so với thực tế.
              </p>
              <p>
                <strong>Thông tin Giảng viên:</strong> Là dữ liệu tham khảo được hệ thống tự động trích xuất. Chúng tôi không chịu trách nhiệm nếu có sự thay đổi điều động giảng viên từ phía Nhà trường mà hệ thống chưa kịp cập nhật.
              </p>
              <p>
                <strong>Kết quả tính toán:</strong> Các tính năng tính toán (GPA, ĐRL) chỉ mang tính chất <strong>tham khảo</strong>. Sinh viên có trách nhiệm và nghĩa vụ đối chiếu lại kết quả với <strong>Portal chính thức</strong> của Nhà trường trước khi đưa ra các quyết định quan trọng.
              </p>
            </div>
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
              <strong>Thiết bị công cộng:</strong> Khi sử dụng HUB Planner trên thiết bị công cộng, bạn có trách nhiệm <strong>Đăng xuất</strong> và sử dụng tính năng <strong>"Xóa dữ liệu (Reset)"</strong> trước khi rời đi để tránh lộ thông tin cá nhân.
            </li>
            <li>
              <strong>Xử lý vi phạm:</strong> Chúng tôi có quyền khóa vĩnh viễn hoặc tạm ngưng tài khoản nếu phát hiện dấu hiệu can thiệp bất hợp pháp vào hệ thống.
            </li>
          </ul>
        </section>

        <section id="dieu-5" className="space-y-3">
          <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 5. QUY TẮC ỨNG XỬ & HÀNH VI CẤM</h2>
          <p>Khi sử dụng dịch vụ, bạn cam kết <strong>KHÔNG</strong> thực hiện các hành vi sau:</p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Sử dụng ứng dụng vào mục đích vi phạm pháp luật, lừa đảo.</li>
            <li>
              <strong>Cố tình khai thác lỗi hệ thống hoặc sử dụng các công cụ tự động can thiệp trái phép vào cơ sở dữ liệu của HUB Planner.</strong>
            </li>
            <li>
              Đăng tải nội dung sai sự thật, xúc phạm, hoặc vi phạm thuần phong mỹ tục lên các mục cộng đồng (Lost & Found, Góp ý).
            </li>
            <li>
              Cố tình gây quá tải cho hệ thống máy chủ (DDoS).
            </li>
          </ul>
        </section>

        <section id="dieu-6" className="space-y-3">
            <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 6. QYỀN SỞ HỮU TRÍ TUỆ</h2>
            <p>
                <strong>6.1. Tài sản của HUB Planner:</strong> Toàn bộ giao diện, thiết kế, mã nguồn, logo và dữ liệu biên tập đều thuộc quyền sở hữu của đội ngũ phát triển. Bạn không được phép sao chép, chỉnh sửa hoặc tái phân phối cho mục đích thương mại khi chưa có sự đồng ý bằng văn bản.
            </p>
            <p>
                <strong>6.2. Nội dung người dùng:</strong> Khi bạn đăng tải nội dung (Lost & Found, bình luận), bạn vẫn giữ quyền sở hữu. Tuy nhiên, bạn đồng ý cấp cho chúng tôi quyền hiển thị và lưu trữ các nội dung này để phục vụ cộng đồng.
            </p>
        </section>

        <section id="dieu-7" className="space-y-3">
            <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 7. CHÍNH SÁCH ỦNG HỘ & TRI ÂN (DONATE)</h2>
            <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li>
                    <strong>Tự nguyện:</strong> Mọi khoản đóng góp đều là <strong>tự nguyện</strong> nhằm gây quỹ duy trì server và phát triển tính năng mới, không phải giao dịch mua bán hàng hóa.
                </li>
                <li>
                    <strong>Không hoàn lại:</strong> Các khoản ủng hộ được xem là quà tặng và sẽ <strong>KHÔNG</strong> được hoàn tiền trong bất kỳ trường hợp nào sau khi giao dịch thành công.
                </li>
            </ul>
        </section>

        <section id="dieu-8" className="space-y-3">
            <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 8. GIỚI HẠN TRÁCH NHIỆM PHÁP LÝ</h2>
            <p>Trong phạm vi tối đa pháp luật cho phép, chúng tôi sẽ <strong>KHÔNG</strong> chịu trách nhiệm đối với:</p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li>Bất kỳ thiệt hại nào phát sinh từ việc thông tin thời khóa biểu, lịch thi hoặc điểm số bị sai lệch dẫn đến gián đoạn việc học tập hoặc bỏ lỡ thời hạn của sinh viên.</li>
                <li>Việc truy cập trái phép vào dữ liệu do lỗi bảo mật từ phía thiết bị hoặc tài khoản cá nhân của người dùng.</li>
                <li>Các sai sót khách quan từ hệ thống máy chủ cung cấp dữ liệu của bên thứ ba.</li>
            </ul>
        </section>

        {/* ĐIỀU 9 MỚI */}
        <section id="dieu-9" className="space-y-3">
            <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 9. TÍNH NĂNG BÁO CÁO SAI SÓT</h2>
            <p>
              Chúng tôi cung cấp công cụ báo cáo sai sót cho dữ liệu học phần và giảng viên. Chúng tôi cam kết tiếp nhận và kiểm tra thông tin phản hồi từ người dùng để cập nhật hệ thống, nhưng không cam kết sửa đổi ngay lập tức hoặc đảm bảo tính chính xác tuyệt đối sau khi chỉnh sửa.
            </p>
        </section>

        <section id="dieu-10" className="space-y-3">
            <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 10. THAY ĐỔI ĐIỀU KHOẢN</h2>
            <p>
                Chúng tôi có quyền sửa đổi hoặc thay thế bất kỳ điều khoản nào vào bất cứ lúc nào. Các thay đổi có hiệu lực ngay khi cập nhật. Việc bạn tiếp tục sử dụng dịch vụ sau khi có thay đổi đồng nghĩa với việc bạn chấp nhận các điều khoản mới.
            </p>
        </section>

        <section id="dieu-11" className="space-y-4">
          <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 11. LIÊN HỆ</h2>
          <p>
            Mọi thắc mắc hoặc báo cáo sai sót nghiêm trọng, vui lòng liên hệ với đại diện nhóm phát triển:
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