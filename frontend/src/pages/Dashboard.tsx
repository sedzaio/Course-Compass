import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api";
import logo from "../styles/logo2.png";
import "../styles/app.css";

// ─── Types ───────────────────────────────────────────────────────────────────

type Course = {
  _id: string;
  title?: string;
  name?: string;
  code?: string;
  color?: string;
  instructor?: string;
  semester?: string;
  isActive?: boolean;
  isHidden?: boolean;
};

type Assignment = {
  _id: string;
  title: string;
  dueDate?: string;
  courseId?: { _id: string; title?: string; name?: string; code?: string; color?: string; instructor?: string; semester?: string } | null;
  completed?: boolean;
  description?: string;
  type?: string;
  estimatedTime?: number;
  canvasId?: string;
  canvasUrl?: string;
  source?: string;
};

type StoredUser  = { id?: string; _id?: string; name?: string; email?: string };
type ViewMode    = "list" | "calendar";
type WeekStart   = "sunday" | "monday";
type ActiveFilter = "overdue" | "thisweek" | "nextweek" | "pending" | "completed" | "all" | "nodate" | null;

// ─── Default color fallback ───────────────────────────────────────────────────

const DEFAULT_COLOR = "#81A6C6";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getToday(): Date {
  const d = new Date(); d.setHours(0,0,0,0); return d;
}

function startOfWeek(date: Date, weekStart: WeekStart): Date {
  const d = new Date(date); d.setHours(0,0,0,0);
  const day = d.getDay();
  const offset = weekStart === "monday" ? (day === 0 ? -6 : 1 - day) : -day;
  d.setDate(d.getDate() + offset);
  return d;
}

function endOfWeek(start: Date): Date {
  const d = new Date(start); d.setDate(d.getDate() + 6); d.setHours(23,59,59,999); return d;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

function isSameWeek(date: Date, start: Date, end: Date): boolean {
  return date >= start && date <= end;
}

function formatWeekRangeShort(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`;
}

function isDueSoon(a: Assignment): boolean {
  if (!a.dueDate || a.completed) return false;
  const due = new Date(a.dueDate);
  const now = new Date();
  return due.getTime() - now.getTime() < 24 * 60 * 60 * 1000 && due > now;
}

function formatDue(dueDate: string): string {
  const due  = new Date(dueDate);
  const time = due.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const date = due.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const isMidnight = time === "12:00 AM";
  return `Due: ${isMidnight ? date : `${date} at ${time}`}`;
}

/**
 * Convert a UTC ISO string (from the DB) into a value suitable for
 * <input type="datetime-local"> — i.e. local time, no timezone suffix.
 */
function utcToLocalInput(utcString?: string | null): string {
  if (!utcString) return "";
  const d = new Date(utcString);
  if (isNaN(d.getTime())) return "";
  const year  = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day   = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const mins  = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${mins}`;
}

/**
 * Convert a datetime-local input value (local time, no timezone) to a
 * UTC ISO string for the API. Returns undefined if empty.
 */
function localInputToUtc(value?: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value); // browser treats no-tz string as local time
  if (isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

/** Extract a short course code (max 7 chars). */
function extractCourseCode(course?: Course | Assignment["courseId"]): string {
  if (!course) return "";
  if (course.code?.trim()) return course.code.trim().slice(0, 7);
  const label = (course.title || course.name || "").trim();
  const match =
    label.match(/[A-Z]{2,4}\s*\d{3,4}[A-Z]?/i) ||
    label.match(/[A-Z]{2,4}-\d{3,4}[A-Z]?/i);
  return match ? match[0].replace(/\s+/g, "").slice(0, 7) : "";
}

function extractCourseName(course?: Course | Assignment["courseId"]): string {
  if (!course) return "";
  return (course.title || course.name || "").trim();
}

function fmtEstimated(hours: number): string {
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}m`;
}

function groupByDay(assignments: Assignment[]): { dateKey: string; label: string; items: Assignment[] }[] {
  const map = new Map<string, Assignment[]>();
  for (const a of assignments) {
    const key = a.dueDate ? new Date(a.dueDate).toDateString() : "no-date";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(a);
  }
  const groups: { dateKey: string; label: string; items: Assignment[] }[] = [];
  for (const [key, items] of map.entries()) {
    const label = key === "no-date"
      ? "No due date"
      : new Date(key).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    groups.push({ dateKey: key, label, items });
  }
  groups.sort((a, b) => {
    if (a.dateKey === "no-date") return 1;
    if (b.dateKey === "no-date") return -1;
    return new Date(a.dateKey).getTime() - new Date(b.dateKey).getTime();
  });
  return groups;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Dashboard(): JSX.Element {
  const navigate = useNavigate();
  const token    = localStorage.getItem("token");

  const currentUser = useMemo<StoredUser | null>(() => {
    try { return JSON.parse(localStorage.getItem("user") || "null"); } catch { return null; }
  }, []);

  const avatarLetter = (currentUser?.name?.[0] || currentUser?.email?.[0] || "S").toUpperCase();
  const firstName    = currentUser?.name?.split(" ")[0] || "there";

  const [courses,        setCourses]        = useState<Course[]>([]);
  const [assignments,    setAssignments]    = useState<Assignment[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [weekStart,      setWeekStart]      = useState<WeekStart>("sunday");
  const [viewMode,       setViewMode]       = useState<ViewMode>("list");
  const [expandedIds,    setExpandedIds]    = useState<Set<string>>(new Set());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [syncBanner,     setSyncBanner]     = useState<string | null>(null);

  // ── Active filter pill ──
  const [activeFilter,   setActiveFilter]   = useState<ActiveFilter>(null);

  const today            = useMemo(() => getToday(), []);
  const [weekAnchor,     setWeekAnchor]     = useState<Date>(() => getToday());
  const currentWeekStart = useMemo(() => startOfWeek(weekAnchor, weekStart), [weekAnchor, weekStart]);
  const currentWeekEnd   = useMemo(() => endOfWeek(currentWeekStart), [currentWeekStart]);
  const isCurrentWeek    = useMemo(() => isSameWeek(today, currentWeekStart, currentWeekEnd), [today, currentWeekStart, currentWeekEnd]);

  const nextWeekStart    = useMemo(() => addDays(startOfWeek(today, weekStart), 7), [today, weekStart]);
  const nextWeekEnd      = useMemo(() => endOfWeek(nextWeekStart), [nextWeekStart]);

  const [calMonth,       setCalMonth]       = useState(() => new Date());
  const [calSelected,    setCalSelected]    = useState<Date | null>(null);

  const [showModal,      setShowModal]      = useState(false);
  const [editingId,      setEditingId]      = useState<string | null>(null);
  const [modalError,     setModalError]     = useState("");
  const [modalSaving,    setModalSaving]    = useState(false);

  const [form, setForm] = useState({
    title: "", dueDate: "", courseId: "", description: "",
    type: "assignment", estHrs: "", estMins: "0",
  });

  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!token) navigate("/login"); }, [token, navigate]);

  useEffect(() => {
    if (!token) return;
    api.get("/api/auth/preferences", { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        const pref = res.data?.firstDayOfWeek || res.data?.preferences?.firstDayOfWeek;
        if (pref === "monday" || pref === "sunday") setWeekStart(pref);
      }).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return;
    api.post("/api/canvas/check-sync", {}, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        if (res.data?.synced) {
          const count = res.data?.count ?? "?";
          setSyncBanner(`Canvas auto-synced — ${count} assignments updated.`);
          setTimeout(() => setSyncBanner(null), 5000);
          api.get("/api/assignments", { headers: { Authorization: `Bearer ${token}` } })
            .then(r => {
              const d = Array.isArray(r.data) ? r.data : Array.isArray(r.data?.assignments) ? r.data.assignments : [];
              setAssignments(d);
            }).catch(() => {});
        }
      }).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const h = { Authorization: `Bearer ${token}` };
    Promise.all([api.get("/api/courses", { headers: h }), api.get("/api/assignments", { headers: h })])
      .then(([cRes, aRes]) => {
        const cData = Array.isArray(cRes.data) ? cRes.data : Array.isArray(cRes.data?.courses) ? cRes.data.courses : [];
        const aData = Array.isArray(aRes.data) ? aRes.data : Array.isArray(aRes.data?.assignments) ? aRes.data.assignments : [];
        setCourses(cData); setAssignments(aData);
      })
      .catch(() => { setCourses([]); setAssignments([]); })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) setMobileMenuOpen(false);
    }
    if (mobileMenuOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [mobileMenuOpen]);

  useEffect(() => {
    function handler(e: KeyboardEvent) { if (e.key === "Escape") closeModal(); }
    if (showModal) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showModal]);

  // ── courseMap: _id → Course ──
  const courseMap = useMemo(() => {
    const map = new Map<string, Course>();
    courses.forEach(c => map.set(c._id, c));
    return map;
  }, [courses]);

  // ── Hidden course IDs ──
  const hiddenCourseIds = useMemo(() => {
    const s = new Set<string>();
    courses.forEach(c => { if (c.isHidden) s.add(c._id); });
    return s;
  }, [courses]);

  const visibleAssignments = useMemo(() =>
    assignments.filter(a => {
      const cid = a.courseId?._id;
      return !cid || !hiddenCourseIds.has(cid);
    }),
  [assignments, hiddenCourseIds]);

  // ── Filtered assignments for list view based on activeFilter ──
  const filteredAssignments = useMemo(() => {
    const todayD = getToday();
    switch (activeFilter) {
      case "overdue":
        return visibleAssignments.filter(a => !a.completed && a.dueDate && new Date(a.dueDate) < todayD);
      case "thisweek":
        return visibleAssignments.filter(a => a.dueDate && isSameWeek(new Date(a.dueDate), currentWeekStart, currentWeekEnd));
      case "nextweek":
        return visibleAssignments.filter(a => a.dueDate && isSameWeek(new Date(a.dueDate), nextWeekStart, nextWeekEnd));
      case "pending":
        return visibleAssignments.filter(a => !a.completed);
      case "completed":
        return visibleAssignments.filter(a => a.completed);
      case "all":
        return visibleAssignments;
      case "nodate":
        return visibleAssignments.filter(a => !a.dueDate);
      default:
        // no filter — show current week only (original behaviour)
        return visibleAssignments.filter(a => {
          if (!a.dueDate) return false;
          const due = new Date(a.dueDate);
          return due >= currentWeekStart && due <= currentWeekEnd;
        });
    }
  }, [activeFilter, visibleAssignments, currentWeekStart, currentWeekEnd, nextWeekStart, nextWeekEnd]);

  // ── Stats counts (always based on all visible assignments, not filtered) ──
  const counts = useMemo(() => ({
    overdue:  visibleAssignments.filter(a => !a.completed && a.dueDate && new Date(a.dueDate) < getToday()).length,
    thisWeek: visibleAssignments.filter(a => !a.completed && a.dueDate && isSameWeek(new Date(a.dueDate), currentWeekStart, currentWeekEnd)).length,
    nextWeek: visibleAssignments.filter(a => !a.completed && a.dueDate && isSameWeek(new Date(a.dueDate), nextWeekStart, nextWeekEnd)).length,
    pending:  visibleAssignments.filter(a => !a.completed).length,
    done:     visibleAssignments.filter(a => a.completed).length,
    all:      visibleAssignments.length,
    nodate:   visibleAssignments.filter(a => !a.dueDate).length,
  }), [visibleAssignments, currentWeekStart, currentWeekEnd, nextWeekStart, nextWeekEnd]);

  const calDays = useMemo(() => {
    const year = calMonth.getFullYear(), month = calMonth.getMonth();
    const first = new Date(year, month, 1), last = new Date(year, month + 1, 0);
    const startDay = first.getDay();
    const offset = weekStart === "monday" ? (startDay === 0 ? 6 : startDay - 1) : startDay;
    const days: (Date | null)[] = Array(offset).fill(null);
    for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d));
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [calMonth, weekStart]);

  const assignmentsByDay = useMemo(() => {
    const map: Record<string, Assignment[]> = {};
    visibleAssignments.forEach(a => {
      if (!a.dueDate) return;
      const key = new Date(a.dueDate).toDateString();
      if (!map[key]) map[key] = [];
      map[key].push(a);
    });
    return map;
  }, [visibleAssignments]);

  const calSelectedAssignments = useMemo(() =>
    calSelected ? (assignmentsByDay[calSelected.toDateString()] || []) : [],
  [calSelected, assignmentsByDay]);

  function resolveColor(a: Assignment): string {
    if (a.courseId?._id) {
      const dbCourse = courseMap.get(a.courseId._id);
      if (dbCourse?.color) return dbCourse.color;
    }
    return a.courseId?.color || DEFAULT_COLOR;
  }

  function handleLogout() { localStorage.removeItem("token"); localStorage.removeItem("user"); navigate("/login"); }

  function toggleExpand(id: string) {
    setExpandedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function formToEstimatedTime(hrs: string, mins: string): number | undefined {
    const h = parseFloat(hrs);
    const hVal = !isNaN(h) && h > 0 ? h : 0;
    const mVal = parseInt(mins, 10) || 0;
    if (hVal === 0 && mVal === 0) return undefined;
    return hVal + mVal / 60;
  }

  function openAddModal() {
    setEditingId(null);
    setForm({ title: "", dueDate: "", courseId: "", description: "", type: "assignment", estHrs: "", estMins: "0" });
    setModalError(""); setShowModal(true);
  }

  function openEditModal(a: Assignment) {
    setEditingId(a._id);
    let estHrs = "";
    let estMins = "0";
    if (a.estimatedTime && a.estimatedTime > 0) {
      const totalMin = Math.round(a.estimatedTime * 60);
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      estHrs  = h > 0 ? String(h) : "";
      estMins = [0, 15, 30, 45].includes(m) ? String(m) : "0";
    }
    setForm({
      title: a.title || "",
      // ✅ Convert UTC → local time for the datetime-local input
      dueDate: utcToLocalInput(a.dueDate),
      courseId: a.courseId?._id || "",
      description: a.description || "",
      type: a.type || "assignment",
      estHrs,
      estMins,
    });
    setModalError(""); setShowModal(true);
  }

  function closeModal() {
    setShowModal(false); setEditingId(null); setModalError("");
    setForm({ title: "", dueDate: "", courseId: "", description: "", type: "assignment", estHrs: "", estMins: "0" });
  }

  const toggleComplete = useCallback(async (a: Assignment) => {
    const h = { Authorization: `Bearer ${token}` };
    const updated = { ...a, completed: !a.completed };
    setAssignments(prev => prev.map(x => x._id === a._id ? updated : x));
    try { await api.put(`/api/assignments/${a._id}`, { completed: !a.completed }, { headers: h }); }
    catch { setAssignments(prev => prev.map(x => x._id === a._id ? a : x)); }
  }, [token]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setModalError("Title is required."); return; }
    setModalSaving(true); setModalError("");
    const h = { Authorization: `Bearer ${token}` };
    const estimatedTime = formToEstimatedTime(form.estHrs, form.estMins);
    const payload = {
      title: form.title.trim(),
      // ✅ Convert local datetime-local value → UTC ISO string before sending to API
      dueDate: localInputToUtc(form.dueDate),
      courseId: form.courseId || null,
      description: form.description.trim() || undefined,
      type: form.type,
      estimatedTime: estimatedTime !== undefined ? estimatedTime : null,
    };
    try {
      if (editingId) {
        const res = await api.put(`/api/assignments/${editingId}`, payload, { headers: h });
        const updated = res.data?.assignment || res.data;
        setAssignments(prev => prev.map(x => x._id === editingId ? { ...x, ...updated } : x));
      } else {
        const res = await api.post("/api/assignments", payload, { headers: h });
        const created = res.data?.assignment || res.data;
        setAssignments(prev => [...prev, created]);
      }
      closeModal();
    } catch (err: any) {
      setModalError(err?.response?.data?.message || "Failed to save.");
    } finally { setModalSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this assignment?")) return;
    setAssignments(prev => prev.filter(x => x._id !== id));
    try { await api.delete(`/api/assignments/${id}`, { headers: { Authorization: `Bearer ${token}` } }); } catch {}
  }

  // ── Filter pill click handler ──
  function handleFilterClick(f: ActiveFilter) {
    if (f === activeFilter) {
      setActiveFilter(null);
      setWeekAnchor(getToday());
      return;
    }
    setActiveFilter(f);
    if (f === "thisweek") setWeekAnchor(getToday());
    if (f === "nextweek") setWeekAnchor(addDays(startOfWeek(getToday(), weekStart), 7));
  }

  function renderTopbar() {
    return (
      <>
        <nav className="topbar">
          <Link to="/dashboard"><img src={logo} alt="Course Compass" className="topbar-logo" /></Link>
          <div className="topbar-pill-nav">
            <Link to="/dashboard" className="topbar-pill topbar-pill-active">Dashboard</Link>
            <Link to="/courses"   className="topbar-pill">Courses</Link>
            <Link to="/settings"  className="topbar-pill">Settings</Link>
          </div>
          <div className="topbar-right">
            <button className="topbar-logout-btn" onClick={handleLogout}>Log out</button>
          </div>
          <button className={`topbar-hamburger${mobileMenuOpen ? " is-open" : ""}`} onClick={() => setMobileMenuOpen(o => !o)} aria-label="Menu">
            <span /><span /><span />
          </button>
        </nav>
        <div className={`topbar-mobile-menu${mobileMenuOpen ? " is-open" : ""}`} ref={mobileMenuRef}>
          <Link to="/dashboard" className="topbar-mobile-link topbar-mobile-link-active" onClick={() => setMobileMenuOpen(false)}>Dashboard</Link>
          <Link to="/courses"   className="topbar-mobile-link" onClick={() => setMobileMenuOpen(false)}>Courses</Link>
          <Link to="/settings"  className="topbar-mobile-link" onClick={() => setMobileMenuOpen(false)}>Settings</Link>
          <div className="topbar-mobile-divider" />
          <button className="topbar-mobile-link topbar-mobile-link-danger" onClick={handleLogout}>Log out</button>
        </div>
        {mobileMenuOpen && <div className="topbar-backdrop is-open" onClick={() => setMobileMenuOpen(false)} />}
      </>
    );
  }

  function renderProfileCard() {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    return (
      <div className="dash-profile-card">
        <div className="dash-profile-avatar">{avatarLetter}</div>
        <div className="dash-profile-info">
          <h2 className="dash-profile-name">{greeting}, {firstName}!</h2>
          <p className="dash-profile-sub">Track your assignments and stay on top of your week.</p>
        </div>
      </div>
    );
  }

  const FILTERS: { key: ActiveFilter; label: string; count: number; color: string }[] = [
    { key: "overdue",   label: "Overdue",       count: counts.overdue,  color: "#c97b7b" },
    { key: "thisweek",  label: "This week",      count: counts.thisWeek, color: "#81A6C6" },
    { key: "nextweek",  label: "Next week",      count: counts.nextWeek, color: "#9B8EC4" },
    { key: "pending",   label: "Pending",        count: counts.pending,  color: "#C9A050" },
    { key: "completed", label: "Completed",      count: counts.done,     color: "#6da06a" },
    { key: "nodate",    label: "No due date",    count: counts.nodate,   color: "#8BA8A0" },
    { key: "all",       label: "All",            count: counts.all,      color: "#7A8FA6" },
  ];

  function renderStats() {
    return (
      <div className="dash-filter-row">
        {FILTERS.map(f => (
          <button
            key={f.key}
            className={`dash-stat-pill${activeFilter === f.key ? " dash-stat-pill-active" : ""}`}
            style={{
              borderColor: f.color,
              color: f.color,
              opacity: activeFilter && activeFilter !== f.key ? 0.5 : 1,
            }}
            onClick={() => handleFilterClick(f.key)}
          >
            <span className="dash-filter-count" style={{ color: f.color }}>{f.count}</span>
            {f.label}
          </button>
        ))}
      </div>
    );
  }

  function renderAssignmentRow(a: Assignment) {
    const isExpanded  = expandedIds.has(a._id);
    const courseColor = resolveColor(a);
    const soon        = isDueSoon(a);

    const mergedCourse = a.courseId
      ? (courseMap.get(a.courseId._id) ?? a.courseId)
      : undefined;

    const code =
      extractCourseCode(mergedCourse) ||
      extractCourseCode(a.courseId) ||
      extractCourseName(mergedCourse).slice(0, 7);

    const canvasLink  = a.canvasUrl || null;
    const hasDetails  = !!(a.description || a.courseId?.instructor || a.courseId?.semester || a.dueDate || a.type);

    const estDisplay  = a.estimatedTime && a.estimatedTime > 0
      ? fmtEstimated(a.estimatedTime)
      : null;

    return (
      <div
        key={a._id}
        className={`dash-item${a.completed ? " dash-item-done" : ""}${soon ? " dash-item-soon" : ""}${hasDetails ? " dash-item-expandable" : ""}`}
        style={{ borderLeftColor: courseColor, cursor: hasDetails ? "pointer" : "default" }}
        onClick={() => { if (hasDetails) toggleExpand(a._id); }}
      >
        <div className="dash-item-main">
          <button
            className="dash-check"
            style={a.completed ? { background: courseColor, borderColor: courseColor } : {}}
            onClick={e => { e.stopPropagation(); toggleComplete(a); }}
            aria-label={a.completed ? "Mark incomplete" : "Mark complete"}
          >
            {a.completed && (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>

          <div className="dash-item-body">
            <div className="dash-item-title-row">
              <p className="dash-item-title">{a.title}</p>
            </div>
            <div className="dash-item-meta">
              {code && (
                <span
                  className="dash-tag dash-tag-course"
                  style={{ background: `${courseColor}18`, color: courseColor, borderColor: `${courseColor}40` }}
                >
                  {code}
                </span>
              )}
              {a.dueDate && (
                <span className={`dash-tag dash-tag-due${soon ? " dash-tag-due-soon" : ""}`}>
                  {formatDue(a.dueDate)}
                </span>
              )}
              {estDisplay && (
                <span className="dash-tag dash-tag-est">~{estDisplay}</span>
              )}
              {canvasLink && (
                <a
                  href={canvasLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="dash-tag dash-tag-canvas-link"
                  title="Open in Canvas"
                  onClick={e => e.stopPropagation()}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }}>
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                  Canvas
                </a>
              )}
            </div>
          </div>

          <div
            className="dash-item-actions"
            style={{ padding: "0 4px" }}
            onClick={e => e.stopPropagation()}
          >
            <button className="dash-edit-btn" onClick={() => openEditModal(a)} aria-label="Edit">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button className="dash-delete-btn" onClick={() => handleDelete(a._id)} aria-label="Delete">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 3.5h10M5 3.5V2.5h4v1M5.5 6v4M8.5 6v4M3 3.5l.7 8h6.6l.7-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        {hasDetails && (
          <div className={`dash-item-expand${isExpanded ? " is-open" : ""}`}>
            <div className="dash-item-expand-inner">
              {a.description && <p className="dash-item-expand-desc">{a.description}</p>}
              <div className="dash-item-expand-meta">
                {a.courseId?.instructor && (
                  <div className="dash-item-expand-row">
                    <span className="dash-item-expand-label">Instructor</span>
                    <span>{a.courseId.instructor}</span>
                  </div>
                )}
                {a.courseId?.semester && (
                  <div className="dash-item-expand-row">
                    <span className="dash-item-expand-label">Semester</span>
                    <span>{a.courseId.semester}</span>
                  </div>
                )}
                {a.dueDate && (
                  <div className="dash-item-expand-row">
                    <span className="dash-item-expand-label">Due</span>
                    <span>{new Date(a.dueDate).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                )}
                {estDisplay && (
                  <div className="dash-item-expand-row">
                    <span className="dash-item-expand-label">Estimated</span>
                    <span>{estDisplay}</span>
                  </div>
                )}
                {a.type && (
                  <div className="dash-item-expand-row">
                    <span className="dash-item-expand-label">Type</span>
                    <span style={{ textTransform: "capitalize" }}>{a.type}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderListView() {
    if (loading) return <div className="dash-loading">Loading assignments…</div>;

    const isWeekNav   = activeFilter === "thisweek" || activeFilter === "nextweek" || activeFilter === null;
    const filterLabel = (() => {
      if (activeFilter === null)        return formatWeekRangeShort(currentWeekStart, currentWeekEnd);
      if (activeFilter === "thisweek")  return formatWeekRangeShort(currentWeekStart, currentWeekEnd);
      if (activeFilter === "nextweek")  return formatWeekRangeShort(nextWeekStart, nextWeekEnd);
      if (activeFilter === "overdue")   return "Overdue";
      if (activeFilter === "pending")   return "Pending";
      if (activeFilter === "completed") return "Completed";
      if (activeFilter === "nodate")    return "No Due Date";
      if (activeFilter === "all")       return "All Assignments";
      return "";
    })();

    const dayGroups = groupByDay(filteredAssignments);

    return (
      <div className="dash-list-view">
        <div className="dash-week-nav">
          {isWeekNav ? (
            <button className="dash-week-nav-btn" onClick={() => setWeekAnchor(d => addDays(d, -7))} aria-label="Previous week">‹</button>
          ) : (
            <span style={{ width: 32 }} />
          )}

          <span className="dash-week-nav-label">{filterLabel}</span>

          {isWeekNav ? (
            <>
              {activeFilter === null && !isCurrentWeek && (
                <button className="dash-week-nav-today" onClick={() => setWeekAnchor(getToday())}>Today</button>
              )}
              <button className="dash-week-nav-btn" onClick={() => setWeekAnchor(d => addDays(d, 7))} aria-label="Next week">›</button>
            </>
          ) : (
            <button className="dash-week-nav-today" onClick={() => setActiveFilter(null)}>✕ Clear filter</button>
          )}
        </div>

        {dayGroups.length === 0 ? (
          <div className="dash-empty">
            <div className="dash-empty-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 11l3 3L22 4" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3>{
              activeFilter === "overdue"   ? "No overdue assignments!" :
              activeFilter === "pending"   ? "No pending assignments!" :
              activeFilter === "completed" ? "No completed assignments yet." :
              activeFilter === "nodate"    ? "No undated assignments!" :
              activeFilter === "all"       ? "No assignments yet." :
              "All clear this week!"
            }</h3>
            <p>{
              activeFilter === "overdue"   ? "You're all caught up." :
              activeFilter === "pending"   ? "Everything is done." :
              activeFilter === "completed" ? "Mark assignments complete to see them here." :
              activeFilter === "nodate"    ? "All your assignments have a due date." :
              activeFilter === null        ? `No assignments due ${isCurrentWeek ? "this week" : filterLabel}.` :
              ""
            }</p>
          </div>
        ) : (
          dayGroups.map(group => (
            <div key={group.dateKey} className="dash-week-group">
              <div className="dash-week-label">{group.label}</div>
              <div className="dash-week-items">
                {group.items
                  .sort((a, b) => a.dueDate && b.dueDate ? new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime() : 0)
                  .map(a => renderAssignmentRow(a))}
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  function renderCalendarView() {
    const dayNames = weekStart === "monday"
      ? ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
      : ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const todayStr = getToday().toDateString();
    return (
      <div className="dash-calendar">
        <div className="dash-cal-nav">
          <button className="dash-cal-nav-btn" onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth()-1, 1))}>‹</button>
          <span className="dash-cal-month-label">{calMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
          <button className="dash-cal-nav-btn" onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth()+1, 1))}>›</button>
        </div>
        <div className="dash-cal-grid">
          {dayNames.map(d => <div key={d} className="dash-cal-day-name">{d}</div>)}
          {calDays.map((day, i) => {
            if (!day) return <div key={`e-${i}`} className="dash-cal-cell dash-cal-cell-empty" />;
            const key = day.toDateString();
            const items = assignmentsByDay[key] || [];
            const isToday    = key === todayStr;
            const isSelected = calSelected?.toDateString() === key;
            const hasOverdue = items.some(a => !a.completed && a.dueDate && new Date(a.dueDate) < getToday());
            return (
              <button key={key}
                className={`dash-cal-cell${isToday ? " is-today" : ""}${isSelected ? " is-selected" : ""}${hasOverdue ? " has-overdue" : ""}`}
                onClick={() => setCalSelected(prev => prev?.toDateString() === key ? null : day)}
              >
                <span className="dash-cal-cell-num">{day.getDate()}</span>
                {items.length > 0 && (
                  <div className="dash-cal-dots">
                    {items.slice(0,4).map((a, idx) => (
                      <span key={idx} className="dash-cal-dot" style={{ background: resolveColor(a) }} />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        {calSelected && (
          <div className="dash-cal-day-detail">
            <p className="dash-cal-day-detail-title">
              {calSelected.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              <span className="dash-cal-day-detail-count">
                {calSelectedAssignments.length} assignment{calSelectedAssignments.length !== 1 ? "s" : ""}
              </span>
            </p>
            {calSelectedAssignments.length === 0
              ? <p className="dash-cal-day-empty">No assignments this day.</p>
              : calSelectedAssignments.map(a => renderAssignmentRow(a))
            }
          </div>
        )}
      </div>
    );
  }

  function renderModal() {
    if (!showModal) return null;
    return (
      <div className="dash-modal-overlay" onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
        <div className="dash-modal-card">
          <div className="dash-modal-header">
            <div>
              <p className="dash-modal-kicker">{editingId ? "Edit" : "New"} Assignment</p>
              <h2 className="dash-modal-title">{editingId ? "Edit Assignment" : "Add Assignment"}</h2>
            </div>
            <button className="dash-modal-close" onClick={closeModal} aria-label="Close">✕</button>
          </div>
          <form className="dash-form" onSubmit={handleSave}>
            <div className="dash-form-field dash-form-field-full">
              <label className="dash-form-label">Title *</label>
              <input className="dash-form-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Chapter 5 Reading" required />
            </div>

            <div className="dash-form-row">
              <div className="dash-form-field">
                <label className="dash-form-label">Due Date &amp; Time</label>
                <input type="datetime-local" className="dash-form-input" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
              </div>
              <div className="dash-form-field">
                <label className="dash-form-label">Estimated Time</label>
                <div style={{ display: "flex", flexDirection: "row", gap: 6, alignItems: "center" }}>
                  <input
                    type="number"
                    min="0"
                    max="99"
                    step="1"
                    className="dash-form-input"
                    style={{ flex: 1, minWidth: 0 }}
                    value={form.estHrs}
                    onChange={e => setForm(f => ({ ...f, estHrs: e.target.value }))}
                    placeholder="hr"
                  />
                  <select
                    className="dash-form-input"
                    style={{ flex: 1, minWidth: 0 }}
                    value={form.estMins}
                    onChange={e => setForm(f => ({ ...f, estMins: e.target.value }))}
                  >
                    <option value="0">0 min</option>
                    <option value="15">15 min</option>
                    <option value="30">30 min</option>
                    <option value="45">45 min</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="dash-form-row">
              <div className="dash-form-field">
                <label className="dash-form-label">Course</label>
                <select className="dash-form-input" value={form.courseId} onChange={e => setForm(f => ({ ...f, courseId: e.target.value }))}>
                  <option value="">— Personal task —</option>
                  {courses.map(c => <option key={c._id} value={c._id}>{c.title || c.name}</option>)}
                </select>
              </div>
              <div className="dash-form-field">
                <label className="dash-form-label">Type</label>
                <select className="dash-form-input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  <option value="assignment">Assignment</option>
                  <option value="quiz">Quiz</option>
                  <option value="exam">Exam</option>
                  <option value="project">Project</option>
                  <option value="reading">Reading</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div className="dash-form-field dash-form-field-full">
              <label className="dash-form-label">Notes</label>
              <textarea className="dash-form-input dash-form-textarea" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional notes…" rows={3} />
            </div>
            {modalError && <p className="dash-modal-error">{modalError}</p>}
            <div className="dash-modal-footer">
              <button type="button" className="dash-modal-btn-cancel" onClick={closeModal}>Cancel</button>
              <button type="submit" className="dash-modal-btn-save" disabled={modalSaving}>
                {modalSaving ? "Saving…" : editingId ? "Save Changes" : "Add Assignment"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell-soft">
      {renderTopbar()}
      {syncBanner && (
        <div className="dash-sync-banner">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
          {syncBanner}
        </div>
      )}
      <main className="page-shell">
        <div className="page-container">
          {renderProfileCard()}
          {renderStats()}
          <div className="dash-section-header">
            <div>
              <h3 className="dash-section-title">Assignments</h3>
              <p className="dash-section-sub">{visibleAssignments.filter(a => !a.completed).length} pending</p>
            </div>
            <div className="dash-section-actions">
              <div className="dash-view-toggle">
                <button className={`dash-view-btn${viewMode === "list" ? " is-active" : ""}`} onClick={() => setViewMode("list")} aria-label="List view">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                  List
                </button>
                <button className={`dash-view-btn${viewMode === "calendar" ? " is-active" : ""}`} onClick={() => setViewMode("calendar")} aria-label="Calendar view">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M5 2v2M11 2v2M2 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  Calendar
                </button>
              </div>
              <button className="dash-add-btn" onClick={openAddModal}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                Add
              </button>
            </div>
          </div>
          {viewMode === "list" ? renderListView() : renderCalendarView()}
        </div>
      </main>
      {renderModal()}
    </div>
  );
}
