import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test } from 'vitest'
import { photo } from '../test/posts'
import PhotoGrid from './PhotoGrid'

afterEach(cleanup)

test('shows at most five tiles, with the rest counted on the last one', () => {
  render(<PhotoGrid photos={[1, 2, 3, 4, 5, 6, 7].map((id) => photo(id))} />)
  expect(screen.getAllByRole('button', { name: /Agrandir la photo/ })).toHaveLength(5)
  expect(screen.getByText('+2')).toBeTruthy()
})

test('a single photo keeps its own shape, but very tall ones are trimmed to 4:5', () => {
  render(<PhotoGrid photos={[photo(1, { width: 1600, height: 900 })]} />)
  expect(screen.getByRole('button', { name: 'Agrandir la photo 1 sur 1' }).style.aspectRatio).toBe('1600 / 900')
  cleanup()
  render(<PhotoGrid photos={[photo(2, { width: 1365, height: 2048 })]} />)
  expect(screen.getByRole('button', { name: 'Agrandir la photo 1 sur 1' }).style.aspectRatio).toBe('4 / 5')
})

test('the full-screen viewer opens on the tapped photo and moves with buttons and keys', async () => {
  render(<PhotoGrid photos={[1, 2, 3].map((id) => photo(id))} />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Agrandir la photo 2 sur 3' }))

  const viewer = screen.getByRole('dialog', { name: 'Photo en grand' })
  expect(within(viewer).getByRole('img').getAttribute('src')).toBe('/media/posts/photos/2-full.webp')
  expect(within(viewer).getByText('2 / 3')).toBeTruthy()
  expect(document.activeElement).toBe(within(viewer).getByRole('button', { name: 'Fermer' }))

  await user.click(within(viewer).getByRole('button', { name: 'Photo suivante' }))
  expect(within(viewer).getByText('3 / 3')).toBeTruthy()
  await user.keyboard('{ArrowRight}')
  expect(within(viewer).getByText('1 / 3')).toBeTruthy()
  await user.keyboard('{ArrowLeft}')
  expect(within(viewer).getByText('3 / 3')).toBeTruthy()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).toBeNull()
})
