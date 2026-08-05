import { useEffect } from 'react';
import { useAdminStore } from './adminStore';
import styles from './AdminAuditPage.module.css';

// Audit view makes privilege changes traceable to an admin and timestamp
export default function AdminAuditPage() {
  const { auditEvents, loading, error, fetchAudit } = useAdminStore();

  useEffect(() => { fetchAudit(); }, [fetchAudit]);

  return (
    <section>
      <p className="eyebrow">ADMINISTRATION</p>
      <h2>Access history</h2>
      {error && <p className={styles.error}>{error}</p>}
      {loading ? <p className="muted">Loading history...</p> : (
        <div className={styles.list}>
          {auditEvents.map((event) => (
            <article key={event.id} className={styles.event}>
              <strong>{event.previous_access_level} to {event.new_access_level}</strong>
              <span>Target: {event.target_user_id}</span>
              <span>Changed by: {event.actor_id}</span>
              <time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
