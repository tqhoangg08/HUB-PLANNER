import React from 'react';

const UPDATED_AT = '10/06/2026';
const VERSION = '1.2';

const sections = [
  {
    id: 'dieu-1',
    title: 'Chấp nhận điều khoản',
    content: [
      'Chào mừng bạn đến với HUB Planner. Khi truy cập, đăng ký tài khoản hoặc sử dụng bất kỳ tính năng nào của website/ứng dụng, bạn xác nhận đã đọc, hiểu và đồng ý tuân thủ Điều khoản sử dụng này.',
      'Nếu bạn không đồng ý với bất kỳ nội dung nào, vui lòng ngừng sử dụng dịch vụ. Việc tiếp tục sử dụng HUB Planner sau khi Điều khoản được cập nhật được xem là bạn đã đồng ý với phiên bản mới nhất.',
    ],
  },
  {
    id: 'dieu-2',
    title: 'Giới thiệu dịch vụ',
    content: [
      'HUB Planner là một dự án độc lập nhằm hỗ trợ sinh viên quản lý học tập, tổ chức thông tin cá nhân, tra cứu tiện ích, tham khảo sự kiện và sử dụng một số công cụ hỗ trợ sinh viên.',
      'HUB Planner không phải website chính thức, cổng thông tin chính thức, hệ thống học vụ chính thức, kênh thông báo chính thức hoặc đại diện của Trường Đại học Ngân hàng TP.HCM. Người dùng cần đối chiếu mọi thông tin quan trọng với nguồn chính thức của Nhà trường hoặc đơn vị tổ chức liên quan.',
    ],
  },
  {
    id: 'dieu-3',
    title: 'Phạm vi và mục đích sử dụng',
    content: [
      'HUB Planner được cung cấp nhằm hỗ trợ học tập và sinh hoạt sinh viên, bao gồm quản lý điểm số, GPA, học kỳ, thời khóa biểu, lộ trình học tập, tra cứu link thông báo từ nguồn chính thức, tham khảo sự kiện, tìm đồ thất lạc, hồ sơ cá nhân công khai theo lựa chọn của người dùng và các công cụ hỗ trợ khác.',
      'Các tính năng trên chỉ mang tính hỗ trợ. HUB Planner không thay thế hệ thống chính thức của Nhà trường, cố vấn học tập, phòng ban chức năng, đơn vị tổ chức sự kiện hoặc bất kỳ cơ quan có thẩm quyền nào.',
    ],
  },
  {
    id: 'dieu-4',
    title: 'Tính độc lập và không đại diện',
    content: [
      'HUB Planner là dự án độc lập, không trực thuộc, không được vận hành bởi, không đại diện cho và không phát ngôn thay mặt Trường Đại học Ngân hàng TP.HCM hoặc bất kỳ đơn vị, phòng ban, câu lạc bộ, tổ chức nào nếu không có xác nhận rõ ràng bằng văn bản.',
      'Việc HUB Planner nhắc đến tên trường, tên sự kiện, tên đơn vị tổ chức, thông báo, link hoặc thông tin liên quan đến sinh viên chỉ nhằm mục đích hỗ trợ tra cứu và tổ chức thông tin. Điều này không tạo ra quan hệ đại diện, bảo trợ, hợp tác chính thức hoặc xác nhận từ các bên được nhắc đến.',
    ],
  },
  {
    id: 'dieu-5',
    title: 'Tài khoản người dùng',
    content: [
      'Một số tính năng có thể yêu cầu người dùng đăng nhập. Người dùng có trách nhiệm cung cấp thông tin chính xác, bảo mật tài khoản của mình và chịu trách nhiệm đối với mọi hoạt động phát sinh từ tài khoản đó.',
      'Người dùng không được sử dụng tài khoản của người khác, giả mạo danh tính, sử dụng thông tin sai lệch hoặc thực hiện hành vi gây nhầm lẫn về tư cách cá nhân, tổ chức, cán bộ, giảng viên, đại diện Nhà trường hoặc ban quản trị HUB Planner.',
      'HUB Planner có quyền tạm khóa, hạn chế hoặc chấm dứt quyền truy cập của tài khoản nếu phát hiện hành vi vi phạm Điều khoản, gây ảnh hưởng đến người dùng khác hoặc có dấu hiệu vi phạm pháp luật.',
    ],
  },
  {
    id: 'dieu-6',
    title: 'Thông tin học tập và dữ liệu cá nhân',
    content: [
      'Các công cụ tính GPA, quản lý học kỳ, lịch học, kế hoạch học tập hoặc dữ liệu tương tự được cung cấp để người dùng tự nhập, lưu trữ, tham khảo và quản lý cá nhân.',
      'Kết quả tính toán, thống kê, dự báo hoặc gợi ý có thể phụ thuộc vào dữ liệu do người dùng nhập và cách hệ thống xử lý tại từng thời điểm. Người dùng cần tự kiểm tra lại trước khi sử dụng các kết quả này cho các quyết định quan trọng.',
      'HUB Planner không cam kết rằng mọi kết quả tính toán hoặc hiển thị luôn chính xác tuyệt đối, đầy đủ hoặc phù hợp với quy định học vụ mới nhất. Khi có khác biệt, dữ liệu từ hệ thống chính thức của Nhà trường hoặc văn bản/quy định chính thức sẽ được ưu tiên.',
    ],
  },
  {
    id: 'dieu-7',
    title: 'Tra cứu thông báo từ nguồn chính thức',
    content: [
      'Tính năng tra cứu thông báo chỉ nhằm hỗ trợ người dùng tìm và mở link dẫn về nguồn chính thức hoặc nguồn gốc liên quan. HUB Planner không phải cổng thông báo chính thức của Nhà trường.',
      'HUB Planner không thay thế việc theo dõi website, email, hệ thống học vụ, fanpage, văn bản hoặc kênh chính thức của Nhà trường. Người dùng có trách nhiệm đối chiếu lại nội dung, thời hạn, yêu cầu và hướng dẫn tại nguồn chính thức trước khi thực hiện bất kỳ hành động nào.',
      'HUB Planner không chịu trách nhiệm đối với thiệt hại phát sinh do người dùng chỉ dựa vào thông tin hiển thị trên HUB Planner mà không kiểm tra lại nguồn chính thức.',
    ],
  },
  {
    id: 'dieu-8',
    title: 'Sự kiện và điểm rèn luyện',
    content: [
      'Thông tin sự kiện được cung cấp nhằm hỗ trợ sinh viên tham khảo, lọc và mở link đăng ký. Thông tin có thể bao gồm tên sự kiện, đơn vị tổ chức, thời gian, hạn đăng ký, hình thức, nhóm điểm rèn luyện dự kiến hoặc các thông tin tóm tắt khác.',
      'HUB Planner không phải đơn vị tổ chức sự kiện, không xác nhận quyền tham gia, không đảm bảo số điểm rèn luyện, không quyết định việc ghi nhận điểm và không chịu trách nhiệm thay cho đơn vị tổ chức.',
      'Người dùng cần kiểm tra kỹ thông tin tại link đăng ký, thông báo chính thức hoặc đơn vị tổ chức trước khi tham gia. Nếu phát hiện thông tin sai lệch, người dùng có thể sử dụng chức năng báo lỗi để ban quản trị rà soát.',
    ],
  },
  {
    id: 'dieu-9',
    title: 'Tìm đồ thất lạc',
    content: [
      'Tính năng tìm đồ thất lạc được cung cấp để hỗ trợ sinh viên gửi thông tin báo mất, nhặt được đồ hoặc yêu cầu cập nhật trạng thái cho Ban quản trị. Người dùng chỉ gửi thông tin/yêu cầu qua biểu mẫu; nội dung chỉ có thể được hiển thị công khai sau khi Ban quản trị hoặc auditor tiếp nhận, kiểm duyệt và đăng/cập nhật dưới tư cách quản trị.',
      'Người dùng không được yêu cầu chuyển khoản trước, đặt cọc, thu phí bất hợp lý hoặc lợi dụng việc trả lại đồ để trục lợi. Mọi giao dịch, liên hệ hoặc gặp mặt ngoài hệ thống là trách nhiệm của các bên liên quan.',
      'HUB Planner có thể kiểm duyệt, ẩn, chỉnh sửa trạng thái hoặc gỡ bỏ thông tin hiển thị nếu thông tin có dấu hiệu sai sự thật, mạo danh, lừa đảo, lộ thông tin cá nhân, vi phạm pháp luật hoặc vi phạm Điều khoản.',
      'Người dùng gửi thông tin được gắn quyền liên quan đến nội dung đó và có thể gửi yêu cầu sửa, cập nhật trạng thái hoặc xóa/gỡ. Các yêu cầu hợp lệ sẽ được Ban quản trị/auditor rà soát và thực hiện trong vòng 24 giờ kể từ khi tiếp nhận hợp lệ, tùy tính chất và mức độ vi phạm.',
    ],
  },
  {
    id: 'dieu-10',
    title: 'Hồ sơ công khai',
    content: [
      'Hồ sơ công khai là tính năng tùy chọn. Thông tin như tên hiển thị, mã sinh viên, lớp, ảnh đại diện, mô tả cá nhân, tag hồ sơ hoặc thống kê học tập chỉ được hiển thị công khai khi người dùng chủ động bật tính năng này.',
      'Mặc định, HUB Planner không công khai hồ sơ cá nhân nếu người dùng chưa bật tùy chọn công khai. Người dùng có thể tắt công khai hồ sơ hoặc điều chỉnh thông tin hiển thị bất cứ lúc nào trong phần cài đặt tài khoản.',
      'Người dùng chịu trách nhiệm đối với thông tin tự nguyện công khai. Không được sử dụng hồ sơ công khai để mạo danh, quấy rối, xúc phạm, đăng thông tin sai lệch hoặc xâm phạm quyền riêng tư của người khác.',
    ],
  },
  {
    id: 'dieu-11',
    title: 'Công cụ AI và nội dung gợi ý',
    content: [
      'Một số tính năng AI, nếu được cung cấp, chỉ nhằm hỗ trợ học tập, gợi ý, tóm tắt hoặc tư vấn tham khảo. Nội dung do AI tạo ra có thể không chính xác, không đầy đủ hoặc không phù hợp với từng trường hợp cụ thể.',
      'Người dùng không nên xem nội dung AI là căn cứ chính thức cho các quyết định học vụ, pháp lý, tài chính, y tế hoặc các quyết định quan trọng khác. Người dùng cần tự kiểm chứng thông tin với nguồn đáng tin cậy hoặc cơ quan có thẩm quyền.',
      'HUB Planner có quyền giới hạn, thay đổi hoặc tạm ngừng tính năng AI nếu cần thiết để đảm bảo an toàn, bảo mật, tuân thủ quy định hoặc chất lượng dịch vụ.',
    ],
  },
  {
    id: 'dieu-12',
    title: 'Nội dung người dùng đăng tải',
    content: [
      'Người dùng chịu trách nhiệm đối với mọi nội dung mình nhập, đăng, gửi, phản hồi hoặc chia sẻ trên HUB Planner, bao gồm thông tin hồ sơ, tin tìm đồ, báo cáo lỗi, góp ý, nội dung phản hồi hoặc dữ liệu nhập vào hệ thống.',
      'Người dùng không được đăng tải nội dung vi phạm pháp luật Việt Nam, xâm phạm quyền riêng tư, danh dự, uy tín hoặc quyền lợi hợp pháp của người khác; mạo danh cá nhân, tổ chức, Nhà trường, cán bộ, giảng viên hoặc ban quản trị; chứa thông tin sai sự thật, gây hiểu nhầm, kích động, xúc phạm, đe dọa hoặc quấy rối.',
      'Người dùng không được đăng tải nội dung lừa đảo, spam, quảng cáo trái phép, yêu cầu thanh toán không minh bạch, mã độc, hành vi phá hoại hoặc nội dung sử dụng thương hiệu, hình ảnh, tài liệu của bên thứ ba khi chưa có quyền phù hợp.',
      'HUB Planner có quyền từ chối, ẩn, gỡ bỏ hoặc hạn chế hiển thị nội dung vi phạm mà không cần thông báo trước trong trường hợp cần thiết.',
    ],
  },
  {
    id: 'dieu-13',
    title: 'Báo cáo vi phạm và gỡ nội dung',
    content: [
      'Nếu người dùng phát hiện nội dung vi phạm, sai lệch, mạo danh, xâm phạm quyền riêng tư hoặc có dấu hiệu gây hại, người dùng có thể gửi báo cáo thông qua chức năng có sẵn hoặc kênh liên hệ của HUB Planner.',
      'Báo cáo nên cung cấp thông tin cụ thể, bao gồm nội dung cần báo cáo, lý do, bằng chứng nếu có và thông tin liên hệ để ban quản trị phản hồi khi cần.',
      'Đối với yêu cầu hợp lệ liên quan đến nội dung vi phạm, HUB Planner sẽ rà soát và thực hiện biện pháp phù hợp, bao gồm cảnh báo, ẩn, gỡ bỏ, chỉnh sửa trạng thái, hạn chế tài khoản hoặc chuyển thông tin cho cơ quan có thẩm quyền khi cần thiết. Thời hạn xử lý mục tiêu là trong vòng 24 giờ kể từ khi tiếp nhận yêu cầu hợp lệ.',
    ],
  },
  {
    id: 'dieu-14',
    title: 'Liên kết bên thứ ba',
    content: [
      'HUB Planner có thể chứa liên kết đến website, biểu mẫu, tài liệu, fanpage hoặc nền tảng của bên thứ ba. Các liên kết này được cung cấp để tiện tra cứu và không đồng nghĩa với việc HUB Planner kiểm soát, xác nhận hoặc chịu trách nhiệm đối với nội dung, chính sách, độ chính xác hoặc hoạt động của bên thứ ba.',
      'Người dùng tự chịu trách nhiệm khi truy cập, đăng ký, cung cấp thông tin hoặc thực hiện giao dịch trên các nền tảng bên ngoài HUB Planner.',
    ],
  },
  {
    id: 'dieu-15',
    title: 'Quyền sở hữu trí tuệ',
    content: [
      'Giao diện, tên gọi, cấu trúc, nội dung tự tạo, thiết kế, biểu tượng và các thành phần do HUB Planner phát triển thuộc quyền sở hữu hoặc quyền sử dụng hợp pháp của HUB Planner, trừ trường hợp có ghi chú khác.',
      'Người dùng không được sao chép, khai thác, phân phối, chỉnh sửa, thương mại hóa hoặc sử dụng các thành phần của HUB Planner cho mục đích trái phép nếu chưa có sự đồng ý phù hợp.',
      'Đối với nội dung do người dùng đăng tải, người dùng vẫn chịu trách nhiệm và giữ các quyền hợp pháp của mình. Tuy nhiên, người dùng cho phép HUB Planner lưu trữ, hiển thị, xử lý và sử dụng nội dung đó trong phạm vi cần thiết để vận hành dịch vụ.',
    ],
  },
  {
    id: 'dieu-16',
    title: 'Dịch vụ trả phí, donate và giao dịch',
    content: [
      'Nếu HUB Planner chỉ cung cấp các tiện ích miễn phí hoặc hình thức ủng hộ tự nguyện, việc ủng hộ không tạo ra quyền sở hữu, quyền kiểm soát, cam kết dịch vụ bắt buộc hoặc nghĩa vụ cung cấp tính năng riêng nếu không được công bố rõ.',
      'Nếu trong tương lai HUB Planner cung cấp gói trả phí, dịch vụ Premium, thanh toán trực tuyến hoặc tính năng thương mại, các điều khoản thanh toán, hoàn tiền, quyền lợi, thời hạn sử dụng và nghĩa vụ liên quan sẽ được công bố rõ trước khi người dùng thanh toán.',
      'Người dùng chỉ nên thực hiện thanh toán qua các kênh chính thức được HUB Planner công bố. HUB Planner không chịu trách nhiệm đối với giao dịch giả mạo hoặc thanh toán cho cá nhân/tổ chức không được công bố là kênh chính thức.',
    ],
  },
  {
    id: 'dieu-17',
    title: 'Bảo mật và quyền riêng tư',
    content: [
      'HUB Planner tôn trọng quyền riêng tư của người dùng và chỉ xử lý dữ liệu trong phạm vi cần thiết để cung cấp, duy trì, cải thiện và bảo vệ dịch vụ.',
      'Người dùng không được cố gắng truy cập trái phép vào dữ liệu của người khác, khai thác lỗi hệ thống, vượt quyền, thu thập dữ liệu hàng loạt, dò quét, phá hoại hoặc thực hiện hành vi gây ảnh hưởng đến an toàn hệ thống.',
      'Các nội dung liên quan đến thu thập, lưu trữ, sử dụng và bảo vệ dữ liệu cá nhân được quy định chi tiết hơn trong Chính sách bảo mật của HUB Planner.',
    ],
  },
  {
    id: 'dieu-18',
    title: 'Giới hạn trách nhiệm',
    content: [
      'HUB Planner được cung cấp trên cơ sở như hiện có và trong phạm vi có thể. HUB Planner nỗ lực duy trì tính ổn định, chính xác và an toàn của dịch vụ nhưng không cam kết rằng dịch vụ luôn không lỗi, không gián đoạn, không mất dữ liệu hoặc luôn phù hợp với mọi nhu cầu của người dùng.',
      'Trong phạm vi pháp luật cho phép, HUB Planner không chịu trách nhiệm đối với thiệt hại gián tiếp, ngẫu nhiên, phát sinh, mất cơ hội, mất dữ liệu, sai lệch quyết định học tập hoặc hậu quả từ việc người dùng không kiểm chứng thông tin với nguồn chính thức.',
      'Không nội dung nào trên HUB Planner được hiểu là tư vấn pháp lý, tư vấn học vụ chính thức, xác nhận điểm rèn luyện, xác nhận quyền lợi sinh viên hoặc quyết định hành chính/học vụ.',
    ],
  },
  {
    id: 'dieu-19',
    title: 'Thay đổi, tạm ngừng hoặc chấm dứt dịch vụ',
    content: [
      'HUB Planner có thể thay đổi, bổ sung, tạm ngừng hoặc chấm dứt một phần hoặc toàn bộ dịch vụ để bảo trì, nâng cấp, bảo mật, tuân thủ quy định hoặc vì lý do vận hành.',
      'HUB Planner có thể cập nhật Điều khoản sử dụng theo thời gian. Phiên bản mới sẽ có hiệu lực kể từ khi được đăng tải hoặc từ ngày được ghi rõ. Việc tiếp tục sử dụng dịch vụ sau khi điều khoản được cập nhật đồng nghĩa với việc người dùng đồng ý với phiên bản mới.',
    ],
  },
  {
    id: 'dieu-20',
    title: 'Liên hệ và điều khoản chung',
    content: [
      'Nếu có câu hỏi, phản hồi, khiếu nại, yêu cầu hỗ trợ hoặc yêu cầu gỡ nội dung, người dùng có thể liên hệ HUB Planner qua kênh liên hệ được công bố trên website/ứng dụng.',
      'Nếu một phần của Điều khoản sử dụng này bị xem là không hợp lệ hoặc không thể thực thi, các phần còn lại vẫn tiếp tục có hiệu lực trong phạm vi pháp luật cho phép.',
      'Điều khoản sử dụng này được điều chỉnh theo pháp luật Việt Nam. Các tranh chấp phát sinh, nếu không thể giải quyết thông qua trao đổi thiện chí, sẽ được xử lý theo quy định pháp luật có thẩm quyền tại Việt Nam.',
    ],
  },
];

export const TermsOfUse: React.FC = () => {
  return (
    <div className="min-h-screen bg-white px-6 py-12 text-gray-900 sm:px-10">
      <div className="mx-auto w-full max-w-4xl space-y-10 text-justify text-base leading-relaxed">
        <header className="space-y-3 border-b border-gray-200 pb-6 text-center">
          <h1 className="text-2xl font-bold uppercase tracking-wide text-[#003375] sm:text-3xl">
            ĐIỀU KHOẢN SỬ DỤNG DỊCH VỤ
          </h1>
          <p className="text-sm italic text-gray-600">Phiên bản {VERSION} - Ngày cập nhật: {UPDATED_AT}</p>
        </header>

        <nav className="rounded-lg border border-gray-200 bg-gray-50 p-5">
          <h2 className="mb-4 border-b pb-2 text-sm font-semibold uppercase tracking-wide text-gray-600">
            Mục lục nội dung
          </h2>
          <ul className="grid gap-x-8 gap-y-2 text-sm font-medium text-blue-600 sm:grid-cols-2">
            {sections.map((section, index) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="hover:underline">
                  Điều {index + 1}. {section.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-9">
          {sections.map((section, index) => (
            <section key={section.id} id={section.id} className="scroll-mt-20 space-y-3">
              <h2 className="text-xl font-bold uppercase text-[#003375]">
                Điều {index + 1}. {section.title}
              </h2>
              {section.content.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}
        </div>

        <footer className="border-t border-gray-100 pt-10 text-center text-xs text-gray-400">
          <p>© 2026 HUB Planner. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
};
