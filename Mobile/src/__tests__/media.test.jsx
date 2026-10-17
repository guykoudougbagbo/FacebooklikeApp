import { render, screen, userEvent } from '@testing-library/react-native'
import { useVideoPlayer, VideoView } from 'expo-video'
import MediaGrid from '../components/MediaGrid'

const video = (id) => ({
  id, kind: 'video', width: 360, height: 640, video_url: `/media/v${id}.mp4`, poster_url: `/media/p${id}.webp`, duration_seconds: 42,
})
const photo = (id) => ({ id, kind: 'photo', width: 800, height: 600, feed_url: `/media/f${id}.webp`, full_url: `/media/F${id}.webp` })

beforeEach(() => jest.clearAllMocks())

test('videos show the play button and their length, and nothing plays until pressed', async () => {
  await render(<MediaGrid items={[video(1), photo(2)]} />)
  // Decoration only: screen readers hear the tile's label instead.
  expect(screen.getAllByTestId('play-button', { includeHiddenElements: true })).toHaveLength(1)
  expect(screen.getByText('0:42')).toBeOnTheScreen()
  expect(useVideoPlayer).not.toHaveBeenCalled()
})

test('pressing a video plays only that one, full screen', async () => {
  const user = userEvent.setup()
  await render(<MediaGrid items={[video(1), video(2)]} />)
  await user.press(screen.getByRole('button', { name: 'Lire la vidéo 1 sur 2' }))
  expect(screen.getByRole('button', { name: 'Fermer' })).toBeOnTheScreen()
  expect(useVideoPlayer).toHaveBeenCalledWith('https://api.test/media/v1.mp4', expect.any(Function))
  expect(useVideoPlayer).not.toHaveBeenCalledWith('https://api.test/media/v2.mp4', expect.any(Function))
  // The other video waits behind its own play button.
  expect(screen.getByRole('button', { name: 'Lire la vidéo' })).toBeOnTheScreen()
})

test('the viewer can be closed at any time, even while a video plays', async () => {
  const user = userEvent.setup()
  await render(<MediaGrid items={[video(1)]} />)
  await user.press(screen.getByRole('button', { name: 'Lire la vidéo 1 sur 1' }))
  expect(useVideoPlayer).toHaveBeenCalled()
  // No built-in second full screen, which would have no way back to the viewer.
  expect(VideoView.mock.calls.at(-1)[0]).toMatchObject({ nativeControls: true, fullscreenOptions: { enable: false } })
  await user.press(screen.getByRole('button', { name: 'Fermer' }))
  expect(screen.queryByRole('button', { name: 'Fermer' })).not.toBeOnTheScreen()
  expect(screen.getByRole('button', { name: 'Lire la vidéo 1 sur 1' })).toBeOnTheScreen()
})

