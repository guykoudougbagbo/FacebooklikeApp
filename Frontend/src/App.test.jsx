import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import App from './App'

afterEach(cleanup)

test('renders and responds to a click', () => {
  render(<App />)
  const button = screen.getByRole('button', { name: /count is 0/i })
  fireEvent.click(button)
  expect(screen.getByRole('button', { name: /count is 1/i })).toBeTruthy()
})
