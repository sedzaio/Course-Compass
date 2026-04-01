import { useEffect, useRef, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api";
import logo from "../styles/logo2.png";
import "../styles/app.css";

// ─── Types ───────────────────────────────────────────────────────────────────

type StoredUser = {
  id?: string; _id?: string; name?: string; email?: string;
};

type AccountPanel = "name" | "email" | "password" | "firstday" | "canvas" | null;

const DOW_OPTIONS = [
  { val: "sunday", label: "Sunday" },
  { val: "monday", label: "Monday" },
];

// ─── Icons ───────────────────────────────────────────────────────────────────

function IconUser()     { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>; }
function IconMail()     { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/></svg>; }
function IconLock()     { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>; }
function IconCalendar() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>; }
function IconCanvas()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg>; }
function IconChevron()  { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>; }

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
    // reset sub-state on close
    setNameError(""); setEmailError(""); setPasswordError("");
    setCanvasError("");
    setCodeSent(false); setCodeValue("");
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

  const [newPassword,     setNewPassword]     = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving,  setPasswordSaving]  = useState(false);
  const [passwordError,   setPasswordError]   = useState("");

  async function handlePasswordSave(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6)          { setPasswordError("Password must be at least 6 characters."); return; }
    if (newPassword !== confirmPassword) { setPasswordError("Passwords do not match."); return; }
    setPasswordSaving(true); setPasswordError("");
    try {
      await api.put("/api/auth/account", { newPassword }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setNewPassword(""); setConfirmPassword("");
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

  function handleFirstDayChange(val: string) {
    setFirstDay(val);
    localStorage.setItem("firstDayOfWeek", val);
    showSuccess("Preference saved.");
    setOpenPanel(null);
  }

  // ────────────────────────────────────────────────────────────
  // CANVAS
  // ────────────────────────────────────────────────────────────

  const [canvasLoading, setCanvasLoading] = useState(false);
  const [canvasToken,   setCanvasToken]   = useState("");
  const [canvasUrl,     setCanvasUrl]     = useState("");
  const [canvasSaved,   setCanvasSaved]   = useState(false);
  const [canvasSaving,  setCanvasSaving]  = useState(false);
  const [canvasError,   setCanvasError]   = useState("");
  const [lastSync,      setLastSync]      = useState<string | null>(null);
  const [syncResult,    setSyncResult]    = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!token) return;
    setCanvasLoading(true);
    api.get("/api/canvas/settings", { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        setCanvasToken(res.data?.canvasToken || "");
        setCanvasUrl(res.data?.canvasUrl     || "");
        setCanvasSaved(!!res.data?.canvasToken);
        setLastSync(res.data?.lastSync       || null);
      })
      .catch(() => { setCanvasToken(""); setCanvasUrl(""); setCanvasSaved(false); })
      .finally(() => setCanvasLoading(false));
  }, [token]);

  async function handleCanvasSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canvasToken.trim()) { setCanvasError("Canvas token is required."); return; }
    setCanvasSaving(true); setCanvasError(""); setSyncResult(null);
    try {
      await api.post("/api/canvas/settings", {
        canvasToken: canvasToken.trim(), canvasUrl: canvasUrl.trim(),
      }, { headers: { Authorization: `Bearer ${token}` } });
      setCanvasSaved(true);
      setOpenPanel(null);
      showSuccess("Canvas integration saved.");
    } catch (err: any) {
      setCanvasError(err?.response?.data?.message || "Failed to save Canvas settings.");
    } finally { setCanvasSaving(false); }
  }

  async function handleCanvasRemove() {
    if (!window.confirm("Remove Canvas integration?")) return;
    setCanvasSaving(true); setCanvasError(""); setSyncResult(null);
    try {
      await api.delete("/api/canvas/settings", { headers: { Authorization: `Bearer ${token}` } });
      setCanvasToken(""); setCanvasUrl(""); setCanvasSaved(false); setLastSync(null);
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
      setLastSync(new Date().toISOString());
    } catch (err: any) {
      setSyncResult({ ok: false, message: err?.response?.data?.message || "Sync failed." });
    } finally { setCanvasSaving(false); }
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
  // SHARED ROW + EXPAND
  // ────────────────────────────────────────────────────────────

  function Row({
    panelKey, icon, label, value,
  }: {
    panelKey: AccountPanel;
    icon: JSX.Element;
    label: string;
    value: string;
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
        <div className="sett-row-icon">{icon}</div>
        <div className="sett-row-text">
          <span className="sett-row-label">{label}</span>
          <span className="sett-row-value">{value}</span>
        </div>
        <span className={`sett-row-chevron${isOpen ? " rotated" : ""}`}>
          <IconChevron />
        </span>
      </div>
    );
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

            {/* Edit Name */}
            <Row panelKey="name" icon={<IconUser />} label="Edit Profile" value={currentUser?.name || "—"} />
            <div className={`sett-expand${openPanel === "name" ? " is-open" : ""}`}>
              <form className="sett-expand-form" onSubmit={handleNameSave}>
                <input
                  className="sett-expand-input"
                  value={nameValue}
                  onChange={e => setNameValue(e.target.value)}
                  placeholder="Full name"
                  autoComplete="name"
                />
                {nameError && <p className="sett-expand-error">{nameError}</p>}
                <div className="sett-expand-row">
                  <button type="submit" className="sett-expand-btn sett-expand-btn-primary" disabled={nameSaving}>
                    {nameSaving ? "Saving…" : "Save"}
                  </button>
                  <button type="button" className="sett-expand-btn sett-expand-btn-secondary" onClick={() => togglePanel(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>

            {/* Edit Email */}
            <Row panelKey="email" icon={<IconMail />} label="Email" value={currentUser?.email || "—"} />
            <div className={`sett-expand${openPanel === "email" ? " is-open" : ""}`}>
              {!codeSent ? (
                <form className="sett-expand-form" onSubmit={handleGetCode}>
                  <input
                    className="sett-expand-input"
                    type="email"
                    value={emailValue}
                    onChange={e => setEmailValue(e.target.value)}
                    placeholder="New email address"
                    autoComplete="email"
                  />
                  {emailError && <p className="sett-expand-error">{emailError}</p>}
                  <div className="sett-expand-row">
                    <button type="submit" className="sett-expand-btn sett-expand-btn-primary" disabled={emailSaving}>
                      {emailSaving ? "Sending…" : "Get Code"}
                    </button>
                    <button type="button" className="sett-expand-btn sett-expand-btn-secondary" onClick={() => togglePanel(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <form className="sett-expand-form" onSubmit={handleEmailSave}>
                  <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--text-soft)" }}>
                    Code sent to <strong>{emailValue}</strong>
                  </p>
                  <input
                    className="sett-expand-input"
                    value={codeValue}
                    onChange={e => setCodeValue(e.target.value)}
                    placeholder="Enter verification code"
                    autoComplete="one-time-code"
                  />
                  {emailError && <p className="sett-expand-error">{emailError}</p>}
                  <div className="sett-expand-row">
                    <button type="submit" className="sett-expand-btn sett-expand-btn-primary" disabled={emailSaving}>
                      {emailSaving ? "Saving…" : "Confirm"}
                    </button>
                    <button type="button" className="sett-expand-btn sett-expand-btn-ghost" onClick={() => setCodeSent(false)}>
                      Resend
                    </button>
                    <button type="button" className="sett-expand-btn sett-expand-btn-secondary" onClick={() => togglePanel(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Change Password */}
            <Row panelKey="password" icon={<IconLock />} label="Change Password" value="••••••••" />
            <div className={`sett-expand${openPanel === "password" ? " is-open" : ""}`}>
              <form className="sett-expand-form" onSubmit={handlePasswordSave}>
                <input
                  className="sett-expand-input"
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="New password"
                  autoComplete="new-password"
                />
                <input
                  className="sett-expand-input"
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  autoComplete="new-password"
                />
                {passwordError && <p className="sett-expand-error">{passwordError}</p>}
                <div className="sett-expand-row">
                  <button type="submit" className="sett-expand-btn sett-expand-btn-primary" disabled={passwordSaving}>
                    {passwordSaving ? "Saving…" : "Save"}
                  </button>
                  <button type="button" className="sett-expand-btn sett-expand-btn-secondary" onClick={() => togglePanel(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* ════════ PREFERENCES ════════ */}
          <div className="sett-group">
            <div className="sett-group-label">Preferences</div>

            <Row
              panelKey="firstday"
              icon={<IconCalendar />}
              label="First Day of Week"
              value={DOW_OPTIONS.find(o => o.val === firstDay)?.label || "Sunday"}
            />
            <div className={`sett-expand${openPanel === "firstday" ? " is-open" : ""}`}>
              <div className="sett-expand-form">
                <div className="sett-expand-row">
                  {DOW_OPTIONS.map(opt => (
                    <button
                      key={opt.val}
                      type="button"
                      className={`sett-expand-btn${firstDay === opt.val ? " sett-expand-btn-primary" : " sett-expand-btn-secondary"}`}
                      onClick={() => handleFirstDayChange(opt.val)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ════════ INTEGRATIONS ════════ */}
          <div className="sett-group">
            <div className="sett-group-label">Integrations</div>

            <Row
              panelKey="canvas"
              icon={<IconCanvas />}
              label="Canvas LMS"
              value={canvasSaved ? "Connected" : "Not connected"}
            />
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
                  <input
                    className="sett-expand-input"
                    type="password"
                    value={canvasToken}
                    onChange={e => setCanvasToken(e.target.value)}
                    placeholder="Canvas API token"
                    autoComplete="off"
                  />
                  <input
                    className="sett-expand-input"
                    type="url"
                    value={canvasUrl}
                    onChange={e => setCanvasUrl(e.target.value)}
                    placeholder="https://canvas.instructure.com"
                  />
                  {canvasError && <p className="sett-expand-error">{canvasError}</p>}
                  {syncResult && (
                    <p className={`sett-expand-error${syncResult.ok ? " sett-expand-success" : ""}`}>
                      {syncResult.message}
                    </p>
                  )}
                  {lastSync && (
                    <p style={{ margin: "0", fontSize: "0.82rem", color: "var(--text-soft)" }}>
                      Last synced: {new Date(lastSync).toLocaleString()}
                    </p>
                  )}
                  <div className="sett-expand-row">
                    <button type="submit" className="sett-expand-btn sett-expand-btn-primary" disabled={canvasSaving}>
                      {canvasSaving ? "Saving…" : canvasSaved ? "Update" : "Save"}
                    </button>
                    {canvasSaved && (
                      <button type="button" className="sett-expand-btn sett-expand-btn-ghost" onClick={handleCanvasSync} disabled={canvasSaving}>
                        🔄 Sync
                      </button>
                    )}
                    {canvasSaved && (
                      <button
                        type="button"
                        className="sett-expand-btn"
                        style={{
                          background: "rgba(201,79,79,0.06)", color: "var(--error-text)",
                          border: "1px solid rgba(201,79,79,0.25)", borderRadius: "12px",
                          padding: "10px 20px", fontSize: "0.93rem", fontWeight: 700, cursor: "pointer",
                        }}
                        onClick={handleCanvasRemove}
                        disabled={canvasSaving}
                      >
                        Remove
                      </button>
                    )}
                    <button type="button" className="sett-expand-btn sett-expand-btn-secondary" onClick={() => togglePanel(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

        </div>
      </main>

      {successMsg && <div className="sett-toast sett-toast-success">{successMsg}</div>}
      {errorMsg   && <div className="sett-toast sett-toast-error">{errorMsg}</div>}
    </div>
  );
}
