import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import PostText from './PostText'

afterEach(cleanup)

test('web addresses become safe links; anything else stays plain text', () => {
  const { container } = render(
    <PostText text={'Lisez https://example.com/a?b=1.\nPas ceci : javascript:alert(1) ni <b>gras</b>'} />,
  )
  const links = screen.getAllByRole('link')
  expect(links).toHaveLength(1)
  expect(links[0].getAttribute('href')).toBe('https://example.com/a?b=1')
  expect(links[0].getAttribute('rel')).toBe('noopener noreferrer nofollow')
  expect(container.querySelector('b')).toBeNull()
  expect(container.textContent).toContain('\nPas ceci : javascript:alert(1) ni <b>gras</b>')
})

test('empty text renders nothing', () => {
  const { container } = render(<PostText text="" />)
  expect(container.innerHTML).toBe('')
})
