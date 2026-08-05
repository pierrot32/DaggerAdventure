import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import Button from '../../components/Button/Button';
import { useAdventureStore } from './adventureStore';
import styles from './AdventureDetailPage.module.css';

// Detail page displays a private adventure and lets its creator manage invites
export default function AdventureDetailPage() {
  const { adventureId } = useParams();
  const { user } = useAuth();
  const { current, invites, loading, error, fetchAdventure, fetchInvites, invite } = useAdventureStore();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => { fetchAdventure(adventureId); }, [adventureId, fetchAdventure]);
  useEffect(() => {
    if (current?.id === adventureId && current.creator_id === user?.id) fetchInvites(adventureId);
  }, [adventureId, current, user, fetchInvites]);

  const submitInvite = async (event) => {
    event.preventDefault();
    try {
      await invite(adventureId, email);
      setEmail('');
      setMessage('Invitation created.');
    } catch {
      setMessage('The invitation could not be created.');
    }
  };

  if (loading && !current) return <p className="muted">Loading adventure...</p>;
  if (!current) return <p className={styles.error}>{error || 'Adventure not found.'}</p>;
  const isCreator = current.creator_id === user?.id;

  return (
    <section>
      <p className="eyebrow">PRIVATE ADVENTURE</p>
      <h2>{current.name}</h2>
      <p className={styles.description}>{current.description || 'No description yet.'}</p>
      {error && <p className={styles.error}>{error}</p>}
      {isCreator && (
        <div className={styles.manage}>
          <h3>Invite a player</h3>
          <form onSubmit={submitInvite} className={styles.inviteForm}>
            <input required type="email" placeholder="player@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
            <Button type="submit" disabled={loading}>Invite</Button>
          </form>
          {message && <p className="muted">{message}</p>}
          <h3>Invitations</h3>
          <ul className={styles.invites}>{invites.map((inviteItem) => <li key={inviteItem.id}><span>{inviteItem.recipient_email}</span><span>{inviteItem.status}</span></li>)}</ul>
        </div>
      )}
    </section>
  );
}
