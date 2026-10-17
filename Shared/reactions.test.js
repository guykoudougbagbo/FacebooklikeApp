import { expect, test } from 'vitest'
import { topReactions } from './reactions'

test('the three most used reactions come first, with the total', () => {
  const { top, total } = topReactions({ like: 2, love: 5, haha: 1, wow: 3, sad: 0 })
  expect(top.map((r) => r.kind)).toEqual(['love', 'wow', 'like'])
  expect(total).toBe(11)
  expect(topReactions(undefined)).toEqual({ top: [], total: 0 })
})
