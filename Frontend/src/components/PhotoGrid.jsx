import { useState } from 'react'
import Lightbox from './Lightbox'
import './Post.css'

const MAX_TILES = 5

/** Like Facebook: a single photo spans the full width; very tall ones are trimmed to 4:5. */
function singleShape({ width, height }) {
  return width / height < 4 / 5 ? '4 / 5' : `${width} / ${height}`
}

export default function PhotoGrid({ photos }) {
  const [openAt, setOpenAt] = useState(null)
  if (!photos.length) return null

  const tiles = photos.slice(0, MAX_TILES)
  const hidden = photos.length - tiles.length
  const single = photos.length === 1 ? photos[0] : null

  return (
    <>
      <div className={`photo-grid photo-grid--${Math.min(photos.length, MAX_TILES)}`}>
        {tiles.map((photo, i) => (
          <button
            key={photo.id}
            type="button"
            className="photo-grid__tile"
            onClick={() => setOpenAt(i)}
            aria-label={`Agrandir la photo ${i + 1} sur ${photos.length}`}
            style={single ? { aspectRatio: singleShape(single) } : undefined}
          >
            <img src={photo.feed_url} alt="" loading="lazy" decoding="async" />
            {hidden > 0 && i === tiles.length - 1 && <span className="photo-grid__more">+{hidden}</span>}
          </button>
        ))}
      </div>
      {openAt !== null && <Lightbox photos={photos} startIndex={openAt} onClose={() => setOpenAt(null)} />}
    </>
  )
}
