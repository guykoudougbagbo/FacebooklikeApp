import { useEffect, useRef } from 'react'
import { canAutoplay, formatDuration } from '../utils/media'

/** A feed video: plays silently while at least half of it is on screen, like Facebook. */
export default function VideoTile({ item }) {
  const video = useRef(null)
  const autoplay = canAutoplay()

  useEffect(() => {
    const element = video.current
    if (!element || !autoplay) return undefined
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.intersectionRatio >= 0.5) element.play().catch(() => {})
      else element.pause()
    }, { threshold: [0, 0.5] })
    observer.observe(element)
    return () => observer.disconnect()
  }, [autoplay])

  return (
    <>
      <video
        ref={video}
        src={item.video_url}
        poster={item.poster_url}
        muted
        loop
        playsInline
        preload={autoplay ? 'metadata' : 'none'}
        aria-hidden="true"
      />
      <span className="media-grid__play" aria-hidden="true">▶</span>
      <span className="media-grid__duration">{formatDuration(item.duration_seconds)}</span>
    </>
  )
}
