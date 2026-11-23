import { useEffect, useId, useState } from 'react';
import { Bell, Check, ChevronDown, LoaderCircle, Moon, Send } from 'lucide-react';
import { api } from '../services/api';
import { disablePush, enablePush, loadPushDevice, pushSupport, reminderTimeZone,
  type PushConfig, type PushDevice } from '../services/push';
import './SleepReminders.css';

interface SleepRemindersProps {
  token: string;
  cutoffTime?: string | null;
  mode?: 'settings' | 'onboarding';
  onBusyChange?: (busy: boolean) => void;
  onSkip?: () => void;
  disabled?: boolean;
}

function displayTime(minutes: number) {
  const hour = Math.floor(minutes / 60) % 24;
  return `${hour % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export function SleepReminders({ token, cutoffTime = null, mode = 'settings', onBusyChange, onSkip, disabled = false }: SleepRemindersProps) {
  const titleId = useId();
  const compact = mode === 'onboarding';
  const zone = reminderTimeZone();
  const city = zone.split('/').pop()?.replace(/_/g, ' ') || zone;
  const parts = cutoffTime?.split(':').map(Number);
  const goalMinutes = parts && parts.length === 2 && parts.every(Number.isFinite) ? parts[0] * 60 + parts[1] : null;
  const windDown = goalMinutes === null ? null : ((goalMinutes || 1440) - 30 + 1440) % 1440;
  const merged = windDown !== null && Math.abs(windDown - 1260) < 15;

  const [config, setConfig] = useState<PushConfig | null>(null);
  const [device, setDevice] = useState<PushDevice | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<'enable' | 'test' | 'disable' | null>(null);
  const busy = pendingAction !== null;
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);
  const support = pushSupport();
  const [permission, setPermission] = useState<NotificationPermission>(() => 'Notification' in window ? Notification.permission : 'default');
  const blocked = permission === 'denied';
  const enabled = !!device && permission === 'granted';

  useEffect(() => {
    const refresh = () => {
      setPermission('Notification' in window ? Notification.permission : 'default');
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([api.get<PushConfig>('/api/push/config', token), loadPushDevice(token)])
      .then(([nextConfig, nextDevice]) => {
        if (!active) return;
        setConfig(nextConfig);
        setDevice(nextDevice);
      })
      .catch(() => { if (active) setError('Could not load reminder settings. Please try again.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, reload]);

  async function run(kind: 'enable' | 'test' | 'disable', action: () => Promise<void>) {
    setPendingAction(kind); onBusyChange?.(true); setError(''); setMessage('');
    try { await action(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not update reminders. Please try again.'); }
    finally {
      setPendingAction(null); onBusyChange?.(false);
      setPermission('Notification' in window ? Notification.permission : 'default');
    }
  }

  function enable() {
    if (!config?.publicKey) return;
    const publicKey = config.publicKey;
    void run('enable', async () => {
      const next = await enablePush(token, publicKey);
      setDevice(next);
      setMessage('Reminders are on for this device.');
    });
  }

  const cannotEnable = busy || loading || disabled || !config?.enabled || support !== 'supported' || blocked;
  const turnOff = () => void run('disable', async () => {
    await disablePush(token);
    setDevice(null);
    setMessage('Reminders turned off.');
  });

  return <section className={`sleep-reminders${compact ? ' sleep-reminders-compact' : ''}`} aria-labelledby={titleId}>
    <div className="reminder-heading">
      <div className="reminder-heading-copy">
        <h2 className="brand-font" id={titleId}><Bell size={19} aria-hidden="true" />{compact ? 'Want a bedtime reminder?' : 'Sleep reminders'}</h2>
        <p>{compact ? 'We’ll remind you when check-in opens and before bed.' : 'A gentle nudge when it’s time to rest.'}</p>
      </div>
      {!compact && <button type="button" className="reminder-switch" role="switch" aria-label="Sleep reminders on this device"
        aria-checked={enabled} aria-busy={busy || loading}
        disabled={enabled ? busy || disabled : cannotEnable}
        onClick={enabled ? turnOff : enable}>
        <span className="reminder-switch-thumb">{(loading || pendingAction === 'enable' || pendingAction === 'disable') && <LoaderCircle size={14} className="reminder-spinner" aria-hidden="true" />}</span>
      </button>}
    </div>

    {loading ? <p className="reminder-feedback" role="status"><LoaderCircle size={15} className="reminder-spinner" aria-hidden="true" />Loading reminders…</p> : <>
      {!compact && <>
        <div className={`reminder-schedule${merged ? ' is-merged' : ''}`} aria-label="Reminder schedule">
          {merged ? <div><span className="reminder-time">{displayTime(Math.min(1260, windDown!))}</span><span className="reminder-time-label">Check-in & wind-down reminder</span></div> : <>
            <div><span className="reminder-time">9:00 PM</span><span className="reminder-time-label">Check-in opens</span></div>
            <div><span className="reminder-time">{windDown === null ? '—' : displayTime(windDown)}</span><span className="reminder-time-label"><Moon size={13} aria-hidden="true" />Wind-down reminder</span></div>
          </>}
        </div>
        <p className="reminder-timezone" title={zone}>Local time · {city}</p>
      </>}

      {support === 'install' && <div className="reminder-help">
        <strong>Add Koala to your Home Screen</strong>
        <p>In Safari, tap Share → Add to Home Screen. Open the koala icon and enable reminders here.</p>
        <small>Requires iOS or iPadOS 16.4 or later.</small>
      </div>}
      {support === 'unsupported' && <p className="reminder-help">Notifications aren’t supported here. Try a supported browser such as Chrome or Safari.</p>}
      {blocked && <div className="reminder-help">
        <strong>Allow notifications to get started</strong>
        <p>Open your browser’s site settings and allow Notifications. On iPhone, go to Settings → Notifications → Sleepy Koala.</p>
        <button type="button" className="reminder-text-button" disabled={busy} onClick={() => {
          const current = Notification.permission;
          setPermission(current);
          setMessage(current === 'granted' ? 'Permission allowed. You can enable reminders now.' : 'Still blocked. Allow notifications in your browser or device settings.');
        }}>Check permission again</button>
        {device && <button type="button" className="reminder-text-button" disabled={busy} onClick={turnOff}>Turn off reminders</button>}
      </div>}
      {config && !config.enabled && <p className="reminder-feedback">Reminders aren’t available yet. Please check back later.</p>}

      {compact && <div className="reminder-onboarding-actions">
        {enabled ? <span className="reminder-enabled"><Check size={16} aria-hidden="true" />Reminders on <button type="button" className="reminder-text-button" disabled={busy || disabled} onClick={turnOff}>Turn off</button></span> : <>
          <button type="button" className="btn btn-primary" disabled={cannotEnable} onClick={enable}>
            {pendingAction === 'enable' && <LoaderCircle size={16} className="reminder-spinner" aria-hidden="true" />}{pendingAction === 'enable' ? 'Enabling…' : 'Enable reminders'}
          </button>
          <button type="button" className="reminder-text-button" disabled={busy || disabled} onClick={onSkip}>Not now</button>
        </>}
      </div>}

      {!compact && <div className="reminder-footer">
        {enabled && <button type="button" className="reminder-test-button" disabled={busy || !config?.enabled || disabled}
          aria-busy={pendingAction === 'test'} onClick={() => void run('test', async () => {
            await api.post(`/api/push/devices/${device!.id}/test`, {}, token);
            setMessage('Test sent. Check your notifications.');
          })}>
          {pendingAction === 'test' ? <LoaderCircle size={15} className="reminder-spinner" aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}
          {pendingAction === 'test' ? 'Sending…' : 'Send test notification'}
        </button>}
        <details className="reminder-details">
          <summary>How reminders work <ChevronDown size={14} aria-hidden="true" /></summary>
          <ul>
            <li>On this device: 9:00 PM and 30 minutes before your saved bedtime goal.</li>
            <li>Check in to skip the rest of tonight’s reminders. Times less than 15 minutes apart are combined.</li>
            <li>Your time zone updates when you return. Signing out turns this device’s reminders off.</li>
            <li>No test notification? Check your notification centre, browser permissions and Focus mode.</li>
          </ul>
        </details>
      </div>}
    </>}
    <div className="reminder-feedback" role="status" aria-live="polite" aria-atomic="true">
      {pendingAction === 'test' ? <span>Sending your test notification…</span> : message && <span className="reminder-success"><Check size={15} aria-hidden="true" />{message}</span>}
    </div>
    {error && <div className="reminder-error" role="alert">{error} {!config && <button type="button" className="reminder-text-button" onClick={() => setReload(n => n + 1)}>Try again</button>}</div>}
  </section>;
}
