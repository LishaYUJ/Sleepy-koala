import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../stores/useStore';
import { GlassCard } from '../components/GlassCard';
import { Sparkles, Lock, Mail, User } from 'lucide-react';
import { KoalaLogo } from '../components/KoalaLogo';

export const Auth: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const isLogin = searchParams.get('mode') !== 'register';
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localValidation, setLocalValidation] = useState<string | null>(null);

  const { login, register, isLoading, isWakingServer, error, setError, token } = useStore();
  const navigate = useNavigate();

  // If already authenticated, redirect to home
  useEffect(() => {
    if (token) {
      navigate('/');
    }
  }, [token, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalValidation(null);
    setError(null);

    if (!email || !password) {
      setLocalValidation('Email and password are required.');
      return;
    }

    if (!isLogin) {
      if (!nickname) {
        setLocalValidation('Nickname is required.');
        return;
      }
      if (password.length < 6) {
        setLocalValidation('Password must be at least 6 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setLocalValidation('Passwords do not match.');
        return;
      }
    }

    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await register(email, password, nickname);
      }
      navigate('/');
    } catch (err) {
      // Handled in store
    }
  };

  const toggleMode = () => {
    const nextIsLogin = !isLogin;
    setSearchParams(nextIsLogin ? {} : { mode: 'register' }, { replace: true });
    setLocalValidation(null);
    setError(null);
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <div className="auth-container">
      <style>{`
        .auth-container {
          min-height: 100vh;
          width: 100vw;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-gradient);
          padding: 20px;
        }

        .auth-card {
          width: 100%;
          max-width: 440px;
          text-align: center;
          position: relative;
        }

        .auth-logo {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-bottom: 24px;
        }

        .auth-logo h1 {
          font-size: 1.8rem;
          color: var(--text-main);
        }

        .auth-subtitle {
          color: var(--text-muted);
          font-size: 0.95rem;
          margin-bottom: 30px;
        }

        .input-icon-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-icon {
          position: absolute;
          left: 14px;
          color: var(--text-muted);
          pointer-events: none;
        }

        .auth-card input {
          padding-left: 44px;
        }

        .auth-error {
          background-color: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: var(--error);
          padding: 10px 14px;
          border-radius: 12px;
          font-size: 0.85rem;
          margin-bottom: 20px;
          font-weight: 500;
          text-align: left;
        }

        .auth-submit-btn {
          width: 100%;
          margin-top: 10px;
          margin-bottom: 20px;
          padding: 14px 20;
        }

        .auth-toggle {
          font-size: 0.9rem;
          color: var(--text-muted);
        }

        .auth-toggle span {
          color: var(--primary);
          font-weight: 600;
          cursor: pointer;
          margin-left: 6px;
        }

        .auth-toggle span:hover {
          color: var(--primary-hover);
          text-decoration: underline;
        }
      `}</style>

      <GlassCard className="auth-card">
        {/* Brand Logo Header */}
        <div className="auth-logo">
          <KoalaLogo style={{ width: 36, height: 36, color: 'var(--primary)' }} />
          <h1 className="brand-font">Sleepy Koala</h1>
          <Sparkles size={18} color="var(--secondary)" />
        </div>
        <p className="auth-subtitle">
          {isLogin
            ? 'Welcome back! Log in to check details of your sleepy koala.'
            : 'Track your bedtime cycles, unlock achievements, and grow your koala.'}
        </p>

        {/* Status Error Display */}
        {(error || localValidation) && (
          <div className="auth-error">
            {localValidation || error}
          </div>
        )}

        {/* Input Forms */}
        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <div className="form-group">
              <label className="form-label" htmlFor="nickname">Nickname</label>
              <div className="input-icon-wrapper">
                <User size={18} className="input-icon" />
                <input
                  id="nickname"
                  type="text"
                  placeholder="SleepyCat"
                  className="form-input"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="email">Email address</label>
            <div className="input-icon-wrapper">
              <Mail size={18} className="input-icon" />
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <div className="input-icon-wrapper">
              <Lock size={18} className="input-icon" />
              <input
                id="password"
                type="password"
                placeholder="******"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {!isLogin && (
            <div className="form-group">
              <label className="form-label" htmlFor="confirmPassword">Confirm Password</label>
              <div className="input-icon-wrapper">
                <Lock size={18} className="input-icon" />
                <input
                  id="confirmPassword"
                  type="password"
                  placeholder="******"
                  className="form-input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary auth-submit-btn"
            disabled={isLoading}
          >
            {isWakingServer
              ? 'Waking up server...'
              : isLoading
                ? 'Processing...'
                : isLogin
                  ? 'Sign In'
                  : 'Create Account'}
          </button>
        </form>

        <div className="auth-toggle">
          {isLogin ? "Don't have an account yet?" : 'Already registered?'}
          <span onClick={toggleMode}>
            {isLogin ? 'Sign Up' : 'Log In'}
          </span>
        </div>
      </GlassCard>
    </div>
  );
};
