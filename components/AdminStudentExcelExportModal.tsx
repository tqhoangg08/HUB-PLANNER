import React, { useEffect, useMemo, useState } from 'react';
import { CalendarRange, ChevronDown, FileSpreadsheet, GraduationCap, KeyRound, Loader2, Mail, X } from 'lucide-react';
import { Semester } from '../types';
import { calculateCumulativeStats } from '../utils/calculations';
import {
    AdminStudentExcelRow,
    exportAdminStudentListToExcel
} from '../utils/excelExport';
import { fetchStaffProfileExportPage } from '../utils/staffProfilesApi';
import { fetchAdminExcelExportRows, requestAdminExcelOtp } from '../utils/adminExportApi';
import { ACADEMIC_PROGRAMS, getMajors } from '../utils/programs';

interface AdminStudentExcelExportModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface FilterOptions {
    cohorts: string[];
    majors: string[];
}

const PAGE_SIZE = 500;
const FILTER_CACHE_KEY = 'hub_admin_excel_filter_options_v3';
const FILTER_CACHE_TTL = 10 * 60 * 1000;

const cleanText = (value: unknown) => String(value || '').trim().replace(/\s+/g, ' ');

const textKey = (value: unknown) => cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLocaleLowerCase('vi')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const normalizeCohort = (value: unknown) => {
    const raw = cleanText(value).toUpperCase();
    if (!raw) return '';

    const compact = raw.replace(/[^A-ZĐ0-9]/g, '');
    const programMatch = compact.match(/^([A-ZĐ]+K)0*(\d{1,3})$/);
    if (programMatch && programMatch[1] !== 'K') {
        return `${programMatch[1]}${Number(programMatch[2])}`;
    }

    const standardMatch = raw.match(/^K\s*0*(\d{1,3})(?=$|[\s,;_/-])/);
    if (standardMatch) return `K${Number(standardMatch[1])}`;
    return raw;
};

const EMPTY_MAJOR_KEYS = new Set([
    '',
    'khong co thong tin',
    'chua cap nhat',
    'khong ro',
    'n a',
    'none',
]);

const normalizeMajor = (value: unknown) => {
    const raw = cleanText(value);
    const key = textKey(raw);
    if (EMPTY_MAJOR_KEYS.has(key)) return '';
    if (key === 'khoa hoc du') return 'Khoa học dữ liệu';
    return raw;
};

const optionKey = (value: unknown) => textKey(value);

const resolveOnboardingMajor = (row: {
    cohort?: unknown;
    program_name?: unknown;
    major_name?: unknown;
    specialization_name?: unknown;
}) => {
    const cohort = normalizeCohort(row.cohort);
    const programKey = optionKey(row.program_name);
    const selectedProgram = ACADEMIC_PROGRAMS.find(program => (
        optionKey(program.id) === programKey || optionKey(program.name) === programKey
    ));
    const candidates = selectedProgram
        ? getMajors(selectedProgram.id, cohort)
        : ACADEMIC_PROGRAMS.flatMap(program => getMajors(program.id, cohort));

    // specializationName is written by onboarding and was never overwritten by the
    // transcript importer, so it is the strongest source for the parent major.
    const specializationKey = optionKey(row.specialization_name);
    if (specializationKey) {
        const parentMajor = candidates.find(candidate => (
            candidate.specializations.some(specialization => optionKey(specialization.name) === specializationKey)
        ));
        if (parentMajor) return parentMajor.name;
    }

    const majorKey = optionKey(row.major_name);
    const savedMajor = candidates.find(candidate => optionKey(candidate.name) === majorKey);
    return savedMajor?.name || '';
};

const getAcademicYear = (semester: Semester) => {
    const nameMatch = String(semester?.name || '').match(/(\d{4}-\d{4})/);
    if (nameMatch) return nameMatch[1];
    const idMatch = String(semester?.id || '').match(/(\d{4})[_-](\d{4})/);
    return idMatch ? `${idMatch[1]}-${idMatch[2]}` : '';
};

const matchesSemester = (semester: Semester, semesterFilter: string) => {
    if (semesterFilter === 'all') return true;
    const name = String(semester?.name || '').toLocaleLowerCase('vi');
    const id = String(semester?.id || '').toLocaleLowerCase('vi');
    if (semesterFilter === 'summer') return /hè|he|summer/.test(name);
    return new RegExp(`học kỳ\\s*${semesterFilter}(?:\\D|$)`, 'i').test(name)
        || new RegExp(`hoc ky\\s*${semesterFilter}(?:\\D|$)`, 'i').test(name)
        || id.includes(`hk${semesterFilter}`);
};

const deriveNameFromEmail = (email?: string | null) => {
    const localPart = String(email || '').split('@')[0].trim();
    if (!localPart || /^\d+$/.test(localPart)) return '';
    return localPart
        .split(/[._-]+/)
        .filter(Boolean)
        .map(part => part.charAt(0).toLocaleUpperCase('vi') + part.slice(1))
        .join(' ');
};

const averageTrainingScore = (semesters: Semester[]) => {
    const scores = semesters
        .map(semester => semester.trainingScore)
        .filter((score): score is number => typeof score === 'number' && Number.isFinite(score));
    if (scores.length === 0) return null;
    return Number((scores.reduce((total, score) => total + score, 0) / scores.length).toFixed(1));
};

const fetchAllFilterOptions = async (): Promise<FilterOptions> => {
    try {
        const cached = JSON.parse(sessionStorage.getItem(FILTER_CACHE_KEY) || 'null');
        if (cached?.savedAt && Date.now() - cached.savedAt < FILTER_CACHE_TTL) {
            return {
                cohorts: Array.isArray(cached.cohorts) ? cached.cohorts : [],
                majors: Array.isArray(cached.majors) ? cached.majors : []
            };
        }
    } catch {
        sessionStorage.removeItem(FILTER_CACHE_KEY);
    }

    const cohorts = new Set<string>();
    const majors = new Map<string, string>();

    for (let from = 0; ; from += PAGE_SIZE) {
        const data = await fetchStaffProfileExportPage(from, PAGE_SIZE);

        (data || []).forEach((row: any) => {
            const cohort = normalizeCohort(row.cohort);
            const major = normalizeMajor(resolveOnboardingMajor(row));
            if (cohort) cohorts.add(cohort);
            if (major) {
                const key = optionKey(major);
                const current = majors.get(key);
                const hasNaturalCase = major !== major.toLocaleUpperCase('vi');
                if (!current || (hasNaturalCase && current === current.toLocaleUpperCase('vi'))) {
                    majors.set(key, major);
                }
            }
        });
        if (!data || data.length < PAGE_SIZE) break;
    }

    const result = {
        cohorts: Array.from(cohorts).sort((a, b) => a.localeCompare(b, 'vi')),
        majors: Array.from(majors.values()).sort((a, b) => a.localeCompare(b, 'vi'))
    };
    try {
        sessionStorage.setItem(FILTER_CACHE_KEY, JSON.stringify({ ...result, savedAt: Date.now() }));
    } catch {
        // Bộ nhớ đệm chỉ giúp giảm request, không ảnh hưởng chức năng xuất.
    }
    return result;
};

export const AdminStudentExcelExportModal: React.FC<AdminStudentExcelExportModalProps> = ({
    isOpen,
    onClose
}) => {
    const [academicYear, setAcademicYear] = useState('all');
    const [semesterFilter, setSemesterFilter] = useState('all');
    const [cohort, setCohort] = useState('all');
    const [major, setMajor] = useState('all');
    const [filterOptions, setFilterOptions] = useState<FilterOptions>({ cohorts: [], majors: [] });
    const [loadingOptions, setLoadingOptions] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [sendingOtp, setSendingOtp] = useState(false);
    const [otpRequested, setOtpRequested] = useState(false);
    const [otp, setOtp] = useState('');
    const [statusText, setStatusText] = useState('');
    const [noticeText, setNoticeText] = useState('');
    const [errorText, setErrorText] = useState('');

    const academicYears = useMemo(() => {
        const now = new Date();
        const currentStartYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
        return Array.from({ length: 10 }, (_, index) => {
            const start = currentStartYear - index;
            return `${start}-${start + 1}`;
        });
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        setErrorText('');
        setNoticeText('');
        setOtpRequested(false);
        setOtp('');
        setLoadingOptions(true);
        fetchAllFilterOptions()
            .then(setFilterOptions)
            .catch(error => {
                console.error('Không thể tải bộ lọc xuất Excel:', error);
                setErrorText('Không thể tải đầy đủ danh sách khóa và ngành. Bạn vẫn có thể xuất với bộ lọc hiện có.');
            })
            .finally(() => setLoadingOptions(false));
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !exporting && !sendingOtp) onClose();
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, exporting, sendingOtp, onClose]);

    if (!isOpen) return null;

    const selectedYearLabel = academicYear === 'all' ? 'Tất cả năm học' : academicYear;
    const semesterLabels: Record<string, string> = {
        all: 'Tất cả học kỳ',
        '1': 'Học kỳ 1',
        '2': 'Học kỳ 2',
        '3': 'Học kỳ 3',
        summer: 'Học kỳ Hè'
    };
    const selectedCohortLabel = cohort === 'all' ? 'Tất cả khóa' : cohort;
    const selectedMajorLabel = major === 'all' ? 'Tất cả ngành' : major;

    const handleSendOtp = async () => {
        setSendingOtp(true);
        setErrorText('');
        setNoticeText('');
        try {
            await requestAdminExcelOtp();
            setOtpRequested(true);
            setOtp('');
            setNoticeText('Nếu tài khoản được phép, mã OTP đã được gửi đến email của phiên đăng nhập.');
        } catch (error: any) {
            setErrorText(error?.message || 'Không thể gửi mã OTP. Vui lòng thử lại.');
        } finally {
            setSendingOtp(false);
        }
    };

    const handleExport = async () => {
        if (!otpRequested) {
            await handleSendOtp();
            return;
        }
        if (otp.length !== 6) {
            setErrorText('Vui lòng nhập đủ mã OTP gồm 6 chữ số.');
            return;
        }

        setExporting(true);
        setErrorText('');
        setNoticeText('');
        setStatusText('Đang xác thực mã OTP...');

        try {
            setOtpRequested(false);
            setOtp('');

            setStatusText('Đang tải dữ liệu sinh viên...');
            const exportResult = await fetchAdminExcelExportRows(otp);
            const privateRows = (exportResult.rows || []).filter((row: any) => {
                const matchesCohort = cohort === 'all' || normalizeCohort(row.cohort) === cohort;
                const matchesMajor = major === 'all' || optionKey(resolveOnboardingMajor(row)) === optionKey(major);
                return matchesCohort && matchesMajor;
            });

            setStatusText('Đang ghép họ tên, MSSV và lớp...');
            const profilesMap = new Map<string, any>();
            privateRows.forEach((row: any) => profilesMap.set(row.user_id, {
                id: row.user_id,
                student_code: row.student_code,
                full_name: row.full_name,
                class_name: row.class_name,
            }));

            setStatusText('Đang tính điểm theo bộ lọc...');
            const canonicalMajorLabels = new Map(
                filterOptions.majors.map(label => [optionKey(label), label])
            );
            const excelRows: AdminStudentExcelRow[] = privateRows.flatMap(row => {
                const allSemesters = Array.isArray(row.semesters) ? row.semesters as Semester[] : [];
                const selectedSemesters = allSemesters
                    .filter(semester => {
                        const matchYear = academicYear === 'all' || getAcademicYear(semester) === academicYear;
                        return matchYear && matchesSemester(semester, semesterFilter);
                    })
                    .map(semester => ({
                        ...semester,
                        subjects: Array.isArray(semester.subjects) ? semester.subjects : []
                    }));
                const hasSelectedData = selectedSemesters.some(semester => (
                    (Array.isArray(semester.subjects) && semester.subjects.length > 0)
                    || semester.trainingScore !== null
                ));
                if (!hasSelectedData) return [];

                const stats = calculateCumulativeStats(selectedSemesters);
                const profile = profilesMap.get(row.user_id) || {};
                const fullName = String(
                    profile.full_name
                    || row.student_name
                    || deriveNameFromEmail(row.email)
                    || ''
                ).trim();

                return [{
                    studentCode: String(profile.student_code || row.student_code || '').trim(),
                    fullName,
                    className: String(profile.class_name || '').trim(),
                    majorName: canonicalMajorLabels.get(optionKey(resolveOnboardingMajor(row)))
                        || resolveOnboardingMajor(row),
                    gpa4: stats.hasData ? Number(stats.rawGPA4.toFixed(2)) : null,
                    gpa10: stats.hasData ? Number(stats.rawGPA10.toFixed(2)) : null,
                    credits: stats.totalCredits,
                    trainingScore: averageTrainingScore(selectedSemesters),
                    cohort: normalizeCohort(row.cohort)
                }];
            }).sort((a, b) => (
                a.studentCode.localeCompare(b.studentCode, 'vi', { numeric: true })
                || a.fullName.localeCompare(b.fullName, 'vi')
            ));

            if (excelRows.length === 0) {
                setErrorText('Không có sinh viên nào có dữ liệu học tập phù hợp với bộ lọc đã chọn.');
                return;
            }

            setStatusText(`Đang tạo file Excel cho ${excelRows.length} sinh viên...`);
            exportAdminStudentListToExcel({
                rows: excelRows,
                academicYearLabel: selectedYearLabel,
                semesterLabel: semesterLabels[semesterFilter],
                cohortLabel: selectedCohortLabel,
                majorLabel: selectedMajorLabel
            });
            onClose();
        } catch (error: any) {
            console.error('Không thể xuất danh sách sinh viên:', error);
            setErrorText(error?.message || 'Không thể xuất danh sách. Vui lòng thử lại.');
        } finally {
            setExporting(false);
            setStatusText('');
        }
    };

    const selectClassName = 'h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 pr-9 text-sm font-bold text-slate-700 outline-none transition focus:border-[#0052CC] focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400';

    return (
        <div
            className="fixed inset-0 z-[100000] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
            onMouseDown={() => !exporting && !sendingOtp && onClose()}
        >
            <div
                className="w-full max-w-2xl overflow-hidden rounded-t-[26px] border border-white/70 bg-white shadow-2xl sm:rounded-2xl"
                onMouseDown={event => event.stopPropagation()}
            >
                <div className="flex items-start justify-between border-b border-slate-100 bg-gradient-to-r from-[#F4F8FF] to-white px-5 py-4 sm:px-6">
                    <div className="flex items-start gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                            <FileSpreadsheet size={22} />
                        </span>
                        <div>
                            <h2 className="text-lg font-black text-[#0D1B3E]">Xuất danh sách Excel</h2>
                            <p className="mt-1 text-xs font-semibold text-slate-500">
                                Lọc và xuất toàn bộ sinh viên phù hợp, không phụ thuộc danh sách đang hiển thị.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        disabled={exporting || sendingOtp}
                        onClick={onClose}
                        className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
                        aria-label="Đóng"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="max-h-[70vh] overflow-y-auto px-5 py-5 sm:px-6">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <label className="space-y-1.5">
                            <span className="flex items-center gap-1.5 text-xs font-black text-slate-600">
                                <CalendarRange size={14} className="text-[#0052CC]" /> Năm học
                            </span>
                            <div className="relative">
                                <select value={academicYear} onChange={event => setAcademicYear(event.target.value)} className={selectClassName}>
                                    <option value="all">Tất cả năm học</option>
                                    {academicYears.map(year => <option key={year} value={year}>{year}</option>)}
                                </select>
                                <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            </div>
                        </label>

                        <label className="space-y-1.5">
                            <span className="flex items-center gap-1.5 text-xs font-black text-slate-600">
                                <GraduationCap size={14} className="text-[#0052CC]" /> Học kỳ
                            </span>
                            <div className="relative">
                                <select value={semesterFilter} onChange={event => setSemesterFilter(event.target.value)} className={selectClassName}>
                                    {Object.entries(semesterLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                </select>
                                <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            </div>
                        </label>

                        <label className="space-y-1.5">
                            <span className="text-xs font-black text-slate-600">Khóa</span>
                            <div className="relative">
                                <select disabled={loadingOptions} value={cohort} onChange={event => setCohort(event.target.value)} className={selectClassName}>
                                    <option value="all">{loadingOptions ? 'Đang tải danh sách khóa...' : 'Tất cả khóa'}</option>
                                    {filterOptions.cohorts.map(item => <option key={item} value={item}>{item}</option>)}
                                </select>
                                <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            </div>
                        </label>

                        <label className="space-y-1.5">
                            <span className="text-xs font-black text-slate-600">Ngành học</span>
                            <div className="relative">
                                <select disabled={loadingOptions} value={major} onChange={event => setMajor(event.target.value)} className={selectClassName}>
                                    <option value="all">{loadingOptions ? 'Đang tải danh sách ngành...' : 'Tất cả ngành'}</option>
                                    {filterOptions.majors.map(item => <option key={item} value={item}>{item}</option>)}
                                </select>
                                <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            </div>
                        </label>
                    </div>

                    <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-xs font-semibold leading-5 text-[#23466F]">
                        File sử dụng font <strong>Times New Roman</strong>. Điểm TBCHT, số tín chỉ và điểm rèn luyện được tính trong đúng năm học/học kỳ đã chọn.
                    </div>

                    {otpRequested && (
                        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                            <div className="flex items-start gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-amber-600 shadow-sm">
                                    <KeyRound size={18} />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-black text-slate-800">Xác nhận bảo mật trước khi xuất</p>
                                    <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                                        <Mail size={13} /> Mã được gửi đến email của tài khoản quản trị đang đăng nhập
                                    </p>
                                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            autoComplete="one-time-code"
                                            maxLength={6}
                                            value={otp}
                                            onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                                            placeholder="Nhập mã OTP 6 số"
                                            className="h-10 min-w-0 flex-1 rounded-xl border border-amber-200 bg-white px-3 text-center text-base font-black tracking-[0.28em] text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                                        />
                                        <button
                                            type="button"
                                            disabled={sendingOtp || exporting}
                                            onClick={handleSendOtp}
                                            className="h-10 rounded-xl border border-amber-200 bg-white px-3 text-xs font-black text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
                                        >
                                            {sendingOtp ? 'Đang gửi...' : 'Gửi lại mã'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {noticeText && (
                        <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">
                            {noticeText}
                        </div>
                    )}

                    {errorText && (
                        <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs font-bold text-red-600">
                            {errorText}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:px-6">
                    <button
                        type="button"
                        disabled={exporting || sendingOtp}
                        onClick={onClose}
                        className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
                    >
                        Hủy
                    </button>
                    <button
                        type="button"
                        disabled={exporting || sendingOtp || loadingOptions}
                        onClick={handleExport}
                        className="flex h-10 min-w-[150px] items-center justify-center gap-2 rounded-xl bg-[#0052CC] px-4 text-sm font-black text-white shadow-sm transition hover:bg-[#003D99] disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                        {(exporting || sendingOtp) ? <Loader2 size={16} className="animate-spin" /> : (otpRequested ? <KeyRound size={16} /> : <FileSpreadsheet size={16} />)}
                        {exporting
                            ? (statusText || 'Đang xuất...')
                            : sendingOtp
                                ? 'Đang gửi OTP...'
                                : otpRequested
                                    ? 'Xác nhận & xuất'
                                    : 'Gửi OTP để xuất'}
                    </button>
                </div>
            </div>
        </div>
    );
};
