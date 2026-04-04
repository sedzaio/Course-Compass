import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api";
import logo from "../styles/logo2.png";
import "../styles/app.css";

// ─── Types ───────────────────────────────────────────────────────────────────

type Course = {
  _id?: string;
  id?: string;
  title?: string;
  name?: string;
  code?: string;
  instructor?: string;
  semester?: string;
  color?: string;
  canvasId?: string | null;
  isHidden?: boolean;
};

type Assignment = {
  _id?: string;
  id?: string;
  // API populates courseId as a full object; accept both object and plain string
  courseId?: { _id?: string; id?: string } | string | null;
  completed?: boolean | null;
  isCompleted?: boolean | null;
  done?: boolean | null;
  status?: string | null;
};

type CourseForm = {
  title: string;
  code: string;
  instructor: string;
  semester: string;
  color: string;
};

type StoredUser = { id?: string; _id?: string; name?: string; email?: string };

// ─── Constants ───────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  { hex: "#81A6C6", name: "Sky Blue"  },
  { hex: "#4EADAA", name: "Teal"      },
  { hex: "#6B9E78", name: "Sage"      },
  { hex: "#7BBFA5", name: "Mint"      },
  { hex: "#9B8EC4", name: "Lavender" },
  { hex: "#C47E8E", name: "Rose"      },
  { hex: "#C97E6A", name: "Coral"     },
  { hex: "#C9A050", name: "Amber"     },
  { hex: "#B8A040", name: "Gold"      },
  { hex: "#7A8FA6", name: "Slate"     },
  { hex: "#8E6A9B", name: "Plum"      },
  { hex: "#8A7BA8", name: "Dusk"      },
];

const PALETTE     = PRESET_COLORS.map(p => p.hex);
const DEFAULT_COLOR = "#81A6C6";

const BLANK_FORM: CourseForm = { title: "", code: "", instructor: "", semester: "", color: PALETTE[0] };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCourseId(c: Course): string { return c._id || c.id || ""; }
function getCourseTitle(c: Course): string { return c.title || c.name || ""; }

function isCompleted(a: Assignment): boolean {
  if (typeof a.completed   === "boolean") return a.completed;
  if (typeof a.isCompleted === "boolean") return a.isCompleted;
  if (typeof a.done        === "boolean") return a.done;
  const s = a.status?.toLowerCase();
  return s === "completed" || s === "done";
}

/**
 * Safely extract the course ID from an assignment's courseId field.
 * The API populates courseId as a full object; this unwraps it to a plain string.
 */
function getAssignmentCourseId(a: Assignment): string {
  if (!a.courseId) return "";
  if (typeof a.courseId === "string") return a.courseId;
  return a.courseId._id || a.courseId.id || "";
}

/**
 * Pick the first PALETTE color not already used by any course in `existing`.
 * Used only for the Add Course form default — the DB is the source of truth for saved colors.
 */
function nextColor(existing: Course[]): string {
  const used = new Set(existing.map(c => (c.color || "").toLowerCase()));
  return PALETTE.find(p => !used.has(p.toLowerCase())) ?? PALETTE[existing.length % PALETTE.length];
}

// ─── Icons ──────────────────────────────────────────────────────────────────────

function IconEdit()   { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>; }
function IconTrash()  { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>; }
function IconEyeOff() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>; }
function IconEye()    { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>; }
function IconPlus()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>; }
function IconCheck()  { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>; }

function IconBookOpen() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

// ─── Color Picker ───────────────────────────────────────────────────────────────

function CourseColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <div className="course-color-picker">
      <div className="course-color-presets">
        {PRESET_COLORS.map(p => (
          <button
            key={p.hex} type="button"
            className={`course-color-swatch${value.toLowerCase() === p.hex.toLowerCase() ? " is-selected" : ""}`}
            style={{ background: p.hex }} title={p.name}
            onClick={() => onChange(p.hex)} aria-label={p.name}
          >
            {value.toLowerCase() === p.hex.toLowerCase() && (
              <span className="course-color-swatch-check"><IconCheck /></span>
            )}
          </button>
        ))}
      </div>
      <div className="course-color-custom-row">
        <label className="dash-form-label" style={{ marginBottom: 0, whiteSpace: "nowrap" }}>Custom</label>
        <input type="color" className="course-color-input-native" value={value} onChange={e => onChange(e.target.value)} title="Pick a custom color" />
        <input
          type="text" className="sett-expand-input course-color-hex-input"
          value={value} maxLength={7}
          onChange={e => { const v = e.target.value; if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) onChange(v); }}
          placeholder="#ffffff"
        />
        <span className="course-color-preview-dot" style={{ background: value }} />
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Courses(): JSX.Element {
  const navigate = useNavigate();
  const token    = localStorage.getItem("token");

  const currentUser = useMemo<StoredUser | null>(() => {
    try { return JSON.parse(localStorage.getItem("user") || "null"); }
    catch { return null; }
  }, []);
  void currentUser;

  const [courses,     setCourses]     = useState<Course[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading,     setLoading]     = useState(true);

  const [addOpen,     setAddOpen]     = useState(false);
  const [addForm,     setAddForm]     = useState<CourseForm>(BLANK_FORM);
  const [addError,    setAddError]    = useState("");
  const [addSaving,   setAddSaving]   = useState(false);

  const [editOpenId,  setEditOpenId]  = useState<string | null>(null);
  const [editForm,    setEditForm]    = useState<CourseForm>(BLANK_FORM);
  const [editError,   setEditError]   = useState("");
  const [editSaving,  setEditSaving]  = useState(false);

  const [deletingId,  setDeletingId]  = useState<string | null>(null);
  const [togglingId,  setTogglingId]  = useState<string | null>(null);

  const [successMsg,  setSuccessMsg]  = useState("");
  const [errorMsg,    setErrorMsg]    = useState("");

  const [mobileOpen,  setMobileOpen]  = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  function showSuccess(msg: string) { setSuccessMsg(msg); setErrorMsg(""); setTimeout(() => setSuccessMsg(""), 3500); }
  function showError(msg: string)   { setErrorMsg(msg); setSuccessMsg(""); setTimeout(() => setErrorMsg(""), 4000); }

  useEffect(() => { if (!token) navigate("/login"); }, [token, navigate]);

  useEffect(() => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      api.get("/api/courses",     { headers }),
      api.get("/api/assignments", { headers }),
    ])
      .then(([cRes, aRes]) => {
        // Use the DB color exactly as stored — the backend assigns unique colors on Canvas import.
        // No client-side palette override.
        const raw: Course[] = Array.isArray(cRes.data) ? cRes.data
          : Array.isArray(cRes.data?.courses) ? cRes.data.courses : [];
        const aData = Array.isArray(aRes.data) ? aRes.data
          : Array.isArray(aRes.data?.assignments) ? aRes.data.assignments : [];
        setCourses(raw);
        setAssignments(aData);
      })
      .catch(() => { setCourses([]); setAssignments([]); })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!mobileOpen) return;
    function handler(e: MouseEvent) {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node))
        setMobileOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [mobileOpen]);

  function courseStats(cId: string) {
    const all  = assignments.filter(a => getAssignmentCourseId(a) === cId);
    const done = all.filter(a => isCompleted(a)).length;
    return { total: all.length, done, pending: all.length - done };
  }

  function handleLogout() {
    localStorage.removeItem("token"); localStorage.removeItem("user"); navigate("/login");
  }

  function openAdd() {
    setAddForm({ ...BLANK_FORM, color: nextColor(courses) });
    setAddError(""); setAddOpen(true); setEditOpenId(null);
  }
  function closeAdd() { setAddOpen(false); setAddError(""); }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addForm.title.trim()) { setAddError("Course name is required."); return; }
    setAddSaving(true); setAddError("");
    try {
      const res = await api.post("/api/courses", {
        title: addForm.title.trim(), code: addForm.code.trim(),
        instructor: addForm.instructor.trim(), semester: addForm.semester.trim(),
        color: addForm.color || nextColor(courses),
      }, { headers: { Authorization: `Bearer ${token}` } });
      const created = res.data?.course || res.data;
      setCourses(prev => [...prev, created]);
      closeAdd(); showSuccess("Course added.");
    } catch (err: any) {
      setAddError(err?.response?.data?.message || "Failed to add course.");
    } finally { setAddSaving(false); }
  }

  function openEdit(c: Course) {
    const id = getCourseId(c);
    setEditOpenId(prev => prev === id ? null : id);
    setEditForm({
      title: getCourseTitle(c), code: c.code || "",
      instructor: c.instructor || "", semester: c.semester || "",
      color: c.color || DEFAULT_COLOR,
    });
    setEditError(""); setAddOpen(false);
  }

  async function handleEditSave(e: React.FormEvent, courseId: string) {
    e.preventDefault();
    if (!editForm.title.trim()) { setEditError("Course name is required."); return; }
    setEditSaving(true); setEditError("");
    try {
      const res = await api.put(`/api/courses/${courseId}`, {
        title: editForm.title.trim(), code: editForm.code.trim(),
        instructor: editForm.instructor.trim(), semester: editForm.semester.trim(),
        color: editForm.color,
      }, { headers: { Authorization: `Bearer ${token}` } });
      const updated = res.data?.course || res.data;
      setCourses(prev => prev.map(c => getCourseId(c) === courseId ? { ...c, ...updated } : c));
      setEditOpenId(null); showSuccess("Course updated.");
    } catch (err: any) {
      setEditError(err?.response?.data?.message || "Failed to update course.");
    } finally { setEditSaving(false); }
  }

  async function handleDelete(c: Course) {
    const id = getCourseId(c);
    if (!window.confirm(`Delete "${getCourseTitle(c)}"? Assignments will not be deleted.`)) return;
    setDeletingId(id);
    try {
      await api.delete(`/api/courses/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      setCourses(prev => prev.filter(x => getCourseId(x) !== id));
      showSuccess("Course deleted.");
    } catch { showError("Failed to delete course."); }
    finally { setDeletingId(null); }
  }

  async function handleToggleHide(c: Course) {
    const id = getCourseId(c);
    const newHidden = !c.isHidden;
    setTogglingId(id);
    try {
      const res = await api.put(`/api/courses/${id}`, { isHidden: newHidden }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const updated = res.data?.course || res.data;
      setCourses(prev => prev.map(x => getCourseId(x) === id ? { ...x, isHidden: updated?.isHidden ?? newHidden } : x));
      showSuccess(newHidden ? "Course hidden from dashboard." : "Course visible on dashboard.");
    } catch { showError("Failed to update course."); }
    finally { setTogglingId(null); }
  }

  function renderTopbar() {
    return (
      <>
        <nav className="topbar">
          <Link to="/dashboard"><img src={logo} alt="Course Compass" className="topbar-logo" /></Link>
          <div className="topbar-pill-nav">
            <Link to="/dashboard" className="topbar-pill">Dashboard</Link>
            <Link to="/courses"   className="topbar-pill topbar-pill-active">Courses</Link>
            <Link to="/settings"  className="topbar-pill">Settings</Link>
          </div>
          <div className="topbar-right">
            <button className="topbar-logout-btn" onClick={handleLogout}>Log out</button>
          </div>
          <button className={`topbar-hamburger${mobileOpen ? " is-open" : ""}`} onClick={() => setMobileOpen(o => !o)} aria-label="Toggle menu" aria-expanded={mobileOpen}>
            <span /><span /><span />
          </button>
        </nav>
        <div ref={mobileMenuRef} className={`topbar-mobile-menu${mobileOpen ? " is-open" : ""}`}>
          <Link to="/dashboard" className="topbar-mobile-link" onClick={() => setMobileOpen(false)}>Dashboard</Link>
          <Link to="/courses"   className="topbar-mobile-link topbar-mobile-link-active" onClick={() => setMobileOpen(false)}>Courses</Link>
          <Link to="/settings"  className="topbar-mobile-link" onClick={() => setMobileOpen(false)}>Settings</Link>
          <div className="topbar-mobile-divider" />
          <button className="topbar-mobile-link topbar-mobile-link-danger" onClick={handleLogout}>Log out</button>
        </div>
        {mobileOpen && <div className="topbar-backdrop is-open" onClick={() => setMobileOpen(false)} />}
      </>
    );
  }

  const hiddenCourses = courses.filter(c => c.isHidden);

  return (
    <div className="auth-shell-soft">
      {renderTopbar()}
      <main className="page-shell">
        <div className="page-container" style={{ maxWidth: 960 }}>

          <div className="courses-page-header">
            <div>
              <h1 className="courses-page-title">My Courses</h1>
              <p className="courses-page-sub">
                {loading ? "Loading…" : `${courses.length} course${courses.length !== 1 ? "s" : ""}${hiddenCourses.length ? ` (${hiddenCourses.length} hidden)` : ""}`}
              </p>
            </div>
            <button className={`courses-add-btn${addOpen ? " is-open" : ""}`} onClick={() => addOpen ? closeAdd() : openAdd()}>
              <span className={`courses-add-btn-icon${addOpen ? " rotated" : ""}`}><IconPlus /></span>
              {addOpen ? "Cancel" : "Add Course"}
            </button>
          </div>

          {/* Add panel */}
          <div className={`courses-add-panel${addOpen ? " is-open" : ""}`}>
            <form className="sett-expand-form" onSubmit={handleAdd}>
              <div className="course-form-grid">
                <div className="course-field-full">
                  <label className="dash-form-label">Course Name *</label>
                  <input className="sett-expand-input" value={addForm.title} onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Introduction to Computer Science" />
                </div>
                <div>
                  <label className="dash-form-label">Course Code</label>
                  <input className="sett-expand-input" value={addForm.code} onChange={e => setAddForm(f => ({ ...f, code: e.target.value }))} placeholder="e.g. COP4331" />
                </div>
                <div>
                  <label className="dash-form-label">Instructor</label>
                  <input className="sett-expand-input" value={addForm.instructor} onChange={e => setAddForm(f => ({ ...f, instructor: e.target.value }))} placeholder="e.g. Dr. Smith" />
                </div>
                <div className="course-field-full">
                  <label className="dash-form-label">Semester</label>
                  <input className="sett-expand-input" value={addForm.semester} onChange={e => setAddForm(f => ({ ...f, semester: e.target.value }))} placeholder="e.g. Spring 2026" />
                </div>
                <div className="course-field-full">
                  <label className="dash-form-label">Course Color</label>
                  <CourseColorPicker value={addForm.color} onChange={hex => setAddForm(f => ({ ...f, color: hex }))} />
                </div>
              </div>
              {addError && <p className="sett-expand-error">{addError}</p>}
              <div className="sett-expand-row">
                <button type="submit" className="sett-expand-btn sett-expand-btn-primary" disabled={addSaving}>{addSaving ? "Saving…" : "Add Course"}</button>
                <button type="button" className="sett-expand-btn sett-expand-btn-secondary" onClick={closeAdd}>Cancel</button>
              </div>
            </form>
          </div>

          {loading ? (
            <div className="dash-loading">Loading courses…</div>
          ) : courses.length === 0 ? (
            <div className="dash-empty">
              <div className="dash-empty-icon"><IconBookOpen /></div>
              <h3>No courses yet</h3>
              <p>Add a course above or sync from Canvas in Settings.</p>
            </div>
          ) : (
            <div className="courses-grid">
              {courses.map(c => {
                const id         = getCourseId(c);
                // Use the color stored in the DB directly — no client-side override
                const color      = c.color || DEFAULT_COLOR;
                const stats      = courseStats(id);
                const initials   = (getCourseTitle(c) || "?").slice(0, 2).toUpperCase();
                const isEditOpen = editOpenId === id;

                return (
                  <div key={id} className={`course-card${c.isHidden ? " is-hidden" : ""}`}>
                    <div className="course-card-accent" style={{ background: color }} />
                    <div className="course-card-body">
                      <div className="course-card-header">
                        <div className="course-card-avatar" style={{ background: color }}>{initials}</div>
                        <div className="course-card-info">
                          <p className="course-card-name">{getCourseTitle(c) || "Unnamed Course"}</p>
                          <p className="course-card-meta">
                            {c.code && <span>{c.code}</span>}
                            {c.code && c.instructor && <span> · </span>}
                            {c.instructor && <span>{c.instructor}</span>}
                          </p>
                        </div>
                      </div>

                      <div className="course-card-chips">
                        {c.semester && <span className="course-chip">📅 {c.semester}</span>}
                        {c.canvasId && <span className="course-chip course-chip-canvas">Canvas</span>}
                        {c.isHidden && <span className="course-chip course-chip-hidden">Hidden</span>}
                      </div>

                      <div className="course-card-stats">
                        <div className="course-stat">
                          <span className="course-stat-num" style={{ color: "#6da06a" }}>{stats.done}</span>
                          <span className="course-stat-label">Done</span>
                        </div>
                        <div className="course-stat">
                          <span className="course-stat-num" style={{ color: "#d19a3f" }}>{stats.pending}</span>
                          <span className="course-stat-label">Pending</span>
                        </div>
                        <div className="course-stat">
                          <span className="course-stat-num">{stats.total}</span>
                          <span className="course-stat-label">Total</span>
                        </div>
                      </div>

                      <div className="course-card-actions">
                        <button className="course-action-btn" onClick={() => openEdit(c)} title="Edit">
                          <IconEdit /> Edit
                        </button>
                        <button
                          className={`course-action-btn${c.isHidden ? " is-active" : ""}`}
                          onClick={() => handleToggleHide(c)}
                          disabled={togglingId === id}
                          title={c.isHidden ? "Show on dashboard" : "Hide from dashboard"}
                        >
                          {c.isHidden ? <><IconEye /> Show</> : <><IconEyeOff /> Hide</>}
                        </button>
                        <button className="course-action-btn course-action-btn-danger" onClick={() => handleDelete(c)} disabled={deletingId === id} title="Delete">
                          <IconTrash /> Delete
                        </button>
                      </div>

                      <div className={`course-edit-expand${isEditOpen ? " is-open" : ""}`}>
                        <form className="sett-expand-form" onSubmit={e => handleEditSave(e, id)} style={{ paddingTop: 4 }}>
                          <div className="course-form-grid">
                            <div className="course-field-full">
                              <label className="dash-form-label">Course Name *</label>
                              <input className="sett-expand-input" value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} placeholder="Course name" />
                            </div>
                            <div>
                              <label className="dash-form-label">Code</label>
                              <input className="sett-expand-input" value={editForm.code} onChange={e => setEditForm(f => ({ ...f, code: e.target.value }))} placeholder="e.g. COP4331" />
                            </div>
                            <div>
                              <label className="dash-form-label">Instructor</label>
                              <input className="sett-expand-input" value={editForm.instructor} onChange={e => setEditForm(f => ({ ...f, instructor: e.target.value }))} placeholder="e.g. Dr. Smith" />
                            </div>
                            <div className="course-field-full">
                              <label className="dash-form-label">Semester</label>
                              <input className="sett-expand-input" value={editForm.semester} onChange={e => setEditForm(f => ({ ...f, semester: e.target.value }))} placeholder="e.g. Spring 2026" />
                            </div>
                            <div className="course-field-full">
                              <label className="dash-form-label">Course Color</label>
                              <CourseColorPicker value={editForm.color} onChange={hex => setEditForm(f => ({ ...f, color: hex }))} />
                            </div>
                          </div>
                          {editError && <p className="sett-expand-error">{editError}</p>}
                          <div className="sett-expand-row">
                            <button type="submit" className="sett-expand-btn sett-expand-btn-primary" disabled={editSaving}>{editSaving ? "Saving…" : "Save"}</button>
                            <button type="button" className="sett-expand-btn sett-expand-btn-secondary" onClick={() => setEditOpenId(null)}>Cancel</button>
                          </div>
                        </form>
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {successMsg && <div className="sett-toast sett-toast-success">{successMsg}</div>}
      {errorMsg   && <div className="sett-toast sett-toast-error">{errorMsg}</div>}
    </div>
  );
}
