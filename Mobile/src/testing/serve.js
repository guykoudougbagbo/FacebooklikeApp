import { api } from '../api/client'

/** Makes a mocked request function answer from a table like { 'GET /posts/': {...}, 'POST /x/': (body) => {...} }. */
export function serveWith(mocked) {
  return (routes) => mocked.mockImplementation(async (path, { method = 'GET', body } = {}) => {
    const answer = routes[`${method} ${path}`]
    if (answer === undefined) throw new Error(`Unexpected request ${method} ${path}`)
    if (answer instanceof Error) throw answer
    return typeof answer === 'function' ? answer(body) : answer
  })
}

/** The same for the visitor api(). */
export const serve = (routes) => serveWith(api)(routes)

export function makePost(id, extra = {}) {
  return {
    id,
    body: `Publication ${id}`,
    published_at: new Date().toISOString(),
    edited_at: null,
    media: [],
    comments_enabled: true,
    interactions: { reactions: {}, comments: 0, shares: 0, my_reaction: null },
    ...extra,
  }
}

export const summary = (extra = {}) => ({ reactions: {}, comments: 0, shares: 0, my_reaction: null, ...extra })
