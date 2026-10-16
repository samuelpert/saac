import { LogOut, Repeat2 } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { initials } from '../lib/format';

const MAIN = [
  { to: '/', label: 'Home', end: true },
  { to: '/check-out', label: 'Check out' },
  { to: '/check-in', label: 'Check in' },
  { to: '/checked-out/items', label: 'Checked-out items' },
  { to: '/checked-out/books', label: 'Checked-out books' },
  // Student books arrives in phase 3; the menu item stays hidden until then.
];

const ADMIN = [
  { to: '/admin/imports', label: 'Imports' },
  { to: '/admin/inventory', label: 'Inventory' },
  { to: '/admin/terms', label: 'Terms' },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/audit', label: 'Audit log' },
  { to: '/admin/backups', label: 'Backups' },
  { to: '/admin/settings', label: 'Settings' },
];

export function AppShell() {
  const { user, logout } = useAuth();
  if (!user) return null;
  const isAdmin = user.role === 'ADMIN';
  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <img src="/brand/fiu-panther.png" alt="FIU Panthers" />
          <img src="/brand/saac-wordmark.png" alt="Student-Athlete Academic Center" />
        </div>
        {MAIN.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className="nav-link">
            {n.label}
          </NavLink>
        ))}
        {isAdmin && (
          <>
            <div className="nav-group">Admin</div>
            {ADMIN.map((n) => (
              <NavLink key={n.to} to={n.to} className="nav-link admin">
                {n.label}
              </NavLink>
            ))}
          </>
        )}
        <div className="user-foot">
          <div className="user-id">
            <div className="avatar" aria-hidden="true">
              {initials(user.name)}
            </div>
            <div className="who">
              <span>{user.name}</span>
              <span>{isAdmin ? 'Admin' : 'Front desk'}</span>
            </div>
          </div>
          <div className="user-actions">
            <button type="button" className="icon-button-dark" onClick={() => void logout('Signed out. The next person can sign in.')}>
              <Repeat2 size={16} strokeWidth={1.75} aria-hidden="true" />
              Switch user
            </button>
            <button type="button" className="icon-button-dark" onClick={() => void logout()}>
              <LogOut size={16} strokeWidth={1.75} aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      </nav>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
