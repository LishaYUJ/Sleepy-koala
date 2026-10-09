import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore, getCurrentSleepDateString, getLocalDateString } from '../stores/useStore';
import { Sparkles, Moon, CheckCircle, X, Award, Flame, AlertCircle, Clock3, ChevronRight, Heart } from 'lucide-react';
import { BadgeGraphic } from '../components/BadgeIcons';
import {
  formatRemainingTime,
  isCheckInWindowOpen,
  resolveDashboardCopy,
  resolveBedtimeCardState,
  shouldShowAwakeInBedAnimation,
  shouldShowEnjoyingLifeAnimation,
  shouldShowSleepingInBedAnimation,
  shouldShowVeryWeakEatingAnimation,
  shouldShowWeakEatingAnimation,
} from '../utils/bedtimeCard';

import koalaAwakeInBed from '../assets/koala_awake_in_bed.png';
import koalaEnjoyingLife from '../assets/koala_enjoying_life.png';
import koalaSleepingInBed from '../assets/koala_sleeping_in_bed_soft_edge.png';
import koalaVeryWeakEating from '../assets/koala_very_weak_eating.png';
import koalaWeakEating from '../assets/koala_weak_eating.png';
import nighttimeRoomBg from '../assets/nighttime_room_bg.png';

export const Dashboard: React.FC = () => {
  const { summary, loadSummary, performCheckIn, isLoading, error, history, loadHistory, nickname, badges, loadBadges } = useStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [currentTime, setCurrentTime] = useState(new Date());
  const [currentView, setCurrentView] = useState<'pet' | 'progress'>('pet');
  
  const [justCheckedInMsg, setJustCheckedInMsg] = useState<{
    status: string;
    newStreak: number;
    unlockedBadges: string[];
  } | null>(null);

  const [slideVal, setSlideVal] = useState(0);
  const [isKoalaStatusOpen, setIsKoalaStatusOpen] = useState(false);

  useEffect(() => {
    if (!isKoalaStatusOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsKoalaStatusOpen(false);
    };

    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.koala-status-anchor')) return;
      setIsKoalaStatusOpen(false);
    };

    window.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOnOutsidePress);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOnOutsidePress);
    };
  }, [isKoalaStatusOpen]);

  // Sync state on load
  useEffect(() => {
    const sleepDate = getCurrentSleepDateString();
    loadSummary(sleepDate);
    loadHistory();
    loadBadges();
  }, [loadSummary, loadHistory, loadBadges]);

  // Update current time periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
      loadSummary(getCurrentSleepDateString());
    }, 30000);
    return () => clearInterval(interval);
  }, [loadSummary]);

  // Format 24h cutoff time string to 12h format (e.g. "23:30" -> "11:30 PM")
  const formatCutoff12h = (cutoffStr?: string): string => {
    if (!cutoffStr) return '11:30 PM';
    const [h, m] = cutoffStr.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    const mStr = String(m).padStart(2, '0');
    return `${h12}:${mStr} ${period}`;
  };

  const bedtimeState = resolveBedtimeCardState(
    currentTime,
    summary?.cutoffTime,
    summary?.todayCheckedIn ?? false,
    summary?.todayStatus,
  );
  const gaugeCircumference = 2 * Math.PI * 68;
  const gaugeOffset = gaugeCircumference * (1 - bedtimeState.progressPercent / 100);
  const showCountdown = bedtimeState.mode === 'goal' || bedtimeState.mode === 'lateWindow';
  const previewKoalaMood = (searchParams.get('koalaMood') || '')
    .replace(/[-_]/g, '')
    .toLowerCase();
  const previewWeakEating = previewKoalaMood === 'weak';
  const previewVeryWeakEating = previewKoalaMood === 'veryweak';
  const previewAwakeInBed = previewKoalaMood === 'awakeinbed';
  const previewSleepingInBed = previewKoalaMood === 'sleepinginbed';
  const hasKoalaPreview = previewWeakEating
    || previewVeryWeakEating
    || previewAwakeInBed
    || previewSleepingInBed;
  // Keep the real daytime animation visible while the summary request is loading
  // or temporarily unavailable instead of flashing the legacy placeholder asset.
  const effectiveFatigueState = summary?.fatigueState ?? 'healthy';
  const showEnjoyingLifeAnimation = !hasKoalaPreview && shouldShowEnjoyingLifeAnimation(
    currentTime,
    summary?.cutoffTime,
    effectiveFatigueState,
  );
  const showWeakEatingAnimation = previewWeakEating || (!hasKoalaPreview && shouldShowWeakEatingAnimation(
    currentTime,
    summary?.cutoffTime,
    effectiveFatigueState,
  ));
  const showVeryWeakEatingAnimation = previewVeryWeakEating || (!hasKoalaPreview && shouldShowVeryWeakEatingAnimation(
    currentTime,
    summary?.cutoffTime,
    effectiveFatigueState,
  ));
  const showAwakeInBedAnimation = previewAwakeInBed || (!hasKoalaPreview && shouldShowAwakeInBedAnimation(
    currentTime,
    summary?.cutoffTime,
    summary?.todayCheckedIn ?? false,
    summary?.todayStatus,
  ));
  const showSleepingInBedAnimation = previewSleepingInBed || (!hasKoalaPreview && shouldShowSleepingInBedAnimation(
    currentTime,
    summary?.todayCheckedIn ?? false,
    summary?.todayStatus,
  ));
  const isInBedAnimation = showAwakeInBedAnimation || showSleepingInBedAnimation;
  const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
  const isNightOutcomeWindow = currentMinutes >= 21 * 60 || currentMinutes < 8 * 60;
  const showRecordedCheckIn = previewSleepingInBed
    || (isNightOutcomeWindow && (summary?.todayCheckedIn ?? false));
  const effectiveCheckInStatus = previewSleepingInBed
    ? (summary?.todayStatus || 'onTime')
    : summary?.todayStatus;
  const dashboardCopy = resolveDashboardCopy(
    currentTime,
    summary?.cutoffTime,
    showRecordedCheckIn,
    effectiveCheckInStatus,
    effectiveFatigueState,
    nickname,
  );
  const canCheckInNow = isCheckInWindowOpen(currentTime) && summary?.todayStatus !== 'missing';
  // Keep every non-bed koala state visually consistent: normal, happy, weak, and very weak.
  const useCompactKoalaStage = !isInBedAnimation;
  const koalaImage = showSleepingInBedAnimation
    ? koalaSleepingInBed
    : showAwakeInBedAnimation
      ? koalaAwakeInBed
      : showVeryWeakEatingAnimation
    ? koalaVeryWeakEating
    : showWeakEatingAnimation
      ? koalaWeakEating
      : showEnjoyingLifeAnimation
        ? koalaEnjoyingLife
        : effectiveFatigueState === 'veryWeak'
          ? koalaVeryWeakEating
          : effectiveFatigueState === 'weak'
            ? koalaWeakEating
            : koalaEnjoyingLife;
  const koalaAlt = showSleepingInBedAnimation
    ? 'Koala sleeping peacefully under a blanket'
    : showAwakeInBedAnimation
      ? 'Koala awake in bed and ready for bedtime'
      : showVeryWeakEatingAnimation
    ? 'An exhausted koala sleepily eating a eucalyptus leaf'
    : showWeakEatingAnimation
      ? 'A tired koala slowly eating a eucalyptus leaf'
      : showEnjoyingLifeAnimation
        ? 'Koala happily eating eucalyptus leaves'
        : effectiveFatigueState === 'veryWeak'
          ? 'An exhausted koala sleepily eating a eucalyptus leaf'
          : effectiveFatigueState === 'weak'
            ? 'A tired koala slowly eating a eucalyptus leaf'
            : 'Koala happily eating eucalyptus leaves';

  const bedtimeResult = {
    onTime: {
      label: 'On time',
      heading: 'A gentle win',
      description: 'You made space for rest before your bedtime goal.',
    },
    late: {
      label: 'Late',
      heading: 'A little past bedtime',
      description: 'You still paused to wind down. Tonight offers another chance.',
    },
    missing: {
      label: 'Missing',
      heading: 'A quiet night',
      description: 'No bedtime check-in was recorded. Tonight is a fresh start.',
    },
    upcoming: {
      label: 'Opens at 9:00 PM',
      heading: 'Tonight is still ahead',
      description: 'Your bedtime check-in will open at 9:00 PM.',
    },
  } as const;
  const bedtimeResultMode = bedtimeState.mode === 'goal' || bedtimeState.mode === 'lateWindow'
    ? 'upcoming'
    : bedtimeState.mode;
  const bedtimeResultCopy = bedtimeResult[bedtimeResultMode];

  const fallbackBadgeShelf = [
    { name: 'First Sleep', isLocked: true },
    { name: '3-Day Koala Care', isLocked: true },
    { name: 'One Week Calm', isLocked: true },
  ];
  const mobileBadgeShelf = badges
    ? [
        ...badges.unlocked.map((badge) => ({ name: badge.name, isLocked: false })),
        ...badges.locked.map((badge) => ({ name: badge.name, isLocked: true })),
      ].slice(0, 3)
    : fallbackBadgeShelf;
  const unlockedBadgeCount = badges?.unlocked.length ?? 0;
  const totalBadgeCount = Math.max(
    3,
    (badges?.unlocked.length ?? 0) + (badges?.locked.length ?? 0),
  );

  // One fatigue point removes one of ten visible energy hearts.
  const fatigueScore = summary?.fatigueScore ?? 0;
  const energyHearts = Math.max(0, Math.min(10, 10 - fatigueScore));
  const koalaEnergyState = effectiveFatigueState === 'veryWeak'
    ? { label: 'Needs extra rest', tone: 'very-weak' }
    : effectiveFatigueState === 'weak'
      ? { label: 'A little tired', tone: 'weak' }
      : energyHearts <= 7
        ? { label: 'Doing okay', tone: 'steady' }
        : { label: 'Bright & rested', tone: 'healthy' };
  const energyReason = fatigueScore === 0
    ? 'Recent on-time check-ins are keeping Koala bright.'
    : fatigueScore === 1
      ? 'A recent late check-in cost Koala 1 energy.'
      : `Recent late or missed check-ins cost Koala ${Math.min(fatigueScore, 10)} energy.`;

  const renderEnergyHearts = (compact = false) => (
    <span
      className={`energy-hearts${compact ? ' compact' : ''}`}
      role="img"
      aria-label={`Koala energy: ${energyHearts} out of 10`}
    >
      {Array.from({ length: 10 }, (_, index) => (
        <Heart
          key={index}
          className={index < energyHearts ? 'energy-heart filled' : 'energy-heart empty'}
          size={compact ? 13 : 22}
          strokeWidth={compact ? 2.2 : 1.8}
          fill={index < energyHearts ? 'currentColor' : 'none'}
          aria-hidden="true"
        />
      ))}
    </span>
  );

  const renderKoalaStatusDetails = (placement: 'desktop' | 'mobile', popoverId: string) => (
    <div
      id={popoverId}
      className="koala-status-popover"
      role={placement === 'mobile' ? 'dialog' : 'region'}
      aria-modal={placement === 'mobile' ? true : undefined}
      aria-label="Koala status details"
    >
      <div className="koala-status-heading">
        <span>{placement === 'mobile' ? 'Koala energy' : 'Koala status'}</span>
        <div className="koala-status-heading-actions">
          <span className={`koala-state-dot ${koalaEnergyState.tone}`} aria-hidden="true" />
          {placement === 'mobile' && (
            <button
              type="button"
              className="koala-status-close"
              onClick={() => setIsKoalaStatusOpen(false)}
              aria-label="Close Koala energy"
            >
              <X size={17} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      <div className="koala-status-summary">
        <strong>{koalaEnergyState.label}</strong>
        {placement === 'mobile' && <span className="koala-energy-score">{energyHearts}/10</span>}
      </div>
      {renderEnergyHearts(true)}
      <p>{energyReason}</p>
      <button
        type="button"
        className="koala-week-link"
        onClick={() => {
          setIsKoalaStatusOpen(false);
          setCurrentView('progress');
        }}
      >
        See Koala's week
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </div>
  );

  const renderKoalaStatus = (placement: 'desktop' | 'mobile') => {
    const popoverId = `koala-status-${placement}`;
    return (
      <div className={`koala-status-anchor ${placement} ${isKoalaStatusOpen ? 'is-open' : ''}`}>
        <button
          type="button"
          className={`pet-sprite-stage koala-status-trigger${isInBedAnimation ? ' in-bed' : ''}${useCompactKoalaStage ? ' compact-koala' : ''}`}
          onClick={() => setIsKoalaStatusOpen((isOpen) => !isOpen)}
          aria-expanded={isKoalaStatusOpen}
          aria-controls={popoverId}
          aria-label={`${isKoalaStatusOpen ? 'Hide' : 'Show'} Koala status. Energy ${energyHearts} out of 10.`}
        >
          <img
            src={koalaImage}
            alt={koalaAlt}
            className={`pet-sprite-image${isInBedAnimation ? ' in-bed' : ''}`}
          />
          <span className="koala-energy-peek" aria-hidden="true">
            <Heart size={14} fill="currentColor" />
            <span>{energyHearts}/10</span>
          </span>
        </button>

        {placement === 'mobile' && isKoalaStatusOpen && (
          <div id={popoverId} className="mobile-energy-orbit">
            <span className="mobile-energy-arc" aria-hidden="true">
              {Array.from({ length: 10 }, (_, index) => (
                <Heart
                  key={index}
                  className={index < energyHearts ? 'mobile-orbit-heart filled' : 'mobile-orbit-heart empty'}
                  size={19}
                  strokeWidth={1.9}
                  fill={index < energyHearts ? 'currentColor' : 'none'}
                />
              ))}
            </span>
            <div className="mobile-energy-orbit-card">
              <span>Koala energy</span>
              <strong>{koalaEnergyState.label} · <b>{energyHearts}/10</b></strong>
              <button
                type="button"
                className="mobile-energy-progress-link"
                onClick={() => {
                  setIsKoalaStatusOpen(false);
                  setCurrentView('progress');
                }}
              >
                View sleep progress
                <ChevronRight size={13} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {placement === 'desktop' && renderKoalaStatusDetails(placement, popoverId)}
      </div>
    );
  };

  const renderPostCheckInMessage = () => (
    <div className="post-checkin-message" role="status" aria-live="polite">
      <CheckCircle size={17} aria-hidden="true" />
      <span>{dashboardCopy.actionText}</span>
    </div>
  );

  const handleCheckIn = async () => {
    try {
      const response = await performCheckIn();
      if (response) {
        setJustCheckedInMsg({
          status: response.status,
          newStreak: response.currentStreak,
          unlockedBadges: response.unlockedBadges || []
        });
        // Automatically slide to progress view upon successful checkin
        setTimeout(() => {
           setCurrentView('progress');
        }, 500);
      }
    } catch (err) {
      // Handled in store
    }
  };

  const closeCheckInModal = () => {
    setJustCheckedInMsg(null);
  };

  // Resolve real days of the current week for bottom tracker
  const today = new Date();
  const currentDayOfWeek = today.getDay() || 7; // Sunday = 0, map to 7 for mon-sun format
  const monday = new Date(today);
  monday.setDate(today.getDate() - currentDayOfWeek + 1);

  const weekDays = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dStr = getLocalDateString(d);
    
    // The visual tracker should check the user's "sleep date", not calendar date
    const sleepDate = getCurrentSleepDateString();
    const isCurrentSleepDate = sleepDate === dStr;
    const hasHistory = history.some((h: any) => h.localCheckInDate === dStr && h.status !== 'missed');
    
    return {
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      checked: isCurrentSleepDate ? !!summary?.todayCheckedIn : hasHistory
    };
  });

  return (
    <div className="dashboard-viewport">
      <style>{`
        .dashboard-viewport {
          position: absolute;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100dvh;
          overflow: hidden; /* Hide the slider track */
          padding-top: 80px; /* Accounts for top transparent navbar */
          box-sizing: border-box;
          background-image: url(${nighttimeRoomBg});
          background-size: cover;
          background-position: center center;
          background-repeat: no-repeat;
        }

        .dashboard-slider-track {
          display: flex;
          width: 200vw; /* 2 panels wide */
          height: 100%;
          transition: transform 0.65s cubic-bezier(0.25, 1, 0.5, 1);
        }

        .view-panel {
          width: 100vw;
          height: 100%;
          flex: 0 0 100vw;
          position: relative;
          overflow-y: auto;
          box-sizing: border-box;
        }

        /* -------------------------------------
           VIEW A: PET SANCTUARY
           ------------------------------------- */
        .pet-sanctuary-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100%;
          height: auto;
          padding: 12px 0 32px;
          box-sizing: border-box;
        }

        .greeting-text {
          flex: none;
        }

        .mobile-greeting-copy {
          display: none;
        }

        .pet-sprite-stage {
          width: 680px;
          max-width: 95vw;
          flex: none;
          margin-bottom: 24px;
        }

        .pet-sprite-stage.in-bed {
          position: relative;
          height: min(475px, 70vw);
          margin-bottom: 8px;
        }

        .pet-sprite-stage.compact-koala {
          width: 340px;
          max-width: 68vw;
        }

        .pet-sprite-image {
          display: block;
          width: 100%;
          height: auto;
          object-fit: contain;
          pointer-events: none;
          filter: drop-shadow(0 15px 35px rgba(0, 0, 0, 0.4));
          animation: float-pet 6s ease-in-out infinite;
        }

        .pet-sprite-image.in-bed {
          position: absolute;
          top: 0;
          left: 0;
          transform: translateY(-12%);
          animation: none;
        }

        .koala-status-anchor {
          position: relative;
          width: fit-content;
          max-width: 95vw;
          flex: none;
          z-index: 8;
        }

        .koala-status-trigger {
          position: relative;
          padding: 0;
          border: 0;
          color: inherit;
          background: transparent;
          cursor: pointer;
          font: inherit;
        }

        .koala-status-trigger:focus-visible {
          outline: 2px solid rgba(196, 181, 253, 0.82);
          outline-offset: 6px;
          border-radius: 26px;
        }

        .koala-energy-peek {
          position: absolute;
          right: -4px;
          bottom: 24px;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 7px 10px;
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 12px;
          color: #f3a7bb;
          background: rgba(25, 28, 55, 0.82);
          box-shadow: 0 10px 26px rgba(5, 7, 20, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.07);
          backdrop-filter: blur(12px);
          font-family: var(--font-body);
          font-size: 0.78rem;
          font-weight: 700;
          line-height: 1;
          transition: transform 0.24s ease, border-color 0.24s ease, background 0.24s ease;
        }

        .mobile-energy-orbit {
          display: none;
        }

        .koala-status-trigger:hover .koala-energy-peek,
        .koala-status-trigger:focus-visible .koala-energy-peek,
        .koala-status-anchor.is-open .koala-energy-peek {
          transform: translateY(-3px);
          border-color: rgba(243, 167, 187, 0.38);
          background: rgba(32, 34, 66, 0.94);
        }

        .koala-status-popover {
          position: absolute;
          top: 50%;
          left: calc(100% + 24px);
          width: 284px;
          padding: 20px;
          border: 1px solid rgba(255, 255, 255, 0.13);
          border-radius: 20px;
          color: #f3edd7;
          background: rgba(20, 25, 51, 0.92);
          box-shadow: 0 22px 54px rgba(5, 7, 20, 0.46), inset 0 1px 0 rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(18px);
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          transform: translate(-10px, -50%) scale(0.98);
          transform-origin: left center;
          transition: opacity 0.22s ease, transform 0.22s ease, visibility 0.22s ease;
        }

        .koala-status-anchor:hover .koala-status-popover,
        .koala-status-anchor:focus-within .koala-status-popover,
        .koala-status-anchor.is-open .koala-status-popover {
          opacity: 1;
          visibility: visible;
          pointer-events: auto;
          transform: translate(0, -50%) scale(1);
        }

        .koala-status-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
          color: #aeb9cc;
          font-family: var(--font-body);
          font-size: 0.76rem;
          font-weight: 650;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .koala-status-heading-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .koala-status-close,
        .koala-status-backdrop {
          display: none;
        }

        .mobile-energy-layer {
          display: none;
        }

        .koala-state-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #73c29d;
          box-shadow: 0 0 0 5px rgba(115, 194, 157, 0.12);
        }

        .koala-state-dot.weak {
          background: #e3b96d;
          box-shadow: 0 0 0 5px rgba(227, 185, 109, 0.12);
        }

        .koala-state-dot.steady {
          background: #9fba9e;
          box-shadow: 0 0 0 5px rgba(159, 186, 158, 0.12);
        }

        .koala-state-dot.very-weak {
          background: #db8798;
          box-shadow: 0 0 0 5px rgba(219, 135, 152, 0.12);
        }

        .koala-status-summary strong {
          display: block;
          font-family: var(--font-serif);
          font-size: 1.18rem;
        }

        .koala-status-summary {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 12px;
        }

        .koala-energy-score {
          color: #f3a7bb;
          font-family: var(--font-body);
          font-size: 0.88rem;
          font-weight: 750;
          font-variant-numeric: tabular-nums;
        }

        .koala-status-popover p {
          margin: 12px 0 16px;
          color: #aeb9cc;
          font-family: var(--font-body);
          font-size: 0.84rem;
          line-height: 1.5;
        }

        .koala-week-link {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 0;
          border: 0;
          color: #c4b5fd;
          background: transparent;
          cursor: pointer;
          font-family: var(--font-body);
          font-size: 0.84rem;
          font-weight: 700;
        }

        .koala-week-link:hover,
        .koala-week-link:focus-visible {
          color: #e0d8ff;
          outline: none;
        }

        .koala-week-link:active {
          transform: translateY(1px);
        }

        .post-checkin-message {
          position: relative;
          z-index: 10;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          max-width: min(420px, 88vw);
          padding: 9px 16px;
          border: 1px solid rgba(137, 213, 181, 0.2);
          border-radius: 999px;
          color: #e4eee8;
          background: rgba(24, 28, 52, 0.72);
          box-shadow: 0 10px 26px rgba(8, 9, 24, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(10px);
          font-family: var(--font-body);
          font-size: 0.88rem;
          font-weight: 500;
          text-align: center;
          text-shadow: 0 2px 8px rgba(0, 0, 0, 0.55);
        }

        .post-checkin-message svg {
          flex: none;
          color: #89d5b5;
        }

        .checkin-availability-note {
          position: relative;
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 0;
          padding: 9px 16px;
          border: 1px solid rgba(196, 181, 253, 0.24);
          border-radius: 999px;
          color: #d8d0e6;
          background: rgba(30, 27, 75, 0.42);
          backdrop-filter: blur(8px);
          font-family: var(--font-body);
          font-size: 0.9rem;
          font-weight: 500;
          text-align: center;
          text-shadow: 0 2px 8px rgba(0, 0, 0, 0.55);
        }

        .checkin-availability-note svg {
          flex: none;
          color: #b19df7;
        }

        @keyframes float-pet {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }

        .pet-narrative-text {
          font-family: var(--font-serif);
          font-size: 1.45rem;
          color: #f3edd7;
          text-align: center;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.6);
          margin-bottom: 8px;
        }

        .pet-goal-subtext {
          font-family: var(--font-body);
          font-size: 0.95rem;
          color: #aeb9cc;
          margin-bottom: 32px;
          text-align: center;
          font-weight: 500;
        }

        /* Sleep Action Button (Coral Red Pill) */
        .sleep-action-btn-large {
          padding: 18px 36px;
          border-radius: 99px;
          background: linear-gradient(135deg, #e06354 0%, #d25344 100%);
          border: none;
          color: #ffffff;
          font-family: var(--font-serif);
          font-size: 1.35rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          cursor: pointer;
          box-shadow: 0 12px 30px rgba(224, 99, 84, 0.4);
          transition: all 0.2s ease;
          min-width: 280px;
        }

        .sleep-action-btn-large:hover {
          transform: translateY(-3px);
          box-shadow: 0 16px 40px rgba(224, 99, 84, 0.5);
        }

        .sleep-action-btn-large:active {
          transform: translateY(0);
        }
        
        .sleep-action-btn-large:disabled {
          opacity: 0.7;
          cursor: not-allowed;
          transform: none;
        }

        /* Navigation Arrows */
        .nav-arrow-btn {
          position: fixed;
          top: 50%;
          transform: translateY(-50%);
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #f3edd7;
          border-radius: 50%;
          width: 54px;
          height: 54px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 100;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
          transition:
            transform 0.72s cubic-bezier(0.22, 1, 0.36, 1),
            background 0.72s ease,
            border-color 0.72s ease,
            color 0.72s ease,
            box-shadow 0.72s ease;
          isolation: isolate;
        }

        .nav-arrow-btn::before {
          content: '';
          position: absolute;
          inset: -8px;
          z-index: -1;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(243, 237, 215, 0.32) 0%, rgba(243, 237, 215, 0) 72%);
          opacity: 0;
          transform: scale(0.78);
          transition: opacity 0.72s ease, transform 0.72s ease;
          pointer-events: none;
        }

        .nav-arrow-btn:hover,
        .nav-arrow-btn:focus-visible {
          background: rgba(255, 255, 255, 0.17);
          border-color: rgba(243, 237, 215, 0.46);
          color: #fffdf3;
          transform: translateY(calc(-50% - 4px)) scale(1.045);
          box-shadow:
            0 16px 30px rgba(0, 0, 0, 0.3),
            0 0 24px rgba(243, 237, 215, 0.34),
            inset 0 0 14px rgba(255, 255, 255, 0.12);
          outline: none;
        }

        .nav-arrow-btn:hover::before,
        .nav-arrow-btn:focus-visible::before {
          opacity: 0.82;
          transform: scale(1.08);
          animation: nav-arrow-breathe 2.8s ease-in-out infinite;
        }

        @keyframes nav-arrow-breathe {
          0%, 100% {
            opacity: 0.58;
            transform: scale(1.02);
          }
          50% {
            opacity: 0.9;
            transform: scale(1.12);
          }
        }

        .nav-arrow-btn:active {
          transform: translateY(-50%) scale(0.98);
        }

        .nav-arrow-icon {
          filter: brightness(1);
          transition: transform 0.72s cubic-bezier(0.22, 1, 0.36, 1), filter 0.72s ease;
        }

        .nav-arrow-btn:hover .nav-arrow-icon,
        .nav-arrow-btn:focus-visible .nav-arrow-icon {
          filter: brightness(1.28) drop-shadow(0 0 7px rgba(243, 237, 215, 0.82));
        }

        .nav-arrow-btn.left-edge:hover .nav-arrow-icon,
        .nav-arrow-btn.left-edge:focus-visible .nav-arrow-icon {
          transform: translateX(-1px) scale(1.04);
        }
        .nav-arrow-btn.left-edge {
          left: 30px;
        }
        .arrow-text-label {
          position: absolute;
          font-family: var(--font-body);
          font-size: 0.85rem;
          font-weight: 600;
          white-space: nowrap;
          pointer-events: none;
          opacity: 0;
          color: #f3edd7;
          text-shadow: 0 0 10px rgba(243, 237, 215, 0.28);
          transition: opacity 0.72s ease, transform 0.72s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .left-edge:hover .arrow-text-label,
        .left-edge:focus-visible .arrow-text-label {
          opacity: 1;
          transform: translateX(60px);
        }

        @media (prefers-reduced-motion: reduce) {
          .nav-arrow-btn,
          .nav-arrow-btn::before,
          .nav-arrow-icon,
          .arrow-text-label {
            transition-duration: 0.01ms;
          }

          .nav-arrow-btn::before {
            animation: none !important;
          }
        }

        /* -------------------------------------
           VIEW B: MY PROGRESS
           ------------------------------------- */
        .progress-container {
          max-width: 1100px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 12px 0 24px;
          gap: 14px;
        }

        .section-big-title {
          font-family: var(--font-serif);
          font-size: 2rem;
          font-weight: 600;
          color: #f3edd7;
          margin-bottom: 2px;
          align-self: flex-start;
          text-shadow: 0 4px 16px rgba(0,0,0,0.4);
        }

        .progress-intro {
          width: 100%;
          margin-top: -10px;
          color: #aeb9cc;
          font-size: 0.95rem;
          line-height: 1.5;
        }

        .progress-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 18px;
          width: 100%;
        }

        @media (min-width: 900px) {
          .progress-grid {
             grid-template-columns: 1.1fr 1fr;
          }
        }

        /* Dark Immersive Glass Card Base */
        .dark-glass-card {
          background: rgba(24, 30, 56, 0.6);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 28px;
          padding: 28px;
          color: #f3edd7;
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.3);
          box-sizing: border-box;
          position: relative;
          overflow: hidden;
        }

        .energy-hearts {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #f0a0b5;
        }

        .energy-hearts.compact {
          gap: 3px;
        }

        .energy-heart {
          flex: none;
          filter: drop-shadow(0 3px 8px rgba(240, 160, 181, 0.18));
        }

        .energy-heart.empty {
          color: rgba(255, 255, 255, 0.2);
          filter: none;
        }

        .bedtime-reflection-card {
          min-height: 100%;
          padding: 22px;
          background:
            radial-gradient(circle at 84% 14%, rgba(232, 194, 141, 0.13), transparent 32%),
            radial-gradient(circle at 12% 88%, rgba(167, 139, 250, 0.13), transparent 36%),
            rgba(24, 30, 56, 0.72);
        }

        .bedtime-reflection-card::before {
          content: '';
          position: absolute;
          top: -54px;
          right: -42px;
          width: 150px;
          height: 150px;
          border: 1px solid rgba(244, 220, 177, 0.12);
          border-radius: 50%;
          box-shadow: inset 18px -12px 36px rgba(244, 220, 177, 0.06);
          pointer-events: none;
        }

        .bedtime-reflection-header {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 14px;
        }

        .bedtime-reflection-title {
          display: flex;
          min-width: 0;
          flex-direction: column;
          gap: 3px;
        }

        .bedtime-reflection-title strong {
          color: #f3edd7;
          font-family: var(--font-serif);
          font-size: 1.12rem;
          font-weight: 650;
        }

        .bedtime-reflection-title span {
          color: #9ca8bd;
          font-size: 0.78rem;
          line-height: 1.35;
        }

        .bedtime-reflection-moon {
          display: grid;
          width: 38px;
          height: 38px;
          flex: 0 0 38px;
          place-items: center;
          border: 1px solid rgba(244, 220, 177, 0.2);
          border-radius: 14px;
          color: #f0d7a8;
          background: rgba(240, 215, 168, 0.09);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
        }

        /* Countdown Gauge modifications for Dark Card */
        .countdown-gauge-container {
          position: relative;
          width: 180px;
          height: 180px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px auto;
        }
        .gauge-svg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          transform: rotate(-90deg);
        }
        .gauge-bg-circle {
          stroke: rgba(255, 255, 255, 0.08);
          stroke-width: 8;
          fill: none;
        }
        .gauge-progress-circle {
          stroke: #818cf8;
          stroke-width: 8;
          stroke-linecap: round;
          fill: none;
          stroke-dasharray: 440;
          stroke-dashoffset: 120;
          transition: stroke-dashoffset 1s ease;
        }
        .gauge-progress-circle.late-window {
          stroke: #fbbf24;
        }
        .gauge-center-text {
          position: relative;
          z-index: 2;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .gauge-time-val {
          font-family: var(--font-serif);
          font-size: 2.2rem;
          font-weight: 700;
          color: #f3edd7;
          line-height: 1.1;
        }
        .gauge-left-label {
          font-family: var(--font-body);
          font-size: 0.95rem;
          font-weight: 500;
          color: #8e9bb4;
          margin-top: 4px;
        }
        .gauge-star-accent {
          position: absolute;
          top: 14px;
          color: #818cf8;
        }
        .gauge-star-accent.late-window {
          color: #fbbf24;
        }

        /* Stats Sub Headers */
        .card-header-small {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-family: var(--font-body);
          font-weight: 600;
          font-size: 0.95rem;
          color: #aeb9cc;
          margin-bottom: 14px;
        }

        /* Streak & Rewards Adjustments */
        .middle-cards-stack {
           display: flex;
           flex-direction: column;
           gap: 16px;
        }

        .progress-stat-card {
          padding: 20px 22px;
        }
        
        .streak-val-text {
          font-family: var(--font-serif);
          font-size: 2rem;
          font-weight: 700;
          color: #f3edd7;
        }
        .streak-rank-subtext {
          font-family: var(--font-body);
          font-size: 0.82rem;
          color: #8e9bb4;
          margin-bottom: 6px;
        }
        .view-leaderboard-link {
          font-family: var(--font-body);
          font-size: 0.85rem;
          font-weight: 600;
          color: #818cf8;
          text-decoration: none;
          cursor: pointer;
        }
        .view-leaderboard-link:hover {
          text-decoration: underline;
        }

        /* Badges */
        .badge-shield-icon {
          width: 46px;
          height: 50px;
          background: rgba(129, 140, 248, 0.15);
          border: 1px solid rgba(129, 140, 248, 0.3);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fbbf24;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }
        .badge-total-text {
          font-family: var(--font-serif);
          font-size: 1.2rem;
          font-weight: 700;
          color: #f3edd7;
          margin-top: 6px;
        }
        
        @media (max-width: 1100px) {
          .koala-status-popover {
            top: calc(100% - 28px);
            left: 50%;
            transform: translate(-50%, -8px) scale(0.98);
            transform-origin: top center;
          }

          .koala-status-anchor:hover .koala-status-popover,
          .koala-status-anchor:focus-within .koala-status-popover,
          .koala-status-anchor.is-open .koala-status-popover {
            transform: translate(-50%, 0) scale(1);
          }
        }

        @media (max-width: 768px) {
          .view-panel {
            scroll-padding-bottom: calc(92px + env(safe-area-inset-bottom));
          }

          .pet-sanctuary-container {
            min-height: 100%;
            height: auto;
            justify-content: flex-start;
            padding: 18px 0 calc(104px + env(safe-area-inset-bottom));
          }

          .mobile-sanctuary-layout {
            flex: none;
          }

          .mobile-sanctuary-layout > .post-checkin-message,
          .mobile-sanctuary-layout > .checkin-availability-note {
            margin-bottom: 18px;
          }

          .mobile-greeting-copy {
            display: flex;
            width: min(340px, 90vw);
            flex-direction: column;
            align-items: center;
            text-align: center;
          }

          .mobile-greeting-copy .greeting-text {
            margin-bottom: 7px;
            color: #f3edd7;
            font-family: var(--font-serif);
            font-size: clamp(1.55rem, 7vw, 2.2rem);
            line-height: 1.15;
            text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
            text-wrap: balance;
          }

          .mobile-greeting-copy .greeting-subtext {
            margin-bottom: 14px;
            color: #aeb9cc;
            font-family: var(--font-body);
            font-size: 0.96rem;
            line-height: 1.4;
            text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
            text-wrap: balance;
          }

          .mobile-badge-shelf {
            position: relative;
            display: flex;
            width: min(250px, 72vw);
            margin: 1px 0 16px;
            padding: 0 14px 23px;
            flex-direction: column;
            align-items: center;
            border: 0;
            color: inherit;
            background: transparent;
            cursor: pointer;
            isolation: isolate;
          }

          .mobile-badge-shelf::before {
            content: '';
            position: absolute;
            right: 2px;
            bottom: 15px;
            left: 2px;
            height: 11px;
            border: 1px solid rgba(243, 220, 184, 0.24);
            border-radius: 4px 4px 8px 8px;
            background: #59413f;
            box-shadow:
              0 5px 0 #2e232b,
              0 11px 18px rgba(7, 8, 24, 0.4),
              inset 0 2px 0 rgba(255, 235, 201, 0.15);
            z-index: -1;
          }

          .mobile-badge-shelf::after {
            content: '';
            position: absolute;
            bottom: 4px;
            left: 30px;
            width: 18px;
            height: 13px;
            border-right: 4px solid #3b2d34;
            border-bottom: 4px solid #3b2d34;
            border-radius: 0 0 5px;
            box-shadow: 168px 0 0 -4px #3b2d34;
            transform: skewX(-10deg);
            z-index: -2;
          }

          .mobile-badge-shelf:focus-visible {
            outline: 2px solid rgba(224, 216, 255, 0.88);
            outline-offset: 5px;
            border-radius: 12px;
          }

          .mobile-badge-shelf:active {
            transform: translateY(1px);
          }

          .mobile-badge-shelf-label {
            display: flex;
            width: 100%;
            margin-bottom: 2px;
            align-items: baseline;
            justify-content: space-between;
            color: rgba(226, 220, 211, 0.82);
            font-family: var(--font-body);
            font-size: 0.68rem;
            font-weight: 650;
            letter-spacing: 0.035em;
          }

          .mobile-badge-shelf-label strong {
            color: #f3edd7;
            font-size: 0.7rem;
            font-variant-numeric: tabular-nums;
          }

          .mobile-badge-shelf-row {
            display: flex;
            height: 54px;
            align-items: flex-end;
            justify-content: center;
            gap: 13px;
          }

          .mobile-badge-shelf-item {
            display: grid;
            width: 48px;
            height: 48px;
            place-items: center;
            filter: drop-shadow(0 5px 7px rgba(7, 8, 24, 0.38));
            transform-origin: center bottom;
            transition: transform 0.22s ease, filter 0.22s ease;
          }

          .mobile-badge-shelf-item.locked {
            opacity: 0.42;
            filter: grayscale(0.32) drop-shadow(0 4px 5px rgba(7, 8, 24, 0.26));
          }

          .mobile-badge-shelf-item svg {
            width: 48px;
            height: 48px;
          }

          .mobile-badge-shelf:hover .mobile-badge-shelf-item:not(.locked),
          .mobile-badge-shelf:focus-visible .mobile-badge-shelf-item:not(.locked) {
            transform: translateY(-3px) rotate(-2deg);
            filter: drop-shadow(0 8px 9px rgba(7, 8, 24, 0.44));
          }

          .progress-container {
            width: 100%;
            padding: 12px 16px calc(24px + env(safe-area-inset-bottom));
            box-sizing: border-box;
          }

          .energy-hearts {
            gap: 4px;
          }

          .energy-hearts.compact {
            display: flex;
            width: 100%;
            justify-content: space-between;
            gap: 3px;
          }

          .energy-hearts.compact .energy-heart {
            width: 16px;
            height: 16px;
          }

          .koala-energy-peek {
            display: none;
          }

          .koala-status-anchor.mobile.is-open {
            padding-top: 116px;
          }

          .koala-status-anchor.mobile .pet-sprite-stage {
            margin-bottom: 12px;
          }

          .mobile-energy-orbit {
            position: absolute;
            top: 6px;
            left: 50%;
            display: block;
            width: min(292px, 92vw);
            height: 132px;
            color: #f3a7bb;
            pointer-events: none;
            transform: translateX(-50%);
          }

          .mobile-energy-arc {
            position: absolute;
            inset: 0;
          }

          .mobile-orbit-heart {
            position: absolute;
            filter: drop-shadow(0 0 9px rgba(243, 167, 187, 0.38));
          }

          .mobile-orbit-heart.empty {
            color: rgba(238, 211, 222, 0.64);
            filter: none;
          }

          .mobile-orbit-heart:nth-child(1) { left: 8px; top: 62px; transform: rotate(-25deg); }
          .mobile-orbit-heart:nth-child(2) { left: 25px; top: 38px; transform: rotate(-19deg); }
          .mobile-orbit-heart:nth-child(3) { left: 52px; top: 19px; transform: rotate(-13deg); }
          .mobile-orbit-heart:nth-child(4) { left: 84px; top: 7px; transform: rotate(-7deg); }
          .mobile-orbit-heart:nth-child(5) { left: 119px; top: 1px; transform: rotate(-2deg); }
          .mobile-orbit-heart:nth-child(6) { right: 119px; top: 1px; transform: rotate(2deg); }
          .mobile-orbit-heart:nth-child(7) { right: 84px; top: 7px; transform: rotate(7deg); }
          .mobile-orbit-heart:nth-child(8) { right: 52px; top: 19px; transform: rotate(13deg); }
          .mobile-orbit-heart:nth-child(9) { right: 25px; top: 38px; transform: rotate(19deg); }
          .mobile-orbit-heart:nth-child(10) { right: 8px; top: 62px; transform: rotate(25deg); }

          .mobile-energy-orbit-card {
            position: absolute;
            top: 56px;
            left: 50%;
            display: flex;
            min-width: 194px;
            padding: 9px 17px 8px;
            box-sizing: border-box;
            flex-direction: column;
            align-items: center;
            gap: 2px;
            border: 1px solid rgba(203, 194, 237, 0.24);
            border-radius: 22px;
            background: rgba(24, 27, 58, 0.82);
            box-shadow: 0 12px 30px rgba(7, 9, 24, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.08);
            backdrop-filter: blur(14px);
            transform: translateX(-50%);
          }

          .mobile-energy-orbit-card > span {
            color: #b9a9f3;
            font-family: var(--font-body);
            font-size: 0.62rem;
            font-weight: 750;
            letter-spacing: 0.08em;
            line-height: 1.2;
            text-transform: uppercase;
          }

          .mobile-energy-orbit-card strong {
            white-space: nowrap;
            color: #f3edd7;
            font-family: var(--font-serif);
            font-size: 0.92rem;
            font-weight: 650;
          }

          .mobile-energy-orbit-card b {
            color: #f3a7bb;
            font-family: var(--font-body);
            font-size: 0.84rem;
            font-variant-numeric: tabular-nums;
          }

          .mobile-energy-progress-link {
            display: inline-flex;
            margin-top: 6px;
            padding: 6px 8px 2px;
            align-items: center;
            gap: 3px;
            border: 0;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            color: #c4b5fd;
            background: transparent;
            cursor: pointer;
            font-family: var(--font-body);
            font-size: 0.7rem;
            font-weight: 700;
            pointer-events: auto;
          }

          .mobile-energy-progress-link:focus-visible {
            outline: 2px solid rgba(196, 181, 253, 0.82);
            outline-offset: 2px;
            border-radius: 6px;
          }

          .mobile-energy-progress-link:active {
            transform: translateY(1px);
          }

          .mobile-energy-layer {
            position: fixed;
            inset: 0;
            display: block;
            z-index: 1100;
          }

          .mobile-energy-layer .koala-status-backdrop {
            position: fixed;
            inset: 0;
            display: block;
            width: 100vw;
            padding: 0;
            border: 0;
            background: rgba(7, 10, 27, 0.56);
            backdrop-filter: blur(4px);
            cursor: default;
            animation: koala-backdrop-in 0.22s ease both;
          }

          .mobile-energy-layer .koala-status-popover {
            position: fixed;
            top: auto;
            right: auto;
            bottom: 0;
            left: 12px;
            width: calc(100vw - 24px);
            max-height: min(320px, 42dvh);
            box-sizing: border-box;
            padding: 18px 20px calc(18px + env(safe-area-inset-bottom));
            border-radius: 24px 24px 0 0;
            overflow-y: auto;
            opacity: 1;
            visibility: visible;
            pointer-events: auto;
            transform: translateY(0);
            transform-origin: bottom center;
            animation: koala-sheet-in 0.3s cubic-bezier(0.22, 1, 0.36, 1) both;
          }

          .mobile-energy-layer .koala-status-heading {
            margin-bottom: 5px;
          }

          .mobile-energy-layer .koala-status-close {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            padding: 0;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 50%;
            color: #d8deeb;
            background: rgba(255, 255, 255, 0.06);
            cursor: pointer;
          }

          .mobile-energy-layer .koala-status-summary {
            margin-bottom: 10px;
          }

          .mobile-energy-layer .koala-status-popover p {
            display: -webkit-box;
            margin: 10px 0 12px;
            overflow: hidden;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
          }

          @keyframes koala-backdrop-in {
            from { opacity: 0; }
            to { opacity: 1; }
          }

          @keyframes koala-sheet-in {
            from { opacity: 0; transform: translateY(104%); }
            to { opacity: 1; transform: translateY(0); }
          }
        }
        
        /* This Week Tracker */
        .this-week-card {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 26px;
          flex-wrap: wrap;
          gap: 16px;
        }

        @media (min-width: 900px) {
          .progress-container {
            min-height: 100%;
            justify-content: flex-start;
          }

          .bedtime-reflection-card .countdown-gauge-container {
            width: 150px;
            height: 150px;
            margin-bottom: 8px;
          }

          .bedtime-result-panel {
            min-height: 150px;
            padding: 18px;
          }

          .bedtime-result-icon {
            width: 44px;
            height: 44px;
            margin-bottom: 9px;
          }

          .bedtime-result-heading {
            font-size: 1.2rem;
            margin-bottom: 5px;
          }

          .bedtime-result-description {
            max-width: 92%;
            font-size: 0.84rem;
          }
        }
        .week-days-timeline {
          --week-node-size: 34px;
          --week-column-width: 52px;
          --week-column-gap: 32px;
          --week-label-height: 20px;
          --week-row-gap: 10px;
          display: flex;
          align-items: center;
          gap: var(--week-column-gap);
          position: relative;
          z-index: 2;
        }
        .day-node-column {
          display: flex;
          width: var(--week-column-width);
          flex: 0 0 var(--week-column-width);
          flex-direction: column;
          align-items: center;
          gap: var(--week-row-gap);
          position: relative;
          z-index: 2;
        }
        .day-node-column:not(:first-child)::before {
          content: '';
          position: absolute;
          top: calc(
            var(--week-label-height) +
            var(--week-row-gap) +
            (var(--week-node-size) / 2) - 1px
          );
          left: calc(
            -1 * var(--week-column-gap) -
            ((var(--week-column-width) - var(--week-node-size)) / 2)
          );
          width: calc(
            var(--week-column-gap) +
            var(--week-column-width) -
            var(--week-node-size)
          );
          height: 2px;
          background: repeating-linear-gradient(
            90deg,
            rgba(255, 255, 255, 0.18) 0 5px,
            transparent 5px 9px
          );
          pointer-events: none;
        }
        .day-label-text {
          font-family: var(--font-body);
          font-size: 0.9rem;
          font-weight: 600;
          line-height: var(--week-label-height);
          color: #aeb9cc;
        }
        .day-node-circle {
          position: relative;
          z-index: 1;
          width: var(--week-node-size);
          height: var(--week-node-size);
          flex: 0 0 var(--week-node-size);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s ease;
        }
        .day-node-circle.checked {
          background-color: #5b9b7e;
          color: #ffffff;
          box-shadow: 0 4px 16px rgba(91, 155, 126, 0.4);
        }
        .day-node-circle.unchecked {
          background-color: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.15);
        }

        /* Keep this override after the desktop tracker rules so the mobile grid wins the cascade. */
        @media (max-width: 768px) {
          .this-week-card {
            padding: 15px 10px;
            align-items: flex-start;
            gap: 11px;
            overflow: hidden;
          }

          .this-week-card > span {
            font-size: 1.08rem !important;
          }

          .week-days-timeline {
            --week-node-size: 26px;
            --week-label-height: 15px;
            --week-row-gap: 6px;
            display: grid;
            width: 100%;
            grid-template-columns: repeat(7, minmax(0, 1fr));
            gap: 0;
          }

          .day-node-column {
            width: auto;
            min-width: 0;
            flex: none;
          }

          .day-node-column:not(:first-child)::before {
            left: calc(-50% + (var(--week-node-size) / 2));
            width: calc(100% - var(--week-node-size));
          }

          .day-label-text {
            font-size: 0.68rem;
          }

          .day-node-circle span {
            font-size: 0.78rem !important;
          }
        }

        /* Post Check-in Result within Dark Card */
        .bedtime-result-panel {
          width: 100%;
          min-height: 180px;
          border-radius: 20px;
          padding: 24px 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255,255,255,0.1);
        }
        .bedtime-result-icon {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 12px;
          background: rgba(255, 255, 255, 0.1);
          color: #f3edd7;
        }
        .bedtime-result-heading {
          font-family: var(--font-serif);
          font-size: 1.3rem;
          font-weight: 700;
          color: #f3edd7;
          margin-bottom: 8px;
        }
        .bedtime-result-description {
          color: #aeb9cc;
          font-size: 0.9rem;
          line-height: 1.4;
          max-width: 80%;
        }
        .emoji-icon-badge {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.1rem;
        }
        .emoji-happy {
          background: rgba(78, 168, 129, 0.3);
          border: 1px solid rgba(78, 168, 129, 0.5);
        }
        .emoji-sleepy {
          background: rgba(167, 139, 250, 0.3);
          border: 1px solid rgba(167, 139, 250, 0.5);
        }

        /* Check-in Modal Update */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background-color: rgba(0, 0, 0, 0.75);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          backdrop-filter: blur(8px);
        }
        .modal-card {
          width: 100%;
          max-width: 420px;
          background: #141a36;
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 28px;
          padding: 40px 32px;
          text-align: center;
          position: relative;
          box-shadow: 0 30px 80px rgba(0,0,0,0.8);
          color: #f3edd7;
        }
      `}</style>

      {/* Floating Transition Controls */}
      {currentView === 'progress' && (
        <button
          type="button"
          className="nav-arrow-btn left-edge"
          onClick={() => setCurrentView('pet')}
          aria-label="Return to Sanctuary"
        >
          <Heart className="nav-arrow-icon" size={26} strokeWidth={1.8} fill="currentColor" />
          <span className="arrow-text-label">Koala</span>
        </button>
      )}

      {/* SLIDER STRUCTURE */}
      <div 
        className="dashboard-slider-track" 
        style={{ transform: currentView === 'pet' ? 'translateX(0)' : 'translateX(-50%)' }}
      >
        
        {/* =========================================
            PANEL 1: THE SANCTUARY (PET VIEW)
            ========================================= */}
        <div className="view-panel">
          <div className="pet-sanctuary-container">

            {/* --- DESKTOP SANCTUARY LAYOUT (> 768px) --- */}
            <div className="desktop-sanctuary-layout">
              {/* Greeting */}
              <div className="greeting-text" style={{ fontFamily: 'var(--font-serif)', fontSize: '2.2rem', color: '#f3edd7', marginBottom: '8px', textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}>
                {dashboardCopy.greeting}
              </div>
              <div className="greeting-subtext" style={{ fontFamily: 'var(--font-body)', fontSize: '1.05rem', color: '#aeb9cc', marginBottom: '16px', textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}>
                {dashboardCopy.subtitle}
              </div>
              
              <div className="bedtime-goal-pill" style={{ 
                 display: 'inline-flex', alignItems: 'center', gap: '8px', 
                 padding: '8px 16px', background: 'rgba(255,255,255,0.05)', 
                 border: '1px solid rgba(255,255,255,0.1)', borderRadius: '99px',
                 color: '#e2e8f0', fontSize: '0.9rem', marginBottom: '12px' 
              }}>
                <Moon size={16} color="#a78bfa" />
                <span>Bedtime goal: {formatCutoff12h(summary?.cutoffTime)}</span>
              </div>

              {/* Koala state is the natural entry point into progress. */}
              {renderKoalaStatus('desktop')}

              {/* Desktop Slider Check-In Wrapper */}
              {showRecordedCheckIn ? (
                renderPostCheckInMessage()
              ) : canCheckInNow ? (
                <div className="slider-wrapper" style={{ position: 'relative', zIndex: 10, width: '380px', maxWidth: '90vw', height: '72px', marginTop: '0', background: 'rgba(30, 27, 75, 0.6)', border: '1.5px solid rgba(167, 139, 250, 0.3)', borderRadius: '99px', overflow: 'hidden' }}>
                  <div className="slider-text" style={{ position: 'absolute', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', color: '#b19df7', fontSize: '1.15rem', gap: '12px', opacity: 1 - (slideVal / 100), fontFamily: 'var(--font-body)', fontWeight: 500 }}>
                     <span style={{ letterSpacing: '4px', opacity: 0.5 }}>········</span>
                     {dashboardCopy.actionText}
                  </div>
                  
                  <div className="slider-thumb" style={{ position: 'absolute', top: '5px', left: `calc(6px + ${slideVal}% - ${slideVal * 0.72}px)`, width: '60px', height: '60px', background: '#ffe4a0', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(255, 228, 160, 0.4)', pointerEvents: 'none', zIndex: 5 }}>
                     <Moon size={28} color="#9061f9" />
                  </div>

                  <input 
                    type="range"
                    min="0" max="100"
                    value={slideVal}
                    onChange={(e) => setSlideVal(Number(e.target.value))}
                    onMouseUp={() => { if (slideVal > 90 && !isLoading) { handleCheckIn(); } setSlideVal(0); }}
                    onTouchEnd={() => { if (slideVal > 90 && !isLoading) { handleCheckIn(); } setSlideVal(0); }}
                    disabled={isLoading}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, zIndex: 10, cursor: 'grab' }}
                  />
                </div>
              ) : (
                <div className="checkin-availability-note" aria-live="polite">
                  <Moon size={17} />
                  <span>{dashboardCopy.actionText}</span>
                </div>
              )}
            </div>

            {/* --- MOBILE DEDICATED SANCTUARY LAYOUT (<= 768px) --- */}
            <div className="mobile-sanctuary-layout">
              {/* Option 1 Floating Eucalyptus Leaves Background */}
              <div className="dreamscape-decorations" aria-hidden="true">
                <div className="eucalyptus-leaf" style={{ top: '12%', left: '6%', animationDelay: '0s' }}>🌿</div>
                <div className="eucalyptus-leaf" style={{ top: '18%', right: '10%', animationDelay: '3.5s' }}>🍃</div>
                <div className="eucalyptus-leaf" style={{ top: '45%', left: '88%', animationDelay: '7s' }}>🌿</div>
              </div>

              {/* Restore the original serif greeting hierarchy; it yields to energy on tap. */}
              {!isKoalaStatusOpen && (
                <div className="mobile-greeting-copy">
                  <div className="greeting-text">{dashboardCopy.greeting}</div>
                  <div className="greeting-subtext">{dashboardCopy.subtitle}</div>
                </div>
              )}

              {/* Bedtime Goal Pill */}
              <div className="bedtime-goal-pill" style={{ 
                 display: 'inline-flex', alignItems: 'center', gap: '8px', 
                 padding: '6px 14px', background: 'rgba(255,255,255,0.06)', 
                 border: '1px solid rgba(255,255,255,0.12)', borderRadius: '99px',
                 color: '#e2e8f0', fontSize: '0.88rem', marginBottom: '10px' 
              }}>
                <Moon size={15} color="#a78bfa" />
                <span>Bedtime goal: {formatCutoff12h(summary?.cutoffTime)}</span>
              </div>

              <button
                type="button"
                className="mobile-badge-shelf"
                onClick={() => navigate('/badges')}
                aria-label={`View achievements. ${unlockedBadgeCount} of ${totalBadgeCount} badges unlocked.`}
              >
                <span className="mobile-badge-shelf-label">
                  <span>Bedtime keepsakes</span>
                  <strong>{unlockedBadgeCount}/{totalBadgeCount}</strong>
                </span>
                <span className="mobile-badge-shelf-row" aria-hidden="true">
                  {mobileBadgeShelf.map((badge, index) => (
                    <span
                      className={`mobile-badge-shelf-item${badge.isLocked ? ' locked' : ''}`}
                      key={`${badge.name}-${index}`}
                      title={badge.name}
                    >
                      <BadgeGraphic name={badge.name} isLocked={badge.isLocked} />
                    </span>
                  ))}
                </span>
              </button>

              {/* Tap mirrors the desktop hover/focus interaction. */}
              {renderKoalaStatus('mobile')}

              {/* Primary check-in action */}
              {showRecordedCheckIn ? (
                renderPostCheckInMessage()
              ) : canCheckInNow ? (
                <div className="mobile-checkin-action" style={{ width: '340px', maxWidth: '90vw', marginTop: '4px', marginBottom: '18px', position: 'relative', zIndex: 10 }}>
                  <button 
                    type="button" 
                    className="duo-btn duo-btn-primary"
                    onClick={handleCheckIn}
                    disabled={isLoading}
                  >
                    <Moon size={20} />
                    <span>{isLoading ? 'Checking in...' : '🌙 Check In Now'}</span>
                  </button>
                </div>
              ) : (
                <div className="checkin-availability-note" aria-live="polite">
                  <Moon size={17} />
                  <span>{dashboardCopy.actionText}</span>
                </div>
              )}
            </div>

            {error && <div style={{ color: '#f87171', marginTop: '12px' }}>{error}</div>}
          </div>
        </div>

        {/* =========================================
            PANEL 2: MY PROGRESS
            ========================================= */}
        <div className="view-panel">
          <div className="progress-container">
            <h2 className="section-big-title">My Progress</h2>
            <p className="progress-intro">A quiet look at your bedtime rhythm.</p>
            
            <div className="progress-grid">
              
              {/* Left Col: Bedtime Metrics */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div className="dark-glass-card bedtime-reflection-card">
                  <div className="bedtime-reflection-header">
                    <div className="bedtime-reflection-title">
                      <strong>{bedtimeState.title}</strong>
                      <span>{bedtimeState.title === "Last night's bedtime" ? 'A gentle look back at your evening' : 'A soft reminder for the night ahead'}</span>
                    </div>
                    <div className="bedtime-reflection-moon" aria-hidden="true">
                      <Moon size={20} />
                    </div>
                  </div>
                  
                  {showCountdown && !summary?.todayCheckedIn ? (
                    <>
                      <div className="countdown-gauge-container" style={{ margin: '0 auto 10px auto' }}>
                        <svg className="gauge-svg" viewBox="0 0 160 160">
                          <circle className="gauge-bg-circle" cx="80" cy="80" r="68" />
                          <circle
                            className={`gauge-progress-circle ${bedtimeState.mode === 'lateWindow' ? 'late-window' : ''}`}
                            cx="80" cy="80" r="68"
                            style={{ strokeDasharray: gaugeCircumference, strokeDashoffset: gaugeOffset }}
                          />
                        </svg>
                        <Sparkles className={`gauge-star-accent ${bedtimeState.mode === 'lateWindow' ? 'late-window' : ''}`} size={18} />
                        <div className="gauge-center-text">
                          <span className="gauge-time-val">{formatRemainingTime(bedtimeState.remainingMinutes ?? 0)}</span>
                          <span className="gauge-left-label">
                            {bedtimeState.mode === 'goal' ? 'to bedtime' : 'to close'}
                          </span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'center', color: '#aeb9cc', fontSize: '0.85rem' }}>
                        Goal is {formatCutoff12h(summary?.cutoffTime)}
                      </div>
                    </>
                  ) : (
                    <div className="bedtime-result-panel">
                      <div className="bedtime-result-icon">
                        {bedtimeState.mode === 'onTime' && <CheckCircle size={28} color="#4ea881" />}
                        {bedtimeState.mode === 'late' && <Clock3 size={28} color="#fbbf24" />}
                        {bedtimeState.mode === 'missing' && <AlertCircle size={28} color="#f87171" />}
                        {bedtimeState.mode === 'upcoming' && <Moon size={28} color="#818cf8"/>}
                      </div>
                      <span className="bedtime-result-heading">
                        {bedtimeResultCopy.heading}
                      </span>
                      <span className="bedtime-result-description">
                        {bedtimeResultCopy.description}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Col: Badges & Streaks */}
              <div className="middle-cards-stack">
                {/* Streak Card */}
                <div className="dark-glass-card progress-stat-card">
                  <div className="card-header-small">
                    <span>Current streak</span>
                    <Sparkles size={16} color="#fbbf24" />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
                    <Flame size={32} color="#fbbf24" style={{ filter: 'drop-shadow(0 0 10px rgba(251, 191, 36, 0.4))'}} />
                    <span className="streak-val-text">{summary ? summary.currentStreak : 7} days</span>
                  </div>
                  <div>
                    <div className="streak-rank-subtext">Weekly rank #12 ⬆ 3</div>
                    <span className="view-leaderboard-link" onClick={() => navigate('/leaderboard')}>View leaderboard →</span>
                  </div>
                </div>

                {/* Badges Card */}
                <div className="dark-glass-card progress-stat-card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div className="card-header-small">
                    <span>Badges earned</span>
                    <Award size={16} color="#f472b6" />
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {summary && summary.badges.length > 0 ? (
                      summary.badges.slice(0, 3).map((b, i) => (
                        <div key={i} className="badge-shield-icon" title={b.name} style={{ width: '40px', height: '40px', display: 'flex' }}>
                          <BadgeGraphic name={b.name} isLocked={false} />
                        </div>
                      ))
                    ) : (
                      <>
                        <div className="badge-shield-icon" title="First Sleep (Locked)" style={{ width: '40px', height: '40px', display: 'flex' }}>
                          <BadgeGraphic name="First Sleep" isLocked={true} />
                        </div>
                        <div className="badge-shield-icon" title="3-Day Koala Care (Locked)" style={{ width: '40px', height: '40px', display: 'flex' }}>
                          <BadgeGraphic name="3-Day Koala Care" isLocked={true} />
                        </div>
                        <div className="badge-shield-icon" title="One Week Calm (Locked)" style={{ width: '40px', height: '40px', display: 'flex' }}>
                          <BadgeGraphic name="One Week Calm" isLocked={true} />
                        </div>
                      </>
                    )}
                  </div>
                  <div className="badge-total-text" style={{ flex: 1 }}>{summary ? summary.badges.length : 0} total</div>
                  
                  {summary && summary.badges.length > 0 && (
                    <div style={{ marginTop: '14px' }}>
                      <span className="view-leaderboard-link" onClick={() => navigate('/badges')}>View badges →</span>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Bottom Row: This Week Tracker */}
              <div className="dark-glass-card this-week-card" style={{ gridColumn: '1 / -1' }}>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: '1.35rem', fontWeight: 600 }}>This week</span>
                <div className="week-days-timeline">
                  {weekDays.map((day, idx) => (
                    <div className="day-node-column" key={idx}>
                      <span className="day-label-text">{day.label}</span>
                      <div className={`day-node-circle ${day.checked ? 'checked' : 'unchecked'}`}>
                        {day.checked && <span style={{ fontSize: '1rem', fontWeight: 'bold' }}>✓</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* Check-In Confirmation Modal overlay if needed (or we just let slider do the work) */}
      {justCheckedInMsg && (
        <div className="modal-overlay" onClick={closeCheckInModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={closeCheckInModal}
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: '#8e9bb4', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>
            <h2 className="brand-font" style={{ fontSize: '1.8rem', marginBottom: '16px', color: '#f3edd7' }}>Good Night! 💤</h2>
            <p style={{ color: '#aeb9cc', fontSize: '1rem', marginBottom: '24px', lineHeight: 1.5 }}>
              Your check-in has been stored! Your sleep streak is now{' '}
              <strong style={{ color: '#fbbf24', fontSize: '1.1rem' }}>{justCheckedInMsg.newStreak}</strong>{' '}
              {justCheckedInMsg.newStreak === 1 ? 'day' : 'days'}.
            </p>
            {justCheckedInMsg.unlockedBadges.length > 0 && (
              <div style={{ marginTop: '16px', textAlign: 'left', background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '16px' }}>
                <h4 style={{ color: '#fbbf24', fontSize: '1.05rem', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Award size={18} /> Achievement Unlocked!
                </h4>
                {justCheckedInMsg.unlockedBadges.map((badgeName, index) => (
                  <div key={index} style={{ padding: '6px 0', fontSize: '0.9rem', color: '#f3edd7' }}>
                    ✨ {badgeName}
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={closeCheckInModal}
              style={{ 
                marginTop: '32px', width: '100%', borderRadius: '16px', padding: '14px',
                background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', 
                fontSize: '1rem', fontWeight: 600, cursor: 'pointer' 
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
