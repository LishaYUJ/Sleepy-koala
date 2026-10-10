import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Circle, CircleDashed, Clock3, Moon, Sparkles } from 'lucide-react';
import { useStore, type CheckInHistory } from '../stores/useStore';

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseHistoryDate = (dateString: string) => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const shiftDate = (date: Date, days: number) => {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
};

const getLastClosedSleepDate = (now: Date) => {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const calendarDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return shiftDate(calendarDate, minutes <= 2 * 60 ? -2 : -1);
};

type JourneyStatus = 'onTime' | 'late' | 'missing';

const JourneyStatusMark: React.FC<{ status: JourneyStatus; compact?: boolean }> = ({ status, compact = false }) => (
  <span className={`journey-status-mark ${status === 'onTime' ? 'on-time' : status}${compact ? ' compact' : ''}`} aria-hidden="true">
    {status === 'onTime' ? (
      <><Circle className="journey-status-main" fill="currentColor" /><Check className="journey-status-badge" /></>
    ) : status === 'late' ? (
      <><Moon className="journey-status-main" /><Clock3 className="journey-status-badge" /></>
    ) : (
      <CircleDashed className="journey-status-main" />
    )}
  </span>
);

export const History: React.FC = () => {
  const { history, loadHistory, isLoading, error, setError } = useStore();
  const now = useMemo(() => new Date(), []);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const monthKey = `${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(2, '0')}`;
  const monthLabel = selectedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const isCurrentMonth = selectedMonth.getFullYear() === now.getFullYear()
    && selectedMonth.getMonth() === now.getMonth();

  const monthRecords = useMemo(
    () => history
      .filter((item) => item.localCheckInDate.startsWith(monthKey))
      .sort((a, b) => b.localCheckInDate.localeCompare(a.localCheckInDate)),
    [history, monthKey],
  );

  const recordsByDate = useMemo(
    () => new Map(monthRecords.map((item) => [item.localCheckInDate, item])),
    [monthRecords],
  );

  const monthCheckIns = useMemo(
    () => monthRecords.filter((item) => item.recorded),
    [monthRecords],
  );

  const allRecordsByDate = useMemo(
    () => new Map(history.map((item) => [item.localCheckInDate, item])),
    [history],
  );

  const latestRecordedDate = useMemo(
    () => history
      .filter((item) => item.recorded)
      .map((item) => item.localCheckInDate)
      .sort((a, b) => b.localeCompare(a))[0],
    [history],
  );

  const recentSleepDays = useMemo(() => {
    const lastClosed = getLastClosedSleepDate(now);
    const latestRecorded = latestRecordedDate ? parseHistoryDate(latestRecordedDate) : null;
    const windowEnd = latestRecorded && latestRecorded > lastClosed ? latestRecorded : lastClosed;

    return Array.from({ length: 7 }, (_, index) => toDateKey(shiftDate(windowEnd, -index)));
  }, [latestRecordedDate, now]);

  const recentMomentRecords = useMemo(
    () => recentSleepDays
      .map((dateKey) => allRecordsByDate.get(dateKey))
      .filter((item): item is CheckInHistory => Boolean(item)),
    [allRecordsByDate, recentSleepDays],
  );

  const recentCheckIns = useMemo(
    () => recentMomentRecords.filter((item) => item.recorded),
    [recentMomentRecords],
  );

  const showNoCheckInLately = recentCheckIns.length === 0 && history.length > 0;

  const calendarDays = useMemo(() => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth();
    const leadingDays = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cellCount = Math.ceil((leadingDays + daysInMonth) / 7) * 7;

    return Array.from({ length: cellCount }, (_, index) => {
      const day = index - leadingDays + 1;
      if (day < 1 || day > daysInMonth) return null;
      const date = new Date(year, month, day);
      return { day, date, key: toDateKey(date) };
    });
  }, [selectedMonth]);

  const bedtimeMomentCount = monthCheckIns.length;
  const journeyCopy = bedtimeMomentCount === 0
    ? 'A quiet month so far. Koala will be here when you are ready tonight.'
    : `You shared ${bedtimeMomentCount} bedtime ${bedtimeMomentCount === 1 ? 'moment' : 'moments'} with Koala this month.`;

  const changeMonth = (offset: number) => {
    setSelectedMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  const retry = () => {
    setError(null);
    loadHistory();
  };

  return (
    <div className="journey-page">
      <style>{`
        .journey-page { width:100%; max-width:1080px; margin:0 auto; padding:20px 24px 88px; color:var(--text-main); }
        .journey-header { margin-bottom:30px; }
        .journey-header h1 { margin:0 0 6px; color:#f3edd7; font-size:2rem; line-height:1.1; font-weight:600; }
        .journey-header p { margin:0; color:var(--text-muted); line-height:1.55; }
        .journey-calendar-shell { padding:clamp(18px,3vw,30px); border-radius:26px; background:rgba(8,11,28,.5); border:1px solid rgba(165,180,252,.1); box-shadow:0 20px 48px rgba(5,7,22,.28), inset 0 1px 0 rgba(255,255,255,.025); backdrop-filter:blur(16px); }
        .journey-month-bar { display:flex; align-items:center; justify-content:space-between; gap:18px; margin-bottom:23px; }
        .journey-month-copy h2 { margin:0 0 6px; color:#f3edd7; font:600 clamp(1.25rem,2vw,1.55rem) var(--font-serif); }
        .journey-month-copy p { margin:0; color:#a4afc5; font-size:.92rem; line-height:1.5; }
        .journey-legend { display:flex; flex-wrap:wrap; align-items:center; gap:10px 18px; margin:18px 0 16px; color:#8e9bb4; font-size:.78rem; }
        .journey-legend-item { display:inline-flex; align-items:center; gap:7px; }
        .journey-legend-rule { display:inline-flex; min-height:25px; align-items:center; color:#707c98; font-size:.72rem; line-height:1.35; }
        .journey-month-controls { display:flex; gap:8px; }
        .journey-month-btn { display:grid; width:40px; height:40px; place-items:center; border-radius:13px; border:1px solid rgba(165,180,252,.12); color:#b8c0e2; background:rgba(129,140,248,.07); cursor:pointer; transition:background .2s ease,color .2s ease,transform .2s ease; }
        .journey-month-btn:hover:not(:disabled) { color:#f3edd7; background:rgba(129,140,248,.16); transform:translateY(-1px); }
        .journey-month-btn:active:not(:disabled) { transform:scale(.97); }
        .journey-month-btn:focus-visible { outline:3px solid rgba(129,140,248,.32); outline-offset:2px; }
        .journey-month-btn:disabled { opacity:.28; cursor:not-allowed; }
        .journey-weekdays,.journey-calendar-grid { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:7px; }
        .journey-weekday { padding:0 0 8px; color:#707c98; font-size:.72rem; font-weight:700; text-align:center; }
        .journey-day { position:relative; min-height:76px; padding:9px; border-radius:15px; color:#7f8aa4; background:rgba(255,255,255,.018); border:1px solid transparent; }
        .journey-day.empty { background:transparent; }
        .journey-day.today { border-color:rgba(129,140,248,.28); }
        .journey-day.future { opacity:.34; }
        .journey-day-number { display:block; font-size:.78rem; font-weight:650; font-variant-numeric:tabular-nums; }
        .journey-day-moon { position:absolute; inset:50% auto auto 50%; display:grid; width:38px; height:38px; place-items:center; transform:translate(-50%,-38%); }
        .journey-day.on-time { color:#c7ccff; background:rgba(129,140,248,.075); }
        .journey-day.late { color:#cab6d3; background:rgba(184,154,199,.055); }
        .journey-day.missing { color:#73809d; background:rgba(104,116,148,.035); }
        .journey-status-mark { position:relative; display:inline-grid; width:42px; height:42px; place-items:center; flex:0 0 auto; }
        .journey-status-main { width:30px; height:30px; stroke-width:1.8; }
        .journey-status-badge { position:absolute; right:0; bottom:1px; width:16px; height:16px; padding:3px; border-radius:50%; stroke-width:2.8; background:#111631; box-shadow:0 0 0 2px #111631; }
        .journey-status-mark.on-time { color:#cfd4ff; filter:drop-shadow(0 0 8px rgba(129,140,248,.42)); }
        .journey-status-mark.on-time .journey-status-main { stroke-width:1.2; }
        .journey-status-mark.on-time .journey-status-badge { color:#6f7be8; }
        .journey-status-mark.late { color:#d0b3da; }
        .journey-status-mark.late .journey-status-main { width:33px; height:33px; stroke-width:2.2; }
        .journey-status-mark.late .journey-status-badge { color:#c0a1cc; }
        .journey-status-mark.missing { color:#68748f; }
        .journey-status-mark.missing .journey-status-main { width:31px; height:31px; stroke-width:1.6; }
        .journey-status-mark.compact { width:25px; height:25px; }
        .journey-status-mark.compact .journey-status-main { width:20px; height:20px; }
        .journey-status-mark.compact .journey-status-badge { right:-1px; bottom:-1px; width:11px; height:11px; padding:2px; box-shadow:0 0 0 1px #111631; }
        .journey-error { display:flex; align-items:center; justify-content:space-between; gap:14px; margin-top:18px; padding:13px 15px; border-radius:14px; color:#e2c1ce; background:rgba(190,122,151,.08); border:1px solid rgba(217,139,154,.15); }
        .journey-error button { padding:7px 11px; border-radius:10px; border:1px solid rgba(217,139,154,.2); color:#f0d4df; background:rgba(190,122,151,.12); cursor:pointer; }
        .journey-nights { margin-top:34px; }
        .journey-nights-heading { display:flex; align-items:center; gap:9px; margin-bottom:15px; color:#f3edd7; font:600 1.25rem var(--font-serif); }
        .journey-nights-heading svg { color:#a5b4fc; }
        .journey-recent-note { display:flex; align-items:center; gap:13px; margin-bottom:14px; padding:15px 16px; border-radius:17px; color:#a9b3c9; background:rgba(104,116,148,.055); border:1px solid rgba(104,116,148,.11); }
        .journey-recent-note-icon { display:grid; width:39px; height:39px; flex:0 0 auto; place-items:center; border-radius:13px; color:#8994ad; background:rgba(104,116,148,.09); }
        .journey-recent-note strong { display:block; margin-bottom:2px; color:#ded9ce; font-size:.94rem; font-weight:650; }
        .journey-recent-note span { font-size:.82rem; line-height:1.45; }
        .journey-list { display:flex; flex-direction:column; }
        .journey-entry { display:grid; grid-template-columns:52px minmax(0,1fr) auto; align-items:center; gap:16px; min-height:84px; padding:15px 6px; border-bottom:1px solid rgba(165,180,252,.08); }
        .journey-entry:first-child { border-top:1px solid rgba(165,180,252,.08); }
        .journey-entry-symbol { display:grid; width:46px; height:46px; place-items:center; border-radius:15px; color:#c7ccff; background:rgba(129,140,248,.1); border:1px solid rgba(165,180,252,.12); }
        .journey-entry.late .journey-entry-symbol { color:#d7c0df; background:rgba(184,154,199,.08); border-color:rgba(184,154,199,.12); }
        .journey-entry.missing .journey-entry-symbol { color:#77839e; background:rgba(104,116,148,.055); border-color:rgba(104,116,148,.1); }
        .journey-entry-copy h3 { margin:0 0 4px; color:#ece8df; font:600 1rem var(--font-body); }
        .journey-entry-copy p { margin:0; color:#8e9bb4; font-size:.88rem; line-height:1.45; }
        .journey-entry-state { color:#aab2d9; font-size:.77rem; font-weight:700; white-space:nowrap; }
        .journey-entry.late .journey-entry-state { color:#bfa8ca; }
        .journey-entry.missing .journey-entry-state { color:#77839e; }
        .journey-empty { min-height:220px; display:grid; place-items:center; padding:32px 20px; text-align:center; color:#8e9bb4; }
        .journey-empty-inner { max-width:360px; }
        .journey-empty-icon { display:grid; width:64px; height:64px; margin:0 auto 16px; place-items:center; border-radius:21px; color:#a5b4fc; background:rgba(129,140,248,.1); }
        .journey-empty h3 { margin:0 0 8px; color:#f3edd7; font:600 1.2rem var(--font-serif); }
        .journey-empty p { margin:0; line-height:1.55; }
        .journey-skeleton { height:84px; border-bottom:1px solid rgba(165,180,252,.08); background:linear-gradient(90deg,transparent,rgba(165,180,252,.045),transparent); background-size:200% 100%; animation:journey-shimmer 1.5s linear infinite; }
        @keyframes journey-shimmer { to { background-position:-200% 0; } }
        @media (max-width:768px) { .journey-page { padding:62px 16px 92px; } .journey-header { margin-bottom:22px; } .journey-calendar-shell { padding:17px 12px 14px; border-radius:22px; } .journey-month-bar { align-items:flex-start; } .journey-month-copy p { max-width:230px; } .journey-legend { gap:8px 12px; } .journey-weekdays,.journey-calendar-grid { gap:4px; } .journey-day { min-height:58px; padding:6px; border-radius:12px; } .journey-day-moon { width:31px; height:31px; } .journey-day-moon .journey-status-main { width:23px; height:23px; } .journey-day-moon .journey-status-badge { width:12px; height:12px; padding:2px; } }
        @media (max-width:480px) { .journey-month-copy p { font-size:.82rem; max-width:190px; } .journey-entry { grid-template-columns:46px minmax(0,1fr); gap:12px; } .journey-entry-state { grid-column:2; margin-top:-10px; } }
        @media (prefers-reduced-motion:reduce) { .journey-month-btn,.journey-skeleton { transition:none; animation:none; } }
      `}</style>

      <header className="journey-header">
        <h1 className="brand-font">Your sleep journey</h1>
        <p>A gentle look back at the nights you shared with Koala.</p>
      </header>

      <section className="journey-calendar-shell" aria-labelledby="journey-month-title">
        <div className="journey-month-bar">
          <div className="journey-month-copy">
            <h2 id="journey-month-title">{monthLabel}</h2>
            <p>{journeyCopy}</p>
          </div>
          <div className="journey-month-controls">
            <button className="journey-month-btn" type="button" onClick={() => changeMonth(-1)} aria-label="Previous month"><ChevronLeft size={19} /></button>
            <button className="journey-month-btn" type="button" onClick={() => changeMonth(1)} disabled={isCurrentMonth} aria-label="Next month"><ChevronRight size={19} /></button>
          </div>
        </div>

        <div className="journey-weekdays" aria-hidden="true">
          {weekdayLabels.map((label) => <div className="journey-weekday" key={label}>{label}</div>)}
        </div>
        <div className="journey-calendar-grid" role="grid" aria-label={`${monthLabel} sleep journey`}>
          {calendarDays.map((day, index) => {
            if (!day) return <div className="journey-day empty" key={`empty-${index}`} aria-hidden="true" />;
            const record = recordsByDate.get(day.key);
            const status = record?.status as JourneyStatus | undefined;
            const statusClass = status === 'onTime' ? 'on-time' : status || '';
            const isToday = day.key === toDateKey(now);
            const isFuture = day.date.getTime() > new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            const stateLabel = status === 'onTime' ? 'rested on time' : status === 'late' ? 'a later night' : status === 'missing' ? 'no check-in recorded' : 'no bedtime moment';

            return (
              <div className={`journey-day ${statusClass}${isToday ? ' today' : ''}${isFuture ? ' future' : ''}`} key={day.key} role="gridcell" aria-label={`${day.key}, ${stateLabel}`}>
                <span className="journey-day-number">{day.day}</span>
                {status && <span className="journey-day-moon"><JourneyStatusMark status={status} /></span>}
              </div>
            );
          })}
        </div>

        <div className="journey-legend" aria-label="Sleep journey legend">
          <span className="journey-legend-item"><JourneyStatusMark status="onTime" compact /><span>Rested on time</span></span>
          <span className="journey-legend-item"><JourneyStatusMark status="late" compact /><span>A later night</span></span>
          <span className="journey-legend-item"><JourneyStatusMark status="missing" compact /><span>No check-in</span></span>
          <span className="journey-legend-rule">Missing nights are tracked for up to 7 consecutive days, then pause until your next check-in.</span>
        </div>

        {error && <div className="journey-error" role="alert"><span>{error}</span><button type="button" onClick={retry}>Try again</button></div>}
      </section>

      <section className="journey-nights" aria-labelledby="journey-nights-title">
        <div className="journey-nights-heading" id="journey-nights-title"><Sparkles size={17} /><span>Bedtime moments</span></div>
        {showNoCheckInLately && (
          <div className="journey-recent-note" role="status">
            <div className="journey-recent-note-icon"><CircleDashed size={22} /></div>
            <div>
              <strong>No check-in lately</strong>
              <span>Your recent sleep days were quiet. Your next check-in will restart the journey.</span>
            </div>
          </div>
        )}
        {isLoading && history.length === 0 ? (
          <div aria-label="Loading sleep journey"><div className="journey-skeleton" /><div className="journey-skeleton" /><div className="journey-skeleton" /></div>
        ) : showNoCheckInLately ? null : recentMomentRecords.length === 0 ? (
          <div className="journey-empty">
            <div className="journey-empty-inner">
              <div className="journey-empty-icon"><CalendarDays size={27} /></div>
              <h3>Your sleep journey starts tonight</h3>
              <p>Your next bedtime moment will appear here after you check in.</p>
            </div>
          </div>
        ) : (
          <div className="journey-list">
            {recentMomentRecords.map((item) => {
              const date = parseHistoryDate(item.localCheckInDate);
              const status = item.status as JourneyStatus;
              const isOnTime = status === 'onTime';
              const isMissing = status === 'missing';
              const checkedInTime = item.checkedInAtUtc
                ? new Date(item.checkedInAtUtc).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                : null;
              return (
                <article className={`journey-entry ${isOnTime ? 'on-time' : isMissing ? 'missing' : 'late'}`} key={item.id || item.localCheckInDate}>
                  <div className="journey-entry-symbol"><JourneyStatusMark status={status} /></div>
                  <div className="journey-entry-copy">
                    <h3>{date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
                    <p>{isMissing ? 'No bedtime check-in was recorded for this sleep day.' : <>{checkedInTime ? `Checked in at ${checkedInTime}. ` : ''}{isOnTime ? 'Koala settled in before your bedtime goal.' : 'It was a later night, but you still made time to check in.'}</>}</p>
                  </div>
                  <span className="journey-entry-state">{isOnTime ? 'Rested on time' : isMissing ? 'No check-in' : 'A later night'}</span>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
