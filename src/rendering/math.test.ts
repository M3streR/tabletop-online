import { describe, expect, it } from 'vitest'
import { distanceInCells, feetAnchoredBounds, fitTokenImage, initials, screenToWorld, snapPoint, zoomAt } from './math'

describe('camera math', () => {
  it('keeps the world point under the cursor while zooming', () => {
    const cursor = { x: 420, y: 240 }
    const before = { x: 40, y: -20, zoom: 1 }
    const world = screenToWorld(cursor, before)
    expect(screenToWorld(cursor, zoomAt(before, cursor, 2))).toEqual(world)
  })

  it('snaps relative to grid offset', () => {
    expect(snapPoint({ x: 131, y: 151 }, 70, 10, 20)).toEqual({ x: 150, y: 160 })
  })

  it('measures euclidean cell distance without system-specific diagonals', () => {
    expect(distanceInCells({ x: 0, y: 0 }, { x: 210, y: 280 }, 70)).toBe(5)
  })
})

describe('token fallback', () => {
  it('uses first and last initials', () => expect(initials('Maria da Lua')).toBe('ML'))
  it('handles an empty name defensively', () => expect(initials('  ')).toBe('?'))
})

describe('free token sprites', () => {
  it('preserves portrait proportions inside the selected visual scale', () => {
    const fitted = fitTokenImage(400, 1000, 140)
    expect(fitted.width).toBeCloseTo(56)
    expect(fitted.height).toBe(140)
  })

  it('preserves landscape proportions without stretching', () => {
    expect(fitTokenImage(1200, 400, 90)).toEqual({ width: 90, height: 30 })
  })

  it('uses the bottom-center coordinate as the character feet', () => {
    expect(feetAnchoredBounds(56, 140)).toEqual({ x: -28, y: -140, width: 56, height: 140 })
  })
})
