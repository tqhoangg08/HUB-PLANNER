import React, { useState } from 'react';
import { UserData } from '../types';
import { ACADEMIC_PROGRAMS, Program, Major, Specialization, getMajors } from '../utils/programs';
import { Check, ChevronRight, User, BookOpen, GraduationCap, ArrowLeft, Calendar } from 'lucide-react';
import { playClick } from '../utils/audio';

interface OnboardingProps {
  onComplete: (data: Partial<UserData>) => void;
}

// Define specific cohort options based on program ID
const COHORT_OPTIONS: Record<string, string[]> = {
  'standard': ['K38', 'K39', 'K40', 'K41'],
  'tabp': ['CLCK10', 'CLCK11', 'CLCK12', 'CLCK13'],
  'special': ['CTDBK1', 'CTDBK2']
};

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    studentName: '',
    cohort: '',
    program: null as Program | null,
    major: null as Major | null,
    specialization: null as Specialization | null,
  });

  // Helper to fetch dynamic majors based on current selections
  const currentMajors = formData.program && formData.cohort 
    ? getMajors(formData.program.id, formData.cohort) 
    : [];

  const handleNext = () => {
    playClick();
    // Step 1: Name validation
    if (step === 1 && !formData.studentName.trim()) return;
    
    // Step 2: Program validation
    if (step === 2 && !formData.program) return;
    
    // Step 3: Cohort validation
    if (step === 3 && !formData.cohort) return;

    // Step 4: Major validation
    if (step === 4 && !formData.major) return;

    // Step 5: Specialization validation
    if (step === 5 && !formData.specialization) return;

    if (step < 5) {
      // Auto-select specialization if there's only one choice when moving from Major (Step 4) to Step 5
      // Important: Check against the fresh major data, not potentially stale state
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

  // Step 1: Input Name
  const renderStep1 = () => (
    <div className="space-y-4">
      <div className="text-center mb-6 pt-4">
        <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4 shadow-sm animate-scaleIn">
            <User className="text-[#003375]" size={32} />
        </div>
        <h2 className="text-2xl font-bold text-[#003375]">Chào bạn!</h2>
        <p className="text-gray-600">Hãy nhập tên để chúng mình tiện xưng hô nhé.</p>
      </div>

      <div>
        <label className="block text-sm font-bold text-gray-900 mb-2">Tên của bạn</label>
        <input
          type="text"
          className="w-full border border-gray-300 rounded-lg p-3 text-gray-900 focus:ring-2 focus:ring-[#003375] outline-none placeholder-gray-400 transition-all focus:border-[#003375] text-lg"
          placeholder="Ví dụ: Nguyễn Văn A"
          value={formData.studentName}
          onChange={e => setFormData({ ...formData, studentName: e.target.value })}
          autoFocus
        />
      </div>
    </div>
  );

  // Step 2: Select Program
  const renderStep2 = () => (
    <div className="space-y-4">
      <div className="text-center mb-6 pt-4">
         <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4 shadow-sm animate-scaleIn">
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
                // Reset subsequent selections when program changes
                setFormData({ ...formData, program: prog, cohort: '', major: null, specialization: null }); 
            }}
            className={`p-4 rounded-xl border-2 text-left transition-all duration-200 active:scale-[0.98] hover:scale-[1.02] hover:shadow-md ${
              formData.program?.id === prog.id
                ? 'border-[#003375] bg-[#003375]/10 text-[#003375] shadow-sm'
                : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50 text-gray-900'
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

  // Step 3: Select Cohort (Based on Program)
  const renderStep3 = () => {
    const options = formData.program ? COHORT_OPTIONS[formData.program.id] || [] : [];
    
    return (
        <div className="space-y-4">
            <div className="text-center mb-6 pt-4">
                <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4 shadow-sm animate-scaleIn">
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
                            : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50 text-gray-900'
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

  // Step 4: Select Major
  const renderStep4 = () => (
    <div className="space-y-4">
       <div className="text-center mb-6 pt-4">
         <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4 shadow-sm animate-scaleIn">
            <BookOpen className="text-[#003375]" size={32} />
        </div>
        <h2 className="text-2xl font-bold text-[#003375]">Ngành học</h2>
        <p className="text-gray-600">Chọn ngành học của bạn trong danh sách.</p>
      </div>
      
      <div className="h-64 overflow-y-auto pr-2 space-y-2 custom-scrollbar p-1">
        {currentMajors.map(major => (
          <button
            key={major.code}
            onClick={() => { playClick(); setFormData({ ...formData, major: major, specialization: null }); }}
            className={`w-full p-3 rounded-lg border text-left transition-all duration-200 active:scale-[0.99] hover:scale-[1.01] hover:shadow-md text-sm ${
              formData.major?.code === major.code
                ? 'border-[#003375] bg-[#003375]/10 text-[#003375] font-bold shadow-sm'
                : 'border-gray-200 hover:bg-gray-50 text-gray-900 hover:border-blue-300'
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

  // Step 5: Select Specialization
  const renderStep5 = () => (
    <div className="space-y-4">
        <div className="text-center mb-6 pt-4">
         <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4 shadow-sm animate-scaleIn">
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
                ? 'border-[#003375] bg-[#003375]/10 text-[#003375] shadow-sm'
                : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50 text-gray-900'
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
    <div className="fixed inset-0 bg-gray-50/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 sm:p-8 relative border border-gray-100 animate-slideUp">
        
        {step > 1 && (
            <button 
                onClick={handleBack}
                className="absolute top-6 left-6 p-2 -ml-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-all duration-200 active:scale-90 z-20"
                title="Quay lại"
            >
                <ArrowLeft size={24} />
            </button>
        )}

        {/* Progress Bar */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gray-100 rounded-t-2xl overflow-hidden">
          <div 
            className="h-full bg-[#003375] transition-all duration-500 ease-out" 
            style={{ width: `${(step / 5) * 100}%` }}
          />
        </div>

        {/* Dynamic Step Content with Key for Animation */}
        <div key={step} className="animate-slideInRight">
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
            {step === 4 && renderStep4()}
            {step === 5 && renderStep5()}
        </div>

        <button
            onClick={handleNext}
            disabled={
                (step === 1 && !formData.studentName.trim()) ||
                (step === 2 && !formData.program) ||
                (step === 3 && !formData.cohort) ||
                (step === 4 && !formData.major) ||
                (step === 5 && !formData.specialization)
            }
            className="w-full mt-8 bg-[#003375] text-white p-3 rounded-xl font-bold hover:bg-[#002855] transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl hover:scale-[1.01]"
        >
            {step === 5 || (step === 4 && formData.major && formData.major.specializations.length === 1) ? 'Hoàn tất' : 'Tiếp tục'}
            <ChevronRight size={20} />
        </button>

        {step > 1 && (
            <button 
                onClick={handleBack}
                className="w-full mt-3 text-sm font-medium text-gray-500 hover:text-gray-900 py-2 transition-colors hover:underline"
            >
                Quay lại
            </button>
        )}
      </div>
    </div>
  );
};
