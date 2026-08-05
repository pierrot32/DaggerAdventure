import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../components/Button/Button';
import { useNotificationStore } from './notificationStore';
import styles from './NotificationsPage.module.css';

// Account inbox for durable invitation notifications
export default function NotificationsPage() {
  const { notifications, loading, error, fetchNotifications, markRead } = useNotificationStore();
  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  return (
    <section>
      <p className="eyebrow">INBOX</p>
      <h2>Notifications</h2>
      {error && <p className={styles.error}>{error}</p>}
      {loading ? <p className="muted">Loading notifications...</p> : (
        <div className={styles.list}>
          {notifications.length === 0 && <p className="muted">You are all caught up.</p>}
          {notifications.map((notification) => (
            <article className={`${styles.item} ${notification.read_at ? '' : styles.unread}`} key={notification.id}>
              <div><strong>{notification.title}</strong><p>{notification.body}</p></div>
              {notification.adventure_id && <Link to={`/adventures/${notification.adventure_id}`}>View adventure</Link>}
              {!notification.read_at && <Button variant="text" onClick={() => markRead(notification.id)}>Mark read</Button>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
