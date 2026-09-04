import { useEffect, useRef } from 'react'
import type { Scene, TabletopToken } from '../../domain/tabletop'
import { BoardEngine, type BoardCallbacks, type BoardTool } from '../../rendering/BoardEngine'

export type PixiBoardProps = {
  scene: Scene | null
  backgroundUrl: string | null
  tokens: TabletopToken[]
  selectedId: string | null
  tool: BoardTool
  callbacks: BoardCallbacks
  engineRef?: React.MutableRefObject<BoardEngine | null>
}

export function PixiBoard({ scene, backgroundUrl, tokens, selectedId, tool, callbacks, engineRef }: PixiBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const holderRef = useRef<HTMLDivElement>(null)
  const ownEngine = useRef<BoardEngine | null>(null)

  useEffect(() => {
    if (!canvasRef.current || !holderRef.current) return
    const engine = new BoardEngine(callbacks)
    ownEngine.current = engine
    if (engineRef) engineRef.current = engine
    if (import.meta.env.DEV) window.__TABLETOP_ENGINE__ = engine
    void engine.mount(canvasRef.current, holderRef.current).then(() => engine.fitScene())
    return () => {
      if (engineRef) engineRef.current = null
      if (window.__TABLETOP_ENGINE__ === engine) delete window.__TABLETOP_ENGINE__
      engine.destroy()
    }
  }, [])

  useEffect(() => { ownEngine.current?.setScene(scene) }, [scene])
  useEffect(() => { ownEngine.current?.setCallbacks(callbacks) }, [callbacks])
  useEffect(() => { void ownEngine.current?.setBackground(backgroundUrl, scene?.world_width, scene?.world_height) }, [backgroundUrl, scene?.world_width, scene?.world_height])
  useEffect(() => ownEngine.current?.setTokens(tokens), [tokens])
  useEffect(() => ownEngine.current?.setSelected(selectedId), [selectedId])
  useEffect(() => ownEngine.current?.setTool(tool), [tool])

  return <div className="board-host" ref={holderRef}><canvas ref={canvasRef} aria-label="Mesa virtual 2D" /></div>
}
