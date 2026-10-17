import { expect, test } from 'vitest'
import { describeActivity, inviteUrl } from './team'

test('invite links keep the token out of the address the server sees', () => {
  expect(inviteUrl('https://genz.example', 'abc')).toBe('https://genz.example/invitation#abc')
})

test('activity lines are French sentences, with a fallback for new kinds', () => {
  expect(describeActivity({ action: 'admin_removed', actor: 'Awa', target: 'Koffi' })).toBe('Awa a retiré Koffi des administrateurs.')
  expect(describeActivity({ action: 'something_new', actor: 'Awa' })).toBe('Awa a effectué une action.')
})
