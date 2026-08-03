import { useEffect, useState } from 'react';

export default function App() {
  const [message, setMessage] = useState('Loading...');

  useEffect(() => {
    // Fetches from relative path; Kubernetes Ingress handles the routing
    fetch('/api/hello')
      .then(res => res.json())
      .then(data => setMessage(data.message))
      .catch(() => setMessage('Error connecting to Rust backend'));
  }, []);

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>MyDaggerHeartAdventure</h1>
      <p>Backend Status: <strong>{message}</strong></p>
    </div>
  );
}