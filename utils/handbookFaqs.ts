export type HandbookFaqItem = {
  q: string;
  a: string;
};

export type HandbookFaqGroup = {
  group: string;
  items: HandbookFaqItem[];
};

export const HANDBOOK_FAQS: HandbookFaqGroup[] = [
  {
    group: 'Nhập điểm & bảng điểm',
    items: [
      {
        q: 'Làm sao để nhập điểm thủ công?',
        a: 'Vào Tổng quan trên desktop hoặc Học tập trên mobile, thêm học kỳ/môn học rồi nhập tín chỉ và các cột điểm. HUB Planner sẽ tự tính điểm tổng kết, điểm chữ, GPA hệ 4 và GPA hệ 10 theo từng học kỳ và toàn khóa.',
      },
      {
        q: 'Làm sao nhập bảng điểm tự động từ Portal trường?',
        a: 'Vào Hub Portal, mở mục Xem điểm, dùng chức năng In hoặc Ctrl + P để lưu trang thành file PDF. Quay lại HUB Planner, bấm Nhập PDF, xác thực bảo mật rồi chọn file. Hệ thống sẽ đọc tên môn, tín chỉ, điểm và sắp xếp lại theo học kỳ.',
      },
      {
        q: 'File PDF bảng điểm cần chuẩn bị như thế nào?',
        a: 'Nên dùng file PDF gốc được lưu trực tiếp từ Portal, không dùng ảnh chụp màn hình hoặc file scan. Nếu bảng điểm có nhiều trang, cứ giữ nguyên một file PDF đầy đủ để hệ thống đọc đủ môn.',
      },
      {
        q: 'Tại sao upload PDF nhưng không hiện môn hoặc điểm?',
        a: 'Thường là do file không phải PDF gốc, Portal đổi cấu trúc hiển thị, hoặc file thiếu trang bảng điểm. Hãy thử xuất lại PDF từ mục Xem điểm. Nếu vẫn lỗi, vào Cẩm nang > Góp ý và gửi mô tả lỗi kèm thời điểm xảy ra để team kiểm tra parser.',
      },
      {
        q: 'Có xuất lại bảng điểm từ HUB Planner được không?',
        a: 'Có. Ở màn hình học tập, bạn có thể dùng nút xuất PDF để tạo bản tổng hợp bảng điểm từ dữ liệu đang có trong HUB Planner. File này phục vụ theo dõi cá nhân, không thay thế bảng điểm chính thức của trường.',
      },
    ],
  },
  {
    group: 'Dashboard, GPA & xếp hạng',
    items: [
      {
        q: 'HUB Planner tính GPA hệ 4 và hệ 10 như thế nào?',
        a: 'Điểm môn được tính từ các cột chuyên cần, quá trình, giữa kỳ và cuối kỳ theo trọng số hiện tại trong hệ thống. Sau đó app quy đổi sang điểm chữ và hệ 4, rồi tính trung bình có trọng số theo tín chỉ. Các môn đánh dấu không tính GPA sẽ được bỏ qua.',
      },
      {
        q: 'Vì sao GPA trên app khác file Excel mình tự tính?',
        a: 'Hãy kiểm tra lại tín chỉ, môn không tính GPA, điểm thành phần và cách làm tròn. HUB Planner tính theo tín chỉ từng môn và bảng quy đổi hệ 4 của app, nên kết quả có thể khác nếu bạn lấy trung bình đơn giản hoặc dùng bảng quy đổi khác.',
      },
      {
        q: 'Mục tiêu GPA dùng để làm gì?',
        a: 'Mục tiêu GPA giúp dashboard ước lượng bạn cần giữ mức điểm khoảng bao nhiêu ở các môn/kỳ còn lại để đạt mục tiêu đã đặt. Đây là công cụ định hướng học tập, không phải cam kết kết quả chính thức.',
      },
      {
        q: 'Tính năng xếp hạng dự báo có chính xác tuyệt đối không?',
        a: 'Không. Xếp hạng là dữ liệu tham khảo dựa trên bộ dữ liệu xếp hạng/benchmark hiện có, GPA, tín chỉ, điểm rèn luyện và học kỳ được chọn. Khi dữ liệu trường hoặc mẫu benchmark thay đổi, kết quả có thể lệch và chỉ nên dùng để ước lượng học bổng hoặc vị trí tương đối.',
      },
      {
        q: 'Vì sao xếp hạng báo chưa có dữ liệu?',
        a: 'Có thể học kỳ, ngành, lớp hoặc khóa của bạn chưa khớp với dữ liệu benchmark trong hệ thống. Hãy kiểm tra thông tin cá nhân, chọn đúng học kỳ và đảm bảo bảng điểm đã có GPA/tín chỉ hợp lệ.',
      },
    ],
  },
  {
    group: 'Thời khóa biểu & tiện ích',
    items: [
      {
        q: 'Làm sao nhập thời khóa biểu bằng PDF?',
        a: 'Vào Thời khóa biểu, chọn nhập TKB bằng PDF. Trên Portal, mở mục Thời khóa biểu - Lịch thi, chọn năm học/học kỳ rồi In thời khóa biểu và lưu thành PDF. Sau khi xác thực bảo mật, upload file để hệ thống đồng bộ môn vào lịch của bạn.',
      },
      {
        q: 'Nhập TKB xong dữ liệu được lưu ở đâu?',
        a: 'Bạn cần đăng nhập để nhập TKB. App sẽ liên kết các môn trong file với tài khoản của bạn trong bảng lịch cá nhân. Nếu môn chưa có trong cơ sở dữ liệu lịch, hệ thống có thể tạo môn từ thông tin đọc được trong PDF rồi gắn vào lịch của bạn.',
      },
      {
        q: 'Tại sao TKB PDF không đọc được?',
        a: 'Hãy dùng file PDF gốc từ nút In thời khóa biểu của Portal, không dùng ảnh chụp hoặc file đã chỉnh sửa quá nhiều. Nếu file vẫn lỗi, gửi phản hồi ở Cẩm nang > Góp ý để team kiểm tra mẫu PDF mới.',
      },
      {
        q: 'Mất đồ trong trường thì gửi thông tin ở đâu?',
        a: 'Vào mục Tìm đồ thất lạc, gửi thông tin cho Ban quản trị và mô tả rõ loại đồ, màu sắc, khu vực, thời gian mất/nhặt được. Thông tin chỉ hiển thị công khai sau khi Ban quản trị/auditor tiếp nhận và kiểm duyệt.',
      },
      {
        q: 'Làm sao cài HUB Planner như app trên điện thoại hoặc máy tính?',
        a: 'Bấm nút Tải App trên thanh điều hướng. Trên Chrome/Edge/Android, trình duyệt sẽ hiện hộp thoại cài đặt nếu thiết bị hỗ trợ. Trên iPhone/iPad, app sẽ hướng dẫn thêm vào màn hình chính qua nút Chia sẻ.',
      },
    ],
  },
  {
    group: 'Tài khoản, dữ liệu & AI',
    items: [
      {
        q: 'Web có lưu mật khẩu Portal của mình không?',
        a: 'Không. HUB Planner không lưu mật khẩu Portal. Các tính năng nhập PDF hoạt động bằng file bạn tự xuất từ Portal rồi tải lên app, không yêu cầu app giữ mật khẩu Portal của bạn.',
      },
      {
        q: 'Tại sao tải lại trang hoặc đổi máy thì dữ liệu bị mất?',
        a: 'Nếu dùng chế độ khách, dữ liệu học tập được lưu trên trình duyệt hiện tại. Khi dùng tab ẩn danh, xóa cache hoặc đổi thiết bị, dữ liệu có thể mất. Hãy đăng nhập để hệ thống đồng bộ dữ liệu học tập lên tài khoản của bạn.',
      },
      {
        q: 'AI Cố vấn sử dụng dữ liệu nào để trả lời?',
        a: 'Sau khi bạn đồng ý điều khoản AI, trợ lý sẽ gửi câu hỏi kèm ngữ cảnh học tập như tên, ngành, khóa, GPA, môn nợ và mục tiêu GPA đến API AI của HUB Planner. AI chỉ dùng để tư vấn tham khảo, không thay thế cố vấn học tập chính thức.',
      },
      {
        q: 'Có thể xem lại lịch sử chat AI không?',
        a: 'Có. Trợ lý lưu lại các phiên chat, câu hỏi, câu trả lời và trạng thái đánh giá hữu ích để bạn xem lại hoặc để hệ thống cải thiện chất lượng hỗ trợ.',
      },
      {
        q: 'Mình nên hỏi AI những gì?',
        a: 'Bạn có thể hỏi cách cải thiện GPA, môn nào cần ưu tiên, mục tiêu GPA có khả thi không, hoặc nhờ AI giải thích tình trạng học tập hiện tại dựa trên bảng điểm đã nhập.',
      },
    ],
  },
  {
    group: 'Hỗ trợ, góp ý & Turnitin',
    items: [
      {
        q: 'Muốn báo lỗi kỹ thuật hoặc góp ý tính năng thì làm sao?',
        a: 'Vào Cẩm nang > Góp ý, chọn Báo lỗi kỹ thuật hoặc Đóng góp ý tưởng, nhập nội dung và thông tin liên hệ nếu muốn team phản hồi. Form có xác thực bảo mật trước khi gửi để hạn chế spam.',
      },
      {
        q: 'Trang check đạo văn Turnitin dùng để làm gì?',
        a: 'Đây là trang hướng dẫn dịch vụ hỗ trợ kiểm tra mức độ trùng lặp nội dung bằng Turnitin. Nếu cần check đạo văn cho tiểu luận, báo cáo hoặc khóa luận, liên hệ Zalo 0389342812 để gửi file và nhận kết quả.',
      },
      {
        q: 'Turnitin là gì?',
        a: 'Turnitin là công cụ kiểm tra mức độ tương đồng của tài liệu với nhiều nguồn tham chiếu học thuật và nội dung trực tuyến. Kết quả giúp bạn phát hiện phần trùng lặp để chỉnh sửa trích dẫn, diễn đạt và hoàn thiện bài trước khi nộp.',
      },
      {
        q: 'HUB Planner có phải hệ thống chính thức của trường không?',
        a: 'Không. HUB Planner là dự án hỗ trợ sinh viên, không đại diện cho trường. Các dữ liệu học vụ, điểm, lịch và thông báo quan trọng vẫn cần đối chiếu với nguồn chính thức của HUB.',
      },
    ],
  },
];
