import { useEffect, useRef, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api";
import logo from "../styles/logo2.png";
import "../styles/app.css";

// ─── Types ────────────────────────────────────────────────────────────────────

type StoredUser = {
  id?: string; _id?: string; name?: string; email?: string;
};

type AccountPanel =
  | "name" | "email" | "password"
  | "firstday"
  | "avail" | "advanceschedule"
  | "canvas"
  | "closeaccount"
  | null;

type AvailBlock = { day: string; from: string; to: string };

const DOW_OPTIONS = [
  { val: "sunday", label: "Sunday" },
  { val: "monday", label: "Monday" },
];

const FREQ_OPTIONS = [
  { val: "daily",   label: "Every day" },
  { val: "weekly",  label: "Every week" },
  { val: "monthly", label: "Every month" },
];

const DAYS_FROM_SUNDAY = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
const DAYS_FROM_MONDAY = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
const DAY_LABELS: Record<string, string> = {
  sunday: "Sunday", monday: "Monday", tuesday: "Tuesday",
  wednesday: "Wednesday", thursday: "Thursday", friday: "Friday", saturday: "Saturday",
};

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconUser()     { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>; }
function IconMail()     { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/></svg>; }
function IconLock()     { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>; }
function IconCalendar() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>; }
function IconCanvas()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg>; }
function IconChevron()  { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>; }
function IconDanger()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>; }
function IconPlanner()  { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>; }
function IconPlus()     { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>; }
function IconTrash()    { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>; }
function IconWindow()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>; }

// ─── Helpers ───────────────────────────────────────────────────────────────────

function toMins(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function blocksOverlap(a: AvailBlock, b: AvailBlock): boolean {
  if (a.day !== b.day) return false;
  if (!a.from || !a.to || !b.from || !b.to) return false;
  return toMins(a.from) < toMins(b.to) && toMins(b.from) < toMins(a.to);
}
function overlappingIndices(blocks: AvailBlock[], idx: number): number[] {
  return blocks.reduce<number[]>((acc, b, i) => {
    if (i !== idx && blocksOverlap(blocks[idx], b)) acc.push(i);
    return acc;
  }, []);
}

function bufferToHours(val: number, unit: "days" | "hours"): number {
  return unit === "days" ? val * 24 : val;
}
function hoursToBuffer(hours: number): { val: number; unit: "days" | "hours" } {
  if (hours >= 24 && hours % 24 === 0) return { val: hours / 24, unit: "days" };
  return { val: hours, unit: "hours" };
}

function blockNonInteger(e: React.KeyboardEvent<HTMLInputElement>) {
  if (["." , ",", "-", "e", "E", "+"].includes(e.key)) e.preventDefault();
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Settings(): JSX.Element {
  const navigate = useNavigate();
  const token    = localStorage.getItem("token");

  const currentUser = useMemo<StoredUser | null>(() => {
    try { return JSON.parse(localStorage.getItem("user") || "null"); }
    catch { return null; }
  }, []);

  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg,   setErrorMsg]   = useState("");
  function showSuccess(msg: string) { setSuccessMsg(msg); setErrorMsg(""); setTimeout(() => setSuccessMsg(""), 3500); }
  function showError(msg: string)   { setErrorMsg(msg); setSuccessMsg(""); setTimeout(() => setErrorMsg(""), 4000); }

  useEffect(() => { if (!token) navigate("/login"); }, [token, navigate]);

  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mobileOpen) return;
    function handler(e: MouseEvent) {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) setMobileOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [mobileOpen]);

  function handleLogout() { localStorage.removeItem("token"); localStorage.removeItem("user"); navigate("/login"); }

  const [openPanel, setOpenPanel] = useState<AccountPanel>(null);
  function togglePanel(p: AccountPanel) {
    setOpenPanel(prev => prev === p ? null : p);
    setNameError(""); setEmailError(""); setPasswordError("");
    setCanvasError(""); setCloseError(""); setClosePassword("");
    setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    setCodeSent(false); setCodeValue("");
    setAvailError(""); setAdvanceError("");
  }

  // ──── ACCOUNT ────
  const [nameValue,  setNameValue]  = useState(currentUser?.name  || "");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError,  setNameError]  = useState("");
  async function handleNameSave(e: React.FormEvent) {
    e.preventDefault();
    if (!nameValue.trim()) { setNameError("Name is required."); return; }
    setNameSaving(true); setNameError("");
    try {
      await api.put("/api/auth/account", { name: nameValue.trim() }, { headers: { Authorization: `Bearer ${token}` } });
      const stored = JSON.parse(localStorage.getItem("user") || "{}");
      stored.name = nameValue.trim();
      localStorage.setItem("user", JSON.stringify(stored));
      setOpenPanel(null); showSuccess("Name updated.");
    } catch (err: any) { setNameError(err?.response?.data?.message || "Failed to update name."); }
    finally { setNameSaving(false); }
  }

  const [emailValue,  setEmailValue]  = useState(currentUser?.email || "");
  const [codeSent,    setCodeSent]    = useState(false);
  const [codeValue,   setCodeValue]   = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailError,  setEmailError]  = useState("");
  async function handleGetCode(e: React.FormEvent) {
    e.preventDefault();
    if (!emailValue.trim()) { setEmailError("Email is required."); return; }
    setEmailSaving(true); setEmailError("");
    try { await api.post("/api/auth/send-code", { email: emailValue.trim() }); setCodeSent(true); }
    catch (err: any) { setEmailError(err?.response?.data?.message || "Failed to send code."); }
    finally { setEmailSaving(false); }
  }
  async function handleEmailSave(e: React.FormEvent) {
    e.preventDefault();
    if (!codeValue.trim()) { setEmailError("Enter the code."); return; }
    setEmailSaving(true); setEmailError("");
    try {
      await api.put("/api/auth/account", { email: emailValue.trim(), code: codeValue.trim() }, { headers: { Authorization: `Bearer ${token}` } });
      const stored = JSON.parse(localStorage.getItem("user") || "{}");
      stored.email = emailValue.trim();
      localStorage.setItem("user", JSON.stringify(stored));
      setOpenPanel(null); setCodeSent(false); setCodeValue(""); showSuccess("Email updated.");
    } catch (err: any) { setEmailError(err?.response?.data?.message || "Failed to update email."); }
    finally { setEmailSaving(false); }
  }

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
      await api.put("/api/auth/account", { currentPassword, newPassword }, { headers: { Authorization: `Bearer ${token}` } });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      setOpenPanel(null); showSuccess("Password updated.");
    } catch (err: any) { setPasswordError(err?.response?.data?.message || "Failed to update password."); }
    finally { setPasswordSaving(false); }
  }

  // ──── PREFERENCES ────
  const [firstDay, setFirstDay] = useState<string>(() => localStorage.getItem("firstDayOfWeek") || "sunday");
  const [firstDaySaving, setFirstDaySaving] = useState(false);
  useEffect(() => {
    if (!token) return;
    api.get("/api/auth/preferences", { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        const pref = res.data?.firstDayOfWeek || res.data?.preferences?.firstDayOfWeek;
        if (pref === "monday" || pref === "sunday") { setFirstDay(pref); localStorage.setItem("firstDayOfWeek", pref); }
      }).catch(() => {});
  }, [token]);
  async function handleFirstDayChange(val: string) {
    setFirstDay(val); localStorage.setItem("firstDayOfWeek", val); setFirstDaySaving(true);
    try {
      await api.put("/api/auth/preferences", { firstDayOfWeek: val }, { headers: { Authorization: `Bearer ${token}` } });
      showSuccess("Preference saved."); setOpenPanel(null);
    } catch (err: any) { showError(err?.response?.data?.message || "Failed to save preference."); }
    finally { setFirstDaySaving(false); }
  }

  // ──── STUDY PLANNER ────
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [availability,   setAvailability]   = useState<AvailBlock[]>([]);
  const [advanceDays,    setAdvanceDays]    = useState<string>("7");
  const [bufferValue,    setBufferValue]    = useState<string>("1");
  const [bufferUnit,     setBufferUnit]     = useState<"days" | "hours">("days");

  const [availSaving,    setAvailSaving]    = useState(false);
  const [advanceSaving,  setAdvanceSaving]  = useState(false);
  const [availError,     setAvailError]     = useState("");
  const [advanceError,   setAdvanceError]   = useState("");

  const orderedDays = firstDay === "monday" ? DAYS_FROM_MONDAY : DAYS_FROM_SUNDAY;

  useEffect(() => {
    if (!token) return;
    setPlannerLoading(true);
    api.get("/api/planner/preferences", { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        const sp = res.data?.studyPlanner || {};
        setAvailability(sp.availability || []);
        setAdvanceDays(sp.advanceDays != null ? String(sp.advanceDays) : "7");
        if (sp.bufferHours != null) {
          const { val, unit } = hoursToBuffer(Number(sp.bufferHours));
          setBufferValue(String(val));
          setBufferUnit(unit);
        } else {
          setBufferValue("1"); setBufferUnit("days");
        }
      }).catch(() => {}).finally(() => setPlannerLoading(false));
  }, [token]);

  async function savePlanner(patch: Record<string, any>) {
    await api.put("/api/planner/preferences", patch, { headers: { Authorization: `Bearer ${token}` } });
  }

  function blockInvalid(b: AvailBlock) { return !!b.from && !!b.to && b.from >= b.to; }
  function addBlock()   { setAvailability(prev => [...prev, { day: orderedDays[0], from: "08:00", to: "17:00" }]); }
  function removeBlock(idx: number) { setAvailability(prev => prev.filter((_, i) => i !== idx)); }
  function updateBlock(idx: number, field: keyof AvailBlock, value: string) {
    setAvailability(prev => prev.map((b, i) => i === idx ? { ...b, [field]: value } : b));
  }

  async function handleAvailSave(e: React.FormEvent) {
    e.preventDefault(); setAvailError("");
    for (const b of availability) {
      if (!b.from || !b.to) { setAvailError("Each block needs a from and to time."); return; }
      if (blockInvalid(b))  { setAvailError(`${DAY_LABELS[b.day]}: start must be before end.`); return; }
    }
    for (let i = 0; i < availability.length; i++) {
      if (overlappingIndices(availability, i).length > 0) {
        const b = availability[i];
        setAvailError(`${DAY_LABELS[b.day]} ${b.from}–${b.to} overlaps with another block. Please adjust.`);
        return;
      }
    }
    setAvailSaving(true);
    try { await savePlanner({ availability }); setOpenPanel(null); showSuccess("Availability saved."); }
    catch (err: any) { setAvailError(err?.response?.data?.message || "Failed to save."); }
    finally { setAvailSaving(false); }
  }

  const windowHours = useMemo(() => {
    const adv = parseInt(advanceDays, 10);
    const buf = parseInt(bufferValue, 10);
    if (!adv || !buf) return null;
    return adv * 24 - bufferToHours(buf, bufferUnit);
  }, [advanceDays, bufferValue, bufferUnit]);

  async function handleAdvanceSave(e: React.FormEvent) {
    e.preventDefault(); setAdvanceError("");
    const advRaw = advanceDays.trim();
    if (!/^\d+$/.test(advRaw)) { setAdvanceError('"Start scheduling up to" must be a whole number greater than 0.'); return; }
    const adv = parseInt(advRaw, 10);
    if (adv <= 0)   { setAdvanceError('"Start scheduling up to" must be greater than 0.'); return; }
    if (adv > 365)  { setAdvanceError('"Start scheduling up to" cannot exceed 365 days.'); return; }
    const bufRaw = bufferValue.trim();
    if (!/^\d+$/.test(bufRaw)) { setAdvanceError('"Finish at least" must be a whole number greater than 0.'); return; }
    const bufVal = parseInt(bufRaw, 10);
    if (bufVal <= 0) { setAdvanceError('"Finish at least" must be greater than 0.'); return; }
    if (bufferUnit === "hours" && bufVal > 24) { setAdvanceError('"Finish at least" in hours cannot exceed 24.'); return; }
    const bufAsDays = bufferUnit === "days" ? bufVal : bufVal / 24;
    if (adv <= bufAsDays) {
      const bufDisplay = bufferUnit === "days"
        ? `${bufVal} day${bufVal !== 1 ? "s" : ""}`
        : `${bufVal} hour${bufVal !== 1 ? "s" : ""}`;
      setAdvanceError(`"Start scheduling up to" (${adv} days) must be strictly greater than "Finish at least" (${bufDisplay}).`);
      return;
    }
    const bufferHoursVal = bufferToHours(bufVal, bufferUnit);
    const window = adv * 24 - bufferHoursVal;
    if (window < 24) {
      const minAdv = Math.ceil((bufferHoursVal + 24) / 24);
      setAdvanceError(`Scheduling window is only ${window}h — must be at least 24h. With this buffer, "Start scheduling up to" must be at least ${minAdv} days.`);
      return;
    }
    setAdvanceSaving(true);
    try {
      await savePlanner({ advanceDays: adv, bufferHours: bufferHoursVal });
      setOpenPanel(null); showSuccess("Scheduling window saved.");
    } catch (err: any) { setAdvanceError(err?.response?.data?.message || "Failed to save."); }
    finally { setAdvanceSaving(false); }
  }

  // ──── CANVAS ────
  const [canvasLoading,  setCanvasLoading]  = useState(false);
  const [canvasToken,    setCanvasToken]    = useState("");
  const [canvasUrl,      setCanvasUrl]      = useState("");
  const [canvasSaved,    setCanvasSaved]    = useState(false);
  const [canvasSaving,   setCanvasSaving]   = useState(false);
  const [canvasError,    setCanvasError]    = useState("");
  const [lastSync,       setLastSync]       = useState<string | null>(null);
  const [nextSync,       setNextSync]       = useState<string | null>(null);
  const [syncFrequency,  setSyncFrequency]  = useState<string>("weekly");
  const [freqSaving,     setFreqSaving]     = useState(false);
  const [syncResult,     setSyncResult]     = useState<{ ok: boolean; message: string } | null>(null);
  const [wasConnected,   setWasConnected]   = useState(false);

  useEffect(() => {
    if (!token) return;
    setCanvasLoading(true);
    api.get("/api/canvas/settings", { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        setCanvasToken(res.data?.canvasToken || "");
        setCanvasUrl(res.data?.canvasUrl || "");
        const connected = !!res.data?.isConnected;
        setCanvasSaved(connected); setWasConnected(connected);
        setLastSync(res.data?.lastSync || null); setNextSync(res.data?.nextSync || null);
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
      const res = await api.post("/api/canvas/settings", { canvasToken: canvasToken.trim(), canvasUrl: canvasUrl.trim(), syncFrequency }, { headers: { Authorization: `Bearer ${token}` } });
      setCanvasSaved(true); setWasConnected(true); setNextSync(res.data?.nextSync || null);
      if (isFirstTimeSave) {
        setSyncResult({ ok: true, message: "Canvas connected! Running first sync…" });
        try {
          const syncRes = await api.post("/api/canvas/sync", {}, { headers: { Authorization: `Bearer ${token}` } });
          const count = syncRes.data?.synced ?? syncRes.data?.count ?? "?";
          setLastSync(syncRes.data?.lastSync ? new Date(syncRes.data.lastSync).toISOString() : new Date().toISOString());
          setNextSync(syncRes.data?.nextSync ? new Date(syncRes.data.nextSync).toISOString() : null);
          setSyncResult({ ok: true, message: `Canvas connected and synced — ${count} assignments imported.` });
        } catch { setSyncResult({ ok: true, message: "Canvas connected. First sync will run shortly." }); }
      } else { setOpenPanel(null); showSuccess("Canvas integration saved."); }
    } catch (err: any) { setCanvasError(err?.response?.data?.message || "Failed to save Canvas settings."); }
    finally { setCanvasSaving(false); }
  }

  async function handleFrequencyChange(val: string) {
    setSyncFrequency(val);
    if (!canvasSaved) return;
    setFreqSaving(true);
    try {
      const res = await api.put("/api/canvas/settings/frequency", { syncFrequency: val }, { headers: { Authorization: `Bearer ${token}` } });
      setNextSync(res.data?.nextSync || null); showSuccess("Sync frequency updated.");
    } catch (err: any) { showError(err?.response?.data?.message || "Failed to update frequency."); }
    finally { setFreqSaving(false); }
  }

  async function handleCanvasRemove() {
    if (!window.confirm("Remove Canvas integration?")) return;
    setCanvasSaving(true); setCanvasError(""); setSyncResult(null);
    try {
      await api.delete("/api/canvas/settings", { headers: { Authorization: `Bearer ${token}` } });
      setCanvasToken(""); setCanvasUrl(""); setCanvasSaved(false); setWasConnected(false);
      setLastSync(null); setNextSync(null); setSyncFrequency("weekly");
      setOpenPanel(null); showSuccess("Canvas integration removed.");
    } catch { showError("Failed to remove Canvas integration."); }
    finally { setCanvasSaving(false); }
  }

  async function handleCanvasSync() {
    setSyncResult(null); setCanvasSaving(true);
    try {
      const res = await api.post("/api/canvas/sync", {}, { headers: { Authorization: `Bearer ${token}` } });
      const count = res.data?.synced ?? res.data?.count ?? "?";
      setSyncResult({ ok: true, message: `Synced ${count} assignments from Canvas.` });
      setLastSync(res.data?.lastSync ? new Date(res.data.lastSync).toISOString() : new Date().toISOString());
      setNextSync(res.data?.nextSync ? new Date(res.data.nextSync).toISOString() : null);
    } catch (err: any) { setSyncResult({ ok: false, message: err?.response?.data?.message || "Sync failed." }); }
    finally { setCanvasSaving(false); }
  }

  // ──── DANGER ZONE ────
  const [closePassword, setClosePassword] = useState("");
  const [closeSaving,   setCloseSaving]   = useState(false);
  const [closeError,    setCloseError]    = useState("");
  async function handleCloseAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!closePassword.trim()) { setCloseError("Please enter your current password."); return; }
    setCloseSaving(true); setCloseError("");
    try {
      await api.delete("/api/auth/account", { headers: { Authorization: `Bearer ${token}` }, data: { password: closePassword } });
      localStorage.removeItem("token"); localStorage.removeItem("user"); navigate("/login");
    } catch (err: any) { setCloseError(err?.response?.data?.message || "Incorrect password or failed to close account."); }
    finally { setCloseSaving(false); }
  }

  // ──── TOPBAR ────
  function renderTopbar() {
    return (
      <>
        <nav className="topbar">
          <Link to="/dashboard"><img src={logo} alt="Course Compass" className="topbar-logo" /></Link>
          <div className="topbar-pill-nav">
            <Link to="/dashboard" className="topbar-pill">Dashboard</Link>
            <Link to="/courses"   className="topbar-pill">Courses</Link>
            <Link to="/planner"   className="topbar-pill">Study Planner</Link>
            <Link to="/settings"  className="topbar-pill topbar-pill-active">Settings</Link>
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
          <Link to="/courses"   className="topbar-mobile-link" onClick={() => setMobileOpen(false)}>Courses</Link>
          <Link to="/planner"   className="topbar-mobile-link" onClick={() => setMobileOpen(false)}>Study Planner</Link>
          <Link to="/settings"  className="topbar-mobile-link topbar-mobile-link-active" onClick={() => setMobileOpen(false)}>Settings</Link>
          <div className="topbar-mobile-divider" />
          <button className="topbar-mobile-link topbar-mobile-link-danger" onClick={handleLogout}>Log out</button>
        </div>
        {mobileOpen && <div className="topbar-backdrop is-open" onClick={() => setMobileOpen(false)} />}
      </>
    );
  }

  // ──── SHARED ROW ────
  function Row({ panelKey, icon, label, value, danger }: {
    panelKey: AccountPanel; icon: JSX.Element; label: string; value: string; danger?: boolean;
  }) {
    const isOpen = openPanel === panelKey;
    return (
      <div className={`sett-row${isOpen ? " is-open" : ""}`} onClick={() => togglePanel(panelKey)} role="button" tabIndex={0} onKeyDown={e => e.key === "Enter" && togglePanel(panelKey)}>
        <div className="sett-row-icon" style={danger ? { background: "rgba(201,79,79,0.08)", color: "var(--error-text)" } : undefined}>{icon}</div>
        <div className="sett-row-text">
          <span className="sett-row-label" style={danger ? { color: "var(--error-text)" } : undefined}>{label}</span>
          <span className="sett-row-value">{value}</span>
        </div>
        <span className={`sett-row-chevron${isOpen ? " rotated" : ""}`}><IconChevron /></span>
      </div>
    );
  }

  function canvasRowValue() {
    if (!canvasSaved) return "Not connected";
    if (lastSync) return `Connected · Last synced ${new Date(lastSync).toLocaleDateString()}`;
    return "Connected · Never synced";
  }
  function availRowValue() {
    if (availability.length === 0) return "No blocks set";
    const days = [...new Set(availability.map(b => DAY_LABELS[b.day]))];
    return `${availability.length} block${availability.length !== 1 ? "s" : ""} · ${days.slice(0, 3).join(", ")}${days.length > 3 ? "…" : ""}`;
  }
  function advanceRowValue() {
    const adv    = parseInt(advanceDays, 10) || 7;
    const bufVal = parseInt(bufferValue, 10) || 1;
    const bufU   = bufferUnit;
    return `Up to ${adv} day${adv !== 1 ? "s" : ""} early · finish ${bufVal} ${bufU === "days" ? (bufVal !== 1 ? "days" : "day") : (bufVal !== 1 ? "hours" : "hour")} before due`;
  }

  // ──── MAIN RENDER ────
  return (
    <div className="auth-shell-soft">
      {renderTopbar()}
      <main className="page-shell">
        <div className="page-container">

          <div className="sett-page-header">
            <h1 className="sett-page-title">Settings</h1>
            <p className="sett-page-sub"></p>
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
                    <button key={opt.val} type="button" disabled={firstDaySaving}
                      className={`sett-expand-btn${firstDay === opt.val ? " sett-expand-btn-primary" : " sett-expand-btn-secondary"}`}
                      onClick={() => handleFirstDayChange(opt.val)}
                    >{opt.label}</button>
                  ))}
                </div>
                {firstDaySaving && <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--text-soft)" }}>Saving…</p>}
              </div>
            </div>
          </div>

          {/* ════════ STUDY PLANNER ════════ */}
          <div className="sett-group">
            <div className="sett-group-label">Study Planner</div>

            {plannerLoading ? (
              <div style={{ padding: "14px 18px", fontSize: "0.93rem", color: "var(--text-soft)" }}>Loading…</div>
            ) : (
              <>
                <Row panelKey="avail" icon={<IconPlanner />} label="Availability Blocks" value={availRowValue()} />
                <div className={`sett-expand${openPanel === "avail" ? " is-open" : ""}`}>
                  <form className="sett-expand-form" onSubmit={handleAvailSave}>
                    {availability.length === 0 && (
                      <p style={{ margin: "0 0 8px", fontSize: "0.85rem", color: "var(--text-soft)" }}>No blocks added yet.</p>
                    )}
                    {availability.map((block, idx) => {
                      const invalid  = blockInvalid(block);
                      const overlaps = overlappingIndices(availability, idx).length > 0;
                      return (
                        <div key={idx} style={{ marginBottom: (invalid || overlaps) ? 4 : 8 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <select className="sett-expand-input" style={{ flex: "1 1 110px", minWidth: 110 }}
                              value={block.day} onChange={e => updateBlock(idx, "day", e.target.value)}>
                              {orderedDays.map(d => <option key={d} value={d}>{DAY_LABELS[d]}</option>)}
                            </select>
                            <input type="time" className="sett-expand-input"
                              style={{ flex: "1 1 100px", minWidth: 100, ...(overlaps && !invalid ? { borderColor: "var(--error-text)", outline: "none" } : {}) }}
                              value={block.from} onChange={e => updateBlock(idx, "from", e.target.value)} />
                            <span style={{ fontSize: "0.85rem", color: "var(--text-soft)", flexShrink: 0 }}>to</span>
                            <input type="time" className="sett-expand-input"
                              style={{ flex: "1 1 100px", minWidth: 100, ...((invalid || overlaps) ? { borderColor: "var(--error-text)", outline: "none" } : {}) }}
                              value={block.to} onChange={e => updateBlock(idx, "to", e.target.value)} />
                            <button type="button" onClick={() => removeBlock(idx)}
                              style={{ background: "rgba(201,79,79,0.08)", border: "1px solid rgba(201,79,79,0.25)", borderRadius: 8, padding: "6px 9px", cursor: "pointer", color: "var(--error-text)", flexShrink: 0 }}
                              aria-label="Remove block"><IconTrash /></button>
                          </div>
                          {invalid && <p style={{ margin: "3px 0 6px", fontSize: "0.8rem", color: "var(--error-text)" }}>End time must be after start time.</p>}
                          {!invalid && overlaps && <p style={{ margin: "3px 0 6px", fontSize: "0.8rem", color: "var(--error-text)" }}>This slot overlaps with another block on the same day — please adjust.</p>}
                        </div>
                      );
                    })}
                    <button type="button" onClick={addBlock}
                      style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(129,166,198,0.10)", border: "1px dashed rgba(129,166,198,0.5)", borderRadius: 10, padding: "7px 14px", fontSize: "0.88rem", color: "var(--accent,#81A6C6)", cursor: "pointer", fontWeight: 600 }}>
                      <IconPlus /> Add block
                    </button>
                    {availError && <p className="sett-expand-error" style={{ marginTop: 8 }}>{availError}</p>}
                    <div className="sett-expand-row" style={{ marginTop: 14 }}>
                      <button type="submit" className="sett-expand-btn sett-expand-btn-primary" disabled={availSaving}>{availSaving ? "Saving…" : "Save"}</button>
                      <button type="button" className="sett-expand-btn sett-expand-btn-secondary" onClick={() => togglePanel(null)}>Cancel</button>
                    </div>
                  </form>
                </div>

                <Row panelKey="advanceschedule" icon={<IconWindow />} label="Scheduling Window" value={advanceRowValue()} />
                <div className={`sett-expand${openPanel === "advanceschedule" ? " is-open" : ""}`}>
                  <form className="sett-expand-form" onSubmit={handleAdvanceSave}>
                    <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: "1 1 160px" }}>
                        <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-soft)" }}>
                          Start scheduling up to
                          <span style={{ fontWeight: 400, marginLeft: 4, color: "var(--text-faint, #aaa)" }}>(max 365)</span>
                        </label>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input
                            type="number" min="1" max="365" step="1"
                            className="sett-expand-input" style={{ width: 72 }}
                            value={advanceDays}
                            onChange={e => { setAdvanceDays(e.target.value); setAdvanceError(""); }}
                            onKeyDown={blockNonInteger}
                            placeholder="7"
                          />
                          <span style={{ fontSize: "0.9rem", color: "var(--text-soft)", whiteSpace: "nowrap" }}>days before due</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: "1 1 160px" }}>
                        <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-soft)" }}>
                          Finish at least
                          {bufferUnit === "hours" && <span style={{ fontWeight: 400, marginLeft: 4, color: "var(--text-faint, #aaa)" }}>(max 24h)</span>}
                        </label>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input
                            type="number" min="1" step="1"
                            max={bufferUnit === "hours" ? 24 : undefined}
                            className="sett-expand-input" style={{ width: 72 }}
                            value={bufferValue}
                            onChange={e => { setBufferValue(e.target.value); setAdvanceError(""); }}
                            onKeyDown={blockNonInteger}
                            placeholder="1"
                          />
                          <select className="sett-expand-input" style={{ width: "auto", minWidth: 80, paddingRight: 28 }}
                            value={bufferUnit} onChange={e => { setBufferUnit(e.target.value as "days" | "hours"); setAdvanceError(""); }}>
                            <option value="days">days</option>
                            <option value="hours">hours</option>
                          </select>
                          <span style={{ fontSize: "0.9rem", color: "var(--text-soft)", whiteSpace: "nowrap" }}>before due</span>
                        </div>
                      </div>
                    </div>

                    {windowHours !== null && (
                      <p style={{
                        margin: "10px 0 0",
                        fontSize: "0.83rem",
                        color: windowHours >= 24 ? "var(--text-soft)" : "var(--error-text)",
                      }}>
                        Scheduling window: <strong>{windowHours}h</strong>
                        {windowHours < 24 ? " — must be at least 24h" : " ✓"}
                      </p>
                    )}

                    {advanceError && <p className="sett-expand-error" style={{ marginTop: 10 }}>{advanceError}</p>}
                    <div className="sett-expand-row" style={{ marginTop: 14 }}>
                      <button type="submit" className="sett-expand-btn sett-expand-btn-primary" disabled={advanceSaving}>{advanceSaving ? "Saving…" : "Save"}</button>
                      <button type="button" className="sett-expand-btn sett-expand-btn-secondary" onClick={() => togglePanel(null)}>Cancel</button>
                    </div>
                  </form>
                </div>
              </>
            )}
          </div>

          {/* ════════ INTEGRATIONS ════════ */}
          <div className="sett-group">
            <div className="sett-group-label">Integrations</div>
            <Row panelKey="canvas" icon={<IconCanvas />} label="Canvas LMS" value={canvasRowValue()} />
            <div className={`sett-expand${openPanel === "canvas" ? " is-open" : ""}`}>
              {canvasLoading ? (
                <div className="sett-expand-form"><p style={{ margin: 0, color: "var(--text-soft)", fontSize: "0.93rem" }}>Loading…</p></div>
              ) : (
                <form className="sett-expand-form" onSubmit={handleCanvasSave}>
                  {canvasSaved && canvasUrl && (
                    <p style={{ margin: "0 0 4px", fontSize: "0.85rem", color: "var(--text-soft)" }}>Connected to <strong>{canvasUrl}</strong></p>
                  )}
                  <input className="sett-expand-input" type="password" value={canvasToken} onChange={e => setCanvasToken(e.target.value)} placeholder="Canvas API token" autoComplete="off" />
                  <input className="sett-expand-input" type="url" value={canvasUrl} onChange={e => setCanvasUrl(e.target.value)} placeholder="https://canvas.instructure.com" />
                  <div className="sett-canvas-freq-row">
                    <span className="sett-canvas-freq-label">Sync frequency</span>
                    <div className="sett-expand-row" style={{ marginTop: 0 }}>
                      {FREQ_OPTIONS.map(opt => (
                        <button key={opt.val} type="button" disabled={freqSaving}
                          className={`sett-expand-btn${syncFrequency === opt.val ? " sett-expand-btn-primary" : " sett-expand-btn-secondary"}`}
                          onClick={() => handleFrequencyChange(opt.val)}>{opt.label}</button>
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
                  {syncResult && <p className={`sett-expand-error${syncResult.ok ? " sett-expand-success" : ""}`}>{syncResult.message}</p>}
                  <div className="sett-expand-row">
                    <button type="submit" className="sett-expand-btn sett-expand-btn-primary" disabled={canvasSaving}>
                      {canvasSaving ? (wasConnected ? "Saving…" : "Connecting…") : canvasSaved ? "Update" : "Save"}
                    </button>
                    {canvasSaved && (
                      <button type="button" onClick={handleCanvasSync} disabled={canvasSaving}
                        style={{ background: canvasSaving ? "rgba(74,138,71,0.4)" : "rgba(74,138,71,0.12)", color: "#3a7a37", border: "1px solid rgba(74,138,71,0.35)", borderRadius: "12px", padding: "10px 20px", fontSize: "0.93rem", fontWeight: 700, cursor: canvasSaving ? "not-allowed" : "pointer", transition: "background 150ms" }}>
                        {canvasSaving ? "Syncing…" : "Sync now"}
                      </button>
                    )}
                    {canvasSaved && (
                      <button type="button" onClick={handleCanvasRemove} disabled={canvasSaving}
                        style={{ background: "rgba(201,79,79,0.06)", color: "var(--error-text)", border: "1px solid rgba(201,79,79,0.25)", borderRadius: "12px", padding: "10px 20px", fontSize: "0.93rem", fontWeight: 700, cursor: "pointer" }}>Remove</button>
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
            <Row panelKey="closeaccount" icon={<IconDanger />} label="Close Account" value="Permanently delete your account and all data" danger />
            <div className={`sett-expand${openPanel === "closeaccount" ? " is-open" : ""}`}>
              <form className="sett-expand-form" onSubmit={handleCloseAccount}>
                <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--error-text)", fontWeight: 600 }}>
                  ⚠️ This action is permanent and cannot be undone. All your courses, assignments, and data will be deleted.
                </p>
                <input className="sett-expand-input" type="password" value={closePassword} onChange={e => setClosePassword(e.target.value)} placeholder="Enter your current password to confirm" autoComplete="current-password" />
                {closeError && <p className="sett-expand-error">{closeError}</p>}
                <div className="sett-expand-row">
                  <button type="submit" disabled={closeSaving}
                    style={{ background: "rgba(201,79,79,0.9)", color: "#fff", border: "none", borderRadius: "12px", padding: "11px 20px", fontSize: "0.94rem", fontWeight: 700, cursor: closeSaving ? "not-allowed" : "pointer", opacity: closeSaving ? 0.7 : 1 }}>
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
