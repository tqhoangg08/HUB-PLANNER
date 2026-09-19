import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { SubjectRankingModal } from './SubjectRankingModal';
import { UserData, GradeStatus, Subject, Semester } from '../types';
import {
    calculateCumulativeStats,
    calculateSubjectAverage,
    getSubjectStatus,
    calculateYearlyStats,
    calculateSemesterStats,
    analyzeTrend,
    calculateRequiredGPA,
    getGradeDetails,
    getCombinedYearClassification
} from '../utils/calculations';
import { Target, AlertTriangle, User, BookOpen, BarChart3, Calendar, CalendarDays, Check, CheckCircle2, Pencil, Trophy, Zap, ChevronRight, X, GraduationCap, TrendingUp, Plus, Star, Search, Crown, Loader2, AlertCircle, BarChart2, ChevronLeft, Award, ArrowUpDown, ArrowUp, ArrowDown, ListFilter, Trash2, Download, FileUp, Info, Shield, ChevronDown, ShieldAlert, RefreshCw, Users, Filter, Sparkles, Bell, Edit3, Home, Lock, ShieldCheck, ClipboardList, Activity, Database } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import { playClick } from '../utils/audio';
import { mapIdToDisplay, normalizeSemesterId } from '../utils/rankingData';
import { useForecastRank } from '../hooks/useForecastRank';
import { FEATURE_FORECAST_TOOLS } from '../utils/featureFlags';
import { useSemesterLookback } from '../hooks/useSemesterLookback';
import { useUserRole } from '../hooks/useUserRole';
import { SemesterLookbackModal } from './SemesterLookbackModal';
import { fetchProfilePrivate, updateProfilePrivate } from '../utils/profilePrivate';
import { searchStaffProfiles, searchStaffProfilesPage } from '../utils/staffProfilesApi';
import { buildManualSupportTicketDraft, openSupportTicketDraft } from '../utils/supportTicketDraft';
import { TargetGpaTipInput } from './TargetGpaTipInput';
import { AdminStudentExcelExportModal } from './AdminStudentExcelExportModal';
import { resolveTotalCreditsRequired } from '../utils/programs';

const formatGpaWithoutRounding = (value: number) => {
    return (Math.floor((value + Number.EPSILON) * 100) / 100).toFixed(2);
};

const formatTrainingScore = (value: number | null) => {
    if (value === null || !Number.isFinite(value)) return '-';
    return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
};

const getScholarshipRankAssessment = (rank?: number | null) => {
    const value = Number(rank);
    if (!Number.isFinite(value) || value <= 0) {
        return {
            className: 'border-slate-200 bg-slate-50',
            text: 'Chưa đủ dữ liệu xếp hạng để đánh giá khả năng đạt học bổng.'
        };
    }
    if (value <= 500) {
        return {
            className: 'border-emerald-200 bg-[#ECFDF5]',
            text: 'Tỷ lệ đạt học bổng rất cao. Tiếp tục duy trì GPA và điểm rèn luyện để tăng cơ hội nhận học bổng.'
        };
    }
    if (value <= 700) {
        return {
            className: 'border-emerald-200 bg-emerald-50',
            text: 'Tỷ lệ đạt học bổng cao. Nên duy trì điểm hiện tại và hạn chế giảm điểm rèn luyện.'
        };
    }
    if (value <= 1000) {
        return {
            className: 'border-amber-200 bg-amber-50',
            text: 'Tỷ lệ đạt học bổng ở mức bình thường. Nên cải thiện thêm GPA hoặc điểm rèn luyện để an toàn hơn.'
        };
    }
    return {
        className: 'border-red-200 bg-red-50',
        text: 'Tỷ lệ đạt học bổng thấp. Cần cải thiện GPA và điểm rèn luyện để tăng khả năng cạnh tranh.'
    };
};

const formatTopPercent = (rank?: number | null, total?: number | null) => {
    const rankValue = Number(rank);
    const totalValue = Number(total);
    if (!Number.isFinite(rankValue) || !Number.isFinite(totalValue) || rankValue <= 0 || totalValue <= 0) {
        return 'Chưa có dữ liệu';
    }

    const percent = Math.max(0.01, (rankValue / totalValue) * 100);
    return `Top ${percent.toFixed(percent < 1 ? 2 : 1)}%`;
};

// ============================================================================
// MODAL: BÁO LỖI HỆ THỐNG
// ============================================================================
const ReportErrorModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
    const [location, setLocation] = useState('');
    const [description, setDescription] = useState('');
    const [statusMsg, setStatusMsg] = useState<{text: string, type: 'success'|'error'} | null>(null);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!location.trim() || !description.trim()) {
            setStatusMsg({text: 'Vui lòng điền đầy đủ thông tin.', type: 'error'});
            return;
        }
        playClick();
        openSupportTicketDraft(buildManualSupportTicketDraft({
            category: 'other',
            subject: `Báo lỗi/Góp ý: ${location.trim()}`,
            intro: 'Mình muốn báo lỗi hoặc góp ý trong quá trình sử dụng HUB Planner.',
            fields: [
                ['Khu vực/tính năng', location],
                ['Mô tả chi tiết', description],
            ],
        }));
        return;
    };

    return createPortal(
        <div className="fixed inset-0 z-[100000] bg-black/60 flex items-center justify-center p-4 animate-fadeIn" onClick={onClose}>
            <div className="bg-white rounded-xl w-full max-w-md p-0 overflow-hidden animate-scaleIn shadow-2xl relative flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="bg-red-600 p-4 flex justify-between items-center text-white shrink-0">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                        <AlertTriangle size={20}/> Báo cáo lỗi / Góp ý
                    </h3>
                    <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-full transition-colors"><X size={20}/></button>
                </div>
                <div className="p-6">
                    {statusMsg && (
                        <div className={`p-3 mb-4 rounded-lg text-sm font-medium ${statusMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                            {statusMsg.text}
                        </div>
                    )}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-800 mb-1">Lỗi ở đâu? (Tính năng/Khu vực) <span className="text-red-500">*</span></label>
                            <input
                                type="text" required
                                className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-red-500 transition-all text-sm"
                                placeholder="VD: Tính điểm hệ 4, Nhập PDF, Bảng xếp hạng..."
                                value={location} onChange={e => setLocation(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-800 mb-1">Mô tả chi tiết <span className="text-red-500">*</span></label>
                            <textarea
                                rows={4} required
                                className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-red-500 resize-none text-sm transition-all"
                                placeholder="Mô tả chi tiết vấn đề bạn đang gặp phải hoặc góp ý của bạn..."
                                value={description} onChange={e => setDescription(e.target.value)}
                            ></textarea>
                        </div>
                        <div className="space-y-3 pt-2">
                            <div className="flex gap-3">
                                <button type="button" onClick={onClose} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-all">Hủy</button>
                                <button type="submit" className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md">
                                    Tạo ticket hỗ trợ
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>, document.body
    );
};

// ============================================================================
// 1. MODAL: MÔN CHƯA ĐẠT
// ============================================================================
const FailedSubjectsModal = ({ subjects, onClose }: { subjects: Subject[], onClose: () => void }) => {
    return createPortal(
        <div className="fixed inset-0 z-[99999] bg-black/50 flex items-center justify-center p-4 animate-fadeIn" onClick={onClose}>
            <div className="bg-white rounded-xl w-full max-w-md flex flex-col shadow-xl animate-scaleIn overflow-hidden border border-gray-300" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-gray-300 flex justify-between items-center bg-gray-50">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2 text-base">
                        <AlertTriangle size={18} className="text-[#990000]" /> Danh sách môn chưa đạt ({subjects.length})
                    </h3>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-500 transition-colors"><X size={18} /></button>
                </div>
                <div className="p-4 overflow-y-auto max-h-[60vh] custom-scrollbar">
                    <div className="space-y-3">
                        {subjects.map((sub, idx) => {
                             const avg = calculateSubjectAverage(sub);
                             return (
                                <div key={idx} className="bg-white border border-gray-300 rounded-lg p-3 flex justify-between items-center hover:border-[#990000]/30 transition-colors">
                                    <div>
                                        <p className="font-bold text-gray-800 text-sm">{sub.name}</p>
                                        <div className="flex gap-3 mt-1 text-xs text-gray-500">
                                            <span className="bg-gray-100 px-2 py-0.5 rounded font-medium">{sub.credits} tín chỉ</span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="block text-xl font-bold text-[#990000]">{avg?.toFixed(1) || '0.0'}</span>
                                        <span className="text-[10px] text-[#990000] font-bold bg-red-50 px-1.5 py-0.5 rounded border border-red-100">R?T MÔN</span>
                                    </div>
                                </div>
                             )
                        })}
                    </div>
                </div>
                <div className="p-3 border-t border-gray-300 bg-white">
                    <button onClick={onClose} className="w-full py-2 bg-gray-100 text-gray-700 rounded-lg font-bold text-sm hover:bg-gray-200 transition-colors">Đóng</button>
                </div>
            </div>
        </div>, document.body
    );
};

// ============================================================================
// 2. MODAL: TỔNG KẾT NĂM
// ============================================================================
const YearlyStatsModal = ({ stats, onClose }: { stats: any[], onClose: () => void }) => {
    return createPortal(
        <div className="fixed inset-0 z-[99999] bg-black/50 flex items-center justify-center p-4 animate-fadeIn" onClick={onClose}>
            <div className="bg-white rounded-xl w-full max-w-md flex flex-col shadow-xl animate-scaleIn overflow-hidden border border-gray-300" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-gray-300 flex justify-between items-center bg-gray-50">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2 text-base">
                        <Calendar size={18} className="text-[#003375]" /> Tổng kết từng năm học
                    </h3>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-500 transition-colors"><X size={18} /></button>
                </div>
                <div className="p-4 overflow-y-auto max-h-[60vh] custom-scrollbar">
                    <div className="space-y-3">
                        {stats.map((year) => {
                            const yearClass = year.combinedClassification || 'Chưa đủ dữ liệu';
                            return (
                                <div key={year.yearId} className="bg-white border border-gray-300 rounded-lg p-3 hover:border-[#003375]/30 transition-colors">
                                    <div className="flex justify-between gap-3 items-center mb-2 pb-2 border-b border-gray-300">
                                        <span className="font-bold text-gray-800 text-sm">{year.label}</span>
                                        <div className="flex flex-col items-end text-xs font-bold">
                                            <span className={year.hasData ? 'text-[#003375]' : 'text-gray-400'}>
                                                GPA(4): {year.hasData ? formatGpaWithoutRounding(year.rawGPA4) : '-'}
                                            </span>
                                            <span className={year.hasData ? 'text-[#990000]' : 'text-gray-400'}>
                                                GPA(10): {year.hasData ? formatGpaWithoutRounding(year.rawGPA10) : '-'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap justify-between items-center gap-2 text-xs text-gray-600">
                                        <div className="flex flex-wrap gap-2">
                                            <span className="bg-gray-100 px-2 py-1 rounded font-medium">TC: {year.totalCredits}</span>
                                            <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded border border-emerald-100 font-medium">Đạt: {year.passedCredits}</span>
                                            <span className="bg-amber-50 text-amber-700 px-2 py-1 rounded border border-amber-100 font-medium">
                                                ĐRL năm: {formatTrainingScore(year.averageTrainingScore)}
                                                {year.trainingClassification ? ` · ${year.trainingClassification}` : ''}
                                            </span>
                                        </div>
                                        <span className={`font-bold px-2 py-1 rounded border ${
                                            year.combinedClassification
                                                ? 'text-[#003375] bg-blue-50 border-blue-100'
                                                : 'text-gray-500 bg-gray-50 border-gray-200'
                                        }`}>
                                            Xếp loại: {yearClass}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
                <div className="p-3 border-t border-gray-300 bg-white">
                    <button onClick={onClose} className="w-full py-2 bg-gray-100 text-gray-700 rounded-lg font-bold text-sm hover:bg-gray-200 transition-colors">Đóng</button>
                </div>
            </div>
        </div>, document.body
    );
};

// ============================================================================
// 3. COMPONENT: NHẬP ĐIỂM
// ============================================================================
const ScoreInput = ({ value, onChange }: { value: number | null, onChange: (val: number | null) => void }) => {
  const [localValue, setLocalValue] = useState<string>(value?.toString() ?? '');

  useEffect(() => {
    const parsedLocal = localValue === '' ? null : parseFloat(localValue);
    if (value !== parsedLocal) {
       setLocalValue(value?.toString() ?? '');
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    if (newVal === '') {
      setLocalValue('');
      onChange(null);
      return;
    }
    if (!/^\d*\.?\d*$/.test(newVal)) return;
    const parsed = parseFloat(newVal);
    if (isNaN(parsed)) return;
    if (parsed < 0 || parsed > 10) return;
    setLocalValue(newVal);
    onChange(parsed);
  };

  return (
    <input
      type="number" min="0" max="10" step="0.1"
      className="w-full bg-white border border-gray-300 text-gray-900 text-sm rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent p-1 text-center font-medium transition-all hover:border-blue-300"
      placeholder="-"
      value={localValue}
      onChange={handleChange}
      onKeyDown={(e) => { if (["e", "E", "+", "-"].includes(e.key)) e.preventDefault(); }}
    />
  );
};
// ============================================================================
// 4. COMPONENT: BẢNG ĐIỂM HỌC KỲ (SEMESTER TABLE)
// ============================================================================
const DEFAULT_TRANSCRIPT_SEMESTER_NAME = 'Học kỳ 1 Năm học 2025-2026';
const isValidTranscriptSemesterName = (name?: string) => /^Học kỳ (1|2) Năm học \d{4}-\d{4}$/.test((name || '').trim());
const parseTranscriptSemesterName = (name?: string) => {
    const match = (name || '').trim().match(/^Học kỳ (1|2) Năm học (\d{4})-\d{4}$/);
    if (!match) return null;
    return { term: Number(match[1]), year: Number(match[2]) };
};
const getFollowingTranscriptSemesterName = ({ term, year }: { term: number; year: number }) => {
    const nextTerm = term === 1 ? 2 : 1;
    const nextYear = term === 1 ? year : year + 1;
    return `Học kỳ ${nextTerm} Năm học ${nextYear}-${nextYear + 1}`;
};
const getNextTranscriptSemesterName = (semesters: Semester[]) => {
    const selectedSemesters = semesters
        .map(semester => parseTranscriptSemesterName(semester.name))
        .filter((semester): semester is { term: number; year: number } => Boolean(semester));

    if (selectedSemesters.length === 0) {
        return DEFAULT_TRANSCRIPT_SEMESTER_NAME;
    }

    const latestSemester = selectedSemesters.reduce((latest, current) => {
        const latestWeight = latest.year * 2 + latest.term;
        const currentWeight = current.year * 2 + current.term;
        return currentWeight > latestWeight ? current : latest;
    });

    return getFollowingTranscriptSemesterName(latestSemester);
};

interface SemesterTableProps {
  semester: Semester;
  index: number;
  onUpdateSemester: (updatedSemester: Semester) => void;
  onRemoveSemester: () => void;
  allSemesterOptions: string[];
  usedSemesterNames: string[];
  onCascadeUpdate: (newName: string) => void;
  isReadOnly?: boolean;
  rankContext?: {
    studentCode?: string | null;
    classCode?: string | null;
    major?: string | null;
    currentSemesterId?: string | null;
  };
}

const SemesterTable: React.FC<SemesterTableProps> = ({ semester, index, onUpdateSemester, onRemoveSemester, allSemesterOptions, usedSemesterNames, onCascadeUpdate, isReadOnly, rankContext }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>(null);
  const [showScoreColumns, setShowScoreColumns] = useState(false);
  const [visibleScoreColumns, setVisibleScoreColumns] = useState<Record<string, boolean>>({
      scoreCC: true,
      scoreProcess: true,
      scoreMid: true,
      scoreFinal: true
  });

  const {
      fetchRank, result: rankingResult, loading: rankingLoading, error: rankingError, resetResult,
      fetchAvailableSemesters, availableSemesters, loadingSemesters, prepareSemesterRanks,
      resetSemesterRanks, semesterRanks, loadingSemesterRanks
  } = useForecastRank();

  const [showRankMenu, setShowRankMenu] = useState(false);
  const [isSemesterChooserOpen, setIsSemesterChooserOpen] = useState(false);

  const isValidFormat = /^Học kỳ (1|2) Năm học \d{4}-\d{4}$/.test(semester.name);
  const scoreColumnConfig = [
      { key: 'scoreCC', label: '10%' },
      { key: 'scoreProcess', label: '20%' },
      { key: 'scoreMid', label: '20%' },
      { key: 'scoreFinal', label: '50%' }
  ];
  const visibleScoreColumnConfig = scoreColumnConfig.filter((column) => visibleScoreColumns[column.key]);

  const handleSubjectChange = (subjectId: string, field: keyof Subject, value: any) => {
    const updatedSubjects = semester.subjects.map(sub => {
      if (sub.id === subjectId) return { ...sub, [field]: value };
      return sub;
    });
    onUpdateSemester({ ...semester, subjects: updatedSubjects });
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    playClick();
    onCascadeUpdate(e.target.value);
  };

  const handleTrainingScoreChange = (val: string) => {
      if (!/^\d*$/.test(val)) return;
      const num = parseInt(val);
      if (val === '') onUpdateSemester({ ...semester, trainingScore: null });
      else if (!isNaN(num) && num >= 0 && num <= 100) onUpdateSemester({ ...semester, trainingScore: num });
  };

  const addSubject = () => {
    playClick();
    const newSubject: Subject = { id: Date.now().toString(), name: 'Môn học mới', credits: 3, scoreCC: null, scoreProcess: null, scoreMid: null, scoreFinal: null, isNonGPA: false };
    onUpdateSemester({ ...semester, subjects: [...semester.subjects, newSubject] });
    setSearchTerm('');
  };

  const removeSubject = (id: string) => {
    playClick();
    onUpdateSemester({ ...semester, subjects: semester.subjects.filter(s => s.id !== id) });
  };

  const handleSortToggle = () => {
      playClick();
      setSortOrder(prev => {
          if (prev === null) return 'desc';
          if (prev === 'desc') return 'asc';
          return null;
      });
  };

  let semTotalCredits = 0;
  let semWeightedScore4 = 0;
  let semWeightedScore10 = 0;
  let hasData = false;
  let totalRegisteredCredits = 0;

  if (isValidFormat) {
      semester.subjects.forEach(s => {
          if(!s.isNonGPA && s.credits) {
            totalRegisteredCredits += s.credits;
            const avg10 = calculateSubjectAverage(s);
            if(avg10 !== null) {
                const { scale4 } = getGradeDetails(avg10);
                semTotalCredits += s.credits;
                semWeightedScore4 += scale4 * s.credits;
                semWeightedScore10 += avg10 * s.credits;
                hasData = true;
            }
          }
      });
  }

  let semGPA4 = 0;
  let semGPA10 = 0;
  let rawSemGPA4 = 0;
  if (semTotalCredits > 0) {
      rawSemGPA4 = semWeightedScore4 / semTotalCredits;
      const step1_4 = Math.round((rawSemGPA4 + Number.EPSILON) * 100) / 100;
      semGPA4 = Math.round((step1_4 + Number.EPSILON) * 10) / 10;

      const raw10 = semWeightedScore10 / semTotalCredits;
      const step1_10 = Math.round((raw10 + Number.EPSILON) * 100) / 100;
      semGPA10 = Math.round((step1_10 + Number.EPSILON) * 10) / 10;
  }

  const classification = hasData
    ? semester.trainingScore === null || semester.trainingScore === undefined
      ? 'Chưa đủ ĐRL'
      : getCombinedYearClassification(rawSemGPA4, semester.trainingScore)
    : '---';
  const scholarshipStatus = (() => {
    const drl = semester.trainingScore ?? 0;
    const credits = totalRegisteredCredits;
    const gpa = semGPA4;

    const meetsRequirements = credits >= 15 && gpa >= 3.2 && drl >= 80;
    if (!meetsRequirements) return { label: 'Không đạt', className: 'bg-gray-100 text-gray-500 border-gray-200' };
    if (gpa >= 3.6 && drl >= 90) return { label: 'HB Xuất sắc', className: 'bg-yellow-50 text-yellow-700 border-yellow-200' };
    return { label: 'HB Giỏi', className: 'bg-green-50 text-green-700 border-green-200' };
  })();
  const scholarshipRankAssessment = getScholarshipRankAssessment(rankingResult?.rank);
  const schoolTopPercentLabel = formatTopPercent(rankingResult?.rank, rankingResult?.totalStudents);

  const handleOpenRankMenu = () => {
      playClick(); setShowRankMenu(true);
      setIsSemesterChooserOpen(false);
      prepareSemesterRanks(semGPA4, totalRegisteredCredits, semester.trainingScore ?? 0);
      fetchAvailableSemesters();
  };

  const handleSelectReferenceSemester = (refId: string) => {
      playClick();
      setIsSemesterChooserOpen(false);
      fetchRank(refId, semGPA4, totalRegisteredCredits, semester.trainingScore ?? 0, rankContext);
  };

  let headerColor = "bg-gray-50 border-gray-200";
  if (hasData) {
      if (semGPA4 >= 3.6) headerColor = "bg-green-50 border-green-200";
      else if (semGPA4 >= 3.2) headerColor = "bg-blue-50 border-blue-200";
      else if (semGPA4 >= 2.5) headerColor = "bg-indigo-50 border-indigo-200";
      else if (semGPA4 >= 2.0) headerColor = "bg-yellow-50 border-yellow-200";
      else if (semGPA4 >= 1.0) headerColor = "bg-orange-50 border-orange-200";
      else headerColor = "bg-red-50 border-red-200";
  }

  const processedSubjects = useMemo(() => {
      let result = semester.subjects.filter(subject => subject.name.toLowerCase().includes(searchTerm.toLowerCase()));
      if (sortOrder) {
          result.sort((a, b) => {
              const avgA = calculateSubjectAverage(a) ?? -1;
              const avgB = calculateSubjectAverage(b) ?? -1;
              return sortOrder === 'desc' ? avgB - avgA : avgA - avgB;
          });
      }
      return result;
  }, [semester.subjects, searchTerm, sortOrder]);

  return (
    <div className={`mb-5 sm:mb-8 bg-white rounded-xl border overflow-visible ${hasData || isValidFormat ? 'border-gray-300 shadow-sm' : 'border-red-300 shadow-md ring-1 ring-red-100'}`}>
      <div className={`px-3 py-3 sm:px-6 sm:py-4 flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 ${isValidFormat ? headerColor : 'bg-red-50/30 border-red-200'} rounded-t-xl ${isValidFormat ? 'border-b' : 'border-b-0'}`}>
        <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
            <div className="relative group flex-1 max-w-md flex items-center min-w-0">
                <select
                    value={isValidFormat ? semester.name : ''}
                    onChange={handleNameChange}
                    className={`text-base sm:text-lg font-bold bg-transparent border-b border-dashed focus:outline-none transition-all w-full py-0.5 sm:py-1 appearance-none cursor-pointer pr-6 truncate ${
                        !isValidFormat
                        ? 'text-red-600 border-red-400 hover:border-red-600'
                        : 'text-[#003375] border-transparent hover:border-[#003375]/50 focus:border-[#003375]'
                    }`}
                >
                    {!allSemesterOptions.includes(semester.name) && isValidFormat && (
                        <option value={semester.name} disabled className="hidden">{semester.name}</option>
                    )}

                    {!isValidFormat && (
                         <option value="" disabled className="text-red-500 font-bold">Vui lòng chọn lại tên học kỳ (sai định dạng)</option>
                    )}

                    {allSemesterOptions.map(opt => {
                        const isUsed = usedSemesterNames.includes(opt) && opt !== semester.name;
                        return (
                            <option key={opt} value={opt} disabled={isUsed} className={isUsed ? 'text-gray-400 bg-gray-100' : 'text-gray-900'}>
                                {opt} {isUsed ? '(Đã thêm)' : ''}
                            </option>
                        )
                    })}
                </select>
                <ChevronDown className={`absolute right-1 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none w-4 h-4 ${!isValidFormat ? 'text-red-500' : 'text-[#003375]'}`} />
            </div>
            {hasData && isValidFormat && (
                <span className={`text-[10px] sm:text-xs px-2 py-0.5 sm:py-1 rounded-full font-bold border bg-white/60 border-current shadow-sm text-gray-700 whitespace-nowrap shrink-0`}>
                    {classification}
                </span>
            )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 md:gap-4 text-[11px] sm:text-sm relative z-10">
              {FEATURE_FORECAST_TOOLS && hasData && isValidFormat && (
                  <div className="relative">
                      <button
                          onClick={handleOpenRankMenu}
                          className={`flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg border shadow-sm transition-all active:scale-95 hover:shadow-md ${showRankMenu ? 'bg-blue-50 border-blue-200 ring-2 ring-blue-100' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                          title="Xếp hạng dự báo"
                      >
                          <Crown className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${rankingResult ? "fill-yellow-500 text-yellow-600" : "text-gray-400"}`}/>
                          <span className="font-bold text-[#003375]">Xếp hạng</span>
                      </button>

                      {false && showRankMenu && (
                          <div className="absolute top-full left-0 md:left-auto md:right-0 mt-2 w-72 sm:w-80 bg-white rounded-xl shadow-2xl border border-gray-200 z-[60] overflow-hidden animate-fadeIn origin-top-left md:origin-top-right">
                              <div className="bg-[#003375] px-4 py-3 text-white flex justify-between items-center shrink-0">
                                  <h4 className="font-bold text-sm flex items-center gap-2"><BarChart2 size={16}/> Xếp hạng dự báo</h4>
                                  <button onClick={() => { setShowRankMenu(false); resetSemesterRanks(); }} className="hover:bg-white/20 p-1 rounded-full transition-colors"><X size={14}/></button>
                              </div>
                              <div className="p-0">
                                  {rankingLoading ? (
                                      <div className="flex flex-col items-center justify-center py-8 text-[#003375]">
                                          <Loader2 size={32} className="animate-spin mb-2"/>
                                          <span className="text-xs font-medium">Đang tính toán...</span>
                                      </div>
                                  ) : rankingResult ? (
                                      <div className="p-4 bg-[#F8FAFC]">
                                          <button onClick={() => resetResult()} className="flex items-center gap-1 text-xs text-[#64748B] hover:text-[#0F172A] mb-3 transition-colors"><ChevronLeft size={14}/> Chọn kỳ khác</button>
                                          <div className="space-y-3">
                                              <div>
                                                  <h4 className="text-base font-bold text-[#0F172A]">Xếp hạng học kỳ</h4>
                                                  <p className="text-xs text-[#64748B] mt-0.5">{mapIdToDisplay(rankingResult.semesterId)}</p>
                                              </div>

                                              <div className="grid grid-cols-2 gap-2">
                                                  <div className="rounded-lg border border-[#E2E8F0] bg-white p-3">
                                                      <p className="text-[11px] font-semibold text-[#64748B]">GPA học kỳ</p>
                                                      <p className="mt-1 text-xl font-bold text-[#0F172A]">{semGPA4.toFixed(2)} <span className="text-xs font-medium text-[#64748B]">/ 4.0</span></p>
                                                  </div>
                                                  <div className="rounded-lg border border-[#E2E8F0] bg-white p-3">
                                                      <p className="text-[11px] font-semibold text-[#64748B]">Điểm rèn luyện</p>
                                                      <p className="mt-1 text-xl font-bold text-[#0F172A]">{semester.trainingScore ?? 0} <span className="text-xs font-medium text-[#64748B]">/ 100</span></p>
                                                  </div>
                                              </div>

                                              <div className="rounded-lg border border-[#E2E8F0] bg-white overflow-hidden">
                                                  <div className="flex items-center justify-between px-3 py-2 border-b border-[#E2E8F0]">
                                                      <span className="text-xs font-semibold text-[#64748B]">Top toàn trường</span>
                                                      <span className="text-sm font-bold text-[#0F172A]">#{rankingResult.rank} / {rankingResult.totalStudents}</span>
                                                  </div>
                                                  {rankingResult.rankInClass && (
                                                      <div className="flex items-center justify-between px-3 py-2 border-b border-[#E2E8F0]">
                                                          <span className="text-xs font-semibold text-[#64748B]">Top trong lớp</span>
                                                          <span className="text-sm font-bold text-[#0F172A]">#{rankingResult.rankInClass} / {rankingResult.totalInClass}</span>
                                                      </div>
                                                  )}
                                                  {rankingResult.rankInMajor && (
                                                      <div className="flex items-center justify-between px-3 py-2 border-b border-[#E2E8F0]">
                                                          <span className="text-xs font-semibold text-[#64748B]">Top trong ngành</span>
                                                          <span className="text-sm font-bold text-[#0F172A]">#{rankingResult.rankInMajor} / {rankingResult.totalInMajor}</span>
                                                      </div>
                                                  )}
                                                  <div className="flex items-start justify-between gap-3 px-3 py-2">
                                                      <span className="text-xs font-semibold text-[#64748B]">Ngành</span>
                                                      <span className="text-sm font-semibold text-[#0F172A] text-right">{rankingResult.major || 'Chưa có dữ liệu'}</span>
                                                  </div>
                                              </div>

                                              <div className="rounded-lg border border-emerald-200 bg-[#ECFDF5] p-3">
                                                  <p className="text-sm font-bold text-[#0F172A]">Đánh giá học bổng</p>
                                                  <p className="mt-1 text-xs leading-5 text-[#334155]">Khả năng đạt học bổng rất cao. Tiếp tục duy trì GPA và điểm rèn luyện để tăng cơ hội nhận học bổng.</p>
                                              </div>
                                          </div>
                                      </div>
                                  ) : (
                                      <div className="flex flex-col max-h-[300px]">
                                          <div className="p-3 bg-gray-50 border-b border-gray-100 text-xs text-gray-500 italic">Chọn nguồn dữ liệu (kỳ học cũ)...</div>
                                          <div className="overflow-y-auto custom-scrollbar p-2 space-y-1">
                                              {loadingSemesters ? (
                                                  <div className="py-4 text-center text-xs text-gray-400">Đang tải...</div>
                                              ) : availableSemesters.length > 0 ? (
                                                  availableSemesters.map((semId) => {
                                                      const semesterRank = semesterRanks[semId];
                                                      const rankLabel = Number.isFinite(semesterRank) ? `Hạng #${semesterRank}` : loadingSemesterRanks ? 'Đang tải...' : 'Chưa có hạng';
                                                      return (
                                                      <button key={semId} onClick={() => handleSelectReferenceSemester(semId)} className="w-full text-left px-3 py-2.5 hover:bg-blue-50 hover:text-[#003375] rounded-lg transition-all text-sm font-medium text-gray-700 flex justify-between items-center group">
                                                          <span>Dữ liệu {mapIdToDisplay(semId)} - {rankLabel}</span>
                                                          <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-400"/>
                                                      </button>
                                                      );
                                                  })
                                              ) : (
                                                  <div className="py-6 text-center"><p className="text-xs text-gray-400 mb-2">Chưa có dữ liệu.</p></div>
                                              )}
                                          </div>
                                          {rankingError && <div className="p-2 bg-red-50 text-red-600 text-xs text-center border-t border-red-100 flex items-center justify-center gap-1"><AlertCircle size={12}/> {rankingError}</div>}
                                      </div>
                                  )}
                              </div>
                          </div>
                      )}
                  </div>
              )}

            <div className="flex items-center gap-1 sm:gap-2 bg-white px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg border border-gray-200 shadow-sm transition-transform hover:scale-105">
                <span className="text-gray-500 font-medium flex items-center gap-1"><BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4"/> <span className="hidden sm:inline">TC:</span></span>
                <span className="font-bold text-gray-800">{isValidFormat ? totalRegisteredCredits : '-'} <span className="sm:hidden font-medium text-[10px] text-gray-500">TC</span></span>
            </div>

            <div className="flex items-center gap-1 sm:gap-2 bg-white px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg border border-gray-200 shadow-sm transition-transform hover:scale-105">
                <span className="text-gray-500 font-medium">GPA(4):</span>
                <span className="font-bold text-[#003375]">{hasData && isValidFormat ? semGPA4.toFixed(2) : '-'}</span>
            </div>

            <div className="flex items-center gap-1 sm:gap-2 bg-white px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg border border-gray-200 shadow-sm transition-transform hover:scale-105">
                <span className="text-gray-500 font-medium">GPA(10):</span>
                <span className="font-bold text-[#990000]">{hasData && isValidFormat ? semGPA10.toFixed(2) : '-'}</span>
            </div>

            <div className="flex items-center gap-1 sm:gap-2 bg-white pl-2 pr-1 py-0.5 sm:pl-3 sm:pr-1 sm:py-1 rounded-lg border border-gray-200 shadow-sm transition-transform hover:scale-105">
                <span className="text-gray-500 font-medium flex items-center gap-1"><Star className="text-yellow-500 fill-yellow-500 w-3.5 h-3.5 sm:w-4 sm:h-4"/> <span className="hidden sm:inline">ĐRL:</span></span>
                <input
                    type="number" min="0" max="100" placeholder="0"
                    disabled={!isValidFormat}
                    className="w-7 sm:w-10 text-center font-bold text-gray-800 outline-none border-b border-transparent focus:border-blue-400 focus:bg-gray-50 rounded transition-colors bg-transparent disabled:opacity-50"
                    value={semester.trainingScore ?? ''}
                    onChange={(e) => handleTrainingScoreChange(e.target.value)}
                    onKeyDown={(e) => { if (["e", "E", "+", "-"].includes(e.key)) e.preventDefault(); }}
                />
            </div>

            <div className={`flex items-center gap-1 sm:gap-2 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg border shadow-sm text-[11px] sm:text-sm font-bold ${isValidFormat ? scholarshipStatus.className : 'bg-gray-100 text-gray-400'}`}>
                <Award className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>{isValidFormat ? scholarshipStatus.label : '---'}</span>
            </div>

             <button onClick={onRemoveSemester} className="ml-auto md:ml-0 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all p-1.5 sm:p-2 rounded-full active:scale-90 hover:shadow-md" title="Xóa học kỳ">
             <Trash2 className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
            </button>
        </div>
      </div>

      {showRankMenu && hasData && isValidFormat && createPortal(
        <div
          className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/55 px-3 py-4 sm:px-6"
          onClick={() => { setShowRankMenu(false); setIsSemesterChooserOpen(false); resetSemesterRanks(); resetResult(); }}
        >
          <div
            className="flex max-h-[calc(100dvh-32px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[86vh]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between bg-[#003375] px-4 py-3 text-white sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="hidden rounded-lg bg-white/15 p-2 sm:block">
                  <BarChart2 size={18} />
                </div>
                <div className="min-w-0">
                  <h4 className="text-base font-bold sm:text-lg">Xếp hạng học kỳ</h4>
                  <p className="mt-0.5 text-xs text-white/75">Chọn học kỳ để xem xếp hạng và đánh giá học bổng.</p>
                </div>
              </div>
              <button
                onClick={() => { setShowRankMenu(false); setIsSemesterChooserOpen(false); resetSemesterRanks(); resetResult(); }}
                className="rounded-full p-2 transition-colors hover:bg-white/20"
                title="Đóng"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[320px_1fr]">
              <aside className="border-b border-[#E2E8F0] bg-[#F8FAFC] p-3 sm:p-4 lg:border-b-0 lg:border-r">
                <p className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Học kỳ so sánh</p>

                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    setIsSemesterChooserOpen((value) => !value);
                  }}
                  className="mt-2 flex w-full items-center justify-between gap-3 rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-left text-[#003375] shadow-sm transition-colors hover:bg-blue-50"
                >
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">Đang xem</p>
                    <p className="mt-0.5 truncate text-[13px] font-bold leading-snug sm:text-sm">
                      {rankingResult ? mapIdToDisplay(rankingResult.semesterId) : 'Chọn học kỳ'}
                    </p>
                  </div>
                  <ChevronDown
                    size={18}
                    className={`shrink-0 transition-transform ${isSemesterChooserOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {isSemesterChooserOpen && (
                  <div className="mt-2 max-h-[26vh] space-y-1.5 overflow-y-auto pr-1 sm:max-h-[34vh] sm:space-y-2 lg:max-h-[58vh]">
                    {loadingSemesters ? (
                      <div className="rounded-lg border border-[#E2E8F0] bg-white py-6 text-center text-sm text-[#64748B]">Đang tải...</div>
                    ) : availableSemesters.length > 0 ? (
                      availableSemesters.map((semId) => {
                        const semesterRank = semesterRanks[semId];
                        const rankLabel = Number.isFinite(semesterRank) ? `#${semesterRank}` : loadingSemesterRanks ? 'Đang tải' : 'Chưa có hạng';
                        const isSelected = rankingResult?.semesterId === semId;
                        return (
                          <button
                            key={semId}
                            onClick={() => handleSelectReferenceSemester(semId)}
                            className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors sm:py-3 ${
                              isSelected
                                ? 'border-blue-300 bg-blue-50 text-[#003375]'
                                : 'border-[#E2E8F0] bg-white text-[#334155] hover:border-blue-300 hover:bg-blue-50 hover:text-[#003375]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[13px] font-bold leading-snug sm:text-sm">{mapIdToDisplay(semId)}</span>
                              <ChevronRight size={16} className="shrink-0" />
                            </div>
                            <div className="mt-0.5 text-[11px] font-semibold text-[#64748B] sm:mt-1 sm:text-xs">Hạng: {rankLabel}</div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="rounded-lg border border-[#E2E8F0] bg-white py-6 text-center text-sm text-[#64748B]">Chưa có dữ liệu.</div>
                    )}
                  </div>
                )}
              </aside>

              <section className="overflow-y-auto bg-white p-4 pb-6 sm:p-5 sm:pb-6">
                {rankingLoading ? (
                  <div className="flex h-full min-h-[320px] flex-col items-center justify-center text-[#003375]">
                    <Loader2 size={34} className="mb-3 animate-spin" />
                    <span className="text-sm font-semibold">Đang tính toán xếp hạng...</span>
                  </div>
                ) : rankingResult ? (
                  <div>
                    <div className="mb-3 sm:mb-4">
                      <h5 className="text-lg font-bold text-[#0F172A] sm:text-2xl">Xếp hạng học kỳ</h5>
                      <p className="mt-1 text-xs text-[#64748B] sm:text-sm">{mapIdToDisplay(rankingResult.semesterId)}</p>
                    </div>

                    <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-3 text-[#003375] sm:mb-4 sm:px-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Xếp hạng nổi bật</p>
                      <p className="mt-1 text-base font-extrabold leading-snug text-[#0F172A] sm:text-xl">
                        #{rankingResult.rank} / {rankingResult.totalStudents} toàn trường
                      </p>
                      <p className="mt-1 text-sm font-semibold text-[#003375]">Bạn đang nằm trong {schoolTopPercentLabel} toàn trường</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:gap-3">
                      <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 sm:p-4">
                        <p className="text-xs font-semibold text-[#64748B] sm:text-sm">GPA học kỳ</p>
                        <p className="mt-1.5 text-2xl font-bold leading-none text-[#0F172A] sm:mt-2 sm:text-3xl sm:leading-normal">
                          {semGPA4.toFixed(2)} <span className="text-xs font-medium text-[#64748B] sm:text-sm">/ 4.0</span>
                        </p>
                      </div>
                      <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 sm:p-4">
                        <p className="text-xs font-semibold text-[#64748B] sm:text-sm">Điểm rèn luyện</p>
                        <p className="mt-1.5 text-2xl font-bold leading-none text-[#0F172A] sm:mt-2 sm:text-3xl sm:leading-normal">
                          {semester.trainingScore ?? 0} <span className="text-xs font-medium text-[#64748B] sm:text-sm">/ 100</span>
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 overflow-hidden rounded-xl border border-[#E2E8F0] sm:mt-4">
                      <div className="flex items-center justify-between gap-3 border-b border-[#E2E8F0] px-3 py-2.5 sm:px-4 sm:py-3">
                        <span className="text-xs font-semibold text-[#64748B] sm:text-sm">Top toàn trường</span>
                        <span className="shrink-0 text-sm font-bold text-[#0F172A] sm:text-base">#{rankingResult.rank} / {rankingResult.totalStudents}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 border-b border-[#E2E8F0] px-3 py-2.5 sm:px-4 sm:py-3">
                        <span className="text-xs font-semibold text-[#64748B] sm:text-sm">Tỷ lệ toàn trường</span>
                        <span className="shrink-0 text-sm font-bold text-[#0F172A] sm:text-base">{schoolTopPercentLabel}</span>
                      </div>
                      {rankingResult.rankInClass && (
                        <div className="flex items-center justify-between gap-3 border-b border-[#E2E8F0] px-3 py-2.5 sm:px-4 sm:py-3">
                          <span className="text-xs font-semibold text-[#64748B] sm:text-sm">Top trong lớp</span>
                          <span className="shrink-0 text-sm font-bold text-[#0F172A] sm:text-base">#{rankingResult.rankInClass} / {rankingResult.totalInClass}</span>
                        </div>
                      )}
                      {rankingResult.rankInMajor && (
                        <div className="flex items-center justify-between gap-3 border-b border-[#E2E8F0] px-3 py-2.5 sm:px-4 sm:py-3">
                          <span className="text-xs font-semibold text-[#64748B] sm:text-sm">Top trong ngành</span>
                          <span className="shrink-0 text-sm font-bold text-[#0F172A] sm:text-base">#{rankingResult.rankInMajor} / {rankingResult.totalInMajor}</span>
                        </div>
                      )}
                      <div className="flex items-start justify-between gap-3 px-3 py-2.5 sm:px-4 sm:py-3">
                        <span className="text-xs font-semibold text-[#64748B] sm:text-sm">Ngành</span>
                        <span className="min-w-0 text-right text-sm font-semibold text-[#0F172A] sm:text-base">{rankingResult.major || 'Chưa có dữ liệu'}</span>
                      </div>
                    </div>

                    <div className={`mt-3 rounded-xl border p-3 sm:mt-4 sm:p-4 ${scholarshipRankAssessment.className}`}>
                      <p className="text-sm font-bold text-[#0F172A] sm:text-base">Đánh giá học bổng</p>
                      <p className="mt-1 text-xs leading-5 text-[#334155] sm:text-sm sm:leading-6">
                        {scholarshipRankAssessment.text}
                      </p>
                    </div>

                    {rankingError && (
                      <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                        <AlertCircle size={14} />
                        {rankingError}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-6 text-center">
                    <BarChart2 size={36} className="mb-3 text-[#94A3B8]" />
                    <h5 className="text-lg font-bold text-[#0F172A]">Chọn học kỳ để xem xếp hạng</h5>
                    <p className="mt-1 max-w-md text-sm text-[#64748B]">Danh sách học kỳ nằm ở cột bên trái. Chọn một kỳ để xem top toàn trường, lớp, ngành và đánh giá học bổng.</p>
                    {rankingError && (
                      <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                        <AlertCircle size={14} />
                        {rankingError}
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>,
        document.body
      )}

      {false && showRankMenu && hasData && isValidFormat && (
        <div className="border-b border-[#E2E8F0] bg-[#F8FAFC] px-3 py-3 sm:px-6 sm:py-4">
          <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
            <div className="flex items-start justify-between gap-3 bg-[#003375] px-4 py-3 text-white">
              <div>
                <h4 className="flex items-center gap-2 text-base font-bold">
                  <BarChart2 size={16} />
                  Xếp hạng học kỳ
                </h4>
                <p className="mt-1 text-xs text-white/75">
                  Chọn kỳ so sánh và xem xếp hạng học bổng theo dữ liệu hiện có.
                </p>
              </div>
              <button
                onClick={() => { setShowRankMenu(false); resetSemesterRanks(); }}
                className="rounded-full p-1.5 transition-colors hover:bg-white/20"
                title="Đóng"
              >
                <X size={16} />
              </button>
            </div>

            {rankingLoading ? (
              <div className="flex flex-col items-center justify-center bg-[#F8FAFC] py-8 text-[#003375]">
                <Loader2 size={30} className="mb-2 animate-spin" />
                <span className="text-sm font-medium">Đang tính toán...</span>
              </div>
            ) : rankingResult ? (
              <div className="bg-[#F8FAFC] p-3">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h5 className="text-base font-bold text-[#0F172A]">Xếp hạng học kỳ</h5>
                    <p className="mt-1 text-xs text-[#64748B]">{mapIdToDisplay(rankingResult.semesterId)}</p>
                  </div>
                  <button
                    onClick={() => resetResult()}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#334155] transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-[#003375]"
                  >
                    <ChevronLeft size={14} />
                    Chọn kỳ khác
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-[#E2E8F0] bg-white p-3">
                    <p className="text-[11px] font-semibold text-[#64748B]">GPA học kỳ</p>
                    <p className="mt-1 text-xl font-bold text-[#0F172A]">
                      {semGPA4.toFixed(2)} <span className="text-xs font-medium text-[#64748B]">/ 4.0</span>
                    </p>
                  </div>
                  <div className="rounded-lg border border-[#E2E8F0] bg-white p-3">
                    <p className="text-[11px] font-semibold text-[#64748B]">Điểm rèn luyện</p>
                    <p className="mt-1 text-xl font-bold text-[#0F172A]">
                      {semester.trainingScore ?? 0} <span className="text-xs font-medium text-[#64748B]">/ 100</span>
                    </p>
                  </div>
                </div>

                <div className="mt-2 overflow-hidden rounded-lg border border-[#E2E8F0] bg-white">
                  <div className="flex items-center justify-between border-b border-[#E2E8F0] px-3 py-2">
                    <span className="text-xs font-semibold text-[#64748B]">Top toàn trường</span>
                    <span className="text-sm font-bold text-[#0F172A]">#{rankingResult.rank} / {rankingResult.totalStudents}</span>
                  </div>
                  {rankingResult.rankInClass && (
                    <div className="flex items-center justify-between border-b border-[#E2E8F0] px-3 py-2">
                      <span className="text-xs font-semibold text-[#64748B]">Top trong lớp</span>
                      <span className="text-sm font-bold text-[#0F172A]">#{rankingResult.rankInClass} / {rankingResult.totalInClass}</span>
                    </div>
                  )}
                  {rankingResult.rankInMajor && (
                    <div className="flex items-center justify-between border-b border-[#E2E8F0] px-3 py-2">
                      <span className="text-xs font-semibold text-[#64748B]">Top trong ngành</span>
                      <span className="text-sm font-bold text-[#0F172A]">#{rankingResult.rankInMajor} / {rankingResult.totalInMajor}</span>
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-3 px-3 py-2">
                    <span className="text-xs font-semibold text-[#64748B]">Ngành</span>
                    <span className="text-sm font-semibold text-[#0F172A] text-right">{rankingResult.major || 'Chưa có dữ liệu'}</span>
                  </div>
                </div>

                <div className="mt-2 rounded-lg border border-emerald-200 bg-[#ECFDF5] p-3">
                  <p className="text-sm font-bold text-[#0F172A]">Đánh giá học bổng</p>
                  <p className="mt-1 text-xs leading-5 text-[#334155]">
                    Khả năng đạt học bổng rất cao. Tiếp tục duy trì GPA và điểm rèn luyện để tăng cơ hội nhận học bổng.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-[#F8FAFC] p-3">
                <div className="mb-3">
                  <h5 className="text-base font-bold text-[#0F172A]">Chọn học kỳ so sánh</h5>
                  <p className="mt-1 text-xs text-[#64748B]">Dữ liệu xếp hạng sẽ được áp dụng cho học kỳ bạn chọn.</p>
                </div>
                {loadingSemesters ? (
                  <div className="rounded-lg border border-[#E2E8F0] bg-white py-7 text-center text-sm text-[#64748B]">Đang tải...</div>
                ) : availableSemesters.length > 0 ? (
                  <div className="grid gap-2">
                    {availableSemesters.map((semId) => {
                      const semesterRank = semesterRanks[semId];
                      const rankLabel = Number.isFinite(semesterRank) ? `Hạng #${semesterRank}` : loadingSemesterRanks ? 'Đang tải...' : 'Chưa có hạng';
                      return (
                        <button
                          key={semId}
                          onClick={() => handleSelectReferenceSemester(semId)}
                          className="flex items-center justify-between gap-3 rounded-lg border border-[#E2E8F0] bg-white px-3 py-3 text-left text-sm font-semibold text-[#334155] transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-[#003375]"
                        >
                          <span>Dữ liệu {mapIdToDisplay(semId)} - {rankLabel}</span>
                          <ChevronRight size={16} className="shrink-0 text-[#003375]" />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-lg border border-[#E2E8F0] bg-white py-7 text-center text-sm text-[#64748B]">Chưa có dữ liệu.</div>
                )}
                {rankingError && (
                  <div className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                    <AlertCircle size={14} />
                    {rankingError}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {isValidFormat ? (
        <>
            {semester.subjects.length > 0 && (
                <div className="px-3 py-2 sm:px-6 sm:py-2 bg-gray-50/50 border-b border-gray-100 flex flex-row gap-2 justify-between sm:justify-end items-center">
                    <button onClick={handleSortToggle} className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-lg border text-[11px] sm:text-sm font-medium transition-all active:scale-95 ${sortOrder ? 'bg-blue-50 border-blue-200 text-[#003375] shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`} title="Sắp xếp theo điểm">
                        {sortOrder === 'desc' ? (<><ArrowDown className="text-yellow-500 w-3.5 h-3.5 sm:w-4 sm:h-4"/><span>Cao → Thấp</span></>) : sortOrder === 'asc' ? (<><ArrowUp className="text-yellow-500 w-3.5 h-3.5 sm:w-4 sm:h-4"/><span>Thấp → Cao</span></>) : (<><ListFilter className="w-3.5 h-3.5 sm:w-4 sm:h-4"/><span>Sắp xếp</span></>)}
                    </button>

                    <div className="relative shrink-0">
                        <button
                            type="button"
                            onClick={() => {
                                playClick();
                                setShowScoreColumns((value) => !value);
                            }}
                            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-all active:scale-95 sm:px-3 sm:text-sm ${
                                showScoreColumns ? 'border-blue-200 bg-blue-50 text-[#003375] shadow-sm' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                            }`}
                            title="Ẩn/hiện cột điểm"
                        >
                            <Filter className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            <span>Cột</span>
                        </button>

                        {showScoreColumns && (
                            <div className="absolute left-0 top-full z-30 mt-2 w-36 rounded-xl border border-gray-200 bg-white p-2 shadow-xl">
                                {scoreColumnConfig.map((column) => (
                                    <label key={column.key} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 text-xs font-semibold text-gray-700 hover:bg-blue-50 hover:text-[#003375]">
                                        <span>{column.label}</span>
                                        <input
                                            type="checkbox"
                                            checked={visibleScoreColumns[column.key]}
                                            onChange={(event) => {
                                                playClick();
                                                setVisibleScoreColumns((prev) => ({ ...prev, [column.key]: event.target.checked }));
                                            }}
                                            className="h-3.5 w-3.5 rounded border-gray-300 text-[#003375] focus:ring-[#003375]"
                                        />
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="relative flex-1 sm:w-64 sm:flex-none">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        <input type="text" placeholder="Tìm môn học..." className="w-full pl-8 pr-7 py-1.5 text-[11px] sm:text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-shadow hover:border-blue-300" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                        {searchTerm && (<button onClick={() => { playClick(); setSearchTerm(''); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 hover:scale-110 transition-transform"><X className="w-3 h-3 sm:w-3.5 sm:h-3.5" /></button>)}
                    </div>
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                <thead className="text-xs text-white uppercase bg-[#003375] border-b border-[#002855]">
                    <tr>
                        <th className="px-3 py-3 w-10 text-center">STT</th>
                        {visibleScoreColumnConfig.map((column) => (
                            <th key={column.key} className="px-2 py-3 w-14 text-center">{column.label}</th>
                        ))}
                        <th className="px-3 py-3 min-w-[180px]">Môn học</th>
                        <th className="px-2 py-3 w-12 text-center">TC</th>
                        <th className="px-2 py-3 w-14 text-center">TB(10)</th>
                        <th className="px-2 py-3 w-14 text-center">Chữ</th>
                        <th className="px-2 py-3 w-14 text-center">TB(4)</th>
                        <th className="px-3 py-3 w-20 text-center">Trạng thái</th>
                        <th className="px-2 py-3 w-8"></th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {processedSubjects.length > 0 ? (
                        processedSubjects.map((subject, sIdx) => {
                        const avg10 = calculateSubjectAverage(subject);
                        const { scale4: avg4, letter } = avg10 !== null ? getGradeDetails(avg10) : { scale4: null, letter: '-' };
                        const status = getSubjectStatus(avg10);

                        let statusClass = "text-gray-400";
                        let statusText = "-";
                        let rowClass = "hover:bg-blue-50/30";

                        if (status === GradeStatus.FAIL) {
                            statusClass = "bg-red-100 text-[#990000] font-bold";
                            statusText = "Rớt";
                            rowClass = "bg-red-50/50 hover:bg-red-100/50";
                        } else if (status === GradeStatus.IMPROVE) {
                            statusClass = "bg-yellow-100 text-yellow-700";
                            statusText = "Đạt";
                        } else if (status === GradeStatus.PASS) {
                            statusClass = "bg-green-100 text-green-700 font-bold";
                            statusText = "Đạt";
                        }

                        return (
                            <tr key={subject.id} className={`${rowClass} transition-colors duration-150 group`}>
                                <td className="px-3 py-2 text-center text-gray-500">{sIdx + 1}</td>

                                {visibleScoreColumnConfig.map((column) => (
                                    <td key={column.key} className="px-1 py-2">
                                        <ScoreInput value={subject[column.key as keyof Subject] as number | null} onChange={(val) => handleSubjectChange(subject.id, column.key as keyof Subject, val)} />
                                    </td>
                                ))}

                                <td className="px-3 py-2">
                                    <input type="text" className="w-full bg-transparent border-b border-transparent focus:border-[#003375] focus:outline-none p-1 font-medium text-gray-800 transition-colors group-hover:text-[#003375]" value={subject.name} onChange={(e) => handleSubjectChange(subject.id, 'name', e.target.value)} />
                                    <div className="flex items-center gap-2 mt-1">
                                        <label className="text-[10px] text-gray-500 flex items-center gap-1 cursor-pointer select-none hover:text-[#003375] transition-colors">
                                            <input type="checkbox" checked={subject.isNonGPA} onChange={(e) => { playClick(); handleSubjectChange(subject.id, 'isNonGPA', e.target.checked); }} className="rounded text-[#003375] border-gray-300 focus:ring-[#003375] w-3 h-3 mr-1" />
                                            Không tính GPA
                                        </label>
                                    </div>
                                </td>

                                <td className="px-1 py-2">
                                    <input type="number" className="w-full bg-white border border-gray-300 rounded p-1 text-center font-semibold text-gray-700 focus:ring-1 focus:ring-[#003375] focus:border-[#003375] hover:border-gray-400" value={subject.credits} onChange={(e) => handleSubjectChange(subject.id, 'credits', parseInt(e.target.value) || 0)} />
                                </td>

                                <td className="px-2 py-2 text-center font-bold text-[#990000]">{avg10 !== null ? avg10.toFixed(1) : '-'}</td>
                                <td className="px-2 py-2 text-center font-bold text-gray-700">{letter}</td>
                                <td className="px-2 py-2 text-center font-bold text-[#003375]">{avg4 !== null ? avg4.toFixed(1) : '-'}</td>
                                <td className="px-3 py-2 text-center"><span className={`px-2 py-1 rounded text-xs block w-full text-center ${statusClass}`}>{statusText}</span></td>
                                <td className="px-2 py-2 text-center">
                                    <button onClick={() => removeSubject(subject.id)} className="text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all p-1.5 border border-transparent hover:border-red-200 active:scale-90" title="Xóa môn"><Trash2 size={16} /></button>
                                </td>
                            </tr>
                        );
                        })
                    ) : (
                        <tr><td colSpan={8 + visibleScoreColumnConfig.length} className="py-8 text-center text-gray-500">Không tìm thấy môn học nào phù hợp với "{searchTerm}"</td></tr>
                    )}
                </tbody>
                </table>
            </div>
            {!isReadOnly && (
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 rounded-b-xl flex justify-between items-center">
                <button onClick={addSubject} className="flex items-center gap-1 text-sm font-medium text-[#003375] hover:text-blue-700 transition-all hover:translate-x-1 p-1 active:scale-95"><Plus size={16} /> Thêm môn học</button>
            </div> )}
        </>
      ) : (
          <div className="p-8 text-center bg-red-50/40 border-t border-red-100 flex flex-col items-center justify-center rounded-b-xl">
              <ShieldAlert className="text-red-400 mb-2 w-10 h-10 animate-pulse" />
              <p className="text-red-600 font-bold mb-1">Nội dung học kỳ đang bị khóa</p>
              <p className="text-red-500/80 text-xs max-w-sm">Tên học kỳ không hợp lệ. Vui lòng chọn một tên học kỳ có sẵn trong danh sách phía trên để mở khóa tính năng nhập điểm!</p>
          </div>
      )}
    </div>
  );
};

type MobileLearningTab = 'gpa' | 'schedule';

export interface MobileTrendPoint {
  name: string;
  gpa4: number | null;
  gpa10: number | null;
}

export interface MobileSemesterRecord {
  semester: Semester;
  originalIndex: number;
}

export interface MobileDashboardNativeProps {
  stats: {
    gpa4: number;
    gpa10: number;
    passedCredits: number;
  };
  totalCreditsRequired: number;
  isLocked: boolean;
  trendData: MobileTrendPoint[];
  semesters?: MobileSemesterRecord[];
  trendAnalysis?: string;
  activeTab: MobileLearningTab;
  onTabChange: (tab: MobileLearningTab) => void;
  scheduleContent?: React.ReactNode;
  hideLearningTabs?: boolean;
  isManagementUser?: boolean;
  showEmbeddedBottomNav?: boolean;
  onOpenRanking?: () => void;
  onOpenTargetForecast?: () => void;
  onRequireOnboarding?: () => void;
  onOpenLookback?: () => void;
  onOpenFailed?: () => void;
  onExportPDF?: () => void;
  onImportPDF?: () => void;
  onAddSemester?: () => void;
  onUpdateSemester?: (index: number, semester: Semester) => void;
  onRemoveSemester?: (index: number) => void;
  isTranscriptEditing?: boolean;
  isSavingTranscript?: boolean;
  onStartTranscriptEdit?: () => void;
  onSaveTranscriptEdit?: () => void;
  onCancelTranscriptEdit?: () => void;
  isImporting?: boolean;
}

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

const formatMobileNumber = (value: number, digits = 2) => {
  if (!Number.isFinite(value)) return (0).toFixed(digits);
  return value.toFixed(digits);
};

const NativeStatusSpacer = () => (
  <div className="h-[calc(env(safe-area-inset-top)+16px)] shrink-0" aria-hidden="true" />
);

const NativeSegmentedTabs = ({
  activeTab,
  onTabChange,
}: {
  activeTab: MobileLearningTab;
  onTabChange: (tab: MobileLearningTab) => void;
}) => {
  const tabs = [
    { id: 'gpa' as const, label: 'Điểm số & Lộ trình', icon: BarChart3 },
    { id: 'schedule' as const, label: 'Lịch học & Thi', icon: CalendarDays },
  ];

  return (
    <div className="relative mx-6 mb-5 grid grid-cols-2 gap-2 overflow-hidden rounded-2xl bg-white p-1 shadow-[0_2px_14px_rgba(13,27,62,0.08)]">
      <span
        aria-hidden="true"
        className={`absolute bottom-1 left-1 top-1 w-[calc((100%-1rem)/2)] rounded-xl bg-[#1A56FF] shadow-[0_5px_14px_rgba(26,86,255,0.34)] transition-transform duration-500 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] ${activeTab === 'schedule' ? 'translate-x-[calc(100%+0.5rem)]' : 'translate-x-0'}`}
      />
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`relative z-10 flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl px-2 text-[12px] font-extrabold transition-colors duration-300 ${
              isActive
                ? 'text-white'
                : 'text-[#9AA5C0] active:bg-slate-50'
            }`}
          >
            <Icon size={14} strokeWidth={2.5} />
            <span className="truncate">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
};

const NativeStatCard = ({
  title,
  value,
  suffix,
  subLabel,
  subValue,
  progress,
  tone,
  icon,
}: {
  title: string;
  value: string;
  suffix: string;
  subLabel: string;
  subValue: string;
  progress: number;
  tone: 'blue' | 'green';
  icon: React.ReactNode;
}) => {
  return (
    <div className="min-w-0 rounded-[20px] bg-white p-4 shadow-[0_2px_14px_rgba(13,27,62,0.06)]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="min-w-0 text-[11.5px] font-bold leading-tight text-[#7B8AB0]">{title}</span>
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
            tone === 'green' ? 'bg-[#EDFAF3] text-[#00C07F]' : 'bg-[#EEF2FF] text-[#1A56FF]'
          }`}
        >
          {icon}
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <span
          className={`text-[28px] font-black leading-none tracking-normal ${tone === 'green' ? 'text-[#00C07F]' : 'text-[#1A56FF]'}`}
        >
          {value}
        </span>
        <span className="text-[12px] font-bold text-[#B0BCDA]">{suffix}</span>
      </div>
      <div className="mt-2 text-[11px] font-semibold text-[#7B8AB0]">
        {subLabel}: <span className="font-black text-[#0D1B3E]">{subValue}</span>
      </div>
      <div className={`mt-2.5 h-1 overflow-hidden rounded-full ${tone === 'green' ? 'bg-emerald-50' : 'bg-[#EEF2FF]'}`}>
        <progress
          className={`native-stat-progress-bar h-full w-full rounded-full ${tone === 'green' ? 'native-stat-progress-green' : 'native-stat-progress-blue'}`}
          value={clampPercent(progress)}
          max={100}
        />
      </div>
    </div>
  );
};

const NativeFeatureCard = ({
  title,
  description,
  icon,
  locked,
  onClick,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  locked: boolean;
  onClick?: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="min-w-0 rounded-[20px] bg-white p-3 text-left shadow-[0_2px_14px_rgba(13,27,62,0.06)] active:scale-[0.99]"
  >
    <div className="mb-3 flex items-center justify-between gap-2 text-[12px] font-black text-[#0D1B3E]">
      <span className="truncate">{title}</span>
      {icon}
    </div>
    <div className="flex flex-col items-center gap-1.5 px-1 pb-1 text-center">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F0F2F8] text-[#7B8AB0]">
        {locked ? <Lock size={16} strokeWidth={2.2} /> : <ChevronRight size={17} strokeWidth={2.5} />}
      </div>
      <div className="text-[12px] font-black text-[#1A56FF]">{locked ? 'Đăng nhập để xem' : 'Xem chi tiết'}</div>
      <p className="line-clamp-2 text-[10.5px] font-medium leading-snug text-[#9AA5C0]">{description}</p>
    </div>
  </button>
);

const NativeTrendCard = ({
  isLocked,
  trendData,
}: {
  isLocked: boolean;
  trendData: MobileTrendPoint[];
}) => {
  const hasData = !isLocked && trendData.length > 0;

  return (
    <section className="mx-6 mb-3 rounded-[20px] bg-white px-[18px] py-4 shadow-[0_2px_14px_rgba(13,27,62,0.06)]">
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <h2 className="text-[14px] font-black text-[#0D1B3E]">Xu hướng học tập</h2>
        <div className="flex items-center gap-2.5">
          <span className="flex items-center gap-1 text-[10.5px] font-bold text-[#7B8AB0]">
            <i className="h-1.5 w-1.5 rounded-full bg-[#1A56FF]" /> Hệ 4
          </span>
          <span className="flex items-center gap-1 text-[10.5px] font-bold text-[#7B8AB0]">
            <i className="h-1.5 w-1.5 rounded-full bg-[#FF5C6A]" /> Hệ 10
          </span>
        </div>
      </div>

      {hasData ? (
        <div className="h-[132px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid stroke="#EEF2FF" strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9AA5C0', fontWeight: 700 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="gpa4" domain={[0, 4]} tick={{ fontSize: 10, fill: '#9AA5C0' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="gpa10" domain={[0, 10]} hide />
              <RechartsTooltip
                contentStyle={{
                  border: '1px solid #EEF2FF',
                  borderRadius: 12,
                  boxShadow: '0 10px 30px rgba(13,27,62,0.12)',
                  fontSize: 12,
                }}
              />
              <Line yAxisId="gpa4" type="monotone" dataKey="gpa4" stroke="#1A56FF" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              <Line yAxisId="gpa10" type="monotone" dataKey="gpa10" stroke="#FF5C6A" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-[112px] flex-col items-center justify-center gap-1.5 rounded-[14px] border border-dashed border-[#DDE3F0] bg-[#F6F8FC] px-5 text-center">
          <Lock size={30} className="text-[#C0CBDF]" strokeWidth={1.9} />
          <div className="text-[13px] font-black text-[#1A56FF]">{isLocked ? 'Biểu đồ đã bị khóa' : 'Chưa có dữ liệu xu hướng'}</div>
          <p className="text-[11px] font-medium leading-snug text-[#9AA5C0]">
            {isLocked ? 'Đăng nhập để mở khóa và xem biểu đồ xu hướng học tập.' : 'Thêm điểm học kỳ để xem biểu đồ xu hướng học tập.'}
          </p>
        </div>
      )}
    </section>
  );
};

const NativeEvaluationRow = ({ text }: { text?: string }) => (
  <button
    type="button"
    className="mx-6 mb-4 flex w-[calc(100%-3rem)] items-center justify-between rounded-[20px] bg-white px-[18px] py-4 text-left shadow-[0_2px_14px_rgba(13,27,62,0.06)] active:scale-[0.99]"
  >
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#1A56FF]">
        <BarChart3 size={18} strokeWidth={2.4} />
      </div>
      <div className="min-w-0">
        <div className="text-[13.5px] font-black text-[#0D1B3E]">Đánh giá học tập</div>
        <p className="line-clamp-2 text-[11px] font-semibold leading-snug text-[#9AA5C0]">{text || 'Chưa đủ dữ liệu để đánh giá'}</p>
      </div>
    </div>
    <ChevronRight size={18} className="shrink-0 text-[#C0CBDF]" strokeWidth={2.5} />
  </button>
);

const NativeQuickActions = ({
  onOpenLookback,
  onOpenFailed,
  onExportPDF,
  onImportPDF,
  onAddSemester,
  isTranscriptEditing,
  isSavingTranscript,
  onStartTranscriptEdit,
  onSaveTranscriptEdit,
  onCancelTranscriptEdit,
  isImporting,
}: Pick<
  MobileDashboardNativeProps,
  'onOpenLookback' | 'onOpenFailed' | 'onExportPDF' | 'onImportPDF' | 'onAddSemester' | 'isTranscriptEditing' | 'isSavingTranscript' | 'onStartTranscriptEdit' | 'onSaveTranscriptEdit' | 'onCancelTranscriptEdit' | 'isImporting'
>) => {
  const actions = [
    ...(isTranscriptEditing
      ? [
          { label: 'Lưu điểm', icon: Check, onClick: onSaveTranscriptEdit, disabled: isSavingTranscript },
          { label: 'Hủy sửa', icon: X, onClick: onCancelTranscriptEdit, disabled: isSavingTranscript },
        ]
      : [{ label: 'Sửa điểm', icon: Edit3, onClick: onStartTranscriptEdit }]),
    { label: 'Tổng kết', icon: Star, onClick: onOpenLookback },
    { label: 'Môn cần chú ý', icon: Trophy, onClick: onOpenFailed },
    { label: 'Nhập PDF', icon: FileUp, onClick: onImportPDF, disabled: isImporting },
    { label: 'Xuất PDF', icon: Download, onClick: onExportPDF },
    { label: 'Thêm kỳ', icon: Plus, onClick: isTranscriptEditing ? onAddSemester : undefined },
  ].filter((item) => Boolean(item.onClick));

  if (actions.length === 0) return null;

  return (
    <section className="mx-6 mb-5 rounded-[20px] bg-white p-4 shadow-[0_2px_14px_rgba(13,27,62,0.06)]">
      <div className="mb-3 text-[13.5px] font-black text-[#0D1B3E]">Công cụ nhanh</div>
      <div className="grid grid-cols-3 gap-2">
        {actions.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              disabled={item.disabled}
              className="flex min-h-[58px] flex-col items-center justify-center gap-1.5 rounded-2xl bg-[#F6F8FC] px-2 text-center text-[10.5px] font-black leading-tight text-[#0D1B3E] transition active:scale-[0.98] disabled:opacity-50"
            >
              <Icon size={17} className="text-[#1A56FF]" strokeWidth={2.3} />
              <span>{item.disabled ? 'Đang nhập' : item.label}</span>
            </button>
          );
        })}
        <Link
          to="/handbook/plagiarism"
          onClick={playClick}
          className="flex min-h-[58px] flex-col items-center justify-center gap-1.5 rounded-2xl bg-[#F6F8FC] px-2 text-center text-[10.5px] font-black leading-tight text-[#0D1B3E] transition active:scale-[0.98]"
        >
          <ShieldCheck size={17} className="text-[#7B2FFF]" strokeWidth={2.3} />
          <span>Check đạo văn</span>
        </Link>
      </div>
    </section>
  );
};

const NativeAdminTools = () => {
  const { isAdmin, isAuditor } = useUserRole();
  const tools = [
    {
      to: '/admin/data',
      label: 'Trung tâm dữ liệu',
      description: 'Theo dõi tình trạng đồng bộ dữ liệu Cloudflare.',
      icon: Database,
      className: 'bg-indigo-50 text-indigo-600',
      visible: isAdmin,
    },
    {
      to: '/admin/ai-documents',
      label: 'Kho tài liệu AI',
      description: 'Quản lý tài liệu dùng bởi trợ lý HUB Planner.',
      icon: Database,
      className: 'bg-blue-50 text-blue-700',
      visible: isAdmin,
    },
    {
      to: '/admin/internal-accounts',
      label: 'Tài khoản nội bộ',
      description: 'Quản lý tài khoản test, demo và QA tách biệt sinh viên.',
      icon: Users,
      className: 'bg-violet-50 text-violet-700',
      visible: isAdmin,
    },
    {
      to: '/admin-reports',
      label: 'Báo cáo quản trị',
      description: 'Xử lý báo cáo lỗi, CTV và góp ý.',
      icon: ClipboardList,
      className: 'bg-red-50 text-red-600',
      visible: isAdmin || isAuditor,
    },
    {
      to: '/admin/event-candidates',
      label: 'Duyệt đề xuất sự kiện',
      description: 'Duyệt đề xuất sự kiện từ cộng tác viên.',
      icon: CalendarDays,
      className: 'bg-blue-50 text-[#1A56FF]',
      visible: isAdmin || isAuditor,
    },
    {
      to: '/admin/activity',
      label: 'Nhật ký hoạt động',
      description: 'Theo dõi hoạt động quản trị hệ thống.',
      icon: Activity,
      className: 'bg-emerald-50 text-emerald-600',
      visible: isAdmin,
    },
  ].filter(tool => tool.visible);

  if (tools.length === 0) return null;

  return (
    <section className="mx-6 mb-3 rounded-[20px] bg-white p-4 shadow-[0_2px_14px_rgba(13,27,62,0.06)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[13.5px] font-black text-[#0D1B3E]">Công cụ quản trị</div>
          <p className="mt-0.5 text-[10.5px] font-semibold leading-snug text-[#7B8AB0]">Truy cập nhanh các khu vực kiểm duyệt trên mobile.</p>
        </div>
        <ShieldCheck size={18} className="shrink-0 text-[#1A56FF]" strokeWidth={2.4} />
      </div>
      <div className="grid grid-cols-1 gap-2">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link
              key={tool.to}
              to={tool.to}
              onClick={playClick}
              className="flex items-center gap-3 rounded-2xl bg-[#F6F8FC] p-3 active:scale-[0.99]"
            >
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tool.className}`}>
                <Icon size={18} strokeWidth={2.3} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-black leading-tight text-[#0D1B3E]">{tool.label}</span>
                <span className="mt-0.5 line-clamp-2 block text-[10.5px] font-semibold leading-snug text-[#7B8AB0]">{tool.description}</span>
              </span>
              <ChevronRight size={17} className="shrink-0 text-[#C0CBDF]" strokeWidth={2.5} />
            </Link>
          );
        })}
      </div>
    </section>
  );
};

const buildNativeSemesterOptions = () => {
  const options: string[] = [];
  for (let y = 2020; y <= 2027; y += 1) {
    options.push(`Học kỳ 1 Năm học ${y}-${y + 1}`);
    options.push(`Học kỳ 2 Năm học ${y}-${y + 1}`);
  }
  return options.reverse();
};

const toNativeScoreInput = (value: number | null) => value === null || value === undefined ? '' : String(value);

const parseNativeScoreInput = (value: string) => {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(10, parsed)) : null;
};

const NativeTranscriptList = ({
  semesters = [],
  onUpdateSemester,
  onRemoveSemester,
  isReadOnly = false,
}: {
  semesters?: MobileSemesterRecord[];
  onUpdateSemester?: (index: number, semester: Semester) => void;
  onRemoveSemester?: (index: number) => void;
  isReadOnly?: boolean;
}) => {
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [draftSubject, setDraftSubject] = useState<Subject | null>(null);
  const semesterOptions = useMemo(buildNativeSemesterOptions, []);

  const startEditSubject = (subject: Subject) => {
    setEditingSubjectId(subject.id);
    setDraftSubject({ ...subject });
  };

  const cancelEditSubject = () => {
    setEditingSubjectId(null);
    setDraftSubject(null);
  };

  const updateSubject = (record: MobileSemesterRecord, subject: Subject) => {
    onUpdateSemester?.(record.originalIndex, {
      ...record.semester,
      subjects: record.semester.subjects.map(item => item.id === subject.id ? subject : item),
    });
    cancelEditSubject();
  };

  const updateDraftSubject = (record: MobileSemesterRecord, nextSubject: Subject) => {
    setDraftSubject(nextSubject);
    onUpdateSemester?.(record.originalIndex, {
      ...record.semester,
      subjects: record.semester.subjects.map(item => item.id === nextSubject.id ? nextSubject : item),
    });
  };

  const addSubject = (record: MobileSemesterRecord) => {
    const newSubject: Subject = {
      id: Date.now().toString(),
      name: '',
      credits: 3,
      scoreCC: null,
      scoreProcess: null,
      scoreMid: null,
      scoreFinal: null,
      isNonGPA: false,
    };

    onUpdateSemester?.(record.originalIndex, {
      ...record.semester,
      subjects: [...record.semester.subjects, newSubject],
    });
    startEditSubject(newSubject);
  };

  const deleteSubject = (record: MobileSemesterRecord, subjectId: string) => {
    onUpdateSemester?.(record.originalIndex, {
      ...record.semester,
      subjects: record.semester.subjects.filter(subject => subject.id !== subjectId),
    });
    if (editingSubjectId === subjectId) cancelEditSubject();
  };

  if (semesters.length === 0) {
    return (
      <section className="mx-6 mb-6 rounded-[20px] bg-white p-5 text-center shadow-[0_2px_14px_rgba(13,27,62,0.06)]">
        <div className="text-[14px] font-black text-[#0D1B3E]">Chi tiết bảng điểm</div>
        <p className="mt-2 text-[12px] font-semibold leading-snug text-[#9AA5C0]">Chưa có dữ liệu học kỳ. Hãy nhập PDF hoặc thêm học kỳ để xem bảng điểm.</p>
      </section>
    );
  }

  return (
    <section className="mx-6 mb-7">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-black text-[#0D1B3E]">Chi tiết bảng điểm</h2>
          <p className="text-[11px] font-semibold text-[#9AA5C0]">Hiển thị dạng thẻ để dễ đọc trên điện thoại.</p>
        </div>
      </div>

      <div className="space-y-3">
        {semesters.map((record) => {
          const semester = record.semester;
          const semStats = calculateSemesterStats(semester.subjects);
          const subjects = semester.subjects || [];
          const hasValidName = /^Học kỳ (1|2) Năm học \d{4}-\d{4}$/.test(semester.name);

          return (
            <article key={semester.id} className="overflow-hidden rounded-[20px] bg-white shadow-[0_2px_14px_rgba(13,27,62,0.06)]">
              <div className="border-b border-[#EEF2FF] px-4 py-3">
                <select
                  value={semester.name}
                  disabled={isReadOnly}
                  onChange={(event) => onUpdateSemester?.(record.originalIndex, { ...semester, name: event.target.value })}
                  className="w-full rounded-xl border border-[#DDE3F0] bg-[#F6F8FC] px-3 py-2 text-[12px] font-black text-[#1A56FF] outline-none focus:border-[#1A56FF]"
                >
                  {!hasValidName && <option value="">Chọn học kỳ</option>}
                  {semesterOptions.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-bold text-[#7B8AB0]">
                  <span>{subjects.length} môn</span>
                  <span className="h-1 w-1 rounded-full bg-[#C0CBDF]" />
                  <span>{semStats.totalCredits || 0} tín chỉ</span>
                  <span className="h-1 w-1 rounded-full bg-[#C0CBDF]" />
                  <span>GPA {semStats.hasData ? semStats.gpa4.toFixed(2) : '--'}</span>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => addSubject(record)}
                    disabled={isReadOnly}
                    className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#EEF2FF] text-[11px] font-black text-[#1A56FF]"
                  >
                    <Plus size={14} /> Thêm môn
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveSemester?.(record.originalIndex)}
                    disabled={isReadOnly}
                    className="flex h-8 items-center justify-center rounded-xl bg-red-50 px-3 text-red-600"
                    aria-label="Xóa học kỳ"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {subjects.length > 0 ? (
                <div className="divide-y divide-[#F0F2F8]">
                  {subjects.map((subject) => {
                    const isEditing = editingSubjectId === subject.id && draftSubject;
                    const avg = calculateSubjectAverage(subject);
                    const details = avg !== null ? getGradeDetails(avg) : null;
                    const scoreColor = avg === null ? 'text-[#9AA5C0]' : avg < 4 ? 'text-red-600' : avg >= 8.5 ? 'text-emerald-600' : 'text-[#1A56FF]';

                    if (isEditing) {
                      return (
                        <div key={subject.id} className="space-y-3 bg-[#F8FAFC] px-4 py-3">
                          <input
                            value={draftSubject.name}
                            onChange={(event) => updateDraftSubject(record, { ...draftSubject, name: event.target.value })}
                            placeholder="Tên môn học"
                            className="h-10 w-full rounded-xl border border-[#DDE3F0] bg-white px-3 text-[12px] font-bold text-[#0D1B3E] outline-none focus:border-[#1A56FF]"
                          />
                          <div className="grid grid-cols-5 gap-2">
                            <input
                              value={draftSubject.credits}
                              onChange={(event) => updateDraftSubject(record, { ...draftSubject, credits: Number(event.target.value) || 0 })}
                              type="number"
                              min="0"
                              className="h-9 rounded-xl border border-[#DDE3F0] bg-white px-2 text-center text-[11px] font-bold outline-none focus:border-[#1A56FF]"
                              aria-label="Tín chỉ"
                            />
                            {[
                              ['CC', 'scoreCC'],
                              ['QT', 'scoreProcess'],
                              ['GK', 'scoreMid'],
                              ['CK', 'scoreFinal'],
                            ].map(([label, key]) => (
                              <input
                                key={key}
                                value={toNativeScoreInput(draftSubject[key as keyof Subject] as number | null)}
                                onChange={(event) => updateDraftSubject(record, { ...draftSubject, [key]: parseNativeScoreInput(event.target.value) })}
                                placeholder={label}
                                type="number"
                                min="0"
                                max="10"
                                step="0.1"
                                className="h-9 rounded-xl border border-[#DDE3F0] bg-white px-2 text-center text-[11px] font-bold outline-none focus:border-[#1A56FF]"
                              />
                            ))}
                          </div>
                          <label className="flex items-center gap-2 text-[11px] font-bold text-[#7B8AB0]">
                            <input
                              type="checkbox"
                              checked={draftSubject.isNonGPA}
                              onChange={(event) => updateDraftSubject(record, { ...draftSubject, isNonGPA: event.target.checked })}
                              className="h-4 w-4 rounded border-[#DDE3F0]"
                            />
                            Không tính GPA
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => updateSubject(record, draftSubject)}
                              className="flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#1A56FF] text-[12px] font-black text-white"
                            >
                              <Check size={15} /> Lưu
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditSubject}
                              className="h-9 rounded-xl bg-slate-100 text-[12px] font-black text-slate-600"
                            >
                              Đóng
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={subject.id} className="flex items-start justify-between gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="line-clamp-2 text-[12.5px] font-black leading-snug text-[#0D1B3E]">{subject.name || 'Môn chưa đặt tên'}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px] font-bold text-[#9AA5C0]">
                            <span>{subject.credits || 0} tín chỉ</span>
                            {subject.isNonGPA && (
                              <>
                                <span>·</span>
                                <span>Không tính GPA</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className={`text-[15px] font-black leading-none ${scoreColor}`}>{avg === null ? '--' : avg.toFixed(1)}</div>
                          <div className="mt-1 text-[10.5px] font-black text-[#7B8AB0]">{details ? `${details.letter} · ${details.scale4.toFixed(1)}` : 'Chưa có'}</div>
                          <div className="mt-2 flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => startEditSubject(subject)}
                              disabled={isReadOnly}
                              className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EEF2FF] text-[#1A56FF]"
                              aria-label="S?a môn"
                            >
                              <Edit3 size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteSubject(record, subject.id)}
                              disabled={isReadOnly}
                              className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 text-red-600"
                              aria-label="Xóa môn"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="px-4 py-5 text-center text-[12px] font-semibold text-[#9AA5C0]">Học kỳ này chưa có môn học.</div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
};

const NativeAIFloatingButton = () => (
  <button
    type="button"
    className="absolute bottom-[86px] right-[18px] z-20 flex h-[52px] w-[52px] flex-col items-center justify-center gap-0.5 rounded-[18px] bg-gradient-to-br from-[#1A56FF] to-[#7B2FFF] text-white shadow-[0_8px_22px_rgba(26,86,255,0.45)]"
    aria-label="M? tr? lý AI"
  >
    <Sparkles size={18} strokeWidth={2.3} />
    <span className="text-[9px] font-black tracking-wide">AI</span>
  </button>
);

const NativeBottomNavigation = () => {
  const items = [
    { label: 'Trang chủ', icon: Home, active: false },
    { label: 'Học tập', icon: BookOpen, active: true },
    { label: 'Sự kiện', icon: CalendarDays, active: false },
    { label: 'Tìm đồ', icon: Search, active: false },
    { label: 'Cá nhân', icon: User, active: false },
  ];

  return (
    <nav className="absolute inset-x-0 bottom-0 z-10 flex border-t border-[#EEF2FF] bg-white px-1 pb-6 pt-2.5 shadow-[0_-10px_24px_rgba(13,27,62,0.06)]">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button key={item.label} type="button" className="flex flex-1 flex-col items-center gap-1">
            <span className={`flex h-8 w-8 items-center justify-center rounded-[10px] ${item.active ? 'bg-[#EEF2FF] text-[#1A56FF]' : 'text-[#B0BCDA]'}`}>
              <Icon size={20} strokeWidth={2.2} />
            </span>
            <span className={`text-[10px] font-bold ${item.active ? 'text-[#1A56FF]' : 'text-[#B0BCDA]'}`}>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};

const NativeAdminStudentManager = () => {
  const { isAdmin, isAuditor } = useUserRole();
  const [searchValue, setSearchValue] = useState('');
  const [students, setStudents] = useState<any[]>([]);
  const [studentsPage, setStudentsPage] = useState(0);
  const [studentsTotal, setStudentsTotal] = useState(0);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [sortMode, setSortMode] = useState<'updated' | 'name'>('updated');

  const query = searchValue.trim();
  const canUseAdminSearch = isAdmin || isAuditor;

  const getUsableSemesters = (data: any) => Array.isArray(data?.semesters)
    ? data.semesters.filter((semester: any) => Array.isArray(semester?.subjects))
    : [];

  const hydrateStudent = (profile: any, privateEntry?: any) => {
    const fullData = privateEntry?.data;
    const data = fullData || {
      studentName: privateEntry?.student_name || profile.full_name || '',
      programName: privateEntry?.program_name || '',
      cohort: privateEntry?.cohort || '',
      majorName: privateEntry?.major_name || '',
      specializationName: privateEntry?.specialization_name || '',
    };
    const usableSemesters = Array.isArray(data?.semesters)
      ? data.semesters.filter((semester: any) => Array.isArray(semester?.subjects))
      : [];
    const stats = fullData ? calculateCumulativeStats(usableSemesters) : null;
    return {
      ...profile,
      data,
      email: privateEntry?.email,
      updated_at: privateEntry?.updated_at || profile.updated_at,
      isProfileSummary: !fullData,
      gpa4: stats?.rawGPA4 || 0,
      gpa10: stats?.gpa10 || 0,
      credits: stats?.passedCredits || 0,
      semesterCount: usableSemesters.length,
    };
  };

  const STUDENT_PAGE_SIZE = 10;
  const fetchStudents = async (forceQuery = query, page = studentsPage) => {
    const safeQuery = forceQuery.replace(/[%,]/g, ' ').trim();
    if (!canUseAdminSearch || safeQuery.length < 2) {
      setStudents([]);
      setStudentsTotal(0);
      return;
    }

    setLoadingStudents(true);
    try {
      const pageOffset = Math.max(0, page) * STUDENT_PAGE_SIZE;
      const { data: profileRows, total } = await searchStaffProfilesPage(safeQuery, {
        limit: STUDENT_PAGE_SIZE,
        offset: pageOffset,
      });
      const privateMap = profileRows.reduce((map: Record<string, any>, row: any) => {
        map[row.id] = row;
        return map;
      }, {});
      setStudents(profileRows.map(profile => hydrateStudent(profile, privateMap[profile.id])));
      setStudentsTotal(total || 0);
      setStudentsPage(page);
    } catch (error) {
      console.error('Không thể tìm sinh viên:', error);
      setStudents([]);
      setStudentsTotal(0);
    } finally {
      setLoadingStudents(false);
    }
  };

  useEffect(() => {
    if (!canUseAdminSearch) return;
    if (query.length < 2) {
      setStudents([]);
      setStudentsTotal(0);
      return;
    }
    setStudentsPage(0);
    const timer = window.setTimeout(() => fetchStudents(query, 0), 400);
    return () => window.clearTimeout(timer);
  }, [query, canUseAdminSearch]);

  const filteredStudents = useMemo(() => {
    let result = [...students];
    if (sortMode === 'name') {
      result.sort((a, b) => (a.data?.studentName || a.full_name || '').localeCompare(b.data?.studentName || b.full_name || ''));
    }
    if (sortMode === 'updated') result.sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime());
    return result;
  }, [students, sortMode]);

  const studentTotalPages = Math.max(1, Math.ceil(studentsTotal / STUDENT_PAGE_SIZE));
  const goToStudentsPage = (page: number) => {
    const nextPage = Math.min(studentTotalPages - 1, Math.max(0, page));
    fetchStudents(query, nextPage);
  };
  const renderStudentPager = () => {
    if (studentsTotal <= STUDENT_PAGE_SIZE) return null;
    return (
      <div className="mt-2 flex items-center justify-between gap-2 rounded-2xl bg-[#F8FAFD] p-2">
        <button
          type="button"
          onClick={() => goToStudentsPage(studentsPage - 1)}
          disabled={studentsPage <= 0 || loadingStudents}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#1A56FF] shadow-sm disabled:opacity-40"
          aria-label="Trang trước"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 text-[11px] font-black text-[#7B8AB0]">
          <span>Trang</span>
          <input
            type="number"
            min={1}
            max={studentTotalPages}
            value={studentsPage + 1}
            onChange={(event) => goToStudentsPage((Number(event.target.value) || 1) - 1)}
            className="h-9 w-14 rounded-xl border border-[#E5EAF4] bg-white text-center text-[12px] font-black text-[#0D1B3E] outline-none"
          />
          <span>/ {studentTotalPages}</span>
        </div>
        <button
          type="button"
          onClick={() => goToStudentsPage(studentsPage + 1)}
          disabled={studentsPage >= studentTotalPages - 1 || loadingStudents}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#1A56FF] shadow-sm disabled:opacity-40"
          aria-label="Trang sau"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    );
  };

  const openStudentDetail = async (student: any) => {
    playClick();
    setSelectedStudent(student);
    if (!student.isProfileSummary) return;
    setLoadingDetail(true);
    try {
      const privateData = await fetchProfilePrivate(student.id);
      if (!privateData?.data) return;
      const fullStudent = hydrateStudent(
        student,
        { data: privateData.data, email: privateData.email, updated_at: privateData.updated_at || student.updated_at }
      );
      fullStudent.isProfileSummary = false;
      setSelectedStudent(fullStudent);
      setStudents(prev => prev.map(item => item.id === student.id ? fullStudent : item));
    } catch (error) {
      console.error('Không thể tải chi tiết sinh viên:', error);
    } finally {
      setLoadingDetail(false);
    }
  };

  const sortOptions = [
    { id: 'updated' as const, label: 'Mới cập nhật' },
    { id: 'name' as const, label: 'Tên A-Z' },
  ];

  return (
    <main className="relative overflow-visible pb-0">
      <div className="mb-2 px-6 text-[11px] font-black uppercase tracking-[0.08em] text-[#9AA5C0]">Quản lý sinh viên</div>

      <section className="mx-6 mb-3 rounded-[20px] bg-white p-4 shadow-[0_2px_14px_rgba(13,27,62,0.06)]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[14px] font-black text-[#0D1B3E]">Tìm kiếm hồ sơ</h2>
            <p className="mt-0.5 text-[11px] font-semibold text-[#7B8AB0]">Nhập MSSV hoặc tên sinh viên.</p>
          </div>
          <button
            type="button"
            onClick={() => fetchStudents(query, studentsPage)}
            disabled={loadingStudents || query.length < 2}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#1A56FF] disabled:opacity-50"
            aria-label="Làm mới"
          >
            <RefreshCw size={16} className={loadingStudents ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A8B2C8]" />
          <input
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="VD: 3123..., Nguyễn Văn A"
            className="h-10 w-full rounded-xl border border-[#E5EAF4] bg-[#F8FAFD] pl-9 pr-3 text-[12px] font-bold text-[#0D1B3E] outline-none focus:border-[#1A56FF]"
          />
        </div>
        <select
          value={sortMode}
          onChange={(event) => setSortMode(event.target.value as typeof sortMode)}
          className="mt-2 h-9 w-full rounded-xl border border-[#E5EAF4] bg-[#F8FAFD] px-3 text-[11px] font-black text-[#0D1B3E] outline-none"
        >
          {sortOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </section>

      <section className="mx-6 mb-0 space-y-2.5 rounded-[20px] bg-white p-3 shadow-[0_2px_14px_rgba(13,27,62,0.06)]">
        {loadingStudents ? (
          <div className="p-6 text-center text-[12px] font-bold text-[#7B8AB0]">
            <Loader2 className="mx-auto mb-2 animate-spin text-[#1A56FF]" size={22} /> Đang tìm sinh viên...
          </div>
        ) : query.length < 2 ? (
          <div className="rounded-2xl border border-dashed border-[#DDE3F0] bg-[#F8FAFD] p-6 text-center text-[12px] font-bold leading-relaxed text-[#7B8AB0]">
            Nhập ít nhất 2 ký tự để tải danh sách sinh viên phù hợp.
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#DDE3F0] bg-[#F8FAFD] p-6 text-center text-[12px] font-bold text-[#7B8AB0]">
            Không có sinh viên phù hợp với bộ lọc hiện tại.
          </div>
        ) : (
          filteredStudents.map(student => (
            <button
              key={student.id}
              type="button"
              onClick={() => openStudentDetail(student)}
              className="w-full rounded-[18px] bg-[#F8FAFD] p-4 text-left active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="line-clamp-1 text-[13.5px] font-black text-[#0D1B3E]">{student.data?.studentName || student.full_name || 'Chưa có tên'}</h3>
                  <p className="mt-1 text-[11px] font-bold text-[#7B8AB0]">{student.student_code || student.email || student.id}</p>
                  <p className="mt-2 line-clamp-2 text-[11px] font-black text-[#1A56FF]">{student.data?.specializationName || student.data?.majorName || 'Chưa cập nhật chuyên ngành'}</p>
                </div>
                <ChevronRight size={18} className="mt-1 shrink-0 text-[#C0CBDF]" strokeWidth={2.5} />
              </div>
            </button>
          ))
        )}
        {query.length >= 2 && renderStudentPager()}
      </section>

      {selectedStudent && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-end justify-center bg-black/55" onClick={() => setSelectedStudent(null)}>
          <div className="max-h-[88vh] w-full max-w-[430px] overflow-hidden rounded-t-3xl bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-slate-200" />
            <div className="flex items-start justify-between gap-3 border-b border-[#EEF2FF] p-4">
              <div className="min-w-0">
                <h2 className="line-clamp-2 text-[17px] font-black leading-tight text-[#0D1B3E]">{selectedStudent.data?.studentName || selectedStudent.full_name || 'Hồ sơ sinh viên'}</h2>
                <p className="mt-1 text-[11px] font-bold text-[#7B8AB0]">{selectedStudent.student_code || selectedStudent.email}</p>
              </div>
              <button type="button" onClick={() => setSelectedStudent(null)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#F2F4F8] text-[#7B8AB0]">
                <X size={16} />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-4 pb-safe">
              {loadingDetail && <div className="mb-3 rounded-2xl bg-[#EEF2FF] p-3 text-[11px] font-black text-[#1A56FF]">Đang tải hồ sơ chi tiết...</div>}
              <div className="mb-3 grid grid-cols-2 gap-3">
                <NativeStatCard title="GPA tích lũy" value={selectedStudent.gpa4 ? selectedStudent.gpa4.toFixed(2) : '0.00'} suffix="/ 4" subLabel="Hệ 10" subValue={selectedStudent.gpa10 ? selectedStudent.gpa10.toFixed(2) : '0.00'} progress={(selectedStudent.gpa4 / 4) * 100} tone="blue" icon={<GraduationCap size={15} strokeWidth={2.5} />} />
                <NativeStatCard title="Tín chỉ" value={`${Math.round(selectedStudent.credits || 0)}`} suffix="TC" subLabel="Học kỳ" subValue={`${selectedStudent.semesterCount || 0}`} progress={Math.min(100, selectedStudent.credits || 0)} tone="green" icon={<BookOpen size={15} strokeWidth={2.5} />} />
              </div>
              <div className="space-y-2">
                {getUsableSemesters(selectedStudent.data).length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#DDE3F0] bg-[#F8FAFD] p-4 text-center text-[12px] font-bold text-[#7B8AB0]">Sinh viên chưa có dữ liệu học kỳ.</div>
                ) : (
                  getUsableSemesters(selectedStudent.data).map((semester: Semester) => {
                    const semesterStats = calculateSemesterStats(semester.subjects || []);
                    return (
                      <div key={semester.id || semester.name} className="rounded-2xl bg-[#F8FAFD] p-3">
                        <div className="text-[12px] font-black text-[#0D1B3E]">{semester.name}</div>
                        <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] font-bold text-[#7B8AB0]">
                          <span>{semester.subjects?.length || 0} môn</span>
                          <span>GPA {semesterStats.hasData ? semesterStats.gpa4.toFixed(2) : '--'}</span>
                          <span>{semesterStats.totalCredits || 0} TC</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </main>
  );
};

export const MobileDashboardNative: React.FC<MobileDashboardNativeProps> = ({
  stats,
  totalCreditsRequired,
  isLocked,
  trendData,
  semesters,
  trendAnalysis,
  activeTab,
  onTabChange,
  scheduleContent,
  hideLearningTabs = false,
  isManagementUser = false,
  showEmbeddedBottomNav = false,
  onOpenRanking,
  onOpenTargetForecast,
  onRequireOnboarding,
  onOpenLookback,
  onOpenFailed,
  onExportPDF,
  onImportPDF,
  onAddSemester,
  onUpdateSemester,
  onRemoveSemester,
  isTranscriptEditing,
  isSavingTranscript,
  onStartTranscriptEdit,
  onSaveTranscriptEdit,
  onCancelTranscriptEdit,
  isImporting,
}) => {
  const creditsProgress = totalCreditsRequired > 0 ? (stats.passedCredits / totalCreditsRequired) * 100 : 0;
  const gpaProgress = (stats.gpa4 / 4) * 100;
  const handleLockedClick = () => {
    if (isLocked) onRequireOnboarding?.();
  };

  return (
    <div className={`mobile-page mobile-dashboard-native w-full bg-[#E8ECF4] ${isManagementUser ? 'min-h-0' : 'min-h-full'}`}>
      <div className={`mx-auto flex w-full max-w-[430px] flex-col bg-[#F2F4F8] text-[#0D1B3E] ${isManagementUser ? 'min-h-0' : 'min-h-[100dvh]'}`}>
        <NativeStatusSpacer />

        <header className="flex items-start justify-between px-6 pb-4 pt-1">
          <div>
            <h1 className="text-[30px] font-black leading-[1.08] tracking-normal text-[#0D1B3E]">Học tập</h1>
            <p className="mt-1 text-[13px] font-semibold text-[#7B8AB0]">Quản lý học tập</p>
          </div>
          <button
            type="button"
            className="relative flex h-[42px] w-[42px] items-center justify-center rounded-[14px] bg-white text-[#0D1B3E] shadow-[0_2px_12px_rgba(13,27,62,0.08)]"
            aria-label="Thông báo"
          >
            <Bell size={20} strokeWidth={2.2} />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-[#F2F4F8] bg-[#FF3B5C]" />
          </button>
        </header>

        {!hideLearningTabs && <NativeSegmentedTabs activeTab={activeTab} onTabChange={onTabChange} />}

        {activeTab === 'schedule' ? (
          <div className={isManagementUser ? 'px-6 pb-0' : 'flex-1 overflow-y-auto px-6 pb-0'}>{scheduleContent}</div>
        ) : isManagementUser ? (
          <>
            <NativeAdminTools />
            <NativeAdminStudentManager />
          </>
        ) : (
          <main className="relative flex-1 overflow-y-auto pb-[calc(76px+env(safe-area-inset-bottom))]">
            <div className="mb-2 px-6 text-[11px] font-black uppercase tracking-[0.08em] text-[#9AA5C0]">Tổng quan</div>

            <div className="mb-3 grid grid-cols-2 gap-3 px-6">
              <NativeStatCard
                title="GPA tích lũy"
                value={formatMobileNumber(stats.gpa4)}
                suffix="/ 4.0"
                subLabel="Hệ 10"
                subValue={formatMobileNumber(stats.gpa10)}
                progress={gpaProgress}
                tone="blue"
                icon={<GraduationCap size={15} strokeWidth={2.5} />}
              />
              <NativeStatCard
                title="Tín chỉ tích lũy"
                value={`${Math.round(stats.passedCredits || 0)}`}
                suffix="TC"
                subLabel="Mục tiêu"
                subValue={totalCreditsRequired ? `${totalCreditsRequired}` : 'Chưa cập nhật'}
                progress={creditsProgress}
                tone="green"
                icon={<BookOpen size={15} strokeWidth={2.5} />}
              />
            </div>

            <div className="mb-3 grid grid-cols-2 gap-3 px-6">
              <NativeFeatureCard
                title="BXH môn học"
                description="Xem bảng xếp hạng môn học của bạn"
                icon={<Trophy size={16} className="text-[#F5A623]" strokeWidth={2.3} />}
                locked={isLocked}
                onClick={isLocked ? handleLockedClick : onOpenRanking}
              />
              {FEATURE_FORECAST_TOOLS && (
              <NativeFeatureCard
                title="Dự báo mục tiêu"
                description="Xem dự báo và tiến độ đạt mục tiêu"
                icon={<Target size={16} className="text-[#7B2FFF]" strokeWidth={2.3} />}
                locked={isLocked}
                onClick={isLocked ? handleLockedClick : onOpenTargetForecast}
              />
              )}
            </div>

            <NativeTrendCard isLocked={isLocked} trendData={trendData} />
            <NativeEvaluationRow text={isLocked ? 'Đăng nhập để mở khóa đánh giá học tập' : trendAnalysis} />
            <NativeQuickActions
              onOpenLookback={onOpenLookback}
              onOpenFailed={onOpenFailed}
              onExportPDF={onExportPDF}
              onImportPDF={onImportPDF}
              onAddSemester={onAddSemester}
              isTranscriptEditing={isTranscriptEditing}
              isSavingTranscript={isSavingTranscript}
              onStartTranscriptEdit={onStartTranscriptEdit}
              onSaveTranscriptEdit={onSaveTranscriptEdit}
              onCancelTranscriptEdit={onCancelTranscriptEdit}
              isImporting={isImporting}
            />
            <NativeTranscriptList
              semesters={semesters}
              onUpdateSemester={onUpdateSemester}
              onRemoveSemester={onRemoveSemester}
              isReadOnly={!isTranscriptEditing}
            />
          </main>
        )}

        {showEmbeddedBottomNav && <NativeBottomNavigation />}
        {showEmbeddedBottomNav && <NativeAIFloatingButton />}
      </div>
    </div>
  );
};

// ============================================================================
// 5. MAIN COMPONENT: MobileDashboard
// ============================================================================
interface DashboardProps {
    data: UserData;
    onSetSemesters: (semesters: Semester[]) => void;
    onTargetChange: (newTarget: number) => void;
    showSecurityNotice: boolean;
    onUpdateSemester: (index: number, updatedSem: Semester) => void;
    onRemoveSemester: (index: number) => void;
    onAddSemester: () => void;
    onExportPDF: () => void;
    onImportPDF: () => void;
    isImporting: boolean;
    fileInputRef: React.RefObject<HTMLInputElement>;
    onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    isGuest?: boolean;
    onRequireOnboarding?: () => void;
    currentUserId?: string | null;
}

export const MobileDashboard: React.FC<DashboardProps> = ({
    data,
    onSetSemesters,
    onTargetChange,
    showSecurityNotice,
    onUpdateSemester,
    onRemoveSemester,
    onAddSemester,
    onExportPDF,
    onImportPDF,
    isImporting,
    fileInputRef,
    onFileUpload,
    isGuest,
    onRequireOnboarding,
    currentUserId
}) => {
    useEffect(() => {
        document.title = "Tổng quan | HUB Planner";
    }, []);

    const { isAdmin, isAuditor, loading } = useUserRole();
    const [adminUsers, setAdminUsers] = useState<any[]>([]);
    const [loadingAdmin, setLoadingAdmin] = useState(false);
    const [selectedUserOverview, setSelectedUserOverview] = useState<UserData | null>(null);
    const [selectedAdminUserId, setSelectedAdminUserId] = useState<string | null>(null);
    const isViewingAsAuditor = isAuditor && selectedUserOverview !== null;

    const saveAdminUserUpdate = async (newData: UserData) => {
        if (!selectedAdminUserId || isAuditor) return;
        try {
            await updateProfilePrivate(selectedAdminUserId, { data: newData });

            setAdminUsers(prevUsers => prevUsers.map(u =>
                u.id === selectedAdminUserId ? { ...u, data: newData, updated_at: new Date().toISOString() } : u
            ));

        } catch (error) {
            console.error("Lỗi cập nhật user:", error);
        }
    };
    const [adminSearch, setAdminSearch] = useState('');
    const [adminMode, setAdminMode] = useState<'list' | 'detail'>('list');
    useEffect(() => {
    if ((isAdmin || isAuditor) && adminMode === 'list') {
        window.history.replaceState(null, '', '/dashboard/admin');
    }
}, [isAdmin, isAuditor, adminMode]);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageInput, setPageInput] = useState('1');
    const [adminSort, setAdminSort] = useState<'newest' | 'name_asc' | 'created_desc' | 'created_asc'>('newest');

    const [adminFilterCohort, setAdminFilterCohort] = useState<string>('all');
    const [adminFilterMajor, setAdminFilterMajor] = useState<string>('all');
    const [showAdminFilters, setShowAdminFilters] = useState(false);

    const itemsPerPage = 20;

    useEffect(() => {
        setCurrentPage(1);
        setPageInput('1');
    }, [adminSearch, adminSort, adminFilterCohort, adminFilterMajor]);

    const prevStudentNameRef = useRef(data.studentName);
    useEffect(() => {
    if ((isAdmin || isAuditor) && data.studentName !== prevStudentNameRef.current) {
        setAdminMode('detail');
    }
    prevStudentNameRef.current = data.studentName;
}, [data.studentName, isAdmin, isAuditor]);

    const [showRankingModal, setShowRankingModal] = useState(false);
    const [showFailedModal, setShowFailedModal] = useState(false);
    const [showYearlyModal, setShowYearlyModal] = useState(false);
    const [showReportModal, setShowReportModal] = useState(false);
    const [showAdminExcelModal, setShowAdminExcelModal] = useState(false);

    const showAdminPanel = (isAdmin || isAuditor) && adminMode === 'list';

    const adminSearchQuery = adminSearch.trim();
    const hasAdminSearchQuery = adminSearchQuery.length >= 2;
    const adminSearchCacheKey = (query: string) => `hub_admin_student_search_v1:${query.trim().toLowerCase()}`;
    const readAdminSearchCache = (query: string) => {
        try {
            const raw = sessionStorage.getItem(adminSearchCacheKey(query));
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed?.cachedAt || Date.now() - parsed.cachedAt > 5 * 60 * 1000) return null;
            return Array.isArray(parsed.users) ? parsed.users : null;
        } catch {
            return null;
        }
    };
    const writeAdminSearchCache = (query: string, users: any[]) => {
        try {
            sessionStorage.setItem(adminSearchCacheKey(query), JSON.stringify({ cachedAt: Date.now(), users }));
        } catch {
            // Cache is an optimization only.
        }
    };

    const fetchAdminData = async (searchOverride = adminSearch, options: { force?: boolean } = {}) => {
        const query = searchOverride.trim();
        if (query.length < 2) {
            setAdminUsers([]);
            setLoadingAdmin(false);
            return;
        }

        if (!options.force) {
            const cachedUsers = readAdminSearchCache(query);
            if (cachedUsers) {
                setAdminUsers(cachedUsers);
                setCurrentPage(1);
                setPageInput('1');
                return;
            }
        }

        setLoadingAdmin(true);
        try {
            const safeQuery = query.replace(/[%,_]/g, ' ').trim();
            const allProfiles = await searchStaffProfiles(safeQuery, { limit: 80 });
            const privateMap = allProfiles.reduce((map: Record<string, any>, row: any) => {
                map[row.id] = row;
                return map;
            }, {});
            const users = allProfiles.map(profile => {
                const profileInfo = privateMap[profile.id] || {};
                return ({
                ...profile,
                data: {
                    studentName: profileInfo.student_name || profile.full_name || '',
                    programName: profileInfo.program_name || '',
                    cohort: profileInfo.cohort || '',
                    majorName: profileInfo.major_name || '',
                    specializationName: profileInfo.specialization_name || '',
                },
                isProfileSummary: true,
                updated_at: profileInfo.updated_at || profile.updated_at,
            });
            });
            setAdminUsers(users);
            writeAdminSearchCache(query, users);
            setCurrentPage(1);
            setPageInput('1');
        } finally {
            setLoadingAdmin(false);
        }
    };

    useEffect(() => {
        if (!showAdminPanel) return;

        if (!hasAdminSearchQuery) {
            setAdminUsers([]);
            setLoadingAdmin(false);
            return;
        }

        const timer = window.setTimeout(() => {
            fetchAdminData(adminSearchQuery);
        }, 450);

        return () => window.clearTimeout(timer);
    }, [showAdminPanel, adminSearchQuery]);

    const handleOpenAdminUserDetail = async (user: any) => {
        playClick();
        setSelectedAdminUserId(user.id);
        setSelectedUserOverview(user.data || { ...data, studentName: 'Chưa có data' });
        setAdminMode('detail');
        window.history.pushState(null, '', `/dashboard/admin/${user.student_code || user.id}`);

        if (!user.isProfileSummary) return;

        try {
            const fullPrivate = await fetchProfilePrivate(user.id);
            if (!fullPrivate?.data) return;

            setSelectedUserOverview(fullPrivate.data as UserData);
            setAdminUsers(prev => prev.map(item => item.id === user.id ? {
                ...item,
                data: fullPrivate.data,
                isProfileSummary: false,
                updated_at: fullPrivate.updated_at || item.updated_at,
                email: fullPrivate.email || item.email,
            } : item));
        } catch (error) {
            console.warn('Không thể tải dữ liệu chi tiết sinh viên:', error);
        }
    };

    const { adminCohorts, adminMajors } = useMemo(() => {
        const cSet = new Set<string>();
        const mSet = new Set<string>();

        adminUsers.forEach(u => {
            if (u.data?.cohort) cSet.add(u.data.cohort);
            if (u.data?.majorName) mSet.add(u.data.majorName);
        });

        return {
            adminCohorts: Array.from(cSet).sort(),
            adminMajors: Array.from(mSet).sort()
        };
    }, [adminUsers]);

    const baseFilteredUsers = useMemo(() => {
        return adminUsers
            .filter(u => {
                const matchSearch = (u.student_code && u.student_code.toLowerCase().includes(adminSearch.toLowerCase())) ||
                    (u.full_name && u.full_name.toLowerCase().includes(adminSearch.toLowerCase())) ||
                    (u.data?.studentName && u.data.studentName.toLowerCase().includes(adminSearch.toLowerCase()));

                const matchCohort = adminFilterCohort === 'all' || u.data?.cohort === adminFilterCohort;
                const matchMajor = adminFilterMajor === 'all' || u.data?.majorName === adminFilterMajor;

                return matchSearch && matchCohort && matchMajor;
            });
    }, [adminUsers, adminSearch, adminFilterCohort, adminFilterMajor]);

    const activeAdminFilterCount = useMemo(() => {
        return [
            adminFilterMajor !== 'all',
            adminFilterCohort !== 'all',
            adminSort !== 'newest'
        ].filter(Boolean).length;
    }, [adminFilterMajor, adminFilterCohort, adminSort]);

    const resetAdminFilters = () => {
        setAdminFilterMajor('all');
        setAdminFilterCohort('all');
        setAdminSort('newest');
    };

    const processedAdminUsers = useMemo(() => {
        let result = [...baseFilteredUsers];

        if (adminSort !== 'newest') {
            result.sort((a, b) => {
                if (adminSort === 'name_asc') {
                    const nameA = a.full_name || a.data?.studentName || '';
                    const nameB = b.full_name || b.data?.studentName || '';
                    return nameA.localeCompare(nameB);
                } else if (adminSort === 'created_desc') {
                    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
                } else if (adminSort === 'created_asc') {
                    return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
                }
                return 0;
            });
        }
        return result;
    }, [baseFilteredUsers, adminSort]);

    const paginatedAdminUsers = useMemo(() => {
        return processedAdminUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    }, [processedAdminUsers, currentPage, itemsPerPage]);

    const totalAdminPages = Math.ceil(processedAdminUsers.length / itemsPerPage) || 1;


    const activeData = useMemo(() => {
        if (selectedUserOverview) {
            return {
                ...data,
                ...selectedUserOverview,
                semesters: selectedUserOverview.semesters || []
            };
        }
        return data;
    }, [selectedUserOverview, data]);

    const semesterLookback = useSemesterLookback(
        activeData,
        !isGuest && !showAdminPanel && !selectedUserOverview
    );

    const handleLocalSetSemesters = (semesters: Semester[]) => {
        if (selectedUserOverview) {
            const newData = { ...activeData, semesters };
            setSelectedUserOverview(newData);
            saveAdminUserUpdate(newData);
        } else onSetSemesters(semesters);
    };

    const handleLocalTargetChange = (newTarget: number) => {
        if (selectedUserOverview) {
            const newData = { ...activeData, targetGPA: newTarget };
            setSelectedUserOverview(newData);
            saveAdminUserUpdate(newData);
        } else onTargetChange(newTarget);
    };

    const handleLocalUpdateSemester = (index: number, updatedSem: Semester) => {
        if (selectedUserOverview) {
            const newSems = [...activeData.semesters];
            newSems[index] = updatedSem;
            const newData = { ...activeData, semesters: newSems };
            setSelectedUserOverview(newData);
            saveAdminUserUpdate(newData);
        } else onUpdateSemester(index, updatedSem);
    };

    const handleLocalRemoveSemester = (index: number) => {
        if (selectedUserOverview) {
            const newSems = activeData.semesters.filter((_, i) => i !== index);
            const newData = { ...activeData, semesters: newSems };
            setSelectedUserOverview(newData);
            saveAdminUserUpdate(newData);
        } else onRemoveSemester(index);
    };

    const handleLocalAddSemester = () => {
        if (selectedUserOverview) {
            const newSem: Semester = { id: Date.now().toString(), name: getNextTranscriptSemesterName(activeData.semesters), subjects: [], trainingScore: null };
            const newData = { ...activeData, semesters: [...activeData.semesters, newSem] };
            setSelectedUserOverview(newData);
            saveAdminUserUpdate(newData);
        } else onAddSemester();
    };

    const ALL_SEMESTERS = useMemo(() => {
        const options = [];
        for (let y = 2020; y <= 2026; y++) {
            options.push(`Học kỳ 1 Năm học ${y}-${y+1}`);
            options.push(`Học kỳ 2 Năm học ${y}-${y+1}`);
        }
        return options;
    }, []);

    const handleCascadeUpdate = (targetIndex: number, newName: string) => {
        const match = newName.match(/Học kỳ (1|2) Năm học (\d{4})-(\d{4})/);
        if (!match) {
            handleLocalUpdateSemester(targetIndex, { ...activeData.semesters[targetIndex], name: newName });
            return;
        }

        const targetHk = parseInt(match[1]);
        const targetYear = parseInt(match[2]);
        const targetAbs = targetYear * 2 + (targetHk - 1);

        const isFirstSpawn = activeData.semesters.length === 1 && activeData.semesters[0].name === '';
        const targetLength = isFirstSpawn ? 8 : activeData.semesters.length;

        const newSemesters = [...activeData.semesters];

        for (let i = 0; i < targetLength; i++) {
            const offset = i - targetIndex;
            const currentAbs = targetAbs + offset;

            const currentYear = Math.floor(currentAbs / 2);
            const currentHk = (currentAbs % 2) + 1;

            const seqName = `Học kỳ ${currentHk} Năm học ${currentYear}-${currentYear + 1}`;

            if (newSemesters[i]) {
                newSemesters[i] = { ...newSemesters[i], name: seqName };
            } else {
                newSemesters.push({
                    id: Date.now().toString() + i,
                    name: seqName,
                    subjects: [],
                    trainingScore: null
                });
            }
        }

        handleLocalSetSemesters(newSemesters);
    };
    const transcriptSemesters = useMemo(() => {
        const cleanedSemesters = activeData.semesters.filter((semester) => {
            const hasSemesterData = (semester.subjects || []).length > 0 || semester.trainingScore !== null;
            return isValidTranscriptSemesterName(semester.name) || hasSemesterData;
        });
        if (cleanedSemesters.length === 0 && activeData.semesters.length > 0) {
            return [{ ...activeData.semesters[0], name: DEFAULT_TRANSCRIPT_SEMESTER_NAME }];
        }

        const hasSelectedSemester = cleanedSemesters.some(semester => isValidTranscriptSemesterName(semester.name));
        if (hasSelectedSemester) return cleanedSemesters;

        let defaultApplied = false;
        return cleanedSemesters.map(semester => {
            if (defaultApplied || semester.name.trim()) return semester;
            defaultApplied = true;
            return { ...semester, name: DEFAULT_TRANSCRIPT_SEMESTER_NAME };
        });
    }, [activeData.semesters]);

    const nonSummerSemesters = useMemo(
        () => transcriptSemesters.filter(s => !/^Học kỳ Hè Năm học \d{4}-\d{4}$/.test(s.name)),
        [transcriptSemesters]
    );

    const sortedSemesters = useMemo(() => {
        const getWeight = (name: string) => {
            if (!name) return 999999;
            const match = name.match(/Học kỳ (1|2) Năm học (\d{4})-(\d{4})/);
            if (!match) return 999998;
            const hk = parseInt(match[1]);
            const year = parseInt(match[2]);
            return year * 10 + hk;
        };
        return [...nonSummerSemesters].sort((a, b) => getWeight(a.name) - getWeight(b.name));
    }, [nonSummerSemesters]);

    const isInitialState = nonSummerSemesters.length > 0 && nonSummerSemesters.every((s, index) => {
        const hasInitialDefaultName = index === 0 && s.name === DEFAULT_TRANSCRIPT_SEMESTER_NAME;
        return (!s.name || hasInitialDefaultName) && (s.subjects || []).length === 0;
    });
    const semestersToRender = isInitialState ? [nonSummerSemesters[0]] : sortedSemesters;
    const usedSemesterNames = transcriptSemesters.map(s => s.name);
    const isLocked = isGuest && !activeData.hasOnboarded;

    const validDataSemesters = transcriptSemesters.filter(s => isValidTranscriptSemesterName(s.name));

    const stats = calculateCumulativeStats(validDataSemesters);
    const yearlyStats = calculateYearlyStats(validDataSemesters);
    const trendAnalysis = analyzeTrend(validDataSemesters);

    const validSubjects = validDataSemesters.flatMap(s => s.subjects)
        .filter(s => !s.isNonGPA)
        .map(s => {
            const avg = calculateSubjectAverage(s);
            const { letter, scale4 } = avg !== null ? getGradeDetails(avg) : { letter: '?', scale4: 0 };
            return { ...s, avg: avg || 0, letter, scale4, semName: s.name };
        })
        .filter((s): s is typeof s & { avg: number } => s.avg !== null)
        .sort((a, b) => b.avg - a.avg);

    const highestSubject = validSubjects.length > 0 ? validSubjects[0] : null;

    const gradeDist = validSubjects.reduce((acc, curr) => {
        const group = curr.letter.charAt(0);
        acc[group] = (acc[group] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const pieData = [
        { name: 'Giỏi/Xuất sắc (A)', value: gradeDist['A'] || 0, color: '#10B981' },
        { name: 'Khá (B)', value: gradeDist['B'] || 0, color: '#3B82F6' },
        { name: 'Trung bình (C)', value: gradeDist['C'] || 0, color: '#F59E0B' },
        { name: 'Yếu/Rớt (D, F)', value: (gradeDist['D'] || 0) + (gradeDist['F'] || 0), color: '#EF4444' },
    ].filter(d => d.value > 0);

    const trendData = validDataSemesters.map(sem => {
        const semStats = calculateSemesterStats(sem.subjects);
        let shortName = sem.name;
        if (shortName.includes('Học kỳ')) {
            const parts = shortName.split('-');
            if (sem.name.includes('Năm học')) {
                const yearPart = sem.name.match(/(\d{4})/);
                const hkPart = sem.name.match(/Học kỳ (1|2)/);
                if (yearPart && hkPart) shortName = `HK${hkPart[1]}/${yearPart[1].slice(2)}`;
            } else {
                shortName = sem.name.replace('Năm ', 'N').replace(' - Học kỳ ', '.HK');
            }
        }
        return {
            name: shortName,
            gpa4: semStats.hasData ? semStats.gpa4 : null,
            gpa10: semStats.hasData ? semStats.gpa10 : null,
        };
    }).filter(item => item.gpa4 !== null);

    const allSubjects = validDataSemesters.flatMap(s => s.subjects);

    const failedSubjectsList = allSubjects.filter(s => {
        const avg = calculateSubjectAverage(s);
        return getSubjectStatus(avg) === GradeStatus.FAIL && !s.isNonGPA;
    });

    const failedCount = failedSubjectsList.length;
    const totalCreditsRequired = resolveTotalCreditsRequired({
        programName: activeData.programName, cohort: activeData.cohort,
        specializationName: activeData.specializationName, storedCredits: activeData.totalCreditsRequired,
    });

    const requiredAnalysis = calculateRequiredGPA(
        stats.rawGPA4,
        stats.passedCredits,
        totalCreditsRequired,
        activeData.targetGPA,
        stats.totalCredits
    );

    let difficultyColor = "text-[#003375] bg-blue-50";
    let difficultyText = "Tốt";
    let scoreClass = "text-[#003375]";

    if (requiredAnalysis?.isTargetAchieved) {
        difficultyColor = "text-emerald-700 bg-emerald-50";
        difficultyText = "Đã đạt mục tiêu";
        scoreClass = "text-emerald-600";
    } else if (requiredAnalysis && requiredAnalysis.isPossible) {
        const req = requiredAnalysis.requiredGPA;
        if (req > 3.6) {
            difficultyColor = "text-[#990000] bg-red-50";
            difficultyText = "Thử thách";
            scoreClass = "text-[#990000]";
        } else if (req > 3.2) {
            difficultyColor = "text-orange-700 bg-orange-50";
            difficultyText = "Cần nỗ lực";
            scoreClass = "text-orange-600";
        } else if (req > 2.5) {
            difficultyColor = "text-[#003375] bg-blue-50";
            difficultyText = "Khả thi";
            scoreClass = "text-[#003375]";
        } else {
            difficultyColor = "text-emerald-700 bg-emerald-50";
            difficultyText = "Trong tầm tay";
            scoreClass = "text-emerald-600";
        }
    }

 return (
    <div className="mobile-page mobile-dashboard-page w-full pb-10">
        <SemesterLookbackModal
            isOpen={semesterLookback.isOpen}
            data={semesterLookback.lookback}
            loading={semesterLookback.loading}
            onClose={semesterLookback.close}
        />
        <AdminStudentExcelExportModal
            isOpen={showAdminExcelModal}
            onClose={() => setShowAdminExcelModal(false)}
        />

        {showAdminPanel ? (
            <div className="w-full space-y-4 pt-1 animate-fadeIn">
                <div className="relative md:sticky top-0 z-40 bg-[#F8FAFC] pt-2 pb-2 -mt-2 mb-3 border-b border-gray-200/60 md:shadow-[0_4px_6px_-6px_rgba(0,0,0,0.1)]">
                    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3">
                        <div>
                            <h1 className="text-2xl sm:text-[28px] font-black text-[#003375]">
                                Quản lý Sinh viên
                            </h1>
                            <p className="text-xs text-gray-500">Xem và theo dõi tiến độ học tập toàn trường</p>
                        </div>

                        <div className="flex flex-col w-full lg:w-auto gap-2">
                            <div className="flex flex-nowrap items-center gap-2 w-full justify-end">
                                <div className="relative flex-1 lg:w-64 max-w-sm">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                                    <input
                                        type="text"
                                        placeholder="Nhập ít nhất 2 ký tự để tìm..."
                                        value={adminSearch}
                                        onChange={e => setAdminSearch(e.target.value)}
                                        className="w-full h-10 pl-8 pr-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-[#003375] outline-none text-sm bg-white font-semibold"
                                    />
                                </div>

                                <button
                                    onClick={() => { playClick(); setShowAdminFilters(prev => !prev); }}
                                    className={`h-10 px-3 rounded-xl border text-sm font-bold transition-colors shrink-0 flex items-center gap-1.5 ${showAdminFilters || activeAdminFilterCount > 0 ? 'bg-[#003375] text-white border-[#003375] shadow-sm' : 'bg-white text-[#003375] border-gray-300'}`}
                                >
                                    <ListFilter size={16} />
                                    <span>Lọc</span>
                                    {activeAdminFilterCount > 0 && (
                                        <span className={`min-w-5 h-5 rounded-full px-1.5 text-[11px] font-black flex items-center justify-center ${showAdminFilters ? 'bg-white text-[#003375]' : 'bg-[#003375] text-white'}`}>
                                            {activeAdminFilterCount}
                                        </span>
                                    )}
                                </button>

                                <button
                                    onClick={() => { playClick(); setShowAdminExcelModal(true); }}
                                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-300 bg-white text-[#003375] shadow-sm transition-colors hover:bg-blue-50"
                                    title="Xuất danh sách Excel"
                                >
                                    <Download size={18} />
                                </button>

                                <button
                                    onClick={() => { playClick(); fetchAdminData(adminSearchQuery, { force: true }); }}
                                    disabled={loadingAdmin || !hasAdminSearchQuery}
                                    className="h-10 w-10 bg-white text-gray-500 border border-gray-300 hover:text-[#003375] hover:bg-blue-50 rounded-xl shadow-sm transition-colors disabled:opacity-50 shrink-0 flex items-center justify-center"
                                    title="Làm mới danh sách"
                                >
                                    <RefreshCw size={18} className={loadingAdmin ? "animate-spin" : ""} />
                                </button>

                                <button onClick={() => { playClick(); setSelectedUserOverview(null); setSelectedAdminUserId(null); setAdminMode('detail'); window.history.pushState(null, '', '/dashboard'); }} className="hidden sm:inline-flex h-10 items-center px-3 bg-white text-[#003375] text-sm font-bold border border-gray-300 hover:border-[#003375] hover:bg-blue-50 rounded-xl shadow-sm whitespace-nowrap transition-colors shrink-0">
                                    H? so c?a tôi
                                </button>
                            </div>

                            <div className={`${showAdminFilters ? 'grid' : 'hidden'} grid-cols-2 gap-2 w-full rounded-2xl border border-gray-200 bg-white p-3 shadow-[0_10px_30px_rgba(15,23,42,0.08)] animate-fadeIn`}>
                                <div className="col-span-2 flex items-center justify-between">
                                    <span className="text-xs font-black uppercase tracking-wide text-gray-500">Bộ lọc</span>
                                    {activeAdminFilterCount > 0 && (
                                        <button onClick={() => { playClick(); resetAdminFilters(); }} className="text-xs font-bold text-[#003375]">
                                            Xóa lọc
                                        </button>
                                    )}
                                </div>
                                <div className="relative">
                                    <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
                                    <select
                                        value={adminFilterMajor}
                                        onChange={(e) => setAdminFilterMajor(e.target.value)}
                                        className="appearance-none pl-7 pr-7 py-1.5 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#003375] outline-none text-xs bg-white text-gray-700 font-medium hover:border-blue-300 transition-colors cursor-pointer w-full max-w-[140px] truncate"
                                    >
                                        <option value="all">Tất cả ngành</option>
                                        {adminMajors.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5 pointer-events-none" />
                                </div>

                                <div className="relative">
                                    <ArrowUpDown className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
                                    <select
                                        value={adminSort}
                                        onChange={(e) => setAdminSort(e.target.value as any)}
                                        className="appearance-none pl-7 pr-7 py-1.5 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#003375] outline-none text-xs bg-white text-gray-700 font-medium hover:border-blue-300 transition-colors cursor-pointer w-full"
                                    >
                                        <option value="newest">Mới cập nhật</option>
                                        <option value="name_asc">Tên A-Z</option>
                                        <option value="created_desc">Tạo mới nhất</option>
                                        <option value="created_asc">Tạo cũ nhất</option>
                                    </select>
                                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5 pointer-events-none" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="sm:hidden">
                        {loadingAdmin ? (
                            <div className="py-12 text-center">
                                <Loader2 className="animate-spin text-[#003375] mx-auto mb-2" size={28}/>
                                <span className="text-gray-500 text-sm">Đang tìm sinh viên...</span>
                            </div>
                        ) : !hasAdminSearchQuery ? (
                            <div className="py-12 text-center text-gray-500 text-sm">Nhập MSSV hoặc tên sinh viên để tải danh sách phù hợp.</div>
                        ) : paginatedAdminUsers.length > 0 ? (
                            <div className="divide-y divide-gray-100">
                                {paginatedAdminUsers.map(user => {
                                    const majorLabel = user.data?.specializationName || user.data?.majorName || 'Chưa cập nhật chuyên ngành';

                                    return (
                                        <button
                                            key={user.id}
                                            onClick={() => handleOpenAdminUserDetail(user)}
                                            className="w-full p-3 text-left active:bg-blue-50 transition-colors"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="text-[11px] font-black text-[#003375] tracking-wide">{user.student_code || '-'}</p>
                                                    <h3 className="mt-1 text-sm font-extrabold text-gray-900 leading-snug line-clamp-2">{user.full_name || user.data?.studentName || 'Chưa cập nhật'}</h3>
                                                    <p className="mt-1 text-[11px] font-black text-[#1A56FF] line-clamp-2">{majorLabel}</p>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="py-8 text-center text-gray-500 text-sm">Không tìm thấy sinh viên nào phù hợp</div>
                        )}
                    </div>

                    <div className="hidden sm:block overflow-x-auto custom-scrollbar max-h-[55vh]">
                        <table className="min-w-[560px] w-full text-sm text-left relative">
                            <thead className="bg-gray-50 text-gray-600 border-b border-gray-200 sticky top-0 z-10">
                                <tr>
                                    <th className="px-4 py-3 font-bold">MSSV</th>
                                    <th className="px-4 py-3 font-bold">Họ và tên</th>
                                    <th className="px-4 py-3 font-bold">Chuyên ngành</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loadingAdmin ? (
                                    <tr><td colSpan={3} className="py-12 text-center"><Loader2 className="animate-spin text-[#003375] mx-auto mb-2" size={28}/> <span className="text-gray-500">Đang tìm sinh viên...</span></td></tr>
                                ) : !hasAdminSearchQuery ? (
                                    <tr><td colSpan={3} className="py-12 text-center text-gray-500">Nhập MSSV hoặc tên sinh viên để tải danh sách phù hợp.</td></tr>
                                ) : (() => {
                                    return paginatedAdminUsers.length > 0 ? (
                                        paginatedAdminUsers.map(user => {
                                            const majorLabel = user.data?.specializationName || user.data?.majorName || '-';
                                            return (
                                                <tr key={user.id} onClick={() => handleOpenAdminUserDetail(user)} className="hover:bg-blue-50/50 cursor-pointer transition-colors group">
                                                    <td className="px-4 py-3 font-bold text-[#003375]">{user.student_code || '-'}</td>
                                                    <td className="px-4 py-3 font-medium text-gray-900 group-hover:text-[#003375] transition-colors">{user.full_name || user.data?.studentName || 'Chưa cập nhật'}</td>
                                                    <td className="px-4 py-3 text-gray-600">{majorLabel}</td>
                                                </tr>
                                            )
                                        })
                                    ) : (
                                        <tr><td colSpan={3} className="py-8 text-center text-gray-500">Không tìm thấy sinh viên nào phù hợp</td></tr>
                                    )
                                })()}
                            </tbody>
                        </table>
                    </div>

                    {!loadingAdmin && processedAdminUsers.length > 0 && (
                            <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200 gap-3">
                                <span className="text-xs sm:text-sm text-gray-500">
                                    Đang xem <span className="font-bold text-gray-700">{processedAdminUsers.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}</span> đến <span className="font-bold text-gray-700">{Math.min(currentPage * itemsPerPage, processedAdminUsers.length)}</span> trong tổng số <span className="font-bold text-gray-900">{processedAdminUsers.length}</span> sinh viên
                                </span>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => { playClick(); setCurrentPage(p => { const newP = Math.max(1, p - 1); setPageInput(newP.toString()); return newP; }); }}
                                        disabled={currentPage === 1}
                                        className="px-3 py-1.5 text-xs font-bold text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        Trước
                                    </button>

                                    <div className="flex items-center gap-1.5 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-100 text-xs font-bold text-[#003375]">
                                        <span>Trang</span>
                                        <input
                                            type="number"
                                            min={1}
                                            max={totalAdminPages}
                                            value={pageInput}
                                            onChange={(e) => setPageInput(e.target.value)}
                                            onBlur={(e) => {
                                                let newPage = parseInt(e.target.value);
                                                if (isNaN(newPage) || newPage < 1) newPage = 1;
                                                if (newPage > totalAdminPages) newPage = totalAdminPages;
                                                setCurrentPage(newPage);
                                                setPageInput(newPage.toString());
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') e.currentTarget.blur();
                                            }}
                                            className="w-10 text-center bg-white border border-blue-200 text-[#003375] rounded outline-none focus:ring-2 focus:ring-[#003375] transition-all appearance-textfield"
                                        />
                                        <span>/ {totalAdminPages}</span>
                                    </div>

                                    <button
                                        onClick={() => { playClick(); setCurrentPage(p => { const newP = Math.min(totalAdminPages, p + 1); setPageInput(newP.toString()); return newP; }); }}
                                        disabled={currentPage === totalAdminPages || processedAdminUsers.length === 0}
                                        className="px-3 py-1.5 text-xs font-bold text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        Sau
                                    </button>
                                </div>
                            </div>
                    )}
                </div>
            </div>
        ) : (
            <div className="w-full space-y-4 pt-1 animate-fadeIn">
                <div className="relative top-0 z-40 bg-[#F8FAFC] pt-2 pb-2 mb-2">
                    {isAdmin && (
                        <button
                            onClick={() => { playClick(); setSelectedUserOverview(null); setSelectedAdminUserId(null); setAdminMode('list'); window.history.pushState(null, '', '/dashboard/admin'); }}
                            className="mb-3 flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-[#003375] transition-colors w-fit px-3 py-1.5 bg-white border border-gray-200 rounded-lg hover:shadow-sm"
                        >
                            <ChevronLeft size={16} /> Quay lại danh sách quản lý
                        </button>
                    )}

                    <h1 className="text-2xl sm:text-[28px] font-black text-[#003375] mb-1">
                Học tập
            </h1>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span>Quản lý học tập</span><span>•</span><span className="font-bold text-gray-700">Bảng điểm và lộ trình</span>
            </div>

                    {!isGuest && !selectedUserOverview && (
                        <button
                            onClick={() => { playClick(); semesterLookback.open(); }}
                            className="mt-3 rounded-lg border border-blue-200 bg-white px-3 py-2 text-left transition-all duration-150 active:scale-[0.98] motion-reduce:transition-none"
                        >
                            <div className="flex items-center gap-2">
                                <p className="text-xs font-black uppercase tracking-wide text-[#003375]">Nhìn lại kỳ học vừa qua</p>
                                <Sparkles className="text-yellow-500" size={17} />
                            </div>
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-300 transition-colors flex flex-col justify-between">
                        <div className="flex justify-between items-start mb-1">
                            <span className="text-[11px] sm:text-xs font-bold text-gray-600 truncate">Tổng GPA tích lũy</span>
                            <GraduationCap size={16} className="text-gray-400 shrink-0 w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </div>
                        <div className="flex items-baseline gap-1 mt-1">
                            <span className="text-2xl sm:text-[28px] font-extrabold text-gray-900 leading-none">{stats.gpa4.toFixed(2)}</span>
                            <span className="text-[10px] sm:text-sm font-bold text-gray-400">/ 4.0</span>
                        </div>
                        <div className="text-[10px] sm:text-[11px] text-gray-500 mt-1.5 sm:mt-2 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#990000] shrink-0"></span> <span className="truncate">Hệ 10: <span className="font-bold text-gray-700">{stats.gpa10.toFixed(2)}</span></span>
                        </div>
                    </div>

                    <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-300 transition-colors flex flex-col justify-between">
                        <div className="flex justify-between items-start mb-1">
                            <span className="text-[11px] sm:text-xs font-bold text-gray-600 truncate">Tổng TC tích lũy</span>
                            <BookOpen size={16} className="text-gray-400 shrink-0 w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </div>
                        <div className="flex items-baseline gap-1 mt-1">
                            <span className="text-2xl sm:text-[28px] font-extrabold text-gray-900 leading-none">{stats.passedCredits}</span>
                            <span className="text-[10px] sm:text-[13px] font-bold text-gray-500">TC</span>
                        </div>
                        <div className="text-[10px] sm:text-[11px] text-gray-500 mt-1.5 sm:mt-2 truncate">
                            Mục tiêu: <span className="font-bold text-gray-700">{totalCreditsRequired}</span>
                        </div>
                    </div>

                    <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-300 transition-colors flex flex-col justify-between cursor-pointer relative overflow-hidden" onClick={() => { if(!isLocked) { playClick(); setShowRankingModal(true); } }}>
                        <div className="flex justify-between items-start mb-1">
                            <span className="text-[11px] sm:text-xs font-bold text-gray-600 truncate">BXH môn học</span>
                            <Trophy size={16} className="text-yellow-500 shrink-0 w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </div>

                        <div className="relative flex-1 flex flex-col justify-center">
                            {isLocked && (
                                <Link to="/login" onClick={playClick} className="absolute inset-x-[-8px] inset-y-[-4px] bg-white/80 z-20 flex items-center justify-center flex-col text-center rounded-lg cursor-pointer group hover:bg-white transition-colors border border-gray-200">
                                    <div className="bg-white px-3 py-1.5 rounded-xl border border-gray-300 flex flex-col items-center group-hover:scale-105 transition-transform">
                                        <Shield className="text-[#003375] mb-0.5 opacity-80" size={14} />
                                        <p className="text-[10px] font-bold text-[#003375]">Đăng nhập để xem</p>
                                    </div>
                                </Link>
                            )}
                            {highestSubject ? (
                                <div className="mt-1">
                                    <span className="text-[11px] sm:text-sm font-bold text-[#003375] line-clamp-1 leading-tight">{highestSubject.name}</span>
                                    <div className="mt-1 sm:mt-2 flex items-center gap-1.5 sm:gap-2">
                                        <span className="text-sm sm:text-[15px] font-extrabold text-gray-900 leading-none">{highestSubject.avg.toFixed(1)}</span>
                                        <span className="text-[9px] sm:text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 whitespace-nowrap">Điểm {highestSubject.letter}</span>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-[10px] sm:text-xs text-gray-400 italic mt-1.5 sm:mt-2">Chưa có dữ liệu</p>
                            )}
                        </div>
                    </div>

                    {FEATURE_FORECAST_TOOLS && (
                    <div className="z-20 bg-white p-3 sm:p-4 rounded-xl border border-gray-300 flex flex-col relative overflow-visible">
                        <div className="flex justify-between items-start mb-1">
                            <span className="text-[11px] sm:text-xs font-bold text-gray-600 truncate">Dự báo mục tiêu</span>
                            <Target size={16} className="text-[#003375] shrink-0 w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </div>

                        <div className="relative flex-1 flex flex-col justify-center">
                            {isLocked && (
                                <Link to="/login" onClick={playClick} className="absolute inset-x-[-8px] inset-y-[-4px] bg-white/80 z-20 flex items-center justify-center flex-col text-center rounded-lg cursor-pointer group hover:bg-white transition-colors border border-gray-200">
                                    <div className="bg-white px-3 py-1.5 rounded-xl border border-gray-300 flex flex-col items-center group-hover:scale-105 transition-transform">
                                        <Shield className="text-[#003375] mb-0.5 opacity-80" size={14} />
                                        <p className="text-[10px] font-bold text-[#003375]">Đăng nhập để xem</p>
                                    </div>
                                </Link>
                            )}
                            <div className="flex flex-col gap-1 sm:gap-1 text-[9px] sm:text-[11px] text-gray-600 mt-1">
                                <div className="flex justify-between items-center">
                                    <span className="truncate">Mục tiêu:</span>
                                    <TargetGpaTipInput
                                        value={activeData.targetGPA}
                                        onChange={handleLocalTargetChange}
                                    />
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="truncate">Hiện tại:</span>
                                    <span className="font-bold text-gray-900">{(Math.floor(stats.rawGPA4 * 100) / 100).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="truncate">Trung bình mỗi tín:</span>
                                    {requiredAnalysis?.isTargetAchieved ? (
                                        <span className="font-bold text-emerald-600">Đã đạt</span>
                                    ) : requiredAnalysis && requiredAnalysis.isPossible ? (
                                        <span className={`font-bold border-b border-transparent ${scoreClass}`}>{Math.max(0, requiredAnalysis.requiredGPA).toFixed(2)}</span>
                                    ) : (
                                        <span className="font-bold text-[#990000]">Không thể</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                    )}
                </div>

                <div className="flex flex-col gap-4 min-h-0">
                    <div className="flex flex-col gap-3 sm:gap-4">
                        <div className="bg-white p-3 sm:p-5 rounded-xl border border-gray-300 flex flex-col h-[240px] sm:h-auto sm:min-h-[340px]">
                            <div className="flex justify-between items-center mb-2 sm:mb-6">
                                <h3 className="text-[12px] sm:text-[15px] font-bold text-gray-900 tracking-tight">Xu hướng học tập</h3>
                                <div className="flex items-center gap-2 sm:gap-3 text-[9px] sm:text-[11px] font-bold text-gray-600">
                                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-[#003375]"></span>Hệ 4</span>
                                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-[#990000]"></span>Hệ 10</span>
                                </div>
                            </div>

                            <div className="flex-1 w-full -ml-5 sm:-ml-4 relative min-h-[100px]">
                                {isLocked && (
                                    <Link to="/login" onClick={playClick} className="absolute inset-0 bg-white/40 z-20 flex items-center justify-center flex-col text-center rounded-xl ml-5 sm:ml-4 shadow-[inset_0_0_20px_rgba(255,255,255,0.7)] hover:bg-white/50 transition-colors cursor-pointer group">
                                        <div className="bg-white/90 p-4 rounded-2xl shadow-sm border border-white flex flex-col items-center group-hover:scale-105 transition-transform">
                                            <Shield className="text-[#003375] mb-2 opacity-90" size={28} />
                                            <p className="text-sm font-bold text-[#003375]">Biểu đồ đã bị khóa</p>
                                            <p className="text-[11px] text-gray-500 mt-1 max-w-[200px]">Click để đăng nhập và mở khóa tính năng này.</p>
                                        </div>
                                    </Link>
                                )}

                                {trendData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={trendData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                            <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#6B7280', fontWeight: 500 }} axisLine={false} tickLine={false} dy={10} />
                                            <YAxis domain={[0, 10]} tickCount={6} tick={{ fontSize: 9, fill: '#6B7280', fontWeight: 500 }} axisLine={false} tickLine={false} />
                                            <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', fontSize: '11px', padding: '6px 10px' }} cursor={{ stroke: '#9CA3AF', strokeWidth: 1, strokeDasharray: '4 4' }} />
                                            <Line type="monotone" dataKey="gpa4" name="Hệ 4" stroke="#003375" strokeWidth={2} dot={{ r: 3, fill: '#fff', stroke: '#003375', strokeWidth: 2 }} activeDot={{ r: 5, fill: '#003375', stroke: '#fff', strokeWidth: 2 }} />
                                            <Line type="monotone" dataKey="gpa10" name="Hệ 10" stroke="#990000" strokeWidth={2} dot={{ r: 3, fill: '#fff', stroke: '#990000', strokeWidth: 2 }} activeDot={{ r: 5, fill: '#990000', stroke: '#fff', strokeWidth: 2 }} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-xs border border-dashed border-gray-300 rounded-xl ml-5 sm:ml-4">Chưa có dữ liệu học kỳ</div>
                                )}
                            </div>
                        </div>

                        <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-300 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-4 relative overflow-hidden">
                            <div className="flex-1 w-full">
                                <h3 className="text-xs sm:text-sm font-bold text-gray-900 flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                                    <BarChart3 size={14} className="text-[#003375] sm:w-4 sm:h-4"/> Đánh giá hệ thống
                                </h3>
                                <p className="text-[10px] sm:text-xs text-gray-500 font-medium leading-snug">"{trendAnalysis}"</p>
                            </div>
                            <div className="shrink-0 w-full sm:w-auto mt-1 sm:mt-0">
                                {failedCount > 0 ? (
                                    <button onClick={() => { playClick(); setShowFailedModal(true); }} className="w-full sm:w-auto flex items-center justify-between gap-3 px-3 py-2 bg-red-50 text-[#990000] border border-red-100 rounded-lg text-[11px] sm:text-xs font-bold hover:bg-red-100 transition-colors group">
                                        <span className="flex items-center gap-1.5"><AlertTriangle size={14} /> Tồn đọng {failedCount} môn nợ</span>
                                        <ChevronRight size={14} className="opacity-50 group-hover:opacity-100 transition-opacity" />
                                    </button>
                                ) : (
                                    <div className="w-full sm:w-auto flex items-center justify-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg text-[11px] sm:text-xs font-bold">
                                        <span className="flex items-center gap-1.5"><CheckCircle2 size={14} /> Không n? môn</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:gap-4 shrink-0">
                        <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-300 flex flex-col relative overflow-hidden">
                            <h3 className="text-[11px] sm:text-sm font-bold text-gray-900 tracking-tight mb-2 uppercase truncate">Phân bố điểm</h3>

                            <div className="h-[100px] sm:h-[130px] w-full relative flex flex-col items-center justify-center shrink-0">
                                {isLocked && (
                                    <Link to="/login" onClick={playClick} className="absolute inset-[-8px] bg-white/40 z-20 flex items-center justify-center flex-col text-center rounded-xl shadow-[inset_0_0_15px_rgba(255,255,255,0.7)] cursor-pointer group hover:bg-white/50 transition-colors">
                                        <div className="bg-white/90 p-3 rounded-xl shadow-sm border border-white flex flex-col items-center group-hover:scale-105 transition-transform">
                                            <Shield className="text-[#003375] mb-1 opacity-80" size={20} />
                                            <p className="text-[10px] font-bold text-[#003375]">Đăng nhập để xem</p>
                                        </div>
                                    </Link>
                                )}
                                {pieData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={pieData} cx="50%" cy="50%" innerRadius="55%" outerRadius="90%" paddingAngle={2} dataKey="value" stroke="none">
                                                {pieData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                                ))}
                                            </Pie>
                                            <RechartsTooltip contentStyle={{ borderRadius: '8px', fontSize: '11px', border: '1px solid #E5E7EB', padding: '4px 8px' }} itemStyle={{ padding: 0 }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-[10px] sm:text-xs">Chưa có dữ liệu</div>
                                )}
                            </div>
                        </div>

                        <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-300 flex flex-col relative overflow-hidden">
                            <div className="flex justify-between items-center mb-2 sm:mb-3">
                                <h3 className="text-[11px] sm:text-sm font-bold text-gray-900 uppercase truncate">Tổng kết năm</h3>
                                {yearlyStats.length > 3 && !isLocked && (
                                    <button onClick={() => { playClick(); setShowYearlyModal(true); }} className="text-[9px] sm:text-[10px] font-bold text-[#003375] hover:underline shrink-0 ml-1">Chi tiết</button>
                                )}
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1 relative">
                                {isLocked && (
                                    <Link to="/login" onClick={playClick} className="absolute inset-[-8px] bg-white/40 z-20 flex items-center justify-center flex-col text-center rounded-xl shadow-[inset_0_0_15px_rgba(255,255,255,0.7)] cursor-pointer group hover:bg-white/50 transition-colors">
                                        <div className="bg-white/90 p-3 rounded-xl shadow-sm border border-white flex flex-col items-center group-hover:scale-105 transition-transform">
                                            <Shield className="text-[#003375] mb-1 opacity-80" size={20} />
                                            <p className="text-[10px] font-bold text-[#003375]">Đăng nhập để xem</p>
                                        </div>
                                    </Link>
                                )}
                                <div className="grid grid-cols-6 text-[8px] sm:text-[9px] font-bold text-gray-400 uppercase tracking-wide border-b border-gray-300 pb-1 sm:pb-1.5 mb-1 sm:mb-1.5">
                                    <span className="col-span-2">Năm</span>
                                    <span className="text-center">TC</span>
                                    <span className="text-right">GPA(4)</span>
                                    <span className="text-right">GPA(10)</span>
                                    <span className="text-right">ĐRL</span>
                                </div>
                                {yearlyStats.slice(0, 4).map((year) => (
                                    <div key={year.yearId} className="grid grid-cols-6 gap-0.5 text-[9px] sm:text-[11px] items-center py-0.5 hover:bg-gray-50 rounded px-0.5 sm:px-1 transition-colors">
                                        <span className="col-span-2 min-w-0 pr-1" title={year.label}>
                                            <span className="block truncate font-medium text-gray-700">{year.label.replace('Năm học ', 'NH ')}</span>
                                            <span className={`block truncate text-[8px] sm:text-[9px] font-bold ${
                                                year.combinedClassification ? 'text-emerald-700' : 'text-gray-400'
                                            }`}>
                                                {year.combinedClassification || 'Chưa đủ ĐRL'}
                                            </span>
                                        </span>
                                        <span className="text-center text-gray-500">{year.hasData ? year.totalCredits : '-'}</span>
                                        <span className="text-right font-extrabold text-[#003375]">{year.hasData ? formatGpaWithoutRounding(year.rawGPA4) : '-'}</span>
                                        <span className="text-right font-extrabold text-[#990000]">{year.hasData ? formatGpaWithoutRounding(year.rawGPA10) : '-'}</span>
                                        <span className="text-right font-extrabold text-amber-700">{formatTrainingScore(year.averageTrainingScore)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="pt-2">
                    <div className="flex flex-row justify-between items-center flex-wrap mb-3 sm:mb-4 gap-2 border-t border-gray-200 pt-4 sm:pt-5 mt-2">
                        <h2 className="text-[15px] sm:text-xl font-bold text-gray-900 tracking-tight whitespace-nowrap">Chi tiết bảng điểm</h2>

                        <div className="flex items-center gap-1.5 sm:gap-3 flex-wrap justify-end">
                            <button
                                onClick={() => { playClick(); setShowReportModal(true); }}
                                className="text-red-600 bg-red-50 border border-red-200 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-bold hover:bg-red-100 transition-colors flex items-center gap-1 sm:gap-2 shadow-sm active:scale-95"
                            >
                                <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                <span className="hidden sm:inline">Báo lỗi</span>
                                <span className="sm:hidden">Lỗi</span>
                            </button>

                            <button
                                onClick={onExportPDF}
                                className="text-gray-600 bg-white border border-gray-200 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold hover:text-gray-900 hover:bg-gray-50 transition-colors flex items-center gap-1 sm:gap-2 shadow-sm active:scale-95"
                            >
                                <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                <span className="hidden sm:inline">Xuất PDF</span>
                                <span className="sm:hidden">Xuất</span>
                            </button>

                            <div>
                                <input
                                    type="file" accept=".pdf" ref={fileInputRef} className="hidden"
                                    onChange={onFileUpload}
                                />
                                <button
                                    onClick={onImportPDF}
                                    disabled={isImporting}
                                    className="bg-white text-[#003375] border border-gray-200 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-bold hover:border-[#003375] hover:bg-blue-50 transition-colors flex items-center gap-1 sm:gap-2 shadow-sm disabled:opacity-70 active:scale-95"
                                >
                                    {isImporting ? <Loader2 className="animate-spin w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <FileUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                                    <span className="hidden sm:inline">Nhập điểm PDF</span>
                                    <span className="sm:hidden">Nhập</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {semestersToRender.map((sem) => {
                            const originalIndex = activeData.semesters.findIndex(s => s.id === sem.id);

                            return (
                                <SemesterTable
                                    key={sem.id}
                                    semester={sem}
                                    index={originalIndex}
                                    onUpdateSemester={(updated) => handleLocalUpdateSemester(originalIndex, updated)}
                                    onRemoveSemester={() => handleLocalRemoveSemester(originalIndex)}
                                    allSemesterOptions={ALL_SEMESTERS}
                                    usedSemesterNames={usedSemesterNames}
                                    onCascadeUpdate={(newName) => handleCascadeUpdate(originalIndex, newName)}
                                    isReadOnly={isViewingAsAuditor}
                                    rankContext={{
                                       studentCode: (activeData as any).studentCode || (activeData as any).student_code || null,
                                        classCode: (activeData as any).className || (activeData as any).class_name || (activeData as any).classCode || (activeData as any).class_code || null,
                                        major: activeData.majorName || (activeData as any).major || null,
                                        currentSemesterId: normalizeSemesterId(sem.name)
                                    }}
                                />
                            )
                        })}

                        {activeData.semesters.length === 0 && (
                            <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
                                <p className="text-gray-500 mb-4 text-sm font-medium">Bạn chưa có học kỳ nào.</p>
                                <button onClick={handleLocalAddSemester} className="text-[#003375] font-bold hover:underline flex items-center justify-center gap-1 mx-auto text-sm transition-colors">
                                    <Plus size={16} /> Tạo thủ công
                                </button>
                            </div>
                        )}

                        {!isInitialState && nonSummerSemesters.length > 0 && nonSummerSemesters.length < ALL_SEMESTERS.length && (
                            <button onClick={handleLocalAddSemester} className="w-full py-4 border-2 border-dashed border-gray-200 text-gray-500 hover:text-gray-800 hover:border-gray-400 hover:bg-gray-50 rounded-xl font-semibold flex justify-center items-center gap-2 transition-all">
                                <Plus size={18}/> Thêm học kỳ mới
                            </button>
                        )}
                    </div>
                </div>

            </div>
        )}

        {/* Các Modal */}
        {showRankingModal && <SubjectRankingModal subjects={validSubjects} onClose={() => setShowRankingModal(false)} />}
        {showFailedModal && <FailedSubjectsModal subjects={failedSubjectsList} onClose={() => setShowFailedModal(false)} />}
        {showYearlyModal && <YearlyStatsModal stats={yearlyStats} onClose={() => setShowYearlyModal(false)} />}
        {showReportModal && <ReportErrorModal isOpen={showReportModal} onClose={() => setShowReportModal(false)} />}
    </div>
  );
};
