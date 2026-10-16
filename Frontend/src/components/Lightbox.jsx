import { useEffect, useRef, useState } from 'react'
import './Post.css'

export default function Lightbox({ photos, startIndex, onClose }) {
  const [index, setIndex] = useState(startIndex)
  const closeButton = useRef(null)
  const count = photos.length
  const photo = photos[index]

  useEffect(() => {
    const previousFocus = document.activeElement
    closeButton.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
      previousFocus?.focus?.()
    }
  }, [])

  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowRight') setIndex((i) => (i + 1) % count)
      if (event.key === 'ArrowLeft') setIndex((i) => (i - 1 + count) % count)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [count, onClose])

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Photo en grand" onClick={onClose}>
      <img
        className="lightbox__image"
        src={photo.full_url}
        width={photo.width}
        height={photo.height}
        alt={`Photo ${index + 1} sur ${count}`}
        onClick={(e) => e.stopPropagation()}
      />
      <button ref={closeButton} type="button" className="lightbox__button lightbox__close" onClick={onClose} aria-label="Fermer">×</button>
      {count > 1 && (
        <>
          <button
            type="button"
            className="lightbox__button lightbox__prev"
            aria-label="Photo précédente"
            onClick={(e) => { e.stopPropagation(); setIndex((i) => (i - 1 + count) % count) }}
          >‹</button>
          <button
            type="button"
            className="lightbox__button lightbox__next"
            aria-label="Photo suivante"
            onClick={(e) => { e.stopPropagation(); setIndex((i) => (i + 1) % count) }}
          >›</button>
          <p className="lightbox__counter">{index + 1} / {count}</p>
        </>
      )}
    </div>
  )
}
