// Type declaration so the renderer knows about window.pos
import type { PosApi } from '../preload/index'

declare global {
  interface Window {
    pos: PosApi
  }
}

export {}
