import { formatDuration } from '../utils/media'

/** A feed video before it's played: its cover, a play button and its length. Nothing downloads until pressed. */
export default function VideoTile({ item }) {
  return (
    <>
      <img src={item.poster_url} alt="" loading="lazy" decoding="async" />
      <span className="media-grid__play" aria-hidden="true">▶</span>
      <span className="media-grid__duration">{formatDuration(item.duration_seconds)}</span>
    </>
  )
}
