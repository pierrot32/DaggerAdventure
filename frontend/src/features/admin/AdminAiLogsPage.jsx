import { useEffect, useState } from 'react';
import { listAiLogs } from './adminApi';
import styles from './AdminAiLogsPage.module.css';

export default function AdminAiLogsPage() {
  const [logs, setLogs] = useState([]);
  const [state, setState] = useState({ loading: true, error: '' });

  useEffect(() => {
    listAiLogs()
      .then((items) => {
        setLogs(items);
        setState({ loading: false, error: '' });
      })
      .catch((error) => setState({ loading: false, error: error.message }));
  }, []);

  return (
    <section>
      <p className="eyebrow">ADMINISTRATION / AI LAB</p>
      <h2>Generation log</h2>
      <p className="muted">Review the compact requests and answers sent through the character generator.</p>
      {state.error && <p className={styles.error} role="alert">{state.error}</p>}
      {state.loading ? <p className="muted">Loading generation history...</p> : (
        <div className={styles.list}>
          {logs.length === 0 && <p className="muted">No generation requests yet.</p>}
          {logs.map((log) => (
            <details key={log.id} className={styles.entry}>
              <summary>
                <span><strong>{log.generation_type.replace('_', ' ')}</strong><small>{log.user_email}</small></span>
                <time dateTime={log.created_at}>{new Date(log.created_at).toLocaleString()}</time>
              </summary>
              <div className={styles.payloads}>
                <div><p className="eyebrow">REQUEST SENT</p><pre>{log.prompt}</pre></div>
                <div><p className="eyebrow">ANSWER RECEIVED</p><pre>{log.response}</pre></div>
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}