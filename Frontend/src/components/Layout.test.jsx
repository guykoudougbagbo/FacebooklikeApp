import { screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { loggedOut, mockApi, renderApp } from '../test/renderApp'

test.each(['/', '/connexion'])('the logo background is on %s and hidden from screen readers', async (path) => {
  mockApi(loggedOut)
  renderApp(path)
  await screen.findAllByRole('heading')
  const backdrop = document.querySelector('.page-backdrop')
  expect(backdrop).not.toBeNull()
  expect(backdrop.getAttribute('aria-hidden')).toBe('true')
  expect(backdrop.childElementCount).toBe(0)
})
