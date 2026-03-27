import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

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
    <div>
      <h1>Reset Password</h1>

      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="email">Email</label>
        </div>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <div style={{ marginTop: "12px" }}>
          <label htmlFor="code">Reset Code</label>
        </div>
        <input
          id="code"
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />

        <div style={{ marginTop: "12px" }}>
          <label htmlFor="newPassword">New Password</label>
        </div>
        <input
          id="newPassword"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />

        <div style={{ marginTop: "12px" }}>
          <label htmlFor="confirmPassword">Confirm New Password</label>
        </div>
        <input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />

        <div style={{ marginTop: "12px" }}>
          <button type="submit" disabled={loading}>
            {loading ? "Resetting..." : "Reset Password"}
          </button>
        </div>
      </form>

      {message && (
        <p style={{ color: "green", marginTop: "12px" }}>
          {message}
        </p>
      )}

      {error && (
        <p style={{ color: "red", marginTop: "12px" }}>
          {error}
        </p>
      )}

      <p style={{ marginTop: "12px" }}>
        <Link to="/forgot-password">Go back</Link>
      </p>

      <p style={{ marginTop: "12px" }}>
        <Link to="/login">Back to Login</Link>
      </p>
    </div>
  );
}