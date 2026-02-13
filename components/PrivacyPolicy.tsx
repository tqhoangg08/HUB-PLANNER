import React from 'react';

export const PrivacyPolicy: React.FC = () => {
  return (
    <div className="min-h-screen bg-white text-gray-900 px-6 sm:px-10 py-12 flex justify-center">
      <div className="w-full max-w-4xl space-y-10 text-base leading-relaxed">
        <header className="space-y-3 text-center border-b border-gray-200 pb-6">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-wide uppercase">
            CHÍNH SÁCH BẢO MẬT VÀ QUYỀN RIÊNG TƯ
          </h1>
          <p className="text-sm text-gray-600">Cập nhật lần cuối: ngày 17 tháng 01 năm 2026</p>
        </header>

        <nav className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-600 mb-3">
            Mục lục
          </h2>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            <li>1. Giới thiệu chung</li>
            <li>2. Dữ liệu chúng tôi thu thập</li>
            <li>3. Mục đích sử dụng dữ liệu</li>
            <li>4. Lưu trữ và bảo vệ dữ liệu</li>
            <li>5. Chia sẻ dữ liệu với bên thứ ba</li>
            <li>6. Quyền của người dùng</li>
            <li>7. Liên hệ</li>
          </ul>
        </nav>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">1. GIỚI THIỆU CHUNG</h2>
          <p>
            Chào mừng bạn đến với HUB Planner (&quot;Ứng dụng&quot;, &quot;Chúng tôi&quot;). Ứng dụng được
            phát triển với mục đích hỗ trợ sinh viên Trường Đại học Ngân hàng TP.HCM (HUB)
            trong việc quản lý học tập, tính điểm GPA và lập kế hoạch cá nhân.
          </p>
          <p>
            Chúng tôi hiểu rằng quyền riêng tư là vô cùng quan trọng. Chính sách bảo mật này
            cam kết minh bạch về cách chúng tôi thu thập, sử dụng, lưu trữ và bảo vệ thông tin
            cá nhân của bạn khi sử dụng dịch vụ tại địa chỉ: https://hotrosinhvienhub.id.vn.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">2. DỮ LIỆU CHÚNG TÔI THU THẬP</h2>
          <p>
            Để cung cấp các tính năng tốt nhất, chúng tôi có thể thu thập và xử lý các loại dữ
            liệu sau:
          </p>
          <div className="space-y-2">
            <p className="font-semibold">a. Dữ liệu từ Tài khoản Google (Google OAuth)</p>
            <p>
              Khi bạn chọn đăng nhập bằng Google, chúng tôi chỉ được cấp quyền truy cập vào các
              thông tin cơ bản sau (theo sự cho phép của bạn):
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                ID Người dùng (Google User ID): Để định danh duy nhất tài khoản của bạn trên hệ
                thống.
              </li>
              <li>Họ và Tên: Để hiển thị lời chào và cá nhân hóa giao diện.</li>
              <li>Địa chỉ Email: Dùng để xác thực tài khoản và hỗ trợ khôi phục khi cần thiết.</li>
              <li>Ảnh đại diện (Avatar): Để hiển thị ảnh cá nhân trên thanh công cụ.</li>
            </ul>
            <p>
              Lưu ý: Chúng tôi TUYỆT ĐỐI KHÔNG có quyền truy cập vào mật khẩu, Google Drive,
              Gmail hay danh bạ điện thoại của bạn.
            </p>
          </div>
          <div className="space-y-2">
            <p className="font-semibold">b. Dữ liệu học tập do người dùng cung cấp</p>
            <p>Trong quá trình sử dụng các công cụ (như Tính điểm GPA, Lập lịch), bạn có thể nhập các dữ liệu:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Danh sách môn học, số tín chỉ.</li>
              <li>Điểm số các thành phần (Chuyên cần, Giữa kỳ, Cuối kỳ).</li>
              <li>Thời khóa biểu cá nhân.</li>
            </ul>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">3. MỤC ĐÍCH SỬ DỤNG DỮ LIỆU</h2>
          <p>Chúng tôi sử dụng thông tin của bạn cho các mục đích hợp pháp và cụ thể sau:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Định danh và Xác thực: Đảm bảo bạn là chủ sở hữu hợp pháp của tài khoản khi truy cập ứng dụng.</li>
            <li>
              Đồng bộ hóa dữ liệu: Giúp bạn có thể truy cập bảng điểm và kế hoạch học tập của
              mình từ nhiều thiết bị khác nhau (Điện thoại, Laptop) mà không bị mất dữ liệu.
            </li>
            <li>
              Cải thiện trải nghiệm: Phân tích (ẩn danh) để hiểu tính năng nào được sinh viên
              sử dụng nhiều nhất, từ đó nâng cấp ứng dụng.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">4. LƯU TRỮ VÀ BẢO VỆ DỮ LIỆU</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              Nơi lưu trữ: Dữ liệu định danh và học tập của bạn được lưu trữ an toàn trên nền
              tảng Supabase (Dịch vụ cơ sở dữ liệu đám mây uy tín hàng đầu).
            </li>
            <li>
              Bảo mật: Mọi dữ liệu truyền tải giữa thiết bị của bạn và máy chủ đều được mã hóa
              theo chuẩn SSL/TLS. Chúng tôi áp dụng các biện pháp kỹ thuật nghiêm ngặt (Row Level
              Security - RLS) để đảm bảo chỉ có BẠN mới có quyền xem và sửa dữ liệu của chính
              mình.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">5. CHIA SẺ DỮ LIỆU VỚI BÊN THỨ BA</h2>
          <p>
            Chúng tôi cam kết KHÔNG bán, trao đổi, hoặc cho thuê thông tin cá nhân của sinh viên
            cho bất kỳ bên thứ ba nào vì mục đích thương mại/quảng cáo. Dữ liệu chỉ được chia sẻ
            trong các trường hợp kỹ thuật bắt buộc:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Google: Để thực hiện quy trình đăng nhập (Authentication).</li>
            <li>Supabase: Để cung cấp hạ tầng lưu trữ cơ sở dữ liệu.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">6. QUYỀN CỦA NGƯỜI DÙNG (USER RIGHTS)</h2>
          <p>Bạn có toàn quyền đối với dữ liệu cá nhân của mình:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Quyền truy cập: Xem lại toàn bộ điểm số và thông tin đã lưu.</li>
            <li>Quyền chỉnh sửa: Cập nhật thông tin sai lệch.</li>
            <li>
              Quyền xóa bỏ (Right to be forgotten): Bạn có thể yêu cầu xóa vĩnh viễn tài khoản và
              toàn bộ dữ liệu học tập liên quan khỏi hệ thống của chúng tôi bất cứ lúc nào.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">7. LIÊN HỆ</h2>
          <p>
            Nếu có bất kỳ thắc mắc nào về Chính sách bảo mật này, hoặc muốn yêu cầu xóa dữ liệu,
            vui lòng liên hệ trực tiếp với Nhà phát triển:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Họ tên: Trần Quốc Hoàng</li>
            <li>Điện thoại: 0389342812</li>
            <li>Email: contact@hotrosinhvienhub.id.vn</li>
            <li>Đơn vị: Sinh viên Khoa Kinh tế Quốc tế - Đại học Ngân hàng TP.HCM (HUB).</li>
          </ul>
        </section>
      </div>
    </div>
  );
};
