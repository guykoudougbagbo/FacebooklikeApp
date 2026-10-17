import { useState } from 'react'
import Lightbox from './Lightbox'
import VideoTile from './VideoTile'
import './Post.css'

const MAX_TILES = 5

/** Like Facebook: a single item spans the full width; very tall ones are trimmed to 4:5. */
function singleShape({ width, height }) {
  return width / height < 4 / 5 ? '4 / 5' : `${width} / ${height}`
}

function label(item, index, count) {
  return item.kind === 'video'
    ? `Lire la vidéo ${index + 1} sur ${count}`
    : `Agrandir la photo ${index + 1} sur ${count}`
}

export default function MediaGrid({ items }) {
  const [openAt, setOpenAt] = useState(null)
  if (!items.length) return null

  const tiles = items.slice(0, MAX_TILES)
  const hidden = items.length - tiles.length
  const single = items.length === 1 ? items[0] : null

  return (
    <>
      <div className={`media-grid media-grid--${Math.min(items.length, MAX_TILES)}`}>
        {tiles.map((item, i) => (
          <button
            key={item.id}
            type="button"
            className="media-grid__tile"
            onClick={() => setOpenAt(i)}
            aria-label={label(item, i, items.length)}
            style={single ? { aspectRatio: singleShape(single) } : undefined}
          >
            {item.kind === 'video'
              ? <VideoTile item={item} />
              : <img src={item.feed_url} alt="" loading="lazy" decoding="async" />}
            {hidden > 0 && i === tiles.length - 1 && <span className="media-grid__more">+{hidden}</span>}
          </button>
        ))}
      </div>
      {openAt !== null && <Lightbox items={items} startIndex={openAt} onClose={() => setOpenAt(null)} />}
    </>
  )
}
