import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Moon, Trophy } from 'lucide-react';
import landingPageBackground from '../assets/landingpage.png';

export const Landing: React.FC = () => (
  <main className="landing-page">
    <style>{`
      .landing-page { position:relative; z-index:1; min-height:100dvh; padding:24px clamp(20px,5vw,72px) 56px; color:var(--text-main); background:#090b1e; isolation:isolate; }
      .landing-page::before { content:''; position:fixed; inset:0; z-index:-2; background-image:url(${landingPageBackground}); background-size:cover; background-position:center; background-repeat:no-repeat; }
      .landing-page::after { content:''; position:fixed; inset:0; z-index:-1; pointer-events:none; background:linear-gradient(90deg,rgba(7,8,25,.22) 0%,rgba(7,8,25,.08) 48%,rgba(7,8,25,.02) 100%); }
      .landing-nav { max-width: 1180px; height: 56px; margin: 0 auto; display:flex; align-items:center; justify-content:space-between; }
      .landing-brand { display:flex; align-items:center; gap:10px; color:var(--text-main); font-size:1.2rem; }
      .landing-brand-icon { width:34px; height:34px; object-fit:contain; flex:0 0 auto; }
      .landing-login { color:var(--text-main); font-weight:600; }
      .landing-hero { max-width:1180px; min-height:calc(100dvh - 136px); margin:0 auto; display:flex; align-items:center; }
      .landing-copy { max-width:570px; }
      .landing-copy h1 { font-size:clamp(3rem, 6vw, 5.65rem); line-height:.98; margin:18px 0; }
      .landing-copy p { max-width:510px; color:var(--text-muted); font-size:1.14rem; line-height:1.65; }
      .landing-kicker { display:inline-flex; align-items:center; gap:8px; color:#c8cdfc; font-size:.92rem; font-weight:700; }
      .landing-actions { display:flex; flex-wrap:wrap; gap:14px; margin-top:30px; }
      .landing-actions .btn { text-decoration:none; min-height:48px; }
      .landing-steps { max-width:1180px; margin:12px auto 0; display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; }
      .landing-step { min-height:150px; padding:22px; border:1px solid var(--card-border); border-radius:18px; background:rgba(20,26,54,.48); }
      .landing-step svg { color:var(--primary); margin-bottom:16px; }
      .landing-step h2 { font-size:1.12rem; margin-bottom:8px; }
      .landing-step p { color:var(--text-muted); line-height:1.5; }
      @media (max-width:760px) { .landing-page { padding-top:16px; } .landing-page::before { background-position:88% center; } .landing-page::after { background:linear-gradient(180deg,rgba(7,8,25,.2),rgba(7,8,25,.55)); } .landing-hero { min-height:calc(100dvh - 92px); padding:52px 0 40px; } .landing-copy { padding:24px 18px; border-radius:20px; background:rgba(8,10,30,.42); backdrop-filter:blur(7px); } .landing-copy h1 { font-size:3.2rem; } .landing-steps { grid-template-columns:1fr; } }
    `}</style>
    <nav className="landing-nav" aria-label="Main navigation">
      <Link className="landing-brand brand-font" to="/">
        <img className="landing-brand-icon" src="/icons/sleepy-koala-app-icon.png?v=2" alt="" aria-hidden="true" />
        Sleepy Koala
      </Link>
      <Link className="landing-login" to="/login">Log in</Link>
    </nav>
    <section className="landing-hero">
      <div className="landing-copy">
        <div className="landing-kicker"><Moon size={17} aria-hidden="true" />A gentler way to keep a sleep goal</div>
        <h1>Go to sleep on time, with your koala.</h1>
        <p>Set a bedtime goal and check in before you sleep. Each small win helps your koala and your habit grow stronger.</p>
        <div className="landing-actions">
          <Link className="btn btn-primary" to="/login?mode=register">Set my goal <ArrowRight size={18} aria-hidden="true" /></Link>
        </div>
      </div>
    </section>
    <section className="landing-steps" aria-label="How it works">
      <article className="landing-step"><Moon size={24} aria-hidden="true" /><h2>Set a sleep goal</h2><p>Choose when you want to start getting ready for bed.</p></article>
      <article className="landing-step"><CheckCircle2 size={24} aria-hidden="true" /><h2>Check in before bed</h2><p>Open the app at night and let your koala know you are ready to rest.</p></article>
      <article className="landing-step"><Trophy size={24} aria-hidden="true" /><h2>Build your streak</h2><p>Keep checking in on time to unlock badges and care for your koala.</p></article>
    </section>
  </main>
);
