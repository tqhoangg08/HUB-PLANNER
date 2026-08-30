import { Navigate, useLocation } from 'react-router-dom';
import { RecoveryAccountScreen } from './components/RecoveryAccountScreen';
import { LoginScreen } from './components/LoginScreen';
import { RecoveryForgotPasswordScreen } from './components/RecoveryForgotPasswordScreen';
import { RecoveryResetPasswordScreen } from './components/RecoveryResetPasswordScreen';
import { StaffPasswordActivationScreen } from './components/StaffPasswordActivationScreen';
import { AUTH_MAINTENANCE_MODE, PASSWORD_RECOVERY_ENABLED } from './utils/rescueMode';

const App = () => {
    const location = useLocation();

    if (AUTH_MAINTENANCE_MODE && location.pathname === '/login') {
        return <LoginScreen />;
    }

    if (AUTH_MAINTENANCE_MODE && location.pathname === '/account') {
        return <RecoveryAccountScreen />;
    }

    if (AUTH_MAINTENANCE_MODE && location.pathname === '/forgot-password') {
        return PASSWORD_RECOVERY_ENABLED
            ? <RecoveryForgotPasswordScreen />
            : <Navigate to="/login" replace />;
    }

    if (AUTH_MAINTENANCE_MODE && location.pathname === '/reset-password') {
        return PASSWORD_RECOVERY_ENABLED
            ? <RecoveryResetPasswordScreen />
            : <Navigate to="/login" replace />;
    }

    if (AUTH_MAINTENANCE_MODE && location.pathname === '/staff/login') {
        return <Navigate to="/login" replace />;
    }

    if (AUTH_MAINTENANCE_MODE && location.pathname === '/staff/activate') {
        return <StaffPasswordActivationScreen />;
    }

    if (AUTH_MAINTENANCE_MODE && location.pathname === '/staff/reset-password') {
        return <RecoveryResetPasswordScreen returnTo="/staff/login?password-reset=success" />;
    }

    return null;
};

export default App;
