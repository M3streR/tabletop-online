export type Point = { x: number; y: number }
export type Camera = { x: number; y: number; zoom: number }
export type Bounds = { x: number; y: number; width: number; height: number }

export function screenToWorld(point: Point, camera: Camera): Point {
  return { x: (point.x - camera.x) / camera.zoom, y: (point.y - camera.y) / camera.zoom }
}

export function zoomAt(camera: Camera, screen: Point, nextZoom: number): Camera {
  const world = screenToWorld(screen, camera)
  return { x: screen.x - world.x * nextZoom, y: screen.y - world.y * nextZoom, zoom: nextZoom }
}

export function snapPoint(point: Point, cell: number, offsetX: number, offsetY: number): Point {
  return {
    x: Math.round((point.x - offsetX) / cell) * cell + offsetX,
    y: Math.round((point.y - offsetY) / cell) * cell + offsetY,
  }
}

export function distanceInCells(a: Point, b: Point, cell: number) {
  return Math.hypot(b.x - a.x, b.y - a.y) / cell
}

export function initials(name: string) {
  const pieces = name.trim().split(/\s+/).filter(Boolean)
  return (pieces.length > 1 ? `${pieces[0][0]}${pieces.at(-1)![0]}` : pieces[0]?.slice(0, 2) || '?').toUpperCase()
}

export function fitTokenImage(sourceWidth: number, sourceHeight: number, size: number) {
  const safeWidth = Math.max(1, sourceWidth)
  const safeHeight = Math.max(1, sourceHeight)
  const safeSize = Math.max(1, size)
  const scale = safeSize / Math.max(safeWidth, safeHeight)
  return { width: safeWidth * scale, height: safeHeight * scale }
}

export function feetAnchoredBounds(width: number, height: number): Bounds {
  return { x: -width / 2, y: -height, width, height }
}
