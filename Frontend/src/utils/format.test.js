import { expect, test } from 'vitest'
import { formatRelative } from './format'

const NOW = new Date('2026-10-16T12:00:00Z').getTime()
const ago = (seconds) => new Date(NOW - seconds * 1000).toISOString()

test('recent dates read like Facebook, in French', () => {
  expect(formatRelative(ago(20), NOW)).toBe("à l'instant")
  expect(formatRelative(ago(5 * 60), NOW)).toBe('il y a 5 minutes')
  expect(formatRelative(ago(2 * 3600), NOW)).toBe('il y a 2 heures')
  expect(formatRelative(ago(26 * 3600), NOW)).toBe('hier')
  expect(formatRelative(ago(3 * 86400), NOW)).toBe('il y a 3 jours')
})

test('older dates show the day', () => {
  expect(formatRelative('2026-09-01T10:00:00Z', NOW)).toBe('1 septembre 2026')
})
