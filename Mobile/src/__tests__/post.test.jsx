import { render, screen, userEvent } from '@testing-library/react-native'
import { useLocalSearchParams } from 'expo-router'
import { api } from '../api/client'
import PostScreen from '../app/publication/[id]'
import { makePost, serve } from '../testing/serve'

jest.mock('../api/client', () => ({ api: jest.fn(), mediaUrl: (path) => path }))
jest.mock('../notifications/push', () => ({ expoPushToken: jest.fn() }))

const now = new Date().toISOString()
const comment = (id, body) => ({ id, name: 'Awa', body, is_page: false, created_at: now })

beforeEach(() => {
  jest.clearAllMocks()
  useLocalSearchParams.mockReturnValue({ id: '7' })
})

test('shows the post with its comments, oldest first, and adds a new one', async () => {
  serve({
    'GET /posts/7/': makePost(7, { interactions: { reactions: {}, comments: 2, shares: 0, my_reaction: null } }),
    'GET /posts/7/comments/': { results: [comment(2, 'Deuxième'), comment(1, 'Premier')], next: null },
    'POST /posts/7/comments/': ({ name, body }) => ({ ...comment(3, body), name }),
  })
  const user = userEvent.setup()
  await render(<PostScreen />)
  expect(await screen.findByText('Publication 7')).toBeOnTheScreen()
  expect(screen.getAllByText(/^(Premier|Deuxième)$/).map((node) => node.props.children)).toEqual(['Premier', 'Deuxième'])
  await user.type(screen.getByLabelText('Votre nom'), 'Moussa')
  await user.type(screen.getByLabelText('Votre commentaire'), 'Bravo')
  await user.press(screen.getByRole('button', { name: 'Publier le commentaire' }))
  expect(api).toHaveBeenCalledWith('/posts/7/comments/', { method: 'POST', body: { name: 'Moussa', body: 'Bravo' } })
  expect(await screen.findByText('Bravo')).toBeOnTheScreen()
  expect(screen.getByText('3 commentaires')).toBeOnTheScreen()
})

test('older comments load on request', async () => {
  serve({
    'GET /posts/7/': makePost(7),
    'GET /posts/7/comments/': { results: [comment(1, 'Premier')], next: 'https://api.test/api/posts/7/comments/?cursor=abc' },
    'GET /posts/7/comments/?cursor=abc': { results: [comment(2, 'Suivant')], next: null },
  })
  const user = userEvent.setup()
  await render(<PostScreen />)
  await user.press(await screen.findByRole('button', { name: 'Voir plus de commentaires' }))
  expect(await screen.findByText('Suivant')).toBeOnTheScreen()
})

test('no form when comments are off', async () => {
  serve({ 'GET /posts/7/': makePost(7, { comments_enabled: false }), 'GET /posts/7/comments/': { results: [], next: null } })
  await render(<PostScreen />)
  expect(await screen.findByText('Les commentaires sont désactivés pour cette publication.')).toBeOnTheScreen()
  expect(screen.queryByLabelText('Votre commentaire')).not.toBeOnTheScreen()
})

test('a link that isn’t a post number asks the server nothing', async () => {
  useLocalSearchParams.mockReturnValue({ id: '7/../../admin' })
  await render(<PostScreen />)
  expect(screen.getByText('Publication introuvable.')).toBeOnTheScreen()
  expect(api).not.toHaveBeenCalled()
})

test('links in visitors’ comments are not clickable', async () => {
  serve({
    'GET /posts/7/': makePost(7, { body: 'Voir https://genz.example/a' }),
    'GET /posts/7/comments/': { results: [comment(1, 'Allez sur https://evil.example')], next: null },
  })
  await render(<PostScreen />)
  expect(await screen.findByText('Allez sur https://evil.example')).toBeOnTheScreen()
  expect(screen.getAllByRole('link').map((node) => node.props.children)).toEqual(['https://genz.example/a'])
})
