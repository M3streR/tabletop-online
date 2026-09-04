import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Scene, TabletopToken } from '../../domain/tabletop'
import type { BoardEngine } from '../../rendering/BoardEngine'
import { PixiBoard } from '../tabletop/PixiBoard'

const scene: Scene = {
  id: '11111111-1111-4111-8111-111111111111', room_id: '22222222-2222-4222-8222-222222222222', name: 'Benchmark 200 tokens', background_asset_id: null,
  world_width: 4096, world_height: 4096, grid_enabled: true, grid_cell_size: 70, grid_offset_x: 0, grid_offset_y: 0, grid_opacity: .3, snap_enabled: false,
  revision: 1, created_by: '33333333-3333-4333-8333-333333333333', created_at: new Date(0).toISOString(), updated_at: new Date(0).toISOString(),
}

function benchmarkTokens(): TabletopToken[] {
  return Array.from({ length: 200 }, (_, index) => {
    const id = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
    return {
      id, room_id: scene.room_id, scene_id: scene.id, image_asset_id: null, name: `Token ${index + 1}`, width_world: 54, height_world: 54,
      color: index % 3 === 0 ? '#64dfd2' : index % 3 === 1 ? '#f2bd68' : '#8b9cf6', z_index: index, visibility: 'everyone', locked: false, revision: 1,
      created_by: scene.created_by, created_at: scene.created_at, updated_at: scene.updated_at, imageUrl: null, controllers: [],
      transform: { token_id: id, room_id: scene.room_id, scene_id: scene.id, x_world: 170 + (index % 20) * 185, y_world: 180 + Math.floor(index / 20) * 320, revision: 1, updated_by: scene.created_by, updated_at: scene.updated_at },
    }
  })
}

export function BenchmarkPage() {
  const tokens = useMemo(benchmarkTokens, [])
  const engineRef = useRef<BoardEngine | null>(null)
  const [background, setBackground] = useState<string | null>(null)
  const samples = useRef(0)
  useEffect(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 4096
    const context = canvas.getContext('2d')!
    context.fillStyle = '#19242b'
    context.fillRect(0, 0, 4096, 4096)
    for (let y = 0; y < 4096; y += 256) for (let x = 0; x < 4096; x += 256) {
      context.fillStyle = (x + y) % 512 ? '#23363d' : '#1c2e36'
      context.fillRect(x + 4, y + 4, 248, 248)
    }
    let url = '', disposed = false
    canvas.toBlob((blob) => { if (!blob || disposed) return; url = URL.createObjectURL(blob); setBackground(url) }, 'image/png')
    return () => { disposed = true; if (url) URL.revokeObjectURL(url) }
  }, [])
  const [stats, setStats] = useState({ fps: 0, frameMs: 0, tokenCount: 0, heap: 0 })
  useEffect(() => {
    let direction = 1
    let x = tokens[0].transform.x_world
    const animation = window.setInterval(() => {
      samples.current++
      x += direction * 12
      if (x > 900 || x < 170) direction *= -1
      engineRef.current?.setRemoteTokenPosition(tokens[0].id, { x, y: tokens[0].transform.y_world })
    }, 67)
    const metrics = window.setInterval(() => {
      const current = engineRef.current?.metrics() ?? { fps: 0, frameMs: 0, tokenCount: 0 }
      const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
      setStats({ ...current, heap: memory ? memory.usedJSHeapSize / 1024 / 1024 : 0 })
    }, 500)
    return () => { clearInterval(animation); clearInterval(metrics) }
  }, [tokens])
  return <main className="benchmark-page"><PixiBoard scene={scene} backgroundUrl={background} tokens={tokens} selectedId={null} tool="pan" callbacks={{ onSelect: () => undefined, onDragStart: async () => false, onDragAbort: () => undefined, onDragMove: () => undefined, onDragEnd: () => undefined, onPing: () => undefined, onMeasure: () => undefined, onContextLost: () => undefined }} engineRef={engineRef} /><aside className="benchmark-stats"><header><Activity size={18} /><strong>Cenário de carga</strong></header><dl><div><dt>FPS</dt><dd data-testid="benchmark-fps">{stats.fps.toFixed(0)}</dd></div><div><dt>Frame</dt><dd>{stats.frameMs.toFixed(1)} ms</dd></div><div><dt>Tokens</dt><dd>{stats.tokenCount}</dd></div><div><dt>Heap JS</dt><dd>{stats.heap ? `${stats.heap.toFixed(0)} MB` : 'n/d'}</dd></div><div><dt>Previews simulados</dt><dd>{samples.current}</dd></div></dl><p>Imagem 4096² · grid único · interpolação a 15 Hz. Simulação local: não envia Broadcasts.</p><Link to="/rooms"><ArrowLeft size={15} />Voltar</Link></aside></main>
}
