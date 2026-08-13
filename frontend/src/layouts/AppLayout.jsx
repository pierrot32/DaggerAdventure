import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useNotificationStore } from '../features/notifications/notificationStore';
import { canCreateAdventure, canManageUsers, canPlay } from '../utils/permissions';
import styles from './AppLayout.module.css';

export default function AppLayout({ children }) {
  const { user, logout } = useAuth();
  const [openMenu, setOpenMenu] = useState(null);
  const menuRef = useRef(null);
  const { notifications, fetchNotifications } = useNotificationStore();
  const unreadCount = notifications.filter((notification) => !notification.read_at).length;

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpenMenu(null);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const toggleMenu = (menu) => setOpenMenu((current) => current === menu ? null : menu);
  const closeMenu = () => setOpenMenu(null);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.brand}>DAGGER ADVENTURE</span>
        <nav className={styles.nav} ref={menuRef}>
          <div className={styles.menu}>
            <button className={styles.menuTrigger} type="button" aria-expanded={openMenu === 'adventures'} onClick={() => toggleMenu('adventures')}>Adventures</button>
            {openMenu === 'adventures' && <div className={styles.menuPanel}>
              <Link to="/adventures" onClick={closeMenu}>Adventures</Link>
              {canCreateAdventure(user) && <Link to="/adventures/create" onClick={closeMenu}>Create</Link>}
              {canCreateAdventure(user) && <Link to="/frames" onClick={closeMenu}>Frames</Link>}
            </div>}
          </div>
          <Link className={styles.navLink} to="/characters">Characters</Link>
          {canPlay(user) && <Link className={styles.navLink} to="/equipment">Equipment</Link>}
          {canManageUsers(user) && <div className={styles.menu}>
            <button className={styles.menuTrigger} type="button" aria-expanded={openMenu === 'admin'} onClick={() => toggleMenu('admin')}>Admin</button>
            {openMenu === 'admin' && <div className={styles.menuPanel}>
              <Link to="/admin/users" onClick={closeMenu}>Users</Link>
              <Link to="/admin/audit" onClick={closeMenu}>Audit</Link>
              <Link to="/admin/ai" onClick={closeMenu}>AI lab</Link>
              <Link to="/admin/ai/logs" onClick={closeMenu}>AI log</Link>
            </div>}
          </div>}
          {canManageUsers(user) && <div className={styles.menu}>
            <button className={styles.menuTrigger} type="button" aria-expanded={openMenu === 'books'} onClick={() => toggleMenu('books')}>Books</button>
            {openMenu === 'books' && <div className={styles.menuPanel}>
              <Link to="/admin/content/books/create" onClick={closeMenu}>Upload</Link>
              <Link to="/admin/content/books/edit" onClick={closeMenu}>Edit</Link>
            </div>}
          </div>}
          <div className={`${styles.menu} ${styles.accountMenu}`}>
            <button className={styles.accountTrigger} type="button" aria-expanded={openMenu === 'account'} onClick={() => toggleMenu('account')}>
              <span>{user?.name}</span>{unreadCount > 0 && <strong>+{unreadCount}</strong>}
            </button>
            {openMenu === 'account' && <div className={`${styles.menuPanel} ${styles.accountPanel}`}>
              <p className={styles.notificationStatus} role="status">
                {unreadCount > 0 ? `You have ${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}.` : 'You have no new notifications.'}
              </p>
              <Link to="/notifications" onClick={closeMenu}>Notifications</Link>
              <Link to="/settings" onClick={closeMenu}>Settings</Link>
              <button className={styles.signOut} type="button" onClick={logout}>Sign out</button>
            </div>}
          </div>
        </nav>
      </header>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
