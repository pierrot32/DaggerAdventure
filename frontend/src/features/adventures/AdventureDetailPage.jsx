import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import Button from '../../components/Button/Button';
import { useAdventureStore } from './adventureStore';
import { listAdventureCharacters } from './adventureApi';
import styles from './AdventureDetailPage.module.css';

// Detail page displays a private adventure and lets its creator manage invites
export default function AdventureDetailPage() {
  const { adventureId } = useParams();
  const { user } = useAuth();
  const { current, invites, loading, error, fetchAdventure, fetchInvites, invite, setFear } = useAdventureStore();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [characters, setCharacters] = useState([]);

  useEffect(() => { fetchAdventure(adventureId); }, [adventureId, fetchAdventure]);
  useEffect(() => {
    if (current?.id === adventureId && current.creator_id === user?.id) fetchInvites(adventureId);
  }, [adventureId, current, user, fetchInvites]);
  useEffect(() => {
    if (current?.id === adventureId && current.creator_id === user?.id) {
      listAdventureCharacters(adventureId).then(setCharacters).catch(() => setCharacters([]));
    }
  }, [adventureId, current, user]);

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
          <h3>Fear pool</h3>
          <div className={styles.fear}>
            {Array.from({ length: 12 }, (_, index) => (
              <button
                type="button"
                key={index}
                className={index < (current.fear || 0) ? styles.fearFilled : styles.fearSlot}
                aria-label={`Set Fear to ${index + 1}`}
                onClick={() => setFear(adventureId, index + 1 === current.fear ? index : index + 1)}
              />
            ))}
            <span className={styles.fearValue}>{current.fear || 0} / 12</span>
          </div>

          <h3>Invite a player</h3>
          <form onSubmit={submitInvite} className={styles.inviteForm}>
            <input required type="email" placeholder="player@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
            <Button type="submit" disabled={loading}>Invite</Button>
          </form>
          {message && <p className="muted">{message}</p>}
          <h3>Invitations</h3>
          <ul className={styles.invites}>{invites.map((inviteItem) => <li key={inviteItem.id}><span>{inviteItem.recipient_email}</span><span>{inviteItem.status}</span></li>)}</ul>
          <h3>Player characters</h3>
          <div className={styles.characters}>{characters.map((character) => <Link to={`/characters/${character.id}`} key={character.id}><strong>{character.name}</strong><span>Level {character.level} · {character.class_id} · player {character.user_id.slice(0, 8)}</span></Link>)}</div>
        </div>
      )}
    </section>
  );
}
