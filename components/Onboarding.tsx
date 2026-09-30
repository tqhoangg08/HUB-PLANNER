import React, { useEffect, useMemo, useState } from 'react';
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
import { fetchOwnPrivateProfile, fetchOwnStudentDirectory, fetchStudentDirectoryClasses, type OwnStudentDirectory } from '../utils/privateProfileApi';
import { directoryCohortToProfile, directoryProgramToProfile } from '../shared/student-directory-academic';
import { genderForSelect, PROFILE_GENDERS } from '../shared/profile-directory-fields';
import { StudentClassPicker } from './StudentClassPicker';

interface OnboardingProps {
  onComplete: (data: Partial<UserData> & { fullName: string; className: string }) => Promise<void> | void;
  initialData?: Partial<UserData>;
  initialFullName?: string;
  initialClassName?: string;
}

const normalize = (value?: string) => (value || '').trim().toLocaleLowerCase('vi')
  .replace(/[–—]/gu, '-').replace(/\s+/gu, ' ');

const findProgramFromName = (programName?: string) =>
  ACADEMIC_PROGRAMS.find((program) => program.name === programName) || null;

const findMajorFromInitialData = (
  program: Program | null,
  cohort?: string,
  majorName?: string,
  specializationName?: string,
) => {
  if (!program || !cohort) return null;

  const majors = getMajors(program.id, cohort).length ? getMajors(program.id, cohort) : program.majors;
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
    gender: genderForSelect(initialData?.gender),
    majorClass: initialData?.majorClass || '',
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
  const [directory, setDirectory] = useState<OwnStudentDirectory | null>(null);
  const [directoryClasses, setDirectoryClasses] = useState<string[]>([]);
  const [savedName, setSavedName] = useState('');
  const nameLocked = Boolean(directory?.fullName || savedName);

  useEffect(() => {
    let active = true;
    void Promise.allSettled([fetchOwnStudentDirectory(), fetchOwnPrivateProfile(),
      fetchStudentDirectoryClasses()]).then(([directoryResult, profileResult, classesResult]) => {
      if (!active) return;
      if (profileResult.status === 'fulfilled') {
        const name = profileResult.value.publicProfile?.full_name;
        setSavedName(typeof name === 'string' ? name.trim() : '');
      }
      if (classesResult.status === 'fulfilled') setDirectoryClasses(classesResult.value);
      if (directoryResult.status !== 'fulfilled' || !directoryResult.value.matched) return;
      const found = directoryResult.value;
      setDirectory(found);
      setFormData((previous) => {
        const program = previous.program || findProgramFromName(directoryProgramToProfile(found.trainingProgram));
        const cohort = previous.cohort || directoryCohortToProfile(found.cohort, found.trainingProgram);
        const major = previous.major || findMajorFromInitialData(program, cohort,
          found.major || undefined, found.specialization || undefined);
        return { ...previous,
          fullName: found.fullName || previous.fullName,
          className: previous.className || found.generalClass || '',
          gender: previous.gender || genderForSelect(found.gender),
          majorClass: previous.majorClass || found.majorClass || '',
          cohort, program, major,
          specialization: previous.specialization || findSpecializationFromInitialData(major,
            found.specialization || undefined),
        };
      });
    });
    return () => { active = false; };
  }, []);

  const cohortOptions = formData.program
    ? [...new Set([...(ACADEMIC_COHORT_OPTIONS[formData.program.id] || []),
      ...(formData.cohort ? [formData.cohort] : [])])]
    : [];
  const majorOptions = useMemo(
    () => (formData.program && formData.cohort
      ? getMajors(formData.program.id, formData.cohort).length
        ? getMajors(formData.program.id, formData.cohort) : formData.program.majors : []),
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
      gender: formData.gender.trim(),
      majorClass: formData.majorClass.trim(),
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
                  readOnly={nameLocked}
                  onChange={(event) =>
                    setFormData((previous) => ({ ...previous, fullName: event.target.value }))
                  }
                  placeholder="Nhập họ tên đầy đủ của bạn"
                  aria-invalid={submitted && !formData.fullName.trim()}
                />
              </div>
            </div>

            {directory?.studentCode && <div className="onboarding-field">
              <label>MSSV</label>
              <div className="onboarding-input-wrap"><input value={directory.studentCode} readOnly /></div>
            </div>}

            <div className="onboarding-field">
              <label htmlFor="onboarding-gender">Giới tính</label>
              <div className="onboarding-select-wrap">
                <select id="onboarding-gender" className={selectClassName} value={formData.gender}
                  onChange={(event) => setFormData((previous) => ({ ...previous,
                    gender: genderForSelect(event.target.value) }))}>
                  <option value="">-- Chọn giới tính --</option>
                  {PROFILE_GENDERS.map((gender) => <option key={gender} value={gender}>{gender}</option>)}
                </select>
                <ChevronDown size={18} aria-hidden="true" />
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
              <StudentClassPicker id="onboarding-class" value={formData.className}
                classes={directoryClasses}
                onChange={(className) => setFormData((previous) => ({ ...previous, className }))}
                inputClassName={selectClassName} invalid={submitted && !formData.className.trim()} />
            </div>

            <div className="onboarding-field">
              <label htmlFor="onboarding-major-class">Lớp chuyên ngành</label>
              <div className="onboarding-input-wrap"><input id="onboarding-major-class"
                value={formData.majorClass}
                onChange={(event) => setFormData((previous) => ({ ...previous, majorClass: event.target.value }))}
                placeholder="Có thể bổ sung hoặc chỉnh sửa" /></div>
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
