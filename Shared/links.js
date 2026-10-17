const URL_PATTERN = /https?:\/\/[^\s<>"]+/g
const TRAILING_PUNCTUATION = /[.,;:!?)\]»]+$/

/** Splits text into plain strings and { url } parts, so web addresses can be shown as links. */
export function splitLinks(text) {
  const parts = []
  let last = 0
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = match[0].replace(TRAILING_PUNCTUATION, '')
    if (match.index > last) parts.push(text.slice(last, match.index))
    parts.push({ url })
    last = match.index + url.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}
