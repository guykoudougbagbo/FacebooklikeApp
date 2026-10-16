/** Test data shaped like the posts API's answers. */
export const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString()

export function photo(id, extra = {}) {
  return {
    id,
    width: 1080,
    height: 720,
    feed_url: `/media/posts/photos/${id}-feed.webp`,
    full_url: `/media/posts/photos/${id}-full.webp`,
    ...extra,
  }
}

export function publicPost(id, extra = {}) {
  return { id, body: 'Bonjour à tous', published_at: minutesAgo(5), edited_at: null, photos: [], ...extra }
}

export function adminPost(id, extra = {}) {
  return {
    ...publicPost(id),
    status: 'published',
    created_at: minutesAgo(5),
    author: 'Koffi',
    can_edit: true,
    can_delete: true,
    ...extra,
  }
}
