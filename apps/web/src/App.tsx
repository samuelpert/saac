import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth, useIsAdmin } from './auth/AuthContext';
import { AppShell } from './components/AppShell';
import { Loading } from './components/ui';
import { AuditLog, Backups, Terms, Users } from './pages/Admin';
import { CheckedOut } from './pages/CheckedOut';
import { Home } from './pages/Home';
import { ImportDetail, Imports } from './pages/Imports';
import { ImportStudents } from './pages/ImportStudents';
import { ChangePassword, Login } from './pages/Login';
import { People } from './pages/People';
import { Person } from './pages/Person';
import { PersonForm } from './pages/PersonForm';
import { Placeholder } from './pages/Placeholder';

/** Hides admin screens from staff. The server enforces the same rule on every admin route. */
function AdminOnly({ children }: { children: ReactNode }) {
  return useIsAdmin() ? <>{children}</> : <Navigate to="/" replace />;
}

export function App() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Login />;
  if (user.mustChangePassword) return <ChangePassword />;

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Home />} />
        <Route path="people" element={<People />} />
        <Route path="people/new" element={<AdminOnly><PersonForm /></AdminOnly>} />
        <Route path="people/:id" element={<Person />} />
        <Route path="people/:id/edit" element={<AdminOnly><PersonForm /></AdminOnly>} />
        <Route path="checked-out/:kind" element={<CheckedOut />} />
        <Route path="check-out" element={<Placeholder title="Check out" phase={4} what="Scan a person, scan their books and tech into a cart, and print the receipt." />} />
        <Route path="check-in" element={<Placeholder title="Check in" phase={4} what="Scan an item or copy to find its loan and check it in." />} />
        <Route path="student-books" element={<Placeholder title="Student books" phase={3} what="Each student's book needs for the term, assigning copies, the pull list and the shortage report." />} />
        <Route path="reminders" element={<Placeholder title="Reminders" phase={6} what="Preview and send return reminders." />} />
        <Route path="admin/imports" element={<AdminOnly><Imports /></AdminOnly>} />
        <Route path="admin/imports/students" element={<AdminOnly><ImportStudents /></AdminOnly>} />
        <Route path="admin/imports/:id" element={<AdminOnly><ImportDetail /></AdminOnly>} />
        <Route path="admin/inventory" element={<AdminOnly><Placeholder title="Inventory" phase={2} what="Tech items, book titles and book copies." /></AdminOnly>} />
        <Route path="admin/terms" element={<AdminOnly><Terms /></AdminOnly>} />
        <Route path="admin/users" element={<AdminOnly><Users /></AdminOnly>} />
        <Route path="admin/audit" element={<AdminOnly><AuditLog /></AdminOnly>} />
        <Route path="admin/backups" element={<AdminOnly><Backups /></AdminOnly>} />
        <Route path="admin/settings" element={<AdminOnly><Placeholder title="Settings" phase={6} what="Loan lengths, hold grace days, reminder template, idle sign-out time, backup alert age, receipt agreement text and the Sport mapping." /></AdminOnly>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
