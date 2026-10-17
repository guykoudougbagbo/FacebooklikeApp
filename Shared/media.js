/** Items that can be shown: ready photos and videos (visitors only ever receive ready ones). */
export function readyItems(media) {
  return media.filter((item) => (item.status ?? 'ready') === 'ready' && (item.feed_url || item.video_url))
}
