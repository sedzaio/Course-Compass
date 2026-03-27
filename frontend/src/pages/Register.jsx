import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [retypePassword, setRetypePassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const navigate = useNavigate();

  const sendCode = async () => {
    if (!email) return setError('Please enter your email first');
    setError('');
    try {
      await api.post('/api/auth/send-code', { email });
      setMessage('Verification code sent to your email.');
      setCodeSent(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send code');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== retypePassword) {
      return setError('Passwords do not match');
    }

    try {
      await api.post('/api/auth/verify-code', { email, code });
      await api.post('/api/auth/register', { name, email, password });
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
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