import { useAuth } from '../../hooks/useAuth';
import styles from './DashboardPage.module.css';

// Authed landing page - future Daggerheart features (characters, campaigns) mount here
export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <section className={styles.panel}>
      <p className="eyebrow">WELCOME BACK</p>
      <h2>{user.name}</h2>
      <p className="muted">{user.email}</p>
      <div className={styles.accessBox}>
        <span className={styles.statusDot} />
        <div>
          <strong>Adventure access granted</strong>
          <p className={styles.accessNote}>Role: {user.role}</p>
        </div>
      </div>
    </section>
  );
}
