import { describe, expect, it } from 'vitest'
import { imageHeader, validateImage } from './safeImage'

function png(width: number, height: number) {
  const bytes = new Uint8Array(33)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82])
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width); view.setUint32(20, height)
  return bytes
}
describe('image envelope before decode', () => {
  it('reads PNG dimensions without allocating its pixels', () => expect(imageHeader(png(4096, 2048))).toMatchObject({ width: 4096, height: 2048 }))
  it('rejects malformed and truncated files', () => {
    expect(() => imageHeader(new Uint8Array([1, 2, 3]))).toThrow()
    expect(() => imageHeader(png(1, 1).subarray(0, 20))).toThrow()
  })
  it('rejects dimensions above the envelope before decoding', async () => {
    const blob = { size: 33, type: 'image/png', arrayBuffer: async () => png(12000, 12000).buffer } as Blob
    await expect(validateImage(blob, 'map')).rejects.toThrow('4096')
  })
  it('does not trust a claimed MIME', async () => {
    const blob = { size: 33, type: 'image/jpeg', arrayBuffer: async () => png(1, 1).buffer } as Blob
    await expect(validateImage(blob, 'map')).rejects.toThrow('inválida')
  })
})
