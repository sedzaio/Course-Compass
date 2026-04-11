import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import logo from "../styles/logo.png";
import "../styles/app.css";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "https://team12.me";

export default function ForgotPassword() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to send reset code.");
      }

      navigate("/reset-password", {
        state: {
          email,
          message: data.message || "Reset code sent to your email.",
        },
      });
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

            {error && <p className="auth-message auth-message-error">{error}</p>}

            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? "Sending..." : "Send Reset Code"}
            </button>
          </form>

          <div className="auth-footer">
            <p className="auth-footer-text">
              Have a code already?{" "}
              <Link className="auth-footer-link" to="/reset-password">
                Reset password
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}