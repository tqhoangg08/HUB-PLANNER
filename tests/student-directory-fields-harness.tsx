import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Onboarding } from '../components/Onboarding';
import { AccountPublicProfileFields } from '../components/account/AccountPublicProfileFields';
import { AccountAcademicProfileFields } from '../components/account/AccountAcademicProfileFields';
import { ACADEMIC_COHORT_OPTIONS, ACADEMIC_PROGRAMS } from '../utils/programs';

const program = ACADEMIC_PROGRAMS.find((item) => item.id === 'standard') || ACADEMIC_PROGRAMS[0];

const ProfileHarness = () => {
  const [name, setName] = useState('Sinh viên thử nghiệm');
  const [gender, setGender] = useState('Nữ');
  const [className, setClassName] = useState('ĐHC 01');
  const [cohort, setCohort] = useState('K41');
  return <>
    <AccountPublicProfileFields
      fullName={name} fullNameLocked gender={gender} majorClass="" bio=""
      className={className} directoryClasses={['ĐHC 01', 'ĐHC 02', 'KTA 01']}
      defaultClassName="" profileTags="" publicProfileEnabled={false} showProfileStats={false}
      avatarUrl="blue" avatarPreview="" avatarSeed="ST"
      onFullNameChange={setName} onGenderChange={setGender} onMajorClassChange={() => undefined}
      onBioChange={() => undefined} onClassNameChange={setClassName}
      onProfileTagsChange={() => undefined} onPublicProfileEnabledChange={() => undefined}
      onShowProfileStatsChange={() => undefined} onAvatarColorChange={() => undefined}
      onAvatarFileSelect={() => undefined} onInvalidAvatarFile={() => undefined}
    />
    <AccountAcademicProfileFields selectedProgram={program} selectedCohort={cohort}
      selectedMajor={null} selectedSpecialization={null} programs={ACADEMIC_PROGRAMS}
      cohortOptions={[...(ACADEMIC_COHORT_OPTIONS[program.id] || []), 'K42']}
      majorOptions={[]} manualTotalCredits="" onManualTotalCreditsChange={() => undefined}
      onProgramChange={() => undefined} onCohortChange={setCohort}
      onMajorChange={() => undefined} onSpecializationChange={() => undefined} />
  </>;
};

const view = new URLSearchParams(window.location.search).get('view');
createRoot(document.getElementById('root')!).render(view === 'profile'
  ? <ProfileHarness />
  : <Onboarding onComplete={() => undefined} />);
