import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { photo, video } from '../test/posts'
import MediaGrid from './MediaGrid'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
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
  // Reached with the arrows, not by pressing its play button: it waits.
  expect(player.autoplay).toBe(false)
  expect(within(viewer).getByText('2 / 3')).toBeTruthy()
  await user.keyboard('{ArrowLeft}')
  expect(within(viewer).getByText('1 / 3')).toBeTruthy()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('feed videos never start by themselves: only the cover shows until play is pressed', () => {
  render(<MediaGrid items={[video(1)]} />)
  const tile = screen.getByRole('button', { name: 'Lire la vidéo 1 sur 1' })
  expect(tile.querySelector('video')).toBeNull()
  expect(tile.querySelector('img').getAttribute('src')).toBe('/media/posts/videos/1-poster.webp')
  expect(within(tile).getByText('0:42')).toBeTruthy()
})

test('pressing play starts that video with sound and controls', async () => {
  render(<MediaGrid items={[video(1)]} />)
  await userEvent.setup().click(screen.getByRole('button', { name: 'Lire la vidéo 1 sur 1' }))
  const player = screen.getByRole('dialog').querySelector('video')
  expect(player.autoplay).toBe(true)
  expect(player.muted).toBe(false)
  expect(player.controls).toBe(true)
})
