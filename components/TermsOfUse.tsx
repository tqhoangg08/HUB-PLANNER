import React from 'react';

export const TermsOfUse: React.FC = () => {
  return (
    <div className="min-h-screen bg-white text-gray-900 px-6 sm:px-10 py-12 flex justify-center">
      <div className="w-full max-w-4xl space-y-10 text-base leading-relaxed">
        <header className="space-y-3 text-center border-b border-gray-200 pb-6">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-wide uppercase">
            ĐIỀU KHOẢN SỬ DỤNG DỊCH VỤ
          </h1>
          <p className="text-sm text-gray-600">Phiên bản 1.0 - Ngày hiệu lực: 17/01/2026</p>
        </header>

        <nav className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-600 mb-3">
            Mục lục
          </h2>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            <li>1. Giới thiệu</li>
            <li>2. Tuyên bố miễn trừ trách nhiệm</li>
            <li>3. Tài khoản và bảo mật</li>
            <li>4. Quyền sở hữu trí tuệ</li>
            <li>5. Giới hạn trách nhiệm</li>
            <li>6. Thay đổi điều khoản</li>
            <li>7. Liên hệ</li>
          </ul>
        </nav>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">1. GIỚI THIỆU</h2>
          <p>
            Chào mừng bạn truy cập và sử dụng ứng dụng HUB Planner (&quot;Dịch vụ&quot;). Bằng việc
            truy cập, đăng nhập và sử dụng ứng dụng này, bạn xác nhận rằng bạn đã đọc, hiểu và
            đồng ý tuân thủ toàn bộ các điều khoản dưới đây. Nếu bạn không đồng ý với bất kỳ
            điều khoản nào, vui lòng ngưng sử dụng dịch vụ ngay lập tức.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">2. TUYÊN BỐ MIỄN TRỪ TRÁCH NHIỆM (QUAN TRỌNG)</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>Tính không chính danh:</strong> HUB Planner là dự án phần mềm được phát triển
              bởi nhóm sinh viên, hoạt động độc lập và KHÔNG phải là sản phẩm chính thức hay đại
              diện cho Trường Đại học Ngân hàng TP.HCM (HUB).
            </li>
            <li>
              <strong>Độ chính xác của dữ liệu:</strong> Các tính năng tính toán điểm số (GPA, ĐRL)
              trên ứng dụng chỉ mang tính chất tham khảo. Mặc dù chúng tôi nỗ lực tối đa để đảm
              bảo thuật toán chính xác, nhưng kết quả có thể sai lệch so với hệ thống đào tạo
              chính thức do các thay đổi về quy chế. Sinh viên có trách nhiệm đối chiếu lại với
              Portal đào tạo của nhà trường trước khi đưa ra các quyết định quan trọng.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">3. TÀI KHOẢN VÀ BẢO MẬT</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>Bạn chịu trách nhiệm bảo mật thông tin tài khoản Google của mình.</li>
            <li>Bạn cam kết không sử dụng tài khoản của người khác hoặc cố tình mạo danh người khác trên hệ thống.</li>
            <li>
              Chúng tôi có quyền khóa vĩnh viễn các tài khoản có dấu hiệu tấn công hệ thống, spam
              dữ liệu hoặc vi phạm pháp luật.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">4. QUYỀN SỞ HỮU TRÍ TUỆ</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>Mã nguồn, giao diện và logo của HUB Planner thuộc quyền sở hữu của đội ngũ phát triển.</li>
            <li>
              Bạn không được phép sao chép, chỉnh sửa, đảo ngược mã nguồn (reverse engineer) hoặc
              sử dụng thương hiệu HUB Planner cho mục đích thương mại khi chưa có sự đồng ý bằng
              văn bản.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">5. GIỚI HẠN TRÁCH NHIỆM</h2>
          <p>
            Trong mọi trường hợp, đội ngũ phát triển HUB Planner sẽ không chịu trách nhiệm pháp
            lý cho bất kỳ thiệt hại nào (bao gồm nhưng không giới hạn: mất dữ liệu, sai sót trong
            tính điểm dẫn đến học lại/mất học bổng...) phát sinh từ việc sử dụng hoặc không thể
            sử dụng dịch vụ của chúng tôi.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">6. THAY ĐỔI ĐIỀU KHOẢN</h2>
          <p>
            Chúng tôi bảo lưu quyền sửa đổi, bổ sung các điều khoản này bất cứ lúc nào. Các thay
            đổi sẽ có hiệu lực ngay khi được đăng tải trên website. Việc bạn tiếp tục sử dụng
            dịch vụ sau khi có thay đổi đồng nghĩa với việc bạn chấp nhận các điều khoản mới.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">7. LIÊN HỆ</h2>
          <p>Mọi ý kiến đóng góp hoặc thắc mắc về điều khoản sử dụng, vui lòng liên hệ:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Họ tên: Trần Quốc Hoàng</li>
            <li>Điện thoại: 0389342812</li>
            <li>Email: tqhoangg2@gmail.com</li>
            <li>Đơn vị: Sinh viên Khoa Kinh tế Quốc tế - Đại học Ngân hàng TP.HCM (HUB).</li>
            <li>Địa chỉ: Thôn Bắc Kinh, xã Đông Kinh, tỉnh Hà Tĩnh</li>
          </ul>
        </section>
      </div>
    </div>
  );
};
