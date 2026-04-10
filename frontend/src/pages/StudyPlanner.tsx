import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../api";
import logo from "../styles/logo2.png";
import "../styles/planner.css";

// ─── Types ───────────────────────────────────────────────────────────────────────────

type StudySession = {
  _id: string;
  assignmentId: string;
  title: string;
  courseId?: string | null;
  date: string;
  from: string;
  to: string;
  hours: number;
  completed: boolean;
  skipped: boolean;
};

type PlanWarning = {
  assignmentId: string;
  title: string;
  scheduledHours: number;
  neededHours: number;
  message: string;
};

// severity: 'critical' = window trapped this week, must fix availability NOW
//           'soft'     = window extends beyond this week, can try another week
type PlanUnscheduled = {
  assignmentId: string;
  title: string;
  reason: string;
  severity: "critical" | "soft";
};

type Course = {
  id?: string;
  _id?: string;
  title?: string;
  name?: string;
  code?: string;
  color?: string;
};

type Assignment = {
  id?: string;
  _id?: string;
  courseId?: string | null;
  canvasUrl?: string | null;
  source?: string;
};

type StoredUser = { id?: string; _id?: string; name?: string; email?: string };

// ─── Icons ───────────────────────────────────────────────────────────────────────────

function IconWandSparkles({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.21 1.21 0 0 0 1.72 0L21.64 5.36a1.21 1.21 0 0 0 0-1.72Z" />
      <path d="m14 7 3 3" />
      <path d="M5 6v4" />
      <path d="M19 14v4" />
      <path d="M10 2v2" />
      <path d="M7 8H3" />
      <path d="M21 16h-4" />
      <path d="M11 3H9" />
    </svg>
  );
}

function IconRefresh({ spinning }: { spinning?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
      style={spinning ? { animation: "dash-spin 0.8s linear infinite" } : {}}>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

function IconCheck({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconWarn() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function IconInfo() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function IconExternal() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function IconClock({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconCalendar({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function IconX({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────────

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getWeekDays(anchor: Date, firstDay: "sunday" | "monday"): Date[] {
  const d = new Date(anchor);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const offset = firstDay === "monday" ? (day === 0 ? -6 : 1 - day) : -day;
  d.setDate(d.getDate() + offset);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    return x;
  });
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isValidDateStr(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00");
  return !isNaN(d.getTime());
}

function fmtTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, "0")}${ampm}`;
}

function fmtHours(h: number): string {
  const totalMin = Math.round(h * 60);
  const hrs = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (hrs === 0) return `${min}m`;
  if (min === 0) return `${hrs}h`;
  return `${hrs}h${min}m`;
}

function getBadgeLabel(course?: Course | null): string {
  if (!course) return "";
  const raw = course.code || course.title || course.name || "";
  return raw.trim().slice(0, 7).toUpperCase();
}

function getCourseId(c: Course): string {
  return c.id || c._id || "";
}

function getAssignmentId(a: Assignment): string {
  return a.id || a._id || "";
}

// ─── Component ───────────────────────────────────────────────────────────────────────

export default function StudyPlanner(): JSX.Element {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const [searchParams] = useSearchParams();

  const currentUser = useMemo<StoredUser | null>(() => {
    try { return JSON.parse(localStorage.getItem("user") || "null"); } catch { return null; }
  }, []);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  const [firstDay, setFirstDay] = useState<"sunday" | "monday">("sunday");
  const [bufferHours, setBufferHours] = useState<number>(24);
  const [advanceDays, setAdvanceDays] = useState<number>(7);

  // ── Gate: don't load plan until preferences have been fetched ─────────────────────
  // This prevents loadPlan from firing twice with two different weekStartStr values
  // (once with the default "sunday" and again after prefs say "monday").
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const [courses, setCourses] = useState<Course[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  const [selectedDayIdx, setSelectedDayIdx] = useState<number>(() => new Date().getDay());

  const [weekAnchor, setWeekAnchor] = useState<Date>(() => new Date());
  const weekDays = useMemo(() => getWeekDays(weekAnchor, firstDay), [weekAnchor, firstDay]);
  const weekStartStr = useMemo(() => toDateStr(weekDays[0]), [weekDays]);

  const [sessions, setSessions]       = useState<StudySession[]>([]);
  const [warnings, setWarnings]       = useState<PlanWarning[]>([]);
  const [unscheduled, setUnscheduled] = useState<PlanUnscheduled[]>([]);
  const [hasPlan, setHasPlan]         = useState(false);
  const [planLoading, setPlanLoading] = useState(true);
  const [genLoading, setGenLoading]   = useState(false);
  const [planError, setPlanError]     = useState("");
  const [noAvail, setNoAvail]         = useState(false);

  // Banner collapse state
  const [warnCollapsed, setWarnCollapsed] = useState(false);
  const [softCollapsed, setSoftCollapsed] = useState(false);

  const [celebrating, setCelebrating] = useState<Set<string>>(new Set());
  const [detailSession, setDetailSession] = useState<StudySession | null>(null);

  // ── Guard: autoGenerate fires exactly once after initial load ─────────────────────
  const autoGenerateFiredRef = useRef(false);

  // ── Split unscheduled into critical vs soft ─────────────────────────────────────────
  const criticalItems = useMemo(
    () => unscheduled.filter(u => u.severity === "critical"),
    [unscheduled]
  );
  const softItems = useMemo(
    () => unscheduled.filter(u => u.severity === "soft"),
    [unscheduled]
  );

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  }

  useEffect(() => { if (!token) navigate("/login"); }, [token, navigate]);

  // ── Load preferences FIRST, then set prefsLoaded = true ──────────────────────────
  // loadPlan is gated on prefsLoaded so it always uses the correct weekStartStr.
  useEffect(() => {
    if (!token) return;
    const h = { headers: { Authorization: `Bearer ${token}` } };
    Promise.all([
      api.get("/api/planner/preferences", h),
      api.get("/api/courses", h),
      api.get("/api/assignments", h),
    ]).then(([prefRes, coursesRes, assignRes]) => {
      const fd = prefRes.data?.firstDayOfWeek;
      if (fd === "monday" || fd === "sunday") setFirstDay(fd);
      const sp = prefRes.data?.studyPlanner || {};
      if (sp.bufferHours != null) setBufferHours(Number(sp.bufferHours));
      if (sp.advanceDays != null) setAdvanceDays(Number(sp.advanceDays));

      const cd = Array.isArray(coursesRes?.data)
        ? coursesRes.data
        : Array.isArray(coursesRes?.data?.courses)
          ? coursesRes.data.courses
          : [];
      setCourses(cd);

      const ad = Array.isArray(assignRes?.data)
        ? assignRes.data
        : Array.isArray(assignRes?.data?.assignments)
          ? assignRes.data.assignments
          : [];
      setAssignments(ad);
    }).catch(() => {
      // Even on failure, unblock so the UI doesn't hang
    }).finally(() => {
      setPrefsLoaded(true);
    });
  }, [token]);

  useEffect(() => {
    const todayStr = toDateStr(new Date());
    const idx = weekDays.findIndex(d => toDateStr(d) === todayStr);
    setSelectedDayIdx(idx >= 0 ? idx : 0);
  }, [weekDays]);

  const loadPlan = useCallback(() => {
    if (!token) return;
    if (!isValidDateStr(weekStartStr)) {
      setPlanError("Invalid week start date — please navigate to a valid week.");
      return;
    }
    setPlanLoading(true); setPlanError(""); setNoAvail(false);
    api.get(`/api/planner/schedule?weekStart=${weekStartStr}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        setSessions(res.data.sessions || []);
        setWarnings(res.data.warnings || []);
        setUnscheduled(res.data.unscheduled || []);
        setHasPlan(true);
      })
      .catch(err => {
        if (err?.response?.status === 404) {
          setHasPlan(false); setSessions([]); setWarnings([]); setUnscheduled([]);
        } else {
          setPlanError("Failed to load plan.");
        }
      })
      .finally(() => setPlanLoading(false));
  }, [token, weekStartStr]);

  // ── Only run loadPlan after preferences have settled ─────────────────────────────
  // Without this gate, loadPlan fires with weekStartStr="2026-04-06" (sunday default),
  // then fires again with weekStartStr="2026-04-07" (monday from prefs), causing two
  // separate GET calls. If autoGenerate=true, the first 404 triggers generation with
  // the wrong weekStart, creating a duplicate/stale document.
  useEffect(() => {
    if (!prefsLoaded) return;
    loadPlan();
  }, [loadPlan, prefsLoaded]);

  // ── Auto-generate if ?autoGenerate=true — fires exactly once after load resolves ──
  // Also gated on prefsLoaded so weekStartStr is final before handleGenerate is called.
  useEffect(() => {
    if (searchParams.get("autoGenerate") !== "true") return;
    if (!prefsLoaded) return;
    if (planLoading) return;
    if (hasPlan) return;
    if (autoGenerateFiredRef.current) return;
    autoGenerateFiredRef.current = true;
    handleGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsLoaded, planLoading, hasPlan]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node))
        setMobileMenuOpen(false);
    }
    if (mobileMenuOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [mobileMenuOpen]);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") setDetailSession(null);
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  async function handleGenerate() {
    if (!token) return;
    if (!weekStartStr || !isValidDateStr(weekStartStr)) {
      setPlanError("Cannot generate plan: week start date is invalid.");
      return;
    }
    setGenLoading(true); setPlanError(""); setNoAvail(false);
    try {
      const res = await api.post(
        "/api/planner/generate",
        { weekStart: weekStartStr },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSessions(res.data.sessions || []);
      setWarnings(res.data.warnings || []);
      setUnscheduled(res.data.unscheduled || []);
      setHasPlan(true);
    } catch (err: any) {
      const msg = err?.response?.data?.message || "";
      if (msg.toLowerCase().includes("availability")) setNoAvail(true);
      else setPlanError(msg || "Failed to generate plan.");
    } finally {
      setGenLoading(false);
    }
  }

  async function toggleDone(sessionId: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    if (!token) return;
    const session = sessions.find(s => s._id === sessionId);
    if (!session) return;
    const newVal = !session.completed;

    setSessions(prev => prev.map(s => s._id === sessionId ? { ...s, completed: newVal } : s));

    if (newVal) {
      setCelebrating(prev => new Set(prev).add(sessionId));
      setTimeout(() => setCelebrating(prev => { const n = new Set(prev); n.delete(sessionId); return n; }), 1200);
    }

    if (detailSession?._id === sessionId) {
      setDetailSession(prev => prev ? { ...prev, completed: newVal } : prev);
    }

    try {
      await api.patch(
        `/api/planner/schedule/${sessionId}`,
        { completed: newVal },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch {
      setSessions(prev => prev.map(s => s._id === sessionId ? session : s));
      if (detailSession?._id === sessionId) setDetailSession(session);
    }
  }

  const courseMap = useMemo(() => {
    const m: Record<string, Course> = {};
    courses.forEach(c => { m[getCourseId(c)] = c; });
    return m;
  }, [courses]);

  const assignmentMap = useMemo(() => {
    const m: Record<string, Assignment> = {};
    assignments.forEach(a => { m[getAssignmentId(a)] = a; });
    return m;
  }, [assignments]);

  const sessionsByDate = useMemo(() => {
    const map: Record<string, StudySession[]> = {};
    sessions.forEach(s => {
      if (!map[s.date]) map[s.date] = [];
      map[s.date].push(s);
    });
    Object.keys(map).forEach(k => map[k].sort((a, b) => a.from.localeCompare(b.from)));
    return map;
  }, [sessions]);

  const totalScheduled  = useMemo(() => sessions.reduce((acc, s) => acc + s.hours, 0), [sessions]);
  const totalDone       = useMemo(() => sessions.filter(s => s.completed).length, [sessions]);
  const totalDoneHours  = useMemo(() => sessions.filter(s => s.completed).reduce((acc, s) => acc + s.hours, 0), [sessions]);
  const progressPct     = sessions.length > 0 ? Math.round((totalDone / sessions.length) * 100) : 0;

  function getCardMeta(s: StudySession) {
    const assignment  = s.assignmentId ? assignmentMap[s.assignmentId] : null;
    const courseId    = s.courseId || assignment?.courseId || null;
    const course      = courseId ? courseMap[courseId] : null;
    const badgeLabel  = getBadgeLabel(course);
    const color       = course?.color || null;
    const isCanvas    = assignment?.source === "canvas";
    const canvasUrl   = isCanvas ? (assignment as any)?.canvasUrl || null : null;
    const siblings    = sessions
      .filter(x => x.assignmentId === s.assignmentId)
      .sort((a, b) => a.date.localeCompare(b.date) || a.from.localeCompare(b.from));
    const siblingsTotal = siblings.length;
    const siblingsDone  = siblings.filter(x => x.completed).length;
    const partIdx       = siblings.findIndex(x => x._id === s._id) + 1;
    const showPartBadge = siblingsTotal > 1;
    return { assignment, course, badgeLabel, color, canvasUrl, isCanvas, siblingsTotal, siblingsDone, partIdx, showPartBadge };
  }

  // ─── Topbar ──────────────────────────────────────────────────────────────────────

  function renderTopbar() {
    return (
      <>
        <nav className="topbar">
          <Link to="/dashboard"><img src={logo} alt="Course Compass" className="topbar-logo" /></Link>
          <div className="topbar-pill-nav">
            <Link to="/dashboard" className="topbar-pill">Dashboard</Link>
            <Link to="/courses"   className="topbar-pill">Courses</Link>
            <Link to="/planner"   className="topbar-pill topbar-pill-active">Study Planner</Link>
            <Link to="/settings"  className="topbar-pill">Settings</Link>
          </div>
          <div className="topbar-right">
            <button className="topbar-logout-btn" onClick={handleLogout}>Log out</button>
          </div>
          <button
            className={`topbar-hamburger${mobileMenuOpen ? " is-open" : ""}`}
            onClick={() => setMobileMenuOpen(o => !o)}
            aria-label="Menu"
          >
            <span /><span /><span />
          </button>
        </nav>
        <div className={`topbar-mobile-menu${mobileMenuOpen ? " is-open" : ""}`} ref={mobileMenuRef}>
          <Link to="/dashboard" className="topbar-mobile-link" onClick={() => setMobileMenuOpen(false)}>Dashboard</Link>
          <Link to="/courses"   className="topbar-mobile-link" onClick={() => setMobileMenuOpen(false)}>Courses</Link>
          <Link to="/planner"   className="topbar-mobile-link topbar-mobile-link-active" onClick={() => setMobileMenuOpen(false)}>Study Planner</Link>
          <Link to="/settings"  className="topbar-mobile-link" onClick={() => setMobileMenuOpen(false)}>Settings</Link>
          <div className="topbar-mobile-divider" />
          <button className="topbar-mobile-link topbar-mobile-link-danger" onClick={handleLogout}>Log out</button>
        </div>
        {mobileMenuOpen && <div className="topbar-backdrop is-open" onClick={() => setMobileMenuOpen(false)} />}
      </>
    );
  }

  // ─── Session card ───────────────────────────────────────────────────────────────────

  function renderSessionCard(s: StudySession) {
    const isDone      = s.completed;
    const isCelebrate = celebrating.has(s._id);
    const { badgeLabel, color, canvasUrl, siblingsDone, siblingsTotal, partIdx, showPartBadge } = getCardMeta(s);

    return (
      <div
        key={s._id}
        className={`sp2-card${isDone ? " sp2-card-done" : ""}${isCelebrate ? " sp2-card-celebrate" : ""}`}
        onClick={() => setDetailSession(s)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === "Enter" && setDetailSession(s)}
      >
        <div className="sp2-card-bar" style={{ backgroundColor: color || "var(--primary)" }} />

        <div className="sp2-card-body">
          <div className="sp2-time-row">
            <span className="sp2-time-block">
              <IconClock />
              {fmtTime(s.from)} – {fmtTime(s.to)}
            </span>
            <span className="sp2-dur-chip">{fmtHours(s.hours)}</span>
          </div>

          <div className="sp2-title">{s.title}</div>

          <div className="sp2-card-meta-row">
            {canvasUrl && (
              <a
                href={canvasUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="sp2-canvas-link"
                title="Open in Canvas"
                onClick={e => e.stopPropagation()}
              >
                Canvas <IconExternal />
              </a>
            )}
            {showPartBadge && (
              <span className="sp2-part-badge">Part {partIdx}/{siblingsTotal}</span>
            )}
          </div>

          <button
            className={`sp2-done-btn${isDone ? " sp2-done-btn-active" : ""}`}
            onClick={(e) => toggleDone(s._id, e)}
            title={isDone ? "Mark as not done" : "Mark as done"}
          >
            <span className="sp2-done-check"><IconCheck size={10} /></span>
            <span>{isDone ? "Done ✓" : "Mark done"}</span>
          </button>
        </div>
      </div>
    );
  }

  // ─── Detail Modal ──────────────────────────────────────────────────────────────────

  function renderDetailModal() {
    if (!detailSession) return null;
    const s = detailSession;
    const live = sessions.find(x => x._id === s._id) || s;
    const { badgeLabel, color, canvasUrl, course, siblingsDone, siblingsTotal, partIdx, showPartBadge } = getCardMeta(live);

    return (
      <div className="sp2-modal-backdrop" onClick={() => setDetailSession(null)}>
        <div className="sp2-modal" onClick={e => e.stopPropagation()}>

          <div className="sp2-modal-header" style={{ borderLeftColor: color || "var(--primary)" }}>
            <div className="sp2-modal-title-wrap">
              <div className="sp2-modal-title-row">
                <div className="sp2-modal-title">{live.title}</div>
                {badgeLabel && (
                  <span className="sp2-badge" style={{
                    backgroundColor: color ? `${color}1a` : "rgba(129,166,198,0.1)",
                    borderColor: color ? `${color}44` : "rgba(129,166,198,0.3)",
                    color: color || "var(--primary)",
                    flexShrink: 0,
                  }}>
                    <span className="sp2-badge-dot" style={{ backgroundColor: color || "var(--primary)" }} />
                    {badgeLabel}
                  </span>
                )}
              </div>
            </div>
            <button className="sp2-modal-close" onClick={() => setDetailSession(null)} aria-label="Close">
              <IconX size={16} />
            </button>
          </div>

          <div className="sp2-modal-body">
            <div className="sp2-modal-row">
              <span className="sp2-modal-label">Date</span>
              <span className="sp2-modal-val">{new Date(live.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "short", day: "numeric" })}</span>
            </div>
            <div className="sp2-modal-row">
              <span className="sp2-modal-label">Time</span>
              <span className="sp2-modal-val">
                {fmtTime(live.from)} – {fmtTime(live.to)}
                <span className="sp2-dur-chip" style={{ marginLeft: 6 }}>{fmtHours(live.hours)}</span>
              </span>
            </div>
            {course && (
              <div className="sp2-modal-row">
                <span className="sp2-modal-label">Course</span>
                <span className="sp2-modal-val">
                  <span className="sp2-badge" style={{
                    backgroundColor: color ? `${color}1a` : "rgba(129,166,198,0.1)",
                    borderColor: color ? `${color}44` : "rgba(129,166,198,0.3)",
                    color: color || "var(--primary)",
                  }}>
                    <span className="sp2-badge-dot" style={{ backgroundColor: color || "var(--primary)" }} />
                    {badgeLabel}
                  </span>
                </span>
              </div>
            )}
            {showPartBadge && (
              <div className="sp2-modal-row">
                <span className="sp2-modal-label">Progress</span>
                <span className="sp2-modal-val">Part {partIdx} of {siblingsTotal} · {siblingsDone}/{siblingsTotal} parts done</span>
              </div>
            )}
            {canvasUrl && (
              <div className="sp2-modal-row">
                <span className="sp2-modal-label">Canvas</span>
                <span className="sp2-modal-val">
                  <a href={canvasUrl} target="_blank" rel="noopener noreferrer" className="sp2-canvas-link">
                    Open in Canvas <IconExternal />
                  </a>
                </span>
              </div>
            )}
            <div className="sp2-modal-row">
              <span className="sp2-modal-label">Status</span>
              <span className="sp2-modal-val">{live.completed ? "✓ Completed" : "Pending"}</span>
            </div>
          </div>

          <div className="sp2-modal-footer">
            <button
              className={`sp2-done-btn${live.completed ? " sp2-done-btn-active" : ""}`}
              style={{ width: "100%", justifyContent: "center" }}
              onClick={(e) => toggleDone(live._id, e)}
            >
              <span className="sp2-done-check"><IconCheck size={10} /></span>
              <span>{live.completed ? "Mark as not done" : "Mark as done"}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Day column (desktop) ───────────────────────────────────────────────────────────

  function renderDayColumn(day: Date) {
    const dateStr  = toDateStr(day);
    const daySess  = sessionsByDate[dateStr] || [];
    const todayStr = toDateStr(new Date());
    const isToday  = dateStr === todayStr;
    const isPast   = day < new Date(new Date().setHours(0, 0, 0, 0));
    const dayLabel = DAY_LABELS[day.getDay()];
    const dayNum   = day.getDate();
    const allDone  = daySess.length > 0 && daySess.every(s => s.completed);

    return (
      <div key={dateStr} className={`sp-day-col${isToday ? " sp-day-today" : ""}${isPast && !isToday ? " sp-day-past" : ""}${allDone ? " sp-day-all-done" : ""}`}>
        <div className="sp-day-header">
          <span className="sp-day-name">{dayLabel}</span>
          <span className={`sp-day-num${isToday ? " sp-day-num-today" : ""}`}>{dayNum}</span>
        </div>
        <div className="sp-day-sessions">
          {daySess.length === 0
            ? <div className="sp-day-empty">—</div>
            : daySess.map(s => renderSessionCard(s))}
        </div>
      </div>
    );
  }

  // ─── Mobile day panel ────────────────────────────────────────────────────────────

  function renderMobileDayPanel() {
    const day      = weekDays[selectedDayIdx];
    const dateStr  = toDateStr(day);
    const daySess  = sessionsByDate[dateStr] || [];
    const todayStr = toDateStr(new Date());
    const isToday  = dateStr === todayStr;
    return (
      <div className="sp-mobile-day-panel">
        <div className={`sp-mobile-day-heading${isToday ? " sp-mobile-day-today" : ""}`}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <IconCalendar size={13} />
            {day.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
          </span>
          {isToday && <span className="sp-today-chip">Today</span>}
        </div>
        {daySess.length === 0
          ? <div className="sp-day-empty sp-day-empty-mobile">No sessions scheduled</div>
          : daySess.map(s => renderSessionCard(s))}
      </div>
    );
  }

  // ─── Week label ────────────────────────────────────────────────────────────────────

  const weekLabel = (() => {
    const start = weekDays[0];
    const end   = weekDays[6];
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`;
  })();

  const isCurrentWeek = useMemo(() => {
    const todayStr = toDateStr(new Date());
    return weekDays.some(d => toDateStr(d) === todayStr);
  }, [weekDays]);

  // ─── Root render ───────────────────────────────────────────────────────────────────

  return (
    <div className="auth-shell-soft">
      {renderTopbar()}
      {renderDetailModal()}

      <main className="page-shell">
        <div className="page-container">

          {/* ── Header row ── */}
          <div className="sp-header">
            <div>
              <h2 className="sp-title">Study Planner</h2>
              <p className="sp-sub">
                Window: {advanceDays}d before due · finish {bufferHours}h early · AI-powered
              </p>
            </div>
            <div className="sp-header-actions">
              <Link to="/settings" className="sp-settings-link"><IconSettings /> Planner Settings</Link>
              <button
                className="sp-generate-btn"
                onClick={handleGenerate}
                disabled={genLoading}
              >
                <span className="sp-generate-btn-icon">
                  {genLoading ? <IconRefresh spinning /> : <IconWandSparkles size={14} />}
                </span>
                {hasPlan
                  ? (genLoading ? "Regenerating…" : "Regenerate Plan")
                  : (genLoading ? "Generating…"   : "Generate Plan")
                }
              </button>
            </div>
          </div>

          {/* ── No availability warning ── */}
          {noAvail && (
            <div className="sp-alert sp-alert-warn">
              <IconWarn />
              No availability configured.{" "}
              <Link to="/settings">Go to Settings → Study Planner</Link> to set your study hours.
            </div>
          )}

          {planError && (
            <div className="sp-alert sp-alert-error">
              <IconWarn /> {planError}
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────────── */}
          {/* ── CRITICAL banner — non-collapsible, single-column layout                ── */}
          {/* ─────────────────────────────────────────────────────────────────────── */}
          {hasPlan && criticalItems.length > 0 && (
            <div className="sp-alert sp-alert-critical">
              <div className="sp-alert-critical-header">
                <span className="sp-alert-critical-icon"><IconWarn /></span>
                <div className="sp-alert-critical-header-text">
                  <strong>
                    {criticalItems.length === 1
                      ? "1 assignment cannot be scheduled this week"
                      : `${criticalItems.length} assignments cannot be scheduled this week`}
                  </strong>
                  <p className="sp-alert-critical-sub">
                    This is their only available week. Adjust your availability in{" "}
                    <Link to="/settings">Settings → Study Planner</Link> and regenerate.
                  </p>
                </div>
              </div>
              <ul className="sp-warn-list sp-warn-list-critical">
                {criticalItems.map((u, i) => (
                  <li key={i}><strong>{u.title}</strong> — {u.reason}</li>
                ))}
              </ul>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────────── */}
          {/* ── SOFT banner — collapsible amber                                        ── */}
          {/* ─────────────────────────────────────────────────────────────────────── */}
          {hasPlan && softItems.length > 0 && (
            <div className="sp-alert sp-alert-soft sp-alert-collapsible">
              <button className="sp-alert-toggle" onClick={() => setSoftCollapsed(v => !v)}>
                <IconInfo />
                <strong>
                  {softItems.length === 1
                    ? "1 assignment couldn't fit this week"
                    : `${softItems.length} assignments couldn't fit this week`}
                </strong>
                <span className="sp-alert-chevron">{softCollapsed ? "▸" : "▾"}</span>
              </button>
              {!softCollapsed && (
                <>
                  <p className="sp-alert-soft-sub">
                    Their scheduling window extends beyond this week — try navigating to a different week or add more availability in{" "}
                    <Link to="/settings">Settings</Link>.
                  </p>
                  <ul className="sp-warn-list">
                    {softItems.map((u, i) => <li key={i}><strong>{u.title}</strong></li>)}
                  </ul>
                </>
              )}
            </div>
          )}

          {/* ── Partially scheduled warnings ── */}
          {hasPlan && warnings.length > 0 && (
            <div className="sp-alert sp-alert-warn sp-alert-collapsible">
              <button className="sp-alert-toggle" onClick={() => setWarnCollapsed(v => !v)}>
                <IconWarn />
                <strong>{warnings.length} assignment{warnings.length > 1 ? "s" : ""} couldn't be fully scheduled this week</strong>
                <span className="sp-alert-chevron">{warnCollapsed ? "▸" : "▾"}</span>
              </button>
              {!warnCollapsed && (
                <ul className="sp-warn-list">
                  {warnings.map((w, i) => <li key={i}><strong>{w.title}</strong> — {w.message}</li>)}
                </ul>
              )}
            </div>
          )}

          {/* ── Week nav ── */}
          <div className="sp-week-nav">
            <button className="dash-week-nav-btn" onClick={() => setWeekAnchor(d => { const x = new Date(d); x.setDate(x.getDate() - 7); return x; })}>‹</button>
            <span className="dash-week-nav-label">{weekLabel}</span>
            {!isCurrentWeek && (
              <button className="dash-week-nav-today" onClick={() => setWeekAnchor(new Date())}>Today</button>
            )}
            <button className="dash-week-nav-btn" onClick={() => setWeekAnchor(d => { const x = new Date(d); x.setDate(x.getDate() + 7); return x; })}>›</button>
          </div>

          {/* ── Stats row ── */}
          {hasPlan && sessions.length > 0 && (
            <div className="sp-stats-row">
              <div className="sp-stat">
                <span className="sp-stat-val">{sessions.length}</span>
                <span className="sp-stat-lbl">sessions</span>
              </div>
              <div className="sp-stat">
                <span className="sp-stat-val">{fmtHours(totalScheduled)}</span>
                <span className="sp-stat-lbl">scheduled</span>
              </div>
              <div className="sp-stat sp-stat-done" style={{ opacity: totalDone > 0 ? 1 : 0.5 }}>
                <span className="sp-stat-val sp-stat-val-done">{totalDone}/{sessions.length}</span>
                <span className="sp-stat-lbl">done</span>
              </div>
            </div>
          )}

          {/* ── Progress bar ── */}
          {hasPlan && sessions.length > 0 && (
            <div className="sp-progress-wrap">
              <div className="sp-progress-bar">
                <div className="sp-progress-fill" style={{ width: `${progressPct}%` }} />
              </div>
              <span className="sp-progress-label">{progressPct}% complete · {fmtHours(totalDoneHours)} of {fmtHours(totalScheduled)} done</span>
            </div>
          )}

          {planLoading && <div className="dash-loading">Loading plan…</div>}

          {!planLoading && !hasPlan && !noAvail && !planError && (
            <div className="sp-empty">
              <div className="sp-empty-icon"><IconWandSparkles size={32} /></div>
              <h3>No study plan yet for this week</h3>
              <p>Hit <strong>Generate Plan</strong> to auto-schedule your assignments based on your availability and scheduling window settings.</p>
              <button className="sp-generate-btn" style={{ marginTop: 20 }} onClick={handleGenerate} disabled={genLoading}>
                <span className="sp-generate-btn-icon"><IconWandSparkles size={14} /></span>
                {genLoading ? "Generating…" : "Generate Plan"}
              </button>
            </div>
          )}

          {/* ── Mobile: day tab strip + panel ── */}
          {!planLoading && hasPlan && (
            <div className="sp-mobile-only">
              <div className="sp-day-tabs">
                {weekDays.map((day, idx) => {
                  const dateStr  = toDateStr(day);
                  const todayStr = toDateStr(new Date());
                  const isToday  = dateStr === todayStr;
                  const daySess  = sessionsByDate[dateStr] || [];
                  const hasSess  = daySess.length > 0;
                  const allDone  = hasSess && daySess.every(s => s.completed);
                  return (
                    <button
                      key={dateStr}
                      className={`sp-day-tab${
                        idx === selectedDayIdx ? " sp-day-tab-active" : ""}${
                        isToday ? " sp-day-tab-today" : ""}`}
                      onClick={() => setSelectedDayIdx(idx)}
                    >
                      <span className="sp-day-tab-label">{DAY_LABELS[day.getDay()]}</span>
                      <span className={`sp-day-tab-num${isToday ? " sp-day-tab-num-today" : ""}`}>
                        {day.getDate()}
                      </span>
                      {hasSess && !allDone && <span className="sp-day-tab-dot" />}
                      {allDone && <span className="sp-day-tab-dot" style={{ background: "#4caf50" }} />}
                    </button>
                  );
                })}
              </div>
              {renderMobileDayPanel()}
            </div>
          )}

          {/* ── Desktop: full week grid ── */}
          {!planLoading && hasPlan && (
            <div className="sp-week-grid sp-desktop-only">
              {weekDays.map(day => renderDayColumn(day))}
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
