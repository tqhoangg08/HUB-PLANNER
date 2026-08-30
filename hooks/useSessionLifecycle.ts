import { useEffect, useRef, useState } from 'react';
import type { AppSession } from '../utils/privateApi';
import { logActivityQuietly } from '../utils/activityLogger';
import { recordPolicyConsent } from '../utils/policyConsent';
import { fetchProfilePrivate, updateProfilePrivate, upsertProfilePrivate } from '../utils/profilePrivate';
import {
    isPushNotificationSyncAvailable,
    setActivePushNotificationUser,
    subscribeToDeviceNotifications,
} from '../utils/pushNotifications';

const PUSH_DEVICE_SYNC_MIN_INTERVAL_MS = 10 * 60 * 1000;
const PENDING_REGISTRATION_CONSENT_KEY = 'hubplanner:pending-registration-consent';

interface UseSessionLifecycleOptions {
    session: AppSession | null;
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
    const sessionUserId = session?.user?.id || null;
    const sessionEmail = session?.user?.email || '';
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
                authProvider: 'better-auth',
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
        if (!sessionUserId || !isPushNotificationSyncAvailable() || Notification.permission !== 'granted') return;

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
        setPasswordSetupSchemaMissing(false);
        setPasswordSetAt(sessionUserId ? 'better-auth-managed' : undefined);
    }, [sessionUserId]);

    return {
        passwordSetAt,
        setPasswordSetAt,
        passwordSetupSchemaMissing,
    };
};
