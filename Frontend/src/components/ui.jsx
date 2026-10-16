import { useId } from 'react'
import './ui.css'

export function Card({ title, children }) {
  return (
    <section className="card">
      {title && <h1 className="card__title">{title}</h1>}
      {children}
    </section>
  )
}

export function Button({ variant = 'primary', busy = false, children, ...props }) {
  return (
    <button className={`button button--${variant}`} disabled={busy || props.disabled} {...props}>
      {busy ? 'Patientez…' : children}
    </button>
  )
}

export function TextField({ label, hint, ...props }) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id} className="field__label">{label}</label>
      <input id={id} className="field__input" {...props} />
      {hint && <p className="field__hint">{hint}</p>}
    </div>
  )
}

export function ErrorMessage({ children }) {
  if (!children) return null
  return <p className="message message--error" role="alert">{children}</p>
}

export function Notice({ children }) {
  return <p className="message message--notice">{children}</p>
}

export function Loading() {
  return <p className="loading" role="status">Chargement…</p>
}
