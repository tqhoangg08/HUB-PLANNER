import React, { useState, useEffect, useRef } from 'react';
import { UserData, Semester, STORAGE_KEY } from './types';
import { Dashboard } from './components/Dashboard';
import { SemesterTable } from './components/SemesterTable';
import { GeminiAdvisor } from './components/GeminiAdvisor';
import { Onboarding } from './components/Onboarding';
import { Handbook } from './components/Handbook';
import { EventsBoard } from './components/EventsBoard';
import { Plus, RotateCcw, FileUp, Loader2, Book, LayoutDashboard, X, ExternalLink, AlertTriangle, Zap, Download } from 'lucide-react';
import { parseHubPdf } from './utils/pdfImport';
import { exportTranscriptToPdf } from './utils/pdfExport';
import { playClick } from './utils/audio';

// Default generator if no PDF is used
const generateStandardCurriculum = (): Semester[] => {
    const semesters: Semester[] = [];
    const years = 4;
    
    for (let y = 1; y <= years; y++) {
        semesters.push({
            id: `y${y}_hk1`,
            name: `Năm ${y} - Học kỳ 1`,
            subjects: [],
            trainingScore: null
        });
        semesters.push({
            id: `y${y}_hk2`,
            name: `Năm ${y} - Học kỳ 2`,
            subjects: [],
            trainingScore: null
        });
    }
    return semesters;
};

const INITIAL_DATA: UserData = {
  studentName: '',
  cohort: '',
  programName: '',
  majorName: '',
  specializationName: '',
  totalCreditsRequired: 125, 
  hasOnboarded: false,
  semesters: generateStandardCurriculum(),
  targetGPA: 3.2, // Default target for Good degree
};

const App: React.FC = () => {
  const [data, setData] = useState<UserData>(INITIAL_DATA);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showImportGuide, setShowImportGuide] = useState(false);
  const [activeView, setActiveView] = useState<'dashboard' | 'handbook' | 'events'>('dashboard');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setData({ ...INITIAL_DATA, ...parsed });
      } catch (e) {
        console.error("Failed to load data", e);
      }
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  }, [data, isLoaded]);

  const addSemester = () => {
    playClick();
    const newSem: Semester = {
      id: Date.now().toString(),
      name: `Học kỳ Mới`,
      subjects: [],
      trainingScore: null
    };
    setData(prev => ({ ...prev, semesters: [...prev.semesters, newSem] }));
  };

  const updateSemester = (index: number, updatedSem: Semester) => {
    const newSemesters = [...data.semesters];
    newSemesters[index] = updatedSem;
    setData(prev => ({ ...prev, semesters: newSemesters }));
  };

  const removeSemester = (index: number) => {
    playClick();
    if (window.confirm("Bạn có chắc muốn xóa học kỳ này không?")) {
        const newSemesters = data.semesters.filter((_, i) => i !== index);
        setData(prev => ({ ...prev, semesters: newSemesters }));
    }
  };

  const resetData = () => {
      playClick();
      if (window.confirm("Thao tác này sẽ xóa toàn bộ dữ liệu. Bạn có chắc không?")) {
        setData(INITIAL_DATA);
        localStorage.removeItem(STORAGE_KEY);
      }
  };

  const handleOnboardingComplete = (onboardingData: Partial<UserData>) => {
      setData(prev => ({
          ...prev,
          ...onboardingData,
          hasOnboarded: true
      }));
  };

  const handleExportPDF = () => {
      playClick();
      exportTranscriptToPdf(data);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setShowImportGuide(false);
    setIsImporting(true);
    try {
        const result = await parseHubPdf(file);
        
        setData(prev => {
            const newData = { ...prev };
            // Merge student info
            if (!newData.studentName && result.studentInfo.studentName) {
                newData.studentName = result.studentInfo.studentName!;
            }
            if (!newData.majorName && result.studentInfo.majorName) {
                newData.majorName = result.studentInfo.majorName!;
            }

            // --- SMART TIMELINE RECONSTRUCTION ---
            let startYear = new Date().getFullYear();
            if (result.yearRanges.length > 0) {
                startYear = Math.min(...result.yearRanges.map(y => y.start));
            }

            const reconstructSemesters: Semester[] = [];
            const importedSemesters = result.semesters;

            for (let i = 0; i < 4; i++) {
                const curStart = startYear + i;
                const curEnd = curStart + 1;
                const yearLabel = `Năm học ${curStart}-${curEnd}`;
                
                const sem1Id = `imported_${curStart}_${curEnd}_hk1`;
                const importedSem1 = importedSemesters.find(s => s.id === sem1Id);
                
                if (importedSem1) {
                    reconstructSemesters.push(importedSem1);
                } else {
                    reconstructSemesters.push({
                        id: `generated_${curStart}_hk1`,
                        name: `${yearLabel} - Học kỳ 1`,
                        subjects: [],
                        trainingScore: null
                    });
                }

                const sem2Id = `imported_${curStart}_${curEnd}_hk2`;
                const importedSem2 = importedSemesters.find(s => s.id === sem2Id);
                
                if (importedSem2) {
                    reconstructSemesters.push(importedSem2);
                } else {
                    reconstructSemesters.push({
                        id: `generated_${curStart}_hk2`,
                        name: `${yearLabel} - Học kỳ 2`,
                        subjects: [],
                        trainingScore: null
                    });
                }

                const otherSems = importedSemesters.filter(s => 
                    s.id.startsWith(`imported_${curStart}_${curEnd}`) && 
                    !s.id.endsWith('hk1') && 
                    !s.id.endsWith('hk2')
                );

                if (otherSems.length > 0) {
                    reconstructSemesters.push(...otherSems);
                }
            }

            const standardIds = reconstructSemesters.map(s => s.id);
            const leftOvers = importedSemesters.filter(s => !standardIds.includes(s.id));
            reconstructSemesters.push(...leftOvers);

            return {
                ...newData,
                semesters: reconstructSemesters,
                hasOnboarded: true
            };
        });
        alert(`Đã nhập thành công và sắp xếp lại lộ trình học tập từ năm ${result.yearRanges[0]?.start || '...'}`);
    } catch (error) {
        console.error(error);
        alert("Lỗi khi đọc file PDF.");
    } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const ImportGuideModal = () => (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-scaleIn border border-gray-200">
            <div className="bg-[#003375] p-4 flex justify-between items-center text-white">
                <h3 className="font-bold text-lg flex items-center gap-2">
                    <FileUp size={20} /> Hướng dẫn lấy file bảng điểm
                </h3>
                <button 
                    onClick={() => { playClick(); setShowImportGuide(false); }} 
                    className="hover:bg-white/20 p-2 rounded-full transition-colors"
                >
                    <X size={20} />
                </button>
            </div>
            
            <div className="p-6 space-y-6">
                <div className="space-y-4">
                    <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-[#003375] font-bold flex items-center justify-center flex-shrink-0">1</div>
                        <div>
                            <p className="font-medium text-gray-900 mb-1">Truy cập Hub Portal</p>
                            <a 
                                href="https://online.hub.edu.vn" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-[#003375] underline flex items-center gap-1 hover:text-blue-700 text-sm font-semibold"
                                onClick={playClick}
                            >
                                https://online.hub.edu.vn <ExternalLink size={14}/>
                            </a>
                        </div>
                    </div>
                    
                    <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-[#003375] font-bold flex items-center justify-center flex-shrink-0">2</div>
                        <div>
                            <p className="font-medium text-gray-900">Đăng nhập tài khoản sinh viên</p>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-[#003375] font-bold flex items-center justify-center flex-shrink-0">3</div>
                        <div>
                            <p className="font-medium text-gray-900">Vào mục "Xem điểm"</p>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-[#003375] font-bold flex items-center justify-center flex-shrink-0">4</div>
                        <div>
                            <p className="font-medium text-gray-900">Bấm tổ hợp phím <span className="bg-gray-100 px-2 py-0.5 rounded border border-gray-300 font-mono text-sm text-[#990000]">CTRL + P</span></p>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-[#003375] font-bold flex items-center justify-center flex-shrink-0">5</div>
                        <div>
                            <p className="font-medium text-gray-900">Tại hộp thoại in, chọn "Lưu dưới dạng PDF" (Save as PDF) và bấm Lưu</p>
                        </div>
                    </div>
                </div>

                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex gap-3 items-start text-sm text-orange-800">
                    <AlertTriangle size={20} className="shrink-0 mt-0.5" />
                    <p>
                        <strong>Lưu ý:</strong> Có thể sai sót khi hệ thống nhận diện tên học phần. 
                        Điểm quá trình sẽ được hệ thống random vì file PDF chỉ hiện điểm trung bình, 
                        nên nếu nhập bảng điểm vào thì bạn đừng quan tâm điểm quá trình nhé.
                    </p>
                </div>

                <div className="pt-4 border-t border-gray-100 flex gap-3">
                    <button 
                        onClick={() => { playClick(); setShowImportGuide(false); }}
                        className="flex-1 py-3 text-gray-600 font-medium hover:bg-gray-50 rounded-xl transition-colors"
                    >
                        Để sau
                    </button>
                    <button 
                        onClick={() => { playClick(); fileInputRef.current?.click(); }}
                        className="flex-1 bg-[#990000] text-white py-3 rounded-xl font-bold hover:bg-[#7a0000] transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-xl active:scale-95"
                    >
                        <FileUp size={18}/>
                        Chọn file PDF
                    </button>
                </div>
            </div>
        </div>
    </div>
  );

  if (!isLoaded) return null;

  if (!data.hasOnboarded) {
      return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className="min-h-screen pb-24 font-sans text-gray-800 bg-[#f8f9fa] animate-fadeIn">
      {/* Header */}
      <header className="bg-white border-b-2 border-[#003375] sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
          <div className="flex items-center gap-3">
             {/* HUB Logo */}
             <div className="h-10 w-10 relative flex-shrink-0 group cursor-pointer" onClick={playClick}>
                <img 
                    src="https://upload.wikimedia.org/wikipedia/vi/1/1a/Logo_HUB.png" 
                    alt="HUB Logo" 
                    className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-110"
                    onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.parentElement!.innerHTML = '<div class="h-10 w-10 bg-[#003375] rounded flex items-center justify-center text-white font-bold text-xs">HUB</div>';
                    }}
                />
             </div>
             <div>
                <h1 className="text-xl font-bold text-[#003375] tracking-tight uppercase">HUB Planner</h1>
                <p className="text-[10px] text-gray-500 hidden md:block uppercase tracking-wider font-semibold text-[#990000]">Hỗ trợ sinh viên (Không chính thức từ nhà Trường)</p>
             </div>
          </div>
          
          <div className="flex items-center gap-2 md:gap-4">
             {/* Navigation Tabs */}
             <div className="flex bg-gray-100 rounded-lg p-1 gap-1 overflow-x-auto max-w-[200px] sm:max-w-none no-scrollbar">
                <button 
                    onClick={() => { playClick(); setActiveView('dashboard'); }}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${activeView === 'dashboard' ? 'bg-white text-[#003375] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <LayoutDashboard size={16} />
                    <span className="hidden sm:inline">Bảng điểm</span>
                </button>
                <button 
                    onClick={() => { playClick(); setActiveView('events'); }}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${activeView === 'events' ? 'bg-white text-[#003375] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <Zap size={16} />
                    <span className="hidden sm:inline">Sự kiện ĐRL</span>
                </button>
                <button 
                    onClick={() => { playClick(); setActiveView('handbook'); }}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${activeView === 'handbook' ? 'bg-white text-[#003375] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <Book size={16} />
                    <span className="hidden sm:inline">Cẩm nang</span>
                </button>
             </div>

             {/* Simple User Profile Trigger/Reset */}
             <div className="flex items-center gap-2 border-l border-gray-300 pl-4 ml-2">
                <div className="text-right hidden sm:block">
                    <p className="text-xs font-bold text-[#003375] uppercase">{data.studentName}</p>
                    <p className="text-[10px] text-gray-500">{data.cohort}</p>
                </div>
                <button 
                    onClick={resetData} 
                    className="p-2 text-gray-400 hover:text-[#990000] hover:bg-red-50 rounded-full transition-all duration-300 transform hover:rotate-180 active:scale-90" 
                    title="Reset Data"
                >
                    <RotateCcw size={20} />
                </button>
             </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {activeView === 'handbook' && <Handbook />}
        {activeView === 'events' && <EventsBoard />}
        {activeView === 'dashboard' && (
            <div className="animate-slideInRight">
                <Dashboard 
                data={data} 
                onTargetChange={(newTarget) => setData(prev => ({...prev, targetGPA: newTarget}))}
                />

                <div className="flex flex-col sm:flex-row justify-between items-end mb-4 gap-4">
                    <h2 className="text-2xl font-bold text-[#003375] border-l-4 border-[#990000] pl-3">Chi tiết bảng điểm</h2>
                    
                    <div className="flex gap-2">
                        {/* Export PDF Button */}
                        <button 
                            onClick={handleExportPDF}
                            className="bg-white hover:bg-gray-50 text-[#003375] border border-gray-200 px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 transition-all duration-200 active:scale-95 text-sm font-medium hover:shadow-md hover:scale-105"
                        >
                            <Download size={18} />
                            Xuất PDF
                        </button>

                        {/* Import PDF Button */}
                        <div>
                            <input 
                                type="file" 
                                accept=".pdf" 
                                ref={fileInputRef}
                                className="hidden"
                                onChange={handleFileUpload}
                            />
                            <button 
                                onClick={() => { playClick(); setShowImportGuide(true); }}
                                disabled={isImporting}
                                className="bg-[#990000] hover:bg-[#7a0000] text-white px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 transition-all duration-200 active:scale-95 text-sm font-medium disabled:opacity-70 hover:shadow-lg hover:scale-105"
                            >
                                {isImporting ? <Loader2 className="animate-spin" size={18}/> : <FileUp size={18} />}
                                Nhập PDF
                            </button>
                        </div>

                        <button 
                            onClick={addSemester}
                            className="bg-[#003375] hover:bg-[#002855] text-white px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 transition-all duration-200 active:scale-95 hover:shadow-md text-sm font-medium hover:scale-105"
                        >
                            <Plus size={18} />
                            Thêm học kỳ
                        </button>
                    </div>
                </div>

                <div className="space-y-6">
                {data.semesters.map((sem, idx) => (
                    <SemesterTable 
                    key={sem.id} 
                    semester={sem} 
                    index={idx}
                    onUpdateSemester={(updated) => updateSemester(idx, updated)}
                    onRemoveSemester={() => removeSemester(idx)}
                    />
                ))}
                
                {data.semesters.length === 0 && (
                    <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300 hover:shadow-md transition-shadow">
                        <p className="text-gray-400 mb-4">Chưa có dữ liệu học kỳ nào.</p>
                        <div className="flex justify-center gap-4">
                            <button onClick={() => { playClick(); setShowImportGuide(true); }} className="text-[#003375] font-medium hover:underline flex items-center gap-1 hover:scale-105 transition-transform">
                                <FileUp size={16}/> Nhập từ PDF
                            </button>
                            <span className="text-gray-300">|</span>
                            <button onClick={addSemester} className="text-[#990000] font-medium hover:underline flex items-center gap-1 hover:scale-105 transition-transform">
                                <Plus size={16}/> Tạo thủ công
                            </button>
                        </div>
                    </div>
                )}
                </div>
            </div>
        )}
      </main>

      <footer className="text-center py-4 text-[10px] text-gray-400/60 font-medium tracking-wide hover:text-gray-400/80 transition-colors">
        Web designed by tqhoangg
      </footer>

      <GeminiAdvisor data={data} />
      
      {showImportGuide && <ImportGuideModal />}
    </div>
  );
};

export default App;