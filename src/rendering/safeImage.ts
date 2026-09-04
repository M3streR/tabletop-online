export type ImageKind = 'map' | 'token'
const invalid = () => new Error('Imagem inválida. Use PNG, JPEG ou WebP não animado.')

/** Read dimensions before decoding: metadata supplied by an uploader is untrusted. */
export function imageHeader(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const text = (start: number, count: number) => String.fromCharCode(...bytes.subarray(start, start + count))
  if (bytes.length >= 24 && text(0, 8) === '\x89PNG\r\n\x1a\n' && text(12, 4) === 'IHDR') {
    // Animated PNG is intentionally outside the first asset envelope.
    for (let i = 8; i + 12 <= bytes.length;) {
      if (text(i + 4, 4) === 'acTL') throw invalid()
      const length = view.getUint32(i)
      i += length + 12
    }
    return { width: view.getUint32(16), height: view.getUint32(20), mimeType: 'image/png' as const }
  }
  if (bytes.length >= 12 && text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
    for (let i = 12; i + 8 <= bytes.length;) {
      const size = view.getUint32(i + 4, true), data = i + 8
      if (data + size > bytes.length) throw invalid()
      const kind = text(i, 4)
      if (kind === 'VP8X' && size >= 10) {
        if (bytes[data] & 2) throw invalid()
        const u24 = (p: number) => bytes[p] | bytes[p + 1] << 8 | bytes[p + 2] << 16
        return { width: u24(data + 4) + 1, height: u24(data + 7) + 1, mimeType: 'image/webp' as const }
      }
      if (kind === 'VP8 ' && size >= 10 && text(data + 3, 3) === '\x9d\x01\x2a') return { width: view.getUint16(data + 6, true) & 0x3fff, height: view.getUint16(data + 8, true) & 0x3fff, mimeType: 'image/webp' as const }
      if (kind === 'VP8L' && size >= 5 && bytes[data] === 0x2f) {
        const bits = view.getUint32(data + 1, true)
        return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, mimeType: 'image/webp' as const }
      }
      i = data + size + (size % 2)
    }
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2
    while (i + 4 <= bytes.length) {
      if (bytes[i++] !== 0xff) throw invalid()
      while (bytes[i] === 0xff) i++
      const marker = bytes[i++]
      if (marker === 0xda || marker === 0xd9) break
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
      if (i + 2 > bytes.length) throw invalid()
      const length = view.getUint16(i)
      if (length < 2 || i + length > bytes.length) throw invalid()
      if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 7) return { width: view.getUint16(i + 5), height: view.getUint16(i + 3), mimeType: 'image/jpeg' as const }
      i += length
    }
  }
  throw invalid()
}

export async function validateImage(blob: Blob, kind: ImageKind) {
  const maxSide = kind === 'map' ? 4096 : 2048
  if (!blob.size || blob.size > (kind === 'map' ? 20 : 5) * 1024 * 1024) throw new Error(`A imagem deve ter no máximo ${kind === 'map' ? 20 : 5} MB.`)
  const info = imageHeader(new Uint8Array(await blob.arrayBuffer()))
  if (blob.type.split(';')[0] !== info.mimeType) throw invalid()
  if (!info.width || !info.height || info.width > maxSide || info.height > maxSide) throw new Error(`A imagem excede ${maxSide} × ${maxSide}.`)
  return { ...info, bytes: blob.size }
}
