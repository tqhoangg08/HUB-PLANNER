import React, { useState } from 'react';
import { UserData } from '../types';
import { ACADEMIC_PROGRAMS, Program, Major, Specialization } from '../utils/programs';
import { Check, ChevronRight, User, BookOpen, GraduationCap, ArrowLeft } from 'lucide-react';
import { playClick } from '../utils/audio';

interface OnboardingProps {
  onComplete: (data: Partial<UserData>) => void;
}

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    studentName: '',
    cohort: '',
    program: null as Program | null,
    major: null as Major | null,
    specialization: null as Specialization | null,
  });

  const handleNext = () => {
    playClick();
    if (step === 1 && (!formData.studentName || !formData.cohort)) return;
    if (step === 2 && !formData.program) return;
    if (step === 3 && !formData.major) return;
    if (step === 4 && !formData.specialization) return;

    if (step < 4) {
      if (step === 3 && formData.major && formData.major.specializations.length === 1) {
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

  const renderStep1 = () => (
    <div className="space-y-4">
      <div className="text-center mb-6 pt-4">
        <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4 shadow-sm animate-scaleIn">
            <User className="text-[#003375]" size={32} />
        </div>
        <h2 className="text-2xl font-bold text-[#003375]">Chào bạn!</h2>
        <p className="text-gray-600">Hãy cho mình biết một chút về bạn nhé.</p>
      </div>

      <div>
        <label className="block text-sm font-bold text-gray-900 mb-1">Tên của bạn</label>
        <input
          type="text"
          className="w-full border border-gray-300 rounded-lg p-3 text-gray-900 focus:ring-2 focus:ring-[#003375] outline-none placeholder-gray-400 transition-all focus:border-[#003375]"
          placeholder="Ví dụ: Nguyễn Văn A"
          value={formData.studentName}
          onChange={e => setFormData({ ...formData, studentName: e.target.value })}
        />
      </div>
      <div>
        <label className="block text-sm font-bold text-gray-900 mb-1">Khóa (Niên khóa)</label>
        <input
          type="text"
          className="w-full border border-gray-300 rounded-lg p-3 text-gray-900 focus:ring-2 focus:ring-[#003375] outline-none placeholder-gray-400 transition-all focus:border-[#003375]"
          placeholder="Ví dụ: K38, 2022-2026..."
          value={formData.cohort}
          onChange={e => setFormData({ ...formData, cohort: e.target.value })}
        />
      </div>
    </div>
  );

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
            onClick={() => { playClick(); setFormData({ ...formData, program: prog, major: null, specialization: null }); }}
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

  const renderStep3 = () => (
    <div className="space-y-4">
       <div className="text-center mb-6 pt-4">
         <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4 shadow-sm animate-scaleIn">
            <BookOpen className="text-[#003375]" size={32} />
        </div>
        <h2 className="text-2xl font-bold text-[#003375]">Ngành học</h2>
        <p className="text-gray-600">Chọn ngành học của bạn trong danh sách.</p>
      </div>
      
      <div className="h-64 overflow-y-auto pr-2 space-y-2 custom-scrollbar p-1">
        {formData.program?.majors.map(major => (
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
      </div>
    </div>
  );

  const renderStep4 = () => (
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
            style={{ width: `${(step / 4) * 100}%` }}
          />
        </div>

        {/* Dynamic Step Content with Key for Animation */}
        <div key={step} className="animate-slideInRight">
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
            {step === 4 && renderStep4()}
        </div>

        <button
            onClick={handleNext}
            disabled={
                (step === 1 && (!formData.studentName || !formData.cohort)) ||
                (step === 2 && !formData.program) ||
                (step === 3 && !formData.major) ||
                (step === 4 && !formData.specialization)
            }
            className="w-full mt-8 bg-[#003375] text-white p-3 rounded-xl font-bold hover:bg-[#002855] transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl hover:scale-[1.01]"
        >
            {step === 4 || (step === 3 && formData.major?.specializations.length === 1) ? 'Hoàn tất' : 'Tiếp tục'}
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