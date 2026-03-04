import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom'; 
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
import { Target, AlertTriangle, User, BookOpen, BarChart3, Calendar, CheckCircle2, Pencil, Trophy, Zap, ChevronRight, X, GraduationCap, TrendingUp, Plus, Star, Search, Crown, Loader2, AlertCircle, BarChart2, ChevronLeft, Award, ArrowUpDown, ArrowUp, ArrowDown, ListFilter, Trash2, Download, FileUp } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import { playClick } from '../utils/audio';
import { AdsBanner } from './AdsBanner';
import SchoolAnnouncements from './SchoolAnnouncements';
import { mapIdToDisplay } from '../utils/rankingData';
import { useForecastRank } from '../hooks/useForecastRank';

// ============================================================================
// 1. MODAL: MÔN CHƯA ĐẠT
// ============================================================================
const FailedSubjectsModal = ({ subjects, onClose }: { subjects: Subject[], onClose: () => void }) => {
    return createPortal(
        <div className="fixed inset-0 z-[99999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn" onClick={onClose}>
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
                                        <span className="text-[10px] text-[#990000] font-bold bg-red-50 px-1.5 py-0.5 rounded border border-red-100">RỚT MÔN</span>
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
        <div className="fixed inset-0 z-[99999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn" onClick={onClose}>
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
                                            <span className="bg-gray-100 px-2 py-1 rounded font-medium">TC: {year.totalCredits}</span>
                                            <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded border border-emerald-100 font-medium">Đạt: {year.passedCredits}</span>
                                        </div>
                                        <span className="font-bold text-[#003375] bg-blue-50 px-2 py-1 rounded">{yearClass}</span>
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
interface SemesterTableProps {
  semester: Semester;
  index: number;
  onUpdateSemester: (updatedSemester: Semester) => void;
  onRemoveSemester: () => void;
}

const SemesterTable: React.FC<SemesterTableProps> = ({ semester, index, onUpdateSemester, onRemoveSemester }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>(null);
   
  const { 
      fetchRank, result: rankingResult, loading: rankingLoading, error: rankingError, resetResult,
      fetchAvailableSemesters, availableSemesters, loadingSemesters, prepareSemesterRanks,
      resetSemesterRanks, semesterRanks, loadingSemesterRanks
  } = useForecastRank();

  const [showRankMenu, setShowRankMenu] = useState(false);
  const rankMenuRef = useRef<HTMLDivElement>(null);
   
  const handleSubjectChange = (subjectId: string, field: keyof Subject, value: any) => {
    const updatedSubjects = semester.subjects.map(sub => {
      if (sub.id === subjectId) return { ...sub, [field]: value };
      return sub;
    });
    onUpdateSemester({ ...semester, subjects: updatedSubjects });
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateSemester({ ...semester, name: e.target.value });
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

  const semGPA4 = semTotalCredits ? Math.round((semWeightedScore4 / semTotalCredits) * 10) / 10 : 0;
  const semGPA10 = semTotalCredits ? Math.round((semWeightedScore10 / semTotalCredits) * 10) / 10 : 0;
   
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
    <div className={`mb-5 sm:mb-8 bg-white rounded-xl border border-gray-300 overflow-visible ${hasData ? 'border-opacity-100' : 'border-gray-300'}`}>
      <div className={`px-3 py-3 sm:px-6 sm:py-4 border-b flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 ${headerColor} rounded-t-xl`}>
        <div className="flex items-center gap-2 sm:gap-4 flex-1">
            <div className="relative group flex-1 max-w-md">
                <input 
                    type="text" 
                    value={semester.name}
                    onChange={handleNameChange}
                    className="text-base sm:text-lg font-bold text-[#003375] bg-transparent border-b border-dashed border-transparent hover:border-[#003375]/50 focus:border-[#003375] focus:outline-none transition-all w-full py-0.5 sm:py-1 placeholder-[#003375]/50"
                    placeholder="Tên học kỳ..."
                />
                <Pencil className="text-gray-400 absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
            {hasData && (
                <span className={`text-[10px] sm:text-xs px-2 py-0.5 sm:py-1 rounded-full font-bold border bg-white/60 border-current shadow-sm text-gray-700 whitespace-nowrap`}>
                    {classification}
                </span>
            )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 md:gap-4 text-[11px] sm:text-sm relative z-10">
              {hasData && (
                  <div className="relative" ref={rankMenuRef}>
                      <button 
                          onClick={handleOpenRankMenu}
                          className={`flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg border shadow-sm transition-all active:scale-95 hover:shadow-md ${showRankMenu ? 'bg-blue-50 border-blue-200 ring-2 ring-blue-100' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                          title="Xếp hạng dự báo"
                      >
                          <Crown className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${rankingResult ? "fill-yellow-500 text-yellow-600" : "text-gray-400"}`}/> 
                          <span className="font-bold text-[#003375]">Xếp hạng 👑</span>
                      </button>

                      {showRankMenu && (
                          <div className="absolute top-full left-0 md:left-auto md:right-0 mt-2 w-72 sm:w-80 bg-white rounded-xl shadow-2xl border border-gray-200 z-[60] overflow-hidden animate-fadeIn origin-top-left md:origin-top-right">
                              <div className="bg-[#003375] px-4 py-3 text-white flex justify-between items-center shrink-0">
                                  <h4 className="font-bold text-sm flex items-center gap-2"><BarChart2 size={16}/> Xếp Hạng Dự Báo</h4>
                                  <button onClick={() => { setShowRankMenu(false); resetSemesterRanks(); }} className="hover:bg-white/20 p-1 rounded-full transition-colors"><X size={14}/></button>
                              </div>
                              
                              <div className="p-0">
                                  {rankingLoading ? (
                                      <div className="flex flex-col items-center justify-center py-8 text-[#003375]">
                                          <Loader2 size={32} className="animate-spin mb-2"/>
                                          <span className="text-xs font-medium">Đang tính toán thứ hạng...</span>
                                      </div>
                                  ) : rankingResult ? (
                                      <div className="p-4 bg-gradient-to-b from-blue-50 to-white">
                                          <button onClick={() => resetResult()} className="flex items-center gap-1 text-xs text-gray-500 hover:text-[#003375] mb-3 transition-colors">
                                              <ChevronLeft size={14}/> Chọn kỳ khác
                                          </button>
                                          <div className="text-center space-y-4">
                                              <p className="text-xs text-gray-500 uppercase tracking-wide">So sánh với: <span className="font-bold text-[#003375]">{mapIdToDisplay(rankingResult.semesterId)}</span></p>
                                              <div className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm">
                                                  <p className="text-sm text-gray-500 mb-1">Xếp hạng của bạn</p>
                                                  <p className="text-3xl font-black text-yellow-600 drop-shadow-sm">#{rankingResult.rank} <span className="text-sm font-medium text-gray-400">/ {rankingResult.totalStudents}</span></p>
                                              </div>
                                              <div className="bg-[#003375] text-white p-4 rounded-xl shadow-inner relative overflow-hidden">
                                                  <div className="absolute -right-4 -top-4 w-20 h-20 bg-white opacity-10 rounded-full"></div>
                                                  <p className="text-xs opacity-80 uppercase mb-1">Top Percentile</p>
                                                  <p className="text-2xl font-bold flex items-center justify-center gap-2"><TrendingUp size={20}/> Top {rankingResult.topPercent.toFixed(1)}%</p>
                                              </div>
                                          </div>
                                      </div>
                                  ) : (
                                      <div className="flex flex-col max-h-[300px]">
                                          <div className="p-3 bg-gray-50 border-b border-gray-100 text-xs text-gray-500 italic">Chọn nguồn dữ liệu (Kỳ học cũ) để so sánh với GPA hiện tại của bạn ({semGPA4.toFixed(1)}). So sánh dựa trên tiêu chí: (1) loại học bổng; (2) GPA thang 4; (3) Điểm rèn luyện; (4) Tổng số tín chỉ.</div>
                                          <div className="overflow-y-auto custom-scrollbar p-2 space-y-1">
                                              {loadingSemesters ? (
                                                  <div className="py-4 text-center text-xs text-gray-400">Đang tải danh sách kỳ...</div>
                                              ) : availableSemesters.length > 0 ? (
                                                  availableSemesters.map((semId) => {
                                                      const semesterRank = semesterRanks[semId];
                                                      const rankLabel = Number.isFinite(semesterRank) ? `Hạng #${semesterRank}` : loadingSemesterRanks ? 'Đang tải hạng...' : 'Chưa có hạng';
                                                      return (
                                                      <button key={semId} onClick={() => handleSelectReferenceSemester(semId)} className="w-full text-left px-3 py-2.5 hover:bg-blue-50 hover:text-[#003375] rounded-lg transition-all text-sm font-medium text-gray-700 flex justify-between items-center group">
                                                          <span>Dữ liệu {mapIdToDisplay(semId)} - {rankLabel}</span>
                                                          <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-400"/>
                                                      </button>
                                                      );
                                                  })
                                              ) : (
                                                  <div className="py-6 text-center"><p className="text-xs text-gray-400 mb-2">Chưa có dữ liệu xếp hạng nào.</p></div>
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
                <span className="font-bold text-gray-800">{totalRegisteredCredits} <span className="sm:hidden font-medium text-[10px] text-gray-500">TC</span></span>
            </div>

            <div className="flex items-center gap-1 sm:gap-2 bg-white px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg border border-gray-200 shadow-sm transition-transform hover:scale-105">
                <span className="text-gray-500 font-medium">GPA(4):</span>
                <span className="font-bold text-[#003375]">{hasData ? semGPA4.toFixed(1) : '-'}</span>
            </div>

            <div className="flex items-center gap-1 sm:gap-2 bg-white px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg border border-gray-200 shadow-sm transition-transform hover:scale-105">
                <span className="text-gray-500 font-medium">GPA(10):</span>
                <span className="font-bold text-[#990000]">{hasData ? semGPA10.toFixed(1) : '-'}</span>
            </div>

            <div className="flex items-center gap-1 sm:gap-2 bg-white pl-2 pr-1 py-0.5 sm:pl-3 sm:pr-1 sm:py-1 rounded-lg border border-gray-200 shadow-sm transition-transform hover:scale-105">
                <span className="text-gray-500 font-medium flex items-center gap-1"><Star className="text-yellow-500 fill-yellow-500 w-3.5 h-3.5 sm:w-4 sm:h-4"/> <span className="hidden sm:inline">ĐRL:</span></span>
                <input 
                    type="number" min="0" max="100" placeholder="0"
                    className="w-7 sm:w-10 text-center font-bold text-gray-800 outline-none border-b border-transparent focus:border-blue-400 focus:bg-gray-50 rounded transition-colors bg-transparent"
                    value={semester.trainingScore ?? ''}
                    onChange={(e) => handleTrainingScoreChange(e.target.value)}
                    onKeyDown={(e) => { if (["e", "E", "+", "-"].includes(e.key)) e.preventDefault(); }}
                />
            </div>

            <div className={`flex items-center gap-1 sm:gap-2 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg border shadow-sm text-[11px] sm:text-sm font-bold ${scholarshipStatus.className}`}>
                <Award className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>{scholarshipStatus.label}</span>
            </div>
            
             <button onClick={onRemoveSemester} className="ml-auto md:ml-0 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all p-1.5 sm:p-2 rounded-full active:scale-90 hover:shadow-md" title="Xóa học kỳ">
             <Trash2 className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
            </button>
        </div>
      </div>

      {semester.subjects.length > 0 && (
          <div className="px-3 py-2 sm:px-6 sm:py-2 bg-gray-50/50 border-b border-gray-100 flex flex-row gap-2 justify-between sm:justify-end items-center">
            <button onClick={handleSortToggle} className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-lg border text-[11px] sm:text-sm font-medium transition-all active:scale-95 ${sortOrder ? 'bg-blue-50 border-blue-200 text-[#003375] shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`} title="Sắp xếp theo điểm">
                {sortOrder === 'desc' ? (<><ArrowDown className="text-yellow-500 w-3.5 h-3.5 sm:w-4 sm:h-4"/><span>Cao ➝ Thấp</span></>) : sortOrder === 'asc' ? (<><ArrowUp className="text-yellow-500 w-3.5 h-3.5 sm:w-4 sm:h-4"/><span>Thấp ➝ Cao</span></>) : (<><ListFilter className="w-3.5 h-3.5 sm:w-4 sm:h-4"/><span>Sắp xếp</span></>)}
            </button>

            <div className="relative flex-1 sm:w-64 sm:flex-none">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <input type="text" placeholder="Tìm môn học..." className="w-full pl-8 pr-7 py-1.5 text-[11px] sm:text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-shadow hover:border-blue-300" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                {searchTerm && (<button onClick={() => { playClick(); setSearchTerm(''); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 hover:scale-110 transition-transform"><X className="w-3 h-3 sm:w-3.5 sm:h-3.5" /></button>)}
            </div>
          </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-white uppercase bg-[#003375]">
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
                    
                    {['scoreCC', 'scoreProcess', 'scoreMid', 'scoreFinal'].map((key) => (
                        <td key={key} className="px-1 py-2">
                        <ScoreInput value={subject[key as keyof Subject] as number | null} onChange={(val) => handleSubjectChange(subject.id, key as keyof Subject, val)} />
                        </td>
                    ))}

                    <td className="px-3 py-2">
                        <input type="text" className="w-full bg-transparent border-b border-transparent focus:border-blue-500 focus:outline-none p-1 font-medium text-gray-800 transition-colors group-hover:text-[#003375]" value={subject.name} onChange={(e) => handleSubjectChange(subject.id, 'name', e.target.value)} />
                        <div className="flex items-center gap-2 mt-1">
                            <label className="text-[10px] text-gray-500 flex items-center gap-1 cursor-pointer select-none hover:text-[#003375] transition-colors">
                                <input type="checkbox" checked={subject.isNonGPA} onChange={(e) => { playClick(); handleSubjectChange(subject.id, 'isNonGPA', e.target.checked); }} className="rounded text-[#003375] focus:ring-[#003375] w-3 h-3 mr-1" />
                                Không tính GPA
                            </label>
                        </div>
                    </td>
                    
                    <td className="px-1 py-2">
                        <input type="number" className="w-full bg-white border border-gray-300 rounded p-1 text-center font-semibold text-gray-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 hover:border-blue-300" value={subject.credits} onChange={(e) => handleSubjectChange(subject.id, 'credits', parseInt(e.target.value) || 0)} />
                    </td>
                    
                    <td className="px-2 py-2 text-center font-bold text-[#990000]">{avg10 !== null ? avg10.toFixed(1) : '-'}</td>
                    <td className="px-2 py-2 text-center font-bold text-gray-700">{letter}</td>
                    <td className="px-2 py-2 text-center font-bold text-[#003375]">{avg4 !== null ? avg4.toFixed(1) : '-'}</td>
                    <td className="px-3 py-2 text-center"><span className={`px-2 py-1 rounded text-xs block w-full text-center shadow-sm ${statusClass}`}>{statusText}</span></td>
                    <td className="px-2 py-2 text-center">
                        <button onClick={() => removeSubject(subject.id)} className="text-gray-300 hover:text-red-500 transition-all hover:scale-110 p-1 active:scale-90" title="Xóa môn"><Trash2 size={16} /></button>
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
      
      <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 rounded-b-xl">
        <button onClick={addSubject} className="flex items-center gap-1 text-sm font-medium text-[#003375] hover:text-blue-700 transition-all hover:translate-x-1 p-1 active:scale-95"><Plus size={16} /> Thêm môn học</button>
      </div>
    </div>
  );
};


// ============================================================================
// 5. MAIN COMPONENT: DASHBOARD
// ============================================================================
interface DashboardProps {
    data: UserData;
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
}

export const Dashboard: React.FC<DashboardProps> = ({ 
    data, 
    onTargetChange, 
    showSecurityNotice,
    onUpdateSemester,
    onRemoveSemester,
    onAddSemester,
    onExportPDF,
    onImportPDF,
    isImporting,
    fileInputRef,
    onFileUpload
}) => {
    useEffect(() => {
        document.title = "Tổng quan | HUB Planner";
    }, []);
    const [showRankingModal, setShowRankingModal] = useState(false);
    const [showFailedModal, setShowFailedModal] = useState(false);
    const [showYearlyModal, setShowYearlyModal] = useState(false);

    const stats = calculateCumulativeStats(data.semesters);
    const yearlyStats = calculateYearlyStats(data.semesters);
    const trendAnalysis = analyzeTrend(data.semesters);

    const validSubjects = data.semesters.flatMap(s => s.subjects)
        .filter(s => !s.isNonGPA)
        .map(s => {
            const avg = calculateSubjectAverage(s);
            const { letter, scale4 } = avg !== null ? getGradeDetails(avg) : { letter: '?', scale4: 0 };
            return { ...s, avg: avg || 0, letter, scale4, semName: s.name };
        })
        .filter((s): s is typeof s & { avg: number } => s.avg !== null)
        .sort((a, b) => b.avg - a.avg);

    const highestSubject = validSubjects.length > 0 ? validSubjects[0] : null;

    const semesterPerfs = data.semesters.map(s => {
        const semStats = calculateSemesterStats(s.subjects);
        return { name: s.name, gpa: semStats.gpa4, hasData: semStats.hasData };
    }).filter(s => s.hasData).sort((a, b) => b.gpa - a.gpa);

    const bestSemester = semesterPerfs.length > 0 ? semesterPerfs[0] : null;

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

    const trendData = data.semesters.map(sem => {
        const semStats = calculateSemesterStats(sem.subjects);
        let shortName = sem.name;
        if (shortName.includes('Học kỳ')) {
            const parts = shortName.split('-');
            if (sem.name.includes('Năm học')) {
                const yearPart = sem.name.match(/(\d{4})/);
                const hkPart = sem.name.match(/Học kỳ (\d)/);
                if (yearPart && hkPart) shortName = `${hkPart[1]}/${yearPart[1].slice(2)}`;
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

    const allSubjects = data.semesters.flatMap(s => s.subjects);
    
    const failedSubjectsList = allSubjects.filter(s => {
        const avg = calculateSubjectAverage(s);
        return getSubjectStatus(avg) === GradeStatus.FAIL && !s.isNonGPA;
    });
    
    const failedCount = failedSubjectsList.length;
    const totalCreditsRequired = data.totalCreditsRequired || 125;
    
    const requiredAnalysis = calculateRequiredGPA(
        stats.rawGPA4, 
        stats.passedCredits,
        totalCreditsRequired,
        data.targetGPA
    );

    let difficultyColor = "text-[#003375] bg-blue-50";
    let difficultyText = "Tốt";
    let scoreClass = "text-[#003375]";

    if (requiredAnalysis && requiredAnalysis.isPossible) {
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
    <div className="w-full pb-10">
        <AdsBanner />

        <div className="w-full space-y-4 pt-1">
            {/* THẺ DIV STICKY CỐ ĐỊNH TIÊU ĐỀ DASHBOARD */}
            <div className="sticky top-0 z-40 bg-[#F8FAFC] pt-2 pb-4 -mt-2 mb-4 border-b border-gray-200/60 shadow-[0_8px_10px_-10px_rgba(0,0,0,0.05)]">
                <h1 className="text-[26px] sm:text-[30px] font-extrabold text-[#003375] tracking-tight leading-none mb-2">
                    Học tập
                </h1>
                <div className="flex flex-wrap items-center gap-1.5 text-[12px] sm:text-[13px] text-gray-500 font-medium">
                    <span className="font-bold text-gray-700">Tổng quan lộ trình</span>
                    <span className="text-gray-300">•</span>
                    <span>{data.cohort || 'Chưa cập nhật khóa'}</span>
                    <span className="text-gray-300">•</span>
                    <span>{data.majorName || 'Chưa cập nhật ngành'}</span>
                    <span className="text-gray-300">•</span>
                    <span>Đại học chính quy chuẩn</span>
                </div>
            </div>

            {/* HÀNG 1: 4 THẺ TỔNG QUAN */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                
                {/* Thẻ 1: GPA */}
                <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-300 hover:shadow-md transition-shadow flex flex-col justify-between">
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

                {/* Thẻ 2: Tín chỉ */}
                <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-300 hover:shadow-md transition-shadow flex flex-col justify-between">
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

                {/* Thẻ 3: Môn cao điểm nhất */}
                <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-300 hover:shadow-md transition-shadow flex flex-col justify-between group cursor-pointer" onClick={() => { playClick(); setShowRankingModal(true); }}>
                    <div className="flex justify-between items-start mb-1">
                        <span className="text-[11px] sm:text-xs font-bold text-gray-600 truncate">BXH môn học</span>
                        <Trophy size={16} className="text-yellow-500 shrink-0 w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </div>
                    {highestSubject ? (
                        <div className="mt-1">
                            <span className="text-[11px] sm:text-sm font-bold text-[#003375] line-clamp-1 leading-tight group-hover:underline">{highestSubject.name}</span>
                            <div className="mt-1 sm:mt-2 flex items-center gap-1.5 sm:gap-2">
                                <span className="text-sm sm:text-[15px] font-extrabold text-gray-900 leading-none">{highestSubject.avg.toFixed(1)}</span>
                                <span className="text-[9px] sm:text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 whitespace-nowrap">Điểm {highestSubject.letter}</span>
                            </div>
                        </div>
                    ) : (
                        <p className="text-[10px] sm:text-xs text-gray-400 italic mt-1.5 sm:mt-2">Chưa có dữ liệu</p>
                    )}
                </div>

                {/* Thẻ 4: Dự báo mục tiêu */}
                <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-300 hover:shadow-md transition-shadow flex flex-col justify-between relative">
                    <div className="flex justify-between items-start mb-1">
                        <span className="text-[11px] sm:text-xs font-bold text-gray-600 truncate">Dự báo mục tiêu</span>
                        <Target size={16} className="text-[#003375] shrink-0 w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </div>
                    <div className="flex flex-col gap-1 sm:gap-1 text-[9px] sm:text-[11px] text-gray-600">
                        <div className="flex justify-between items-center">
                            <span className="truncate">Mục tiêu:</span>
                            <div className="flex items-center group relative cursor-pointer border-b border-dashed border-gray-300 hover:border-[#003375]">
                                <input
                                    type="number" min="0" max="4" step="0.1"
                                    value={data.targetGPA}
                                    onChange={(e) => onTargetChange(parseFloat(e.target.value) || 0)}
                                    className="w-6 sm:w-12 font-bold text-[#003375] bg-transparent text-right focus:outline-none z-10 p-0 m-0"
                                />
                            </div>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="truncate">Hiện tại:</span>
                            <span className="font-bold text-gray-900">{stats.gpa4.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="truncate">Trung bình một tín:</span>
                            {requiredAnalysis && requiredAnalysis.isPossible ? (
                                <span className={`font-bold ${scoreClass}`}>{Math.max(0, requiredAnalysis.requiredGPA).toFixed(2)}</span>
                            ) : (
                                <span className="font-bold text-[#990000]">Không thể</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* HÀNG 2 & 3: BỐ CỤC CHUẨN MẪU (2 - 1 - 1) */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                
                {/* CỘT TRÁI (Chiếm 2 Ô): Line Chart + Cảnh báo */}
                <div className="lg:col-span-2 flex flex-col gap-3 sm:gap-4">
                    
                    {/* Ô Line Chart */}
                    <div className="bg-white p-3 sm:p-5 rounded-xl border border-gray-300 flex flex-col h-[240px] sm:h-auto sm:min-h-[340px]">
                        <div className="flex justify-between items-center mb-2 sm:mb-6">
                            <h3 className="text-[12px] sm:text-[15px] font-bold text-gray-900 tracking-tight">Xu hướng học tập</h3>
                            <div className="flex items-center gap-2 sm:gap-3 text-[9px] sm:text-[11px] font-bold text-gray-600">
                                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-[#003375]"></span>Hệ 4</span>
                                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-[#990000]"></span>Hệ 10</span>
                            </div>
                        </div>
                        
                        <div className="flex-1 w-full -ml-5 sm:-ml-4 relative min-h-[100px]">
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

                    {/* Nút cảnh báo nợ môn nằm gọn dưới Line Chart */}
                    <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-300 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-4">
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
                                    <CheckCircle2 size={14} /> Không nợ môn
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* CỘT PHẢI (Chiếm 2 Ô): Nhóm các phần tử còn lại */}
                <div className="lg:col-span-2 flex flex-col gap-4">
                    
                    {/* Hàng trên của Cột Phải: Donut (1 Ô) + Tổng kết (1 Ô) */}
                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                        
                        {/* Ô Donut Chart */}
                        <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-300 flex flex-col">
                            <h3 className="text-[11px] sm:text-sm font-bold text-gray-900 tracking-tight mb-2 uppercase truncate">Phân bố điểm</h3>
                            <div className="h-[100px] sm:h-[130px] w-full relative flex flex-col items-center justify-center shrink-0">
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

                        {/* Ô Tổng kết năm */}
                        <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-300 flex flex-col">
                            <div className="flex justify-between items-center mb-2 sm:mb-3">
                                <h3 className="text-[11px] sm:text-sm font-bold text-gray-900 uppercase truncate">Tổng kết năm</h3>
                                {yearlyStats.length > 3 && (
                                    <button onClick={() => { playClick(); setShowYearlyModal(true); }} className="text-[9px] sm:text-[10px] font-bold text-[#003375] hover:underline shrink-0 ml-1">Chi tiết</button>
                                )}
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
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

                    {/* Hàng dưới của Cột Phải: Bảng tin */}
                    <div className="bg-white rounded-xl border border-gray-300 flex flex-col overflow-hidden">
                        <SchoolAnnouncements />
                    </div>

                </div>

            </div>

            {/* 👇 KHU VỰC BẢNG ĐIỂM NẰM GỌN BÊN TRONG DASHBOARD 👇 */}
            <div className="pt-2">
                <div className="flex flex-row justify-between items-center mb-3 sm:mb-4 gap-2 border-t border-gray-200 pt-4 sm:pt-5 mt-2">
                    <h2 className="text-[15px] sm:text-xl font-bold text-gray-900 tracking-tight whitespace-nowrap">Chi tiết bảng điểm</h2>

                    <div className="flex items-center gap-1.5 sm:gap-3">
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
                    {data.semesters.map((sem, idx) => (
                        <SemesterTable
                            key={sem.id}
                            semester={sem}
                            index={idx}
                            onUpdateSemester={(updated) => onUpdateSemester(idx, updated)}
                            onRemoveSemester={() => onRemoveSemester(idx)}
                        />
                    ))}

                    {data.semesters.length === 0 && (
                        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
                            <p className="text-gray-500 mb-4 text-sm font-medium">Bạn chưa có học kỳ nào.</p>
                            <button onClick={onAddSemester} className="text-[#003375] font-bold hover:underline flex items-center justify-center gap-1 mx-auto text-sm transition-colors">
                                <Plus size={16} /> Tạo thủ công
                            </button>
                        </div>
                    )}
                    
                    {data.semesters.length > 0 && (
                        <button onClick={onAddSemester} className="w-full py-4 border-2 border-dashed border-gray-200 text-gray-500 hover:text-gray-800 hover:border-gray-400 hover:bg-gray-50 rounded-xl font-semibold flex justify-center items-center gap-2 transition-all">
                            <Plus size={18}/> Thêm học kỳ mới
                        </button>
                    )}
                </div>
            </div>
            {/* 👆 KẾT THÚC VÙNG BẢNG ĐIỂM 👆 */}
            
        </div>

        {/* Các Modal */}
        {showRankingModal && <SubjectRankingModal subjects={validSubjects} onClose={() => setShowRankingModal(false)} />}
        {showFailedModal && <FailedSubjectsModal subjects={failedSubjectsList} onClose={() => setShowFailedModal(false)} />}
        {showYearlyModal && <YearlyStatsModal stats={yearlyStats} onClose={() => setShowYearlyModal(false)} />}
    </div>
  );
};