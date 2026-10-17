import { expect, test } from 'vitest'
import { splitLinks } from './links'

test('web addresses become link parts, without the punctuation after them', () => {
  expect(splitLinks('Voir https://genz.example/a, puis (http://x.example).')).toEqual([
    'Voir ', { url: 'https://genz.example/a' }, ', puis (', { url: 'http://x.example' }, ').',
  ])
  expect(splitLinks('Rien ici')).toEqual(['Rien ici'])
})
