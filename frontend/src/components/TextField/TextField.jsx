import styles from './TextField.module.css';

// Labeled input used by both login and register forms
export default function TextField({ label, ...inputProps }) {
  return (
    <label className={styles.label}>
      {label}
      <input className={styles.input} {...inputProps} />
    </label>
  );
}
