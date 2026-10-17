/** Test data shaped like the posts API's answers. */
export const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString()

export function photo(id, extra = {}) {
  return {
    id,
    kind: 'photo',
    width: 1080,
    height: 720,
    feed_url: `/media/posts/photos/${id}-feed.webp`,
    full_url: `/media/posts/photos/${id}-full.webp`,
    ...extra,
  }
}

export function video(id, extra = {}) {
  return {
    id,
    kind: 'video',
    width: 1080,
    height: 1920,
    feed_url: null,
    full_url: null,
    video_url: `/media/posts/videos/${id}.mp4`,
    poster_url: `/media/posts/videos/${id}-poster.webp`,
    duration_seconds: 42.4,
    ...extra,
  }
}

export const noInteractions = () => ({ reactions: {}, comments: 0, shares: 0, my_reaction: null })

export function publicPost(id, extra = {}) {
  return {
    id, body: 'Bonjour à tous', published_at: minutesAgo(5), edited_at: null, media: [],
    comments_enabled: true, interactions: noInteractions(), ...extra,
  }
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
