/** 42 -> "0:42", 125 -> "2:05" */
export function formatDuration(seconds) {
  const total = Math.round(seconds ?? 0)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** Items that can be shown: ready photos and videos (visitors only ever receive ready ones). */
export function readyItems(media) {
  return media.filter((item) => (item.status ?? 'ready') === 'ready' && (item.feed_url || item.video_url))
}
