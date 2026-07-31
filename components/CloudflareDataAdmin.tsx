import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BellRing,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import {
  classifySyncFreshness,
  fetchCloudflareHealth,
  type CloudflareHealthResult,
  type SyncFreshness,
} from '../utils/cloudflareAdminApi';

const RESOURCE_CARDS = [
  {
    key: 'school_announcements',
    label: 'Thông báo trường',
    description: 'Danh sách thông báo công khai trên trang tổng quan.',
    route: '/dashboard',
    icon: BellRing,
    staleAfterMinutes: 150,
    cadence: 'Mỗi giờ',
  },
  {
    key: 'course_schedules',
    label: 'Môn học & thời khóa biểu',
    description: 'Danh mục môn và dữ liệu phục vụ tra cứu lịch học.',
    route: '/schedule',
    icon: BookOpen,
    staleAfterMinutes: 150,
    cadence: 'Mỗi giờ',
  },
  {
    key: 'events',
    label: 'Sự kiện ĐRL',
    description: 'Sự kiện đang hiển thị cho sinh viên.',
    route: '/events',
    icon: CalendarDays,
    staleAfterMinutes: 30,
    cadence: 'Mỗi 10 phút',
  },
  {
    key: 'lost_found_items',
    label: 'Đồ thất lạc',
    description: 'Tin báo mất và tin nhặt được đã công khai.',
    route: '/lost-found',
    icon: Search,
    staleAfterMinutes: 20,
    cadence: 'Mỗi 5 phút',
  },
] as const;

const formatTimestamp = (value: string | null | undefined) => {
  if (!value) return 'Chưa có dữ liệu';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Không xác định';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(parsed);
};

const freshnessPresentation: Record<
  SyncFreshness,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  healthy: {
    label: 'Đồng bộ tốt',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    icon: CheckCircle2,
  },
  stale: {
    label: 'Cần kiểm tra',
    className: 'bg-amber-50 text-amber-700 border-amber-100',
    icon: Clock3,
  },
  missing: {
    label: 'Chưa có dữ liệu',
    className: 'bg-rose-50 text-rose-700 border-rose-100',
    icon: AlertTriangle,
  },
};

export const CloudflareDataAdmin: React.FC = () => {
  const [result, setResult] = useState<CloudflareHealthResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadHealth = useCallback(async (force = false) => {
    setLoading(true);
    setError('');
    try {
      setResult(await fetchCloudflareHealth({ force }));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Không thể đọc trạng thái Cloudflare.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  const summary = useMemo(() => {
    const resources = result?.snapshot.resources || {};
    const states = RESOURCE_CARDS.map((card) =>
      classifySyncFreshness(
        resources[card.key]?.synced_at,
        card.staleAfterMinutes
      )
    );
    return {
      healthy: states.filter((state) => state === 'healthy').length,
      totalRows: RESOURCE_CARDS.reduce(
        (total, card) =>
          total + Number(resources[card.key]?.source_row_count || 0),
        0
      ),
    };
  }, [result]);

  return (
    <div className="min-h-full bg-[#F8FAFC] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-gradient-to-br from-[#082B66] via-[#0B438F] to-[#1664F5] px-5 py-6 text-white sm:px-7">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-blue-100">
                  <Database size={16} />
                  HUB Planner Data Center
                </div>
                <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
                  Trung tâm dữ liệu
                </h1>
                <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-blue-100">
                  Theo dõi dữ liệu Cloudflare và mở đúng màn hình quản lý mà
                  không cần vào Dashboard Cloudflare.
                </p>
              </div>

              <button
                type="button"
                onClick={() => void loadHealth(true)}
                disabled={loading}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 text-sm font-black text-white backdrop-blur transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
                Làm mới thủ công
              </button>
            </div>
          </div>

          <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-6">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                Nhóm hoạt động tốt
              </p>
              <p className="mt-2 text-2xl font-black text-[#0D1B3E]">
                {summary.healthy}/{RESOURCE_CARDS.length}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                Tổng bản ghi nguồn
              </p>
              <p className="mt-2 text-2xl font-black text-[#0D1B3E]">
                {summary.totalRows.toLocaleString('vi-VN')}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                Lần kiểm tra
              </p>
              <p className="mt-2 text-sm font-black text-[#0D1B3E]">
                {result ? formatTimestamp(new Date(result.checkedAt).toISOString()) : 'Đang tải...'}
              </p>
              {result && (
                <p className="mt-1 text-[11px] font-semibold text-slate-500">
                  {result.stale
                    ? 'Đang hiển thị cache cũ do API tạm thời gián đoạn'
                    : result.fromCache
                      ? 'Dùng cache phiên làm việc'
                      : 'Đọc trực tiếp từ Cloudflare'}
                </p>
              )}
            </div>
          </div>
        </section>

        {error && (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
            <AlertTriangle className="mt-0.5 shrink-0" size={18} />
            <div>
              <p className="font-black">Không đọc được trạng thái hệ thống</p>
              <p className="mt-1">{error}</p>
            </div>
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-2">
          {RESOURCE_CARDS.map((card) => {
            const resource = result?.snapshot.resources[card.key];
            const freshness = classifySyncFreshness(
              resource?.synced_at,
              card.staleAfterMinutes
            );
            const presentation = freshnessPresentation[freshness];
            const StatusIcon = presentation.icon;
            const CardIcon = card.icon;

            return (
              <article
                key={card.key}
                className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[#1664F5]">
                      <CardIcon size={21} />
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-black text-[#0D1B3E]">
                        {card.label}
                      </h2>
                      <p className="mt-0.5 text-xs font-semibold text-slate-500">
                        Chu kỳ: {card.cadence}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black ${presentation.className}`}
                  >
                    <StatusIcon size={13} />
                    {presentation.label}
                  </span>
                </div>

                <p className="mt-4 min-h-10 text-sm font-medium leading-5 text-slate-600">
                  {card.description}
                </p>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      Bản ghi nguồn
                    </p>
                    <p className="mt-1 text-lg font-black text-[#0D1B3E]">
                      {Number(resource?.source_row_count || 0).toLocaleString('vi-VN')}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      Đang hiển thị
                    </p>
                    <p className="mt-1 text-lg font-black text-[#0D1B3E]">
                      {Number(resource?.visible_row_count || 0).toLocaleString('vi-VN')}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <Clock3 size={14} />
                    {formatTimestamp(resource?.synced_at)}
                  </div>
                  <Link
                    to={card.route}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0D1B3E] px-3 py-2 text-xs font-black text-white transition hover:bg-[#1664F5]"
                  >
                    Mở quản lý
                    <ExternalLink size={13} />
                  </Link>
                </div>
              </article>
            );
          })}
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-base font-black text-[#0D1B3E]">
              <ShieldCheck size={19} className="text-emerald-600" />
              Nguyên tắc an toàn hiện tại
            </h2>
            <div className="mt-4 space-y-3 text-sm font-medium leading-6 text-slate-600">
              <p>
                Trang này chỉ đọc số liệu tổng hợp công khai từ endpoint{' '}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-bold text-slate-700">
                  /health
                </code>
                , không tải toàn bộ bảng.
              </p>
              <p>
                Không có API key, token quản trị hoặc khóa Cloudflare nào được
                đưa xuống trình duyệt.
              </p>
              <p>
                Hệ thống không tự polling. Kết quả được giữ trong phiên 5 phút;
                chỉ nút “Làm mới thủ công” mới tạo yêu cầu mới.
              </p>
            </div>
          </div>

          <div className="rounded-3xl border border-blue-100 bg-blue-50 p-5">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-blue-500">
              Tiến độ chuyển đổi
            </p>
            <h2 className="mt-2 text-lg font-black text-[#0D1B3E]">
              Đọc công khai: 4/4 nhóm
            </h2>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
              Bước kế tiếp là lớp xác thực Cloudflare cho API ghi. Sau khi lớp
              này hoàn tất, các nút thêm/sửa/xóa mới được chuyển sang D1 mà
              không làm lộ bí mật quản trị.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default CloudflareDataAdmin;

