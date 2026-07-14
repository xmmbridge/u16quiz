import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import { setSessionUser, getSessionUser } from '../lib/session.js';

export default function Login() {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [picked, setPicked] = useState(null);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const existing = getSessionUser();
    if (existing) {
      navigate(existing.role === 'teacher' ? '/teacher' : '/student', { replace: true });
      return;
    }
    supabase
      .from('users')
      .select('*')
      .order('role')
      .order('name')
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setUsers(data);
      });
  }, [navigate]);

  function pickUser(user) {
    setPicked(user);
    setPassword('');
    setLoginError(null);
  }

  async function submitPassword(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setLoginError(null);
    try {
      const res = await fetch('/.netlify/functions/login', {
        method: 'POST',
        body: JSON.stringify({ name: picked.name, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || 'Login failed');
        return;
      }
      setSessionUser(data);
      navigate(data.role === 'teacher' ? '/teacher' : '/student');
    } catch {
      setLoginError('Could not reach login server');
    } finally {
      setSubmitting(false);
    }
  }

  const teachers = users?.filter((u) => u.role === 'teacher') || [];
  const students = users?.filter((u) => u.role === 'student') || [];

  return (
    <div className="wrap">
      <div className="top-bar">
        <div className="brand">&#9824; Bridge Bidding Quiz &#9829;</div>
      </div>
      <div className="panel">
        <h2>Who's playing?</h2>
        {error && <p className="warn-banner">Couldn't load users: {error}</p>}
        {!users && !error && <p className="muted">Loading...</p>}
        {users && !picked && (
          <>
            <p className="muted">Teacher</p>
            <div className="name-grid">
              {teachers.map((u) => (
                <button key={u.id} onClick={() => pickUser(u)}>{u.name}</button>
              ))}
            </div>
            <p className="muted" style={{ marginTop: 18 }}>Students</p>
            <div className="name-grid">
              {students.map((u) => (
                <button key={u.id} className="secondary" onClick={() => pickUser(u)}>{u.name}</button>
              ))}
            </div>
            {users.length === 0 && (
              <p className="warn-banner">No users found — run the roster upsert script first (scripts/upsertRoster.mjs).</p>
            )}
          </>
        )}
        {picked && (
          <form onSubmit={submitPassword}>
            <p className="muted">Password for <b>{picked.name}</b></p>
            {loginError && <p className="warn-banner">{loginError}</p>}
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button type="submit" disabled={submitting || !password}>
                {submitting ? 'Checking...' : 'Log in'}
              </button>
              <button type="button" className="secondary" onClick={() => setPicked(null)}>Back</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
