import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchBetterAuthSession,
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
  userEmail: null,
  session: null,
};

export const useUserRole = () => {
  const [state, setState] = useState<UserRoleState>({
    ...anonymousState,
    loading: true,
  });
  const refreshGenerationRef = useRef(0);

  const refreshAuth = useCallback<AuthRefresh>(async ({ preserveStateOnError = false } = {}) => {
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
    } catch {
      const current = requestGeneration === refreshGenerationRef.current;

      if (current && !preserveStateOnError) {
        setState(anonymousState);
      }

      return {
        authenticated: false,
        session: null,
        current,
        failure: 'unavailable',
      };
    }
  }, []);

  useEffect(() => {
    const refreshOnFocus = () => {
      void refreshAuth();
    };

    refreshOnFocus();
    window.addEventListener('focus', refreshOnFocus);
    return () => {
      refreshGenerationRef.current += 1;
      window.removeEventListener('focus', refreshOnFocus);
    };
  }, [refreshAuth]);

  return { ...state, refreshAuth };
};
