import { useState, type FormEvent } from 'react';
import { changePasswordSchema } from '@saac/shared';
import { apiSend } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ErrorText, Feedback, Field } from '../components/ui';
import type { SessionUser } from '@saac/shared';

function Brand() {
  return (
    <div className="brand">
      <img src="/brand/fiu-panther.png" alt="FIU Panthers" />
      <img src="/brand/saac-wordmark.png" alt="Student-Athlete Academic Center" />
    </div>
  );
}

export function Login() {
  const { login, notice } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err);
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <form className="card auth-card" onSubmit={submit}>
        <Brand />
        <div className="stack" style={{ gap: 2 }}>
          <h1>SAAC Books</h1>
          <span className="secondary">Sign in to the desk.</span>
        </div>
        {notice && <Feedback fb={{ tone: 'info', word: 'Signed out', text: notice }} />}
        <Field label="Username">
          <input className="input" autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <Field label="Password">
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <ErrorText error={error} />
        <button type="submit" className="btn primary big" disabled={busy || !username || !password}>
          Sign in
        </button>
        <p className="xsmall muted">No account? Ask an admin to create one. There is no sign-up.</p>
      </form>
    </div>
  );
}

export function ChangePassword() {
  const { user, setUser, logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<unknown>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next !== again) return setError(new Error('The two new passwords do not match'));
    const parsed = changePasswordSchema.safeParse({ currentPassword: current, newPassword: next });
    if (!parsed.success) return setError(new Error(parsed.error.issues[0]?.message));
    try {
      const r = await apiSend<{ user: SessionUser }>('POST', '/api/auth/change-password', parsed.data);
      setUser(r.user);
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div className="auth-screen">
      <form className="card auth-card" onSubmit={submit}>
        <Brand />
        <div className="stack" style={{ gap: 2 }}>
          <h1>Set your password</h1>
          <span className="secondary">Hi {user?.name}. Replace the temporary password before you continue.</span>
        </div>
        <Field label="Temporary password">
          <input className="input" type="password" autoComplete="current-password" autoFocus value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password" hint="At least 10 characters">
          <input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="New password again">
          <input className="input" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
        </Field>
        <ErrorText error={error} />
        <button type="submit" className="btn primary big">
          Save password
        </button>
        <button type="button" className="btn tertiary" onClick={() => void logout()}>
          Sign out
        </button>
      </form>
    </div>
  );
}
