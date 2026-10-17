import { expect, test } from 'vitest'
import { errorMessage, nextPagePath } from './api'

test('errors become French messages', () => {
  expect(errorMessage(400, { detail: 'Code incorrect.' })).toBe('Code incorrect.')
  expect(errorMessage(400, { email: ['Adresse invalide.'] })).toBe('Adresse invalide.')
  expect(errorMessage(429, { detail: 'Request was throttled.' })).toMatch('Trop de tentatives')
  expect(errorMessage(503, null)).toBe('Le serveur ne répond pas. Réessayez dans un instant.')
  expect(errorMessage(500, null)).toBe('Une erreur est survenue. Réessayez.')
})

test('keeps only the cursor from the next link', () => {
  expect(nextPagePath('/admin/admins/', 'http://other-host/api/admin/admins/?cursor=cD0x')).toBe('/admin/admins/?cursor=cD0x')
  expect(nextPagePath('/posts/', 'https://x/api/posts/?page_size=5&cursor=cD0yMDI2LTEwLTE2KzEyJTNBMDA%3D')).toBe(
    '/posts/?cursor=cD0yMDI2LTEwLTE2KzEyJTNBMDA%3D',
  )
  expect(nextPagePath('/admin/admins/', null)).toBeNull()
  expect(nextPagePath('/admin/admins/', 'https://x/api/admin/admins/')).toBeNull()
})
