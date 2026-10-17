// Turns web addresses in the text into links.
const URL_PATTERN = /https?:\/\/[^\s<>"]+/g
const TRAILING_PUNCTUATION = /[.,;:!?)\]»]+$/

function split(text) {
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

export default function PostText({ text, plain = false }) {
  if (!text) return null
  if (plain) return <p className="post__text">{text}</p>
  return (
    <p className="post__text">
      {split(text).map((part, i) =>
        typeof part === 'string' ? part : (
          <a key={i} href={part.url} target="_blank" rel="noopener noreferrer nofollow">{part.url}</a>
        ),
      )}
    </p>
  )
}
