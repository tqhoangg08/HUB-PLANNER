import React, { useState, useEffect } from 'react';
import { Semester, Subject, GradeStatus } from '../types';
import { calculateSubjectAverage, getGradeDetails, getSubjectStatus, getDegreeClassification } from '../utils/calculations';
import { Trash2, Plus, Star, Search, X, Pencil, BookOpen } from 'lucide-react';
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
      className="w-full bg-white border border-gray-300 text-gray-900 text-sm rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent p-1 text-center font-medium transition-all"
      placeholder="-"
      value={localValue}
      onChange={handleChange}
    />
  );
};

export const SemesterTable: React.FC<SemesterTableProps> = ({ semester, index, onUpdateSemester, onRemoveSemester }) => {
  const [searchTerm, setSearchTerm] = useState('');
  
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

  // Styles for header - Darker academics tones
  let headerColor = "bg-gray-50 border-gray-200";
  if (hasData) {
      // Use subtle colored backgrounds but dark text
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
    <div className={`mb-8 bg-white rounded-xl shadow-sm border overflow-hidden transition-all duration-300 hover:scale-[1.01] hover:shadow-lg ${hasData ? 'border-opacity-100' : 'border-gray-200'}`}>
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
        <div className="flex flex-wrap items-center gap-2 md:gap-6 text-sm">
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm">
                <span className="text-gray-500 font-medium flex items-center gap-1">
                    <BookOpen size={14}/> Tổng TC:
                </span>
                <span className="font-bold text-gray-800">{totalRegisteredCredits}</span>
            </div>

            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm">
                <span className="text-gray-500 font-medium">GPA (10):</span>
                <span className="font-bold text-[#990000]">{hasData ? semGPA10.toFixed(1) : '-'}</span>
            </div>
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm">
                <span className="text-gray-500 font-medium">GPA (4):</span>
                <span className="font-bold text-[#003375]">{hasData ? semGPA4.toFixed(1) : '-'}</span>
            </div>
            <div className="flex items-center gap-2 bg-white pl-3 pr-1 py-1 rounded-lg border border-gray-200 shadow-sm">
                <span className="text-gray-500 font-medium flex items-center gap-1">
                    <Star size={14} className="text-yellow-500 fill-yellow-500"/> ĐRL:
                </span>
                <input 
                    type="number" 
                    min="0" max="100"
                    placeholder="0"
                    className="w-12 text-center font-bold text-gray-800 outline-none border-b border-transparent focus:border-blue-400 focus:bg-gray-50 rounded transition-colors"
                    value={semester.trainingScore ?? ''}
                    onChange={(e) => handleTrainingScoreChange(e.target.value)}
                />
            </div>
            
             <button 
                onClick={onRemoveSemester}
                className="ml-auto md:ml-0 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all p-2 rounded-full active:scale-90"
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
                    className="w-full pl-9 pr-8 py-1.5 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
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
                let rowClass = "hover:bg-gray-50";

                if (status === GradeStatus.FAIL) {
                    statusClass = "bg-red-100 text-[#990000] font-bold";
                    statusText = "Rớt";
                    rowClass = "bg-red-50 hover:bg-red-100";
                } else if (status === GradeStatus.IMPROVE) {
                    statusClass = "bg-yellow-100 text-yellow-700";
                    statusText = "Đạt";
                } else if (status === GradeStatus.PASS) {
                    statusClass = "bg-green-100 text-green-700 font-bold";
                    statusText = "Đạt";
                }

                return (
                    <tr key={subject.id} className={`${rowClass} transition-colors duration-150`}>
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
                        className="w-full bg-transparent border-b border-transparent focus:border-blue-500 focus:outline-none p-1 font-medium text-gray-800 transition-colors"
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
                        className="w-full bg-white border border-gray-300 rounded p-1 text-center font-semibold text-gray-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
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
                        <span className={`px-2 py-1 rounded text-xs block w-full text-center ${statusClass}`}>
                        {statusText}
                        </span>
                    </td>
                    
                    <td className="px-2 py-2 text-center">
                        <button 
                            onClick={() => removeSubject(subject.id)}
                            className="text-gray-300 hover:text-[#990000] transition-transform hover:scale-110 p-1"
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
          className="flex items-center gap-1 text-sm font-medium text-[#003375] hover:text-blue-900 transition-all hover:translate-x-1 p-1"
        >
          <Plus size={16} />
          Thêm môn học
        </button>
      </div>
    </div>
  );
};
