import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { photo, video } from '../test/posts'
import MediaGrid from './MediaGrid'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** A fake IntersectionObserver the test can drive. */
function fakeObserver() {
  const observers = []
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback) { this.callback = callback; observers.push(this) }
    observe(element) { this.element = element }
    disconnect() {}
  })
  return (ratio) => observers.forEach((o) => o.callback([{ intersectionRatio: ratio, target: o.element }]))
}

beforeEach(() => {
  window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve())
  window.HTMLMediaElement.prototype.pause = vi.fn()
})

test('shows at most five tiles, with the rest counted on the last one', () => {
  render(<MediaGrid items={[1, 2, 3, 4, 5, 6, 7].map((id) => photo(id))} />)
  expect(screen.getAllByRole('button', { name: /Agrandir la photo/ })).toHaveLength(5)
  expect(screen.getByText('+2')).toBeTruthy()
})

test('a single item keeps its own shape, but very tall ones are trimmed to 4:5', () => {
  render(<MediaGrid items={[photo(1, { width: 1600, height: 900 })]} />)
  expect(screen.getByRole('button', { name: 'Agrandir la photo 1 sur 1' }).style.aspectRatio).toBe('1600 / 900')
  cleanup()
  render(<MediaGrid items={[video(2, { width: 1080, height: 1920 })]} />)
  expect(screen.getByRole('button', { name: 'Lire la vidéo 1 sur 1' }).style.aspectRatio).toBe('4 / 5')
})

test('the full-screen viewer opens on the tapped item and moves with buttons and keys', async () => {
  render(<MediaGrid items={[photo(1), video(2), photo(3)]} />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Agrandir la photo 1 sur 3' }))

  const viewer = screen.getByRole('dialog', { name: 'Photo ou vidéo en grand' })
  expect(within(viewer).getByRole('img').getAttribute('src')).toBe('/media/posts/photos/1-full.webp')
  expect(document.activeElement).toBe(within(viewer).getByRole('button', { name: 'Fermer' }))

  await user.click(within(viewer).getByRole('button', { name: 'Suivant' }))
  const player = viewer.querySelector('video')
  expect(player.getAttribute('src')).toBe('/media/posts/videos/2.mp4')
  expect(player.controls).toBe(true)
  expect(player.muted).toBe(false)
  expect(within(viewer).getByText('2 / 3')).toBeTruthy()
  await user.keyboard('{ArrowLeft}')
  expect(within(viewer).getByText('1 / 3')).toBeTruthy()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('feed videos play silently while half on screen and pause when scrolled away', () => {
  window.matchMedia = vi.fn(() => ({ matches: false }))
  const scroll = fakeObserver()
  render(<MediaGrid items={[video(1)]} />)
  const player = document.querySelector('video')
  expect(player.muted).toBe(true)
  expect(player.getAttribute('preload')).toBe('metadata')
  scroll(0.6)
  expect(player.play).toHaveBeenCalled()
  scroll(0.2)
  expect(player.pause).toHaveBeenCalled()
})

test('no autoplay for people who asked for less motion', () => {
  window.matchMedia = vi.fn((query) => ({ matches: query.includes('reduce') }))
  const scroll = fakeObserver()
  render(<MediaGrid items={[video(1)]} />)
  const player = document.querySelector('video')
  expect(player.getAttribute('preload')).toBe('none')
  scroll(1)
  expect(player.play).not.toHaveBeenCalled()
})

test('no autoplay when the phone is saving data', () => {
  window.matchMedia = vi.fn(() => ({ matches: false }))
  vi.stubGlobal('navigator', { ...navigator, connection: { saveData: true } })
  const scroll = fakeObserver()
  render(<MediaGrid items={[video(1)]} />)
  scroll(1)
  expect(document.querySelector('video').play).not.toHaveBeenCalled()
})
