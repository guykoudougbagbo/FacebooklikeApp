import { render, screen, userEvent } from '@testing-library/react-native'
import { router } from 'expo-router'
import { Share } from 'react-native'
import { api } from '../api/client'
import FeedScreen from '../app/index'
import { expoPushToken, PushUnavailable } from '../notifications/push'
import { makePost, serve, summary } from '../testing/serve'

jest.mock('../api/client', () => ({ api: jest.fn(), mediaUrl: (path) => path }))
jest.mock('../notifications/push', () => {
  class PushUnavailable extends Error {}
  return { PushUnavailable, expoPushToken: jest.fn() }
})

const PAGE = { 'GET /page/': { followers: 3, following: false }, 'GET /posts/': { results: [makePost(1)], next: null } }

beforeEach(() => jest.clearAllMocks())

test('shows the page and its posts; pressing J’aime reacts', async () => {
  serve({ ...PAGE, 'POST /posts/1/reaction/': ({ kind }) => summary({ reactions: { [kind]: 1 }, my_reaction: kind }) })
  const user = userEvent.setup()
  await render(<FeedScreen />)
  expect(await screen.findByText('Publication 1')).toBeOnTheScreen()
  expect(screen.getByText(/3 abonnés/)).toBeOnTheScreen()
  await user.press(screen.getByRole('button', { name: "J'aime" }))
  expect(api).toHaveBeenCalledWith('/posts/1/reaction/', { method: 'POST', body: { kind: 'like' } })
  expect(await screen.findByLabelText('1 réaction')).toBeOnTheScreen()
  expect(screen.getByRole('button', { name: "J'aime", selected: true })).toBeOnTheScreen()
})

test('a long press offers the six reactions', async () => {
  serve({ ...PAGE, 'POST /posts/1/reaction/': ({ kind }) => summary({ reactions: { [kind]: 1 }, my_reaction: kind }) })
  const user = userEvent.setup()
  await render(<FeedScreen />)
  await user.longPress(await screen.findByRole('button', { name: "J'aime" }))
  expect(screen.getAllByRole('button', { name: /J'aime|J'adore|Haha|Waouh|Triste|Grrr/ })).toHaveLength(7)
  await user.press(screen.getByRole('button', { name: "J'adore" }))
  expect(api).toHaveBeenCalledWith('/posts/1/reaction/', { method: 'POST', body: { kind: 'love' } })
  expect(await screen.findByRole('button', { name: "J'adore", selected: true })).toBeOnTheScreen()
})

test('sharing counts only when the link was actually shared', async () => {
  serve({ ...PAGE, 'POST /posts/1/share/': summary({ shares: 1 }) })
  const share = jest.spyOn(Share, 'share').mockResolvedValueOnce({ action: Share.dismissedAction })
  const user = userEvent.setup()
  await render(<FeedScreen />)
  await user.press(await screen.findByRole('button', { name: 'Partager' }))
  expect(share).toHaveBeenCalledWith({ url: 'https://genz.test/p/1/' })
  expect(api).not.toHaveBeenCalledWith('/posts/1/share/', { method: 'POST' })
  share.mockResolvedValueOnce({ action: Share.sharedAction })
  await user.press(screen.getByRole('button', { name: 'Partager' }))
  expect(await screen.findByText('1 partage')).toBeOnTheScreen()
})

test('Commenter opens the post', async () => {
  serve(PAGE)
  const user = userEvent.setup()
  await render(<FeedScreen />)
  await user.press(await screen.findByRole('button', { name: 'Commenter' }))
  expect(router.push).toHaveBeenCalledWith('/publication/1')
})

test('following sends this phone’s notification token', async () => {
  expoPushToken.mockResolvedValue('ExponentPushToken[abc]')
  serve({ ...PAGE, 'POST /page/follow/': { followers: 4, following: true } })
  const user = userEvent.setup()
  await render(<FeedScreen />)
  await user.press(await screen.findByRole('button', { name: 'Suivre la page' }))
  expect(api).toHaveBeenCalledWith('/page/follow/', { method: 'POST', body: { expo_token: 'ExponentPushToken[abc]' } })
  expect(await screen.findByRole('button', { name: 'Ne plus suivre' })).toBeOnTheScreen()
  expect(screen.getByText(/4 abonnés/)).toBeOnTheScreen()
})

test('explains why following failed when notifications are refused', async () => {
  expoPushToken.mockRejectedValue(new PushUnavailable('Autorisez les notifications de GenZ.'))
  serve(PAGE)
  const user = userEvent.setup()
  await render(<FeedScreen />)
  await user.press(await screen.findByRole('button', { name: 'Suivre la page' }))
  expect(await screen.findByText('Autorisez les notifications de GenZ.')).toBeOnTheScreen()
  expect(api).not.toHaveBeenCalledWith('/page/follow/', expect.anything())
})

test('an empty page says posts are coming', async () => {
  serve({ ...PAGE, 'GET /posts/': { results: [], next: null } })
  await render(<FeedScreen />)
  expect(await screen.findByText('Les publications de la page apparaîtront ici très bientôt.')).toBeOnTheScreen()
})
