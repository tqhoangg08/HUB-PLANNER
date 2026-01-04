import React, { useState } from 'react';
import { UserData, GradeStatus, Semester } from '../types';
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
import { Target, TrendingUp, AlertTriangle, Award, User, BookOpen, Star, BarChart3, Calendar, CheckCircle2, Pencil, Calculator, Trophy, TrendingDown, Zap, PieChart as PieChartIcon, ArrowUpRight, ArrowDownRight, List, X } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { playClick } from '../utils/audio';

interface DashboardProps {
  data: UserData;
  onTargetChange: (newTarget: number) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ data, onTargetChange }) => {
  const [showRankingModal, setShowRankingModal] = useState(false);
  const stats = calculateCumulativeStats(data.semesters);
  const yearlyStats = calculateYearlyStats(data.semesters);
  const classification = getDegreeClassification(stats.gpa4);
  const trendAnalysis = analyzeTrend(data.semesters);

  // --- NEW ANALYTICS CALCULATIONS ---
  // 1. Flatten and analyze subjects
  const validSubjects = data.semesters.flatMap(s => s.subjects)
    .filter(s => !s.isNonGPA)
    .map(s => {
        const avg = calculateSubjectAverage(s);
        const { letter, scale4 } = avg !== null ? getGradeDetails(avg) : { letter: '?', scale4: 0 };
        return { ...s, avg, letter, scale4, semName: s.name };
    })
    .filter((s): s is typeof s & { avg: number } => s.avg !== null)
    .sort((a, b) => b.avg - a.avg); // Sort Descending

  const highestSubject = validSubjects.length > 0 ? validSubjects[0] : null;
  
  // 2. Best Semester
  const semesterPerfs = data.semesters.map(s => {
    const semStats = calculateSemesterStats(s.subjects);
    return { name: s.name, gpa: semStats.gpa4, hasData: semStats.hasData };
  }).filter(s => s.hasData).sort((a, b) => b.gpa - a.gpa);
  
  const bestSemester = semesterPerfs.length > 0 ? semesterPerfs[0] : null;

  // 3. Grade Distribution for Pie Chart
  const gradeDist = validSubjects.reduce((acc, curr) => {
    const group = curr.letter.charAt(0); // Take first char (A, B, C, D, F)
    acc[group] = (acc[group] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const pieData = [
    { name: 'Giỏi/Xuất sắc (A)', value: gradeDist['A'] || 0, color: '#22c55e' }, // Green
    { name: 'Khá (B)', value: gradeDist['B'] || 0, color: '#3b82f6' }, // Blue
    { name: 'Trung bình (C)', value: gradeDist['C'] || 0, color: '#eab308' }, // Yellow
    { name: 'Yếu (D)', value: gradeDist['D'] || 0, color: '#f97316' }, // Orange
    { name: 'Rớt (F)', value: gradeDist['F'] || 0, color: '#ef4444' }, // Red
  ].filter(d => d.value > 0);

  // --- EXISTING CALCULATIONS ---
  // Prepare data for Trend Chart
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

  const filledTrainingScores = data.semesters
    .map(s => s.trainingScore)
    .filter((s): s is number => s !== null && s !== undefined);
  
  const averageTrainingScore = filledTrainingScores.length > 0
    ? Math.round(filledTrainingScores.reduce((a, b) => a + b, 0) / filledTrainingScores.length)
    : 0;

  const allSubjects = data.semesters.flatMap(s => s.subjects);
  const failedCount = allSubjects.filter(s => {
    const avg = calculateSubjectAverage(s);
    return getSubjectStatus(avg) === GradeStatus.FAIL && !s.isNonGPA;
  }).length;
  
  const totalCreditsRequired = data.totalCreditsRequired || 125; 
  const isScholarshipEligible = stats.gpa4 >= 3.2 && averageTrainingScore >= 80 && failedCount === 0;

  const requiredAnalysis = calculateRequiredGPA(
      stats.gpa4, 
      stats.passedCredits, 
      totalCreditsRequired, 
      data.targetGPA
  );
  
  let difficultyColor = "text-[#003375]";
  let difficultyText = "";
  let scoreClass = "text-[#003375]";
  
  if (requiredAnalysis && requiredAnalysis.isPossible) {
      const req = requiredAnalysis.requiredGPA;
      if (req > 3.6) {
          difficultyColor = "text-red-600";
          difficultyText = "Thử thách lớn";
          scoreClass = "text-red-600";
      } else if (req > 3.2) {
          difficultyColor = "text-orange-600";
          difficultyText = "Cần nỗ lực";
          scoreClass = "text-orange-600";
      } else if (req > 2.5) {
          difficultyColor = "text-blue-600";
          difficultyText = "Khả thi";
          scoreClass = "text-blue-600";
      } else {
          difficultyColor = "text-green-600";
          difficultyText = "Trong tầm tay";
          scoreClass = "text-green-600";
      }
  }

  const RankingModal = () => (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
        <div className="bg-white rounded-xl w-full max-w-5xl shadow-2xl flex flex-col h-[90vh] animate-scaleIn border border-gray-200">
            <div className="p-4 border-b bg-[#003375] text-white rounded-t-xl flex justify-between items-center shrink-0">
                <h3 className="font-bold text-xl flex items-center gap-2">
                    <Trophy size={24} className="text-yellow-300" />
                    Bảng xếp hạng môn học
                </h3>
                <button 
                    onClick={() => { playClick(); setShowRankingModal(false); }}
                    className="hover:bg-white/20 p-2 rounded-full transition-colors active:scale-90"
                >
                    <X size={24} />
                </button>
            </div>
            
            <div className="overflow-auto custom-scrollbar flex-1 p-0">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50 text-sm text-gray-500 uppercase font-semibold sticky top-0 shadow-sm z-10">
                        <tr>
                            <th className="p-4 text-center w-16">Hạng</th>
                            <th className="p-4">Môn học</th>
                            <th className="p-4 text-center">TC</th>
                            <th className="p-4 text-center">Điểm (10)</th>
                            <th className="p-4 text-center">Điểm (4)</th>
                            <th className="p-4 text-center">Chữ</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-base">
                        {validSubjects.map((sub, idx) => {
                            let rankColor = "text-gray-500";
                            let rowBg = "hover:bg-gray-50";
                            let iconSize = 20;
                            if (idx === 0) { rankColor = "text-yellow-500"; rowBg = "bg-yellow-50/50 hover:bg-yellow-50"; iconSize = 24; }
                            else if (idx === 1) { rankColor = "text-gray-400"; rowBg = "bg-gray-50/50 hover:bg-gray-100"; iconSize = 22; }
                            else if (idx === 2) { rankColor = "text-orange-400"; rowBg = "bg-orange-50/50 hover:bg-orange-50"; iconSize = 22; }

                            return (
                                <tr key={idx} className={`${rowBg} transition-colors`}>
                                    <td className="p-4 text-center font-bold">
                                        {idx < 3 ? <Trophy size={iconSize} className={`${rankColor} mx-auto fill-current`} /> : <span className="text-gray-400">#{idx + 1}</span>}
                                    </td>
                                    <td className="p-4">
                                        <div className="font-bold text-gray-800 text-lg">{sub.name}</div>
                                        <div className="text-sm text-gray-500">{sub.semName}</div>
                                    </td>
                                    <td className="p-4 text-center text-gray-500 font-medium">{sub.credits}</td>
                                    <td className="p-4 text-center font-bold text-[#990000] text-lg">{sub.avg.toFixed(1)}</td>
                                    <td className="p-4 text-center font-bold text-[#003375] text-lg">{sub.scale4?.toFixed(1)}</td>
                                    <td className="p-4 text-center">
                                        <span className={`text-sm font-bold px-2 py-1 rounded border ${
                                            sub.letter.startsWith('A') ? 'bg-green-50 text-green-700 border-green-200' :
                                            sub.letter.startsWith('B') ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                            sub.letter.startsWith('C') ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                                            sub.letter.startsWith('D') ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                            'bg-red-50 text-red-700 border-red-200'
                                        }`}>
                                            {sub.letter}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                        {validSubjects.length === 0 && (
                            <tr>
                                <td colSpan={6} className="p-10 text-center text-gray-400 italic">Chưa có dữ liệu môn học</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            
             <div className="p-4 bg-gray-50 border-t text-sm text-center text-gray-500 shrink-0">
                Hiển thị {validSubjects.length} môn học đã có điểm tổng kết
             </div>
        </div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8 animate-fadeIn">
       {/* User Info Card - Expanded */}
       {data.studentName && (
        <div className="lg:col-span-4 bg-gradient-to-r from-[#003375] to-[#00509d] rounded-xl p-6 text-white shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden transition-all duration-300 hover:scale-[1.01] hover:shadow-xl group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full transform translate-x-1/2 -translate-y-1/2 group-hover:scale-110 transition-transform duration-700"></div>
            <div className="relative z-10">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    <User className="bg-white/20 p-1 rounded-full text-white" size={32} />
                    Xin chào, {data.studentName}
                </h2>
                <div className="flex flex-wrap gap-4 mt-2 text-blue-100 text-sm">
                    <span className="bg-black/20 px-3 py-1 rounded-full border border-white/10">Khóa: {data.cohort}</span>
                    <span className="bg-black/20 px-3 py-1 rounded-full border border-white/10 flex items-center gap-1">
                        <BookOpen size={14}/> {data.specializationName || data.majorName}
                    </span>
                    <span className="bg-black/20 px-3 py-1 rounded-full border border-white/10">
                        Chỉ tiêu: {totalCreditsRequired} tín chỉ
                    </span>
                </div>
            </div>
            <div className="text-right hidden md:block relative z-10">
                <p className="text-sm opacity-80 uppercase tracking-wider">Chương trình đào tạo</p>
                <p className="font-semibold text-lg">{data.programName}</p>
            </div>
        </div>
       )}

       {/* Highlights Row */}
       <div className="lg:col-span-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 relative group">
                <div className="w-12 h-12 rounded-full bg-yellow-50 text-yellow-600 flex items-center justify-center shadow-inner shrink-0">
                    <Trophy size={24} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                        <p className="text-sm text-gray-500 font-medium">Môn điểm cao nhất</p>
                        <button 
                            onClick={() => { playClick(); setShowRankingModal(true); }}
                            className="text-[10px] font-bold text-[#003375] bg-blue-50 px-2 py-0.5 rounded hover:bg-[#003375] hover:text-white transition-colors flex items-center gap-1 active:scale-95"
                        >
                            <List size={10} /> Xem tất cả
                        </button>
                    </div>
                    {highestSubject ? (
                        <div className="mt-1">
                            <p className="font-bold text-gray-800 line-clamp-1" title={highestSubject.name}>{highestSubject.name}</p>
                            <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-100">{highestSubject.avg.toFixed(1)} ({highestSubject.letter})</span>
                        </div>
                    ) : <p className="text-gray-400 text-sm mt-1">Chưa có dữ liệu</p>}
                </div>
            </div>
            
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4 hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shadow-inner shrink-0">
                    <Zap size={24} />
                </div>
                <div>
                    <p className="text-sm text-gray-500 font-medium">Học kỳ tốt nhất</p>
                    {bestSemester ? (
                        <div>
                            <p className="font-bold text-gray-800">{bestSemester.name}</p>
                            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">GPA: {bestSemester.gpa.toFixed(1)}</span>
                        </div>
                    ) : <p className="text-gray-400 text-sm">Chưa có dữ liệu</p>}
                </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4 hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-inner shrink-0">
                    <BookOpen size={24} />
                </div>
                <div>
                    <p className="text-sm text-gray-500 font-medium">Tổng môn đã học</p>
                    <div className="flex items-end gap-2">
                        <p className="font-bold text-2xl text-gray-800 leading-none">{validSubjects.length}</p>
                        <span className="text-xs text-gray-400 mb-1">môn ({stats.passedCredits} TC)</span>
                    </div>
                </div>
            </div>
       </div>

      {/* Main Stats Card & Pie Chart */}
      <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-200 transition-all duration-300 hover:scale-[1.01] hover:shadow-xl flex flex-col">
        <h2 className="text-xl font-bold text-[#003375] mb-4 flex items-center gap-2">
          <Award className="text-[#990000]" />
          Tổng quan GPA & Phân bố
        </h2>
        
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 transition-colors hover:bg-blue-100/50">
            <p className="text-sm text-[#003375] font-medium">GPA (Hệ 4)</p>
            <p className="text-3xl font-bold text-[#003375]">{stats.gpa4.toFixed(1)}</p>
          </div>
          <div className="p-4 bg-orange-50 rounded-lg border border-orange-100 transition-colors hover:bg-orange-100/50">
            <p className="text-sm text-[#990000] font-medium">GPA (Hệ 10)</p>
            <p className="text-3xl font-bold text-[#990000]">{stats.gpa10.toFixed(1)}</p>
          </div>
        </div>

        <div className="flex-1 min-h-[180px] relative">
            <h4 className="text-sm font-semibold text-gray-500 mb-2 flex items-center gap-1"><PieChartIcon size={14}/> Phân bố điểm số (A-F)</h4>
            {pieData.length > 0 ? (
                <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={pieData}
                                cx="50%"
                                cy="50%"
                                innerRadius={40}
                                outerRadius={70}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {pieData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <RechartsTooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                            <Legend verticalAlign="middle" align="right" layout="vertical" iconSize={8} wrapperStyle={{fontSize: '11px'}}/>
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            ) : (
                <div className="h-full flex items-center justify-center text-gray-400 bg-gray-50 rounded border border-dashed text-sm">
                    Chưa có dữ liệu điểm
                </div>
            )}
        </div>
      </div>

      {/* Target & Advice */}
      <div className="lg:col-span-2 flex flex-col gap-6">
        {/* Advice Box */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5">
            <h3 className="font-bold text-[#003375] mb-3 flex items-center gap-2">
                <AlertTriangle className="text-orange-500" size={20}/>
                Đánh giá & Cảnh báo
            </h3>
            
            <div className="bg-[#f0f9ff] p-3 rounded-md text-sm text-[#003375] mb-3 italic border-l-4 border-[#003375]">
                "{trendAnalysis}"
            </div>

            {failedCount > 0 ? (
            <div className="bg-red-50 text-[#990000] p-3 rounded-md text-sm mb-3 border border-red-100 font-medium">
                ⚠️ Bạn đang nợ <strong>{failedCount}</strong> môn.
            </div>
            ) : (
            <div className="bg-green-50 text-green-700 p-3 rounded-md text-sm mb-3 border border-green-100 flex items-center gap-1">
                <CheckCircle2 size={16}/> Chưa nợ môn nào. Tốt!
            </div>
            )}

            <div className={`p-3 rounded-md text-sm border ${isScholarshipEligible ? 'bg-yellow-50 text-yellow-800 border-yellow-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                <div className="font-semibold mb-1 flex items-center gap-1"><TrendingUp size={14}/> Xét học bổng:</div>
                {isScholarshipEligible 
                ? "Đủ điều kiện!" 
                : "Chưa đủ điều kiện (Cần GPA ≥ 3.2, ĐRL ≥ 80, Không rớt)."}
            </div>
        </div>

        {/* Target Box */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex-1 relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5">
            <h3 className="font-bold text-[#003375] mb-4 flex items-center gap-2 z-10 relative">
            <Target className="text-[#990000]" size={20}/>
            Dự báo Mục tiêu
            </h3>
            
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 z-10 mb-3" onClick={playClick}>
                <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-200">
                    <span className="text-sm font-medium text-gray-600">Mục tiêu GPA:</span>
                    <div className="flex items-center gap-1 group relative">
                        <input 
                            type="number"
                            min="0" max="4" step="0.1"
                            value={data.targetGPA}
                            onChange={(e) => onTargetChange(parseFloat(e.target.value) || 0)}
                            className="w-16 text-xl font-bold text-[#003375] text-right bg-transparent border-b border-dashed border-gray-300 hover:border-[#003375] focus:border-[#003375] focus:outline-none transition-colors pr-1 cursor-pointer"
                        />
                            <Pencil size={12} className="text-gray-400 absolute -right-3 top-1/2 -translate-y-1/2 opacity-50 group-hover:opacity-100 transition-opacity" />
                    </div>
                </div>
                
                {requiredAnalysis ? (
                    requiredAnalysis.isPossible ? (
                        <div>
                            <p className="text-xs text-gray-600 mb-1">Mỗi kỳ tới cần đạt:</p>
                            <div className="flex items-end gap-2 mb-2">
                                <p className={`text-3xl font-bold ${scoreClass} leading-none`}>
                                    {Math.max(0, requiredAnalysis.requiredGPA).toFixed(1)} 
                                </p>
                                <span className={`text-xs font-bold uppercase tracking-wider ${difficultyColor} border px-1 rounded bg-white`}>
                                    {difficultyText}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="text-[#990000] text-sm font-bold flex flex-col gap-1">
                            <div className="flex items-center gap-1"><AlertTriangle size={16}/> Không khả thi</div>
                            <span className="text-[10px] text-gray-500 font-normal">Mục tiêu quá cao so với số tín chỉ còn lại.</span>
                        </div>
                    )
                ) : (
                    <div className="text-center text-green-600 text-sm py-2">
                        <CheckCircle2 className="mx-auto mb-1" size={20}/>
                        Đã hoàn thành!
                    </div>
                )}
            </div>
             <div className="w-full bg-gray-200 rounded-full h-1.5 mt-auto">
                 <div 
                    className="bg-[#003375] h-1.5 rounded-full transition-all duration-500 ease-out" 
                    style={{ width: `${Math.min(100, (stats.passedCredits / totalCreditsRequired) * 100)}%` }}
                 ></div>
             </div>
             <p className="text-[10px] text-gray-500 text-right mt-1">{stats.passedCredits}/{totalCreditsRequired} TC</p>
        </div>
      </div>

      {/* Analytics Row: Top/Bottom Subjects */}
      <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-200 transition-all duration-300 hover:scale-[1.01] hover:shadow-lg">
         <h3 className="font-bold text-[#003375] mb-4 flex items-center gap-2">
            <ArrowUpRight className="text-green-600" size={20}/>
            Top Môn Học (Điểm cao nhất)
         </h3>
         <div className="space-y-2">
            {validSubjects.slice(0, 3).map((sub, i) => (
                <div key={i} className="flex justify-between items-center p-2 bg-green-50 rounded border border-green-100 hover:bg-green-100 transition-colors">
                    <div>
                        <p className="font-semibold text-gray-800 text-sm line-clamp-1">{sub.name}</p>
                        <p className="text-[10px] text-gray-500">{sub.semName}</p>
                    </div>
                    <div className="text-right">
                        <span className="block font-bold text-green-700">{sub.avg.toFixed(1)}</span>
                        <span className="text-[10px] text-green-600 font-bold bg-white px-1 rounded border border-green-200">{sub.letter}</span>
                    </div>
                </div>
            ))}
            {validSubjects.length === 0 && <p className="text-gray-400 text-sm text-center">Chưa có dữ liệu môn học.</p>}
         </div>
      </div>

      <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-200 transition-all duration-300 hover:scale-[1.01] hover:shadow-lg">
         <h3 className="font-bold text-[#003375] mb-4 flex items-center gap-2">
            <ArrowDownRight className="text-orange-600" size={20}/>
            Cần Cải Thiện (Điểm thấp nhất)
         </h3>
         <div className="space-y-2">
            {[...validSubjects].reverse().slice(0, 3).map((sub, i) => (
                <div key={i} className="flex justify-between items-center p-2 bg-orange-50 rounded border border-orange-100 hover:bg-orange-100 transition-colors">
                    <div>
                        <p className="font-semibold text-gray-800 text-sm line-clamp-1">{sub.name}</p>
                        <p className="text-[10px] text-gray-500">{sub.semName}</p>
                    </div>
                    <div className="text-right">
                        <span className="block font-bold text-orange-700">{sub.avg.toFixed(1)}</span>
                        <span className="text-[10px] text-orange-600 font-bold bg-white px-1 rounded border border-orange-200">{sub.letter}</span>
                    </div>
                </div>
            ))}
            {validSubjects.length === 0 && <p className="text-gray-400 text-sm text-center">Chưa có dữ liệu môn học.</p>}
         </div>
      </div>

      {/* Trend Chart */}
      <div className="lg:col-span-3 bg-white p-6 rounded-xl shadow-sm border border-gray-200 transition-all duration-300 hover:scale-[1.01] hover:shadow-lg">
         <h3 className="font-bold text-[#003375] mb-4 flex items-center gap-2">
            <BarChart3 className="text-[#003375]" size={20}/>
            Xu hướng học tập
         </h3>
         <div className="h-64 w-full">
            {trendData.length > 0 ? (
                 <ResponsiveContainer width="100%" height="100%">
                 <LineChart data={trendData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                   <CartesianGrid stroke="#f5f5f5" strokeDasharray="3 3" />
                   <XAxis dataKey="name" tick={{fontSize: 11, fill: '#666'}} interval={0} />
                   <YAxis domain={[0, 4]} tickCount={5} tick={{fill: '#666'}} />
                   <RechartsTooltip 
                     contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} 
                   />
                   <Legend />
                   <Line type="monotone" dataKey="gpa4" name="GPA (4)" stroke="#003375" strokeWidth={3} activeDot={{ r: 8, fill: '#003375' }} />
                   <Line type="monotone" dataKey="gpa10" name="GPA (10)" stroke="#990000" strokeWidth={2} strokeDasharray="5 5" />
                 </LineChart>
               </ResponsiveContainer>
            ) : (
                <div className="h-full flex items-center justify-center text-gray-400 bg-gray-50 rounded-lg border border-dashed">
                    Chưa có dữ liệu học kỳ để hiển thị biểu đồ.
                </div>
            )}
           
         </div>
      </div>

      <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-sm border border-gray-200 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg">
        <h3 className="font-bold text-[#003375] mb-4 flex items-center gap-2">
            <Calendar className="text-[#990000]" size={20}/>
            Tổng kết năm
        </h3>
        <div className="space-y-3 h-64 overflow-y-auto pr-1 custom-scrollbar">
            {yearlyStats.map((year) => {
                const yearClass = year.hasData ? getDegreeClassification(year.gpa4) : '---';
                return (
                    <div key={year.yearId} className="flex flex-col p-3 bg-gray-50 rounded-lg border border-gray-100 hover:border-blue-200 transition-all hover:bg-blue-50 cursor-default">
                        <div className="flex justify-between items-center mb-1">
                             <span className="font-medium text-gray-700 text-sm">{year.label}</span>
                             <div className="flex items-center gap-2">
                                 {year.hasData && (
                                    <span className="text-xs font-bold text-[#990000] bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100">
                                        {year.gpa10.toFixed(1)}
                                    </span>
                                 )}
                                 <span className={`font-bold ${year.hasData ? 'text-[#003375]' : 'text-gray-400'}`}>
                                    {year.hasData ? year.gpa4.toFixed(1) : '-'}
                                 </span>
                             </div>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                             <span className="text-gray-500">{year.totalCredits} tín chỉ</span>
                             <span className="text-gray-500">{yearClass}</span>
                        </div>
                    </div>
                );
            })}
            {yearlyStats.length === 0 && <p className="text-center text-gray-400 text-sm py-10">Chưa có dữ liệu.</p>}
        </div>
      </div>

      {showRankingModal && <RankingModal />}
    </div>
  );
};
