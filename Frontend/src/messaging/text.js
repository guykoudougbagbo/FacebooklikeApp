/** French sentences for conversation events, like Messenger's grey notes. */
export function describeEvent(message, conversation) {
  const actor = message.sender?.name ?? 'Quelqu’un'
  const target = message.target?.name ?? 'quelqu’un'
  switch (message.event) {
    case 'created':
      return conversation.kind === 'group' ? `${actor} a créé le groupe.` : null
    case 'added':
      return `${actor} a ajouté ${target}.`
    case 'removed':
      return `${actor} a retiré ${target} du groupe.`
    case 'left':
      return `${target} a quitté le groupe.`
    case 'renamed':
      return `${actor} a renommé le groupe « ${message.body} ».`
    default:
      return null
  }
}

/** The one-line preview shown in the conversation list. */
export function preview(message, conversation, myId) {
  if (!message) return ''
  if (message.kind === 'event') return describeEvent(message, conversation) ?? ''
  if (message.deleted) return 'Message supprimé'
  const prefix = message.sender?.id === myId ? 'Vous : ' : conversation.kind === 'group' ? `${message.sender?.name} : ` : ''
  return prefix + message.body
}

/** "Vu" for one-on-one conversations, "Vu par 3" for groups, or null when nobody else has read it yet. */
export function seenLabel(conversation, messageId, myId) {
  const others = Object.entries(conversation.read_state ?? {}).filter(([userId]) => Number(userId) !== myId)
  const seen = others.filter(([, lastRead]) => (lastRead ?? 0) >= messageId).length
  if (!seen) return null
  return conversation.kind === 'group' ? `Vu par ${seen}` : 'Vu'
}
