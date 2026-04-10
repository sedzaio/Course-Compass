import { useEffect, useRef, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api";
import logo from "../styles/logo2.png";
import "../styles/app.css";

// ─── Types ───────────────────────────────────────────────────────────────────

type StoredUser = {
  id?: string; _id?: string; name?: string; email?: string;
};

type AccountPanel = "name" | "email" | "password" | "firstday" | "planner" | "canvas" | "closeaccount" | null;

const DOW_OPTIONS = [
  { val: "sunday", label: "Sunday" },
  { val: "monday", label: "Monday" },
];

const FREQ_OPTIONS = [
  { val: "daily",   label: "Every day" },
  { val: "weekly",  label: "Every week" },
  { val: "monthly", label: "Every month" },
];

// ─── Icons ───────────────────────────────────────────────────────────────────

function IconUser()     { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>; }
function IconMail()     { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/></svg>; }
function IconLock()     { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>; }
function IconCalendar() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>; }
function IconCanvas()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg>; }
function IconChevron()  { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>; }
function IconDanger()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>; }
function IconPlanner()  { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>; }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isInteger(val: number): boolean {
  return Number.isFinite(val) && Math.floor(val) === val;
}

function validatePlannerFields(
  advanceDays: number,
  bufferHours: number
): string | null {
  if (!isInteger(advanceDays)) return "\"Start scheduling up to\" must be a whole number (no decimals).";
  if (advanceDays < 2)         return "\"Start scheduling up to\" must be at least 2 days.";
  if (advanceDays > 365)       return "\"Start scheduling up to\" cannot exceed 365 days.";
  if (!isInteger(bufferHours)) return "\"Finish at least\" must be a whole number (no decimals).";
  if (bufferHours < 1)         return "\"Finish at least\" must be at least 1 hour.";
  if (bufferHours > 24)        return "\"Finish at least\" cannot exceed 24 hours.";
  // cross-field: window must be >= 24 h
  const windowHours = advanceDays * 24 - bufferHours;
  if (windowHours < 24) {
    const minAdvance = Math.ceil((bufferHours + 24) / 24);
    return `Scheduling window must be at least 24 hours. With a buffer of ${bufferHours}h, "Start scheduling up to" must be at least ${minAdvance} days.`;
  }
  return null;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Settings(): JSX.Element {
  const navigate = useNavigate();
  const token    = localStorage.getItem("token");

  const currentUser = useMemo<StoredUser | null>(() => {
    try { return JSON.parse(localStorage.getItem("user") || "null"); }
    catch { return null; }
  }, []);

  // ── Toast ──
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg,   setErrorMsg]   = useState("");

  function showSuccess(msg: string) {
    setSuccessMsg(msg); setErrorMsg("");
    setTimeout(() => setSuccessMsg(""), 3500);
  }
  function showError(msg: string) {
    setErrorMsg(msg); setSuccessMsg("");
    setTimeout(() => setErrorMsg(""), 4000);
  }

  // ── Auth guard ──
  useEffect(() => { if (!token) navigate("/login"); }, [token, navigate]);

  // ── Mobile menu ──
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mobileOpen) return;
    function handler(e: MouseEvent) {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node))
        setMobileOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [mobileOpen]);

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  }

  // ── Single open panel ──
  const [openPanel, setOpenPanel] = useState<AccountPanel>(null);

  function togglePanel(p: AccountPanel) {
    setOpenPanel(prev => prev === p ? null : p);
    setNameError(""); setEmailError(""); setPasswordError("");
    setCanvasError(""); setCloseError(""); setClosePassword("");
    setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    setCodeSent(false); setCodeValue("");
    setPlannerError("");
  }

  // ────────────────────────────────────────────────────────────
  // ACCOUNT — Name
  // ────────────────────────────────────────────────────────────

  const [nameValue,  setNameValue]  = useState(currentUser?.name  || "");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError,  setNameError]  = useState("");

  async function handleNameSave(e: React.FormEvent) {
    e.preventDefault();
    if (!nameValue.trim()) { setNameError("Name is required."); return; }
    setNameSaving(true); setNameError("");
    try {
      await api.put("/api/auth/account", { name: nameValue.trim() }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const stored = JSON.parse(localStorage.getItem("user") || "{}");
      stored.name = nameValue.trim();
      localStorage.setItem("user", JSON.stringify(stored));
      setOpenPanel(null);
      showSuccess("Name updated.");
    } catch (err: any) {
      setNameError(err?.response?.data?.message || "Failed to update name.");
    } finally { setNameSaving(false); }
  }

  // ────────────────────────────────────────────────────────────
  // ACCOUNT — Email
  // ────────────────────────────────────────────────────────────

  const [emailValue,  setEmailValue]  = useState(currentUser?.email || "");
  const [codeSent,    setCodeSent]    = useState(false);
  const [codeValue,   setCodeValue]   = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailError,  setEmailError]  = useState("");

  async function handleGetCode(e: React.FormEvent) {
    e.preventDefault();
    if (!emailValue.trim()) { setEmailError("Email is required."); return; }
    setEmailSaving(true); setEmailError("");
    try {
      await api.post("/api/auth/send-code", { email: emailValue.trim() });
      setCodeSent(true);
    } catch (err: any) {
      setEmailError(err?.response?.data?.message || "Failed to send code.");
    } finally { setEmailSaving(false); }
  }

  async function handleEmailSave(e: React.FormEvent) {
    e.preventDefault();
    if (!codeValue.trim()) { setEmailError("Enter the code."); return; }
    setEmailSaving(true); setEmailError("");
    try {
      await api.put("/api/auth/account", {
        email: emailValue.trim(),
        code:  codeValue.trim(),
      }, { headers: { Authorization: `Bearer ${token}` } });
      const stored = JSON.parse(localStorage.getItem("user") || "{}");
      stored.email = emailValue.trim();
      localStorage.setItem("user", JSON.stringify(stored));
      setOpenPanel(null); setCodeSent(false); setCodeValue("");
      showSuccess("Email updated.");
    } catch (err: any) {
      setEmailError(err?.response?.data?.message || "Failed to update email.");
    } finally { setEmailSaving(false); }
  }

  // ────────────────────────────────────────────────────────────
  // ACCOUNT — Password
  // ────────────────────────────────────────────────────────────

  const [currentPassword,  setCurrentPassword]  = useState("");
  const [newPassword,      setNewPassword]       = useState("");
  const [confirmPassword,  setConfirmPassword]   = useState("");
  const [passwordSaving,   setPasswordSaving]    = useState(false);
  const [passwordError,    setPasswordError]     = useState("");

  async function handlePasswordSave(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPassword.trim())         { setPasswordError("Current password is required."); return; }
    if (newPassword.length < 6)          { setPasswordError("New password must be at least 6 characters."); return; }
    if (newPassword !== confirmPassword) { setPasswordError("Passwords do not match."); return; }
    setPasswordSaving(true); setPasswordError("");
    try {
      await api.put("/api/auth/account", { currentPassword, newPassword }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      setOpenPanel(null);
      showSuccess("Password updated.");
    } catch (err: any) {
      setPasswordError(err?.response?.data?.message || "Failed to update password.");
    } finally { setPasswordSaving(false); }
  }

  // ────────────────────────────────────────────────────────────
  // PREFERENCES — First Day of Week
  // ────────────────────────────────────────────────────────────

  const [firstDay, setFirstDay] = useState<string>(
    () => localStorage.getItem("firstDayOfWeek") || "sunday"
  );
  const [firstDaySaving, setFirstDaySaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.get("/api/auth/preferences", { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        const pref = res.data?.firstDayOfWeek || res.data?.preferences?.firstDayOfWeek;
        if (pref === "monday" || pref === "sunday") {
          setFirstDay(pref);
          localStorage.setItem("firstDayOfWeek", pref);
        }
        // load planner prefs
        const ad = res.data?.advanceDays ?? res.data?.preferences?.advanceDays;
        const bh = res.data?.bufferHours ?? res.data?.preferences?.bufferHours;
        if (typeof ad === "number") setPlannerAdvance(ad);
        if (typeof bh === "number") setPlannerBuffer(bh);
      })
      .catch(() => {});
  }, [token]);

  async function handleFirstDayChange(val: string) {
    setFirstDay(val);
    localStorage.setItem("firstDayOfWeek", val);
    setFirstDaySaving(true);
    try {
      await api.put("/api/auth/preferences", { firstDayOfWeek: val }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      showSuccess("Preference saved.");
      setOpenPanel(null);
    } catch (err: any) {
      showError(err?.response?.data?.message || "Failed to save preference.");
    } finally { setFirstDaySaving(false); }
  }

  // ────────────────────────────────────────────────────────────
  // PREFERENCES — Study Planner
  // ────────────────────────────────────────────────────────────

  const [plannerAdvance, setPlannerAdvance] = useState<number>(7);   // advanceDays default
  const [plannerBuffer,  setPlannerBuffer]  = useState<number>(24);  // bufferHours default
  const [plannerSaving,  setPlannerSaving]  = useState(false);
  const [plannerError,   setPlannerError]   = useState("");

  function handleAdvanceChange(raw: string) {
    // strip decimals on input — only allow digits
    const cleaned = raw.replace(/[^0-9]/g, "");
    const n = cleaned === "" ? 0 : parseInt(cleaned, 10);
    setPlannerAdvance(n);
    setPlannerError("");
  }

  function handleBufferChange(raw: string) {
    const cleaned = raw.replace(/[^0-9]/g, "");
    const n = cleaned === "" ? 0 : parseInt(cleaned, 10);
    setPlannerBuffer(n);
    setPlannerError("");
  }

  async function handlePlannerSave(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validatePlannerFields(plannerAdvance, plannerBuffer);
    if (validationError) { setPlannerError(validationError); return; }
    setPlannerSaving(true); setPlannerError("");
    try {
      await api.put("/api/auth/preferences", {
        advanceDays: plannerAdvance,
        bufferHours: plannerBuffer,
      }, { headers: { Authorization: `Bearer ${token}` } });
      setOpenPanel(null);
      showSuccess("Study planner preferences saved.");
    } catch (err: any) {
      setPlannerError(err?.response?.data?.message || "Failed to save planner preferences.");
    } finally { setPlannerSaving(false); }
  }

  function plannerRowValue(): string {
    return `Schedule up to ${plannerAdvance}d ahead · Finish ${plannerBuffer}h before due`;
  }

  // ────────────────────────────────────────────────────────────
  // CANVAS
  // ────────────────────────────────────────────────────────────

  const [canvasLoading,   setCanvasLoading]   = useState(false);
  const [canvasToken,     setCanvasToken]     = useState("");
  const [canvasUrl,       setCanvasUrl]       = useState("");
  const [canvasSaved,     setCanvasSaved]     = useState(false);
  const [canvasSaving,    setCanvasSaving]    = useState(false);
  const [canvasError,     setCanvasError]     = useState("");
  const [lastSync,        setLastSync]        = useState<string | null>(null);
  const [nextSync,        setNextSync]        = useState<string | null>(null);
  const [syncFrequency,   setSyncFrequency]   = useState<string>("weekly");
  const [freqSaving,      setFreqSaving]      = useState(false);
  const [syncResult,      setSyncResult]      = useState<{ ok: boolean; message: string } | null>(null);
  const [wasConnected,    setWasConnected]    = useState(false);

  useEffect(() => {
    if (!token) return;
    setCanvasLoading(true);
    api.get("/api/canvas/settings", { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        setCanvasToken(res.data?.canvasToken || "");
        setCanvasUrl(res.data?.canvasUrl     || "");
        const connected = !!res.data?.isConnected;
        setCanvasSaved(connected);
        setWasConnected(connected);
        setLastSync(res.data?.lastSync       || null);
        setNextSync(res.data?.nextSync       || null);
        setSyncFrequency(res.data?.syncFrequency || "weekly");
      })
      .catch(() => { setCanvasToken(""); setCanvasUrl(""); setCanvasSaved(false); setWasConnected(false); })
      .finally(() => setCanvasLoading(false));
  }, [token]);

  async function handleCanvasSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canvasToken.trim()) { setCanvasError("Canvas token is required."); return; }
    setCanvasSaving(true); setCanvasError(""); setSyncResult(null);
    const isFirstTimeSave = !wasConnected;
    try {
      const res = await api.post("/api/canvas/settings", {
        canvasToken: canvasToken.trim(),
        canvasUrl:   canvasUrl.trim(),
        syncFrequency,
      }, { headers: { Authorization: `Bearer ${token}` } });
      setCanvasSaved(true);
      setWasConnected(true);
      setNextSync(res.data?.nextSync || null);

      if (isFirstTimeSave) {
        setSyncResult({ ok: true, message: "Canvas connected! Running first sync…" });
        try {
          const syncRes = await api.post("/api/canvas/sync", {}, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const count = syncRes.data?.synced ?? syncRes.data?.count ?? "?";
          setLastSync(syncRes.data?.lastSync ? new Date(syncRes.data.lastSync).toISOString() : new Date().toISOString());
          setNextSync(syncRes.data?.nextSync ? new Date(syncRes.data.nextSync).toISOString() : null);
          setSyncResult({ ok: true, message: `Canvas connected and synced — ${count} assignments imported.` });
        } catch {
          setSyncResult({ ok: true, message: "Canvas connected. First sync will run shortly." });
        }
      } else {
        setOpenPanel(null);
        showSuccess("Canvas integration saved.");
      }
    } catch (err: any) {
      setCanvasError(err?.response?.data?.message || "Failed to save Canvas settings.");
    } finally { setCanvasSaving(false); }
  }

  async function handleFrequencyChange(val: string) {
    setSyncFrequency(val);
    if (!canvasSaved) return;
    setFreqSaving(true);
    try {
      const res = await api.put("/api/canvas/settings/frequency", { syncFrequency: val }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setNextSync(res.data?.nextSync || null);
      showSuccess("Sync frequency updated.");
    } catch (err: any) {
      showError(err?.response?.data?.message || "Failed to update frequency.");
    } finally { setFreqSaving(false); }
  }

  async function handleCanvasRemove() {
    if (!window.confirm("Remove Canvas integration?")) return;
    setCanvasSaving(true); setCanvasError(""); setSyncResult(null);
    try {
      await api.delete("/api/canvas/settings", { headers: { Authorization: `Bearer ${token}` } });
      setCanvasToken(""); setCanvasUrl(""); setCanvasSaved(false); setWasConnected(false);
      setLastSync(null); setNextSync(null); setSyncFrequency("weekly");
      setOpenPanel(null);
      showSuccess("Canvas integration removed.");
    } catch { showError("Failed to remove Canvas integration."); }
    finally  { setCanvasSaving(false); }
  }

  async function handleCanvasSync() {
    setSyncResult(null); setCanvasSaving(true);
    try {
      const res = await api.post("/api/canvas/sync", {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const count = res.data?.synced ?? res.data?.count ?? "?";
      setSyncResult({ ok: true, message: `Synced ${count} assignments from Canvas.` });
      setLastSync(res.data?.lastSync ? new Date(res.data.lastSync).toISOString() : new Date().toISOString());
      setNextSync(res.data?.nextSync ? new Date(res.data.nextSync).toISOString() : null);
    } catch (err: any) {
      setSyncResult({ ok: false, message: err?.response?.data?.message || "Sync failed." });
    } finally { setCanvasSaving(false); }
  }

  // ────────────────────────────────────────────────────────────
  // DANGER ZONE — Close Account
  // ────────────────────────────────────────────────────────────

  const [closePassword, setClosePassword] = useState("");
  const [closeSaving,   setCloseSaving]   = useState(false);
  const [closeError,    setCloseError]    = useState("");

  async function handleCloseAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!closePassword.trim()) { setCloseError("Please enter your current password."); return; }
    setCloseSaving(true); setCloseError("");
    try {
      await api.delete("/api/auth/account", {
        headers: { Authorization: `Bearer ${token}` },
        data: { password: closePassword },
      });
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      navigate("/login");
    } catch (err: any) {
      setCloseError(err?.response?.data?.message || "Incorrect password or failed to close account.");
    } finally { setCloseSaving(false); }
  }

  // ────────────────────────────────────────────────────────────
  // TOPBAR
  // ────────────────────────────────────────────────────────────

  function renderTopbar() {
    return (
      <>
        <nav className="topbar">
          <Link to="/dashboard">
            <img src={logo} alt="Course Compass" className="topbar-logo" />
          </Link>
          <div className="topbar-pill-nav">
            <Link to="/dashboard" className="topbar-pill">Dashboard</Link>
            <Link to="/courses"   className="topbar-pill">Courses</Link>
            <Link to="/settings"  className="topbar-pill topbar-pill-active">Settings</Link>
          </div>
          <div className="topbar-right">
            <button className="topbar-logout-btn" onClick={handleLogout}>Log out</button>
          </div>
          <button
            className={`topbar-hamburger${mobileOpen ? " is-open" : ""}`}
            onClick={() => setMobileOpen(o => !o)}
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
          >
            <span /><span /><span />
          </button>
        </nav>

        <div ref={mobileMenuRef} className={`topbar-mobile-menu${mobileOpen ? " is-open" : ""}`}>
          <Link to="/dashboard" className="topbar-mobile-link" onClick={() => setMobileOpen(false)}>Dashboard</Link>
          <Link to="/courses"   className="topbar-mobile-link" onClick={() => setMobileOpen(false)}>Courses</Link>
          <Link to="/settings"  className="topbar-mobile-link topbar-mobile-link-active" onClick={() => setMobileOpen(false)}>Settings</Link>
          <div className="topbar-mobile-divider" />
          <button className="topbar-mobile-link topbar-mobile-link-danger" onClick={handleLogout}>Log out</button>
        </div>

        {mobileOpen && (
          <div className="topbar-backdrop is-open" onClick={() => setMobileOpen(false)} />
        )}
      </>
    );
  }

  // ────────────────────────────────────────────────────────────
  // SHARED ROW
  // ────────────────────────────────────────────────────────────

  function Row({
    panelKey, icon, label, value, danger,
  }: {
    panelKey: AccountPanel;
    icon: JSX.Element;
    label: string;
    value: string;
    danger?: boolean;
  }) {
    const isOpen = openPanel === panelKey;
    return (
      <div
        className={`sett-row${isOpen ? " is-open" : ""}`}
        onClick={() => togglePanel(panelKey)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === "Enter" && togglePanel(panelKey)}
      >
        <div
          className="sett-row-icon"
          style={danger ? { background: "rgba(201,79,79,0.08)", color: "var(--error-text)" } : undefined}
        >
          {icon}
        </div>
        <div className="sett-row-text">
          <span className="sett-row-label" style={danger ? { color: "var(--error-text)" } : undefined}>{label}</span>
          <span className="sett-row-value">{value}</span>
        </div>
        <span className={`sett-row-chevron${isOpen ? " rotated" : ""}`}>
          <IconChevron />
        </span>
      </div>
    );
  }

  // ── Canvas row value ──
  function canvasRowValue(): string {
    if (!canvasSaved) return "Not connected";
    if (lastSync) return `Connected · Last synced ${new Date(lastSync).toLocaleDateString()}`;
    return "Connected · Never synced";
  }

  // ────────────────────────────────────────────────────────────
  // MAIN RENDER
  // ────────────────────────────────────────────────────────────

  return (
    <div className="auth-shell-soft">
      {renderTopbar()}

      <main className="page-shell">
        <div className="page-container">

          <div className="sett-page-header">
            <h1 className="sett-page-title">Settings</h1>
            <p className="sett-page-sub">Manage your account and integrations.</p>
          </div>

          {/* ════════ ACCOUNT ════════ */}
          <div className="sett-group">
            <div className="sett-group-label">Account</div>

            <Row panelKey="name" icon={<IconUser />} label="Edit Profile" value={currentUser?.name || "—"} />
            <div className={`sett-expand${openPanel === "name" ? " is-open" : ""}`}>
              <form className="sett-expand-form" onSubmit={handleNameSave}>
                <input className="sett-expand-input" value={nameValue} onChange={e => setNameValue(e.target.value)} placeholder="Full name" autoComplete="name" />
                {nameError && <p className="sett-expand-error">{nameError}</p>}
                <div className="sett-expand-row">
                  <button type="submit" className="sett-expand-btn sett-expand-btn-primary" disabled={nameSaving}>{nameSaving ? "Saving…" : "Save"}</button>
                  <button type="button" className="sett-expand-btn sett-expand-btn-secondary" onClick={() => togglePanel(null)}>Cancel</button>
                </div>
              </form>
            </div>

            <Row panelKey="email" icon={<IconMail />} label="Email" value={currentUser?.email || "—"} />
            <div className={`sett-expand${openPanel === "email" ? " is-open" : ""}`}>
              {!codeSent ? (
                <form className="sett-expand-form" onSubmit={handleGetCode}>
                  <input className="sett-expand-input" type="email" value={emailValue} onChange={e => setEmailValue(e.target.value)} placeholder="New email address" autoComplete="email" />
                  {emailError && <p className="sett-expand-error">{emailError}</p>}
                  <div className="sett-expand-row">
                    <button type="submit" className="sett-expand-btn sett-expand-btn-primary" disabled={emailSaving}>{emailSaving ? "Sending…" : "Get Code"}</button>
                    <button type="button" className="sett-expand-btn sett-expand-btn-secondary" onClick={() => togglePanel(null)}>Cancel</button>
                  </div>
                </form>
              ) : (
                <form className="sett-expand-form" onSubmit={handleEmailSave}>
                  <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--text-soft)" }}>Code sent to <strong>{emailValue}</strong></p>
                  <input className="sett-expand-input" value={codeValue} onChange={e => setCodeValue(e.target.value)} placeholder="Enter verification code" autoComplete="one-time-code" />
                  {emailError && <p className="sett-expand-error">{emailError}</p>}
                  <div className="sett-expand-row">
                    <button type="submit" className="sett-expand-btn sett-expand-btn-primary" disabled={emailSaving}>{emailSaving ? "Saving…" : "Confirm"}</button>
                    <button type="button" className="sett-expand-btn sett-expand-btn-ghost" onClick={() => setCodeSent(false)}>Resend</button>
                    <button type="button" className="sett-expand-btn sett-expand-btn-secondary" onClick={() => togglePanel(null)}>Cancel</button>
                  </div>
                </form>
              )}
            </div>

            <Row panelKey="password" icon={<IconLock />} label="Change Password" value="••••••••" />
            <div className={`sett-expand${openPanel === "password" ? " is-open" : ""}`}>
              <form className="sett-expand-form" onSubmit={handlePasswordSave}>
                <input className="sett-expand-input" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="Current password" autoComplete="current-password" />
                <input className="sett-expand-input" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New password" autoComplete="new-password" />
                <input className="sett-expand-input" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat new password" autoComplete="new-password" />
                {passwordError && <p className="sett-expand-error">{passwordError}</p>}
                <div className="sett-expand-row">
                  <button type="submit" className="sett-expand-btn sett-expand-btn-primary" disabled={passwordSaving}>{passwordSaving ? "Saving…" : "Save"}</button>
                  <button type="button" className="sett-expand-btn sett-expand-btn-secondary" onClick={() => togglePanel(null)}>Cancel</button>
                </div>
              </form>
            </div>
          </div>

          {/* ════════ PREFERENCES ════════ */}
          <div className="sett-group">
            <div className="sett-group-label">Preferences</div>

            <Row panelKey="firstday" icon={<IconCalendar />} label="First Day of Week" value={DOW_OPTIONS.find(o => o.val === firstDay)?.label || "Sunday"} />
            <div className={`sett-expand${openPanel === "firstday" ? " is-open" : ""}`}>
              <div className="sett-expand-form">
                <div className="sett-expand-row">
                  {DOW_OPTIONS.map(opt => (
                    <button
                      key={opt.val} type="button"
                      disabled={firstDaySaving}
                      className={`sett-expand-btn${firstDay === opt.val ? " sett-expand-btn-primary" : " sett-expand-btn-secondary"}`}
                      onClick={() => handleFirstDayChange(opt.val)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {firstDaySaving && <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--text-soft)" }}>Saving…</p>}
              </div>
            </div>

            {/* ── Study Planner ── */}
            <Row
              panelKey="planner"
              icon={<IconPlanner />}
              label="Study Planner"
              value={plannerRowValue()}
            />
            <div className={`sett-expand${openPanel === "planner" ? " is-open" : ""}`}>
              <form className="sett-expand-form" onSubmit={handlePlannerSave}>

                {/* ── Start scheduling up to ── */}
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label
                    htmlFor="planner-advance"
                    style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-soft)" }}
                  >
                    Start scheduling up to
                    <span style={{ fontWeight: 400, marginLeft: "4px", color: "var(--text-faint)" }}>
                      (days before due date) &mdash; min 2, max 365
                    </span>
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <input
                      id="planner-advance"
                      className="sett-expand-input"
                      type="number"
                      min={2}
                      max={365}
                      step={1}
                      value={plannerAdvance || ""}
                      onChange={e => handleAdvanceChange(e.target.value)}
                      onKeyDown={e => { if (e.key === "." || e.key === "," || e.key === "-" || e.key === "e") e.preventDefault(); }}
                      style={{ maxWidth: "120px" }}
                      placeholder="7"
                    />
                    <span style={{ fontSize: "0.9rem", color: "var(--text-soft)" }}>days</span>
                  </div>
                </div>

                {/* ── Finish at least ── */}
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label
                    htmlFor="planner-buffer"
                    style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-soft)" }}
                  >
                    Finish at least
                    <span style={{ fontWeight: 400, marginLeft: "4px", color: "var(--text-faint)" }}>
                      (hours before due date) &mdash; min 1, max 24
                    </span>
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <input
                      id="planner-buffer"
                      className="sett-expand-input"
                      type="number"
                      min={1}
                      max={24}
                      step={1}
                      value={plannerBuffer || ""}
                      onChange={e => handleBufferChange(e.target.value)}
                      onKeyDown={e => { if (e.key === "." || e.key === "," || e.key === "-" || e.key === "e") e.preventDefault(); }}
                      style={{ maxWidth: "120px" }}
                      placeholder="24"
                    />
                    <span style={{ fontSize: "0.9rem", color: "var(--text-soft)" }}>hours</span>
                  </div>
                </div>

                {/* ── Window hint ── */}
                {plannerAdvance >= 2 && plannerBuffer >= 1 && (
                  <p style={{
                    margin: 0,
                    fontSize: "0.83rem",
                    color: (plannerAdvance * 24 - plannerBuffer) >= 24
                      ? "var(--text-soft)"
                      : "var(--error-text)",
                  }}>
                    Scheduling window: <strong>{plannerAdvance * 24 - plannerBuffer}h</strong>
                    {(plannerAdvance * 24 - plannerBuffer) < 24
                      ? " — must be at least 24h"
                      : " ✓"}
                  </p>
                )}

                {plannerError && <p className="sett-expand-error">{plannerError}</p>}

                <div className="sett-expand-row">
                  <button
                    type="submit"
                    className="sett-expand-btn sett-expand-btn-primary"
                    disabled={plannerSaving}
                  >
                    {plannerSaving ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    className="sett-expand-btn sett-expand-btn-secondary"
                    onClick={() => togglePanel(null)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* ════════ INTEGRATIONS ════════ */}
          <div className="sett-group">
            <div className="sett-group-label">Integrations</div>

            <Row panelKey="canvas" icon={<IconCanvas />} label="Canvas LMS" value={canvasRowValue()} />
            <div className={`sett-expand${openPanel === "canvas" ? " is-open" : ""}`}>
              {canvasLoading ? (
                <div className="sett-expand-form">
                  <p style={{ margin: 0, color: "var(--text-soft)", fontSize: "0.93rem" }}>Loading…</p>
                </div>
              ) : (
                <form className="sett-expand-form" onSubmit={handleCanvasSave}>
                  {canvasSaved && canvasUrl && (
                    <p style={{ margin: "0 0 4px", fontSize: "0.85rem", color: "var(--text-soft)" }}>
                      Connected to <strong>{canvasUrl}</strong>
                    </p>
                  )}

                  <input className="sett-expand-input" type="password" value={canvasToken} onChange={e => setCanvasToken(e.target.value)} placeholder="Canvas API token" autoComplete="off" />
                  <input className="sett-expand-input" type="url" value={canvasUrl} onChange={e => setCanvasUrl(e.target.value)} placeholder="https://canvas.instructure.com" />

                  <div className="sett-canvas-freq-row">
                    <span className="sett-canvas-freq-label">Sync frequency</span>
                    <div className="sett-expand-row" style={{ marginTop: 0 }}>
                      {FREQ_OPTIONS.map(opt => (
                        <button
                          key={opt.val} type="button"
                          disabled={freqSaving}
                          className={`sett-expand-btn${syncFrequency === opt.val ? " sett-expand-btn-primary" : " sett-expand-btn-secondary"}`}
                          onClick={() => handleFrequencyChange(opt.val)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {canvasSaved && (
                    <div className="sett-canvas-sync-info">
                      <span>Last synced: <strong>{lastSync ? new Date(lastSync).toLocaleString() : "Never"}</strong></span>
                      <span>Next sync: <strong>{nextSync ? new Date(nextSync).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "—"}</strong></span>
                    </div>
                  )}

                  {canvasError && <p className="sett-expand-error">{canvasError}</p>}
                  {syncResult && (
                    <p className={`sett-expand-error${syncResult.ok ? " sett-expand-success" : ""}`}>{syncResult.message}</p>
                  )}

                  <div className="sett-expand-row">
                    <button type="submit" className="sett-expand-btn sett-expand-btn-primary" disabled={canvasSaving}>
                      {canvasSaving ? (wasConnected ? "Saving…" : "Connecting…") : canvasSaved ? "Update" : "Save"}
                    </button>

                    {canvasSaved && (
                      <button
                        type="button"
                        onClick={handleCanvasSync}
                        disabled={canvasSaving}
                        style={{
                          background: canvasSaving ? "rgba(74,138,71,0.4)" : "rgba(74,138,71,0.12)",
                          color: "#3a7a37",
                          border: "1px solid rgba(74,138,71,0.35)",
                          borderRadius: "12px",
                          padding: "10px 20px",
                          fontSize: "0.93rem",
                          fontWeight: 700,
                          cursor: canvasSaving ? "not-allowed" : "pointer",
                          transition: "background 150ms",
                        }}
                      >
                        {canvasSaving ? "Syncing…" : "Sync now"}
                      </button>
                    )}

                    {canvasSaved && (
                      <button
                        type="button"
                        onClick={handleCanvasRemove}
                        disabled={canvasSaving}
                        style={{
                          background: "rgba(201,79,79,0.06)",
                          color: "var(--error-text)",
                          border: "1px solid rgba(201,79,79,0.25)",
                          borderRadius: "12px",
                          padding: "10px 20px",
                          fontSize: "0.93rem",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Remove
                      </button>
                    )}

                    <button type="button" className="sett-expand-btn sett-expand-btn-secondary" onClick={() => togglePanel(null)}>Cancel</button>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* ════════ DANGER ZONE ════════ */}
          <div className="sett-group">
            <div className="sett-group-label" style={{ color: "var(--error-text)" }}>Danger Zone</div>

            <Row
              panelKey="closeaccount"
              icon={<IconDanger />}
              label="Close Account"
              value="Permanently delete your account and all data"
              danger
            />
            <div className={`sett-expand${openPanel === "closeaccount" ? " is-open" : ""}`}>
              <form className="sett-expand-form" onSubmit={handleCloseAccount}>
                <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--error-text)", fontWeight: 600 }}>
                  ⚠️ This action is permanent and cannot be undone. All your courses, assignments, and data will be deleted.
                </p>
                <input
                  className="sett-expand-input"
                  type="password"
                  value={closePassword}
                  onChange={e => setClosePassword(e.target.value)}
                  placeholder="Enter your current password to confirm"
                  autoComplete="current-password"
                />
                {closeError && <p className="sett-expand-error">{closeError}</p>}
                <div className="sett-expand-row">
                  <button
                    type="submit"
                    disabled={closeSaving}
                    style={{
                      background: "rgba(201,79,79,0.9)",
                      color: "#fff",
                      border: "none",
                      borderRadius: "12px",
                      padding: "11px 20px",
                      fontSize: "0.94rem",
                      fontWeight: 700,
                      cursor: closeSaving ? "not-allowed" : "pointer",
                      opacity: closeSaving ? 0.7 : 1,
                    }}
                  >
                    {closeSaving ? "Closing…" : "Close My Account"}
                  </button>
                  <button type="button" className="sett-expand-btn sett-expand-btn-secondary" onClick={() => togglePanel(null)}>Cancel</button>
                </div>
              </form>
            </div>
          </div>

        </div>
      </main>

      {successMsg && <div className="sett-toast sett-toast-success">{successMsg}</div>}
      {errorMsg   && <div className="sett-toast sett-toast-error">{errorMsg}</div>}
    </div>
  );
}
