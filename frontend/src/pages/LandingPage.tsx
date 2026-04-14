import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import logo    from "../styles/logo.png";
import logo2   from "../styles/logo2.png";
import "../styles/landing.css";

const TEAM = [
  { name: "Seddik Belbikkey",     role: "API & Backend Integration",  initials: "SB", color: "#81A6C6" },
  { name: "Alessandra Duque",     role: "Project Manager",             initials: "AD", color: "#9B8EC4" },
  { name: "Zineb Kazzaz",         role: "Website Frontend",            initials: "ZK", color: "#4EADAA" },
  { name: "William Southerland",  role: "Database",                    initials: "WS", color: "#C9A050" },
  { name: "Sami Djahankhah",      role: "Mobile Frontend",             initials: "SD", color: "#C97E6A" },
];

const TECH = [
  { name: "MongoDB",      desc: "NoSQL remote database",               color: "#47A248", iconUrl: "https://cdn.simpleicons.org/mongodb/47A248" },
  { name: "Express.js",   desc: "Node.js web framework",               color: "#7A8FA6", iconUrl: "https://cdn.simpleicons.org/express/7A8FA6" },
  { name: "React",        desc: "Frontend UI library",                  color: "#61DAFB", iconUrl: "https://cdn.simpleicons.org/react/61DAFB" },
  { name: "Node.js",      desc: "JavaScript runtime",                   color: "#5FA04E", iconUrl: "https://cdn.simpleicons.org/nodedotjs/5FA04E" },
  { name: "TypeScript",   desc: "Typed JavaScript",                     color: "#3178C6", iconUrl: "https://cdn.simpleicons.org/typescript/3178C6" },
  { name: "Groq + Llama", desc: "AI time estimates & study plans",      color: "#F55036", iconUrl: "", customIcon: true },
  { name: "Canvas LMS",   desc: "Assignment sync via API",              color: "#E66000", iconUrl: "https://cdn.simpleicons.org/canvas/E66000" },
  { name: "DigitalOcean", desc: "Cloud hosting & deployment",           color: "#0080FF", iconUrl: "https://cdn.simpleicons.org/digitalocean/0080FF" },
  { name: "SwaggerHub",   desc: "API documentation",                    color: "#85EA2D", iconUrl: "https://cdn.simpleicons.org/swagger/85EA2D" },
  { name: "GitHub",       desc: "Version control & collaboration",      color: "#8E6A9B", iconUrl: "https://cdn.simpleicons.org/github/8E6A9B" },
];

// ── Coming Soon modal ────────────────────────────────────────────────────────
function SoonModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="land-modal-overlay" onClick={onClose}>
      <div className="land-modal" onClick={e => e.stopPropagation()}>
        <div className="land-modal-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
            <line x1="12" y1="18" x2="12.01" y2="18"/>
          </svg>
        </div>
        <h3 className="land-modal-title">Coming Soon!</h3>
        <p className="land-modal-sub">The Course Compass mobile app for iOS &amp; Android is currently in development. Stay tuned!</p>
        <button className="land-modal-close-btn" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}

// ── Groq inline SVG icon ─────────────────────────────────────────────────────
function GroqIcon({ size = 22, color = "#F55036" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Groq">
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" fill={color} stroke={color} strokeWidth="0.5" strokeLinejoin="round" />
    </svg>
  );
}

// ── Official App Store badge (real SVG from Apple) ───────────────────────────
function AppStoreBadge({ height = 38 }: { height?: number }) {
  return (
    <img
      src="https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg"
      alt="Download on the App Store"
      height={height}
      style={{ display: "block", height, width: "auto" }}
      loading="lazy"
    />
  );
}

// ── Official Google Play badge (real SVG from Wikimedia) ─────────────────────
function GooglePlayBadge({ height = 38 }: { height?: number }) {
  return (
    <img
      src="https://upload.wikimedia.org/wikipedia/commons/7/78/Google_Play_Store_badge_EN.svg"
      alt="Get it on Google Play"
      height={height}
      style={{ display: "block", height, width: "auto" }}
      loading="lazy"
    />
  );
}

// ── Hero visual: floating cards ───────────────────────────────────────────────
function HeroVisual() {
  return (
    <div className="land-hero-visual">
      {/* Faint compass background */}
      <div className="lhv-compass" aria-hidden="true">
        <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Outer ring */}
          <circle cx="100" cy="100" r="92" stroke="#81A6C6" strokeWidth="1.2" strokeDasharray="4 6" opacity="0.22"/>
          {/* Inner ring */}
          <circle cx="100" cy="100" r="62" stroke="#81A6C6" strokeWidth="0.8" opacity="0.13"/>
          {/* Cross lines */}
          <line x1="100" y1="8"  x2="100" y2="192" stroke="#81A6C6" strokeWidth="0.7" opacity="0.12"/>
          <line x1="8"   y1="100" x2="192" y2="100" stroke="#81A6C6" strokeWidth="0.7" opacity="0.12"/>
          {/* Diagonal lines */}
          <line x1="35"  y1="35"  x2="165" y2="165" stroke="#81A6C6" strokeWidth="0.5" opacity="0.08"/>
          <line x1="165" y1="35"  x2="35"  y2="165" stroke="#81A6C6" strokeWidth="0.5" opacity="0.08"/>
          {/* N/S/E/W ticks */}
          <line x1="100" y1="8"  x2="100" y2="22" stroke="#81A6C6" strokeWidth="2" opacity="0.25"/>
          <line x1="100" y1="178" x2="100" y2="192" stroke="#81A6C6" strokeWidth="2" opacity="0.25"/>
          <line x1="8"   y1="100" x2="22"  y2="100" stroke="#81A6C6" strokeWidth="2" opacity="0.25"/>
          <line x1="178" y1="100" x2="192" y2="100" stroke="#81A6C6" strokeWidth="2" opacity="0.25"/>
          {/* Needle — north (blue) */}
          <polygon points="100,28 106,100 100,110 94,100" fill="#81A6C6" opacity="0.55"/>
          {/* Needle — south (warm) */}
          <polygon points="100,172 106,100 100,90 94,100" fill="#C9A050" opacity="0.38"/>
          {/* Center dot */}
          <circle cx="100" cy="100" r="5" fill="#81A6C6" opacity="0.45"/>
          <circle cx="100" cy="100" r="2.5" fill="#fff" opacity="0.9"/>
          {/* Cardinal labels */}
          <text x="100" y="6"   textAnchor="middle" fontSize="9" fontWeight="700" fill="#81A6C6" opacity="0.35" fontFamily="system-ui">N</text>
          <text x="100" y="199" textAnchor="middle" fontSize="9" fontWeight="700" fill="#81A6C6" opacity="0.25" fontFamily="system-ui">S</text>
          <text x="196" y="104" textAnchor="middle" fontSize="9" fontWeight="700" fill="#81A6C6" opacity="0.25" fontFamily="system-ui">E</text>
          <text x="4"   y="104" textAnchor="middle" fontSize="9" fontWeight="700" fill="#81A6C6" opacity="0.25" fontFamily="system-ui">W</text>
        </svg>
      </div>

      {/* ── Card 1: Canvas assignment synced ─────────────────── */}
      <div className="lhv-card lhv-card-1">
        <div className="lhv-card-toprow">
          <div className="lhv-card-icon" style={{ background: "rgba(78,173,170,0.13)", color: "#4EADAA" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
          </div>
          <span className="lhv-card-badge" style={{ background: "rgba(78,173,170,0.12)", color: "#3a9a96" }}>Canvas synced</span>
        </div>
        <p className="lhv-card-title">Project Report</p>
        <div className="lhv-card-meta">
          <span className="lhv-card-tag" style={{ background: "rgba(129,166,198,0.14)", color: "#5a88a8" }}>COP4331</span>
          <span className="lhv-card-tag" style={{ background: "rgba(100,110,130,0.07)", color: "#7a8090" }}>Due Mon</span>
        </div>
        <div className="lhv-card-est">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.7 }}>
            <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
          </svg>
          AI estimate: ~2h
        </div>
      </div>

      {/* ── Card 2: AI study plan ─────────────────────────────── */}
      <div className="lhv-card lhv-card-2">
        <div className="lhv-card-toprow">
          <div className="lhv-card-icon" style={{ background: "rgba(129,166,198,0.14)", color: "#81A6C6" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.21 1.21 0 0 0 1.72 0L21.64 5.36a1.21 1.21 0 0 0 0-1.72Z"/>
              <path d="m14 7 3 3"/>
              <path d="M5 6v4M19 14v4M10 2v2M7 8H3M21 16h-4M11 3H9"/>
            </svg>
          </div>
          <span className="lhv-card-badge" style={{ background: "rgba(129,166,198,0.14)", color: "#4a7a9c" }}>AI-powered</span>
        </div>
        <p className="lhv-card-title">Weekly Study Plan</p>
        <div className="lhv-card-plan-days">
          {["Mon","Tue","Wed","Thu","Fri"].map((d, i) => (
            <div key={d} className="lhv-card-plan-day">
              <span className="lhv-card-plan-day-label">{d}</span>
              <div className="lhv-card-plan-day-bar">
                <div
                  className="lhv-card-plan-day-fill"
                  style={{
                    height: `${[55, 80, 40, 95, 60][i]}%`,
                    background: ["#81A6C6","#9B8EC4","#4EADAA","#81A6C6","#C9A050"][i],
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="lhv-card-plan-sub">Generated for Apr 14 – 18</p>
      </div>

      {/* ── Card 3: Completed task ────────────────────────────── */}
      <div className="lhv-card lhv-card-3">
        <div className="lhv-card-toprow">
          <div className="lhv-card-icon" style={{ background: "rgba(109,160,106,0.13)", color: "#6da06a" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          <span className="lhv-card-badge" style={{ background: "rgba(109,160,106,0.13)", color: "#4a8a47" }}>Completed</span>
        </div>
        <p className="lhv-card-title" style={{ opacity: 0.55, textDecoration: "line-through" }}>Chapter 8 Quiz</p>
        <div className="lhv-card-meta">
          <span className="lhv-card-tag" style={{ background: "rgba(155,142,196,0.13)", color: "#7a6aaa" }}>CDA3103</span>
          <span className="lhv-card-tag" style={{ background: "rgba(109,160,106,0.1)", color: "#5a8a57" }}>Done ✓</span>
        </div>
        <div className="lhv-card-done-bar">
          <div className="lhv-card-done-fill" />
          <span>4 / 4 tasks</span>
        </div>
      </div>

      {/* Floating pulse dot */}
      <div className="lhv-pulse" aria-hidden="true" />
    </div>
  );
}

export default function LandingPage(): JSX.Element {
  const navigate = useNavigate();
  const [showSoon, setShowSoon] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) navigate("/dashboard", { replace: true });
  }, [navigate]);

  return (
    <div className="land-root">
      {showSoon && <SoonModal onClose={() => setShowSoon(false)} />}

      {/* ── NAV ── */}
      <nav className="land-nav">
        <img src={logo2} alt="Course Compass" className="land-nav-logo" />
        <div className="land-nav-links">
          <a href="#about"  className="land-nav-anchor">About</a>
          <a href="#team"   className="land-nav-anchor">Team</a>
          <a href="#tech"   className="land-nav-anchor">Tech</a>
          <Link to="/login"    className="land-nav-login">Log in</Link>
          <Link to="/register" className="land-nav-cta">Get started</Link>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="land-hero">
        <div className="land-hero-inner">
          <div className="land-hero-text">
            <span className="land-hero-badge">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
              </svg>
              AI-powered study planning
            </span>
            <h1 className="land-hero-title">
              Your courses,<br />
              <span className="land-hero-title-accent">finally organized.</span>
            </h1>
            <p className="land-hero-sub">
              Course Compass syncs your Canvas assignments, lets you add personal tasks, estimates study time with AI, and builds a weekly plan — so you can focus on learning, not logistics.
            </p>
            <div className="land-hero-actions">
              <Link to="/register" className="land-btn-primary">Get started free</Link>
              <Link to="/login"    className="land-btn-ghost">Log in →</Link>
            </div>

            {/* Official download badges */}
            <div className="land-download-row">
              <span className="land-download-label">Also available on</span>
              <button
                className="land-badge-btn"
                onClick={() => setShowSoon(true)}
                aria-label="Download on the App Store"
              >
                <AppStoreBadge height={38} />
              </button>
              <button
                className="land-badge-btn"
                onClick={() => setShowSoon(true)}
                aria-label="Get it on Google Play"
              >
                <GooglePlayBadge height={38} />
              </button>
            </div>
          </div>

          <HeroVisual />
        </div>
      </section>

      {/* ── ABOUT ── */}
      <section className="land-about" id="about">
        <div className="land-section-inner">
          <div className="land-about-inner">
            <div className="land-about-logo-wrap">
              <img src={logo} alt="Course Compass" className="land-about-logo" />
            </div>
            <div className="land-about-text">
              <p className="land-section-eyebrow" style={{ textAlign: "left" }}>About the project</p>
              <h2 className="land-about-title">Built by students, for students.</h2>
              <p className="land-about-desc">
                Course Compass is a full-stack academic productivity platform developed by <strong>Team 12</strong> for COP 4331 — Large Software Project at UCF.
                Our goal was simple: give students one place to track every course, every deadline, and every study session.
              </p>
              <p className="land-about-desc">
                Whether you connect Canvas to auto-import your assignments or add your own personal tasks and reminders, Course Compass adapts to how <em>you</em> study.
                The built-in AI — powered by <strong>Llama via Groq</strong> — generates time estimates for each assignment and builds a balanced weekly study plan — no more last-minute cramming.
              </p>
              <div className="land-about-pills">
                <span className="land-about-pill">MERN Stack</span>
                <span className="land-about-pill">REST API</span>
                <span className="land-about-pill">Groq + Llama</span>
                <span className="land-about-pill">Canvas LMS Sync</span>
                <span className="land-about-pill">Mobile App</span>
              </div>
              <a
                href="https://github.com/sedzaio/Course-Compass"
                target="_blank"
                rel="noopener noreferrer"
                className="land-about-github"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
                </svg>
                View on GitHub
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="land-features">
        <div className="land-section-inner">
          <p className="land-section-eyebrow">Everything you need</p>
          <h2 className="land-section-title">Stop juggling five different tabs.</h2>
          <div className="land-features-grid">
            <div className="land-feature-card">
              <div className="land-feature-icon land-feature-icon-blue">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
              </div>
              <h3 className="land-feature-title">Canvas Sync</h3>
              <p className="land-feature-desc">Connect your Canvas LMS and automatically pull in all your assignments, due dates, and course info — no manual entry.</p>
            </div>
            <div className="land-feature-card">
              <div className="land-feature-icon land-feature-icon-purple">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
                  <path d="M20 3v4M22 5h-4M4 17v2M5 18H3M11 3H9"/>
                </svg>
              </div>
              <h3 className="land-feature-title">AI Time Estimates</h3>
              <p className="land-feature-desc">Powered by Llama via Groq, the AI analyzes each assignment and estimates how long it'll take — so your plan reflects reality, not guesses.</p>
            </div>
            <div className="land-feature-card">
              <div className="land-feature-icon land-feature-icon-teal">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </div>
              <h3 className="land-feature-title">Weekly Study Plans</h3>
              <p className="land-feature-desc">One click generates a smart study schedule for the week, balanced across all your courses and built around your deadlines.</p>
            </div>
            <div className="land-feature-card">
              <div className="land-feature-icon land-feature-icon-amber">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </div>
              <h3 className="land-feature-title">Personal Tasks</h3>
              <p className="land-feature-desc">Not everything is on Canvas. Add your own custom tasks, reminders, and personal to-dos alongside your course assignments.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="land-how">
        <div className="land-section-inner">
          <p className="land-section-eyebrow">How it works</p>
          <h2 className="land-section-title">Up and running in minutes.</h2>
          <div className="land-steps">
            <div className="land-step">
              <div className="land-step-num">1</div>
              <div className="land-step-body">
                <h3 className="land-step-title">Create your account</h3>
                <p className="land-step-desc">Sign up with your email. Takes 30 seconds — no credit card, no setup headache.</p>
              </div>
            </div>
            <div className="land-step-connector" />
            <div className="land-step">
              <div className="land-step-num">2</div>
              <div className="land-step-body">
                <h3 className="land-step-title">Add courses &amp; tasks</h3>
                <p className="land-step-desc">Connect Canvas to auto-import assignments, or add your own courses and personal tasks manually.</p>
              </div>
            </div>
            <div className="land-step-connector" />
            <div className="land-step">
              <div className="land-step-num">3</div>
              <div className="land-step-body">
                <h3 className="land-step-title">Generate your week</h3>
                <p className="land-step-desc">Hit "Generate Plan" and get a personalized AI study schedule for the entire week in one click.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── MEET THE TEAM ── */}
      <section className="land-team" id="team">
        <div className="land-section-inner">
          <p className="land-section-eyebrow">The builders</p>
          <h2 className="land-section-title">Meet Team 12.</h2>
          <div className="land-team-grid">
            {TEAM.map(m => (
              <div key={m.name} className="land-team-card">
                <div className="land-team-avatar" style={{ background: `${m.color}22`, color: m.color, borderColor: `${m.color}44` }}>
                  {m.initials}
                </div>
                <div className="land-team-info">
                  <p className="land-team-name">{m.name}</p>
                  <p className="land-team-role">{m.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TECH STACK ── */}
      <section className="land-tech" id="tech">
        <div className="land-section-inner">
          <p className="land-section-eyebrow">Under the hood</p>
          <h2 className="land-section-title">Technologies that made it possible.</h2>
          <div className="land-tech-grid">
            {TECH.map(t => (
              <div key={t.name} className="land-tech-card">
                <div className="land-tech-icon land-tech-icon-img" style={{ background: `${t.color}15` }}>
                  {t.customIcon ? (
                    <GroqIcon size={22} color={t.color} />
                  ) : (
                    <img src={t.iconUrl} alt={t.name} width="22" height="22" loading="lazy"
                      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  )}
                </div>
                <div>
                  <p className="land-tech-name">{t.name}</p>
                  <p className="land-tech-desc">{t.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA STRIP ── */}
      <section className="land-cta-strip">
        <div className="land-section-inner land-cta-inner">
          <div>
            <h2 className="land-cta-title">Ready to stop stressing about deadlines?</h2>
            <p className="land-cta-sub">Join students using Course Compass to stay ahead every semester.</p>
          </div>
          <div className="land-cta-right">
            <Link to="/register" className="land-btn-primary land-btn-primary-lg">Get started free →</Link>
            <div className="land-cta-download">
              <span className="land-download-label">Mobile app</span>
              <button className="land-badge-btn" onClick={() => setShowSoon(true)} aria-label="Download on the App Store">
                <AppStoreBadge height={32} />
              </button>
              <button className="land-badge-btn" onClick={() => setShowSoon(true)} aria-label="Get it on Google Play">
                <GooglePlayBadge height={32} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="land-footer">
        <img src={logo2} alt="Course Compass" className="land-footer-logo" />
        <p className="land-footer-text">Built for students, by students · Team 12 · COP 4331 &copy; {new Date().getFullYear()}</p>
        <div className="land-footer-links">
          <a href="#about">About</a>
          <a href="#team">Team</a>
          <a href="https://github.com/sedzaio/Course-Compass" target="_blank" rel="noopener noreferrer">GitHub</a>
          <Link to="/login">Log in</Link>
          <Link to="/register">Sign up</Link>
        </div>
      </footer>
    </div>
  );
}
