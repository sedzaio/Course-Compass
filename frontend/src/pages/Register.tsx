import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import api from '../api';

export default function Register(): JSX.Element {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [retypePassword, setRetypePassword] = useState('');
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
    <div>
      <h1>Course Compass</h1>
      <h2>Register</h2>

      {message && <p style={{ color: 'green' }}>{message}</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <form onSubmit={handleSubmit}>
        <label>Full Name</label><br />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <br /><br />

        <label>Email</label><br />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <br /><br />

        <label>Verification Code</label><br />
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />
        <button
          type="button"
          onClick={sendCode}
          disabled={codeSent}
        >
          {codeSent ? 'Code Sent ✓' : 'Get Code'}
        </button>
        <br /><br />

        <label>Password</label><br />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <br /><br />

        <label>Retype Password</label><br />
        <input
          type="password"
          value={retypePassword}
          onChange={(e) => setRetypePassword(e.target.value)}
          required
        />
        <br /><br />

        <button type="submit">Create Account</button>
      </form>

      <br />
      <a href="/login">Already have an account? Login</a>
    </div>
  );
}
