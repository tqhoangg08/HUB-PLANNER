import { showAlert, showConfirm } from './appNotifications';
import {
  createPendingSupportAttachments,
  linkSupportMessageAttachments,
  uploadSupportAttachments,
} from './supportAttachmentsApi';
import { createSupportTicket, SupportTicketCategory } from './supportTicketsApi';

type ParserDebugKind = 'transcript' | 'schedule';

type ParserDebugTicketInput = {
  kind: ParserDebugKind;
  file: File;
  errorLogId?: string | null;
  parserMessage?: string;
  metadata?: Record<string, unknown>;
};

const DEBUG_COPY: Record<ParserDebugKind, {
  category: SupportTicketCategory;
  subject: string;
  body: string;
}> = {
  transcript: {
    category: 'grades',
    subject: 'Lỗi import bảng điểm',
    body: 'Em gặp lỗi khi import bảng điểm. Nhờ admin kiểm tra giúp.',
  },
  schedule: {
    category: 'schedule',
    subject: 'Lỗi import lịch học',
    body: 'Em gặp lỗi khi import lịch học. Nhờ admin kiểm tra giúp.',
  },
};

const buildDebugMetadata = (input: ParserDebugTicketInput) => ({
  source: 'parser_debug_file',
  parser_kind: input.kind,
  related_error_log_id: input.errorLogId || null,
  parser_message: input.parserMessage || null,
  file_name: input.file.name,
  file_size: input.file.size,
  file_type: input.file.type,
  ...(input.metadata || {}),
});

export const promptSendParserDebugFile = async (input: ParserDebugTicketInput) => {
  const confirmed = await showConfirm({
    variant: 'question',
    title: 'Không đọc được file PDF này',
    message: [
      'Có thể file là ảnh scan hoặc định dạng khác.',
      '',
      'Bạn có muốn gửi file này cho admin kiểm tra không?',
    ].join('\n'),
    confirmText: 'Gửi file cho admin',
    cancelText: 'Không gửi',
  });

  if (!confirmed) return;

  const copy = DEBUG_COPY[input.kind];
  const metadata = buildDebugMetadata(input);

  try {
    const ticket = await createSupportTicket({
      subject: copy.subject,
      category: copy.category,
      priority: 'normal',
      message: copy.body,
      metadata,
    }) as Awaited<ReturnType<typeof createSupportTicket>> & { initial_message_id?: string };

    if (!ticket.initial_message_id) throw new Error('Không tìm thấy tin nhắn đầu tiên của ticket.');

    const pending = createPendingSupportAttachments([input.file]);
    const uploaded = await uploadSupportAttachments(ticket.id, pending, undefined, metadata);
    await linkSupportMessageAttachments(ticket.id, ticket.initial_message_id, uploaded.map((item) => item.id));
    pending.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });

    window.location.assign(`/support/${ticket.id}`);
  } catch (error: any) {
    await showAlert({
      variant: 'error',
      title: 'Không gửi được file',
      message: error?.message || 'Không thể tạo ticket hỗ trợ lúc này. Vui lòng thử lại sau.',
    });
  }
};
