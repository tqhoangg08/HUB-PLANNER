import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Semester, UserData } from '../types';
import { STORAGE_KEY } from '../types';
import {
    hasMeaningfulStudyData,
    INITIAL_STUDY_DATA,
    normalizeLoadedUserData,
    REMOTE_SAVE_DEBOUNCE_MS,
} from '../features/study-data/model';
import { fetchProfilePrivate, updateProfilePrivate, upsertProfilePrivate } from '../utils/profilePrivate';
import { supabase } from '../utils/supabase';

const STUDENT_PROFILE_TABLE = 'profiles';

interface ViewingUser {
    id: string;
    mssv: string;
    name: string;
}

interface UseStudyDataOptions {
    session: Session | null;
    isAdmin: boolean;
    isAuditor: boolean;
    viewingUser: ViewingUser | null;
    pathname: string;
    profileFullName: string;
    profileAvatarUrl: string;
    setProfileFullName: (value: string) => void;
    setProfileAvatarUrl: (value: string) => void;
}

const getStorageDirtyKey = (key: string) => `${key}:dirty`;

const isMissingLegacyProfileColumn = (error: any, columnName: string) => {
    const message = `${error?.message || ''} ${error?.details || ''}`;
    return message.includes(columnName) || error?.code === '42703' || error?.code === 'PGRST204';
};

const fetchLegacyProfileData = async (userId: string) => {
    const { data, error } = await supabase
        .from(STUDENT_PROFILE_TABLE)
        .select('data')
        .eq('id', userId)
        .maybeSingle();

    if (error) {
        if (!isMissingLegacyProfileColumn(error, 'data')) {
            console.warn('Không thể đọc profiles.data legacy:', error);
        }
        return null;
    }

    return (data as any)?.data || null;
};

export const useStudyData = ({
    session,
    isAdmin,
    isAuditor,
    viewingUser,
    pathname,
    profileFullName,
    profileAvatarUrl,
    setProfileFullName,
    setProfileAvatarUrl,
}: UseStudyDataOptions) => {
    const [data, setData] = useState<UserData>(INITIAL_STUDY_DATA);
    const [isLoaded, setIsLoaded] = useState(false);
    const dataRef = useRef<UserData>(INITIAL_STUDY_DATA);
    const dataOwnerIdRef = useRef<string | null>(null);
    const saveTimeoutRef = useRef<number | null>(null);
    const lastPrivateSaveRef = useRef<{ ownerId: string | null; signature: string | null }>({
        ownerId: null,
        signature: null,
    });
    const lastLocationPathRef = useRef(pathname);

    const isGuest = !session;
    const sessionUserId = session?.user.id || null;
    const sessionEmail = session?.user.email || '';
    const sessionMetaName =
        session?.user.user_metadata.full_name
        || session?.user.user_metadata.name
        || '';
    const sessionMetaAvatar =
        session?.user.user_metadata.avatar_url
        || session?.user.user_metadata.picture
        || '';
    const userRole: 'guest' | 'school' | 'admin' = session
        ? (isAdmin ? 'admin' : 'school')
        : 'guest';

    const targetUserId = useMemo(() => {
        if (!sessionUserId) return null;
        return ((isAdmin || isAuditor) && viewingUser)
            ? viewingUser.id
            : sessionUserId;
    }, [isAdmin, isAuditor, sessionUserId, viewingUser]);

    const storageKey = useMemo(
        () => targetUserId ? `${STORAGE_KEY}:${targetUserId}` : STORAGE_KEY,
        [targetUserId],
    );

    const commitDataUpdate = useCallback((updater: (previousData: UserData) => UserData) => {
        const nextData = updater(dataRef.current);
        dataRef.current = nextData;
        setData(nextData);
    }, []);

    const loadDataIntoState = useCallback((nextData: UserData) => {
        dataRef.current = nextData;
        setData(nextData);
    }, []);

    const resetStudyData = useCallback((ownerId: string | null = null) => {
        loadDataIntoState(INITIAL_STUDY_DATA);
        dataOwnerIdRef.current = ownerId;
        lastPrivateSaveRef.current = { ownerId: null, signature: null };
    }, [loadDataIntoState]);

    useEffect(() => {
        dataRef.current = data;
    }, [data]);

    useEffect(() => {
        if (!sessionUserId) return;
        Object.keys(localStorage)
            .filter(key => key === STORAGE_KEY || key.startsWith(`${STORAGE_KEY}:`))
            .forEach(key => localStorage.removeItem(key));
    }, [sessionUserId]);

    const saveStudyDataToRemote = useCallback(async (dataToSave: UserData) => {
        if ((userRole !== 'school' && userRole !== 'admin') || !sessionUserId || !targetUserId) {
            return false;
        }
        if (dataOwnerIdRef.current !== targetUserId || !hasMeaningfulStudyData(dataToSave)) {
            return false;
        }

        const signature = JSON.stringify(dataToSave);
        if (
            lastPrivateSaveRef.current.ownerId === targetUserId
            && lastPrivateSaveRef.current.signature === signature
        ) {
            localStorage.removeItem(getStorageDirtyKey(storageKey));
            return true;
        }

        if (isAdmin && viewingUser) {
            await updateProfilePrivate(targetUserId, {
                data: dataToSave,
                updated_at: new Date().toISOString(),
            });

            const { error } = await supabase
                .from(STUDENT_PROFILE_TABLE)
                .update({ updated_at: new Date().toISOString() })
                .eq('id', targetUserId);

            if (error) console.error('Lỗi Admin update data user:', error);
        } else if (!isAuditor) {
            const nameToSave = profileFullName || sessionMetaName;
            const { error } = await supabase
                .from(STUDENT_PROFILE_TABLE)
                .update({
                    full_name: nameToSave,
                    avatar_url: profileAvatarUrl,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', sessionUserId);

            if (error) console.error('Lỗi update hồ sơ công khai:', error);

            await upsertProfilePrivate({
                user_id: sessionUserId,
                email: sessionEmail,
                data: dataToSave,
                updated_at: new Date().toISOString(),
            });

            if (!error && !profileFullName && nameToSave) {
                setProfileFullName(nameToSave);
            }
        } else {
            return false;
        }

        lastPrivateSaveRef.current = { ownerId: targetUserId, signature };
        localStorage.removeItem(getStorageDirtyKey(storageKey));
        return true;
    }, [
        isAdmin,
        isAuditor,
        profileAvatarUrl,
        profileFullName,
        sessionEmail,
        sessionMetaName,
        sessionUserId,
        setProfileFullName,
        storageKey,
        targetUserId,
        userRole,
        viewingUser,
    ]);

    useEffect(() => {
        let isActive = true;
        setIsLoaded(false);
        if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
        lastPrivateSaveRef.current = { ownerId: null, signature: null };

        const loadData = async () => {
            if ((userRole === 'school' || userRole === 'admin') && sessionUserId) {
                if ((isAdmin || isAuditor) && viewingUser) {
                    let privateData: Record<string, any> | null | undefined = null;
                    try {
                        privateData = (await fetchProfilePrivate(viewingUser.id))?.data;
                    } catch (error) {
                        console.warn('Không thể đọc dữ liệu học tập private:', error);
                    }
                    const legacyData = privateData ? null : await fetchLegacyProfileData(viewingUser.id);
                    if (!isActive) return;

                    if (privateData || legacyData) {
                        const remoteData = normalizeLoadedUserData(privateData || legacyData);
                        loadDataIntoState(remoteData);
                        lastPrivateSaveRef.current = {
                            ownerId: viewingUser.id,
                            signature: JSON.stringify(remoteData),
                        };
                    } else {
                        loadDataIntoState(INITIAL_STUDY_DATA);
                    }

                    dataOwnerIdRef.current = viewingUser.id;
                    setIsLoaded(true);
                    return;
                }

                const { data: profileData } = await supabase
                    .from(STUDENT_PROFILE_TABLE)
                    .select('full_name, avatar_url, bio, class_name, profile_tags, show_profile_stats')
                    .eq('id', sessionUserId)
                    .maybeSingle();
                let privateData: Record<string, any> | null | undefined = null;
                try {
                    privateData = (await fetchProfilePrivate(sessionUserId))?.data;
                } catch (error) {
                    console.warn('Không thể đọc dữ liệu học tập private:', error);
                }
                const legacyData = privateData ? null : await fetchLegacyProfileData(sessionUserId);
                if (!isActive) return;

                const remoteData = hasMeaningfulStudyData(privateData || legacyData)
                    ? normalizeLoadedUserData(privateData || legacyData)
                    : null;

                if (remoteData) {
                    loadDataIntoState(remoteData);
                    lastPrivateSaveRef.current = {
                        ownerId: sessionUserId,
                        signature: JSON.stringify(remoteData),
                    };
                    setProfileFullName(profileData?.full_name || '');
                    setProfileAvatarUrl(profileData?.avatar_url || '');
                    dataOwnerIdRef.current = sessionUserId;
                    setIsLoaded(true);
                    return;
                }

                setProfileFullName(sessionMetaName);
                setProfileAvatarUrl(sessionMetaAvatar);
                loadDataIntoState(INITIAL_STUDY_DATA);
                dataOwnerIdRef.current = sessionUserId;
                setIsLoaded(true);
                return;
            }

            setProfileFullName('');
            setProfileAvatarUrl('');
            loadDataIntoState(INITIAL_STUDY_DATA);
            dataOwnerIdRef.current = isGuest ? 'guest' : null;
            setIsLoaded(true);
        };

        void loadData();
        return () => {
            isActive = false;
        };
    }, [
        isAdmin,
        isAuditor,
        isGuest,
        loadDataIntoState,
        sessionMetaAvatar,
        sessionMetaName,
        sessionUserId,
        setProfileAvatarUrl,
        setProfileFullName,
        targetUserId,
        userRole,
        viewingUser,
    ]);

    useEffect(() => {
        if (
            !isLoaded
            || (userRole !== 'school' && userRole !== 'admin')
            || !sessionUserId
        ) {
            return;
        }

        if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = window.setTimeout(() => {
            void saveStudyDataToRemote(data).catch(error => {
                console.error('Lỗi lưu profile_private_data:', error);
            });
        }, REMOTE_SAVE_DEBOUNCE_MS);

        return () => {
            if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
        };
    }, [data, isLoaded, saveStudyDataToRemote, sessionUserId, userRole]);

    useEffect(() => {
        if (!isLoaded || !sessionUserId || viewingUser || !hasMeaningfulStudyData(data)) return;

        const flushPendingSave = () => {
            if (saveTimeoutRef.current) {
                window.clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
            void saveStudyDataToRemote(data).catch(error => {
                console.error('Lỗi flush dữ liệu học tập:', error);
            });
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') flushPendingSave();
        };

        window.addEventListener('pagehide', flushPendingSave);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            window.removeEventListener('pagehide', flushPendingSave);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [data, isLoaded, saveStudyDataToRemote, sessionUserId, viewingUser]);

    useEffect(() => {
        if (lastLocationPathRef.current === pathname) return;
        lastLocationPathRef.current = pathname;
        if (!isLoaded || !sessionUserId || viewingUser || !hasMeaningfulStudyData(data)) return;

        if (saveTimeoutRef.current) {
            window.clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
        void saveStudyDataToRemote(data).catch(error => {
            console.error('Lỗi lưu dữ liệu khi chuyển trang:', error);
        });
    }, [data, isLoaded, pathname, saveStudyDataToRemote, sessionUserId, viewingUser]);

    const saveSemestersNow = useCallback(async (semesters: Semester[]) => {
        const nextData = { ...dataRef.current, semesters };
        loadDataIntoState(nextData);
        let saved = await saveStudyDataToRemote(nextData);

        if (!saved && sessionUserId && !viewingUser && !isAuditor) {
            await upsertProfilePrivate({
                user_id: sessionUserId,
                email: sessionEmail,
                data: nextData,
                updated_at: new Date().toISOString(),
            });
            saved = true;
        }
        if (!saved) throw new Error('Không thể lưu bảng điểm lúc này.');

        lastPrivateSaveRef.current = {
            ownerId: targetUserId,
            signature: JSON.stringify(nextData),
        };
        localStorage.removeItem(getStorageDirtyKey(storageKey));
    }, [
        isAuditor,
        loadDataIntoState,
        saveStudyDataToRemote,
        sessionEmail,
        sessionUserId,
        storageKey,
        targetUserId,
        viewingUser,
    ]);

    const completeOnboarding = useCallback(async (onboardingData: Partial<UserData>) => {
        const nextData = {
            ...dataRef.current,
            ...onboardingData,
            hasOnboarded: true,
        };
        loadDataIntoState(nextData);

        if (sessionUserId && !viewingUser && !isAuditor) {
            try {
                let saved = await saveStudyDataToRemote(nextData);
                if (!saved) {
                    await upsertProfilePrivate({
                        user_id: sessionUserId,
                        email: sessionEmail,
                        data: nextData,
                        updated_at: new Date().toISOString(),
                    });
                    saved = true;
                }
                if (saved) {
                    lastPrivateSaveRef.current = {
                        ownerId: sessionUserId,
                        signature: JSON.stringify(nextData),
                    };
                }
            } catch (error) {
                console.error('Không thể lưu onboarding profile:', error);
            }
        }
    }, [
        isAuditor,
        loadDataIntoState,
        saveStudyDataToRemote,
        sessionEmail,
        sessionUserId,
        viewingUser,
    ]);

    return {
        data,
        isLoaded,
        commitDataUpdate,
        resetStudyData,
        saveSemestersNow,
        completeOnboarding,
    };
};
