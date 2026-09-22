import { useCallback, useEffect, useState } from 'react';
import type { AppSession } from '../utils/privateApi';
import type { UserData } from '../types';
import {
    ACADEMIC_COHORT_OPTIONS,
    ACADEMIC_PROGRAMS,
    getMajors,
    isManualTotalCreditsCohort,
    normalizeManualTotalCredits,
    type Major,
    type Program,
    type Specialization,
} from '../utils/programs';
import { fetchDefaultClassName } from '../utils/defaultClassName';
import { getSafeAvatarColor } from '../utils/avatarColors';
import { blobToBase64, resizeAvatarImage } from '../utils/avatarImage';
import { calculateCumulativeStats } from '../utils/calculations';
import { upsertProfilePrivate } from '../utils/profilePrivate';
import { fetchOwnPrivateProfile, updateOwnPrivateProfile } from '../utils/privateProfileApi';

interface UseAccountProfileDraftOptions {
    open: boolean;
    session: AppSession | null;
    data: UserData;
    profileFullName: string;
    profileAvatarUrl: string;
    profileClassName: string;
    commitDataUpdate: (updater: (previousData: UserData) => UserData) => void;
    setProfileFullName: (value: string) => void;
    setProfileAvatarUrl: (value: string) => void;
    setProfileClassName: (value: string) => void;
    onSaved: () => void;
}

const findMajorFromSavedProfile = (
    program: Program,
    cohort: string,
    savedMajorName?: string,
    savedSpecializationName?: string,
) => {
    const majors = getMajors(program.id, cohort);
    const normalize = (value?: string) => (value || '').trim().toLowerCase();
    const majorKey = normalize(savedMajorName);
    const specializationKey = normalize(savedSpecializationName);

    return (
        majors.find(major => normalize(major.name) === majorKey)
        || majors.find(major =>
            major.specializations.some(specialization =>
                normalize(specialization.name) === specializationKey
            )
        )
        || null
    );
};

const findSpecializationFromSavedProfile = (
    major: Major,
    savedSpecializationName?: string,
) => {
    const normalize = (value?: string) => (value || '').trim().toLowerCase();
    const specializationKey = normalize(savedSpecializationName);

    return (
        major.specializations.find(
            specialization => normalize(specialization.name) === specializationKey,
        )
        || (major.specializations.length === 1 ? major.specializations[0] : null)
    );
};

export const useAccountProfileDraft = ({
    open,
    session,
    data,
    profileFullName,
    profileAvatarUrl,
    profileClassName,
    commitDataUpdate,
    setProfileFullName,
    setProfileAvatarUrl,
    setProfileClassName,
    onSaved,
}: UseAccountProfileDraftOptions) => {
    const [draftFullName, setDraftFullName] = useState('');
    const [draftAvatarUrl, setDraftAvatarUrl] = useState('');
    const [draftBio, setDraftBio] = useState('');
    const [draftClassName, setDraftClassName] = useState('');
    const [defaultClassName, setDefaultClassName] = useState('');
    const [draftProfileTags, setDraftProfileTags] = useState('');
    const [draftPublicProfileEnabled, setDraftPublicProfileEnabled] = useState(false);
    const [draftShowProfileStats, setDraftShowProfileStats] = useState(false);
    const [profileRefreshKey, setProfileRefreshKey] = useState(0);
    const [draftAvatarFile, setDraftAvatarFile] = useState<File | null>(null);
    const [draftAvatarPreview, setDraftAvatarPreview] = useState('');
    const [profileSaving, setProfileSaving] = useState(false);
    const [profileError, setProfileError] = useState<string | null>(null);
    const [draftProgram, setDraftProgram] = useState<Program | null>(null);
    const [draftCohort, setDraftCohort] = useState('');
    const [draftMajor, setDraftMajor] = useState<Major | null>(null);
    const [draftSpecialization, setDraftSpecialization] = useState<Specialization | null>(null);
    const [draftManualTotalCredits, setDraftManualTotalCredits] = useState('');

    const sessionUserId = session?.user?.id || null;
    const sessionEmail = session?.user?.email || '';
    const cohortOptions = draftProgram
        ? ACADEMIC_COHORT_OPTIONS[draftProgram.id] || []
        : [];
    const majorOptions = draftProgram && draftCohort
        ? getMajors(draftProgram.id, draftCohort)
        : [];

    useEffect(() => {
        if (!open) return;

        let active = true;
        setDraftFullName(profileFullName || data.studentName || '');
        setDraftAvatarUrl(profileAvatarUrl);
        setDraftAvatarFile(null);
        setDraftAvatarPreview('');
        setProfileError(null);

        const program = ACADEMIC_PROGRAMS.find(item => item.name === data.programName) || null;
        setDraftProgram(program);
        setDraftCohort(data.cohort || '');
        const savedManualCredits = program && isManualTotalCreditsCohort(program.id, data.cohort || '')
            ? normalizeManualTotalCredits(data.totalCreditsRequired)
            : 0;
        setDraftManualTotalCredits(savedManualCredits ? String(savedManualCredits) : '');

        if (program && data.cohort) {
            const major = findMajorFromSavedProfile(
                program,
                data.cohort,
                data.majorName,
                data.specializationName,
            );
            setDraftMajor(major);
            setDraftSpecialization(
                major
                    ? findSpecializationFromSavedProfile(major, data.specializationName)
                    : null,
            );
        } else {
            setDraftMajor(null);
            setDraftSpecialization(null);
        }

        const loadPublicProfileDraft = async () => {
            if (!sessionUserId) return;

            const studentCode = sessionEmail.split('@')[0] || '';
            const { publicProfile } = await fetchOwnPrivateProfile();
            const officialClassName = await fetchDefaultClassName(studentCode);
            if (!active) return;

            setDefaultClassName(officialClassName);
            setDraftBio((publicProfile as any)?.bio || '');
            setDraftClassName((publicProfile as any)?.class_name || profileClassName || officialClassName || '');
            setDraftProfileTags(
                Array.isArray((publicProfile as any)?.profile_tags)
                    ? (publicProfile as any).profile_tags.join(', ')
                    : '',
            );
            setDraftPublicProfileEnabled(Boolean((publicProfile as any)?.public_profile_enabled));
            setDraftShowProfileStats(Boolean((publicProfile as any)?.show_profile_stats));
        };

        void loadPublicProfileDraft();
        return () => {
            active = false;
        };
    }, [
        data,
        open,
        profileAvatarUrl,
        profileFullName,
        sessionEmail,
        sessionUserId,
    ]);

    useEffect(() => {
        return () => {
            if (draftAvatarPreview) {
                URL.revokeObjectURL(draftAvatarPreview);
            }
        };
    }, [draftAvatarPreview]);

    const updatePublicProfileEnabled = useCallback((enabled: boolean) => {
        setDraftPublicProfileEnabled(enabled);
        if (!enabled) setDraftShowProfileStats(false);
    }, []);

    const selectAvatarColor = useCallback((color: string) => {
        setDraftAvatarUrl(color);
        setDraftAvatarFile(null);
        if (draftAvatarPreview) {
            URL.revokeObjectURL(draftAvatarPreview);
            setDraftAvatarPreview('');
        }
    }, [draftAvatarPreview]);

    const selectAvatarFile = useCallback((file: File) => {
        if (draftAvatarPreview) {
            URL.revokeObjectURL(draftAvatarPreview);
        }
        setDraftAvatarFile(file);
        setDraftAvatarUrl('');
        setDraftAvatarPreview(URL.createObjectURL(file));
    }, [draftAvatarPreview]);

    const rejectAvatarFile = useCallback(() => {
        setProfileError('Vui lòng chọn đúng file ảnh.');
    }, []);

    const selectProgram = useCallback((programId: string) => {
        const program = ACADEMIC_PROGRAMS.find(item => item.id === programId) || null;
        setDraftProgram(program);
        setDraftCohort('');
        setDraftMajor(null);
        setDraftSpecialization(null);
        setDraftManualTotalCredits('');
    }, []);

    const selectCohort = useCallback((cohort: string) => {
        setDraftCohort(cohort);
        setDraftMajor(null);
        setDraftSpecialization(null);
        // Do not treat a legacy derived value as input for a new cohort.
        setDraftManualTotalCredits('');
    }, []);

    const selectMajor = useCallback((majorCode: string) => {
        const majors = draftProgram && draftCohort
            ? getMajors(draftProgram.id, draftCohort)
            : [];
        const major = majors.find(item => item.code === majorCode) || null;
        setDraftMajor(major);
        setDraftSpecialization(
            major?.specializations.length === 1
                ? major.specializations[0]
                : null,
        );
    }, [draftCohort, draftProgram]);

    const selectSpecialization = useCallback((specializationName: string) => {
        setDraftSpecialization(
            draftMajor?.specializations.find(
                item => item.name === specializationName,
            ) || null,
        );
    }, [draftMajor]);

    const saveProfile = useCallback(async () => {
        if (!sessionUserId) return;

        setProfileSaving(true);
        setProfileError(null);

        if (
            !draftFullName.trim()
            || !draftClassName.trim()
            || !draftProgram
            || !draftCohort
            || !draftMajor
            || !draftSpecialization
        ) {
            setProfileError(
                'Vui lòng cập nhật đầy đủ họ tên, lớp, hệ đào tạo, khóa, ngành và chuyên ngành.',
            );
            setProfileSaving(false);
            return;
        }

        let avatarUrlToSave = draftAvatarUrl.trim();

        if (draftAvatarFile) {
            setProfileError('Tải ảnh đại diện mới đang tạm bảo trì. Bạn vẫn có thể chọn màu đại diện.');
            setProfileSaving(false);
            return;
        } else if (avatarUrlToSave.startsWith('#')) {
            avatarUrlToSave = getSafeAvatarColor(avatarUrlToSave);
        }

        const studentCode = sessionEmail.split('@')[0];
        const officialClassName =
            defaultClassName || await fetchDefaultClassName(studentCode);
        const classNameInput = draftClassName.trim();
        const classNameToSave = classNameInput;
        const classNameOverridden = Boolean(
            classNameInput
            && (!officialClassName || classNameInput !== officialClassName),
        );
        const validPublicSemesters = data.semesters.filter(
            (semester: any) =>
                /^Học kỳ (1|2|3|Hè) Năm học \d{4}-\d{4}$/.test(semester.name)
                && Array.isArray(semester.subjects)
                && semester.subjects.length > 0,
        );
        const publicStats = calculateCumulativeStats(validPublicSemesters as any);
        const profileTags = draftProfileTags
            .split(',')
            .map(tag => tag.trim())
            .filter(Boolean)
            .slice(0, 6);

        const shouldPublishStats =
            draftPublicProfileEnabled && draftShowProfileStats;
        const profileUpdatePayload = {
            full_name: draftFullName.trim(),
            avatar_url: avatarUrlToSave,
            bio: draftBio.trim() || null,
            class_name: classNameToSave,
            class_name_overridden: classNameOverridden,
            profile_tags: profileTags,
            public_profile_enabled: draftPublicProfileEnabled,
            show_profile_stats: shouldPublishStats,
            public_gpa: shouldPublishStats
                ? Number(publicStats.rawGPA4.toFixed(2))
                : null,
            public_completed_semesters: shouldPublishStats
                ? validPublicSemesters.length
                : null,
            public_credits: shouldPublishStats ? publicStats.passedCredits : null,
        };

        const nextData = {
            ...data,
            studentName: draftFullName.trim(),
            programName: draftProgram.name || data.programName,
            cohort: draftCohort || data.cohort,
            majorName: draftMajor.name || data.majorName,
            specializationName:
                draftSpecialization.name || data.specializationName,
            totalCreditsRequired: isManualTotalCreditsCohort(draftProgram.id, draftCohort)
                ? normalizeManualTotalCredits(draftManualTotalCredits)
                : draftSpecialization.credits || data.totalCreditsRequired,
        };

        try {
            await updateOwnPrivateProfile({
                publicProfile: profileUpdatePayload,
                privateProfile: { data: nextData },
            });
        } catch (privateError: any) {
            console.error(
                'Không thể lưu dữ liệu học tập riêng tư:',
                privateError,
            );
            setProfileError(
                privateError?.message
                || 'Không thể lưu dữ liệu học tập riêng tư. Vui lòng thử lại.',
            );
            setProfileSaving(false);
            return;
        }

        setProfileFullName(draftFullName.trim());
        setProfileAvatarUrl(avatarUrlToSave);
        setProfileClassName(classNameToSave);
        setDraftAvatarFile(null);
        if (draftAvatarPreview) {
            URL.revokeObjectURL(draftAvatarPreview);
            setDraftAvatarPreview('');
        }

        commitDataUpdate(previousData => ({
            ...previousData,
            studentName: draftFullName.trim(),
            programName: draftProgram.name || previousData.programName,
            cohort: draftCohort || previousData.cohort,
            majorName: draftMajor.name || previousData.majorName,
            specializationName:
                draftSpecialization.name || previousData.specializationName,
            totalCreditsRequired: isManualTotalCreditsCohort(draftProgram.id, draftCohort)
                ? normalizeManualTotalCredits(draftManualTotalCredits)
                : draftSpecialization.credits || previousData.totalCreditsRequired,
        }));

        setProfileRefreshKey(previous => previous + 1);
        setProfileSaving(false);
        onSaved();
    }, [
        commitDataUpdate,
        data,
        defaultClassName,
        draftAvatarFile,
        draftAvatarPreview,
        draftAvatarUrl,
        draftBio,
        draftClassName,
        draftCohort,
        draftFullName,
        draftMajor,
        draftManualTotalCredits,
        draftProfileTags,
        draftProgram,
        draftPublicProfileEnabled,
        draftShowProfileStats,
        draftSpecialization,
        onSaved,
        sessionEmail,
        sessionUserId,
        setProfileAvatarUrl,
        setProfileClassName,
        setProfileFullName,
    ]);

    return {
        draftFullName,
        setDraftFullName,
        draftAvatarUrl,
        draftBio,
        setDraftBio,
        draftClassName,
        setDraftClassName,
        defaultClassName,
        draftProfileTags,
        setDraftProfileTags,
        draftPublicProfileEnabled,
        updatePublicProfileEnabled,
        draftShowProfileStats,
        setDraftShowProfileStats,
        profileRefreshKey,
        draftAvatarPreview,
        selectAvatarColor,
        selectAvatarFile,
        rejectAvatarFile,
        profileSaving,
        profileError,
        draftProgram,
        selectProgram,
        draftCohort,
        selectCohort,
        draftMajor,
        selectMajor,
        draftSpecialization,
        selectSpecialization,
        draftManualTotalCredits,
        setDraftManualTotalCredits,
        programOptions: ACADEMIC_PROGRAMS,
        cohortOptions,
        majorOptions,
        saveProfile,
    };
};

export type AccountProfileDraftController = ReturnType<typeof useAccountProfileDraft>;
