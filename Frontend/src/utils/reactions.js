/** Facebook's six reactions, with Facebook's French names. */
export const REACTIONS = [
  { kind: 'like', emoji: '👍', label: "J'aime" },
  { kind: 'love', emoji: '❤️', label: "J'adore" },
  { kind: 'haha', emoji: '😂', label: 'Haha' },
  { kind: 'wow', emoji: '😮', label: 'Waouh' },
  { kind: 'sad', emoji: '😢', label: 'Triste' },
  { kind: 'angry', emoji: '😡', label: 'Grrr' },
]

export const REACTION_BY_KIND = Object.fromEntries(REACTIONS.map((r) => [r.kind, r]))

/** The most used reactions first (at most three) and the total. */
export function topReactions(counts) {
  const entries = Object.entries(counts ?? {}).filter(([, n]) => n > 0)
  const total = entries.reduce((sum, [, n]) => sum + n, 0)
  const top = entries.sort((a, b) => b[1] - a[1]).slice(0, 3).map(([kind]) => REACTION_BY_KIND[kind]).filter(Boolean)
  return { top, total }
}

export function plural(count, one, many) {
  return `${count} ${count > 1 ? many : one}`
}
