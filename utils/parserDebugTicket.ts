import Swal from 'sweetalert2';

type ParserDebugKind = 'transcript' | 'schedule';

type ParserDebugTicketInput = {
  kind: ParserDebugKind;
  file: File;
  errorLogId?: string | null;
  parserMessage?: string;
  metadata?: Record<string, unknown>;
};

const alertClass = {
  container: 'hub-alert-container',
  popup: 'hub-alert-popup hub-pdf-guide-popup',
  icon: 'hub-alert-icon',
  title: 'hub-alert-title',
  htmlContainer: 'hub-alert-content hub-pdf-guide-content',
  actions: 'hub-alert-actions',
  confirmButton: 'hub-alert-confirm',
  closeButton: 'hub-alert-close',
};

export const promptSendParserDebugFile = async (input: ParserDebugTicketInput) => {
  const documentName = input.kind === 'transcript' ? 'bảng điểm' : 'thời khóa biểu';

  await Swal.fire({
    title: `Không đọc được file PDF ${documentName}`,
    icon: 'warning',
    html: `
      <div class="hub-pdf-guide">
        <p class="hub-pdf-guide-intro">
          File có thể được tạo bằng sai loại máy in PDF nên hệ thống không nhận diện được phần chữ.
          Vui lòng xuất lại từ HUB Portal theo đúng các bước sau:
        </p>
        <ol class="hub-pdf-guide-steps">
          <li>
            <span class="hub-pdf-guide-number">1</span>
            <span>Truy cập <a href="https://online.hub.edu.vn/" target="_blank" rel="noopener noreferrer">HUB Portal</a> → Đăng nhập → Vào mục <strong>"Xem điểm"</strong>.</span>
          </li>
          <li>
            <span class="hub-pdf-guide-number">2</span>
            <span>Bấm tổ hợp phím <strong>Ctrl + P</strong> hoặc nhấp chuột phải rồi chọn <strong>In</strong>.</span>
          </li>
          <li>
            <span class="hub-pdf-guide-number">3</span>
            <span>Tại hộp thoại in, ở mục Máy in hãy chọn <strong class="hub-pdf-guide-emphasis">Lưu dưới dạng PDF (Save as PDF)</strong>.</span>
          </li>
          <li>
            <span class="hub-pdf-guide-number">4</span>
            <span>Bấm <strong>Lưu</strong>.</span>
          </li>
          <li>
            <span class="hub-pdf-guide-number">5</span>
            <span>Lưu file vào vị trí bạn muốn, sau đó quay lại HUB Planner để tải lên lại.</span>
          </li>
        </ol>
        <div class="hub-pdf-guide-warning">
          <strong>Lưu ý quan trọng:</strong> Phải chọn <strong>Lưu dưới dạng PDF (Save as PDF)</strong>.
          Không chọn <strong>Microsoft Print to PDF</strong> vì loại file này có thể khiến hệ thống không nhận diện được nội dung chữ.
        </div>
      </div>
    `,
    confirmButtonText: 'Đã hiểu, tôi sẽ xuất lại',
    showCloseButton: true,
    buttonsStyling: false,
    customClass: alertClass,
    showClass: { popup: 'hub-alert-enter' },
    hideClass: { popup: 'hub-alert-leave' },
  });
};
