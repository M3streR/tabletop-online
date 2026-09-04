import { Texture } from 'pixi.js'
import { validateImage, type ImageKind } from './safeImage'

/** Board-owned textures, never retained in Pixi's global Assets cache. */
export class TextureStore {
  private entries = new Map<string, { refs: number; promise: Promise<Texture> }>()
  private stopped = false
  bytes = 0

  acquire(url: string, kind: ImageKind) {
    const key = `${kind}:${url}`
    let entry = this.entries.get(key)
    if (!entry) {
      entry = { refs: 0, promise: this.load(url, kind) }
      this.entries.set(key, entry)
    }
    entry.refs++
    let released = false
    return { texture: entry.promise, release: () => {
      if (released) return
      released = true
      if (--entry.refs === 0) {
        this.entries.delete(key)
        void entry.promise.then(texture => this.dispose(texture)).catch(() => undefined)
      }
    } }
  }

  private async load(url: string, kind: ImageKind) {
    const response = await fetch(url)
    if (!response.ok) throw new Error('Imagem indisponível.')
    const blob = await response.blob()
    await validateImage(blob, kind)
    const bitmap = await createImageBitmap(blob)
    const side = kind === 'map' ? 4096 : 2048
    if (bitmap.width > side || bitmap.height > side || this.stopped) { bitmap.close(); throw new Error('Imagem indisponível.') }
    const texture = Texture.from(bitmap)
    this.bytes += bitmap.width * bitmap.height * 4
    return texture
  }

  private dispose(texture: Texture) {
    if (texture.destroyed) return
    this.bytes -= texture.width * texture.height * 4
    const bitmap = texture.source.resource as ImageBitmap
    texture.destroy(true)
    bitmap.close()
  }

  destroy() {
    this.stopped = true
    for (const entry of this.entries.values()) void entry.promise.then(texture => this.dispose(texture)).catch(() => undefined)
    this.entries.clear()
  }
}
