import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import logo from "../styles/logo.png";
import "../styles/app.css";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "https://team12.me";

type ResetPasswordLocationState = {
  email?: string;
  message?: string;
};

export default function ResetPassword() {
  const navigate = useNavigate();
  const location = useLocation();

  const state = (location.state as ResetPasswordLocationState) || {};

  const [email, setEmail] = useState(state.email || "");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [message, setMessage] = useState(state.message || "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (state.email) {
      setEmail(state.email);
    }
    if (state.message) {
      setMessage(state.message);
    }
  }, [state.email, state.message]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          code,
          newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to reset password.");
      }

      setMessage(data.message || "Password reset successfully.");

      setTimeout(() => {
        navigate("/login");
      }, 1500);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-container auth-container-column">
        <div className="auth-top-link-wrap">
          <Link className="auth-back-link" to="/login">
            ← Back to login
          </Link>
        </div>

        <div className="auth-panel">
          <div className="auth-logo-wrap">
            <img src={logo} alt="Course Compass logo" className="auth-logo" />
          </div>

          {message && <p className="auth-message auth-message-success">{message}</p>}
          {error && <p className="auth-message auth-message-error">{error}</p>}

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-field">
              <label className="auth-label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                className="auth-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
              />
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="code">
                Reset Code
              </label>
              <input
                id="code"
                className="auth-input"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Enter reset code"
                required
              />
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="newPassword">
                New Password
              </label>
              <input
                id="newPassword"
                className="auth-input"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                required
              />
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="confirmPassword">
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                className="auth-input"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                required
              />
            </div>

            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? "Resetting..." : "Reset Password"}
            </button>
          </form>

          <div className="auth-footer">
            <p className="auth-footer-text">
              Need a new code?{" "}
              <Link className="auth-footer-link" to="/forgot-password">
                Try again
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}