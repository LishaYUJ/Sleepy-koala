import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../stores/useStore';
import { GlassCard } from '../components/GlassCard';
import { api } from '../services/api';
import { LogOut, Save, Check, Camera, Trash2 } from 'lucide-react';
import userAvatar from '../assets/user_avatar.jpg';
import { TimeGoalPicker } from '../components/TimeGoalPicker';

export const Settings: React.FC = () => {
  const { nickname, avatarUrl, logout, deleteAccount, token } = useStore();
  const [localNickname, setLocalNickname] = useState(nickname || '');
  const [profileAvatar, setProfileAvatar] = useState(avatarUrl || userAvatar);
  const [cutoffTime, setCutoffTime] = useState('22:00');
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [successLocal, setSuccessLocal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const navigate = useNavigate();

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setErrorLocal('Please choose a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setErrorLocal('Please choose an image smaller than 8 MB.');
      return;
    }

    setErrorLocal(null);
    const sourceUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = sourceUrl;
      await image.decode();

      const side = Math.min(image.naturalWidth, image.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image processing is unavailable in this browser.');

      context.drawImage(
        image,
        (image.naturalWidth - side) / 2,
        (image.naturalHeight - side) / 2,
        side,
        side,
        0,
        0,
        512,
        512,
      );
      const processedAvatar = canvas.toDataURL('image/webp', 0.82);
      const encodedPayload = processedAvatar.slice(processedAvatar.indexOf(',') + 1);
      const processedBytes = Math.ceil((encodedPayload.length * 3) / 4);
      if (processedBytes > 512 * 1024) {
        throw new Error('This image is still too detailed after compression. Please choose another photo.');
      }
      setProfileAvatar(processedAvatar);
    } catch (err: any) {
      setErrorLocal(err.message || 'Could not process this image.');
    } finally {
      URL.revokeObjectURL(sourceUrl);
    }
  };

  // Load current settings on mount
  useEffect(() => {
    if (!token) return;
    
    let isMounted = true;
    const fetchSettings = async () => {
      try {
        const response: any = await api.get('/api/settings/me', token);
        if (isMounted && response) {
          setLocalNickname(response.nickname);
          setProfileAvatar(response.avatarDataUrl || userAvatar);
          setCutoffTime(response.cutoffTime);
        }
      } catch (err: any) {
        if (isMounted) {
          setErrorLocal('Could not load settings: ' + (err.body?.message || err.message));
        }
      }
    };

    fetchSettings();
    return () => {
      isMounted = false;
    };
  }, [token]);

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorLocal(null);
    setSuccessLocal(false);

    if (!localNickname.trim()) {
      setErrorLocal('Nickname cannot be empty.');
      return;
    }

    // Basic cutoff validation: must be between 21:00 and midnight
    const regex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!regex.test(cutoffTime)) {
      setErrorLocal('Bedtime must be in HH:mm 24-hour format.');
      return;
    }

    const [hours, minutes] = cutoffTime.split(':').map(Number);
    const isMidnightCutoff = hours === 0 && minutes === 0;
    if (!isMidnightCutoff && (hours < 21 || hours > 23 || (hours === 23 && minutes > 59))) {
      setErrorLocal('Bedtime (cutoff time) must be between 21:00 and 00:00 for the MVP.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Access Zustand store action to write settings
      await useStore.getState().updateSettings({
        nickname: localNickname.trim(),
        cutoffTime: cutoffTime,
        onboardingCompleted: true,
        avatarDataUrl: profileAvatar === userAvatar ? '' : profileAvatar
      });
      
      setSuccessLocal(true);
      setTimeout(() => setSuccessLocal(false), 3000);
    } catch (err: any) {
      setErrorLocal(err.body?.message || err.message || 'Error occurred while saving configurations.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleDeleteAccount = async () => {
    setErrorLocal(null);
    setIsDeleting(true);
    try {
      await deleteAccount();
      navigate('/', { replace: true });
    } catch (err: any) {
      setErrorLocal(err.body?.message || err.message || 'Could not delete your account.');
      setIsDeleting(false);
    }
  };

  return (
    <div className="settings-view">
      <style>{`
        .settings-view {
          display: flex;
          flex-direction: column;
          gap: 24px;
          color: var(--text-main);
          width: 100%;
          max-width: 1080px;
          margin: 0 auto;
          padding: 20px 24px 88px;
          box-sizing: border-box;
        }

        @media (max-width: 768px) {
          .settings-view {
            padding: 62px 16px 92px;
          }
        }

        .settings-header {
          margin-bottom: 8px;
        }

        .settings-header h1 {
          font-size: 2rem;
          margin-bottom: 6px;
        }

        .settings-header p {
          color: var(--text-muted);
          font-size: 1rem;
        }

        .settings-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 24px;
        }

        @media (min-width: 768px) {
          .settings-grid {
            grid-template-columns: 2fr 1fr;
          }
        }

        .settings-form-wrapper {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .section-title {
          font-size: 1.25rem;
          color: var(--text-main);
          margin-bottom: 16px;
          padding-bottom: 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .profile-photo-section {
          margin-bottom: 24px;
        }

        .avatar-picker {
          position: relative;
          display: inline-flex;
          width: fit-content;
          cursor: pointer;
        }

        .avatar-picker:focus-within {
          outline: 3px solid var(--primary-glow);
          outline-offset: 3px;
          border-radius: 28px;
        }

        .avatar-picker-image {
          width: 92px;
          height: 92px;
          border-radius: 28px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          object-fit: cover;
          background: rgba(129, 140, 248, 0.14);
        }

        .avatar-picker-overlay {
          position: absolute;
          right: -6px;
          bottom: -6px;
          display: grid;
          place-items: center;
          width: 32px;
          height: 32px;
          border-radius: 10px;
          color: white;
          background: var(--primary);
          border: 3px solid #141a36;
        }

        .avatar-picker input {
          position: absolute;
          inset: 0;
          width: 100%;
          opacity: 0;
          cursor: pointer;
        }

        .status-msg {
          padding: 12px 16px;
          border-radius: 12px;
          font-size: 0.9rem;
          font-weight: 500;
          text-align: left;
        }

        .status-msg.error {
          background-color: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: var(--error);
        }

        .status-msg.success {
          background-color: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.2);
          color: var(--success);
        }

        .settings-btn-save {
          align-self: flex-start;
          margin-top: 10px;
        }

        .logout-danger-card {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 24px;
          border: 1px solid rgba(239, 68, 68, 0.15);
        }

        .logout-danger-card h3 {
          font-size: 1.1rem;
        }

        .account-delete-confirmation {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding-top: 14px;
          border-top: 1px solid rgba(248, 113, 113, 0.18);
        }

        .account-delete-actions {
          display: flex;
          gap: 10px;
        }

        .account-delete-actions .btn {
          flex: 1;
        }
      `}</style>

      {/* Header Info */}
      <div className="settings-header">
        <h1 className="brand-font">Settings</h1>
        <p>Manage your profile, bedtime intention, and preferences.</p>
      </div>

      <div className="settings-grid">
        {/* Main Configuration form */}
        <GlassCard>
          <form onSubmit={handleSaveAll} className="settings-form-wrapper">
            
            {/* Error & Success States */}
            {errorLocal && <div className="status-msg error">{errorLocal}</div>}
            {successLocal && (
              <div className="status-msg success" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Check size={16} />
                Settings saved successfully!
              </div>
            )}

            {/* Profile Section */}
            <div>
              <h2 className="brand-font section-title">Your Profile</h2>
              
              <div className="profile-photo-section">
                <label className="avatar-picker" aria-label="Choose profile photo">
                  <img className="avatar-picker-image" src={profileAvatar} alt="Profile preview" />
                  <span className="avatar-picker-overlay" aria-hidden="true"><Camera size={15} /></span>
                  <input type="file" accept="image/*" onChange={handleAvatarChange} />
                </label>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="settingsNickname">Nickname</label>
                <input
                  id="settingsNickname"
                  type="text"
                  className="form-input"
                  value={localNickname}
                  onChange={(e) => setLocalNickname(e.target.value)}
                  placeholder="Enter your nickname"
                />
              </div>
            </div>

            {/* Sleep preferences */}
            <div style={{ marginTop: '8px' }}>
              <h2 className="brand-font section-title">Sleep preferences</h2>
              
              <div className="form-group">
                <label className="form-label" htmlFor="settingsBedtime">Target Bedtime</label>
                <TimeGoalPicker
                  id="settingsBedtime"
                  value={cutoffTime}
                  onChange={(val) => { setCutoffTime(val); setErrorLocal(null); }}
                />
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                  Your bedtime goal must be set between <strong>9:00 PM and 12:00 AM</strong>.<br/>
                  Check-in is available each night from <strong>9:00 PM to 2:00 AM</strong>.
                </p>
              </div>

            </div>

            <button
              type="submit"
              className="btn btn-primary settings-btn-save"
              disabled={isSubmitting}
            >
              <Save size={18} />
              {isSubmitting ? 'Saving...' : 'Save All Settings'}
            </button>
          </form>
        </GlassCard>

        {/* Danger Action panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <GlassCard className="logout-danger-card">
            <h3 className="brand-font" style={{ color: 'var(--text-main)' }}>Manage Session</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Sign out of Sleepy Koala. We keep your streaks safe on our records.
            </p>
            <button
              type="button"
              onClick={handleLogout}
              className="btn btn-secondary"
              style={{ borderColor: 'var(--error)', color: 'var(--error)', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <LogOut size={16} />
              Log Out
            </button>

            {!isDeleteConfirmOpen ? (
              <button
                type="button"
                onClick={() => setIsDeleteConfirmOpen(true)}
                className="btn btn-secondary"
                style={{ borderColor: 'rgba(248, 113, 113, 0.45)', color: 'var(--error)', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <Trash2 size={16} />
                Delete Account
              </button>
            ) : (
              <div className="account-delete-confirmation" role="alert">
                <p style={{ fontSize: '0.85rem', color: '#fecaca', lineHeight: 1.5 }}>
                  This permanently deletes your profile, settings, check-ins, and earned badges.
                </p>
                <div className="account-delete-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setIsDeleteConfirmOpen(false)}
                    disabled={isDeleting}
                  >
                    Keep Account
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleDeleteAccount}
                    disabled={isDeleting}
                    style={{ background: 'var(--error)' }}
                  >
                    {isDeleting ? 'Deleting...' : 'Delete Forever'}
                  </button>
                </div>
              </div>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
};
