/** Silent autoplay is skipped for people who asked for less motion or less data use. */
export function canAutoplay() {
  if (typeof IntersectionObserver === 'undefined') return false
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false
  if (navigator.connection?.saveData) return false
  return true
}

/** 42 -> "0:42", 125 -> "2:05" */
export function formatDuration(seconds) {
  const total = Math.round(seconds ?? 0)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** Items that can be shown: ready photos and videos (visitors only ever receive ready ones). */
export function readyItems(media) {
  return media.filter((item) => (item.status ?? 'ready') === 'ready' && (item.feed_url || item.video_url))
}
