import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { adminPost, photo, publicPost } from '../test/posts'
import { ADMIN, loggedInAs, loggedOut, mockApi, page, renderApp } from '../test/renderApp'

const file = (name) => new File(['img'], name, { type: 'image/jpeg' })

test('visitors see the page as the author, with dates, links and photos, and nothing to edit', async () => {
  mockApi({
    ...loggedOut,
    'GET /posts/': page([publicPost(1, { body: 'Infos : https://example.com', photos: [photo(11), photo(12)] })]),
  })
  renderApp('/')
  const post = await screen.findByRole('article', { name: 'Publication de GenZ' })
  expect(within(post).getByText('GenZ')).toBeTruthy()
  expect(within(post).getByText('il y a 5 minutes')).toBeTruthy()
  expect(within(post).getByRole('link', { name: 'https://example.com' })).toBeTruthy()
  expect(within(post).getAllByRole('button', { name: /Agrandir la photo/ })).toHaveLength(2)
  expect(within(post).queryByText(/Publié par/)).toBeNull()
  expect(screen.queryByRole('button', { name: 'Modifier' })).toBeNull()
  expect(screen.queryByLabelText('Texte de la publication')).toBeNull()
})

test('an empty page shows a welcome message', async () => {
  mockApi(loggedOut)
  renderApp('/')
  expect(await screen.findByRole('heading', { name: 'Bienvenue' })).toBeTruthy()
})

test('an admin writes a post with photos, removes one before sending, and sees it at the top', async () => {
  const calls = mockApi({
    ...loggedInAs(ADMIN),
    'GET /admin/posts/': page([adminPost(1, { body: 'Ancienne publication' })]),
    'POST /admin/posts/': { status: 201, body: adminPost(2, { body: 'Nouvelle publication', status: 'processing', photos: [{ id: 21, status: 'pending', feed_url: null, full_url: null, width: null, height: null }] }) },
  })
  renderApp('/')
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Texte de la publication'), 'Nouvelle publication')
  await user.upload(screen.getByTestId('photo-input'), [file('a.jpg'), file('b.jpg')])
  await user.click(screen.getByRole('button', { name: 'Enlever a.jpg' }))
  await user.click(screen.getByRole('button', { name: 'Publier' }))

  const sent = calls.find((c) => c.method === 'POST' && c.path === '/admin/posts/').body
  expect(sent.body).toEqual(['Nouvelle publication'])
  expect(sent.photos.map((f) => f.name)).toEqual(['b.jpg'])

  const posts = await screen.findAllByRole('article', { name: 'Publication de GenZ' })
  expect(within(posts[0]).getByText('Nouvelle publication')).toBeTruthy()
  expect(within(posts[0]).getByText(/Publication en cours/)).toBeTruthy()
  expect(within(posts[0]).getByText('Publié par Koffi')).toBeTruthy()
  expect(screen.getByLabelText('Texte de la publication').value).toBe('')
})

test('a refused post shows why and keeps what was typed', async () => {
  mockApi({ ...loggedInAs(ADMIN), 'POST /admin/posts/': { status: 400, body: { detail: 'Écrivez un texte ou ajoutez au moins une photo.' } } })
  renderApp('/')
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Texte de la publication'), '   ')
  await user.click(screen.getByRole('button', { name: 'Publier' }))
  expect((await screen.findByRole('alert')).textContent).toBe('Écrivez un texte ou ajoutez au moins une photo.')
})

test('the author edits text and removes a photo', async () => {
  const calls = mockApi({
    ...loggedInAs(ADMIN),
    'GET /admin/posts/': page([adminPost(1, { body: 'Avant', photos: [photo(11, { status: 'ready' }), photo(12, { status: 'ready' })] })]),
    'PATCH /admin/posts/1/': { body: adminPost(1, { body: 'Après', edited_at: new Date().toISOString(), photos: [photo(12, { status: 'ready' })] }) },
  })
  renderApp('/')
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Modifier' }))
  const post = screen.getByRole('article')
  const text = within(post).getByLabelText('Texte de la publication')
  await user.clear(text)
  await user.type(text, 'Après')
  await user.click(within(post).getByRole('button', { name: 'Retirer la photo 1' }))
  await user.click(within(post).getByRole('button', { name: 'Enregistrer' }))

  const sent = calls.find((c) => c.method === 'PATCH').body
  expect(sent).toEqual({ body: ['Après'], remove_photo_ids: ['11'] })
  expect(await within(post).findByText('Après')).toBeTruthy()
  expect(within(post).getByText(/modifiée/)).toBeTruthy()
  expect(within(post).getAllByRole('button', { name: /Agrandir la photo/ })).toHaveLength(1)
})

test('deleting asks first, then removes the post', async () => {
  const calls = mockApi({
    ...loggedInAs(ADMIN),
    'GET /admin/posts/': page([adminPost(1, { body: 'À supprimer' })]),
    'DELETE /admin/posts/1/': { status: 204 },
  })
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
  renderApp('/')
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Supprimer' }))
  expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
  await user.click(screen.getByRole('button', { name: 'Supprimer' }))
  expect(confirm).toHaveBeenCalledTimes(2)
  expect(await screen.findByRole('heading', { name: 'Bienvenue' })).toBeTruthy()
})

test('buttons follow what each admin may do', async () => {
  mockApi({
    ...loggedInAs(ADMIN),
    'GET /admin/posts/': page([
      adminPost(1, { body: 'De quelqu’un d’autre', author: 'Awa', can_edit: false, can_delete: false }),
      adminPost(2, { body: 'Supprimable seulement', can_edit: false, can_delete: true }),
    ]),
  })
  renderApp('/')
  const [first, second] = await screen.findAllByRole('article')
  expect(within(first).queryByRole('button', { name: /Modifier|Supprimer/ })).toBeNull()
  expect(within(first).getByText('Publié par Awa')).toBeTruthy()
  expect(within(second).queryByRole('button', { name: 'Modifier' })).toBeNull()
  expect(within(second).getByRole('button', { name: 'Supprimer' })).toBeTruthy()
})

test('a post being prepared refreshes by itself until its photos are ready', async () => {
  // Only the refresh timer is faked; reading the fake server's answers still uses real timers.
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] })
  try {
    const pending = { id: 11, status: 'pending', feed_url: null, full_url: null, width: null, height: null }
    let ready = false
    const calls = mockApi({
      ...loggedInAs(ADMIN),
      'GET /admin/posts/': page([adminPost(1, { body: 'Photos', status: 'processing', photos: [pending] })]),
      'GET /admin/posts/1/': () => ({ body: ready
        ? adminPost(1, { body: 'Photos', photos: [photo(11, { status: 'ready' })] })
        : adminPost(1, { body: 'Photos', status: 'processing', photos: [pending] }) }),
    })
    const checks = () => calls.filter((c) => c.path === '/admin/posts/1/').length
    renderApp('/')
    expect(await screen.findByText(/Publication en cours/)).toBeTruthy()

    // React applies each answer a moment later, so the clock moves in small steps until the check happens.
    const advanceUntil = (count) => vi.waitFor(async () => {
      await vi.advanceTimersByTimeAsync(500)
      expect(checks()).toBe(count)
    })
    await advanceUntil(1)
    expect(screen.getByText(/Publication en cours/)).toBeTruthy()

    // Still processing after the first check, so a second check must follow.
    ready = true
    await advanceUntil(2)
    expect(await screen.findByRole('button', { name: 'Agrandir la photo 1 sur 1' })).toBeTruthy()
    expect(screen.queryByText(/Publication en cours/)).toBeNull()

    // Done: no more checks.
    await vi.advanceTimersByTimeAsync(9000)
    expect(checks()).toBe(2)
  } finally {
    vi.useRealTimers()
  }
})

test('more posts load with the cursor', async () => {
  const calls = mockApi({
    ...loggedOut,
    'GET /posts/': () => page([publicPost(1)], 'http://x/api/posts/?cursor=next1'),
  })
  renderApp('/')
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Voir plus' }))
  expect(calls.some((c) => c.path === '/posts/' && c.search === '?cursor=next1')).toBe(true)
})
