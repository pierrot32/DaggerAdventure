import { useAuth } from '../hooks/useAuth';
import Button from '../components/Button/Button';
import styles from './AppLayout.module.css';

// Shared header/shell for authed pages - future feature nav links go in <nav> here
export default function AppLayout({ children }) {
  const { user, logout } = useAuth();

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.brand}>DAGGER ADVENTURE</span>
        <nav className={styles.nav}>
          <span className={styles.muted}>{user?.name}</span>
          <Button variant="text" onClick={logout}>Sign out</Button>
        </nav>
      </header>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
