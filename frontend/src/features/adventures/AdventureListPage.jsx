import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../components/Button/Button';
import { useAuth } from '../../hooks/useAuth';
import { useAdventureStore } from './adventureStore';
import styles from './AdventureListPage.module.css';

// Lists only adventures the backend says this account may see
export default function AdventureListPage() {
  const {
    adventures, pendingInvites, loading, error,
    fetchAdventures, fetchPendingInvites, respondToInvite,
  } = useAdventureStore();
  const { user } = useAuth();

  useEffect(() => { fetchAdventures(); }, [fetchAdventures]);
  useEffect(() => { fetchPendingInvites(); }, [fetchPendingInvites]);

  const respond = async (inviteId, accepted) => {
    try { await respondToInvite(inviteId, accepted); } catch { /* store surfaces the error */ }
  };

  return (
    <section>
      <p className="eyebrow">ADVENTURES</p>
      <h2>Your tables</h2>
      {error && <p className={styles.error}>{error}</p>}

      {pendingInvites.length > 0 && (
        <div className={styles.invites}>
          <h3>Invitations</h3>
          {pendingInvites.map((invite) => (
            <article className={styles.invite} key={invite.id}>
              <div>
                <strong>{invite.adventure_name}</strong>
                <p className="muted">Invited by {invite.inviter_name}</p>
              </div>
              <div className={styles.inviteActions}>
                <Button type="button" onClick={() => respond(invite.id, true)}>Accept</Button>
                <Button type="button" variant="text" onClick={() => respond(invite.id, false)}>Decline</Button>
              </div>
            </article>
          ))}
        </div>
      )}

      {loading ? <p className="muted">Loading adventures...</p> : (
        <div className={styles.grid}>
          {adventures.length === 0 && <p className="muted">No adventures are available yet.</p>}
          {adventures.map((adventure) => <article className={styles.card} key={adventure.id}>
            <Link className={styles.cardLink} to={`/adventures/${adventure.id}`}>
              <h3>{adventure.name}</h3>
              <p>{adventure.description || 'No description yet.'}</p>
            </Link>
            {adventure.creator_id === user?.id && <div className={styles.cardActions}><span className={styles.ownerLabel}>Your game</span></div>}
          </article>)}
        </div>
      )}
    </section>
  );
}
