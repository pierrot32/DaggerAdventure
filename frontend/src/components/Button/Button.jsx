import styles from './Button.module.css';

// Generic button, variant switches between filled/text styles used across auth forms
export default function Button({ variant = 'primary', className = '', ...props }) {
  const variantClass = variant === 'text' ? styles.text : styles.primary;
  return <button className={`${variantClass} ${className}`} {...props} />;
}
