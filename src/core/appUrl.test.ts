import { describe, expect, it } from 'vitest'
import { joinAppUrl } from './appUrl'

describe('public application URLs', () => {
  it('includes the GitHub Pages base path', () => {
    expect(joinAppUrl('https://m3strer.github.io', '/tabletop-online/', '/invite/abc'))
      .toBe('https://m3strer.github.io/tabletop-online/invite/abc')
  })

  it('keeps local root deployments at the origin', () => {
    expect(joinAppUrl('http://127.0.0.1:4173', '/', '/rooms'))
      .toBe('http://127.0.0.1:4173/rooms')
  })
})
