import React, { useState, useEffect, useRef } from 'react';
import { Semester, Subject, GradeStatus } from '../types';
import { calculateSubjectAverage, getGradeDetails, getSubjectStatus, getDegreeClassification, calculateForecastRank } from '../utils/calculations';
import { fetchRankingData, AVAILABLE_DATASETS } from '../utils/rankingData';
import { Trash2, Plus, Star, Search, X, Pencil, BookOpen, Crown, ChevronDown, TrendingUp } from 'lucide-react';
import { playClick } from '../utils/audio';

interface SemesterTableProps {
  semester: Semester;
  index: number;
  onUpdateSemester: (updatedSemester: Semester) => void;
  onRemoveSemester: () => void;
}

const ScoreInput = ({ 
  value, 
  onChange 
}: { 
  value: number | null, 
  onChange: (val: number | null) => void 
}) => {
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
    const parsed = parseFloat(newVal);
    if (isNaN(parsed) || parsed < 0 || parsed > 10) return;

    setLocalValue(newVal);
    onChange(parsed);
  };

  return (
    <input 
      type="number" 
      min="0" max="10" step="0.1"
      className="w-full bg-white border border-gray-300 text-gray-900 text-sm rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent p-1 text-center font-medium transition-all hover:border-blue-300"
      placeholder="-"
      value={localValue}
      onChange={handleChange}
    />
  );
};

export const SemesterTable: React.FC<SemesterTableProps> = ({ semester, index, onUpdateSemester, onRemoveSemester }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [rankingInfo, setRankingInfo] = useState<{rank: number, total: number, text: string, gapInfo: any} | null>(null);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [showRankMenu, setShowRankMenu] = useState(false);
  const rankMenuRef = useRef<HTMLDivElement>(null);
  
  const handleSubjectChange = (subjectId: string, field: keyof Subject, value: any) => {
    const updatedSubjects = semester.subjects.map(sub => {
      if (sub.id === subjectId) {
        return { ...sub, [field]: value };
      }
      return sub;
    });
    onUpdateSemester({ ...semester, subjects: updatedSubjects });
  };

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
    onUpdateSemester({ ...semester, subjects: [...semester.subjects, newSubject] });
    setSearchTerm(''); 
  };

  const removeSubject = (id: string) => {
    playClick();
    onUpdateSemester({ ...semester, subjects: semester.subjects.filter(s => s.id !== id) });
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (rankMenuRef.current && !rankMenuRef.current.contains(event.target as Node)) {
            setShowRankMenu(false);
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

  const semGPA4 = semTotalCredits ? (semWeightedScore4 / semTotalCredits) : 0;
  const semGPA10 = semTotalCredits ? (semWeightedScore10 / semTotalCredits) : 0;
  const classification = hasData ? getDegreeClassification(semGPA4) : '---';

  // --- Ranking Logic ---
  // Auto-detect dataset if none selected
  useEffect(() => {
    if (!selectedDatasetId && semester.name) {
        const lowerName = semester.name.toLowerCase();
        if (lowerName.includes('học kỳ 1') || lowerName.includes('hk1')) {
            setSelectedDatasetId('hk1_2425');
        } else if (lowerName.includes('học kỳ 2') || lowerName.includes('hk2')) {
            setSelectedDatasetId('hk2_2425');
        }
    }
  }, [semester.name]);

  useEffect(() => {
    if (hasData) {
        const fetchRank = async () => {
            const datasetToFetch = selectedDatasetId || semester.name; // Fallback to name-based detection in fetchRankingData
            const historicalData = await fetchRankingData(datasetToFetch);
            
            if (historicalData) {
                const userStats = {
                    gpa4: semGPA4,
                    credits: totalRegisteredCredits,
                    drl: semester.trainingScore || 0
                };
                const result = calculateForecastRank(userStats, historicalData);
                setRankingInfo({
                    rank: result.rank,
                    total: result.totalStudents,
                    text: result.percentileText,
                    gapInfo: result.gapInfo
                });
            } else {
                setRankingInfo(null);
            }
        };

        const timer = setTimeout(fetchRank, 500);
        return () => clearTimeout(timer);
    } else {
        setRankingInfo(null);
    }
  }, [semester.name, semGPA4, totalRegisteredCredits, semester.trainingScore, hasData, selectedDatasetId]);


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
  
  const currentDatasetName = AVAILABLE_DATASETS.find(d => d.id === selectedDatasetId)?.name || "Tự động chọn";

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
                        onClick={() => { playClick(); setShowRankMenu(!showRankMenu); }}
                        className="flex items-center gap-1 bg-yellow-100 text-yellow-800 px-3 py-1.5 rounded-lg border border-yellow-200 shadow-sm hover:bg-yellow-200 transition-all active:scale-95 hover:shadow-md"
                        title="Xếp hạng dự báo"
                    >
                        <Crown size={14} className="fill-yellow-500 text-yellow-600"/> 
                        <span className="font-bold">{rankingInfo ? rankingInfo.text : 'Xếp hạng'}</span>
                        <ChevronDown size={12} className={`transition-transform ${showRankMenu ? 'rotate-180' : ''}`}/>
                    </button>

                    {showRankMenu && (
                        <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden animate-fadeIn">
                            <div className="bg-gray-50 px-3 py-2 border-b border-gray-100 text-xs text-gray-500 font-semibold uppercase tracking-wider">
                                So sánh với dữ liệu
                            </div>
                            <div className="max-h-40 overflow-y-auto">
                                {AVAILABLE_DATASETS.map(ds => (
                                    <button
                                        key={ds.id}
                                        onClick={() => { playClick(); setSelectedDatasetId(ds.id); setShowRankMenu(false); }}
                                        className={`w-full text-left px-4 py-2 text-sm hover:bg-blue-50 transition-colors flex items-center justify-between ${selectedDatasetId === ds.id ? 'text-[#003375] font-bold bg-blue-50' : 'text-gray-700'}`}
                                    >
                                        {ds.name}
                                        {selectedDatasetId === ds.id && <Crown size={12} />}
                                    </button>
                                ))}
                            </div>
                            
                            {/* Detailed Info Section */}
                            {rankingInfo && (
                                <div className="bg-[#003375] text-white p-3 text-xs">
                                    <div className="flex justify-between items-center mb-2">
                                        <span>Hạng dự báo:</span>
                                        <span className="font-bold text-yellow-300 text-sm">{rankingInfo.rank} <span className="text-white/70 font-normal">/ {rankingInfo.total}</span></span>
                                    </div>
                                    {rankingInfo.gapInfo ? (
                                        <div className="pt-2 border-t border-white/20">
                                            <p className="flex items-center gap-1 text-orange-200 mb-1">
                                                <TrendingUp size={12}/> Để lên hạng kế tiếp:
                                            </p>
                                            <p className="font-bold">{rankingInfo.gapInfo.message}</p>
                                        </div>
                                    ) : (
                                        <div className="pt-2 border-t border-white/20 text-center text-green-300 font-bold">
                                            Bạn đang dẫn đầu! 🏆
                                        </div>
                                    )}
                                </div>
                            )}
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
                filteredSubjects.map((subject, sIdx) => {
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
                        <ScoreInput 
                            value={subject[key as keyof Subject] as number | null}
                            onChange={(val) => handleSubjectChange(subject.id, key as keyof Subject, val)}
                        />
                        </td>
                    ))}

                    <td className="px-3 py-2">
                        <input 
                        type="text" 
                        className="w-full bg-transparent border-b border-transparent focus:border-blue-500 focus:outline-none p-1 font-medium text-gray-800 transition-colors group-hover:text-[#003375]"
                        value={subject.name}
                        onChange={(e) => handleSubjectChange(subject.id, 'name', e.target.value)}
                        />
                        <div className="flex items-center gap-2 mt-1">
                            <label className="text-[10px] text-gray-500 flex items-center gap-1 cursor-pointer select-none hover:text-[#003375] transition-colors">
                                <input 
                                    type="checkbox" 
                                    checked={subject.isNonGPA}
                                    onChange={(e) => { playClick(); handleSubjectChange(subject.id, 'isNonGPA', e.target.checked); }}
                                    className="rounded text-[#003375] focus:ring-[#003375] w-3 h-3 mr-1"
                                />
                                Không tính GPA
                            </label>
                        </div>
                    </td>
                    
                    <td className="px-1 py-2">
                        <input 
                        type="number" 
                        className="w-full bg-white border border-gray-300 rounded p-1 text-center font-semibold text-gray-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 hover:border-blue-300"
                        value={subject.credits}
                        onChange={(e) => handleSubjectChange(subject.id, 'credits', parseInt(e.target.value) || 0)}
                        />
                    </td>
                    
                    <td className="px-2 py-2 text-center font-bold text-[#990000]">
                        {avg10 !== null ? avg10.toFixed(1) : '-'}
                    </td>

                    <td className="px-2 py-2 text-center font-bold text-gray-700">
                        {letter}
                    </td>
                    
                    <td className="px-2 py-2 text-center font-bold text-[#003375]">
                        {avg4 !== null ? avg4.toFixed(1) : '-'}
                    </td>

                    <td className="px-3 py-2 text-center">
                        <span className={`px-2 py-1 rounded text-xs block w-full text-center shadow-sm ${statusClass}`}>
                        {statusText}
                        </span>
                    </td>
                    
                    <td className="px-2 py-2 text-center">
                        <button 
                            onClick={() => removeSubject(subject.id)}
                            className="text-gray-300 hover:text-red-500 transition-all hover:scale-110 p-1 active:scale-90"
                            title="Xóa môn"
                        >
                            <Trash2 size={16} />
                        </button>
                    </td>
                    </tr>
                );
                })
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
