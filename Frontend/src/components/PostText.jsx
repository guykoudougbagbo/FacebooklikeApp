import { splitLinks } from '@shared/links'

// Turns web addresses in the text into links.

export default function PostText({ text, plain = false }) {
  if (!text) return null
  if (plain) return <p className="post__text">{text}</p>
  return (
    <p className="post__text">
      {splitLinks(text).map((part, i) =>
        typeof part === 'string' ? part : (
          <a key={i} href={part.url} target="_blank" rel="noopener noreferrer nofollow">{part.url}</a>
        ),
      )}
    </p>
  )
}
