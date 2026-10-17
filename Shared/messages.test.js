import { expect, test } from 'vitest'
import { describeEvent, preview, seenLabel } from './messages'

const group = { kind: 'group', read_state: { 1: 9, 2: 9, 3: 4 } }
const direct = { kind: 'direct', read_state: { 1: 9, 2: 9 } }

test('events read as grey notes, and previews say who wrote', () => {
  expect(describeEvent({ event: 'added', sender: { name: 'Awa' }, target: { name: 'Koffi' } }, group)).toBe('Awa a ajouté Koffi.')
  expect(describeEvent({ event: 'created', sender: { name: 'Awa' } }, direct)).toBeNull()
  expect(preview({ kind: 'text', body: 'Salut', sender: { id: 1, name: 'Awa' } }, group, 1)).toBe('Vous : Salut')
  expect(preview({ kind: 'text', body: 'Salut', sender: { id: 2, name: 'Koffi' } }, group, 1)).toBe('Koffi : Salut')
  expect(preview({ kind: 'text', deleted: true, sender: { id: 2 } }, direct, 1)).toBe('Message supprimé')
})

test('"Vu" for two, "Vu par N" for groups, nothing before anyone reads', () => {
  expect(seenLabel(direct, 9, 1)).toBe('Vu')
  expect(seenLabel(group, 9, 1)).toBe('Vu par 1')
  expect(seenLabel(group, 10, 1)).toBeNull()
})
