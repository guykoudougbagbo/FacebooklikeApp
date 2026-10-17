import { expect, test } from 'vitest'
import { formatDate, formatDateTime, formatDuration, formatRelative, plural } from './format'

const NOW = new Date('2026-10-16T12:00:00Z').getTime()
const ago = (seconds) => new Date(NOW - seconds * 1000).toISOString()

test('recent dates read like Facebook, in French', () => {
  expect(formatRelative(ago(20), NOW)).toBe("à l'instant")
  expect(formatRelative(ago(60), NOW)).toBe('il y a 1 minute')
  expect(formatRelative(ago(5 * 60), NOW)).toBe('il y a 5 minutes')
  expect(formatRelative(ago(3600), NOW)).toBe('il y a 1 heure')
  expect(formatRelative(ago(2 * 3600), NOW)).toBe('il y a 2 heures')
  expect(formatRelative(ago(26 * 3600), NOW)).toBe('hier')
  expect(formatRelative(ago(2 * 86400), NOW)).toBe('avant-hier')
  expect(formatRelative(ago(3 * 86400), NOW)).toBe('il y a 3 jours')
})

test('older dates show the day', () => {
  expect(formatRelative('2026-09-01T10:00:00Z', NOW)).toBe('1 septembre 2026')
})

test('dates read exactly as the browser writes them in French', () => {
  const browser = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' })
  for (const date of [new Date(2026, 0, 1, 9, 5), new Date(2026, 7, 15, 23, 59), new Date(2026, 11, 31, 0, 0)]) {
    expect(formatDateTime(date)).toBe(browser.format(date))
    expect(formatDate(date)).toBe(new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(date))
  }
})

test('durations and counts', () => {
  expect(formatDuration(42)).toBe('0:42')
  expect(formatDuration(125)).toBe('2:05')
  expect(plural(1, 'abonné', 'abonnés')).toBe('1 abonné')
  expect(plural(0, 'abonné', 'abonnés')).toBe('0 abonné')
  expect(plural(3, 'abonné', 'abonnés')).toBe('3 abonnés')
})
