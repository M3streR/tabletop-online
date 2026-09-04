import type { BoardEngine } from '../rendering/BoardEngine'

declare global {
  interface Window {
    __TABLETOP_ENGINE__?: BoardEngine
  }
}

export {}
