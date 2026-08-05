import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../components/Button/Button';
import { useNotificationStore } from './notificationStore';
import { useAdventureStore } from '../adventures/adventureStore';
import styles from './NotificationsPage.module.css';

// Account inbox for durable invitation notifications
export default function NotificationsPage() {
  const { notifications, loading, error, fetchNotifications, markRead } = useNotificationStore();
  const {
    pendingInvites, error: inviteError, fetchPendingInvites, respondToInvite,
  } = useAdventureStore();

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);
  useEffect(() => { fetchPendingInvites(); }, [fetchPendingInvites]);

  const respond = async (inviteId, accepted) => {
    try {
      await respondToInvite(inviteId, accepted);
      await fetchNotifications();
    } catch {
      // the store already surfaces the failure message
    }
  };

  return (
    <section>
      <p className="eyebrow">INBOX</p>
      <h2>Notifications</h2>
      {(error || inviteError) && <p className={styles.error}>{error || inviteError}</p>}

      <h3 className={styles.sectionTitle}>Adventure invitations</h3>
      {pendingInvites.length === 0 ? (
        <p className="muted">You have no invitations waiting for an answer.</p>
      ) : (
        <div className={styles.list}>
          {pendingInvites.map((invite) => (
            <article className={`${styles.item} ${styles.invite}`} key={invite.id}>
              <div>
                <strong>{invite.adventure_name}</strong>
                <p>{invite.inviter_name} invited you to join this adventure.</p>
              </div>
              <div className={styles.inviteActions}>
                <Button type="button" onClick={() => respond(invite.id, true)}>Accept</Button>
                <Button type="button" variant="text" onClick={() => respond(invite.id, false)}>Decline</Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <h3 className={styles.sectionTitle}>Activity</h3>
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
