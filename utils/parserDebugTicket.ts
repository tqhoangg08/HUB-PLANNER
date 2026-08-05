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

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

export const promptSendParserDebugFile = async (input: ParserDebugTicketInput) => {
  const documentName = input.kind === 'transcript' ? 'bảng điểm' : 'thời khóa biểu';
  const parserMessage = input.parserMessage?.trim() || '';
  const textExtractionFailed = /không trích xuất được|không nhận diện được phần chữ|ảnh scan|text.{0,12}không/i.test(parserMessage);
  const portalSection = input.kind === 'transcript'
    ? '<strong>"Xem điểm"</strong>'
    : '<strong>"Thời khóa biểu - Lịch thi"</strong>, chọn năm học và học kỳ rồi bấm <strong>"In thời khóa biểu"</strong>';
  const printInstruction = input.kind === 'transcript'
    ? 'Bấm tổ hợp phím <strong>Ctrl + P</strong> hoặc nhấp chuột phải rồi chọn <strong>In</strong>.'
    : 'Mở bản thời khóa biểu cần nhập và dùng nút <strong>"In thời khóa biểu"</strong> của HUB Portal.';

  const extractionGuide = `
    <div class="hub-pdf-guide">
      <p class="hub-pdf-guide-intro">
        Hệ thống không trích xuất được phần chữ trong file. Vui lòng xuất lại từ HUB Portal theo đúng các bước sau:
      </p>
      <ol class="hub-pdf-guide-steps">
        <li>
          <span class="hub-pdf-guide-number">1</span>
          <span>Truy cập <a href="https://online.hub.edu.vn/" target="_blank" rel="noopener noreferrer">HUB Portal</a> → Đăng nhập → Vào mục ${portalSection}.</span>
        </li>
        <li>
          <span class="hub-pdf-guide-number">2</span>
          <span>${printInstruction}</span>
        </li>
        <li>
          <span class="hub-pdf-guide-number">3</span>
          <span>Tại hộp thoại in, ở mục Máy in hãy chọn <strong class="hub-pdf-guide-emphasis">Lưu dưới dạng PDF (Save as PDF)</strong>.</span>
        </li>
        <li><span class="hub-pdf-guide-number">4</span><span>Bấm <strong>Lưu</strong>.</span></li>
        <li><span class="hub-pdf-guide-number">5</span><span>Lưu file vào vị trí bạn muốn, sau đó quay lại HUB Planner để tải lên lại.</span></li>
      </ol>
      <div class="hub-pdf-guide-warning">
        <strong>Lưu ý quan trọng:</strong> Phải chọn <strong>Lưu dưới dạng PDF (Save as PDF)</strong>.
        Không chọn <strong>Microsoft Print to PDF</strong> vì loại file này có thể khiến hệ thống không nhận diện được nội dung chữ.
      </div>
    </div>
  `;

  const parserFailure = `
    <div class="hub-pdf-guide">
      <p class="hub-pdf-guide-intro">
        File PDF có phần chữ hợp lệ, nhưng hệ thống chưa nhận diện được bố cục hoặc dịch vụ phân tích đang tạm thời gặp lỗi.
        <strong>Bạn không cần xuất lại file.</strong> Hãy thử nhập lại sau ít phút.
      </p>
      ${parserMessage ? `<div class="hub-pdf-guide-warning"><strong>Chi tiết:</strong> ${escapeHtml(parserMessage)}</div>` : ''}
    </div>
  `;

  await Swal.fire({
    title: textExtractionFailed
      ? `Không đọc được phần chữ trong PDF ${documentName}`
      : `Chưa thể phân tích PDF ${documentName}`,
    icon: 'warning',
    html: textExtractionFailed ? extractionGuide : parserFailure,
    confirmButtonText: textExtractionFailed ? 'Đã hiểu, tôi sẽ xuất lại' : 'Đã hiểu',
    showCloseButton: true,
    buttonsStyling: false,
    customClass: alertClass,
    showClass: { popup: 'hub-alert-enter' },
    hideClass: { popup: 'hub-alert-leave' },
  });
};
