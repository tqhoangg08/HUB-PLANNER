import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom'; 
import { supabase } from '../utils/supabase';
import { Link } from 'react-router-dom';
import { SubjectRankingModal } from './SubjectRankingModal';
import { UserData, GradeStatus, Subject, Semester } from '../types';
import {
    calculateCumulativeStats,
    getDegreeClassification,
    calculateSubjectAverage,
    getSubjectStatus,
    calculateYearlyStats,
    calculateSemesterStats,
    analyzeTrend,
    calculateRequiredGPA,
    getGradeDetails
} from '../utils/calculations';
import { Target, AlertTriangle, User, BookOpen, BarChart3, Calendar, CheckCircle2, Pencil, Trophy, Zap, ChevronRight, X, GraduationCap, TrendingUp, Plus, Star, Search, Crown, Loader2, AlertCircle, BarChart2, ChevronLeft, Award, ArrowUpDown, ArrowUp, ArrowDown, ListFilter, Trash2, Download, FileUp, Info, Shield, ChevronDown, ShieldAlert, RefreshCw, Users, Filter, Flame } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import { playClick } from '../utils/audio';
import SchoolAnnouncements from './SchoolAnnouncements';
import { mapIdToDisplay } from '../utils/rankingData';
import { useForecastRank } from '../hooks/useForecastRank';
import { useUserRole } from '../hooks/useUserRole';
import { exportTranscriptToPdf } from '../utils/pdfExport';
import PushNotificationPrompt from '../components/PushNotificationPrompt'; // Đường dẫn tùy sếp lưu ở đâu

// ============================================================================
// HELPERS CHO GIAO DIỆN ADMIN
// ============================================================================
const getAvatarProps = (name: string) => {
    if (!name || name === 'Chưa cập nhật') return { initial: 'U', colorClass: 'bg-gray-100 text-gray-600' };
    const words = name.trim().split(' ');
    const lastWord = words[words.length - 1];
    const initial = lastWord.charAt(0).toUpperCase();

    const colors = [
        'bg-teal-100 text-teal-700',
        'bg-purple-100 text-purple-700',
        'bg-blue-100 text-blue-700',
        'bg-orange-100 text-orange-700',
        'bg-rose-100 text-rose-700',
        'bg-emerald-100 text-emerald-700'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return { initial, colorClass: colors[index] };
};

const getGpaBadge = (gpa: number) => {
    if (gpa >= 3.6) return { label: 'Xuất sắc', className: 'bg-orange-50 text-orange-600 border-orange-200' };
    if (gpa >= 3.2) return { label: 'Giỏi', className: 'bg-blue-50 text-blue-600 border-blue-200' };
    if (gpa >= 2.5) return { label: 'Khá', className: 'bg-yellow-50 text-yellow-600 border-yellow-200' };
    if (gpa >= 2.0) return { label: 'TB', className: 'bg-gray-50 text-gray-600 border-gray-200' };
    return { label: 'Yếu', className: 'bg-red-50 text-red-600 border-red-200' };
};

// ============================================================================
// MODAL: BÁO LỖI HỆ THỐNG
// ============================================================================
const ReportErrorModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
    const [location, setLocation] = useState('');
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [statusMsg, setStatusMsg] = useState<{text: string, type: 'success'|'error'} | null>(null);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!location.trim() || !description.trim()) {
            setStatusMsg({text: 'Vui lòng điền đầy đủ thông tin.', type: 'error'});
            return;
        }
        setSubmitting(true);
        playClick();
        try {
            if (!supabase) throw new Error("Chưa cấu hình database.");
            
            const { data: { session } } = await supabase.auth.getSession();
            
            const { error } = await supabase.from('bug_reports').insert([{
                user_id: session?.user?.id || null,
                error_location: location,
                description: description
            }]);

            if (error) throw error;
            setStatusMsg({text: 'Đã gửi báo cáo thành công. Cảm ơn bạn!', type: 'success'});
            setTimeout(() => {
                onClose();
                setLocation('');
                setDescription('');
                setStatusMsg(null);
            }, 2000);
        } catch (err: any) {
            setStatusMsg({text: err.message || 'Có lỗi xảy ra, vui lòng thử lại.', type: 'error'});
        } finally {
            setSubmitting(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[100000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn" onClick={onClose}>
            <div className="bg-white rounded-xl w-full max-w-md p-0 overflow-hidden animate-scaleIn border border-gray-300 relative flex flex-col" onClick={e => e.stopPropagation()}>
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
                        <div className="flex gap-3 pt-2">
                            <button type="button" onClick={onClose} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-all border border-gray-300">Hủy</button>
                            <button type="submit" disabled={submitting} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 border border-red-700">
                                {submitting ? <Loader2 className="animate-spin" size={18}/> : null} Gửi báo cáo
                            </button>
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
        <div className="fixed inset-0 z-[99999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn" onClick={onClose}>
            <div className="bg-white rounded-xl w-full max-w-md flex flex-col animate-scaleIn overflow-hidden border border-gray-300" onClick={e => e.stopPropagation()}>
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
                                            <span className="bg-gray-100 px-2 py-0.5 rounded font-medium border border-gray-200">{sub.credits} tín chỉ</span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="block text-xl font-bold text-[#990000]">{avg?.toFixed(1) || '0.0'}</span>
                                        <span className="text-[10px] text-[#990000] font-bold bg-red-50 px-1.5 py-0.5 rounded border border-red-200">RỚT MÔN</span>
                                    </div>
                                </div>
                             )
                        })}
                    </div>
                </div>
                <div className="p-3 border-t border-gray-300 bg-white">
                    <button onClick={onClose} className="w-full py-2 bg-gray-100 text-gray-700 rounded-lg font-bold text-sm border border-gray-300 hover:bg-gray-200 transition-colors">Đóng</button>
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
        <div className="fixed inset-0 z-[99999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn" onClick={onClose}>
            <div className="bg-white rounded-xl w-full max-w-md flex flex-col animate-scaleIn overflow-hidden border border-gray-300" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-gray-300 flex justify-between items-center bg-gray-50">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2 text-base">
                        <Calendar size={18} className="text-[#003375]" /> Tổng kết từng năm học
                    </h3>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-500 transition-colors"><X size={18} /></button>
                </div>
                <div className="p-4 overflow-y-auto max-h-[60vh] custom-scrollbar">
                    <div className="space-y-3">
                        {stats.map((year) => {
                            const yearClass = year.hasData ? getDegreeClassification(year.gpa4) : '-';
                            return (
                                <div key={year.yearId} className="bg-white border border-gray-300 rounded-lg p-3 hover:border-[#003375]/30 transition-colors">
                                    <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-300">
                                        <span className="font-bold text-gray-800 text-sm">{year.label}</span>
                                        <span className={`font-bold text-base ${year.hasData ? 'text-[#003375]' : 'text-gray-400'}`}>
                                            GPA: {year.hasData ? year.gpa4.toFixed(2) : '-'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs text-gray-600">
                                        <div className="flex gap-2">
                                            <span className="bg-gray-100 px-2 py-1 rounded font-medium border border-gray-200">TC: {year.totalCredits}</span>
                                            <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded border border-emerald-200 font-medium">Đạt: {year.passedCredits}</span>
                                        </div>
                                        <span className="font-bold text-[#003375] bg-blue-50 border border-blue-200 px-2 py-1 rounded">{yearClass}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
                <div className="p-3 border-t border-gray-300 bg-white">
                    <button onClick={onClose} className="w-full py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded-lg font-bold text-sm hover:bg-gray-200 transition-colors">Đóng</button>
                </div>
            </div>
        </div>, document.body
    );
};

const extractAcademicYearFromSemester = (semesterName: string) => {
    const match = semesterName.match(/(\d{4}-\d{4})/);
    return match ? match[1] : null;
};

interface PdfExportYearOption {
    yearId: string;
    label: string;
    semesterCount: number;
    totalCredits: number;
    hasData: boolean;
}

const PdfExportModal = ({
    isOpen,
    onClose,
    yearOptions,
    onExportFull,
    onExportYear,
    isExporting
}: {
    isOpen: boolean;
    onClose: () => void;
    yearOptions: PdfExportYearOption[];
    onExportFull: () => void;
    onExportYear: (yearId: string) => void;
    isExporting: boolean;
}) => {
    if (!isOpen) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[99999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
            onClick={() => {
                if (!isExporting) onClose();
            }}
        >
            <div
                className="bg-white rounded-xl w-full max-w-lg flex flex-col animate-scaleIn overflow-hidden border border-gray-300"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-4 border-b border-gray-300 flex justify-between items-center bg-gray-50">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2 text-base">
                        <Download size={18} className="text-[#003375]" /> Chọn phạm vi in PDF
                    </h3>
                    <button
                        onClick={onClose}
                        disabled={isExporting}
                        className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="p-4 overflow-y-auto max-h-[70vh] custom-scrollbar space-y-4">
                    <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-sm font-bold text-[#003375]">In bảng điểm toàn khóa</p>
                                <p className="text-xs text-gray-600 mt-1">
                                    Gộp toàn bộ học kỳ hợp lệ vào một file PDF duy nhất.
                                </p>
                            </div>
                            <GraduationCap className="w-5 h-5 text-[#003375] shrink-0" />
                        </div>
                        <button
                            onClick={onExportFull}
                            disabled={isExporting}
                            className="mt-4 w-full py-2.5 bg-[#003375] hover:bg-[#002759] text-white font-bold rounded-lg text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            {isExporting ? 'Đang chuẩn bị PDF...' : 'In toàn khóa'}
                        </button>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                            <Calendar className="w-4 h-4 text-[#003375]" />
                            <span>In bảng điểm theo năm học</span>
                        </div>

                        {yearOptions.length > 0 ? (
                            yearOptions.map((year) => (
                                <button
                                    key={year.yearId}
                                    onClick={() => onExportYear(year.yearId)}
                                    disabled={isExporting}
                                    className="w-full text-left rounded-xl border border-gray-300 hover:border-[#003375]/40 hover:bg-blue-50/50 p-4 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="font-bold text-gray-900 text-sm">{year.label}</p>
                                            <p className="text-xs text-gray-500 mt-1">
                                                {year.semesterCount} học kỳ hợp lệ
                                            </p>
                                        </div>
                                        <span className="text-[#003375] font-bold text-xs bg-blue-50 border border-blue-200 px-2 py-1 rounded-md">
                                            {year.hasData ? 'Có dữ liệu' : 'Chưa đủ dữ liệu'}
                                        </span>
                                    </div>

                                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-600">
                                        <span className="bg-gray-100 px-2 py-1 rounded-md border border-gray-200 font-medium">
                                            TC: {year.totalCredits}
                                        </span>
                                        <span className="bg-white px-2 py-1 rounded-md border border-gray-200 font-medium">
                                            File riêng theo năm
                                        </span>
                                    </div>
                                </button>
                            ))
                        ) : (
                            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">
                                Chưa có năm học hợp lệ để in riêng.
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-3 border-t border-gray-300 bg-white">
                    <button
                        onClick={onClose}
                        disabled={isExporting}
                        className="w-full py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded-lg font-bold text-sm hover:bg-gray-200 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        Đóng
                    </button>
                </div>
            </div>
        </div>,
        document.body
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
      className="w-full bg-white border border-gray-300 text-gray-900 text-sm rounded focus:ring-2 focus:ring-[#003375] focus:border-transparent p-1 text-center font-medium transition-all hover:border-gray-400"
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
interface SemesterTableProps {
  semester: Semester;
  index: number;
  onUpdateSemester: (updatedSemester: Semester) => void;
  onRemoveSemester: () => void;
  allSemesterOptions: string[];
  usedSemesterNames: string[];
  onCascadeUpdate: (newName: string) => void; 
  isReadOnly?: boolean;
}

const SemesterTable: React.FC<SemesterTableProps> = ({ semester, index, onUpdateSemester, onRemoveSemester, allSemesterOptions, usedSemesterNames, onCascadeUpdate, isReadOnly }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>(null);
    
  const { 
      fetchRank, result: rankingResult, loading: rankingLoading, error: rankingError, resetResult,
      fetchAvailableSemesters, availableSemesters, loadingSemesters, prepareSemesterRanks,
      resetSemesterRanks, semesterRanks, loadingSemesterRanks
  } = useForecastRank();

  const [showRankMenu, setShowRankMenu] = useState(false);
  const rankMenuRef = useRef<HTMLDivElement>(null);
    
  const isValidFormat = /^Học kỳ (1|2|3|Hè) Năm học \d{4}-\d{4}$/.test(semester.name);

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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (rankMenuRef.current && !rankMenuRef.current.contains(event.target as Node)) {
            setShowRankMenu(false);
            resetSemesterRanks();
        }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
  if (semTotalCredits > 0) {
      const raw4 = semWeightedScore4 / semTotalCredits;
      const step1_4 = Math.round((raw4 + Number.EPSILON) * 100) / 100;
      semGPA4 = Math.round((step1_4 + Number.EPSILON) * 10) / 10;

      const raw10 = semWeightedScore10 / semTotalCredits;
      const step1_10 = Math.round((raw10 + Number.EPSILON) * 100) / 100;
      semGPA10 = Math.round((step1_10 + Number.EPSILON) * 10) / 10;
  }
    
  const classification = hasData ? getDegreeClassification(semGPA4) : '---';
  const scholarshipStatus = (() => {
    const drl = semester.trainingScore ?? 0;
    const credits = totalRegisteredCredits;
    const gpa = semGPA4;

    const meetsRequirements = credits >= 15 && gpa >= 3.2 && drl >= 80;
    if (!meetsRequirements) return { label: 'Không đạt', className: 'bg-gray-100 text-gray-500 border-gray-200' };
    if (gpa >= 3.6 && drl >= 90) return { label: '🏆 HB Xuất sắc', className: 'bg-yellow-50 text-yellow-700 border-yellow-200' };
    return { label: '💰 HB Giỏi', className: 'bg-green-50 text-green-700 border-green-200' };
  })();

  const handleOpenRankMenu = () => {
      playClick(); setShowRankMenu(true);
      prepareSemesterRanks(semGPA4, totalRegisteredCredits, semester.trainingScore ?? 0);
      fetchAvailableSemesters(); 
  };

  const handleSelectReferenceSemester = (refId: string) => {
      playClick(); fetchRank(refId, semGPA4, totalRegisteredCredits, semester.trainingScore ?? 0);
  };

  let headerColor = "bg-gray-50 border-gray-300";
  if (hasData) {
      if (semGPA4 >= 3.6) headerColor = "bg-green-50 border-green-300"; 
      else if (semGPA4 >= 3.2) headerColor = "bg-blue-50 border-blue-300"; 
      else if (semGPA4 >= 2.5) headerColor = "bg-indigo-50 border-indigo-300"; 
      else if (semGPA4 >= 2.0) headerColor = "bg-yellow-50 border-yellow-300"; 
      else if (semGPA4 >= 1.0) headerColor = "bg-orange-50 border-orange-300"; 
      else headerColor = "bg-red-50 border-red-300"; 
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
    <div className={`mb-5 sm:mb-8 bg-white rounded-xl border overflow-visible ${hasData || isValidFormat ? 'border-gray-300' : 'border-red-400'}`}>
      <div className={`px-3 py-3 sm:px-6 sm:py-4 flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 ${isValidFormat ? headerColor : 'bg-red-50/30 border-red-300'} rounded-t-xl ${isValidFormat ? 'border-b' : 'border-b-0'}`}>
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
                         <option value="" disabled className="text-red-500 font-bold">👉 Vui lòng chọn lại tên học kỳ (Sai định dạng)</option>
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
                <span className={`text-[10px] sm:text-xs px-2 py-0.5 sm:py-1 rounded-full font-bold border border-gray-300 bg-white text-gray-700 whitespace-nowrap shrink-0`}>
                    {classification}
                </span>
            )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 md:gap-4 text-[11px] sm:text-sm relative z-10">
              {hasData && isValidFormat && (
                  <div className="relative" ref={rankMenuRef}>
                      <button 
                          onClick={handleOpenRankMenu}
                          className={`flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg border transition-all active:scale-95 ${showRankMenu ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                          title="Xếp hạng dự báo"
                      >
                          <Crown className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${rankingResult ? "fill-yellow-500 text-yellow-600" : "text-gray-400"}`}/> 
                          <span className="font-bold text-[#003375]">Xếp hạng 👑</span>
                      </button>

                      {showRankMenu && (
                          <div className="absolute top-full left-0 md:left-auto md:right-0 mt-2 w-72 sm:w-80 bg-white rounded-xl border border-gray-300 z-[60] overflow-hidden animate-fadeIn origin-top-left md:origin-top-right">
                              <div className="bg-[#003375] px-4 py-3 text-white flex justify-between items-center shrink-0">
                                  <h4 className="font-bold text-sm flex items-center gap-2"><BarChart2 size={16}/> Xếp Hạng Dự Báo</h4>
                                  <button onClick={() => { setShowRankMenu(false); resetSemesterRanks(); }} className="hover:bg-white/20 p-1 rounded-full transition-colors"><X size={14}/></button>
                              </div>
                              <div className="p-0">
                                  {rankingLoading ? (
                                      <div className="flex flex-col items-center justify-center py-8 text-[#003375]">
                                          <Loader2 size={32} className="animate-spin mb-2"/>
                                          <span className="text-xs font-medium">Đang tính toán...</span>
                                      </div>
                                  ) : rankingResult ? (
                                      <div className="p-4 bg-gradient-to-b from-blue-50 to-white border-b border-gray-300">
                                          <button onClick={() => resetResult()} className="flex items-center gap-1 text-xs text-gray-500 hover:text-[#003375] mb-3 transition-colors"><ChevronLeft size={14}/> Chọn kỳ khác</button>
                                          <div className="text-center space-y-4">
                                              <p className="text-xs text-gray-500 uppercase tracking-wide">So sánh với: <span className="font-bold text-[#003375]">{mapIdToDisplay(rankingResult.semesterId)}</span></p>
                                              <div className="bg-white p-4 rounded-xl border border-gray-300">
                                                  <p className="text-sm text-gray-500 mb-1">Xếp hạng của bạn</p>
                                                  <p className="text-3xl font-black text-yellow-600">#{rankingResult.rank} <span className="text-sm font-medium text-gray-400">/ {rankingResult.totalStudents}</span></p>
                                              </div>
                                              <div className="bg-[#003375] text-white p-4 rounded-xl relative overflow-hidden border border-[#002855]">
                                                  <div className="absolute -right-4 -top-4 w-20 h-20 bg-white opacity-10 rounded-full"></div>
                                                  <p className="text-xs opacity-80 uppercase mb-1">Top Percentile</p>
                                                  <p className="text-2xl font-bold flex items-center justify-center gap-2"><TrendingUp size={20}/> Top {rankingResult.topPercent.toFixed(1)}%</p>
                                              </div>
                                          </div>
                                      </div>
                                  ) : (
                                      <div className="flex flex-col max-h-[300px]">
                                          <div className="p-3 bg-gray-50 border-b border-gray-200 text-xs text-gray-500 italic">Chọn nguồn dữ liệu (Kỳ học cũ)...</div>
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
                                                          <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-[#003375]"/>
                                                      </button>
                                                      );
                                                  })
                                              ) : (
                                                  <div className="py-6 text-center"><p className="text-xs text-gray-400 mb-2">Chưa có dữ liệu.</p></div>
                                              )}
                                          </div>
                                          {rankingError && <div className="p-2 bg-red-50 text-red-600 text-xs text-center border-t border-red-200 flex items-center justify-center gap-1"><AlertCircle size={12}/> {rankingError}</div>}
                                      </div>
                                  )}
                              </div>
                          </div>
                      )}
                  </div>
              )}

            <div className="flex items-center gap-1 sm:gap-2 bg-white px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg border border-gray-300 transition-transform hover:scale-105">
                <span className="text-gray-500 font-medium flex items-center gap-1"><BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4"/> <span className="hidden sm:inline">TC:</span></span>
                <span className="font-bold text-gray-800">{isValidFormat ? totalRegisteredCredits : '-'} <span className="sm:hidden font-medium text-[10px] text-gray-500">TC</span></span>
            </div>

            <div className="flex items-center gap-1 sm:gap-2 bg-white px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg border border-gray-300 transition-transform hover:scale-105">
                <span className="text-gray-500 font-medium">GPA(4):</span>
                <span className="font-bold text-[#003375]">{hasData && isValidFormat ? semGPA4.toFixed(2) : '-'}</span>
            </div>

            <div className="flex items-center gap-1 sm:gap-2 bg-white px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg border border-gray-300 transition-transform hover:scale-105">
                <span className="text-gray-500 font-medium">GPA(10):</span>
                <span className="font-bold text-[#990000]">{hasData && isValidFormat ? semGPA10.toFixed(2) : '-'}</span>
            </div>

            <div className="flex items-center gap-1 sm:gap-2 bg-white pl-2 pr-1 py-0.5 sm:pl-3 sm:pr-1 sm:py-1 rounded-lg border border-gray-300 transition-transform hover:scale-105">
                <span className="text-gray-500 font-medium flex items-center gap-1"><Star className="text-yellow-500 fill-yellow-500 w-3.5 h-3.5 sm:w-4 sm:h-4"/> <span className="hidden sm:inline">ĐRL:</span></span>
                <input 
                    type="number" min="0" max="100" placeholder="0"
                    disabled={!isValidFormat}
                    className="w-7 sm:w-10 text-center font-bold text-gray-800 outline-none border-b border-transparent focus:border-[#003375] focus:bg-gray-50 rounded transition-colors bg-transparent disabled:opacity-50"
                    value={semester.trainingScore ?? ''}
                    onChange={(e) => handleTrainingScoreChange(e.target.value)}
                    onKeyDown={(e) => { if (["e", "E", "+", "-"].includes(e.key)) e.preventDefault(); }}
                />
            </div>

            <div className={`flex items-center gap-1 sm:gap-2 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg border text-[11px] sm:text-sm font-bold ${isValidFormat ? scholarshipStatus.className : 'bg-gray-100 text-gray-400 border-gray-300'}`}>
                <Award className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>{isValidFormat ? scholarshipStatus.label : '---'}</span>
            </div>
            
             <button onClick={onRemoveSemester} className="ml-auto md:ml-0 text-gray-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-all p-1.5 sm:p-2 rounded-lg active:scale-90" title="Xóa học kỳ">
             <Trash2 className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
            </button>
        </div>
      </div>

      {isValidFormat ? (
        <>
            {semester.subjects.length > 0 && (
                <div className="px-3 py-2 sm:px-6 sm:py-2 bg-gray-50/50 border-b border-gray-300 flex flex-row gap-2 justify-between sm:justify-end items-center">
                    <button onClick={handleSortToggle} className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-lg border text-[11px] sm:text-sm font-medium transition-all active:scale-95 ${sortOrder ? 'bg-blue-50 border-blue-300 text-[#003375]' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`} title="Sắp xếp theo điểm">
                        {sortOrder === 'desc' ? (<><ArrowDown className="text-yellow-500 w-3.5 h-3.5 sm:w-4 sm:h-4"/><span>Cao ➝ Thấp</span></>) : sortOrder === 'asc' ? (<><ArrowUp className="text-yellow-500 w-3.5 h-3.5 sm:w-4 sm:h-4"/><span>Thấp ➝ Cao</span></>) : (<><ListFilter className="w-3.5 h-3.5 sm:w-4 sm:h-4"/><span>Sắp xếp</span></>)}
                    </button>

                    <div className="relative flex-1 sm:w-64 sm:flex-none">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        <input type="text" placeholder="Tìm môn học..." className="w-full pl-8 pr-7 py-1.5 text-[11px] sm:text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#003375] focus:border-[#003375] transition-colors hover:border-gray-400" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                        {searchTerm && (<button onClick={() => { playClick(); setSearchTerm(''); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 hover:scale-110 transition-transform"><X className="w-3 h-3 sm:w-3.5 sm:h-3.5" /></button>)}
                    </div>
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                <thead className="text-xs text-white uppercase bg-[#003375] border-b border-[#002855]">
                    <tr>
                        <th className="px-3 py-3 w-10 text-center">STT</th>
                        <th className="px-2 py-3 w-14 text-center">10%</th>
                        <th className="px-2 py-3 w-14 text-center">20%</th>
                        <th className="px-2 py-3 w-14 text-center">20%</th>
                        <th className="px-2 py-3 w-14 text-center">50%</th>
                        <th className="px-3 py-3 min-w-[180px]">Môn học</th>
                        <th className="px-2 py-3 w-12 text-center">TC</th>
                        <th className="px-2 py-3 w-14 text-center">TB(10)</th>
                        <th className="px-2 py-3 w-14 text-center">Chữ</th>
                        <th className="px-2 py-3 w-14 text-center">TB(4)</th>
                        <th className="px-3 py-3 w-20 text-center">Trạng thái</th>
                        <th className="px-2 py-3 w-8"></th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                    {processedSubjects.length > 0 ? (
                        processedSubjects.map((subject, sIdx) => {
                        const avg10 = calculateSubjectAverage(subject);
                        const { scale4: avg4, letter } = avg10 !== null ? getGradeDetails(avg10) : { scale4: null, letter: '-' };
                        const status = getSubjectStatus(avg10);
                        
                        let statusClass = "text-gray-400";
                        let statusText = "-";
                        let rowClass = "hover:bg-blue-50/30";

                        if (status === GradeStatus.FAIL) {
                            statusClass = "bg-red-50 border border-red-200 text-[#990000] font-bold";
                            statusText = "Rớt";
                            rowClass = "bg-red-50/20 hover:bg-red-50/50";
                        } else if (status === GradeStatus.IMPROVE) {
                            statusClass = "bg-yellow-50 border border-yellow-200 text-yellow-700";
                            statusText = "Đạt";
                        } else if (status === GradeStatus.PASS) {
                            statusClass = "bg-green-50 border border-green-200 text-green-700 font-bold";
                            statusText = "Đạt";
                        }

                        return (
                            <tr key={subject.id} className={`${rowClass} transition-colors duration-150 group`}>
                                <td className="px-3 py-2 text-center text-gray-500">{sIdx + 1}</td>
                                
                                {['scoreCC', 'scoreProcess', 'scoreMid', 'scoreFinal'].map((key) => (
                                    <td key={key} className="px-1 py-2">
                                        <ScoreInput value={subject[key as keyof Subject] as number | null} onChange={(val) => handleSubjectChange(subject.id, key as keyof Subject, val)} />
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
                        <tr><td colSpan={12} className="py-8 text-center text-gray-500">Không tìm thấy môn học nào phù hợp với "{searchTerm}"</td></tr>
                    )}
                </tbody>
                </table>
            </div>
            
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-300 rounded-b-xl flex justify-between items-center">
                <button onClick={addSubject} className="flex items-center gap-1 text-sm font-bold text-[#003375] border border-gray-300 bg-white hover:bg-gray-100 rounded-lg px-3 py-1.5 transition-colors active:scale-95"><Plus size={16} /> Thêm môn học</button>
            </div>
        </>
      ) : (
          <div className="p-8 text-center bg-red-50/40 border-t border-red-300 flex flex-col items-center justify-center rounded-b-xl">
              <ShieldAlert className="text-red-500 mb-2 w-10 h-10 animate-pulse" />
              <p className="text-red-700 font-bold mb-1">Nội dung học kỳ đang bị khóa</p>
              <p className="text-red-600 text-xs max-w-sm">Tên học kỳ không hợp lệ. Vui lòng chọn một tên học kỳ có sẵn trong danh sách phía trên để mở khóa tính năng nhập điểm!</p>
          </div>
      )}
    </div>
  );
};


// ============================================================================
// 5. MAIN COMPONENT: DASHBOARD
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
}

export const Dashboard: React.FC<DashboardProps> = ({ 
    data, 
    onSetSemesters,
    onTargetChange, 
    showSecurityNotice,
    onUpdateSemester,
    onRemoveSemester,
    onAddSemester,
    onImportPDF,
    isImporting,
    fileInputRef,
    onFileUpload,
    isGuest,
    onRequireOnboarding
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
            await supabase.from('profiles').update({
                data: newData,
                updated_at: new Date().toISOString()
            }).eq('id', selectedAdminUserId);

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
    const [adminSort, setAdminSort] = useState<string>('updated_desc');
    
    const [adminFilterCohort, setAdminFilterCohort] = useState<string>('all');
    const [adminFilterMajor, setAdminFilterMajor] = useState<string>('all');
    const [adminFilterGpa, setAdminFilterGpa] = useState<'all' | 'warning' | 'excellent' | 'nogpa'>('all');
    const [adminFilterSemester, setAdminFilterSemester] = useState<string>('all');

    const itemsPerPage = 20;

    useEffect(() => { 
        setCurrentPage(1); 
        setPageInput('1'); 
    }, [adminSearch, adminSort, adminFilterCohort, adminFilterMajor, adminFilterGpa, adminFilterSemester]);

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
    const [showPdfExportModal, setShowPdfExportModal] = useState(false);
    const [showReportModal, setShowReportModal] = useState(false);
    const [isExportingPdf, setIsExportingPdf] = useState(false);

    const showAdminPanel = (isAdmin || isAuditor) && adminMode === 'list';

    const fetchAdminData = async () => {
        setLoadingAdmin(true);
        let allProfiles: any[] = [];
        let hasMore = true;
        let page = 0;
        const pageSize = 1000;

        while (hasMore) {
            const { data: profiles, error } = await supabase
                .from('profiles')
                .select('id, student_code, full_name, updated_at, data')
                .order('updated_at', { ascending: false })
                .range(page * pageSize, (page + 1) * pageSize - 1);
            
            if (error) {
                console.error(error);
                break;
            }
            
            if (profiles && profiles.length > 0) {
                allProfiles = [...allProfiles, ...profiles];
                if (profiles.length < pageSize) {
                    hasMore = false; 
                } else {
                    page++; 
                }
            } else {
                hasMore = false;
            }
        }
        
        setAdminUsers(allProfiles);
        setLoadingAdmin(false);
        setCurrentPage(1);
        setPageInput('1');
    };

    useEffect(() => {
        if (showAdminPanel && adminUsers.length === 0) {
            fetchAdminData();
        }
    }, [showAdminPanel]);

    const { adminCohorts, adminMajors, adminSemesters } = useMemo(() => {
        const cSet = new Set<string>();
        const mSet = new Set<string>();
        const sSet = new Set<string>();

        adminUsers.forEach(u => {
            if (u.data?.cohort) cSet.add(u.data.cohort);
            if (u.data?.majorName) mSet.add(u.data.majorName);
            if (u.data?.semesters) {
                u.data.semesters.forEach((sem: any) => {
                    if (/^Học kỳ (1|2|3|Hè) Năm học \d{4}-\d{4}$/.test(sem.name)) {
                        sSet.add(sem.name);
                    }
                });
            }
        });

        const sortedSems = Array.from(sSet).sort((a, b) => {
            const getW = (name: string) => {
                const match = name.match(/Học kỳ (1|2|3|Hè) Năm học (\d{4})-(\d{4})/);
                if (!match) return 0;
                const hk = match[1] === 'Hè' ? 3 : parseInt(match[1]);
                const year = parseInt(match[2]);
                return year * 10 + hk;
            };
            return getW(b) - getW(a); 
        });

        return {
            adminCohorts: Array.from(cSet).sort(),
            adminMajors: Array.from(mSet).sort(),
            adminSemesters: sortedSems
        };
    }, [adminUsers]);

    const baseFilteredUsers = useMemo(() => {
        return adminUsers
            .map(u => {
                 let validSems = (u.data?.semesters || []).filter((s:any) => /^Học kỳ (1|2|3|Hè) Năm học \d{4}-\d{4}$/.test(s.name));

                 if (adminFilterSemester !== 'all') {
                     validSems = validSems.filter((s: any) => s.name === adminFilterSemester);
                 }

                 const stats = calculateCumulativeStats(validSems);
                 return { ...u, _computedGpa: stats.rawGPA4, _computedCredits: stats.passedCredits };
            })
            .filter(u => {
                const matchSearch = (u.student_code && u.student_code.toLowerCase().includes(adminSearch.toLowerCase())) ||
                    (u.full_name && u.full_name.toLowerCase().includes(adminSearch.toLowerCase())) ||
                    (u.data?.studentName && u.data.studentName.toLowerCase().includes(adminSearch.toLowerCase()));
                
                const matchCohort = adminFilterCohort === 'all' || u.data?.cohort === adminFilterCohort;
                const matchMajor = adminFilterMajor === 'all' || u.data?.majorName === adminFilterMajor;
                
                const matchSemester = adminFilterSemester === 'all' || u._computedCredits > 0;

                return matchSearch && matchCohort && matchMajor && matchSemester;
            });
    }, [adminUsers, adminSearch, adminFilterCohort, adminFilterMajor, adminFilterSemester]);

    const adminSummary = useMemo(() => {
        if (baseFilteredUsers.length === 0) return { total: 0, avgGPA: 0, warning: 0, excellent: 0 };
        let sumGPA = 0;
        let countGPA = 0;
        let warning = 0;
        let excellent = 0;

        baseFilteredUsers.forEach(u => {
            if (u._computedGpa > 0) {
                sumGPA += u._computedGpa;
                countGPA++;
                if (u._computedGpa < 2.0) warning++;
                if (u._computedGpa >= 3.6) excellent++;
            }
        });

        return {
            total: baseFilteredUsers.length,
            avgGPA: countGPA > 0 ? (sumGPA / countGPA).toFixed(2) : 0,
            warning,
            excellent
        };
    }, [baseFilteredUsers]);

    const processedAdminUsers = useMemo(() => {
        let result = [...baseFilteredUsers];

        if (adminFilterGpa !== 'all') {
            if (adminFilterGpa === 'warning') {
                result = result.filter(u => u._computedGpa > 0 && u._computedGpa < 2.0);
            } else if (adminFilterGpa === 'excellent') {
                result = result.filter(u => u._computedGpa >= 3.6);
            } else if (adminFilterGpa === 'nogpa') {
                result = result.filter(u => !u._computedCredits || u._computedCredits === 0);
            }
        }

        result.sort((a, b) => {
            if (adminSort === 'gpa_desc') return b._computedGpa - a._computedGpa;
            if (adminSort === 'gpa_asc') return a._computedGpa - b._computedGpa;
            if (adminSort === 'credits_desc') return b._computedCredits - a._computedCredits;
            if (adminSort === 'credits_asc') return a._computedCredits - b._computedCredits;
            if (adminSort === 'mssv_asc') return (a.student_code || '').localeCompare(b.student_code || '');
            if (adminSort === 'mssv_desc') return (b.student_code || '').localeCompare(a.student_code || '');
            if (adminSort === 'name_asc') {
                const nameA = a.full_name || a.data?.studentName || '';
                const nameB = b.full_name || b.data?.studentName || '';
                return nameA.localeCompare(nameB);
            }
            if (adminSort === 'name_desc') {
                const nameA = a.full_name || a.data?.studentName || '';
                const nameB = b.full_name || b.data?.studentName || '';
                return nameB.localeCompare(nameA);
            }
            if (adminSort === 'cohort_asc') return (a.data?.cohort || '').localeCompare(b.data?.cohort || '');
            if (adminSort === 'cohort_desc') return (b.data?.cohort || '').localeCompare(a.data?.cohort || '');
            if (adminSort === 'updated_asc') return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
            
            return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        });

        return result;
    }, [baseFilteredUsers, adminSort, adminFilterGpa]);

    const handleSortClick = (column: string) => {
        playClick();
        if (adminSort.startsWith(column)) {
            setAdminSort(adminSort.endsWith('_asc') ? `${column}_desc` : `${column}_asc`);
        } else {
            if (column === 'gpa' || column === 'credits' || column === 'updated') {
                setAdminSort(`${column}_desc`);
            } else {
                setAdminSort(`${column}_asc`);
            }
        }
    };

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
            const newSem: Semester = { id: Date.now().toString(), name: '', subjects: [], trainingScore: null };
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
            options.push(`Học kỳ Hè Năm học ${y}-${y+1}`);
        }
        return options;
    }, []);

    const handleCascadeUpdate = (targetIndex: number, newName: string) => {
        const match = newName.match(/Học kỳ (1|2|3|Hè) Năm học (\d{4})-(\d{4})/);
        if (!match) {
            handleLocalUpdateSemester(targetIndex, { ...activeData.semesters[targetIndex], name: newName });
            return;
        }

        const targetHk = match[1] === 'Hè' ? 3 : parseInt(match[1]);
        const targetYear = parseInt(match[2]);
        const targetAbs = targetYear * 3 + (targetHk - 1);

        const isFirstSpawn = activeData.semesters.length === 1 && activeData.semesters[0].name === '';
        const targetLength = isFirstSpawn ? 8 : activeData.semesters.length;

        const newSemesters = [...activeData.semesters];

        for (let i = 0; i < targetLength; i++) {
            const offset = i - targetIndex; 
            const currentAbs = targetAbs + offset;
            
            const currentYear = Math.floor(currentAbs / 3);
            const hkIndex = currentAbs % 3;
            const currentHk = hkIndex === 2 ? 'Hè' : (hkIndex + 1).toString();

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

    // ✨ TÍNH NĂNG: TỰ ĐỘNG ĐIỀN ĐIỂM RÈN LUYỆN TỪ DB TRƯỜNG ✨
    useEffect(() => {
        const fetchAndFillTrainingScore = async () => {
            // 1. Xác định MSSV
            let targetStudentCode = (data as any).studentCode || (data as any).student_code; 
            if (selectedAdminUserId) {
                const adminViewUser = adminUsers.find(u => u.id === selectedAdminUserId);
                if (adminViewUser) targetStudentCode = adminViewUser.student_code;
            } else if (!targetStudentCode) {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const { data: profile } = await supabase.from('profiles').select('student_code').eq('id', user.id).single();
                    targetStudentCode = profile?.student_code;
                }
            }

            if (!targetStudentCode) return;

            let hasChanges = false;
            const newSemesters = [...activeData.semesters];

            // 2. Quét các học kỳ chưa nhập điểm
            for (let i = 0; i < newSemesters.length; i++) {
                const sem = newSemesters[i];
                
                // Chỉ tự động điền nếu user chưa nhập
                if (sem.trainingScore === null || sem.trainingScore === undefined || sem.trainingScore === 0) {
                    
                    const match = sem.name.match(/Học kỳ (1|2|3|Hè) Năm học (\d{4})-(\d{4})/);
                    if (match) {
                        const hk = match[1] === 'Hè' ? '3' : match[1]; 
                        const year1 = match[2];
                        const year2 = match[3];
                        const semId = `HK${hk}_${year1}_${year2}`;

                        // Móc dữ liệu từ bảng official_training_scores
                        const { data: official, error } = await supabase
                            .from('official_training_scores')
                            .select('official_score')
                            .eq('student_code', targetStudentCode)
                            .eq('semester_id', semId)
                            .single();

                        if (official && !error && official.official_score !== null && official.official_score !== undefined) {
                            newSemesters[i] = { ...sem, trainingScore: official.official_score };
                            hasChanges = true;
                        }
                    }
                }
            }

            // 3. Cập nhật lại giao diện
            if (hasChanges) {
                handleLocalSetSemesters(newSemesters);
            }
        };

        if (activeData.semesters && activeData.semesters.length > 0) {
            fetchAndFillTrainingScore();
        }
    }, [activeData.semesters.length, selectedAdminUserId]);

    // ✨ TÍNH NĂNG 2: FETCH RANK ĐIỂM RÈN LUYỆN ✨
    const [drlRank, setDrlRank] = useState<any>(null);

    useEffect(() => {
        const fetchDrlRank = async () => {
            if (isGuest || showAdminPanel || isViewingAsAuditor) return;
            
            // 1. Lấy MSSV của sinh viên đang đăng nhập
            const targetStudentCode = (data as any).studentCode || (data as any).student_code;
            if (!targetStudentCode) return;

            try {
                // 2. Chọc vào bảng v_drl_ranking
                const { data: rankData, error } = await supabase
                    .from('v_drl_ranking')
                    .select('*')
                    .eq('student_code', targetStudentCode)
                    // Bỏ dòng order semester_id đi nếu bảng View của sếp chưa có cột này để tránh lỗi
                    .limit(1)
                    .maybeSingle(); // ✨ SỬA THÀNH maybeSingle() Ở ĐÂY NÈ SẾP

                if (rankData && !error) {
                    setDrlRank(rankData);
                }
            } catch (err) {
                console.error("❌ [RANK-DRL] Lỗi Code React:", err);
            }
        };

        fetchDrlRank();
    }, [isGuest, showAdminPanel, isViewingAsAuditor, data]);


    const sortedSemesters = useMemo(() => {
        const getWeight = (name: string) => {
            if (!name) return 999999;
            const match = name.match(/Học kỳ (1|2|3|Hè) Năm học (\d{4})-(\d{4})/);
            if (!match) return 999998; 
            const hk = match[1] === 'Hè' ? 3 : parseInt(match[1]);
            const year = parseInt(match[2]);
            return year * 10 + hk;
        };
        return [...activeData.semesters].sort((a, b) => getWeight(a.name) - getWeight(b.name));
    }, [activeData.semesters]);

    const isInitialState = activeData.semesters.length > 0 && activeData.semesters.every(s => !s.name || !ALL_SEMESTERS.includes(s.name));
    const semestersToRender = isInitialState ? [activeData.semesters[0]] : sortedSemesters;
    const usedSemesterNames = activeData.semesters.map(s => s.name);
    const isLocked = isGuest && !activeData.hasOnboarded;

    const validDataSemesters = activeData.semesters.filter(s => /^Học kỳ (1|2|3|Hè) Năm học \d{4}-\d{4}$/.test(s.name));

    const stats = calculateCumulativeStats(validDataSemesters);
    const yearlyStats = calculateYearlyStats(validDataSemesters);
    const trendAnalysis = analyzeTrend(validDataSemesters);
    const pdfExportYearOptions = useMemo(
        () =>
            yearlyStats
                .map((year) => {
                    const semesters = validDataSemesters.filter(
                        (semester) => extractAcademicYearFromSemester(semester.name) === year.yearId
                    );

                    return {
                        yearId: year.yearId,
                        label: year.label,
                        semesterCount: semesters.length,
                        totalCredits: year.totalCredits,
                        hasData: year.hasData
                    };
                })
                .filter((year) => year.semesterCount > 0),
        [yearlyStats, validDataSemesters]
    );

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
                const hkPart = sem.name.match(/Học kỳ (1|2|3|Hè)/);
                if (yearPart && hkPart) shortName = `HK${hkPart[1]}/${yearPart[1].slice(2)}`;
            } else {
                shortName = sem.name.replace('Năm ', 'N').replace(' - Học kỳ ', '.HK').replace('Học kỳ Hè', 'Hè');
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
    const totalCreditsRequired = activeData.totalCreditsRequired || 125;

    const handleOpenPdfExportModal = () => {
        playClick();

        if (validDataSemesters.length === 0) {
            alert('Chưa có dữ liệu học kỳ hợp lệ để in PDF.');
            return;
        }

        setShowPdfExportModal(true);
    };

    const handleExportFullPdf = async () => {
        playClick();
        setIsExportingPdf(true);

        try {
            await exportTranscriptToPdf(activeData, {
                scope: 'full',
                semesters: validDataSemesters
            });
            setShowPdfExportModal(false);
        } finally {
            setIsExportingPdf(false);
        }
    };

    const handleExportYearPdf = async (yearId: string) => {
        playClick();

        const selectedYear = pdfExportYearOptions.find((year) => year.yearId === yearId);
        if (!selectedYear) return;

        const yearSemesters = validDataSemesters.filter(
            (semester) => extractAcademicYearFromSemester(semester.name) === yearId
        );

        setIsExportingPdf(true);

        try {
            await exportTranscriptToPdf(activeData, {
                scope: 'year',
                semesters: yearSemesters,
                academicYearLabel: selectedYear.label
            });
            setShowPdfExportModal(false);
        } finally {
            setIsExportingPdf(false);
        }
    };
    
    const requiredAnalysis = calculateRequiredGPA(
        stats.rawGPA4, 
        stats.passedCredits,
        totalCreditsRequired,
        activeData.targetGPA
    );

    let difficultyColor = "text-[#003375] bg-blue-50 border-blue-200";
    let difficultyText = "Tốt";
    let scoreClass = "text-[#003375]";

    if (requiredAnalysis && requiredAnalysis.isPossible) {
        const req = requiredAnalysis.requiredGPA;
        if (req > 3.6) {
            difficultyColor = "text-[#990000] bg-red-50 border-red-200";
            difficultyText = "Thử thách";
            scoreClass = "text-[#990000]";
        } else if (req > 3.2) {
            difficultyColor = "text-orange-700 bg-orange-50 border-orange-200";
            difficultyText = "Cần nỗ lực";
            scoreClass = "text-orange-600";
        } else if (req > 2.5) {
            difficultyColor = "text-[#003375] bg-blue-50 border-blue-200";
            difficultyText = "Khả thi";
            scoreClass = "text-[#003375]";
        } else {
            difficultyColor = "text-emerald-700 bg-emerald-50 border-emerald-200";
            difficultyText = "Trong tầm tay";
            scoreClass = "text-emerald-600";
        }
    }

    if (loading) {
        return (
            <div className="w-full min-h-[60vh] flex flex-col items-center justify-center">
                <Loader2 className="animate-spin text-[#0052cc] mb-3" size={32} />
                <span className="text-gray-400 text-sm font-medium">Đang tải không gian làm việc...</span>
            </div>
        );
    }

 return (
    <div className={`w-full ${showAdminPanel ? '' : 'pb-10'}`}>

        {showAdminPanel ? (
            <div className="w-full space-y-3 sm:space-y-4 animate-fadeIn">
                {/* 1. HEADER & NÚT THAO TÁC */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                    <div>
                        <h1 className="text-[22px] sm:text-[26px] font-extrabold text-[#003375] tracking-tight leading-none">
                            Quản lý Sinh viên
                        </h1>
                        <p className="text-[11px] sm:text-xs text-gray-500 mt-1">Xem và theo dõi tiến độ học tập toàn trường</p>
                    </div>
                    
                    <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto no-scrollbar pb-1 md:pb-0">
                        <button className="shrink-0 px-3 py-1.5 bg-white text-gray-600 text-xs font-semibold border border-gray-300 hover:bg-gray-50 rounded-lg flex items-center gap-1.5 transition-colors">
                            <Download size={14} /> <span className="hidden sm:inline">In danh sách</span><span className="sm:hidden">In</span>
                        </button>
                        <button onClick={() => { playClick(); setSelectedUserOverview(null); setSelectedAdminUserId(null); setAdminMode('detail'); window.history.pushState(null, '', '/dashboard'); }} className="shrink-0 px-3 py-1.5 bg-[#0052cc] border border-transparent text-white text-xs font-bold rounded-lg hover:bg-[#003d99] flex items-center gap-1.5 transition-colors">
                            <User size={14} /> Hồ sơ của tôi
                        </button>
                        <button onClick={() => { playClick(); fetchAdminData(); }} disabled={loadingAdmin} className="shrink-0 p-1.5 border border-gray-300 text-gray-500 hover:text-[#0052cc] hover:bg-blue-50 rounded-lg transition-colors bg-white" title="Làm mới">
                            <RefreshCw size={16} className={loadingAdmin ? "animate-spin" : ""} />
                        </button>
                    </div>
                </div>

                {/* 2. BỘ LỌC VÀ TÌM KIẾM (SCROLL NGANG TRÊN MOBILE) */}
                <div className="flex flex-col md:flex-row gap-2 bg-white p-2 rounded-xl border border-gray-300">
                    <div className="relative w-full md:w-64 shrink-0">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input 
                            type="text" placeholder="Tìm MSSV hoặc Tên..." value={adminSearch} onChange={e => setAdminSearch(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 border border-gray-300 bg-gray-50 focus:bg-white rounded-lg focus:border-[#003375] focus:ring-1 focus:ring-[#003375] outline-none text-xs text-gray-700 transition-all hover:border-gray-400"
                        />
                    </div>
                    
                    <div className="hidden md:block w-px h-6 bg-gray-300 my-auto shrink-0"></div>

                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar w-full pb-0.5 md:pb-0">
                        <div className="relative shrink-0">
                            <select value={adminFilterGpa} onChange={(e) => setAdminFilterGpa(e.target.value as any)} className="appearance-none bg-gray-50 border border-gray-300 rounded-lg py-1.5 pl-2.5 pr-7 text-xs text-gray-700 font-medium outline-none cursor-pointer hover:border-[#003375] w-[120px]">
                                <option value="all">Mọi mức điểm</option>
                                <option value="excellent">Xuất sắc (&gt;3.6)</option>
                                <option value="warning">Cảnh báo (&lt;2.0)</option>
                                <option value="nogpa">Chưa có điểm</option>
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 w-3 h-3 pointer-events-none" />
                        </div>

                        <div className="relative shrink-0">
                            <select value={adminFilterMajor} onChange={(e) => setAdminFilterMajor(e.target.value)} className="appearance-none bg-gray-50 border border-gray-300 rounded-lg py-1.5 pl-2.5 pr-7 text-xs text-gray-700 font-medium outline-none cursor-pointer hover:border-[#003375] w-[130px] truncate">
                                <option value="all">Tất cả Ngành</option>
                                {adminMajors.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 w-3 h-3 pointer-events-none" />
                        </div>

                        <div className="relative shrink-0">
                            <select value={adminFilterSemester} onChange={(e) => setAdminFilterSemester(e.target.value)} className="appearance-none bg-gray-50 border border-gray-300 rounded-lg py-1.5 pl-2.5 pr-7 text-xs text-gray-700 font-medium outline-none cursor-pointer hover:border-[#003375] w-[140px] truncate">
                                <option value="all">Tích lũy toàn khóa</option>
                                {adminSemesters.map(s => <option key={s} value={s}>{s.replace('Học kỳ ', 'HK').replace(' Năm học ', ' ')}</option>)}
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 w-3 h-3 pointer-events-none" />
                        </div>
                    </div>
                </div>

                {/* 3. BỐN THẺ THỐNG KÊ (GRID 2x2 MOBILE, 4x1 DESKTOP) */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                    <button onClick={() => { playClick(); setAdminFilterGpa('all'); }} className={`bg-white p-2.5 sm:p-3 rounded-xl border flex items-center gap-2 sm:gap-3 transition-all text-left ${adminFilterGpa === 'all' ? 'border-[#003375] ring-1 ring-[#003375] bg-blue-50/20' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'}`}>
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-blue-50 text-blue-500 border border-blue-200 flex items-center justify-center shrink-0">
                            <Users size={16} className="sm:w-[18px] sm:h-[18px]" strokeWidth={2.5} />
                        </div>
                        <div>
                            <p className="text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">Tổng SV</p>
                            <span className="text-lg sm:text-xl font-black text-gray-900">{adminSummary.total}</span>
                        </div>
                    </button>

                    <div className="bg-white p-2.5 sm:p-3 rounded-xl border border-gray-300 flex items-center gap-2 sm:gap-3">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-purple-50 text-purple-500 border border-purple-200 flex items-center justify-center shrink-0">
                            <BarChart3 size={16} className="sm:w-[18px] sm:h-[18px]" strokeWidth={2.5} />
                        </div>
                        <div>
                            <p className="text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">TB GPA</p>
                            <div className="flex items-baseline gap-1">
                                <span className="text-lg sm:text-xl font-black text-[#003375]">{adminSummary.avgGPA}</span>
                                <span className="text-[10px] sm:text-xs text-gray-400 font-medium">/4.0</span>
                            </div>
                        </div>
                    </div>

                    <button onClick={() => { playClick(); setAdminFilterGpa(prev => prev === 'warning' ? 'all' : 'warning'); }} className={`p-2.5 sm:p-3 rounded-xl border flex items-center gap-2 sm:gap-3 transition-all text-left ${adminFilterGpa === 'warning' ? 'border-red-500 ring-1 ring-red-500 bg-red-50/50' : 'bg-white border-gray-300 hover:border-red-400 hover:bg-red-50/30'}`}>
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-red-50 text-red-500 border border-red-200 flex items-center justify-center shrink-0">
                            <AlertTriangle size={16} className="sm:w-[18px] sm:h-[18px]" strokeWidth={2.5} />
                        </div>
                        <div>
                            <p className="text-[9px] sm:text-[10px] font-bold text-red-600/80 uppercase tracking-wider mb-0.5">Cảnh báo</p>
                            <span className="text-lg sm:text-xl font-black text-red-600">{adminSummary.warning}</span>
                        </div>
                    </button>

                    <button onClick={() => { playClick(); setAdminFilterGpa(prev => prev === 'excellent' ? 'all' : 'excellent'); }} className={`p-2.5 sm:p-3 rounded-xl border flex items-center gap-2 sm:gap-3 transition-all text-left ${adminFilterGpa === 'excellent' ? 'border-yellow-500 ring-1 ring-yellow-500 bg-yellow-50/50' : 'bg-white border-gray-300 hover:border-yellow-400 hover:bg-yellow-50/30'}`}>
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-orange-50 text-orange-500 border border-orange-200 flex items-center justify-center shrink-0">
                            <Crown size={16} className="sm:w-[18px] sm:h-[18px]" strokeWidth={2.5} />
                        </div>
                        <div>
                            <p className="text-[9px] sm:text-[10px] font-bold text-orange-500/80 uppercase tracking-wider mb-0.5">Xuất sắc</p>
                            <span className="text-lg sm:text-xl font-black text-orange-500">{adminSummary.excellent}</span>
                        </div>
                    </button>
                </div>

                {/* 4. BẢNG DỮ LIỆU */}
                <div className="bg-white border border-gray-300 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto custom-scrollbar max-h-[65vh]">
                        <table className="w-full text-left relative min-w-[550px] sm:min-w-[700px]">
                            <thead className="bg-gray-50 border-b border-gray-300 sticky top-0 z-10 text-[10px] sm:text-[11px] text-gray-500 font-bold uppercase tracking-wider">
                                <tr>
                                    <th className="px-3 sm:px-4 py-2 sm:py-3 cursor-pointer hover:bg-gray-100 transition-colors select-none" onClick={() => handleSortClick('mssv')}>
                                        <div className="flex items-center gap-1">MSSV {adminSort.startsWith('mssv') ? (adminSort.endsWith('desc') ? <ArrowDown size={12} className="text-[#0052cc]"/> : <ArrowUp size={12} className="text-[#0052cc]"/>) : <ArrowUpDown size={12} className="text-gray-400"/>}</div>
                                    </th>
                                    <th className="px-3 sm:px-4 py-2 sm:py-3 cursor-pointer hover:bg-gray-100 transition-colors select-none" onClick={() => handleSortClick('name')}>
                                        <div className="flex items-center gap-1">HỌ VÀ TÊN {adminSort.startsWith('name') ? (adminSort.endsWith('desc') ? <ArrowDown size={12} className="text-[#0052cc]"/> : <ArrowUp size={12} className="text-[#0052cc]"/>) : <ArrowUpDown size={12} className="text-gray-400"/>}</div>
                                    </th>
                                    <th className="px-3 sm:px-4 py-2 sm:py-3 cursor-pointer hover:bg-gray-100 transition-colors select-none" onClick={() => handleSortClick('cohort')}>
                                        <div className="flex items-center gap-1">HỆ / KHÓA {adminSort.startsWith('cohort') ? (adminSort.endsWith('desc') ? <ArrowDown size={12} className="text-[#0052cc]"/> : <ArrowUp size={12} className="text-[#0052cc]"/>) : <ArrowUpDown size={12} className="text-gray-400"/>}</div>
                                    </th>
                                    <th className="px-3 sm:px-4 py-2 sm:py-3 cursor-pointer hover:bg-gray-100 transition-colors select-none text-center" onClick={() => handleSortClick('gpa')}>
                                        <div className="flex items-center justify-center gap-1">{adminFilterSemester === 'all' ? 'GPA' : 'GPA HK'} {adminSort.startsWith('gpa') ? (adminSort.endsWith('desc') ? <ArrowDown size={12} className="text-[#0052cc]"/> : <ArrowUp size={12} className="text-[#0052cc]"/>) : <ArrowUpDown size={12} className="text-gray-400"/>}</div>
                                    </th>
                                    <th className="px-3 sm:px-4 py-2 sm:py-3 cursor-pointer hover:bg-gray-100 transition-colors select-none text-center" onClick={() => handleSortClick('credits')}>
                                        <div className="flex items-center justify-center gap-1">TC {adminSort.startsWith('credits') ? (adminSort.endsWith('desc') ? <ArrowDown size={12} className="text-[#0052cc]"/> : <ArrowUp size={12} className="text-[#0052cc]"/>) : <ArrowUpDown size={12} className="text-gray-400"/>}</div>
                                    </th>
                                    <th className="px-3 sm:px-4 py-2 sm:py-3 cursor-pointer hover:bg-gray-100 transition-colors select-none text-right" onClick={() => handleSortClick('updated')}>
                                        <div className="flex items-center justify-end gap-1">CẬP NHẬT {adminSort.startsWith('updated') ? (adminSort.endsWith('desc') ? <ArrowDown size={12} className="text-[#0052cc]"/> : <ArrowUp size={12} className="text-[#0052cc]"/>) : <ArrowUpDown size={12} className="text-gray-400"/>}</div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {loadingAdmin ? (
                                    <tr><td colSpan={6} className="py-10 text-center"><Loader2 className="animate-spin text-[#0052cc] mx-auto mb-2" size={24}/> <span className="text-xs text-gray-500">Đang tải dữ liệu...</span></td></tr>
                                ) : (() => {
                                    const paginatedUsers = processedAdminUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
                                    return paginatedUsers.length > 0 ? (
                                        paginatedUsers.map(user => {
                                            const updateDate = new Date(user.updated_at).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
                                            const fullName = user.full_name || user.data?.studentName || 'Chưa cập nhật';
                                            const avatar = getAvatarProps(fullName);
                                            const gpaBadge = user._computedGpa > 0 ? getGpaBadge(user._computedGpa) : null;
                                            
                                            return (
                                                <tr key={user.id} onClick={() => { playClick(); setSelectedAdminUserId(user.id); setSelectedUserOverview(user.data || { ...data, studentName: 'Chưa có data' }); setAdminMode('detail'); window.history.pushState(null, '', `/dashboard/admin/${user.student_code || user.id}`); }} className="hover:bg-blue-50/50 cursor-pointer transition-colors group bg-white">
                                                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 font-bold text-[#0052cc] text-[11px] sm:text-xs border-r border-gray-100">{user.student_code || '-'}</td>
                                                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 border-r border-gray-100">
                                                        <div className="flex items-center gap-2">
                                                            <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center font-bold text-[9px] sm:text-[10px] shrink-0 border border-gray-200 ${avatar.colorClass}`}>
                                                                {avatar.initial}
                                                            </div>
                                                            <span className="font-semibold text-gray-800 text-xs group-hover:text-[#0052cc] transition-colors line-clamp-1">{fullName}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-gray-600 text-[10px] sm:text-xs border-r border-gray-100">{user.data?.programName || 'ĐHCQ'} / {user.data?.cohort || '-'}</td>
                                                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-center border-r border-gray-100">
                                                        <div className="flex flex-col items-center justify-center gap-0.5 sm:gap-1">
                                                            <span className={`font-bold text-[11px] sm:text-xs ${user._computedGpa >= 3.2 ? 'text-[#0052cc]' : (user._computedGpa >= 2.5 ? 'text-orange-500' : 'text-gray-700')}`}>{user._computedGpa > 0 ? user._computedGpa.toFixed(2) : '-'}</span>
                                                            {gpaBadge && (
                                                                <span className={`px-1 py-[1px] sm:px-1.5 sm:py-0.5 rounded text-[8px] sm:text-[9px] font-semibold border whitespace-nowrap ${gpaBadge.className}`}>{gpaBadge.label}</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-gray-700 font-semibold text-center text-[11px] sm:text-xs border-r border-gray-100">{user._computedCredits || 0}</td>
                                                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-right text-[10px] sm:text-[11px] text-gray-500 whitespace-nowrap">{updateDate}</td>
                                                </tr>
                                            )
                                        })
                                    ) : (
                                        <tr><td colSpan={6} className="py-8 text-center text-xs text-gray-500">Không tìm thấy sinh viên nào phù hợp</td></tr>
                                    )
                                })()}
                            </tbody>
                        </table>
                    </div>

                    {/* PHÂN TRANG (GỌN TRÊN MOBILE, FULL TRÊN DESKTOP) */}
                    {!loadingAdmin && processedAdminUsers.length > 0 && (() => {
                        const totalPages = Math.ceil(processedAdminUsers.length / itemsPerPage) || 1;
                        return (
                            <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 bg-gray-50 border-t border-gray-300">
                                <span className="text-[10px] sm:text-[11px] text-gray-500 font-medium">
                                    <span className="hidden sm:inline">Đang xem</span> <span className="font-bold text-gray-800">{processedAdminUsers.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}</span>-<span className="font-bold text-gray-800">{Math.min(currentPage * itemsPerPage, processedAdminUsers.length)}</span> / <span className="font-bold text-[#0052cc]">{processedAdminUsers.length}</span> SV
                                </span>
                                <div className="flex items-center gap-1 sm:gap-2">
                                    <button onClick={() => { playClick(); setCurrentPage(p => { const newP = Math.max(1, p - 1); setPageInput(newP.toString()); return newP; }); }} disabled={currentPage === 1} className="px-2 py-1 sm:px-2.5 sm:py-1 text-[10px] sm:text-xs font-bold text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 transition-colors">
                                        <span className="hidden sm:inline">Trước</span>
                                        <ChevronLeft size={14} className="sm:hidden" />
                                    </button>
                                    
                                    <div className="flex items-center gap-1 sm:gap-1.5 bg-white px-1.5 sm:px-2 py-1 rounded border border-gray-300 text-[10px] sm:text-xs font-bold text-gray-600">
                                        <input 
                                            type="number" min={1} max={totalPages} value={pageInput}
                                            onChange={(e) => setPageInput(e.target.value)}
                                            onBlur={(e) => {
                                                let newPage = parseInt(e.target.value);
                                                if (isNaN(newPage) || newPage < 1) newPage = 1;
                                                if (newPage > totalPages) newPage = totalPages;
                                                setCurrentPage(newPage); setPageInput(newPage.toString());
                                            }}
                                            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                            className="w-6 sm:w-8 text-center bg-transparent border-none text-[#0052cc] outline-none focus:ring-0 p-0 m-0"
                                            style={{ MozAppearance: 'textfield' }}
                                        />
                                        <span>/ {totalPages}</span>
                                    </div>

                                    <button onClick={() => { playClick(); setCurrentPage(p => { const newP = Math.min(totalPages, p + 1); setPageInput(newP.toString()); return newP; }); }} disabled={currentPage === totalPages || processedAdminUsers.length === 0} className="px-2 py-1 sm:px-2.5 sm:py-1 text-[10px] sm:text-xs font-bold text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 transition-colors">
                                        <span className="hidden sm:inline">Sau</span>
                                        <ChevronRight size={14} className="sm:hidden" />
                                    </button>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            </div>
        ) : (
            <div className="w-full space-y-2 sm:space-y-4 pt-1 animate-fadeIn">
                <div className="relative md:sticky top-0 z-40 bg-[#F8FAFC] pt-2 pb-1 sm:pb-4 -mt-2 mb-1 sm:mb-4 border-b border-transparent md:border-gray-300">                
                    
                    {(isAdmin || isAuditor) && (
                        <button 
                            onClick={() => { playClick(); setSelectedUserOverview(null); setSelectedAdminUserId(null); setAdminMode('list'); window.history.pushState(null, '', '/dashboard/admin'); }}
                            className="mb-3 flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-[#003375] transition-all w-fit px-3 py-1.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 active:scale-95"
                        >
                            <ChevronLeft size={16} /> Quay lại danh sách
                        </button>
                    )}
                    
                    <h1 className="text-[26px] sm:text-[30px] font-extrabold text-[#003375] tracking-tight leading-none mb-1 sm:mb-2">
                        Học tập {selectedUserOverview && <span className="text-[10px] sm:text-xs text-gray-400 font-medium ml-2 uppercase tracking-wide border border-gray-300 bg-white px-2 py-0.5 rounded-md align-middle">(Chế độ xem)</span>}
                    </h1>
                    
                    <div className="flex flex-wrap items-center gap-1.5 text-[12px] sm:text-[13px] text-gray-500 font-medium mb-1 sm:mb-3">
                        <span className="font-bold text-gray-700">Tổng quan lộ trình</span> 
                        <span className="text-gray-300">•</span>
                        <span>{activeData.studentName || 'Chưa cập nhật tên'}</span>
                        <span className="text-gray-300">•</span>
                        <span>{activeData.programName || 'Chưa cập nhật hệ'}</span>
                        <span className="text-gray-300">•</span>
                        <span>{activeData.cohort || 'Chưa cập nhật khóa'}</span>
                        <span className="text-gray-300">•</span>
                        <span>{activeData.specializationName || 'Chưa cập nhật chuyên ngành'}</span>
                    </div>

                    {isGuest && (
                        <div className="bg-blue-50 border border-blue-300 p-3 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fadeIn mt-2 sm:mt-0">
                            <div className="flex items-center gap-2 text-[#003375] text-sm font-medium">
                                <Info size={18} className="shrink-0" />
                                {isLocked ? (
                                    <p>Bạn đang ở chế độ xem trước. <strong>Một số tính năng đang bị khóa, vui lòng cập nhật thông tin hoặc đăng nhập để có thể trải nghiệm trọn vẹn nhất.</strong></p>
                                ) : (
                                    <p>Bạn đang dùng thử với tư cách khách. <strong>Đăng nhập để lưu dữ liệu vĩnh viễn.</strong></p>
                                )}
                            </div>
                            <div className="flex gap-2 w-full sm:w-auto">
                                {isLocked && (
                                    <button onClick={() => onRequireOnboarding && onRequireOnboarding()} className="flex-1 sm:flex-none px-3 py-1.5 bg-white border border-[#003375] text-[#003375] text-xs font-bold rounded-lg hover:bg-blue-100 transition-colors">
                                        Cập nhật thông tin
                                    </button>
                                )}
                                <Link to="/login" onClick={playClick} className="flex-1 sm:flex-none px-3 py-1.5 bg-[#003375] border border-transparent text-white text-xs font-bold rounded-lg hover:bg-[#002855] transition-colors text-center">
                                    Đăng nhập ngay
                                </Link>
                            </div>
                        </div>
                    )}
                </div>

                {/* 🏆 WIDGET VINH DANH ĐIỂM RÈN LUYỆN 🏆 */}
                {drlRank && !showAdminPanel && !isGuest && (
                    <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-300 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative overflow-hidden shadow-sm">
                        <div className="absolute -right-4 -top-4 opacity-10 pointer-events-none transform rotate-12">
                            <Crown size={120} />
                        </div>
                        
                        <div className="relative z-10 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="bg-yellow-200 text-yellow-800 text-[10px] font-bold px-2 py-0.5 rounded border border-yellow-300 uppercase tracking-wide">
                                    Vinh danh ĐRL
                                </span>
                                <span className="text-xs font-bold text-gray-500">
                                    {drlRank.semester_id ? drlRank.semester_id.replace('HK1_', 'Học kỳ 1 NH ').replace('HK2_', 'Học kỳ 2 NH ') : 'Dự kiến'}
                                </span>
                            </div>
                            <h3 className="text-lg sm:text-xl font-extrabold text-yellow-900 mb-2">
                                Bạn đạt <span className="text-orange-600">{drlRank.official_score || 0}</span> điểm rèn luyện! 🎉
                            </h3>
                            <div className="flex flex-wrap items-center gap-3 sm:gap-6 mt-1">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm text-yellow-600 border border-yellow-200">
                                        <Trophy size={16} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-gray-500 font-semibold uppercase">Lớp {drlRank.class_name || '?'}</p>
                                        <p className="text-sm font-black text-gray-800">Hạng #{drlRank.rank_in_class || '?'} <span className="text-xs font-medium text-gray-500">/ {drlRank.total_in_class || '?'}</span></p>
                                    </div>
                                </div>
                                
                                <div className="w-px h-8 bg-yellow-200 hidden sm:block"></div>
                                
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm text-orange-500 border border-orange-200">
                                        <Flame size={16} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-gray-500 font-semibold uppercase">Khoa {drlRank.department || '?'}</p>
                                        <p className="text-sm font-black text-gray-800">Top {Math.max(1, Math.ceil((drlRank.top_percent_faculty || 0) * 100))}% <span className="text-xs font-medium text-gray-500">xuất sắc</span></p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div className="hidden lg:flex shrink-0 relative z-10 mr-4">
                            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-sm border-4 border-yellow-200 relative">
                                <Crown size={32} className="text-yellow-500 drop-shadow-sm mb-3" />
                                <span className="absolute bottom-3 text-[13px] font-black text-yellow-800">#{drlRank.rank_in_class || '?'}</span>
                            </div>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-300 hover:border-blue-400 transition-colors flex flex-col justify-between">
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

                    <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-300 hover:border-blue-400 transition-colors flex flex-col justify-between">
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

                    <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-300 hover:border-blue-400 transition-colors flex flex-col justify-between cursor-pointer relative overflow-hidden" onClick={() => { if(!isLocked) { playClick(); setShowRankingModal(true); } }}>
                        <div className="flex justify-between items-start mb-1">
                            <span className="text-[11px] sm:text-xs font-bold text-gray-600 truncate">BXH môn học</span>
                            <Trophy size={16} className="text-yellow-500 shrink-0 w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </div>
                        
                        <div className="relative flex-1 flex flex-col justify-center">
                            {isLocked && (
                                <Link to="/login" onClick={playClick} className="absolute inset-x-[-8px] inset-y-[-4px] bg-white/60 backdrop-blur-[2px] z-20 flex items-center justify-center flex-col text-center rounded-lg cursor-pointer group hover:bg-white/80 transition-colors border border-gray-200">
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

                    <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-300 flex flex-col relative overflow-hidden">
                        <div className="flex justify-between items-start mb-1">
                            <span className="text-[11px] sm:text-xs font-bold text-gray-600 truncate">Dự báo mục tiêu</span>
                            <Target size={16} className="text-[#003375] shrink-0 w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </div>

                        <div className="relative flex-1 flex flex-col justify-center">
                            {isLocked && (
                                <Link to="/login" onClick={playClick} className="absolute inset-x-[-8px] inset-y-[-4px] bg-white/60 backdrop-blur-[2px] z-20 flex items-center justify-center flex-col text-center rounded-lg cursor-pointer group hover:bg-white/80 transition-colors border border-gray-200">
                                    <div className="bg-white px-3 py-1.5 rounded-xl border border-gray-300 flex flex-col items-center group-hover:scale-105 transition-transform">
                                        <Shield className="text-[#003375] mb-0.5 opacity-80" size={14} />
                                        <p className="text-[10px] font-bold text-[#003375]">Đăng nhập để xem</p>
                                    </div>
                                </Link>
                            )}
                            <div className="flex flex-col gap-1 sm:gap-1 text-[9px] sm:text-[11px] text-gray-600 mt-1">
                                <div className="flex justify-between items-center">
                                    <span className="truncate">Mục tiêu:</span>
                                    <div className="flex items-center group relative cursor-pointer border-b border-dashed border-gray-400 hover:border-[#003375]">
                                        <input
                                            type="number" min="0" max="4" step="0.1"
                                            value={activeData.targetGPA}
                                            onChange={(e) => handleLocalTargetChange(parseFloat(e.target.value) || 0)}
                                            className="w-6 sm:w-12 font-bold text-[#003375] bg-transparent text-right focus:outline-none z-10 p-0 m-0"
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="truncate">Hiện tại:</span>
                                    <span className="font-bold text-gray-900">{(Math.floor(stats.rawGPA4 * 100) / 100).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="truncate">Trung bình một tín:</span>
                                    {requiredAnalysis && requiredAnalysis.isPossible ? (
                                        <span className={`font-bold border-b border-transparent ${scoreClass}`}>{Math.max(0, requiredAnalysis.requiredGPA).toFixed(2)}</span>
                                    ) : (
                                        <span className="font-bold text-[#990000]">Không thể</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                    <div className="lg:col-span-2 flex flex-col gap-3 sm:gap-4">
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
                                    <Link to="/login" onClick={playClick} className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-20 flex items-center justify-center flex-col text-center rounded-xl ml-5 sm:ml-4 border border-gray-200 hover:bg-white/80 transition-colors cursor-pointer group">
                                        <div className="bg-white p-4 rounded-2xl border border-gray-300 flex flex-col items-center group-hover:scale-105 transition-transform">
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
                                            <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB', fontSize: '11px', padding: '6px 10px' }} cursor={{ stroke: '#9CA3AF', strokeWidth: 1, strokeDasharray: '4 4' }} />
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
                                    <button onClick={() => { playClick(); setShowFailedModal(true); }} className="w-full sm:w-auto flex items-center justify-between gap-3 px-3 py-2 bg-red-50 text-[#990000] border border-red-300 rounded-lg text-[11px] sm:text-xs font-bold hover:bg-red-100 transition-colors group">
                                        <span className="flex items-center gap-1.5"><AlertTriangle size={14} /> Tồn đọng {failedCount} môn nợ</span>
                                        <ChevronRight size={14} className="opacity-50 group-hover:opacity-100 transition-opacity" />
                                    </button>
                                ) : (
                                    <div className="w-full sm:w-auto flex items-center justify-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-lg text-[11px] sm:text-xs font-bold">
                                        <span className="flex items-center gap-1.5"><CheckCircle2 size={14} /> Không nợ môn</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">
                        <div className="grid grid-cols-2 gap-3 sm:gap-4 shrink-0">
                            <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-300 flex flex-col relative overflow-hidden">
                                <h3 className="text-[11px] sm:text-sm font-bold text-gray-900 tracking-tight mb-2 uppercase truncate">Phân bố điểm</h3>
                                
                                <div className="h-[100px] sm:h-[130px] w-full relative flex flex-col items-center justify-center shrink-0">
                                    {isLocked && (
                                        <Link to="/login" onClick={playClick} className="absolute inset-[-8px] bg-white/60 backdrop-blur-[2px] z-20 flex items-center justify-center flex-col text-center rounded-xl border border-gray-200 cursor-pointer group hover:bg-white/80 transition-colors">
                                            <div className="bg-white p-3 rounded-xl border border-gray-300 flex flex-col items-center group-hover:scale-105 transition-transform">
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
                                        <Link to="/login" onClick={playClick} className="absolute inset-[-8px] bg-white/60 backdrop-blur-[2px] z-20 flex items-center justify-center flex-col text-center rounded-xl border border-gray-200 cursor-pointer group hover:bg-white/80 transition-colors">
                                            <div className="bg-white p-3 rounded-xl border border-gray-300 flex flex-col items-center group-hover:scale-105 transition-transform">
                                                <Shield className="text-[#003375] mb-1 opacity-80" size={20} />
                                                <p className="text-[10px] font-bold text-[#003375]">Đăng nhập để xem</p>
                                            </div>
                                        </Link>
                                    )}
                                    <div className="grid grid-cols-4 text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-300 pb-1 sm:pb-1.5 mb-1 sm:mb-1.5">
                                        <span className="col-span-2">Năm</span>
                                        <span className="text-center">TC</span>
                                        <span className="text-right">GPA</span>
                                    </div>
                                    {yearlyStats.slice(0, 4).map((year) => (
                                        <div key={year.yearId} className="grid grid-cols-4 text-[10px] sm:text-xs items-center py-1 hover:bg-gray-50 rounded px-0.5 sm:px-1 transition-colors">
                                            <span className="col-span-2 font-medium text-gray-700 truncate pr-1" title={year.label}>{year.label.replace('Năm học ', 'NH ')}</span>
                                            <span className="text-center text-gray-500">{year.hasData ? year.totalCredits : '-'}</span>
                                            <span className="text-right font-extrabold text-[#003375]">{year.hasData ? year.gpa4.toFixed(2) : '-'}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                        </div>

                        <div className="bg-white rounded-xl border border-gray-300 flex flex-col overflow-hidden flex-1 min-h-[300px] lg:min-h-0 relative">
                            <div className="absolute inset-0 overflow-y-auto custom-scrollbar">
                                <SchoolAnnouncements />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="pt-2">
                    <div className="flex flex-row justify-between items-center flex-wrap mb-3 sm:mb-4 gap-2 border-t border-gray-300 pt-4 sm:pt-5 mt-2">
                        <h2 className="text-[15px] sm:text-xl font-bold text-gray-900 tracking-tight whitespace-nowrap">Chi tiết bảng điểm</h2>

                        <div className="flex items-center gap-1.5 sm:gap-3 flex-wrap justify-end">
                            <button
                                onClick={() => { playClick(); setShowReportModal(true); }}
                                className="text-red-600 bg-red-50 border border-red-300 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-bold hover:bg-red-100 transition-colors flex items-center gap-1 sm:gap-2 active:scale-95"
                            >
                                <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> 
                                <span className="hidden sm:inline">Báo lỗi</span>
                                <span className="sm:hidden">Lỗi</span>
                            </button>
                            
                            <button
                                onClick={handleOpenPdfExportModal}
                                className="text-gray-600 bg-white border border-gray-300 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold hover:text-gray-900 hover:bg-gray-50 transition-colors flex items-center gap-1 sm:gap-2 active:scale-95"
                            >
                                <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> 
                                <span className="hidden sm:inline">In bảng điểm</span>
                                <span className="sm:hidden">In</span>
                            </button>

                            <div>
                                <input
                                    type="file" accept=".pdf" ref={fileInputRef} className="hidden"
                                    onChange={onFileUpload}
                                />
                                <button
                                    onClick={onImportPDF}
                                    disabled={isImporting}
                                    className="bg-white text-[#003375] border border-gray-300 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-bold hover:border-[#003375] hover:bg-blue-50 transition-colors flex items-center gap-1 sm:gap-2 disabled:opacity-70 active:scale-95"
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
                                />
                            )
                        })}

                        {activeData.semesters.length === 0 && (
                            <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
                                <p className="text-gray-500 mb-4 text-sm font-medium">Bạn chưa có học kỳ nào.</p>
                                <button onClick={handleLocalAddSemester} className="text-[#003375] font-bold hover:underline flex items-center justify-center gap-1 mx-auto text-sm transition-colors border border-transparent hover:border-[#003375] px-3 py-1.5 rounded-lg">
                                    <Plus size={16} /> Tạo thủ công
                                </button>
                            </div>
                        )}
                        
                        {!isInitialState && activeData.semesters.length > 0 && activeData.semesters.length < ALL_SEMESTERS.length && (
                            <button onClick={handleLocalAddSemester} className="w-full py-4 border-2 border-dashed border-gray-300 text-gray-500 hover:text-gray-800 hover:border-gray-400 hover:bg-gray-50 rounded-xl font-semibold flex justify-center items-center gap-2 transition-all">
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
        <PdfExportModal
            isOpen={showPdfExportModal}
            onClose={() => setShowPdfExportModal(false)}
            yearOptions={pdfExportYearOptions}
            onExportFull={handleExportFullPdf}
            onExportYear={handleExportYearPdf}
            isExporting={isExportingPdf}
        />
        {showReportModal && <ReportErrorModal isOpen={showReportModal} onClose={() => setShowReportModal(false)} />}
            <PushNotificationPrompt />
    </div>
  );
};
