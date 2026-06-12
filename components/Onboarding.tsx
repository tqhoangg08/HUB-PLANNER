import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom'; 
import { UserData } from '../types';
import { ACADEMIC_PROGRAMS, Program, Major, Specialization, getMajors } from '../utils/programs';
import { Check, ChevronRight, User, BookOpen, GraduationCap, ArrowLeft, Calendar } from 'lucide-react';
import { playClick } from '../utils/audio';
import { supabase } from '../utils/supabase';

// --- Imports cho hiệu ứng hạt ---
import Particles from "react-particles";
import { loadSlim } from "tsparticles-slim";
import type { Engine, ISourceOptions } from "tsparticles-engine";

interface OnboardingProps {
  onComplete: (data: Partial<UserData>) => void;
  initialData?: Partial<UserData>;
}

const COHORT_OPTIONS: Record<string, string[]> = {
  'standard': ['K38', 'K39', 'K40', 'K41'],
  'tabp': ['CLCK10', 'CLCK11', 'CLCK12', 'CLCK13'],
  'special': ['CTDBK1', 'CTDBK2']
};

const findProgramFromName = (programName?: string) =>
  ACADEMIC_PROGRAMS.find(program => program.name === programName) || null;

const findMajorFromInitialData = (program: Program | null, cohort?: string, majorName?: string, specializationName?: string) => {
  if (!program || !cohort) return null;
  const normalize = (value?: string) => (value || '').trim().toLowerCase();
  const majorKey = normalize(majorName);
  const specializationKey = normalize(specializationName);
  const majors = getMajors(program.id, cohort);

  return (
    majors.find(major => normalize(major.name) === majorKey) ||
    majors.find(major => major.specializations.some(spec => normalize(spec.name) === specializationKey)) ||
    null
  );
};

const findSpecializationFromInitialData = (major: Major | null, specializationName?: string) => {
  if (!major) return null;
  const specializationKey = (specializationName || '').trim().toLowerCase();
  return (
    major.specializations.find(spec => spec.name.trim().toLowerCase() === specializationKey) ||
    (major.specializations.length === 1 ? major.specializations[0] : null)
  );
};

const buildInitialFormData = (initialData?: Partial<UserData>) => {
  const program = findProgramFromName(initialData?.programName);
  const cohort = initialData?.cohort || '';
  const major = findMajorFromInitialData(program, cohort, initialData?.majorName, initialData?.specializationName);
  const specialization = findSpecializationFromInitialData(major, initialData?.specializationName);

  return {
    studentName: initialData?.studentName || '',
    cohort,
    program,
    major,
    specialization,
  };
};

const getInitialStep = (initialData?: Partial<UserData>) => {
  const formData = buildInitialFormData(initialData);
  if (!formData.studentName.trim()) return 1;
  if (!formData.program) return 2;
  if (!formData.cohort) return 3;
  if (!formData.major) return 4;
  if (!formData.specialization) return 5;
  return 1;
};

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete, initialData }) => {
  const navigate = useNavigate(); 
  const [step, setStep] = useState(() => getInitialStep(initialData));
  const [formData, setFormData] = useState(() => buildInitialFormData(initialData));

  // --- Cấu hình hiệu ứng chuẩn (Xanh/Trắng) ---
  const particlesInit = useCallback(async (engine: Engine) => {
      await loadSlim(engine);
  }, []);

  const particlesOptions = useMemo((): ISourceOptions => ({
      fullScreen: { enable: false },
      fpsLimit: 120,
      particles: {
          number: { value: 30, density: { enable: true, area: 800 } },
          color: { value: ["#003375", "#3B82F6", "#93C5FD", "#BFDBFE"] },
          shape: { type: "circle" },
          opacity: { value: { min: 0.1, max: 0.5 }, animation: { enable: true, speed: 0.5, minimumValue: 0.1, sync: false } },
          size: { value: { min: 2, max: 5 } },
          move: { enable: true, speed: { min: 0.5, max: 2 }, direction: "top-right", random: true },
          wobble: { enable: true, distance: 5, speed: 5 }
      },
      detectRetina: true,
  }), []);

  const currentMajors = formData.program && formData.cohort 
    ? getMajors(formData.program.id, formData.cohort) 
    : [];
  const progressStep = Math.min(Math.max(step, 1), 5);

  const handleNext = () => {
    playClick();
    if (step === 1 && !formData.studentName.trim()) return;
    if (step === 2 && !formData.program) return;
    if (step === 3 && !formData.cohort) return;
    if (step === 4 && !formData.major) return;
    if (step === 5 && !formData.specialization) return;

    if (step < 5) {
      if (step === 4 && formData.major && formData.major.specializations.length === 1) {
          const autoSpec = formData.major.specializations[0];
          setFormData(prev => ({...prev, specialization: autoSpec}));
          finishOnboarding(autoSpec);
      } else {
          setStep(step + 1);
      }
    } else {
        finishOnboarding(formData.specialization!);
    }
  };

  const finishOnboarding = (finalSpec: Specialization) => {
      onComplete({
        studentName: formData.studentName,
        cohort: formData.cohort,
        programName: formData.program!.name,
        majorName: formData.major!.name,
        specializationName: finalSpec.name,
        totalCreditsRequired: finalSpec.credits,
        hasOnboarded: true
      });
  };

  const handleBack = () => {
      playClick();
      setStep(step - 1);
  };

  // --- RENDER STEPS ---

  const renderStep1 = () => (
    <div className="space-y-4 px-1 pb-2">
      <div className="text-center mb-6 pt-2">
        <div className="mx-auto w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4 shadow-sm animate-scaleIn">
            <User className="text-[#003375]" size={32} />
        </div>
        <h2 className="text-2xl font-bold text-[#003375]">Chào bạn!</h2>
        <p className="text-gray-600">Hãy nhập tên để chúng mình tiện xưng hô nhé.</p>
      </div>

      <div>
        <label className="block text-sm font-bold text-gray-900 mb-2">Tên của bạn</label>
        <input
          type="text"
          className="w-full border border-gray-300 rounded-lg p-3 text-gray-900 focus:ring-2 focus:ring-[#003375] outline-none placeholder-gray-400 transition-all focus:border-[#003375] text-lg bg-white/80"
          placeholder="Ví dụ: Nguyễn Văn A"
          value={formData.studentName}
          onChange={e => setFormData({ ...formData, studentName: e.target.value })}
          autoFocus
        />
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-4 px-1 pb-2">
      <div className="text-center mb-4 pt-2">
         <div className="mx-auto w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4 shadow-sm animate-scaleIn">
            <GraduationCap className="text-[#003375]" size={32} />
        </div>
        <h2 className="text-2xl font-bold text-[#003375]">Chương trình học</h2>
        <p className="text-gray-600">Bạn đang theo học hệ đào tạo nào?</p>
      </div>
      <div className="grid gap-3">
        {ACADEMIC_PROGRAMS.map(prog => (
          <button
            key={prog.id}
            onClick={() => { 
                playClick(); 
                setFormData({ ...formData, program: prog, cohort: '', major: null, specialization: null }); 
            }}
            className={`p-4 rounded-xl border-2 text-left transition-all duration-200 active:scale-[0.98] hover:scale-[1.02] hover:shadow-md ${
              formData.program?.id === prog.id
                ? 'border-[#003375] bg-blue-50 text-[#003375] shadow-sm'
                : 'border-gray-200 hover:border-blue-300 hover:bg-white text-gray-900 bg-white/70'
            }`}
          >
            <div className="flex justify-between items-center">
              <span className="font-semibold">{prog.name}</span>
              {formData.program?.id === prog.id && <Check size={20} className="text-[#003375]" />}
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  const renderStep3 = () => {
    const options = formData.program ? COHORT_OPTIONS[formData.program.id] || [] : [];
    return (
        <div className="space-y-4 px-1 pb-2">
            <div className="text-center mb-4 pt-2">
                <div className="mx-auto w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4 shadow-sm animate-scaleIn">
                    <Calendar className="text-[#003375]" size={32} />
                </div>
                <h2 className="text-2xl font-bold text-[#003375]">Chọn Khóa</h2>
                <p className="text-gray-600">Bạn thuộc khóa nào dưới đây?</p>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
                {options.map(cohort => (
                    <button
                        key={cohort}
                        onClick={() => { playClick(); setFormData({ ...formData, cohort: cohort, major: null, specialization: null }); }}
                        className={`p-4 rounded-xl border-2 text-center transition-all duration-200 active:scale-[0.95] hover:shadow-md ${
                        formData.cohort === cohort
                            ? 'border-[#003375] bg-[#003375] text-white shadow-md'
                            : 'border-gray-200 hover:border-blue-300 hover:bg-white text-gray-900 bg-white/70'
                        }`}
                    >
                        <span className="font-bold text-lg">{cohort}</span>
                    </button>
                ))}
            </div>
            {options.length === 0 && (
                <div className="text-center text-red-500">Vui lòng chọn chương trình học trước.</div>
            )}
        </div>
    );
  };

  const renderStep4 = () => (
    <div className="space-y-4 px-1 pb-2">
       <div className="text-center mb-4 pt-2">
         <div className="mx-auto w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4 shadow-sm animate-scaleIn">
            <BookOpen className="text-[#003375]" size={32} />
        </div>
        <h2 className="text-2xl font-bold text-[#003375]">Ngành học</h2>
        <p className="text-gray-600">Chọn ngành học của bạn trong danh sách.</p>
      </div>
      
      <div className="space-y-2">
        {currentMajors.map(major => (
          <button
            key={major.code}
            onClick={() => { playClick(); setFormData({ ...formData, major: major, specialization: null }); }}
            className={`w-full p-3 rounded-lg border text-left transition-all duration-200 active:scale-[0.99] hover:scale-[1.01] hover:shadow-md text-sm ${
              formData.major?.code === major.code
                ? 'border-[#003375] bg-blue-50 text-[#003375] font-bold shadow-sm'
                : 'border-gray-200 hover:bg-white text-gray-900 hover:border-blue-300 bg-white/70'
            }`}
          >
            <div className="flex justify-between items-center">
              <span>{major.name}</span>
              {formData.major?.code === major.code && <Check size={16} className="text-[#003375]" />}
            </div>
          </button>
        ))}
        {currentMajors.length === 0 && (
            <p className="text-center text-gray-500 py-4">Không tìm thấy dữ liệu ngành học cho khóa này.</p>
        )}
      </div>
    </div>
  );

  const renderStep5 = () => (
    <div className="space-y-4 px-1 pb-2">
        <div className="text-center mb-4 pt-2">
         <div className="mx-auto w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4 shadow-sm animate-scaleIn">
            <BookOpen className="text-[#003375]" size={32} />
        </div>
        <h2 className="text-2xl font-bold text-[#003375]">Chuyên ngành</h2>
        <p className="text-gray-600">Xác nhận chuyên ngành chính xác của bạn.</p>
      </div>
      <div className="grid gap-3">
        {formData.major?.specializations.map((spec, idx) => (
          <button
            key={idx}
            onClick={() => { playClick(); setFormData({ ...formData, specialization: spec }); }}
            className={`p-4 rounded-xl border-2 text-left transition-all duration-200 active:scale-[0.98] hover:scale-[1.02] hover:shadow-md ${
              formData.specialization?.name === spec.name
                ? 'border-[#003375] bg-blue-50 text-[#003375] shadow-sm'
                : 'border-gray-200 hover:border-blue-300 hover:bg-white text-gray-900 bg-white/70'
            }`}
          >
            <div className="flex justify-between items-center">
              <div>
                <span className="font-bold block">{spec.name}</span>
                <span className="text-xs text-gray-600">Yêu cầu: {spec.credits} tín chỉ</span>
              </div>
              {formData.specialization?.name === spec.name && <Check size={20} className="text-[#003375]" />}
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden flex items-center justify-center z-50 bg-[#F8FAFC]">
        {/* Background Layers */}
        <Particles
            id="tsparticles-onboarding"
            init={particlesInit}
            options={particlesOptions}
            className="absolute inset-0 z-1 pointer-events-none"
        />

{/* Nút Quay Lại (Đã sửa logic Reset) */}
        <button
            onClick={async () => { 
                playClick(); 
                // 1. Xóa ghi nhớ vai trò
                localStorage.removeItem('user_role_preference');
                // 2. Đăng xuất tài khoản (nếu lỡ đăng nhập Google)
                if (supabase) {
                    await supabase.auth.signOut();
                }
                // 3. Ép tải lại trang chủ sạch sẽ
                window.location.href = '/';
            }}
            className="absolute top-6 left-6 flex items-center gap-2 text-gray-500 hover:text-gray-900 font-bold transition-colors z-30 bg-white p-2.5 sm:px-4 rounded-xl shadow-sm border border-gray-200 hover:bg-gray-50"
        >
            <ArrowLeft size={18} /> <span className="hidden sm:inline text-sm">Trở về</span>
        </button>

        {/* MODAL CHÍNH */}
        <div className="relative z-10 w-full max-w-md p-4 animate-scaleIn h-full flex items-center justify-center">
            <div className="bg-white rounded-2xl shadow-2xl w-full border border-gray-200 flex flex-col max-h-[85vh] overflow-hidden">
                
                {/* 1. HEADER */}
                <div className="shrink-0 relative p-6 pb-0 bg-white">
                    {step > 1 && (
                        <button 
                            onClick={handleBack}
                            className="absolute top-6 left-6 p-2 -ml-2 text-gray-500 hover:text-[#003375] hover:bg-blue-50 rounded-full transition-all duration-200 active:scale-90 z-20"
                            title="Quay lại bước trước"
                        >
                            <ArrowLeft size={24} />
                        </button>
                    )}
                    <div className="absolute top-0 left-0 right-0 h-1.5 bg-gray-100 rounded-t-2xl overflow-hidden">
                        <div 
                        className={`h-full bg-[#003375] transition-all duration-500 ease-out onboarding-progress-${progressStep}`} 
                        />
                    </div>
                </div>

                {/* 2. BODY */}
                <div className="flex-1 overflow-y-auto p-6 pt-2 custom-scrollbar bg-white">
                    <div key={step} className="animate-slideInRight">
                        {step === 1 && renderStep1()}
                        {step === 2 && renderStep2()}
                        {step === 3 && renderStep3()}
                        {step === 4 && renderStep4()}
                        {step === 5 && renderStep5()}
                    </div>
                </div>

                {/* 3. FOOTER */}
                <div className="shrink-0 p-6 pt-4 border-t border-gray-100 bg-gray-50">
                    <button
                        onClick={handleNext}
                        disabled={
                            (step === 1 && !formData.studentName.trim()) ||
                            (step === 2 && !formData.program) ||
                            (step === 3 && !formData.cohort) ||
                            (step === 4 && !formData.major) ||
                            (step === 5 && !formData.specialization)
                        }
                        className="w-full bg-[#003375] text-white p-3 rounded-xl font-bold hover:bg-[#002855] transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
                    >
                        {step === 5 || (step === 4 && formData.major && formData.major.specializations.length === 1) ? 'Hoàn tất' : 'Tiếp tục'}
                        <ChevronRight size={20} />
                    </button>

                    {step > 1 && (
                        <button 
                            onClick={handleBack}
                            className="w-full mt-3 text-sm font-medium text-gray-500 hover:text-[#003375] transition-colors hover:underline text-center block md:hidden"
                        >
                            Quay lại bước trước
                        </button>
                    )}
                </div>
            </div>
        </div>
    </div>
  );
};
