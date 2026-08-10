import { useAuth } from '../hooks/useAuth';
import { Link } from 'react-router-dom';
import Button from '../components/Button/Button';
import { canCreateAdventure, canManageUsers } from '../utils/permissions';
import styles from './AppLayout.module.css';

// Shared header/shell for authed pages - future feature nav links go in <nav> here
export default function AppLayout({ children }) {
  const { user, logout } = useAuth();

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.brand}>DAGGER ADVENTURE</span>
        <nav className={styles.nav}>
          <Link to="/adventures">Adventures</Link>
          <Link to="/characters">Characters</Link>
          {canCreateAdventure(user) && <Link to="/adventures/create">Create</Link>}
          {canManageUsers(user) && <Link to="/admin/users">Admin</Link>}
          {canManageUsers(user) && <Link to="/admin/audit">Audit</Link>}
          {canManageUsers(user) && <Link to="/admin/ai">AI lab</Link>}
          {canManageUsers(user) && <Link to="/admin/ai/logs">AI logs</Link>}
          {canManageUsers(user) && <Link to="/admin/content/books/create">Create book</Link>}
          <Link to="/notifications">Notifications</Link>
          <span className={styles.muted}>{user?.name}</span>
          <Button variant="text" onClick={logout}>Sign out</Button>
        </nav>
      </header>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
