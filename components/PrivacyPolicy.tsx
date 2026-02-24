import React from 'react';

// 👇 Phải có "export const" để App.tsx có thể import và sử dụng
export const PrivacyPolicy: React.FC = () => {
  return (
    <div className="min-h-screen bg-white text-gray-900 px-6 sm:px-10 py-12 flex justify-center">
      <div className="w-full max-w-4xl space-y-10 text-base leading-relaxed text-justify">
        
        {/* HEADER */}
        <header className="space-y-3 text-center border-b border-gray-200 pb-6">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-wide uppercase text-[#003375]">
            CHÍNH SÁCH BẢO MẬT VÀ QUYỀN RIÊNG TƯ
          </h1>
          <p className="text-sm text-gray-600 italic">Phiên bản 1.1 - Cập nhật lần cuối: ngày 25 tháng 02 năm 2026</p>
        </header>

        {/* MỤC LỤC TỰ ĐỘNG CUỘN */}
        <nav className="bg-gray-50 border border-gray-200 rounded-lg p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-600 mb-4 border-b pb-2">
            Mục lục chính sách
          </h2>
          <ul className="grid gap-2 text-sm sm:grid-cols-2 text-blue-600 font-medium">
            <li><a href="#section-1" className="hover:underline">1. Giới thiệu chung</a></li>
            <li><a href="#section-2" className="hover:underline">2. Dữ liệu chúng tôi thu thập</a></li>
            <li><a href="#section-3" className="hover:underline">3. Mục đích sử dụng dữ liệu</a></li>
            <li><a href="#section-4" className="hover:underline">4. Lưu trữ và bảo vệ dữ liệu</a></li>
            <li><a href="#section-5" className="hover:underline">5. Chia sẻ dữ liệu với bên thứ ba</a></li>
            <li><a href="#section-6" className="hover:underline">6. Quyền của người dùng</a></li>
            <li><a href="#section-7" className="hover:underline">7. Thay đổi chính sách</a></li>
            <li><a href="#section-8" className="hover:underline">8. Thông tin liên hệ</a></li>
          </ul>
        </nav>

        {/* NỘI DUNG CHI TIẾT */}
        
        <section id="section-1" className="space-y-3 scroll-mt-20">
          <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 1. GIỚI THIỆU CHUNG</h2>
          <p>
            Chào mừng bạn đến với <strong>HUB Planner</strong> ("Ứng dụng", "Chúng tôi"). Ứng dụng được phát triển bởi nhóm sinh viên với mục đích hỗ trợ cộng đồng sinh viên Trường Đại học Ngân hàng TP.HCM (HUB) trong việc quản lý lộ trình học tập, tính toán điểm số GPA, tra cứu Thời khóa biểu, Lịch thi và lập kế hoạch cá nhân một cách khoa học.
          </p>
          <p>
            Chúng tôi hiểu rằng quyền riêng tư là tài sản vô giá. Chính sách bảo mật này là cam kết minh bạch về cách chúng tôi thu thập, sử dụng, lưu trữ và bảo vệ thông tin cá nhân của bạn khi sử dụng dịch vụ tại địa chỉ chính thức: <a href="https://hotrosinhvienhub.id.vn" className="text-blue-600 hover:underline">https://hotrosinhvienhub.id.vn</a>.
          </p>
          <p>
             Bằng việc đăng nhập và sử dụng Dịch vụ, bạn xác nhận đã hiểu và đồng ý với việc thu thập và sử dụng thông tin theo các quy định nghiêm ngặt tại Chính sách này.
          </p>
        </section>

        <section id="section-2" className="space-y-6 scroll-mt-20">
          <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 2. DỮ LIỆU CHÚNG TÔI THU THẬP</h2>
          <p>Để đảm bảo các tính năng hoạt động chính xác và ổn định, chúng tôi thu thập các loại dữ liệu sau:</p>
          
          <div className="pl-5 border-l-4 border-blue-100 space-y-4">
            <div>
              <h3 className="font-bold text-gray-800 mb-2">a. Dữ liệu định danh (Thông qua Google OAuth)</h3>
              <p className="mb-2">Khi bạn đăng nhập bằng Google, chúng tôi chỉ truy cập các thông tin cơ bản do Google cung cấp theo sự cho phép của bạn:</p>
              <ul className="list-disc pl-6 space-y-1 text-gray-700 text-sm">
                <li><strong>ID Người dùng (Google ID):</strong> Định danh duy nhất để quản lý tài khoản trên hệ thống.</li>
                <li><strong>Họ và Tên:</strong> Hiển thị cá nhân hóa trên giao diện ứng dụng.</li>
                <li><strong>Email sinh viên:</strong> Xác thực tư cách người dùng (đuôi @st.buh.edu.vn).</li>
                <li><strong>Ảnh đại diện:</strong> Hiển thị trên hồ sơ cá nhân.</li>
              </ul>
              <div className="mt-3 p-3 bg-red-50 text-red-700 text-xs rounded border border-red-100 font-bold">
                ⚠️ TUYÊN BỐ: Chúng tôi KHÔNG có quyền và KHÔNG BAO GIỜ thu thập mật khẩu Google, dữ liệu Gmail hay bất kỳ thông tin riêng tư nào khác trên thiết bị của bạn.
              </div>
            </div>

            <div>
              <h3 className="font-bold text-gray-800 mb-2">b. Dữ liệu học tập và Lập kế hoạch</h3>
              <p className="text-gray-700 text-sm">Hệ thống lưu trữ các dữ liệu do bạn chủ động nhập hoặc đồng bộ từ cổng thông tin: Mã học phần, tên môn học, số tín chỉ, điểm số chi tiết các thành phần, lịch thi dự kiến và tên giảng viên phụ trách môn học.</p>
            </div>

            <div>
              <h3 className="font-bold text-gray-800 mb-2">c. Dữ liệu Báo cáo sai sót (Course Reports)</h3>
              <p className="text-gray-700 text-sm">Khi bạn thực hiện báo cáo lỗi dữ liệu, chúng tôi sẽ thu thập nội dung mô tả sai sót kèm mã học phần liên quan để phục vụ mục đích kiểm tra và chỉnh sửa hệ thống chung.</p>
            </div>

            <div>
              <h3 className="font-bold text-gray-800 mb-2">d. Dữ liệu Kỹ thuật và Cookie</h3>
              <p className="text-gray-700 text-sm">Chúng tôi sử dụng Cookie để duy trì trạng thái đăng nhập. Trong quá trình đồng bộ dữ liệu từ cổng thông tin HUB, các thông tin định danh tạm thời chỉ được xử lý trong phiên làm việc và <strong>KHÔNG</strong> được lưu trữ vĩnh viễn trong cơ sở dữ liệu của chúng tôi.</p>
            </div>
          </div>
        </section>

        <section id="section-3" className="space-y-3 scroll-mt-20">
          <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 3. MỤC ĐÍCH SỬ DỤNG DỮ LIỆU</h2>
          <p>Chúng tôi cam kết sử dụng thông tin của bạn vì lợi ích học tập của chính bạn:</p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li><strong>Xác thực và Bảo mật:</strong> Ngăn chặn việc truy cập trái phép vào bảng điểm và kế hoạch học tập cá nhân.</li>
            <li><strong>Đồng bộ hóa đám mây (Cloud Sync):</strong> Đảm bảo dữ liệu học tập của bạn luôn đồng nhất khi chuyển đổi giữa các thiết bị (Điện thoại, Laptop, Tablet).</li>
            <li><strong>Cung cấp tính năng:</strong> Tính toán chính xác GPA theo quy chế, hiển thị lịch học theo tuần và lịch thi cá nhân hóa.</li>
            <li><strong>Cải thiện hệ thống:</strong> Sử dụng các báo cáo lỗi để nâng cao chất lượng dữ liệu giảng viên và môn học cho cộng đồng.</li>
          </ul>
        </section>

        <section id="section-4" className="space-y-3 scroll-mt-20">
          <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 4. LƯU TRỮ VÀ BẢO VỆ DỮ LIỆU</h2>
          <p>An toàn thông tin là ưu tiên hàng đầu. Chúng tôi áp dụng các tiêu chuẩn kỹ thuật cao cấp:</p>
          <ul className="list-disc pl-6 space-y-3 text-gray-700 text-sm">
            <li>
              <strong>Hạ tầng Supabase (Enterprise Grade):</strong> Dữ liệu được mã hóa và lưu trữ tại các trung tâm dữ liệu đạt chứng chỉ <strong>SOC 2 Type 2</strong> và tuân thủ <strong>GDPR</strong> toàn cầu.
            </li>
            <li>
              <strong>Mã hóa SSL/TLS:</strong> Mọi đường truyền dữ liệu giữa bạn và máy chủ luôn được bảo vệ bởi giao thức HTTPS mạnh mẽ, chống lại hành vi can thiệp từ bên thứ ba.
            </li>
            <li>
              <strong>Row Level Security (RLS):</strong> Chúng tôi áp dụng cơ chế bảo mật cấp độ hàng (RLS). Điều này có nghĩa là về mặt vật lý, không ai có quyền truy cập dữ liệu của bạn trừ khi họ đăng nhập đúng tài khoản Google của chính bạn.
            </li>
          </ul>
        </section>

        <section id="section-5" className="space-y-3 scroll-mt-20">
          <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 5. CHIA SẺ DỮ LIỆU VỚI BÊN THỨ BA</h2>
          <p>Chúng tôi <strong>TUYỆT ĐỐI KHÔNG</strong> kinh doanh, bán hoặc cho thuê dữ liệu cá nhân của sinh viên cho các đơn vị quảng cáo hay bất kỳ tổ chức nào khác.</p>
          <p>Dữ liệu chỉ tương tác với các đơn vị kỹ thuật bắt buộc:</p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700 text-sm">
            <li><strong>Google:</strong> Phục vụ hạ tầng đăng nhập OAuth.</li>
            <li><strong>Supabase:</strong> Phục vụ hạ tầng lưu trữ cơ sở dữ liệu mã hóa.</li>
            <li><strong>Hệ thống Portal HUB:</strong> Tương tác kỹ thuật để lấy dữ liệu công khai (quá trình này không lưu lại tài khoản/mật khẩu cổng thông tin của bạn).</li>
            <li><strong>Yêu cầu pháp lý:</strong> Chỉ cung cấp thông tin khi có yêu cầu bằng văn bản từ cơ quan nhà nước có thẩm quyền theo pháp luật Việt Nam.</li>
          </ul>
        </section>

        <section id="section-6" className="space-y-3 scroll-mt-20">
          <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 6. QUYỀN CỦA NGƯỜI DÙNG (USER RIGHTS)</h2>
          <p>Bạn là chủ sở hữu duy nhất đối với dữ liệu của mình trên HUB Planner:</p>
          <ul className="list-disc pl-6 space-y-3 text-gray-700">
            <li><strong>Quyền kiểm soát:</strong> Tự do xem, chỉnh sửa hoặc cập nhật các thông tin điểm số và môn học.</li>
            <li><strong>Quyền xóa bỏ (Right to be forgotten):</strong>
              <ul className="list-circle pl-6 mt-1 space-y-2">
                 <li>Bạn có thể chủ động sử dụng tính năng <strong>"Reset dữ liệu"</strong> trong mục Cài đặt để xóa toàn bộ dữ liệu học tập cá nhân ngay lập tức.</li>
                 <li>Bạn có quyền yêu cầu chúng tôi xóa vĩnh viễn toàn bộ tài khoản và các thông tin liên quan bằng cách liên hệ với Nhà phát triển.</li>
              </ul>
            </li>
          </ul>
        </section>

        <section id="section-7" className="space-y-3 scroll-mt-20">
          <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 7. THAY ĐỔI CHÍNH SÁCH</h2>
          <p>
            Chính sách bảo mật này có thể được cập nhật thường xuyên để phù hợp với các thay đổi về công nghệ hoặc quy định pháp luật. Mọi thay đổi sẽ có hiệu lực ngay khi được đăng tải công khai trên trang này. Việc bạn tiếp tục sử dụng ứng dụng đồng nghĩa với việc bạn chấp nhận các điều khoản bảo mật mới nhất.
          </p>
        </section>

        <section id="section-8" className="space-y-4 scroll-mt-20">
          <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 8. THÔNG TIN LIÊN HỆ</h2>
          <p>
            Nếu bạn có bất kỳ thắc mắc nào về vấn đề bảo mật thông tin hoặc muốn thực hiện quyền xóa dữ liệu cá nhân, vui lòng liên hệ:
          </p>
          <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 shadow-sm">
             <ul className="space-y-3 text-gray-800">
                <li><span className="font-bold w-32 inline-block">Họ tên:</span> <strong>Trần Quốc Hoàng</strong> (Đại diện nhóm phát triển)</li>
                <li><span className="font-bold w-32 inline-block">Zalo / SĐT:</span> <a href="tel:0389342812" className="text-blue-600 hover:underline">0389342812</a></li>
                <li><span className="font-bold w-32 inline-block">Email:</span> <a href="mailto:contact@hotrosinhvienhub.id.vn" className="text-blue-600 hover:underline">contact@hotrosinhvienhub.id.vn</a></li>
                <li><span className="font-bold w-32 inline-block">Đơn vị:</span> Sinh viên Khoa Kinh tế Quốc tế - HUB.</li>
             </ul>
          </div>
        </section>

        <footer className="text-center pt-10 border-t border-gray-100 text-gray-400 text-xs">
          <p>© 2026 HUB Planner. Cam kết bảo mật dữ liệu sinh viên.</p>
        </footer>
      </div>
    </div>
  );
};