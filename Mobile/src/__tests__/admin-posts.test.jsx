import { render, screen, userEvent } from '@testing-library/react-native'
import * as DocumentPicker from 'expo-document-picker'
import { router } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { adminApi } from '../api/admin'
import AdminPostCard from '../components/admin/AdminPostCard'
import Composer from '../components/admin/Composer'
import { confirm } from '../components/confirm'
import { makePost } from '../testing/serve'

jest.mock('../api/admin', () => ({ adminApi: jest.fn(), adminMediaUrl: (path) => path }))
jest.mock('../api/client', () => ({ api: jest.fn(), mediaUrl: (path) => path }))
jest.mock('../components/confirm', () => ({ confirm: jest.fn(async () => true) }))

const parts = (form) => form.getParts().map((p) => [p.fieldName, p.string ?? p.uri])

beforeEach(() => jest.clearAllMocks())

test('a new post sends its text, photos and videos with each video’s sound choices', async () => {
  ImagePicker.launchImageLibraryAsync.mockResolvedValue({
    canceled: false,
    assets: [
      { uri: 'file:///a.heic', type: 'image', fileName: 'a.heic', mimeType: 'image/heic' },
      { uri: 'file:///b.mov', type: 'video', fileName: 'b.mov', mimeType: 'video/quicktime' },
    ],
  })
  DocumentPicker.getDocumentAsync.mockResolvedValue({
    canceled: false, assets: [{ uri: 'file:///song.mp3', name: 'song.mp3', mimeType: 'audio/mpeg' }],
  })
  adminApi.mockResolvedValue({ id: 9 })
  const onSaved = jest.fn()
  const user = userEvent.setup()
  await render(<Composer onSaved={onSaved} />)
  await user.type(screen.getByLabelText('Texte de la publication'), 'Bonjour')
  await user.press(screen.getByRole('button', { name: 'Ajouter des photos ou vidéos' }))
  expect(ImagePicker.requestMediaLibraryPermissionsAsync).toHaveBeenCalled()
  await user.press(await screen.findByRole('button', { name: 'Choisir une musique pour la vidéo 1' }))
  expect(await screen.findByText('Musique : song.mp3')).toBeOnTheScreen()
  await user.press(screen.getByRole('button', { name: 'Publier' }))
  const [path, { method, body }] = adminApi.mock.calls[0]
  expect([path, method]).toEqual(['/admin/posts/', 'POST'])
  expect(parts(body)).toEqual([
    ['body', 'Bonjour'],
    ['media', 'file:///a.heic'],
    ['media', 'file:///b.mov'],
    ['sound_original_1', '100'],
    ['music_1', 'file:///song.mp3'],
    ['sound_music_1', '100'],
  ])
  expect(onSaved).toHaveBeenCalledWith({ id: 9 })
})

test('without access to the photos, the composer explains how to allow it', async () => {
  ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValueOnce({ granted: false })
  const user = userEvent.setup()
  await render(<Composer onSaved={jest.fn()} />)
  await user.press(screen.getByRole('button', { name: 'Ajouter des photos ou vidéos' }))
  expect(screen.getByText(/Autorisez GenZ à accéder à vos photos/)).toBeOnTheScreen()
  expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled()
})

test('editing removes the chosen items', async () => {
  const post = makePost(4, { media: [{ id: 41, kind: 'photo', feed_url: '/m/a.webp' }, { id: 42, kind: 'photo', feed_url: '/m/b.webp' }] })
  adminApi.mockResolvedValue(post)
  const user = userEvent.setup()
  await render(<Composer post={post} onSaved={jest.fn()} />)
  await user.press(screen.getByRole('button', { name: "Retirer l'élément 2" }))
  await user.press(screen.getByRole('button', { name: 'Enregistrer' }))
  const [path, { method, body }] = adminApi.mock.calls[0]
  expect([path, method]).toEqual(['/admin/posts/4/', 'PATCH'])
  expect(parts(body)).toEqual([['body', 'Publication 4'], ['remove_media_ids', '42']])
})

test('admins see who published, the preparation state, and their allowed actions', async () => {
  const user = userEvent.setup()
  const onDeleted = jest.fn()
  const post = makePost(5, { author: 'Koffi', status: 'processing', can_edit: true, can_delete: true })
  await render(<AdminPostCard post={post} onChange={jest.fn()} onDeleted={onDeleted} />)
  expect(screen.getByText('Publié par Koffi')).toBeOnTheScreen()
  expect(screen.getByText(/Publication en cours/)).toBeOnTheScreen()
  expect(screen.queryByRole('button', { name: 'Commentaires' })).not.toBeOnTheScreen()
  await user.press(screen.getByRole('button', { name: 'Modifier' }))
  expect(router.push).toHaveBeenCalledWith('/admin/compose?post=5')
  adminApi.mockResolvedValue(null)
  await user.press(screen.getByRole('button', { name: 'Supprimer' }))
  expect(confirm).toHaveBeenCalled()
  expect(adminApi).toHaveBeenCalledWith('/admin/posts/5/', { method: 'DELETE' })
  expect(onDeleted).toHaveBeenCalledWith(5)
})

test('actions an admin may not take are not offered', async () => {
  const post = makePost(6, { author: 'Awa', status: 'published', can_edit: false, can_delete: false })
  await render(<AdminPostCard post={post} onChange={jest.fn()} onDeleted={jest.fn()} />)
  expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeOnTheScreen()
  expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeOnTheScreen()
  expect(screen.getByRole('button', { name: 'Commentaires' })).toBeOnTheScreen()
})
