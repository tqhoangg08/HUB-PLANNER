import React, { useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight, ShieldCheck, User } from 'lucide-react';
import { UserData } from '../types';
import {
  ACADEMIC_COHORT_OPTIONS,
  ACADEMIC_PROGRAMS,
  Major,
  Program,
  Specialization,
  getMajors,
  isManualTotalCreditsCohort,
  normalizeManualTotalCredits,
} from '../utils/programs';
import { playClick } from '../utils/audio';
import { signOutBetterAuth } from '../utils/privateApi';

interface OnboardingProps {
  onComplete: (data: Partial<UserData> & { fullName: string; className: string }) => Promise<void> | void;
  initialData?: Partial<UserData>;
  initialFullName?: string;
  initialClassName?: string;
}

const normalize = (value?: string) => (value || '').trim().toLocaleLowerCase('vi');

const findProgramFromName = (programName?: string) =>
  ACADEMIC_PROGRAMS.find((program) => program.name === programName) || null;

const findMajorFromInitialData = (
  program: Program | null,
  cohort?: string,
  majorName?: string,
  specializationName?: string,
) => {
  if (!program || !cohort) return null;

  const majors = getMajors(program.id, cohort);
  const majorKey = normalize(majorName);
  const specializationKey = normalize(specializationName);

  return (
    majors.find((major) => normalize(major.name) === majorKey) ||
    majors.find((major) =>
      major.specializations.some((specialization) => normalize(specialization.name) === specializationKey),
    ) ||
    null
  );
};

const findSpecializationFromInitialData = (major: Major | null, specializationName?: string) => {
  if (!major) return null;
  const specializationKey = normalize(specializationName);

  return (
    major.specializations.find((specialization) => normalize(specialization.name) === specializationKey) ||
    (major.specializations.length === 1 ? major.specializations[0] : null)
  );
};

const buildInitialFormData = (initialData?: Partial<UserData>, initialFullName?: string, initialClassName?: string) => {
  const program = findProgramFromName(initialData?.programName);
  const cohort = initialData?.cohort || '';
  const major = findMajorFromInitialData(
    program,
    cohort,
    initialData?.majorName,
    initialData?.specializationName,
  );

  return {
    fullName: initialFullName || initialData?.studentName || '',
    className: initialClassName || '',
    cohort,
    program,
    major,
    specialization: findSpecializationFromInitialData(major, initialData?.specializationName),
    manualTotalCredits: program && isManualTotalCreditsCohort(program.id, cohort)
      && normalizeManualTotalCredits(initialData?.totalCreditsRequired)
      ? String(normalizeManualTotalCredits(initialData?.totalCreditsRequired))
      : '',
  };
};

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete, initialData, initialFullName, initialClassName }) => {
  const [formData, setFormData] = useState(() => buildInitialFormData(initialData, initialFullName, initialClassName));
  const [submitted, setSubmitted] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const cohortOptions = formData.program
    ? ACADEMIC_COHORT_OPTIONS[formData.program.id] || []
    : [];
  const majorOptions = useMemo(
    () => (formData.program && formData.cohort ? getMajors(formData.program.id, formData.cohort) : []),
    [formData.program, formData.cohort],
  );
  const specializationOptions = formData.major?.specializations || [];
  const manualCredits = Boolean(
    formData.program
    && isManualTotalCreditsCohort(formData.program.id, formData.cohort),
  );

  const isComplete = Boolean(
    formData.fullName.trim() &&
      formData.className.trim() &&
      formData.program &&
      formData.cohort &&
      formData.major &&
      formData.specialization,
  );

  const handleProgramChange = (programId: string) => {
    playClick();
    const program = ACADEMIC_PROGRAMS.find((item) => item.id === programId) || null;
    setFormData((previous) => ({
      ...previous,
      program,
      cohort: '',
      major: null,
      specialization: null,
      manualTotalCredits: '',
    }));
  };

  const handleCohortChange = (cohort: string) => {
    playClick();
    setFormData((previous) => ({
      ...previous,
      cohort,
      major: null,
      specialization: null,
      // A value inferred for another cohort must never become a manual value.
      manualTotalCredits: '',
    }));
  };

  const handleMajorChange = (majorCode: string) => {
    playClick();
    const major = majorOptions.find((item) => item.code === majorCode) || null;
    setFormData((previous) => ({
      ...previous,
      major,
      specialization: major?.specializations.length === 1 ? major.specializations[0] : null,
    }));
  };

  const handleSpecializationChange = (specializationName: string) => {
    playClick();
    const specialization =
      specializationOptions.find((item) => item.name === specializationName) || null;
    setFormData((previous) => ({ ...previous, specialization }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    if (!isComplete) return;

    playClick();
    setSaving(true);
    setSaveError(null);
    try {
      await onComplete({
      fullName: formData.fullName.trim(),
      className: formData.className.trim(),
      studentName: formData.fullName.trim(),
      cohort: formData.cohort,
      programName: formData.program!.name,
      majorName: formData.major!.name,
      specializationName: formData.specialization!.name,
      totalCreditsRequired: manualCredits
        ? normalizeManualTotalCredits(formData.manualTotalCredits)
        : formData.specialization!.credits || 0,
      hasOnboarded: true,
      });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Không thể lưu hồ sơ. Vui lòng thử lại.');
      setSaving(false);
    }
  };

  const handleExit = async () => {
    playClick();
    localStorage.removeItem('user_role_preference');
    await signOutBetterAuth().catch(() => undefined);
    window.location.href = '/';
  };

  const selectClassName =
    'onboarding-select w-full rounded-[10px] border border-[#d7dde7] bg-white px-4 pr-11 text-[12px] font-medium text-[#27364a] outline-none transition focus:border-[#1769e0] focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-[#f8fafc] disabled:text-[#9ba6b5]';

  return (
    <main className="onboarding-shell" aria-label="Thiết lập thông tin sinh viên">
      <aside className="onboarding-intro">
        <div className="onboarding-brand" aria-label="HotroSinhVien">
          <img src="/logo.png" alt="" />
          <div>
            <strong>HUB Planner</strong>
            <span>Đồng hành cùng sinh viên</span>
          </div>
        </div>

        <div className="onboarding-welcome">
          <p className="onboarding-eyebrow">Bắt đầu hành trình của bạn</p>
          <h1>
            Chào mừng bạn đến với
            <span>
              HUB Planner <span aria-hidden="true"></span>
            </span>
          </h1>
          <p className="onboarding-description">
            Vui lòng nhập đầy đủ thông tin để chúng tôi có thể hỗ trợ bạn tốt nhất.
          </p>
        </div>

        <button className="onboarding-exit" type="button" onClick={handleExit}>
          <ArrowLeft size={17} aria-hidden="true" />
          Trở về
        </button>
      </aside>

      <section className="onboarding-form-area">
        <form className="onboarding-card" onSubmit={handleSubmit} noValidate>
          <header className="onboarding-card-header">
            <div className="onboarding-user-icon">
              <User size={29} strokeWidth={1.8} aria-hidden="true" />
            </div>
            <div>
              <h2>Nhập thông tin của bạn</h2>
              <p>Vui lòng điền đầy đủ các thông tin bên dưới</p>
            </div>
          </header>

          <div className="onboarding-fields">
            <div className="onboarding-field">
              <label htmlFor="onboarding-name">Họ tên sinh viên *</label>
              <div className="onboarding-input-wrap">
                <User size={18} aria-hidden="true" />
                <input
                  id="onboarding-name"
                  type="text"
                  autoComplete="name"
                  value={formData.fullName}
                  onChange={(event) =>
                    setFormData((previous) => ({ ...previous, fullName: event.target.value }))
                  }
                  placeholder="Nhập họ tên đầy đủ của bạn"
                  aria-invalid={submitted && !formData.fullName.trim()}
                />
              </div>
            </div>

            <div className="onboarding-field">
              <label htmlFor="onboarding-program">Chọn chương trình học</label>
              <div className="onboarding-select-wrap">
                <select
                  id="onboarding-program"
                  className={selectClassName}
                  value={formData.program?.id || ''}
                  onChange={(event) => handleProgramChange(event.target.value)}
                  aria-invalid={submitted && !formData.program}
                >
                  <option value="">-- Chọn chương trình học --</option>
                  {ACADEMIC_PROGRAMS.map((program) => (
                    <option key={program.id} value={program.id}>
                      {program.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={18} aria-hidden="true" />
              </div>
            </div>

            <div className="onboarding-field">
              <label htmlFor="onboarding-cohort">Chọn khóa</label>
              <div className="onboarding-select-wrap">
                <select
                  id="onboarding-cohort"
                  className={selectClassName}
                  value={formData.cohort}
                  onChange={(event) => handleCohortChange(event.target.value)}
                  disabled={!formData.program}
                  aria-invalid={submitted && !formData.cohort}
                >
                  <option value="">-- Chọn khóa --</option>
                  {cohortOptions.map((cohort) => (
                    <option key={cohort} value={cohort}>
                      {cohort}
                    </option>
                  ))}
                </select>
                <ChevronDown size={18} aria-hidden="true" />
              </div>
            </div>

            <div className="onboarding-field">
              <label htmlFor="onboarding-major">Chọn ngành học</label>
              <div className="onboarding-select-wrap">
                <select
                  id="onboarding-major"
                  className={selectClassName}
                  value={formData.major?.code || ''}
                  onChange={(event) => handleMajorChange(event.target.value)}
                  disabled={!formData.program || !formData.cohort}
                  aria-invalid={submitted && !formData.major}
                >
                  <option value="">-- Chọn ngành học --</option>
                  {majorOptions.map((major) => (
                    <option key={major.code} value={major.code}>
                      {major.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={18} aria-hidden="true" />
              </div>
            </div>

            <div className="onboarding-field">
              <label htmlFor="onboarding-specialization">Chọn chuyên ngành học</label>
              <div className="onboarding-select-wrap">
                <select
                  id="onboarding-specialization"
                  className={selectClassName}
                  value={formData.specialization?.name || ''}
                  onChange={(event) => handleSpecializationChange(event.target.value)}
                  disabled={!formData.major}
                  aria-invalid={submitted && !formData.specialization}
                >
                  <option value="">-- Chọn chuyên ngành học --</option>
                  {specializationOptions.map((specialization) => (
                    <option key={specialization.name} value={specialization.name}>
                      {specialization.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={18} aria-hidden="true" />
              </div>
            </div>

            <div className="onboarding-field">
              <label htmlFor="onboarding-class">Lớp *</label>
              <div className="onboarding-input-wrap">
                <input
                  id="onboarding-class"
                  type="text"
                  value={formData.className}
                  onChange={(event) => setFormData((previous) => ({ ...previous, className: event.target.value }))}
                  placeholder="Ví dụ: DH22KTA"
                  aria-invalid={submitted && !formData.className.trim()}
                />
              </div>
            </div>

            {manualCredits && (
              <div className="onboarding-field">
                <label htmlFor="onboarding-total-credits">Tổng số tín chỉ chương trình (nếu biết)</label>
                <div className="onboarding-input-wrap">
                  <input
                    id="onboarding-total-credits"
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    value={formData.manualTotalCredits}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value !== '' && !/^[1-9]\d*$/.test(value)) return;
                      setFormData((previous) => ({ ...previous, manualTotalCredits: value }));
                    }}
                    placeholder="Có thể để trống"
                  />
                </div>
              </div>
            )}
          </div>

          {submitted && !isComplete && (
            <p className="onboarding-error" role="alert">
              Vui lòng điền đầy đủ tất cả thông tin trước khi tiếp tục.
            </p>
          )}
          {saveError && <p className="onboarding-error" role="alert">{saveError}</p>}

          <button className="onboarding-submit" type="submit" disabled={saving}>
            <span>{saving ? 'Đang lưu...' : 'Tiếp tục'}</span>
            <ChevronRight size={20} aria-hidden="true" />
          </button>

          <p className="onboarding-privacy">
            <ShieldCheck size={17} aria-hidden="true" />
            Thông tin của bạn được bảo mật và chỉ sử dụng để hỗ trợ sinh viên.
          </p>
        </form>
      </section>
    </main>
  );
};
