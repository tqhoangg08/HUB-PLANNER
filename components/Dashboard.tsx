import React, { useState } from 'react';
import { createPortal } from 'react-dom'; 
import { SubjectRankingModal } from './SubjectRankingModal';
import { UserData, GradeStatus, Subject } from '../types';
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
import { Target, AlertTriangle, Award, User, BookOpen, BarChart3, Calendar, CheckCircle2, Pencil, Trophy, Zap, PieChart as PieChartIcon, List, ChevronRight, X } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { playClick } from '../utils/audio';
import { AdsBanner } from './AdsBanner';
import SchoolAnnouncements from './SchoolAnnouncements';

// --- SUB-COMPONENT: FAILED SUBJECTS MODAL ---
const FailedSubjectsModal = ({ subjects, onClose }: { subjects: Subject[], onClose: () => void }) => {
    return createPortal(
        <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn" onClick={onClose}>
            <div className="bg-white rounded-xl w-full max-w-md flex flex-col shadow-2xl animate-scaleIn overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="bg-red-50 p-4 border-b border-red-100 flex justify-between items-center">
                    <h3 className="font-bold text-red-700 flex items-center gap-2 text-lg">
                        <AlertTriangle size={20} /> Danh sách môn chưa đạt ({subjects.length})
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-red-100 rounded-full text-red-500 transition-colors"><X size={20} /></button>
                </div>
                <div className="p-4 overflow-y-auto max-h-[60vh] custom-scrollbar">
                    <div className="space-y-3">
                        {subjects.map((sub, idx) => {
                             const avg = calculateSubjectAverage(sub);
                             return (
                                <div key={idx} className="bg-white border border-red-100 rounded-lg p-3 shadow-sm flex justify-between items-center hover:border-red-300 transition-colors">
                                    <div>
                                        <p className="font-bold text-gray-800 text-sm">{sub.name}</p>
                                        <div className="flex gap-3 mt-1 text-xs text-gray-500">
                                            <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{sub.credits} tín chỉ</span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="block text-xl font-bold text-red-600">{avg?.toFixed(1) || '0.0'}</span>
                                        <span className="text-[10px] text-red-400 font-bold bg-red-50 px-1.5 py-0.5 rounded">RỚT MÔN</span>
                                    </div>
                                </div>
                             )
                        })}
                    </div>
                </div>
                <div className="p-3 border-t border-gray-100 bg-gray-50 text-center">
                    <button onClick={onClose} className="w-full py-2 bg-[#003375] text-white rounded-lg font-bold text-sm hover:bg-[#002855] transition-colors">Đóng</button>
                </div>
            </div>
        </div>, document.body
    );
};

// --- SUB-COMPONENT: YEARLY STATS MODAL ---
const YearlyStatsModal = ({ stats, onClose }: { stats: any[], onClose: () => void }) => {
    return createPortal(
        <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn" onClick={onClose}>
            <div className="bg-white rounded-xl w-full max-w-md flex flex-col shadow-2xl animate-scaleIn overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="bg-blue-50 p-4 border-b border-blue-100 flex justify-between items-center">
                    <h3 className="font-bold text-[#003375] flex items-center gap-2 text-lg">
                        <Calendar size={20} /> Tổng kết từng năm học
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-blue-100 rounded-full text-blue-500 transition-colors"><X size={20} /></button>
                </div>
                <div className="p-4 overflow-y-auto max-h-[60vh] custom-scrollbar">
                    <div className="space-y-3">
                        {stats.map((year) => {
                            const yearClass = year.hasData ? getDegreeClassification(year.gpa4) : '-';
                            return (
                                <div key={year.yearId} className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm hover:border-blue-300 transition-colors">
                                    <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-100">
                                        <span className="font-bold text-[#003375] text-sm">{year.label}</span>
                                        <span className={`font-bold text-base ${year.hasData ? 'text-[#003375]' : 'text-gray-400'}`}>
                                            GPA: {year.hasData ? year.gpa4.toFixed(2) : '-'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs text-gray-600">
                                        <div className="flex gap-2">
                                            <span className="bg-gray-100 px-2 py-0.5 rounded">TC: {year.totalCredits}</span>
                                            <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded border border-green-100">Đạt: {year.passedCredits}</span>
                                        </div>
                                        <span className="font-medium text-blue-600">{yearClass}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
                <div className="p-3 border-t border-gray-100 bg-gray-50 text-center">
                    <button onClick={onClose} className="w-full py-2 bg-[#003375] text-white rounded-lg font-bold text-sm hover:bg-[#002855] transition-colors">Đóng</button>
                </div>
            </div>
        </div>, document.body
    );
};

// ---------------------------------------------

interface DashboardProps {
    data: UserData;
    onTargetChange: (newTarget: number) => void;
    showSecurityNotice: boolean;
}

export const Dashboard: React.FC<DashboardProps> = ({ data, onTargetChange, showSecurityNotice }) => {
    const [showRankingModal, setShowRankingModal] = useState(false);
    const [showFailedModal, setShowFailedModal] = useState(false);
    // State cho modal tổng kết năm
    const [showYearlyModal, setShowYearlyModal] = useState(false);

    const stats = calculateCumulativeStats(data.semesters);
    const yearlyStats = calculateYearlyStats(data.semesters);
    // const classification = getDegreeClassification(stats.gpa4); // Unused variable
    const trendAnalysis = analyzeTrend(data.semesters);

    // --- ANALYTICS CALCULATIONS ---
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
        { name: 'Giỏi/Xuất sắc (A)', value: gradeDist['A'] || 0, color: '#22c55e' },
        { name: 'Khá (B)', value: gradeDist['B'] || 0, color: '#3b82f6' },
        { name: 'Trung bình (C)', value: gradeDist['C'] || 0, color: '#eab308' },
        { name: 'Yếu (D)', value: gradeDist['D'] || 0, color: '#f97316' },
        { name: 'Rớt (F)', value: gradeDist['F'] || 0, color: '#ef4444' },
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

    return (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-8 animate-fadeIn">
            <AdsBanner />
            {showSecurityNotice && (
                <div className="lg:col-span-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 shadow-sm">
                    <AlertTriangle className="text-amber-600 shrink-0 mt-1" size={20} />
                    <div className="text-sm text-amber-800 leading-relaxed">
                        <span className="font-bold">Lưu ý bảo mật:</span> Điểm số của bạn chỉ được lưu cục bộ trên thiết bị của bạn đang sử dụng (Local Storage). Hệ thống KHÔNG gửi hay lưu trữ thông tin này về máy chủ, nên Admin/CTV hoàn toàn không xem được. Nếu bạn đang dùng thiết bị công cộng (quán net, thư viện, của bạn bè...), vui lòng nhớ bấm nút <span className="font-bold">Xóa dữ liệu</span> (Reset) ở góc phải màn hình trước khi rời đi để bảo mật thông tin.                    </div>
                </div>
            )}

            {/* User Info Card */}
            {data.studentName && (
                <div className="lg:col-span-4 bg-gradient-to-r from-[#003375] to-[#00509d] rounded-xl p-5 text-white shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden transition-all duration-300 hover:scale-[1.005] hover:shadow-lg group">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full transform translate-x-1/2 -translate-y-1/2 group-hover:scale-110 transition-transform duration-700"></div>
                    <div className="relative z-10">
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <User className="bg-white/20 p-1 rounded-full text-white" size={28} />
                            Xin chào, {data.studentName}
                        </h2>
                        <div className="flex flex-wrap gap-3 mt-2 text-blue-100 text-xs sm:text-sm">
                            <span className="bg-black/20 px-3 py-1 rounded-full border border-white/10">Khóa: {data.cohort}</span>
                            <span className="bg-black/20 px-3 py-1 rounded-full border border-white/10 flex items-center gap-1">
                                <BookOpen size={14} /> {data.specializationName || data.majorName}
                            </span>
                            <span className="bg-black/20 px-3 py-1 rounded-full border border-white/10">
                                Chỉ tiêu: {totalCreditsRequired} tín chỉ
                            </span>
                        </div>
                    </div>
                    <div className="text-right hidden md:block relative z-10">
                        <p className="text-xs opacity-80 uppercase tracking-wider">Chương trình đào tạo</p>
                        <p className="font-semibold text-base">{data.programName}</p>
                    </div>
                </div>
            )}

            {/* Highlights Row */}
            <div className="lg:col-span-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3 hover:shadow-md transition-all duration-300 relative group">
                    <div className="w-10 h-10 rounded-full bg-yellow-50 text-yellow-600 flex items-center justify-center shadow-inner shrink-0">
                        <Trophy size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                            <p className="text-xs text-gray-500 font-medium">Điểm cao nhất</p>
                            <button
                                onClick={() => { playClick(); setShowRankingModal(true); }}
                                className="text-[10px] font-bold text-[#003375] bg-blue-50 px-2 py-0.5 rounded hover:bg-[#003375] hover:text-white transition-colors flex items-center gap-1 active:scale-95"
                            >
                                <List size={10} /> Xem tất cả
                            </button>
                        </div>
                        {highestSubject ? (
                            <div className="mt-0.5">
                                <p className="font-bold text-gray-800 line-clamp-1 text-sm" title={highestSubject.name}>{highestSubject.name}</p>
                                <span className="text-[10px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full border border-green-100">{highestSubject.avg.toFixed(1)} ({highestSubject.letter})</span>
                            </div>
                        ) : <p className="text-gray-400 text-xs mt-1">Chưa có dữ liệu</p>}
                    </div>
                </div>

                <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3 hover:shadow-md transition-all duration-300">
                    <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shadow-inner shrink-0">
                        <Zap size={20} />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 font-medium">Học kỳ tốt nhất</p>
                        {bestSemester ? (
                            <div>
                                <p className="font-bold text-gray-800 text-sm line-clamp-1">{bestSemester.name}</p>
                                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">GPA: {bestSemester.gpa.toFixed(1)}</span>
                            </div>
                        ) : <p className="text-gray-400 text-xs">Chưa có dữ liệu</p>}
                    </div>
                </div>

                <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3 hover:shadow-md transition-all duration-300">
                    <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-inner shrink-0">
                        <BookOpen size={20} />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 font-medium">Tổng môn đã học</p>
                        <div className="flex items-end gap-1">
                            <p className="font-bold text-xl text-gray-800 leading-none">{validSubjects.length}</p>
                            <span className="text-[10px] text-gray-400 mb-0.5">môn ({stats.passedCredits} TC)</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ==================== GPA SECTION (ĐÃ FIX BIỂU ĐỒ) ==================== */}
            <div className="lg:col-span-2 bg-white p-4 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-all duration-300 flex flex-col justify-between h-[190px]"> {/* Đặt chiều cao cố định cho container */}
                <h2 className="text-base font-bold text-[#003375] mb-2 flex items-center gap-2 shrink-0">
                    <Award className="text-[#990000]" size={18} />
                    GPA toàn khóa & Phân bố
                </h2>

                {/* Container chính: Flex row, full height */}
                <div className="flex items-start gap-2 h-full w-full">
                    
                    {/* Cột trái: Điểm số (Chiếm 40%) */}
                    <div className="w-[30%] flex flex-col gap-2 justify-center">
                        <div className="px-3 py-2 bg-blue-50 rounded-lg border border-blue-100 flex flex-col justify-center text-center">
                            <span className="text-[10px] text-[#003375] font-semibold uppercase opacity-80">GPA (Hệ 4)</span>
                            <span className="text-3xl font-bold text-[#003375] leading-none mt-1">{stats.gpa4.toFixed(2)}</span>
                        </div>
                        <div className="px-3 py-2 bg-orange-50 rounded-lg border border-orange-100 flex flex-col justify-center text-center">
                            <span className="text-[10px] text-[#990000] font-semibold uppercase opacity-80">GPA (Hệ 10)</span>
                            <span className="text-3xl font-bold text-[#990000] leading-none mt-1">{stats.gpa10.toFixed(2)}</span>
                        </div>
                    </div>

                    {/* Cột phải: Biểu đồ tròn (Chiếm 60%) - Quan trọng: min-height và min-width */}
                    <div className="w-[60%] h-full relative min-h-[160px]">
                        {pieData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={30}
                                        outerRadius={55}
                                        paddingAngle={4}
                                        dataKey="value"
                                    >
                                        {pieData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={1} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip 
                                        contentStyle={{ borderRadius: '8px', fontSize: '12px', padding: '4px 8px', border: 'none', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }} 
                                        itemStyle={{ padding: 0 }}
                                    />
                                    <Legend 
                                        layout="vertical" 
                                        verticalAlign="middle" 
                                        align="right"
                                        iconSize={8}
                                        wrapperStyle={{ fontSize: '10px', lineHeight: '14px', right: 0 }} 
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full w-full flex items-center justify-center text-gray-300 text-xs border border-dashed border-gray-200 rounded-lg bg-gray-50/50">
                                Chưa có dữ liệu
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="lg:col-span-2 bg-white p-4 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-all duration-300">
                <h3 className="text-base font-bold text-[#003375] mb-3 flex items-center gap-2">
                    <BarChart3 className="text-[#003375]" size={18} />
                    Xu hướng học tập
                </h3>
                {/* Giảm chiều cao biểu đồ đường xuống h-48 */}
                <div className="h-37 w-full">
                    {trendData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={trendData} margin={{ top: 5, right: 10, bottom: -10, left: -20 }}>
                                <CartesianGrid stroke="#f5f5f5" strokeDasharray="3 3" />
                                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#666' }} interval={0} />
                                <YAxis domain={[0, 10]} tickCount={5} tick={{ fontSize: 10, fill: '#666' }} />
                                <RechartsTooltip contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                                <Legend wrapperStyle={{ fontSize: '10px' }}/>
                                <Line type="monotone" dataKey="gpa4" name="GPA (4)" stroke="#003375" strokeWidth={2} activeDot={{ r: 6 }} />
                                <Line type="monotone" dataKey="gpa10" name="GPA (10)" stroke="#990000" strokeWidth={2} strokeDasharray="4 4" />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex items-center justify-center text-gray-300 text-xs border border-dashed rounded-lg">
                            Chưa có dữ liệu học kỳ.
                        </div>
                    )}
                </div>
            </div>

            {/* ==================== BOTTOM ROW ==================== */}
            
            {/* CONTAINER CHUNG VỚI CHIỀU CAO CỐ ĐỊNH 350px (GIẢM TỪ 400px ĐỂ CẮT BỚT KHOẢNG TRẮNG) */}
            <div className="lg:col-span-4 grid grid-cols-1 lg:grid-cols-2 gap-4 h-[350px]">
                
                {/* LEFT COLUMN: School Announcements */}
                {/* overflow-hidden để bo tròn góc của header sticky bên trong */}
                <div className="flex flex-col h-full rounded-xl overflow-hidden shadow-sm border border-gray-200 bg-white">
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                         <SchoolAnnouncements />
                    </div>
                </div>

                {/* RIGHT COLUMN */}
                <div className="flex flex-col gap-3 h-full">
                    
                    {/* Row 1: Target & Yearly (Height 40 ~ 160px) */}
                    <div className="grid grid-cols-2 gap-3 h-40 shrink-0"> 
                        {/* Target Forecast */}
                        <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-200 flex flex-col relative overflow-hidden h-full">
                            <h3 className="font-bold text-[#003375] mb-1 flex items-center gap-1.5 z-10 relative text-xs uppercase tracking-wide">
                                <Target className="text-[#990000]" size={14} />
                                Dự báo Mục tiêu
                            </h3>

                            <div className="bg-gray-50 p-2 rounded-lg border border-gray-200 z-10 mb-1 flex-1 flex flex-col justify-center" onClick={playClick}>
                                <div className="flex justify-between items-center mb-0.5 pb-0.5 border-b border-gray-200">
                                    <span className="text-[10px] font-medium text-gray-600">Đặt:</span>
                                    <div className="flex items-center gap-1 group relative">
                                        <input
                                            type="number"
                                            min="0" max="4" step="0.1"
                                            value={data.targetGPA}
                                            onChange={(e) => onTargetChange(parseFloat(e.target.value) || 0)}
                                            className="w-12 text-sm font-bold text-[#003375] text-right bg-transparent border-b border-dashed border-gray-300 hover:border-[#003375] focus:border-[#003375] focus:outline-none transition-colors pr-0.5 cursor-pointer"
                                        />
                                        <Pencil size={8} className="text-gray-400 absolute -right-2 top-1/2 -translate-y-1/2 opacity-50 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                </div>

                                {requiredAnalysis ? (
                                    requiredAnalysis.isPossible ? (
                                        <div>
                                            <p className="text-[9px] text-gray-500 mb-0">Mỗi kỳ cần:</p>
                                            <div className="flex flex-col">
                                                <p className={`text-lg font-bold ${scoreClass} leading-none mb-0.5`}>
                                                    {Math.max(0, requiredAnalysis.requiredGPA).toFixed(1)}
                                                </p>
                                                <span className={`text-[8px] font-bold uppercase tracking-wider ${difficultyColor} border px-1 rounded bg-white w-fit`}>
                                                    {difficultyText}
                                                </span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-[#990000] text-[10px] font-bold flex flex-col gap-0.5">
                                            <div className="flex items-center gap-1"><AlertTriangle size={12} /> Không khả thi</div>
                                        </div>
                                    )
                                ) : (
                                    <div className="text-center text-green-600 text-[10px] py-1">
                                        Đã xong!
                                    </div>
                                )}
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-1 mt-auto">
                                <div
                                    className="bg-[#003375] h-1 rounded-full transition-all duration-500 ease-out"
                                    style={{ width: `${Math.min(100, (stats.passedCredits / totalCreditsRequired) * 100)}%` }}
                                ></div>
                            </div>
                            <p className="text-[8px] text-gray-500 text-right mt-0.5">{stats.passedCredits}/{totalCreditsRequired} TC</p>
                        </div>

                        {/* Yearly Summary - UPDATED */}
                        <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-200 flex flex-col h-full overflow-hidden">
                            <h3 className="font-bold text-[#003375] mb-1 flex items-center gap-1.5 text-xs uppercase tracking-wide">
                                <Calendar className="text-[#990000]" size={14} />
                                Tổng kết năm
                            </h3>
                            <div className="space-y-1.5 overflow-y-auto custom-scrollbar flex-1 pr-1">
                                {yearlyStats.length === 0 && <p className="text-center text-gray-400 text-[10px] py-4">Chưa có dữ liệu.</p>}
                                
                                {/* Chỉ hiện tối đa 3 năm đầu */}
                                {yearlyStats.slice(0, 3).map((year) => {
                                    const yearClass = year.hasData ? getDegreeClassification(year.gpa4) : '-';
                                    return (
                                        <div key={year.yearId} className="flex flex-col p-1.5 bg-gray-50 rounded border border-gray-100 hover:border-blue-200 transition-all hover:bg-blue-50 cursor-default">
                                            <div className="flex justify-between items-center mb-0.5">
                                                <span className="font-medium text-gray-700 text-[10px]">{year.label.replace('Năm học', 'NH')}</span>
                                                <span className={`font-bold text-[10px] ${year.hasData ? 'text-[#003375]' : 'text-gray-400'}`}>
                                                    {year.hasData ? year.gpa4.toFixed(1) : '-'}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center text-[8px]">
                                                <span className="text-gray-500">{year.totalCredits} TC</span>
                                                <span className="text-gray-500 truncate max-w-[50px]" title={yearClass}>{yearClass}</span>
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* Nút xem thêm nếu > 3 năm */}
                                {yearlyStats.length > 3 && (
                                    <button 
                                        onClick={() => { playClick(); setShowYearlyModal(true); }}
                                        className="w-full text-center text-[9px] text-blue-600 hover:text-blue-800 font-medium mt-0.5 flex items-center justify-center gap-1 hover:underline"
                                    >
                                        <ChevronRight size={10}/> Xem thêm ({yearlyStats.length - 3} năm khác)
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Row 2: Advice Box (Fills remaining height) */}
                    <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-200 flex-1 min-h-0 flex flex-col overflow-hidden">
                        <h3 className="font-bold text-[#003375] mb-1.5 flex items-center gap-2 text-xs uppercase tracking-wide">
                            <AlertTriangle className="text-orange-500" size={14} />
                            Đánh giá & Cảnh báo
                        </h3>

                        <div className="bg-[#f0f9ff] p-2 rounded-md text-[11px] text-[#003375] mb-2 italic border-l-4 border-[#003375] line-clamp-2 shrink-0">
                            "{trendAnalysis}"
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {failedCount > 0 ? (
                                <div className="bg-red-50 text-[#990000] p-1.5 rounded-md text-[11px] mb-1.5 border border-red-100 font-medium flex items-center gap-1">
                                    ⚠️ Nợ <strong>{failedCount}</strong> môn.
                                </div>
                            ) : (
                                <div className="bg-green-50 text-green-700 p-1.5 rounded-md text-[11px] mb-1.5 border border-green-100 flex items-center gap-1">
                                    <CheckCircle2 size={12} /> Chưa nợ môn nào.
                                </div>
                            )}

                            {/* FAILED SUBJECTS LIST - UPDATED LOGIC */}
                            <div className="p-1.5 rounded-md text-sm border bg-white">
                                <div className="font-semibold mb-1 flex items-center gap-1 text-gray-700 text-[10px]">
                                    <List size={10} className="text-red-500"/> Chi tiết:
                                </div>
                                {failedSubjectsList.length === 0 ? (
                                    <p className="text-gray-500 italic text-[10px] pl-1">Không có (Quá tuyệt vời! 🎉)</p>
                                ) : (
                                    <div className="space-y-1">
                                        {/* Luôn luôn chỉ hiện tối đa 3 môn ở đây */}
                                        {failedSubjectsList.slice(0, 3).map((sub, idx) => {
                                            const avg = calculateSubjectAverage(sub);
                                            return (
                                                <div key={idx} className="flex justify-between items-center text-[10px] bg-red-50 text-red-700 px-1.5 py-0.5 rounded border border-red-100">
                                                    <span className="truncate flex-1 mr-1" title={sub.name}>{sub.name}</span>
                                                    <span className="font-bold shrink-0">{avg?.toFixed(1) || '0.0'}</span>
                                                </div>
                                            );
                                        })}
                                        
                                        {/* Nếu nhiều hơn 3 môn thì hiện nút Xem thêm (mở Modal) */}
                                        {failedSubjectsList.length > 3 && (
                                            <button 
                                                onClick={() => { playClick(); setShowFailedModal(true); }}
                                                className="w-full text-center text-[9px] text-blue-600 hover:text-blue-800 font-medium mt-0.5 flex items-center justify-center gap-1 hover:underline"
                                            >
                                                <ChevronRight size={10}/> Xem thêm ({failedSubjectsList.length - 3} môn khác)
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {showRankingModal && <SubjectRankingModal subjects={validSubjects} onClose={() => setShowRankingModal(false)} />}
            {/* Modal hiển thị danh sách nợ môn */}
            {showFailedModal && <FailedSubjectsModal subjects={failedSubjectsList} onClose={() => setShowFailedModal(false)} />}
            {/* Modal hiển thị tổng kết năm */}
            {showYearlyModal && <YearlyStatsModal stats={yearlyStats} onClose={() => setShowYearlyModal(false)} />}
        </div>
    );
};