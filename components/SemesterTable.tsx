
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Semester, Subject } from '../types';
import { calculateSubjectAverage, getDegreeClassification, getGradeDetails } from '../utils/calculations';
import { mapIdToDisplay } from '../utils/rankingData';
import { useForecastRank } from '../hooks/useForecastRank';
import { Trash2, Plus, Star, Search, X, Pencil, BookOpen, Crown, TrendingUp, Loader2, AlertCircle, ChevronRight, BarChart2, ChevronLeft, Award } from 'lucide-react';
import { playClick } from '../utils/audio';

interface SemesterTableProps {
  semester: Semester;
  index: number;
  onUpdateSemester: (updatedSemester: Semester) => void;
  onRemoveSemester: () => void;
}

export const SemesterTable: React.FC<SemesterTableProps> = ({ semester, index, onUpdateSemester, onRemoveSemester }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const semesterRef = useRef(semester);

  useEffect(() => {
    semesterRef.current = semester;
  }, [semester]);
  
  // New Ranking Hook
  const { 
      fetchRank, 
      result: rankingResult, 
      loading: rankingLoading, 
      error: rankingError,
      resetResult,
      fetchAvailableSemesters,
      availableSemesters,
      loadingSemesters,
      prepareSemesterRanks,
      resetSemesterRanks,
      semesterRanks,
      loadingSemesterRanks
  } = useForecastRank();

  const [showRankMenu, setShowRankMenu] = useState(false);
  const rankMenuRef = useRef<HTMLDivElement>(null);
  
  const handleSubjectChange = useCallback((subjectId: string, field: keyof Subject, value: any) => {
    const currentSemester = semesterRef.current;
    const updatedSubjects = currentSemester.subjects.map(sub => {
      if (sub.id === subjectId) {
        return { ...sub, [field]: value };
      }
      return sub;
    });
    onUpdateSemester({ ...currentSemester, subjects: updatedSubjects });
  }, [onUpdateSemester]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateSemester({ ...semester, name: e.target.value });
  };

  const handleTrainingScoreChange = (val: string) => {
      const num = parseInt(val);
      if (val === '') {
          onUpdateSemester({ ...semester, trainingScore: null });
      } else if (!isNaN(num) && num >= 0 && num <= 100) {
          onUpdateSemester({ ...semester, trainingScore: num });
      }
  };

  const addSubject = () => {
    playClick();
    const newSubject: Subject = {
      id: Date.now().toString(),
      name: 'Môn học mới',
      credits: 3,
      scoreCC: null,
      scoreProcess: null,
      scoreMid: null,
      scoreFinal: null,
      isNonGPA: false
    };
    const currentSemester = semesterRef.current;
    onUpdateSemester({ ...currentSemester, subjects: [...currentSemester.subjects, newSubject] });
    setSearchTerm(''); 
  };

  const removeSubject = useCallback((id: string) => {
    playClick();
    const currentSemester = semesterRef.current;
    onUpdateSemester({ ...currentSemester, subjects: currentSemester.subjects.filter(s => s.id !== id) });
  }, [onUpdateSemester]);

  const handleToggleNonGPA = useCallback((subjectId: string, isNonGPA: boolean) => {
    playClick();
    handleSubjectChange(subjectId, 'isNonGPA', isNonGPA);
  }, [handleSubjectChange]);

  // Close dropdown when clicking outside
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

  // --- Calculate Semester Stats ---
  let semTotalCredits = 0; // Credits with grades (for GPA calc)
  let semWeightedScore4 = 0;
  let semWeightedScore10 = 0;
  let hasData = false;
  let totalRegisteredCredits = 0; // Total credits (excluding non-GPA)

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

  // Calculate GPA with Round Half Up to 1 decimal place (3.65 -> 3.7)
  const semGPA4 = semTotalCredits ? Math.round((semWeightedScore4 / semTotalCredits) * 10) / 10 : 0;
  const semGPA10 = semTotalCredits ? Math.round((semWeightedScore10 / semTotalCredits) * 10) / 10 : 0;
  
  const classification = hasData ? getDegreeClassification(semGPA4) : '---';
  const scholarshipStatus = (() => {
    const drl = semester.trainingScore ?? 0;
    const credits = totalRegisteredCredits;
    const gpa = semGPA4;

    const meetsRequirements = credits >= 15 && gpa >= 3.2 && drl >= 80;
    if (!meetsRequirements) {
      return {
        label: 'Không đạt',
        className: 'bg-gray-100 text-gray-500 border-gray-200'
      };
    }

    if (gpa >= 3.6 && drl >= 90) {
      return {
        label: '🏆 HB Xuất sắc',
        className: 'bg-yellow-50 text-yellow-700 border-yellow-200'
      };
    }

    return {
      label: '💰 HB Giỏi',
      className: 'bg-green-50 text-green-700 border-green-200'
    };
  })();

  // --- NEW Ranking UI Logic ---
  const handleOpenRankMenu = () => {
      playClick();
      setShowRankMenu(true);
      prepareSemesterRanks(semGPA4, totalRegisteredCredits, semester.trainingScore ?? 0);
      fetchAvailableSemesters(); // Fetch list when opening
  };

  const handleSelectReferenceSemester = (refId: string) => {
      playClick();
      fetchRank(refId, semGPA4, totalRegisteredCredits, semester.trainingScore ?? 0);
  };

  const handleBackToSelection = () => {
      playClick();
      resetResult();
  };

  // Styles for header - Darker academics tones
  let headerColor = "bg-gray-50 border-gray-200";
  if (hasData) {
      if (semGPA4 >= 3.6) headerColor = "bg-green-50 border-green-200"; 
      else if (semGPA4 >= 3.2) headerColor = "bg-blue-50 border-blue-200"; 
      else if (semGPA4 >= 2.5) headerColor = "bg-indigo-50 border-indigo-200"; 
      else if (semGPA4 >= 2.0) headerColor = "bg-yellow-50 border-yellow-200"; 
      else if (semGPA4 >= 1.0) headerColor = "bg-orange-50 border-orange-200"; 
      else headerColor = "bg-red-50 border-red-200"; 
  }

  const filteredSubjects = semester.subjects.filter(subject => 
    subject.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className={`mb-8 bg-white rounded-xl shadow-sm border overflow-hidden transition-all duration-300 hover:scale-[1.01] hover:shadow-xl ${hasData ? 'border-opacity-100' : 'border-gray-200'}`}>
      {/* Header with Stats */}
      <div className={`px-6 py-4 border-b flex flex-col md:flex-row md:items-center justify-between gap-4 ${headerColor}`}>
        <div className="flex items-center gap-4 flex-1">
            <div className="relative group flex-1 max-w-md">
                <input 
                    type="text" 
                    value={semester.name}
                    onChange={handleNameChange}
                    className="text-lg font-bold text-[#003375] bg-transparent border-b border-dashed border-transparent hover:border-[#003375]/50 focus:border-[#003375] focus:outline-none transition-all w-full py-1 placeholder-[#003375]/50"
                    placeholder="Tên học kỳ..."
                />
                <Pencil size={14} className="text-gray-400 absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            </div>
            
            {hasData && (
                <span className={`text-xs px-2 py-1 rounded-full font-bold border bg-white/60 border-current shadow-sm text-gray-700 whitespace-nowrap`}>
                    {classification}
                </span>
            )}
        </div>

        {/* Stats Bar */}
        <div className="flex flex-wrap items-center gap-2 md:gap-4 text-sm">
             {/* Rank Badge Dropdown */}
             {hasData && (
                 <div className="relative" ref={rankMenuRef}>
                    <button 
                        onClick={handleOpenRankMenu}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border shadow-sm transition-all active:scale-95 hover:shadow-md ${showRankMenu ? 'bg-blue-50 border-blue-200 ring-2 ring-blue-100' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                        title="Xếp hạng dự báo"
                    >
                        <Crown size={14} className={rankingResult ? "fill-yellow-500 text-yellow-600" : "text-gray-400"}/> 
                        <span className="font-bold text-[#003375]">
                            Xếp hạng 👑
                        </span>
                    </button>

                    {showRankMenu && (
                        <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 z-[60] overflow-hidden animate-fadeIn origin-top-right">
                            <div className="bg-[#003375] px-4 py-3 text-white flex justify-between items-center shrink-0">
                                <h4 className="font-bold text-sm flex items-center gap-2">
                                    <BarChart2 size={16}/> Xếp Hạng Dự Báo
                                </h4>
                                <button
                                    onClick={() => {
                                        setShowRankMenu(false);
                                        resetSemesterRanks();
                                    }}
                                    className="hover:bg-white/20 p-1 rounded-full transition-colors"
                                >
                                    <X size={14}/>
                                </button>
                            </div>
                            
                            <div className="p-0">
                                {/* STATE 1: LOADING OR RESULT */}
                                {rankingLoading ? (
                                    <div className="flex flex-col items-center justify-center py-8 text-[#003375]">
                                        <Loader2 size={32} className="animate-spin mb-2"/>
                                        <span className="text-xs font-medium">Đang tính toán thứ hạng...</span>
                                    </div>
                                ) : rankingResult ? (
                                    <div className="p-4 bg-gradient-to-b from-blue-50 to-white">
                                        <button onClick={handleBackToSelection} className="flex items-center gap-1 text-xs text-gray-500 hover:text-[#003375] mb-3 transition-colors">
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
                                                <p className="text-2xl font-bold flex items-center justify-center gap-2">
                                                    <TrendingUp size={20}/> Top {rankingResult.topPercent.toFixed(1)}%
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    // STATE 2: SELECTION LIST
                                    <div className="flex flex-col max-h-[300px]">
                                        <div className="p-3 bg-gray-50 border-b border-gray-100 text-xs text-gray-500 italic">
                                            Chọn nguồn dữ liệu (Kỳ học cũ) để so sánh với GPA hiện tại của bạn ({semGPA4.toFixed(1)}).
                                        </div>
                                        <div className="overflow-y-auto custom-scrollbar p-2 space-y-1">
                                            {loadingSemesters ? (
                                                <div className="py-4 text-center text-xs text-gray-400">Đang tải danh sách kỳ...</div>
                                            ) : availableSemesters.length > 0 ? (
                                                availableSemesters.map((semId) => {
                                                    const semesterRank = semesterRanks[semId];
                                                    const rankLabel = Number.isFinite(semesterRank)
                                                        ? `Hạng #${semesterRank}`
                                                        : loadingSemesterRanks
                                                            ? 'Đang tải hạng...'
                                                            : 'Chưa có hạng';

                                                    return (
                                                    <button 
                                                        key={semId}
                                                        onClick={() => handleSelectReferenceSemester(semId)}
                                                        className="w-full text-left px-3 py-2.5 hover:bg-blue-50 hover:text-[#003375] rounded-lg transition-all text-sm font-medium text-gray-700 flex justify-between items-center group"
                                                    >
                                                        <span>Dữ liệu {mapIdToDisplay(semId)} - {rankLabel}</span>
                                                        <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-400"/>
                                                    </button>
                                                );
                                                })
                                            ) : (
                                                <div className="py-6 text-center">
                                                    <p className="text-xs text-gray-400 mb-2">Chưa có dữ liệu xếp hạng nào.</p>
                                                </div>
                                            )}
                                        </div>
                                        {rankingError && (
                                            <div className="p-2 bg-red-50 text-red-600 text-xs text-center border-t border-red-100 flex items-center justify-center gap-1">
                                                <AlertCircle size={12}/> {rankingError}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                 </div>
             )}

            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm transition-transform hover:scale-105">
                <span className="text-gray-500 font-medium flex items-center gap-1">
                    <BookOpen size={14}/> TC:
                </span>
                <span className="font-bold text-gray-800">{totalRegisteredCredits}</span>
            </div>

            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm transition-transform hover:scale-105">
                <span className="text-gray-500 font-medium">GPA(4):</span>
                <span className="font-bold text-[#003375]">{hasData ? semGPA4.toFixed(1) : '-'}</span>
            </div>

            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm transition-transform hover:scale-105">
                <span className="text-gray-500 font-medium">GPA(10):</span>
                <span className="font-bold text-[#990000]">{hasData ? semGPA10.toFixed(1) : '-'}</span>
            </div>

            <div className="flex items-center gap-2 bg-white pl-3 pr-1 py-1 rounded-lg border border-gray-200 shadow-sm transition-transform hover:scale-105">
                <span className="text-gray-500 font-medium flex items-center gap-1">
                    <Star size={14} className="text-yellow-500 fill-yellow-500"/> ĐRL:
                </span>
                <input 
                    type="number" 
                    min="0" max="100"
                    placeholder="0"
                    className="w-10 text-center font-bold text-gray-800 outline-none border-b border-transparent focus:border-blue-400 focus:bg-gray-50 rounded transition-colors"
                    value={semester.trainingScore ?? ''}
                    onChange={(e) => handleTrainingScoreChange(e.target.value)}
                />
            </div>

            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border shadow-sm text-sm font-bold ${scholarshipStatus.className}`}>
                <Award size={14} />
                <span>{scholarshipStatus.label}</span>
            </div>
            
             <button 
                onClick={onRemoveSemester}
                className="ml-auto md:ml-0 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all p-2 rounded-full active:scale-90 hover:shadow-md"
                title="Xóa học kỳ"
            >
             <Trash2 size={18} />
            </button>
        </div>
      </div>

      {/* Search Bar */}
      {semester.subjects.length > 0 && (
          <div className="px-6 py-2 bg-gray-50/50 border-b border-gray-100 flex justify-end">
            <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                <input
                    type="text"
                    placeholder="Tìm môn học..."
                    className="w-full pl-9 pr-8 py-1.5 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-shadow hover:border-blue-300"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                    <button 
                        onClick={() => { playClick(); setSearchTerm(''); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 hover:scale-110 transition-transform"
                    >
                        <X size={14} />
                    </button>
                )}
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
            {filteredSubjects.length > 0 ? (
                filteredSubjects.map((subject, sIdx) => (
          
                    key={subject.id}
                    subject={subject}
                    index={sIdx}
                    onFieldChange={handleSubjectChange}
                    onToggleNonGPA={handleToggleNonGPA}
                    onRemove={removeSubject}
                  />
                ))
            ) : (
                <tr>
                    <td colSpan={12} className="py-8 text-center text-gray-500">
                        Không tìm thấy môn học nào phù hợp với "{searchTerm}"
                    </td>
                </tr>
            )}
          </tbody>
        </table>
      </div>
      
      <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
        <button 
          onClick={addSubject}
          className="flex items-center gap-1 text-sm font-medium text-[#003375] hover:text-blue-700 transition-all hover:translate-x-1 p-1 active:scale-95"
        >
          <Plus size={16} />
          Thêm môn học
        </button>
      </div>
    </div>
  );
};
