import React from 'react';

export const PrivacyPolicy: React.FC = () => {
  return (
    <div className="min-h-screen bg-white text-gray-900 px-6 sm:px-10 py-12 flex justify-center">
      <div className="w-full max-w-4xl space-y-10 text-base leading-relaxed">
        
        {/* HEADER */}
        <header className="space-y-3 text-center border-b border-gray-200 pb-6">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-wide uppercase text-[#003375]">
            CHÍNH SÁCH BẢO MẬT VÀ QUYỀN RIÊNG TƯ
          </h1>
          <p className="text-sm text-gray-600">Phiên bản 1.0 - Ngày hiệu lực: 17/01/2026</p>
        </header>

        {/* MỤC LỤC */}
        <nav className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-600 mb-3">
            Mục lục
          </h2>
          <ul className="grid gap-2 text-sm sm:grid-cols-2 text-blue-600 font-medium">
            <li><a href="#dieu-1" className="hover:underline">Điều 1. Giới thiệu chung</a></li>
            <li><a href="#dieu-2" className="hover:underline">Điều 2. Dữ liệu chúng tôi thu thập</a></li>
            <li><a href="#dieu-3" className="hover:underline">Điều 3. Mục đích sử dụng dữ liệu</a></li>
            <li><a href="#dieu-4" className="hover:underline">Điều 4. Lưu trữ và bảo vệ dữ liệu</a></li>
            <li><a href="#dieu-5" className="hover:underline">Điều 5. Chia sẻ dữ liệu với bên thứ ba</a></li>
            <li><a href="#dieu-6" className="hover:underline">Điều 6. Quyền của người dùng</a></li>
            <li><a href="#dieu-7" className="hover:underline">Điều 7. Thời gian lưu trữ</a></li>
            <li><a href="#dieu-8" className="hover:underline">Điều 8. Liên hệ</a></li>
          </ul>
        </nav>

        {/* NỘI DUNG CHI TIẾT */}
        
        <section id="dieu-1" className="space-y-3">
          <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 1. GIỚI THIỆU CHUNG</h2>
          <p>
            Chào mừng bạn đến với <strong>HUB Planner</strong> ("Ứng dụng", "Chúng tôi"). 
            Ứng dụng được phát triển với mục đích hỗ trợ sinh viên Trường Đại học Ngân hàng TP.HCM (HUB) 
            trong việc quản lý học tập, tính điểm GPA và lập kế hoạch cá nhân.
          </p>
          <p>
            Chúng tôi hiểu rằng quyền riêng tư là tài sản vô giá của mỗi cá nhân. Chính sách bảo mật này 
            là cam kết pháp lý minh bạch về cách chúng tôi thu thập, sử dụng, lưu trữ và bảo vệ thông tin 
            cá nhân của bạn khi sử dụng dịch vụ tại địa chỉ: <a href="https://hotrosinhvienhub.id.vn" className="text-blue-600 hover:underline">https://hotrosinhvienhub.id.vn</a>.
          </p>
          <p>
             Bằng việc sử dụng Dịch vụ, bạn đồng ý với việc thu thập và sử dụng thông tin theo quy định tại Chính sách này.
          </p>
        </section>

        <section id="dieu-2" className="space-y-4">
          <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 2. DỮ LIỆU CHÚNG TÔI THU THẬP</h2>
          <p>
            Để cung cấp các tính năng tốt nhất và đảm bảo trải nghiệm người dùng, chúng tôi có thể thu thập và xử lý các loại dữ liệu sau đây:
          </p>
          
          <div className="pl-4 border-l-4 border-blue-100">
            <h3 className="font-bold text-gray-800 mb-2">2.1. Dữ liệu định danh (Thông qua Google OAuth)</h3>
            <p className="mb-2">
              Khi bạn chọn đăng nhập bằng tài khoản Google, chúng tôi chỉ được cấp quyền truy cập vào các thông tin cơ bản công khai (theo sự cho phép của bạn và chính sách của Google), bao gồm:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-gray-700">
              <li><strong>ID Người dùng (Google User ID):</strong> Một chuỗi ký tự duy nhất để định danh tài khoản của bạn trên hệ thống của chúng tôi.</li>
              <li><strong>Họ và Tên:</strong> Dùng để hiển thị lời chào và cá nhân hóa giao diện người dùng.</li>
              <li><strong>Địa chỉ Email:</strong> Dùng để xác thực tài khoản, phân quyền (ví dụ: email đuôi @st.buh.edu.vn) và hỗ trợ khôi phục tài khoản khi cần thiết.</li>
              <li><strong>Ảnh đại diện (Avatar URL):</strong> Để hiển thị ảnh cá nhân của bạn trên thanh công cụ và trang hồ sơ.</li>
            </ul>
            <div className="mt-3 p-3 bg-red-50 text-red-700 text-sm rounded border border-red-100 font-medium">
               ⚠️ TUYÊN BỐ QUAN TRỌNG: Chúng tôi TUYỆT ĐỐI KHÔNG có quyền truy cập và KHÔNG BAO GIỜ thu thập: Mật khẩu Google, dữ liệu trong Google Drive, nội dung Gmail, danh bạ điện thoại hay bất kỳ thông tin riêng tư nào khác trên thiết bị của bạn.
            </div>
          </div>

          <div className="pl-4 border-l-4 border-green-100">
            <h3 className="font-bold text-gray-800 mb-2">2.2. Dữ liệu học tập do người dùng cung cấp</h3>
            <p className="mb-2">
              Trong quá trình sử dụng các công cụ tiện ích (như Tính điểm GPA, Lập lịch, Nhập bảng điểm), bạn có thể chủ động nhập hoặc tải lên các dữ liệu sau:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-gray-700">
              <li>Danh sách các môn học, mã môn học, tên môn học.</li>
              <li>Số tín chỉ, hệ số điểm của từng môn.</li>
              <li>Điểm số các thành phần chi tiết (Điểm chuyên cần, Điểm quá trình/Thường xuyên, Điểm giữa kỳ, Điểm thi kết thúc học phần).</li>
              <li>Thời khóa biểu cá nhân, lịch thi (nếu có tính năng nhập liệu).</li>
            </ul>
          </div>
          
          <div className="pl-4 border-l-4 border-gray-200">
            <h3 className="font-bold text-gray-800 mb-2">2.3. Dữ liệu thiết bị (Local Storage)</h3>
            <p className="mb-2 text-gray-700">
               Đối với người dùng chọn chế độ <strong>"Khách" (Không đăng nhập)</strong>, toàn bộ dữ liệu học tập chỉ được lưu cục bộ trên trình duyệt (Local Storage) của thiết bị đó và không bao giờ được gửi lên máy chủ của chúng tôi.
            </p>
          </div>
        </section>

        <section id="dieu-3" className="space-y-3">
          <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 3. MỤC ĐÍCH SỬ DỤNG DỮ LIỆU</h2>
          <p>Chúng tôi sử dụng thông tin thu thập được cho các mục đích hợp pháp, minh bạch và cụ thể sau:</p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>
                <strong>Định danh và Xác thực:</strong> Đảm bảo bạn là chủ sở hữu hợp pháp của tài khoản khi truy cập ứng dụng, ngăn chặn các hành vi truy cập trái phép.
            </li>
            <li>
              <strong>Đồng bộ hóa dữ liệu (Cloud Sync):</strong> Giúp bạn có thể truy cập bảng điểm, tiến độ học tập và kế hoạch cá nhân của mình một cách liền mạch từ nhiều thiết bị khác nhau (Điện thoại, Laptop, Máy tính bảng) mà không bị mất dữ liệu.
            </li>
            <li>
              <strong>Cung cấp tính năng cốt lõi:</strong> Sử dụng dữ liệu điểm số để tính toán GPA (Hệ 4, Hệ 10), xếp loại học lực, dự báo mục tiêu điểm số cần đạt được cho các kỳ học tiếp theo.
            </li>
            <li>
              <strong>Cải thiện trải nghiệm người dùng:</strong> Phân tích dữ liệu ẩn danh (ví dụ: số lượng người dùng truy cập, tính năng được sử dụng nhiều nhất) để phát hiện lỗi, tối ưu hóa hiệu suất và phát triển các tính năng mới phù hợp với nhu cầu sinh viên.
            </li>
          </ul>
        </section>

        <section id="dieu-4" className="space-y-3">
          <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 4. LƯU TRỮ VÀ BẢO VỆ DỮ LIỆU</h2>
          <p>An toàn thông tin là ưu tiên hàng đầu của chúng tôi. Chúng tôi áp dụng các biện pháp kỹ thuật tiên tiến để bảo vệ dữ liệu của bạn:</p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>
              <strong>Nơi lưu trữ an toàn:</strong> Dữ liệu định danh và học tập của bạn được lưu trữ trên nền tảng <strong>Supabase</strong> – một dịch vụ cơ sở dữ liệu đám mây (Backend-as-a-Service) uy tín hàng đầu thế giới, tuân thủ các tiêu chuẩn bảo mật quốc tế (SOC2, HIPAA).
            </li>
            <li>
              <strong>Mã hóa đường truyền:</strong> Mọi dữ liệu truyền tải giữa thiết bị của bạn và máy chủ của chúng tôi đều được mã hóa bằng giao thức <strong>SSL/TLS (HTTPS)</strong>, đảm bảo thông tin không bị đánh cắp hoặc nghe lén khi truyền qua mạng internet.
            </li>
            <li>
               <strong>Cơ chế phân quyền nghiêm ngặt (RLS):</strong> Chúng tôi áp dụng chính sách Row Level Security (RLS) ở cấp độ cơ sở dữ liệu. Điều này đảm bảo về mặt kỹ thuật rằng chỉ có tài khoản có ID trùng khớp với chủ sở hữu dữ liệu mới có quyền xem, sửa hoặc xóa dữ liệu đó. Ngay cả những người dùng khác trong hệ thống cũng không thể truy cập dữ liệu của bạn.
            </li>
          </ul>
        </section>

        <section id="dieu-5" className="space-y-3">
          <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 5. CHIA SẺ DỮ LIỆU VỚI BÊN THỨ BA</h2>
          <p>
            Chúng tôi cam kết <strong>KHÔNG</strong> bán, trao đổi, cho thuê hoặc tiết lộ thông tin cá nhân của sinh viên cho bất kỳ bên thứ ba nào (nhà quảng cáo, doanh nghiệp...) vì mục đích thương mại.
          </p>
          <p>Dữ liệu của bạn chỉ được chia sẻ trong các trường hợp kỹ thuật bắt buộc để vận hành ứng dụng:</p>
          <ul className="list-disc pl-6 space-y-1 text-gray-700">
            <li><strong>Google:</strong> Để thực hiện quy trình đăng nhập và xác thực danh tính (Authentication).</li>
            <li><strong>Supabase:</strong> Để cung cấp hạ tầng lưu trữ cơ sở dữ liệu và xác thực người dùng.</li>
            <li><strong>Cơ quan pháp luật:</strong> Trong trường hợp có yêu cầu bằng văn bản từ cơ quan nhà nước có thẩm quyền theo quy định của pháp luật Việt Nam.</li>
          </ul>
        </section>

        <section id="dieu-6" className="space-y-3">
          <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 6. QUYỀN CỦA NGƯỜI DÙNG (USER RIGHTS)</h2>
          <p>Bạn có toàn quyền kiểm soát đối với dữ liệu cá nhân của mình trên hệ thống HUB Planner:</p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li><strong>Quyền truy cập:</strong> Bạn có thể đăng nhập bất cứ lúc nào để xem lại toàn bộ điểm số, thông tin cá nhân và dữ liệu đã lưu.</li>
            <li><strong>Quyền chỉnh sửa:</strong> Bạn có quyền tự do cập nhật, sửa đổi thông tin nếu phát hiện sai lệch (ví dụ: nhập sai điểm, sai tên môn học).</li>
            <li>
              <strong>Quyền xóa bỏ (Right to be forgotten):</strong>
              <ul className="list-circle pl-6 mt-1 space-y-1">
                 <li>Bạn có thể sử dụng tính năng "Xóa dữ liệu (Reset)" ngay trong phần Cài đặt của ứng dụng để xóa toàn bộ dữ liệu học tập cá nhân.</li>
                 <li>Bạn có quyền yêu cầu chúng tôi xóa vĩnh viễn tài khoản và toàn bộ dữ liệu liên quan khỏi hệ thống máy chủ bất cứ lúc nào bằng cách liên hệ với Nhà phát triển.</li>
              </ul>
            </li>
          </ul>
        </section>

        <section id="dieu-7" className="space-y-3">
          <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 7. THỜI GIAN LƯU TRỮ</h2>
          <p>Dữ liệu của bạn sẽ được lưu trữ an toàn trên hệ thống cho đến khi:</p>
          <ul className="list-disc pl-6 space-y-1 text-gray-700">
            <li>Bạn tự thực hiện thao tác xóa dữ liệu trên ứng dụng.</li>
            <li>Bạn gửi yêu cầu xóa tài khoản vĩnh viễn.</li>
            <li>Hệ thống ngừng hoạt động (chúng tôi sẽ có thông báo trước và cung cấp công cụ để bạn tải dữ liệu về máy trước khi đóng server).</li>
          </ul>
        </section>

        <section id="dieu-8" className="space-y-4">
          <h2 className="text-xl font-bold text-[#003375]">ĐIỀU 8. LIÊN HỆ</h2>
          <p>
            Nếu bạn có bất kỳ câu hỏi, thắc mắc nào về Chính sách bảo mật này, hoặc muốn thực hiện quyền truy cập/xóa dữ liệu của mình, vui lòng liên hệ trực tiếp với đội ngũ phát triển:
          </p>
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
             <ul className="space-y-2 text-gray-800">
                <li><strong>Họ tên:</strong> Trần Quốc Hoàng (Đại diện nhóm phát triển)</li>
                <li><strong>Số điện thoại / Zalo:</strong> <a href="tel:0389342812" className="text-blue-600 hover:underline">0389342812</a></li>
                <li><strong>Email:</strong> <a href="mailto:contact@hotrosinhvienhub.id.vn" className="text-blue-600 hover:underline">contact@hotrosinhvienhub.id.vn</a></li>
                <li><strong>Đơn vị:</strong> Sinh viên Khoa Kinh tế Quốc tế - Trường Đại học Ngân hàng TP.HCM (HUB).</li>
             </ul>
          </div>
          <p className="text-sm text-gray-500 italic mt-4">
             Bản chính sách này có thể được cập nhật theo thời gian để phù hợp với các thay đổi về tính năng ứng dụng hoặc quy định pháp luật. Chúng tôi khuyến khích bạn xem lại trang này thường xuyên để nắm bắt thông tin mới nhất.
          </p>
        </section>
      </div>
    </div>
  );
};