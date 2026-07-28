import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { logActivityQuietly } from '../utils/activityLogger';
import { recordPolicyConsent } from '../utils/policyConsent';
import { fetchProfilePrivate, updateProfilePrivate, upsertProfilePrivate } from '../utils/profilePrivate';
import {
    isPushSupported,
    setActivePushNotificationUser,
    subscribeToDeviceNotifications,
} from '../utils/pushNotifications';
import { supabase } from '../utils/supabase';

const PUSH_DEVICE_SYNC_MIN_INTERVAL_MS = 10 * 60 * 1000;
const PENDING_REGISTRATION_CONSENT_KEY = 'hubplanner:pending-registration-consent';

interface UseSessionLifecycleOptions {
    session: Session | null;
    isAdmin: boolean;
    isAuditor: boolean;
    loadingRole: boolean;
    pathname: string;
}

interface PendingRegistrationConsent {
    policies?: unknown;
    context?: string;
}

type PolicyConsentContext = 'registration' | 'ai_usage' | 'oauth_registration';

const isMissingProfileColumn = (error: any, columnName: string) => {
    const message = `${error?.message || ''} ${error?.details || ''}`;
    return (
        message.includes(columnName)
        || error?.code === '42703'
        || error?.code === 'PGRST204'
    );
};

export const useSessionLifecycle = ({
    session,
    isAdmin,
    isAuditor,
    loadingRole,
    pathname,
}: UseSessionLifecycleOptions) => {
    const sessionUserId = session?.user.id || null;
    const sessionEmail = session?.user.email || '';
    const [passwordSetAt, setPasswordSetAt] = useState<string | null | undefined>(undefined);
    const [passwordSetupSchemaMissing, setPasswordSetupSchemaMissing] = useState(false);
    const lastLoggedUserIdRef = useRef<string | null>(null);
    const lastPushDeviceSyncRef = useRef<{ userId: string | null; syncedAt: number }>({
        userId: null,
        syncedAt: 0,
    });

    useEffect(() => {
        if (!sessionUserId) return;
        const pendingRaw = localStorage.getItem(PENDING_REGISTRATION_CONSENT_KEY);
        if (!pendingRaw) return;

        let pending: PendingRegistrationConsent;
        try {
            pending = JSON.parse(pendingRaw) as PendingRegistrationConsent;
        } catch {
            localStorage.removeItem(PENDING_REGISTRATION_CONSENT_KEY);
            return;
        }

        const policies = Array.isArray(pending.policies)
            ? pending.policies.filter((policy): policy is string => typeof policy === 'string')
            : [];
        if (!policies.length) {
            localStorage.removeItem(PENDING_REGISTRATION_CONSENT_KEY);
            return;
        }
        const context: PolicyConsentContext = (
            pending.context === 'registration'
            || pending.context === 'ai_usage'
            || pending.context === 'oauth_registration'
        )
            ? pending.context
            : 'oauth_registration';

        void Promise.all(policies.map(policyType => (
            recordPolicyConsent(policyType, context)
        ))).finally(() => {
            localStorage.removeItem(PENDING_REGISTRATION_CONSENT_KEY);
        });
    }, [sessionUserId]);

    useEffect(() => {
        if (!sessionUserId) {
            lastLoggedUserIdRef.current = null;
            return;
        }
        if (
            lastLoggedUserIdRef.current === sessionUserId
            || loadingRole
            || !(isAdmin || isAuditor)
            || !session
        ) {
            return;
        }

        lastLoggedUserIdRef.current = sessionUserId;
        logActivityQuietly({
            action: 'login',
            session,
            userRole: isAdmin ? 'admin' : 'auditor',
            pagePath: pathname,
            metadata: {
                authProvider: session.user.app_metadata?.provider || 'unknown',
            },
        });
    }, [isAdmin, isAuditor, loadingRole, pathname, sessionUserId]);

    useEffect(() => {
        setActivePushNotificationUser(sessionUserId);
        return () => {
            setActivePushNotificationUser(null);
        };
    }, [sessionUserId]);

    useEffect(() => {
        if (!sessionUserId || !isPushSupported() || Notification.permission !== 'granted') return;

        const syncPushDevice = (force = false) => {
            const now = Date.now();
            const lastSync = lastPushDeviceSyncRef.current;
            if (
                !force
                && lastSync.userId === sessionUserId
                && now - lastSync.syncedAt < PUSH_DEVICE_SYNC_MIN_INTERVAL_MS
            ) {
                return;
            }

            lastPushDeviceSyncRef.current = { userId: sessionUserId, syncedAt: now };
            void subscribeToDeviceNotifications(sessionUserId).catch(error => {
                console.error('Không thể đồng bộ thiết bị nhận thông báo:', error);
            });
        };

        syncPushDevice(true);
        const handleVisibilityChange = () => {
            if (!document.hidden) syncPushDevice();
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [sessionUserId]);

    useEffect(() => {
        let active = true;

        const loadPasswordStatus = async () => {
            setPasswordSetupSchemaMissing(false);
            if (!sessionUserId || !session) {
                if (active) setPasswordSetAt(undefined);
                return;
            }

            let profilePasswordSetAt: string | null | undefined;
            let privateProfileMissing = false;

            try {
                const privateProfile = await fetchProfilePrivate(sessionUserId);
                profilePasswordSetAt = privateProfile?.password_set_at;
                privateProfileMissing = !privateProfile;
            } catch (error) {
                console.warn('Không thể kiểm tra trạng thái mật khẩu private:', error);
                if (active && isMissingProfileColumn(error, 'password_set_at')) {
                    setPasswordSetupSchemaMissing(true);
                    setPasswordSetAt(undefined);
                    return;
                }
                privateProfileMissing = true;
            }

            if (!active) return;

            const authProvider = String(session.user.app_metadata?.provider || '').toLowerCase();
            const identityProviders = Array.isArray(session.user.identities)
                ? session.user.identities.map(identity => String(identity?.provider || '').toLowerCase())
                : [];
            const isGoogleAuthSession =
                authProvider === 'google'
                || identityProviders.includes('google');

            if (!profilePasswordSetAt && !isGoogleAuthSession) {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('password_set_at')
                    .eq('id', sessionUserId)
                    .maybeSingle();

                if (!active) return;
                if (error) {
                    if (isMissingProfileColumn(error, 'password_set_at')) {
                        setPasswordSetupSchemaMissing(true);
                        setPasswordSetAt(undefined);
                        return;
                    }
                    console.warn('Không thể kiểm tra trạng thái mật khẩu legacy:', error);
                } else {
                    profilePasswordSetAt = (data as { password_set_at?: string | null } | null)
                        ?.password_set_at;
                }
            }

            const metadataPasswordSet =
                !isGoogleAuthSession
                && Boolean(session.user.user_metadata?.password_set_at);
            if (!profilePasswordSetAt && metadataPasswordSet) {
                const markedAt = new Date().toISOString();
                setPasswordSetAt(markedAt);
                const syncPrivate = privateProfileMissing
                    ? upsertProfilePrivate({
                        user_id: sessionUserId,
                        email: sessionEmail,
                        password_set_at: markedAt,
                        updated_at: markedAt,
                    })
                    : updateProfilePrivate(sessionUserId, {
                        password_set_at: markedAt,
                        updated_at: markedAt,
                    });
                void syncPrivate.catch(error => {
                    console.warn('Không thể đồng bộ trạng thái mật khẩu:', error);
                });
                return;
            }

            setPasswordSetAt(profilePasswordSetAt ?? null);
        };

        void loadPasswordStatus();
        return () => {
            active = false;
        };
    }, [sessionUserId]);

    return {
        passwordSetAt,
        setPasswordSetAt,
        passwordSetupSchemaMissing,
    };
};
