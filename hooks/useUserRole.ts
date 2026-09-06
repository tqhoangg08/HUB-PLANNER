import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchBetterAuthSession,
  SessionIdentityUnavailableError,
  type AppSession,
  type BetterAuthRole,
} from '../utils/privateApi';

export type UserRole = 'admin' | 'auditor' | 'student';

interface UserRoleState {
  role: UserRole;
  isAdmin: boolean;
  isAuditor: boolean;
  isCTV: boolean;
  isStudent: boolean;
  loading: boolean;
  bootstrapUnavailable: boolean;
  userEmail: string | null;
  session: AppSession | null;
}

export interface AuthRefreshOptions {
  preserveStateOnError?: boolean;
}

export interface AuthRefreshResult {
  authenticated: boolean;
  session: AppSession | null;
  current: boolean;
  failure: 'anonymous' | 'unavailable' | null;
}

export type AuthRefresh = (options?: AuthRefreshOptions) => Promise<AuthRefreshResult>;

const normalizeRole = (role: BetterAuthRole): UserRole =>
  role === 'admin' || role === 'auditor' ? role : 'student';

const stateForSession = (session: AppSession): UserRoleState => {
  const role = normalizeRole(session.role);
  return {
    role,
    isAdmin: role === 'admin',
    isAuditor: role === 'auditor',
    isCTV: false,
    isStudent: role === 'student',
    loading: false,
    bootstrapUnavailable: false,
    userEmail: session.user.email,
    session,
  };
};

const anonymousState: UserRoleState = {
  role: 'student',
  isAdmin: false,
  isAuditor: false,
  isCTV: false,
  isStudent: true,
  loading: false,
  bootstrapUnavailable: false,
  userEmail: null,
  session: null,
};

export const useUserRole = () => {
  const [state, setState] = useState<UserRoleState>({
    ...anonymousState,
    loading: true,
  });
  const refreshGenerationRef = useRef(0);

  const refreshAuth = useCallback<AuthRefresh>(async () => {
    const requestGeneration = ++refreshGenerationRef.current;

    try {
      const session = await fetchBetterAuthSession();
      const current = requestGeneration === refreshGenerationRef.current;

      if (current) {
        setState(session ? stateForSession(session) : anonymousState);
      }

      return {
        authenticated: Boolean(session),
        session,
        current,
        failure: session ? null : 'anonymous',
      };
    } catch (error) {
      const current = requestGeneration === refreshGenerationRef.current;

      if (current) {
        if (error instanceof SessionIdentityUnavailableError) {
          // Better Auth has confirmed this session.  Render with the
          // least-privileged role while the bounded retry above and subsequent
          // visibility refreshes restore the authoritative role.
          setState(stateForSession(error.session));
        } else {
          // Never redirect to Login from a transient failure.  If there is no
          // identity to preserve yet, end the spinner and offer an explicit
          // retry instead.
          setState((previous) => previous.session
            ? { ...previous, loading: false, bootstrapUnavailable: false }
            : { ...anonymousState, bootstrapUnavailable: true });
        }
      }

      return {
        authenticated: error instanceof SessionIdentityUnavailableError,
        session: error instanceof SessionIdentityUnavailableError ? error.session : null,
        current,
        failure: 'unavailable',
      };
    }
  }, []);

  useEffect(() => {
    const refreshOnFocus = () => {
      if (document.visibilityState === 'visible') void refreshAuth();
    };

    refreshOnFocus();
    window.addEventListener('focus', refreshOnFocus);
    window.addEventListener('online', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnFocus);
    const refreshTimer = window.setInterval(refreshOnFocus, 60_000);
    return () => {
      refreshGenerationRef.current += 1;
      window.removeEventListener('focus', refreshOnFocus);
      window.removeEventListener('online', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnFocus);
      window.clearInterval(refreshTimer);
    };
  }, [refreshAuth]);

  return { ...state, refreshAuth };
};
