import React, { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LogOut, Moon, RefreshCw, WifiOff } from 'lucide-react';
import { useStore } from './stores/useStore';
import { Navbar } from './components/Navbar';
import { MobileBottomNav } from './components/MobileBottomNav';
import { Auth } from './pages/Auth';
import { Dashboard } from './pages/Dashboard';
import { Leaderboard } from './pages/Leaderboard';
import { Badges } from './pages/Badges';
import { Settings } from './pages/Settings';
import { History } from './pages/History';
import { Landing } from './pages/Landing';
import { Onboarding } from './pages/Onboarding';
import { syncReminderTimeZone } from './services/push';

const StarrySky: React.FC = () => {
  return (
    <div className="stars-container" aria-hidden="true">
      <div className="star" style={{ top: '15%', left: '10%', width: '4px', height: '4px', animationDelay: '0s' }}></div>
      <div className="star" style={{ top: '25%', left: '40%', width: '3px', height: '3px', animationDelay: '1s' }}></div>
      <div className="star" style={{ top: '10%', left: '75%', width: '5px', height: '5px', animationDelay: '2.5s' }}></div>
      <div className="star" style={{ top: '45%', left: '20%', width: '3px', height: '3px', animationDelay: '0.8s' }}></div>
      <div className="star" style={{ top: '65%', left: '85%', width: '4px', height: '4px', animationDelay: '1.8s' }}></div>
      <div className="star" style={{ top: '80%', left: '45%', width: '3px', height: '3px', animationDelay: '3.2s' }}></div>
      <div className="star" style={{ top: '55%', left: '60%', width: '6px', height: '6px', animationDelay: '2.1s' }}></div>
      <div className="star" style={{ top: '90%', left: '15%', width: '4px', height: '4px', animationDelay: '0.4s' }}></div>
      <div className="star" style={{ top: '35%', left: '90%', width: '3px', height: '3px', animationDelay: '1.5s' }}></div>
    </div>
  );
};

const SessionGateFallback: React.FC<{
  failed: boolean;
  errorMessage: string | null;
  onRetry: () => void;
  onLogout: () => void;
}> = ({ failed, errorMessage, onRetry, onLogout }) => (
  <main className="session-gate" aria-live="polite" aria-busy={!failed}>
    <section className={`session-gate-card${failed ? ' is-error' : ''}`}>
      <div className="session-gate-icon" aria-hidden="true">
        {failed ? <WifiOff size={25} /> : <Moon size={25} />}
      </div>

      {failed ? (
        <>
          <p className="session-gate-kicker">Connection paused</p>
          <h1>Koala couldn’t reach the server</h1>
          <p className="session-gate-copy">
            {errorMessage || 'The service is temporarily unavailable. Please try again.'}
          </p>
          <div className="session-gate-actions">
            <button type="button" className="session-gate-primary" onClick={onRetry}>
              <RefreshCw size={17} />
              Try again
            </button>
            <button type="button" className="session-gate-secondary" onClick={onLogout}>
              <LogOut size={16} />
              Log out
            </button>
          </div>
          <p className="session-gate-hint">
            {import.meta.env.DEV
              ? <>Local development expects the API at <code>localhost:5125</code>.</>
              : 'The service may be waking up. Wait a moment, then try again.'}
          </p>
        </>
      ) : (
        <>
          <p className="session-gate-kicker">One quiet moment</p>
          <h1>Waking Koala…</h1>
          <p className="session-gate-copy">Checking your bedtime settings.</p>
          <span className="session-gate-loader" aria-hidden="true" />
        </>
      )}
    </section>
  </main>
);

const useSettingsGate = () => {
  const { token, onboardingCompleted, loadSettings, logout, error, setError } = useStore();
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    if (!token || onboardingCompleted !== null) {
      setLoadFailed(false);
      return () => { cancelled = true; };
    }

    setLoadFailed(false);
    void loadSettings().then((settings) => {
      if (!cancelled && !settings && useStore.getState().token) {
        setLoadFailed(true);
      }
    });

    return () => { cancelled = true; };
  }, [attempt, loadSettings, onboardingCompleted, token]);

  const retry = useCallback(() => {
    setError(null);
    setAttempt((currentAttempt) => currentAttempt + 1);
  }, [setError]);

  return {
    token,
    onboardingCompleted,
    loadFailed,
    error,
    retry,
    logout,
  };
};

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, onboardingCompleted, loadFailed, error, retry, logout } = useSettingsGate();
  
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (onboardingCompleted === null) {
    return (
      <SessionGateFallback
        failed={loadFailed}
        errorMessage={error}
        onRetry={retry}
        onLogout={logout}
      />
    );
  }

  if (!onboardingCompleted) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <div className="app-shell">
      <Navbar />
      <main className="main-wrapper">
        {children}
      </main>
      <MobileBottomNav />
    </div>
  );
};

const HomeRoute: React.FC = () => {
  const { token } = useStore();
  return token ? <Navigate to="/dashboard" replace /> : <Landing />;
};

const OnboardingRoute: React.FC = () => {
  const { token, onboardingCompleted, loadFailed, error, retry, logout } = useSettingsGate();

  if (!token) return <Navigate to="/login" replace />;
  if (onboardingCompleted === null) {
    return (
      <SessionGateFallback
        failed={loadFailed}
        errorMessage={error}
        onRetry={retry}
        onLogout={logout}
      />
    );
  }
  if (onboardingCompleted) return <Navigate to="/dashboard" replace />;
  return <Onboarding />;
};

const App: React.FC = () => {
  const token = useStore(state => state.token);
  useEffect(() => {
    if (!token) return;
    const sync = () => {
      if (document.visibilityState === 'visible') void syncReminderTimeZone(token).catch(() => {});
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [token]);
  return (
    <BrowserRouter>
      {/* Dynamic Starry Sky Background Layer */}
      <StarrySky />
      
      <Routes>
        {/* Auth Route */}
        <Route path="/login" element={<Auth />} />
        
        <Route path="/" element={<HomeRoute />} />
        <Route path="/onboarding" element={<OnboardingRoute />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        
        {/* Protected Leaderboard Route */}
        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <History />
            </ProtectedRoute>
          }
        />

        <Route
          path="/leaderboard"
          element={
            <ProtectedRoute>
              <Leaderboard />
            </ProtectedRoute>
          }
        />
        
        {/* Protected Badges Route */}
        <Route
          path="/badges"
          element={
            <ProtectedRoute>
              <Badges />
            </ProtectedRoute>
          }
        />
        
        {/* Protected Settings Route */}
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
        
        {/* Fallback Catch-all -> Redirect to Home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
