import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Clock3, Moon } from 'lucide-react';
import { useStore, type UserSettingsDto } from '../stores/useStore';
import { TimeGoalPicker } from '../components/TimeGoalPicker';

export const Onboarding: React.FC = () => {
  const navigate = useNavigate();
  const { loadSettings, updateSettings, isLoading } = useStore();
  const [settings, setSettings] = useState<UserSettingsDto | null>(null);
  const [cutoffTime, setCutoffTime] = useState('22:00');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { loadSettings().then((result) => { if (result) { setSettings(result); setCutoffTime(result.cutoffTime); } }); }, [loadSettings]);

  const finish = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!settings) return;
    setError(null);
    try {
      await updateSettings({ ...settings, cutoffTime, onboardingCompleted: true });
      navigate('/dashboard', { replace: true });
    } catch {
      setError('We could not save your settings. Please try again.');
    }
  };

  return <main className="onboarding-page"><style>{`
    .onboarding-page { position:relative; z-index:1; min-height:100dvh; display:grid; place-items:center; padding:24px; }
    .onboarding-card { width:min(100%, 600px); padding:clamp(28px, 5vw, 52px); border-radius:24px; border:1px solid var(--card-border); background:rgba(20,26,54,.76); box-shadow:var(--card-shadow); }
    .onboarding-icon { width:52px; height:52px; display:grid; place-items:center; border-radius:16px; background:rgba(129,140,248,.17); color:#c8cdfc; }
    .onboarding-card h1 { font-size:clamp(2.2rem,5vw,3.4rem); line-height:1.05; margin:22px 0 12px; }
    .onboarding-lede, .onboarding-explainer { color:var(--text-muted); line-height:1.65; }
    .onboarding-field { margin:28px 0 20px; } .onboarding-field label { display:block; font-weight:700; margin-bottom:10px; }
    .onboarding-field input { width:100%; min-height:58px; padding:10px 16px; border-radius:14px; border:1px solid var(--input-border); background:var(--input-bg); color:var(--text-main); font:inherit; color-scheme:dark; }
    .onboarding-how { display:flex; gap:12px; padding:18px; border-radius:16px; background:rgba(255,255,255,.045); margin:22px 0 26px; } .onboarding-how svg { flex:0 0 auto; color:var(--primary); margin-top:2px; }
    .onboarding-error { color:#fecaca; margin-bottom:14px; } .onboarding-card .btn { width:100%; min-height:50px; }
  `}</style><section className="onboarding-card" aria-labelledby="onboarding-title"><div className="onboarding-icon"><Moon size={27} aria-hidden="true" /></div><h1 id="onboarding-title">Set your sleep goal for tonight.</h1><p className="onboarding-lede">Choose when you want to start getting ready for bed. You can change this anytime in Settings.</p><form onSubmit={finish}><div className="onboarding-field"><label htmlFor="cutoff-time"><Clock3 size={17} aria-hidden="true" /> Sleep goal time</label><TimeGoalPicker id="cutoff-time" value={cutoffTime} onChange={setCutoffTime} /><p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '10px' }}>Your bedtime goal must be set between <strong>9:00 PM and 12:00 AM</strong>.</p></div><div className="onboarding-how"><CheckCircle2 size={22} aria-hidden="true" /><p className="onboarding-explainer"><strong>Check-in window:</strong> Each night between <strong>9:00 PM and 2:00 AM</strong>, open the dashboard and select “I'm going to sleep” to record your bedtime.</p></div>{error && <p className="onboarding-error" role="alert">{error}</p>}<button className="btn btn-primary" type="submit" disabled={!settings || isLoading}>{isLoading ? 'Saving...' : 'Finish setup and meet my koala'}</button></form></section></main>;
};
