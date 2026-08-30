import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, BarChart3, Loader2, ShieldCheck, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  fetchCloudflareRankingSemesters,
  forecastCloudflareRankings,
  type CloudflareRankingForecastRow,
} from '../utils/benchmarkRankingsApi';
import { mapIdToDisplay } from '../utils/rankingData';

export const PublicRankings = () => {
  const [semesters, setSemesters] = useState<Array<{ semester: string; totalStudents: number }>>([]);
  const [selectedSemester, setSelectedSemester] = useState('');
  const [gpa, setGpa] = useState('3.2');
  const [credits, setCredits] = useState('18');
  const [trainingScore, setTrainingScore] = useState('80');
  const [major, setMajor] = useState('');
  const [result, setResult] = useState<CloudflareRankingForecastRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchCloudflareRankingSemesters()
      .then((rows) => {
        if (!active) return;
        setSemesters(rows);
        setSelectedSemester(rows[0]?.semester || '');
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Không thể tải danh sách học kỳ.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const rows = await forecastCloudflareRankings({
        semesters: [selectedSemester],
        gpa: Number(gpa),
        credits: Number(credits),
        trainingScore: Number(trainingScore),
        major: major.trim() || null,
      });
      setResult(rows[0] || null);
      if (!rows[0]) setError('Chưa có dữ liệu phù hợp để dự báo xếp hạng.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể dự báo xếp hạng lúc này.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-[#F8FAFC] px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm font-bold text-[#0052CC] hover:text-[#003375]">
            <ArrowLeft size={18} aria-hidden="true" />
            Về tổng quan
          </Link>
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
            <ShieldCheck size={15} aria-hidden="true" />
            Dữ liệu công khai từ D1
          </span>
        </div>

        <section className="overflow-hidden rounded-[28px] border border-[#E3E8F2] bg-white shadow-[0_18px_50px_rgba(13,27,62,0.08)]">
          <div className="bg-gradient-to-br from-[#003375] to-[#1557A5] px-6 py-7 text-white sm:px-9 sm:py-9">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
                <Trophy size={26} aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-blue-100">HUB Planner</p>
                <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">Dự báo xếp hạng công khai</h1>
                <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-blue-50">
                  Nhập dữ liệu tổng hợp để ước lượng thứ hạng. Biểu mẫu này không yêu cầu tài khoản và không lưu thông tin bạn nhập.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-6 p-5 sm:p-8 lg:grid-cols-[1fr_0.9fr]">
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block text-sm font-bold text-[#334155]">
                Học kỳ
                <select
                  value={selectedSemester}
                  onChange={(event) => setSelectedSemester(event.target.value)}
                  disabled={loading || semesters.length === 0}
                  className="mt-2 min-h-12 w-full rounded-2xl border border-[#D7E0EC] bg-[#F8FAFC] px-4 text-sm font-semibold text-[#0D1B3E] outline-none focus:border-[#1A56FF] focus:ring-2 focus:ring-[#1A56FF]/15 disabled:opacity-60"
                >
                  {semesters.map((row) => (
                    <option key={row.semester} value={row.semester}>
                      {mapIdToDisplay(row.semester)} · {row.totalStudents.toLocaleString('vi-VN')} sinh viên
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="text-sm font-bold text-[#334155]">
                  GPA hệ 4
                  <input type="number" min="0" max="4" step="0.01" required value={gpa} onChange={(event) => setGpa(event.target.value)} className="mt-2 min-h-12 w-full rounded-2xl border border-[#D7E0EC] bg-[#F8FAFC] px-4 text-sm font-semibold outline-none focus:border-[#1A56FF] focus:ring-2 focus:ring-[#1A56FF]/15" />
                </label>
                <label className="text-sm font-bold text-[#334155]">
                  Số tín chỉ
                  <input type="number" min="0" max="60" step="1" required value={credits} onChange={(event) => setCredits(event.target.value)} className="mt-2 min-h-12 w-full rounded-2xl border border-[#D7E0EC] bg-[#F8FAFC] px-4 text-sm font-semibold outline-none focus:border-[#1A56FF] focus:ring-2 focus:ring-[#1A56FF]/15" />
                </label>
                <label className="text-sm font-bold text-[#334155]">
                  Điểm ĐRL
                  <input type="number" min="0" max="100" step="1" required value={trainingScore} onChange={(event) => setTrainingScore(event.target.value)} className="mt-2 min-h-12 w-full rounded-2xl border border-[#D7E0EC] bg-[#F8FAFC] px-4 text-sm font-semibold outline-none focus:border-[#1A56FF] focus:ring-2 focus:ring-[#1A56FF]/15" />
                </label>
              </div>

              <label className="block text-sm font-bold text-[#334155]">
                Ngành học <span className="font-medium text-[#94A3B8]">(không bắt buộc)</span>
                <input value={major} onChange={(event) => setMajor(event.target.value)} maxLength={120} placeholder="Ví dụ: Công nghệ thông tin" className="mt-2 min-h-12 w-full rounded-2xl border border-[#D7E0EC] bg-[#F8FAFC] px-4 text-sm font-semibold outline-none placeholder:font-medium placeholder:text-[#94A3B8] focus:border-[#1A56FF] focus:ring-2 focus:ring-[#1A56FF]/15" />
              </label>

              <button type="submit" disabled={loading || !selectedSemester} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#0052CC] px-5 text-sm font-extrabold text-white transition hover:bg-[#003F9E] disabled:cursor-not-allowed disabled:opacity-60">
                {loading ? <Loader2 className="animate-spin" size={18} aria-hidden="true" /> : <BarChart3 size={18} aria-hidden="true" />}
                {loading ? 'Đang xử lý...' : 'Xem dự báo xếp hạng'}
              </button>
            </form>

            <aside className="flex min-h-64 flex-col justify-center rounded-3xl border border-[#E3E8F2] bg-[#F8FAFC] p-5 sm:p-6">
              {result ? (
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#64748B]">Kết quả dự báo</p>
                  <h2 className="mt-2 text-xl font-extrabold text-[#0D1B3E]">{mapIdToDisplay(result.semester)}</h2>
                  <div className="mt-5 rounded-2xl border border-blue-200 bg-white p-5 text-center">
                    <p className="text-sm font-bold text-[#64748B]">Toàn trường</p>
                    <p className="mt-1 text-3xl font-extrabold text-[#0052CC]">#{result.rank}</p>
                    <p className="mt-1 text-sm font-semibold text-[#64748B]">trên {result.totalStudents.toLocaleString('vi-VN')} sinh viên</p>
                  </div>
                  {result.rankInMajor && (
                    <p className="mt-4 text-center text-sm font-semibold text-[#334155]">
                      Trong ngành: #{result.rankInMajor} / {result.totalInMajor?.toLocaleString('vi-VN')}
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-center">
                  <BarChart3 className="mx-auto text-[#94A3B8]" size={38} aria-hidden="true" />
                  <h2 className="mt-3 text-lg font-extrabold text-[#0D1B3E]">Chưa có kết quả</h2>
                  <p className="mt-2 text-sm font-medium leading-6 text-[#64748B]">Chọn học kỳ và nhập các chỉ số ở bên trái để xem dự báo.</p>
                </div>
              )}
              {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
};

