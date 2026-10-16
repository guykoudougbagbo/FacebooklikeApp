import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import Header from './Header'

afterEach(cleanup)

test('shows the logo as a link to the home page', () => {
  render(<Header />)
  const logo = screen.getByRole('img', { name: 'GenZ – La génération qui dit non' })
  expect(logo.getAttribute('src')).toMatch(/genz-logo/)
  expect(logo.closest('a').getAttribute('href')).toBe('/')
})
