import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import api from '../api';
import logo from '../styles/logo.png';
import '../styles/app.css';

function IconEye({ off }: { off?: boolean }) {
  return off ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default function Register(): JSX.Element {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [retypePassword, setRetypePassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showRetype, setShowRetype] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const navigate = useNavigate();

  const sendCode = async (): Promise<void> => {
    if (!email) {
      setError('Please enter your email first');
      return;
    }
    setError('');
    setMessage('');
    try {
      await api.post('/api/auth/send-code', { email });
      setMessage('Verification code sent to your email.');
      setCodeSent(true);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message || 'Failed to send code');
      } else {
        setError('Failed to send code');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (password !== retypePassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      await api.post('/api/auth/verify-code', { email, code });
      await api.post('/api/auth/register', { name, email, password });
      navigate('/login');
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message || 'Registration failed');
      } else {
        setError('Registration failed');
      }
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-container">
        <div className="auth-panel">
          <div className="auth-logo-wrap">
            <img src={logo} alt="Course Compass logo" className="auth-logo" />
          </div>

          {message && <p className="auth-message auth-message-success">{message}</p>}
          {error && <p className="auth-message auth-message-error">{error}</p>}

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-field">
              <label className="auth-label" htmlFor="name">
                Full Name
              </label>
              <input
                id="name"
                className="auth-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your full name"
                required
              />
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                className="auth-input"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setCodeSent(false);
                }}
                placeholder="Enter your email"
                required
              />
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="code">
                Verification Code
              </label>
              <div className="auth-code-row">
                <input
                  id="code"
                  className="auth-input"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Enter verification code"
                  required
                />
                <button
                  className="auth-code-button"
                  type="button"
                  onClick={sendCode}
                  disabled={codeSent}
                >
                  {codeSent ? 'Code Sent ✓' : 'Get Code'}
                </button>
              </div>
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="password">
                Password
              </label>
              <div className="auth-input-wrap">
                <input
                  id="password"
                  className="auth-input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a password"
                  required
                />
                <button
                  type="button"
                  className="auth-eye-btn"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  <IconEye off={showPassword} />
                </button>
              </div>
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="retypePassword">
                Retype Password
              </label>
              <div className="auth-input-wrap">
                <input
                  id="retypePassword"
                  className="auth-input"
                  type={showRetype ? 'text' : 'password'}
                  value={retypePassword}
                  onChange={(e) => setRetypePassword(e.target.value)}
                  placeholder="Retype your password"
                  required
                />
                <button
                  type="button"
                  className="auth-eye-btn"
                  onClick={() => setShowRetype((v) => !v)}
                  aria-label={showRetype ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  <IconEye off={showRetype} />
                </button>
              </div>
            </div>

            <button className="auth-submit" type="submit">
              Create Account
            </button>
          </form>

          <div className="auth-footer">
            <p className="auth-footer-text">
              Already have an account?{' '}
              <Link className="auth-footer-link" to="/login">
                Login
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
