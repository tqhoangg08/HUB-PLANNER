import React from 'react';

const VERSION = '2.1';
const UPDATED_AT = '11/06/2026';

const sections = [
  {
    id: 'section-1',
    title: 'Giới thiệu chung',
    content: [
      'Chính sách bảo mật này giải thích cách HUB Planner thu thập, sử dụng, lưu trữ, bảo vệ và xử lý dữ liệu của người dùng khi truy cập hoặc sử dụng website/ứng dụng.',
      'HUB Planner là dự án độc lập nhằm hỗ trợ sinh viên quản lý học tập, lịch học, điểm số, sự kiện, thông báo tham khảo, tìm đồ thất lạc, hồ sơ cá nhân và một số tiện ích hỗ trợ sinh viên khác. HUB Planner không phải website chính thức, hệ thống học vụ chính thức, cổng thông tin chính thức hoặc đại diện của Trường Đại học Ngân hàng TP.HCM.',
      'Bằng việc sử dụng HUB Planner, bạn xác nhận đã đọc, hiểu và đồng ý với Chính sách bảo mật này. Nếu bạn không đồng ý, vui lòng ngừng sử dụng dịch vụ.',
    ],
  },
  {
    id: 'section-2',
    title: 'Nguyên tắc bảo vệ dữ liệu',
    content: [
      'HUB Planner chỉ thu thập dữ liệu trong phạm vi cần thiết để cung cấp, duy trì, bảo vệ và cải thiện dịch vụ.',
      'HUB Planner không bán, cho thuê hoặc trao đổi dữ liệu cá nhân của người dùng cho bên thứ ba vì mục đích quảng cáo.',
      'HUB Planner hạn chế công khai thông tin cá nhân nếu người dùng chưa chủ động bật tính năng công khai, đồng thời cung cấp các lựa chọn để người dùng chỉnh sửa, xóa hoặc yêu cầu xử lý dữ liệu của mình trong phạm vi dịch vụ hỗ trợ.',
      'HUB Planner áp dụng các biện pháp hợp lý để bảo vệ dữ liệu khỏi truy cập, sử dụng, thay đổi, tiết lộ hoặc phá hủy trái phép.',
    ],
  },
  {
    id: 'section-3',
    title: 'Nhóm dữ liệu cá nhân cơ bản',
    content: [
      'Dữ liệu cá nhân cơ bản là các thông tin dùng để nhận diện, quản lý tài khoản, hiển thị hồ sơ hoặc liên hệ với người dùng trong phạm vi cần thiết.',
      'Nhóm này có thể bao gồm: họ tên hoặc tên hiển thị, email, ảnh đại diện, mã sinh viên, lớp, khóa, ngành/chuyên ngành, vai trò tài khoản, thông tin liên hệ do người dùng tự nhập khi gửi phản hồi, báo lỗi, báo cáo nội dung hoặc gửi thông tin tìm đồ thất lạc cho Ban quản trị.',
      'Một số thông tin hồ sơ như tên hiển thị, mã sinh viên, lớp, ảnh đại diện, mô tả cá nhân hoặc tag hồ sơ chỉ được hiển thị công khai khi người dùng chủ động bật hồ sơ công khai hoặc tự đăng nội dung trong khu vực có tính chất cộng đồng.',
    ],
  },
  {
    id: 'section-4',
    title: 'Nhóm dữ liệu cá nhân nhạy cảm hoặc cần bảo vệ chặt chẽ',
    content: [
      'Dữ liệu cá nhân nhạy cảm hoặc cần bảo vệ chặt chẽ là các dữ liệu có thể ảnh hưởng đến quyền riêng tư, kết quả học tập, thói quen sử dụng hoặc an toàn tài khoản của người dùng nếu bị truy cập hoặc sử dụng không đúng cách.',
      'Nhóm này bao gồm dữ liệu học tập cá nhân như điểm số, GPA, tín chỉ, môn học, học kỳ, trạng thái môn học, mục tiêu GPA, lịch học, lịch thi, kế hoạch học tập, tiến độ luyện tập và kết quả làm bài.',
      'Nhóm này cũng bao gồm lịch sử chat AI, câu hỏi gửi cho AI, phản hồi AI, đánh giá phản hồi AI, nội dung người dùng nhập vào công cụ AI và ngữ cảnh học tập được dùng để cá nhân hóa câu trả lời.',
      'Các thông tin về thói quen truy cập và sử dụng dịch vụ như thời điểm đăng nhập, thao tác cơ bản trong ứng dụng, tùy chọn cá nhân, thiết bị nhận thông báo, dữ liệu trình duyệt/thiết bị ở mức cần thiết để bảo mật và vận hành cũng được xem là dữ liệu cần bảo vệ chặt chẽ.',
      'Người dùng không nên nhập hoặc gửi các thông tin quá nhạy cảm, thông tin của người khác khi chưa được phép, mật khẩu, mã xác thực, giấy tờ tùy thân hoặc dữ liệu không cần thiết vào các ô chat AI, biểu mẫu phản hồi, tin tìm đồ hoặc khu vực nhập liệu khác.',
    ],
  },
  {
    id: 'section-5',
    title: 'Thông tin HUB Planner không chủ động thu thập',
    content: [
      'HUB Planner không chủ động yêu cầu hoặc thu thập mật khẩu Google, mật khẩu hệ thống học vụ/cổng thông tin chính thức của Nhà trường, mã OTP, khóa bảo mật riêng tư, dữ liệu tài chính nhạy cảm không cần thiết, giấy tờ tùy thân hoặc dữ liệu sinh trắc học.',
      'Nếu người dùng tự nhập các thông tin nhạy cảm không cần thiết vào biểu mẫu, nội dung chat, phản hồi, tin tìm đồ hoặc yêu cầu hỗ trợ, người dùng tự chịu trách nhiệm về nội dung đã cung cấp. HUB Planner có thể xóa, ẩn hoặc xử lý các nội dung này nếu phát hiện rủi ro về quyền riêng tư hoặc an toàn thông tin.',
    ],
  },
  {
    id: 'section-6',
    title: 'Mục đích sử dụng dữ liệu',
    content: [
      'HUB Planner sử dụng dữ liệu để tạo, xác thực và quản lý tài khoản người dùng; cung cấp các tính năng học tập, GPA, lịch học, lịch cá nhân, hồ sơ, tra cứu link thông báo, tham khảo sự kiện, tìm đồ thất lạc và phản hồi hỗ trợ.',
      'Dữ liệu cũng được sử dụng để đồng bộ thông tin giữa các lần sử dụng, gửi thông báo nếu người dùng bật nhận thông báo, xử lý báo cáo vi phạm, kiểm duyệt nội dung, chống spam, chống mạo danh, phát hiện truy cập bất thường, cải thiện chất lượng dịch vụ và tuân thủ yêu cầu pháp luật khi có căn cứ hợp lệ.',
      'Đối với các công cụ AI, dữ liệu chỉ được sử dụng để tạo câu trả lời, gợi ý học tập, tóm tắt, phân tích hoặc hỗ trợ người dùng trong phạm vi tính năng được cung cấp. Nội dung AI chỉ mang tính tham khảo và không phải kết luận chính thức.',
    ],
  },
  {
    id: 'section-7',
    title: 'Hồ sơ công khai và quyền kiểm soát của người dùng',
    content: [
      'Hồ sơ công khai là tính năng tùy chọn. Mặc định, HUB Planner không công khai hồ sơ cá nhân nếu người dùng chưa chủ động bật tùy chọn công khai.',
      'Khi bật hồ sơ công khai, một số thông tin có thể được hiển thị cho người dùng khác, ví dụ tên hiển thị, mã sinh viên, lớp, ảnh đại diện, mô tả cá nhân, tag hồ sơ và thống kê học tập nếu người dùng bật hiển thị thống kê.',
      'Người dùng có thể tắt hồ sơ công khai hoặc chỉnh sửa thông tin hiển thị bất cứ lúc nào trong phần cài đặt tài khoản. HUB Planner không khuyến khích công khai thông tin liên hệ cá nhân, địa chỉ, lịch trình riêng tư hoặc dữ liệu có thể gây rủi ro cho quyền riêng tư.',
    ],
  },
  {
    id: 'section-8',
    title: 'Nội dung cộng đồng và tìm đồ thất lạc',
    content: [
      'Khi sử dụng tính năng tìm đồ thất lạc hoặc gửi nội dung cộng đồng, người dùng có thể cung cấp tên vật phẩm, mô tả, khu vực, hình ảnh, thông tin liên hệ, trạng thái xử lý và các thông tin cần thiết khác.',
      'Người dùng chỉ nên đăng thông tin vừa đủ để xác minh và hỗ trợ tìm đồ; không đăng thông tin cá nhân nhạy cảm của bản thân hoặc người khác nếu không cần thiết; không đăng giấy tờ, mã số, hình ảnh hoặc thông tin có thể gây lộ dữ liệu cá nhân ở mức quá chi tiết.',
      'HUB Planner có quyền kiểm duyệt, ẩn, gỡ bỏ hoặc hạn chế nội dung nếu phát hiện dấu hiệu sai sự thật, mạo danh, lừa đảo, lộ thông tin cá nhân, yêu cầu thanh toán không minh bạch, quấy rối hoặc vi phạm pháp luật.',
      'Người dùng có thể gửi báo cáo hoặc yêu cầu gỡ nội dung. Các yêu cầu hợp lệ sẽ được rà soát và xử lý trong vòng 24 giờ kể từ khi tiếp nhận hợp lệ, tùy tính chất vụ việc.',
    ],
  },
  {
    id: 'section-9',
    title: 'Tra cứu thông báo, sự kiện và nguồn bên ngoài',
    content: [
      'HUB Planner có thể hỗ trợ người dùng tra cứu link thông báo từ nguồn chính thức hoặc tham khảo thông tin sự kiện, hoạt động, điểm rèn luyện dự kiến và link đăng ký.',
      'HUB Planner không phải nguồn thông báo chính thức và không đại diện cho Nhà trường hoặc đơn vị tổ chức sự kiện. Người dùng cần đối chiếu thông tin tại nguồn chính thức trước khi thực hiện các hành động quan trọng như đăng ký, nộp hồ sơ, tham gia sự kiện, tính điểm rèn luyện hoặc tuân thủ thời hạn.',
      'Các liên kết đến website, biểu mẫu, tài liệu, fanpage hoặc nền tảng bên thứ ba được cung cấp để tiện tra cứu. Khi truy cập các liên kết này, người dùng chịu sự điều chỉnh của chính sách riêng tư và điều khoản của bên thứ ba đó.',
    ],
  },
  {
    id: 'section-10',
    title: 'Nhà cung cấp AI và bên thứ ba',
    content: [
      'Để cung cấp một số tính năng, HUB Planner có thể sử dụng các bên thứ ba như nhà cung cấp đăng nhập, lưu trữ dữ liệu, hạ tầng vận hành, thông báo, email, thanh toán nếu có, chống spam, phân tích lỗi và nhà cung cấp AI.',
      'Đối với nhà cung cấp AI, HUB Planner chỉ gửi phần nội dung và ngữ cảnh cần thiết để thực hiện yêu cầu của người dùng, ví dụ câu hỏi, lịch sử hội thoại liên quan trong phạm vi cần thiết, thông tin học tập tổng quát hoặc dữ liệu học tập cần thiết để tạo gợi ý cá nhân hóa.',
      'HUB Planner không chủ động gửi mật khẩu, mã OTP, thông tin đăng nhập, khóa bảo mật, thông tin thanh toán nhạy cảm hoặc dữ liệu định danh không cần thiết cho nhà cung cấp AI.',
      'Nhà cung cấp AI có thể bao gồm Google Gemini, Groq hoặc các nhà cung cấp AI tương đương được HUB Planner sử dụng theo từng thời điểm. Việc sử dụng các nhà cung cấp này nhằm tạo phản hồi AI, gợi ý học tập, phân tích nội dung hoặc hỗ trợ tính năng mà người dùng yêu cầu.',
      'Người dùng cần hiểu rằng khi sử dụng tính năng AI, một phần nội dung do người dùng nhập và ngữ cảnh liên quan có thể được chuyển cho nhà cung cấp AI để xử lý. Người dùng không nên nhập dữ liệu quá nhạy cảm hoặc dữ liệu của người khác nếu không cần thiết.',
    ],
  },
  {
    id: 'section-11',
    title: 'Thông báo đẩy và tùy chọn nhận thông báo',
    content: [
      'Nếu người dùng bật nhận thông báo, HUB Planner có thể gửi thông báo liên quan đến học tập, lịch cá nhân, sự kiện, tìm đồ thất lạc, link thông báo từ nguồn chính thức, cập nhật hệ thống hoặc bảo mật.',
      'Người dùng có thể điều chỉnh hoặc tắt thông báo trong phần cài đặt của ứng dụng, trình duyệt hoặc thiết bị. Việc tắt thông báo có thể khiến người dùng không nhận được một số nhắc nhở hoặc cập nhật từ HUB Planner.',
    ],
  },
  {
    id: 'section-12',
    title: 'Lưu trữ và thời hạn xóa dữ liệu',
    content: [
      'HUB Planner lưu trữ dữ liệu trong thời gian cần thiết để cung cấp dịch vụ, duy trì tài khoản, hỗ trợ người dùng, đảm bảo an toàn hệ thống, xử lý báo cáo vi phạm và tuân thủ nghĩa vụ pháp luật nếu có.',
      'Khi người dùng nhấn “Xóa tài khoản” và hoàn tất xác nhận xóa tài khoản, HUB Planner sẽ bắt đầu quy trình xóa hoặc khử định danh dữ liệu cá nhân liên quan đến tài khoản đó.',
      'Dữ liệu cá nhân sẽ được xóa vĩnh viễn hoặc khử định danh trong thời hạn tối đa 30 ngày kể từ thời điểm người dùng hoàn tất thao tác “Xóa tài khoản”, trừ phần dữ liệu bắt buộc phải lưu lâu hơn để tuân thủ pháp luật, xử lý tranh chấp, chống gian lận, bảo vệ hệ thống hoặc chứng minh việc đã xử lý yêu cầu hợp lệ.',
      'Một số dữ liệu đã được công khai hoặc gửi cho bên thứ ba trước thời điểm xóa, ví dụ nội dung người dùng tự đăng trong khu vực cộng đồng hoặc dữ liệu đã được xử lý bởi nền tảng bên ngoài, có thể cần thêm thời gian hoặc phụ thuộc vào chính sách của bên thứ ba để được gỡ bỏ hoàn toàn.',
      'Nếu người dùng chỉ sử dụng chức năng reset hoặc xóa dữ liệu trong một tính năng cụ thể, phạm vi xóa chỉ áp dụng cho nhóm dữ liệu tương ứng, không đồng nghĩa với việc xóa toàn bộ tài khoản.',
    ],
  },
  {
    id: 'section-13',
    title: 'Sự cố rò rỉ hoặc xâm nhập dữ liệu',
    content: [
      'Nếu HUB Planner phát hiện hoặc có căn cứ hợp lý cho thấy đã xảy ra sự cố xâm nhập, mất mát, truy cập trái phép, rò rỉ hoặc lộ lọt dữ liệu cá nhân có khả năng ảnh hưởng đến người dùng, HUB Planner sẽ đánh giá mức độ ảnh hưởng và triển khai biện pháp khắc phục phù hợp.',
      'Trong trường hợp pháp luật yêu cầu hoặc sự cố có nguy cơ ảnh hưởng đáng kể đến quyền, lợi ích hợp pháp của người dùng, HUB Planner sẽ thông báo cho người dùng bị ảnh hưởng và cơ quan chức năng có thẩm quyền nếu cần, phù hợp với quy định của Luật An toàn thông tin mạng, Luật Bảo vệ dữ liệu cá nhân và các quy định pháp luật liên quan.',
      'Thông báo sự cố, nếu cần, sẽ nêu các thông tin phù hợp như loại dữ liệu có thể bị ảnh hưởng, thời điểm hoặc khoảng thời gian phát hiện, biện pháp HUB Planner đã hoặc đang thực hiện, khuyến nghị dành cho người dùng và kênh liên hệ hỗ trợ.',
      'HUB Planner đặt mục tiêu gửi thông báo ban đầu trong thời gian sớm nhất có thể sau khi xác nhận sự cố có căn cứ, đồng thời tiếp tục cập nhật nếu có thông tin mới hoặc yêu cầu từ cơ quan có thẩm quyền.',
    ],
  },
  {
    id: 'section-14',
    title: 'Quyền của người dùng',
    content: [
      'Trong phạm vi dịch vụ hỗ trợ và theo quy định pháp luật, người dùng có quyền xem, cập nhật, chỉnh sửa dữ liệu cá nhân; tắt hoặc bật hồ sơ công khai; điều chỉnh thông tin hiển thị công khai; tắt thông báo; xóa dữ liệu trong từng tính năng hoặc yêu cầu xóa tài khoản.',
      'Người dùng có thể yêu cầu hỗ trợ khi phát hiện dữ liệu sai lệch, gửi yêu cầu gỡ nội dung hoặc báo cáo nội dung xâm phạm quyền riêng tư.',
      'Một số yêu cầu xóa hoặc hạn chế dữ liệu có thể làm ảnh hưởng đến khả năng sử dụng một số tính năng của HUB Planner. Trong một số trường hợp, HUB Planner có thể cần giữ lại một phần thông tin nếu cần thiết để tuân thủ pháp luật, xử lý tranh chấp, bảo vệ hệ thống hoặc ngăn chặn hành vi vi phạm.',
    ],
  },
  {
    id: 'section-15',
    title: 'Bảo mật tài khoản và trách nhiệm của người dùng',
    content: [
      'HUB Planner áp dụng các biện pháp hợp lý nhằm bảo vệ dữ liệu, nhưng không có hệ thống nào an toàn tuyệt đối. Người dùng cũng có trách nhiệm bảo vệ tài khoản, thiết bị và thông tin đăng nhập của mình.',
      'Người dùng không nên chia sẻ tài khoản, mã xác thực hoặc thông tin đăng nhập cho người khác; cần đăng xuất sau khi sử dụng trên thiết bị công cộng hoặc thiết bị không thuộc sở hữu cá nhân; cần cẩn trọng với các link giả mạo, biểu mẫu giả mạo hoặc yêu cầu thanh toán không rõ nguồn gốc.',
      'Nếu nghi ngờ tài khoản bị truy cập trái phép hoặc dữ liệu bị sử dụng không đúng cách, người dùng nên liên hệ HUB Planner sớm để được hỗ trợ.',
    ],
  },
  {
    id: 'section-16',
    title: 'Donate, giao dịch và dịch vụ trả phí',
    content: [
      'Nếu HUB Planner có tính năng donate hoặc ủng hộ tự nguyện, thông tin người dùng cung cấp cho mục đích ghi nhận, phản hồi hoặc vinh danh có thể được xử lý theo lựa chọn của người dùng.',
      'Nếu trong tương lai HUB Planner cung cấp gói trả phí, thanh toán trực tuyến hoặc tính năng thương mại, các thông tin liên quan đến giao dịch sẽ chỉ được xử lý trong phạm vi cần thiết để xác nhận thanh toán, cung cấp quyền lợi, hỗ trợ người dùng, chống gian lận và tuân thủ quy định pháp luật.',
      'Người dùng chỉ nên thanh toán qua các kênh chính thức được HUB Planner công bố. HUB Planner không chịu trách nhiệm đối với giao dịch giả mạo hoặc thanh toán cho cá nhân/tổ chức không được công bố là kênh chính thức.',
    ],
  },
  {
    id: 'section-17',
    title: 'Thay đổi Chính sách bảo mật',
    content: [
      'HUB Planner có thể cập nhật Chính sách bảo mật này để phản ánh thay đổi về tính năng, cách vận hành, yêu cầu pháp luật hoặc nhu cầu bảo vệ người dùng.',
      'Phiên bản cập nhật sẽ được công bố trên website/ứng dụng và có hiệu lực kể từ ngày được ghi rõ, trừ khi có thông báo khác. Việc tiếp tục sử dụng HUB Planner sau khi Chính sách bảo mật được cập nhật đồng nghĩa với việc người dùng đồng ý với phiên bản mới.',
    ],
  },
  {
    id: 'section-18',
    title: 'Liên hệ',
    content: [
      'Nếu có câu hỏi, yêu cầu, khiếu nại hoặc phản hồi liên quan đến Chính sách bảo mật hoặc dữ liệu cá nhân, người dùng có thể liên hệ HUB Planner qua kênh liên hệ được công bố trên website/ứng dụng.',
      'HUB Planner sẽ nỗ lực phản hồi trong thời gian hợp lý và xử lý yêu cầu phù hợp với tính chất vụ việc, khả năng vận hành và quy định pháp luật hiện hành.',
    ],
  },
];

export const PrivacyPolicy: React.FC = () => {
  return (
    <div className="min-h-screen bg-white px-6 py-12 text-gray-900 sm:px-10">
      <div className="mx-auto w-full max-w-4xl space-y-10 text-justify text-base leading-relaxed">
        <header className="space-y-3 border-b border-gray-200 pb-6 text-center">
          <h1 className="text-2xl font-bold uppercase tracking-wide text-[#003375] sm:text-3xl">
            Chính sách bảo mật và quyền riêng tư
          </h1>
          <p className="text-sm italic text-gray-600">
            Phiên bản {VERSION} - Cập nhật lần cuối: {UPDATED_AT}
          </p>
        </header>

        <nav className="rounded-lg border border-gray-200 bg-gray-50 p-5">
          <h2 className="mb-4 border-b pb-2 text-sm font-semibold uppercase tracking-wide text-gray-600">
            Mục lục chính sách
          </h2>
          <ul className="grid gap-2 text-sm font-medium text-blue-600 sm:grid-cols-2">
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
              <h2 className="text-xl font-bold text-[#003375]">
                Điều {index + 1}. {section.title}
              </h2>
              {section.content.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}
        </div>

        <footer className="border-t border-gray-100 pt-10 text-center text-xs text-gray-400">
          <p>© 2026 HUB Planner. Cam kết bảo vệ dữ liệu sinh viên.</p>
        </footer>
      </div>
    </div>
  );
};
