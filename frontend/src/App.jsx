import { useEffect, useState } from 'react';
import './App.css';

const emptyForm = { email: '', name: '', password: '' };

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    request('/api/auth/me')
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload = mode === 'login'
        ? { email: form.email, password: form.password }
        : form;
      setUser(await request(endpoint, { method: 'POST', body: JSON.stringify(payload) }));
      setForm(emptyForm);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const signOut = async () => {
    await request('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setMode('login');
  };

  if (loading) return <main className="loading">Opening your adventure...</main>;

  return (
    <main className="page-shell">
      <section className="brand-panel">
        <p className="eyebrow">DAGGER ADVENTURE</p>
        <h1>Your story starts here.</h1>
        <p className="intro">A private table for the people you trust. Sign in to enter your campaign space.</p>
        <div className="sigil" aria-hidden="true">✦</div>
      </section>

      <section className="auth-panel">
        {user ? (
          <div className="welcome-state">
            <p className="eyebrow">WELCOME BACK</p>
            <h2>{user.name}</h2>
            <p className="muted">{user.email}</p>
            <div className="access-box">
              <span className="status-dot" />
              <div>
                <strong>Adventure access granted</strong>
                <p>Your account is ready for the next part of the application.</p>
              </div>
            </div>
            <button className="text-button" type="button" onClick={signOut}>Sign out</button>
          </div>
        ) : (
          <>
            <div className="form-heading">
              <p className="eyebrow">{mode === 'login' ? 'MEMBER ACCESS' : 'NEW ACCOUNT'}</p>
              <h2>{mode === 'login' ? 'Continue your journey' : 'Create your account'}</h2>
              <p className="muted">
                {mode === 'login' ? 'Use your email and password to sign in.' : 'Your name will identify you inside the application.'}
              </p>
            </div>
            <form onSubmit={submit}>
              {mode === 'register' && (
                <label>
                  Name
                  <input required maxLength="80" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoComplete="name" />
                </label>
              )}
              <label>
                Email address
                <input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" />
              </label>
              <label>
                Password
                <input required minLength="8" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
              </label>
              {message && <p className="form-error" role="alert">{message}</p>}
              <button className="primary-button" type="submit" disabled={submitting}>
                {submitting ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
              </button>
            </form>
            <button className="text-button switch-button" type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setMessage(''); }}>
              {mode === 'login' ? 'Need an account? Create one' : 'Already have an account? Sign in'}
            </button>
          </>
        )}
      </section>
    </main>
  );
}