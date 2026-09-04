import { Application, Container, Graphics, Sprite, Text, Texture, TilingSprite } from 'pixi.js'
import { TextureStore } from './textureStore'
import type { Scene, TabletopToken } from '../domain/tabletop'
import { distanceInCells, initials, screenToWorld, snapPoint, zoomAt, type Camera, type Point } from './math'

export type BoardTool = 'select' | 'pan' | 'ping' | 'measure'

export type BoardCallbacks = {
  onSelect: (tokenId: string | null) => void
  onDragStart: (tokenId: string) => Promise<boolean>
  onDragAbort: (tokenId: string) => void
  onDragMove: (tokenId: string, point: Point) => void
  onDragEnd: (tokenId: string, point: Point) => void
  onPing: (point: Point) => void
  onMeasure: (phase: 'start' | 'move' | 'end', start: Point, end: Point) => void
  onContextLost: (lost: boolean) => void
}

type TokenView = { container: Container; token: TabletopToken; target: Point | null; previewUntil: number }

export class BoardEngine {
  readonly app = new Application()
  readonly world = new Container()
  readonly backgroundLayer = new Container()
  readonly gridLayer = new Container()
  readonly tokenLayer = new Container()
  readonly effectsLayer = new Container()
  readonly selectionLayer = new Container()
  private grid: TilingSprite | null = null
  private gridTexture: Texture | null = null
  private measureLabel = new Text({ text: '', style: { fill: '#fff4d6', fontSize: 14, fontFamily: 'system-ui' } })
  private selection = new Graphics()
  private measure = new Graphics()
  private tokens = new Map<string, TokenView>()
  private callbacks: BoardCallbacks
  private scene: Scene | null = null
  private tool: BoardTool = 'select'
  private camera: Camera = { x: 80, y: 80, zoom: 1 }
  private pointerStart: Point | null = null
  private measureStart: Point | null = null
  private draggingToken: string | null = null
  private panning = false
  private pointerIsDown = false
  private selectedId: string | null = null
  private destroyed = false
  private mounted = false
  private imageGeneration = 0
  private textures = new TextureStore()
  private releaseBackground: (() => void) | null = null
  backgroundStatus: 'empty' | 'loading' | 'ready' | 'error' = 'empty'
  frameTimes: number[] = []
  readonly eventsSeen = { ping: 0, measure: 0 }

  constructor(callbacks: BoardCallbacks) {
    this.callbacks = callbacks
  }

  async mount(canvas: HTMLCanvasElement, resizeTo: HTMLElement) {
    await this.app.init({ canvas, resizeTo, backgroundAlpha: 0, antialias: true, preference: 'webgl', resolution: Math.min(devicePixelRatio, 2), autoDensity: true })
    this.mounted = true
    if (this.destroyed) {
      this.app.destroy(false, { children: true })
      this.mounted = false
      return
    }
    this.world.addChild(this.backgroundLayer, this.gridLayer, this.tokenLayer, this.effectsLayer, this.selectionLayer)
    const tile = document.createElement('canvas')
    tile.width = tile.height = 128
    const ctx = tile.getContext('2d')!
    ctx.fillStyle = '#eaf9f7'
    ctx.fillRect(0, 0, 128, 2)
    ctx.fillRect(0, 0, 2, 128)
    this.gridTexture = Texture.from(tile)
    this.grid = new TilingSprite({ texture: this.gridTexture, width: 1, height: 1 })
    this.gridLayer.addChild(this.grid)
    this.selectionLayer.addChild(this.selection, this.measure, this.measureLabel)
    this.measureLabel.visible = false
    this.app.stage.addChild(this.world)
    this.applyCamera()
    this.app.ticker.add((ticker) => {
      this.frameTimes.push(ticker.elapsedMS)
      if (this.frameTimes.length > 180) this.frameTimes.shift()
      for (const view of this.tokens.values()) {
        if (view.previewUntil && performance.now() > view.previewUntil) {
          view.target = { x: view.token.transform.x_world, y: view.token.transform.y_world }
          view.previewUntil = 0
        }
        if (!view.target || view.token.id === this.draggingToken) continue
        const amount = Math.min(1, ticker.deltaMS / 75)
        view.container.x += (view.target.x - view.container.x) * amount
        view.container.y += (view.target.y - view.container.y) * amount
        if (Math.hypot(view.target.x - view.container.x, view.target.y - view.container.y) < 0.2) {
          view.container.position.set(view.target.x, view.target.y)
          view.target = null
        }
      }
      this.redrawSelection()
    })
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('pointercancel', this.onPointerUp)
    canvas.addEventListener('wheel', this.onWheel, { passive: false })
    canvas.addEventListener('contextmenu', this.preventContextMenu)
    canvas.addEventListener('webglcontextlost', this.onContextLost)
    canvas.addEventListener('webglcontextrestored', this.onContextRestored)
  }

  setTool(tool: BoardTool) {
    this.tool = tool
  }

  setCallbacks(callbacks: BoardCallbacks) { this.callbacks = callbacks }

  cancelDrag() {
    if (this.draggingToken) this.callbacks.onDragAbort(this.draggingToken)
    this.draggingToken = null
    this.pointerIsDown = false
    this.panning = false
    this.measureStart = null
    this.measure.clear()
    this.measureLabel.visible = false
  }

  setScene(scene: Scene | null) {
    const changed = scene?.id !== this.scene?.id
    if (changed) this.cancelDrag()
    this.scene = scene
    this.drawGrid()
    if (changed) this.fitScene()
  }

  async setBackground(url: string | null, width = 1, height = 1) {
    const generation = ++this.imageGeneration
    this.backgroundLayer.removeChildren().forEach((child) => child.destroy())
    this.releaseBackground?.()
    this.releaseBackground = null
    this.backgroundStatus = url ? 'loading' : 'empty'
    if (!url) return
    try {
      const resource = this.textures.acquire(url, 'map')
      this.releaseBackground = resource.release
      const texture = await resource.texture
      if (generation !== this.imageGeneration || this.destroyed) return
      const sprite = new Sprite(texture)
      sprite.width = width
      sprite.height = height
      this.backgroundLayer.addChild(sprite)
      this.backgroundStatus = 'ready'
    } catch {
      if (generation !== this.imageGeneration || this.destroyed) return
      this.backgroundStatus = 'error'
      const fallback = new Graphics().rect(0, 0, width, height).fill(0x1b232b)
      this.backgroundLayer.addChild(fallback)
      const label = new Text({ text: 'Mapa indisponível. Verifique o arquivo e tente recarregar.', style: { fill: '#f2bd68', fontSize: 18 } })
      label.position.set(24, 24)
      this.backgroundLayer.addChild(label)
    }
  }

  setTokens(tokens: TabletopToken[]) {
    const nextIds = new Set(tokens.map((token) => token.id))
    for (const [id, view] of this.tokens) {
      if (!nextIds.has(id)) {
        view.container.destroy({ children: true })
        this.tokens.delete(id)
      }
    }
    tokens.forEach((token) => {
      const existing = this.tokens.get(token.id)
      if (existing) {
        const visualChanged = existing.token.revision !== token.revision || existing.token.imageUrl !== token.imageUrl
        const moved = existing.token.transform.revision !== token.transform.revision
        if (moved) existing.previewUntil = 0
        if (visualChanged) {
          existing.container.destroy({ children: true })
          existing.container = this.makeToken(token)
          this.tokenLayer.addChild(existing.container)
        }
        existing.token = token
        if (token.id !== this.draggingToken && (moved || !existing.target)) {
          existing.target = null
          existing.container.position.set(token.transform.x_world, token.transform.y_world)
        }
        return
      }
      const container = this.makeToken(token)
      this.tokenLayer.addChild(container)
      this.tokens.set(token.id, { container, token, target: null, previewUntil: 0 })
    })
    this.redrawSelection()
  }

  setSelected(tokenId: string | null) {
    this.selectedId = tokenId
    this.redrawSelection()
  }

  setRemoteTokenPosition(tokenId: string, point: Point) {
    const view = this.tokens.get(tokenId)
    if (view) { view.target = point; view.previewUntil = performance.now() + 1600 }
  }

  showPing(point: Point, color = '#64dfd2') {
    if (!this.mounted || this.destroyed) return
    this.eventsSeen.ping++
    const ring = new Graphics().circle(0, 0, 12).stroke({ width: 4, color })
    ring.position.set(point.x, point.y)
    this.effectsLayer.addChild(ring)
    let age = 0
    const animate = (ticker: { deltaMS: number }) => {
      age += ticker.deltaMS
      ring.scale.set(1 + age / 210)
      ring.alpha = Math.max(0, 1 - age / 900)
      if (age >= 900) {
        this.app.ticker.remove(animate)
        ring.destroy()
      }
    }
    this.app.ticker.add(animate)
  }

  showRemoteMeasure(start: Point, end: Point, cell: number, final = false) {
    if (!this.mounted || this.destroyed) return
    this.eventsSeen.measure++
    const line = new Graphics()
    line.moveTo(start.x, start.y).lineTo(end.x, end.y).stroke({ color: 0xf2bd68, width: 3 / this.camera.zoom })
    line.circle(start.x, start.y, 5 / this.camera.zoom).fill(0xf2bd68)
    const label = new Text({ text: `${distanceInCells(start, end, cell).toFixed(1)} células`, style: { fill: '#fff4d6', fontFamily: 'system-ui', fontSize: 14 / this.camera.zoom, fontWeight: '600' } })
    label.position.set(end.x + 9 / this.camera.zoom, end.y + 9 / this.camera.zoom)
    const holder = new Container()
    holder.addChild(line, label)
    this.effectsLayer.addChild(holder)
    setTimeout(() => { if (!holder.destroyed) holder.destroy({ children: true }) }, final ? 1100 : 150)
  }

  fitScene() {
    if (!this.scene || !this.mounted || !this.app.screen.width || !this.app.screen.height) return
    const zoom = Math.min((this.app.screen.width - 100) / this.scene.world_width, (this.app.screen.height - 100) / this.scene.world_height, 1)
    this.camera = { zoom: Math.max(0.1, zoom), x: (this.app.screen.width - this.scene.world_width * zoom) / 2, y: (this.app.screen.height - this.scene.world_height * zoom) / 2 }
    this.applyCamera()
  }

  metrics() {
    const average = this.frameTimes.length ? this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length : 0
    return { fps: average ? 1000 / average : 0, frameMs: average, tokenCount: this.tokens.size, eventsSeen: { ...this.eventsSeen }, dragging: this.draggingToken, textureMiB: this.textures.bytes / 1024 / 1024, backgroundStatus: this.backgroundStatus, camera: { ...this.camera } }
  }

  tokenPosition(tokenId: string) {
    const view = this.tokens.get(tokenId)
    return view ? { x: view.container.x, y: view.container.y } : null
  }

  tokenPositions() {
    return Array.from(this.tokens.entries()).map(([id, view]) => ({ id, x: view.container.x, y: view.container.y, revision: view.token.transform.revision }))
  }

  tokenScreenPositions() {
    return Array.from(this.tokens.entries()).map(([id, view]) => ({ id, x: this.camera.x + view.container.x * this.camera.zoom, y: this.camera.y + view.container.y * this.camera.zoom }))
  }

  effectCount() {
    return this.effectsLayer.children.length
  }

  controllableTokenIds() {
    return Array.from(this.tokens.values()).filter(v => v.token.controllers.length > 0).map(v => v.token.id)
  }

  destroy() {
    this.cancelDrag()
    this.destroyed = true
    this.textures.destroy()
    if (!this.mounted) return
    const canvas = this.app.canvas
    canvas.removeEventListener('pointerdown', this.onPointerDown)
    canvas.removeEventListener('pointermove', this.onPointerMove)
    canvas.removeEventListener('pointerup', this.onPointerUp)
    canvas.removeEventListener('pointercancel', this.onPointerUp)
    canvas.removeEventListener('wheel', this.onWheel)
    canvas.removeEventListener('contextmenu', this.preventContextMenu)
    canvas.removeEventListener('webglcontextlost', this.onContextLost)
    canvas.removeEventListener('webglcontextrestored', this.onContextRestored)
    this.app.destroy(false, { children: true })
    this.gridTexture?.destroy(true)
    this.mounted = false
  }

  private makeToken(token: TabletopToken) {
    const holder = new Container()
    holder.position.set(token.transform.x_world, token.transform.y_world)
    holder.zIndex = token.z_index
    const body = new Graphics().circle(0, 0, token.width_world / 2).fill(token.color).stroke({ color: 0xf4f7f8, width: Math.max(2, token.width_world * 0.045) })
    holder.addChild(body)
    const label = new Text({ text: initials(token.name), style: { fill: '#07110f', fontFamily: 'system-ui', fontWeight: '800', fontSize: Math.max(12, token.width_world * 0.28) } })
    label.anchor.set(0.5)
    holder.addChild(label)
    if (token.imageUrl) {
      const resource = this.textures.acquire(token.imageUrl, 'token')
      holder.once('destroyed', resource.release)
      resource.texture.then((texture) => {
        if (holder.destroyed) return
        label.visible = false
        const image = new Sprite(texture)
        image.anchor.set(0.5)
        image.width = token.width_world - 6
        image.height = token.height_world - 6
        image.roundPixels = true
        holder.addChildAt(image, 1)
      }).catch(() => undefined)
    }
    const name = new Text({ text: token.name, style: { fill: '#ffffff', fontFamily: 'system-ui', fontSize: 12, fontWeight: '600', stroke: { color: '#05070a', width: 4 } } })
    name.anchor.set(0.5, 0)
    name.position.set(0, token.height_world / 2 + 7)
    holder.addChild(name)
    return holder
  }

  private drawGrid() {
    if (!this.grid) return
    const scene = this.scene
    this.grid.visible = Boolean(scene?.grid_enabled)
    if (!scene) return
    this.grid.width = scene.world_width
    this.grid.height = scene.world_height
    this.grid.tileScale.set(scene.grid_cell_size / 128)
    this.grid.tilePosition.set(scene.grid_offset_x, scene.grid_offset_y)
    this.grid.alpha = scene.grid_opacity
  }

  private redrawSelection() {
    this.selection.clear()
    const view = this.selectedId ? this.tokens.get(this.selectedId) : null
    if (!view) return
    this.selection.circle(view.container.x, view.container.y, view.token.width_world / 2 + 6 / this.camera.zoom).stroke({ color: 0x64dfd2, width: 3 / this.camera.zoom })
  }

  private applyCamera() {
    this.world.position.set(this.camera.x, this.camera.y)
    this.world.scale.set(this.camera.zoom)
    this.drawGrid()
    this.redrawSelection()
  }

  private localPoint(event: PointerEvent | WheelEvent): Point {
    const rect = this.app.canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  private hitToken(world: Point) {
    return Array.from(this.tokens.values()).reverse().find((view) => Math.hypot(world.x - view.container.x, world.y - view.container.y) <= view.token.width_world / 2)
  }

  private clampAndSnap(point: Point, view?: TokenView, snap = true): Point {
    const scene = this.scene
    if (!scene) return point
    const snapped = snap && scene.snap_enabled ? snapPoint(point, scene.grid_cell_size, scene.grid_offset_x, scene.grid_offset_y) : point
    const radius = (view?.token.width_world ?? 0) / 2
    return { x: Math.min(scene.world_width - radius, Math.max(radius, snapped.x)), y: Math.min(scene.world_height - radius, Math.max(radius, snapped.y)) }
  }

  private onPointerDown = async (event: PointerEvent) => {
    if (this.pointerIsDown) return
    this.pointerIsDown = true
    const screen = this.localPoint(event)
    const world = screenToWorld(screen, this.camera)
    this.pointerStart = screen
    this.app.canvas.setPointerCapture(event.pointerId)
    if (event.button === 1 || event.button === 2 || this.tool === 'pan') { this.panning = true; return }
    if (this.tool === 'ping') { this.showPing(world); this.callbacks.onPing(world); return }
    if (this.tool === 'measure') { this.measureStart = world; this.callbacks.onMeasure('start', world, world); return }
    const hit = this.hitToken(world)
    this.selectedId = hit?.token.id ?? null
    this.callbacks.onSelect(this.selectedId)
    this.redrawSelection()
    const sceneId = this.scene?.id
    if (hit && await this.callbacks.onDragStart(hit.token.id)) {
      if (this.pointerIsDown && !this.destroyed && this.scene?.id === sceneId) this.draggingToken = hit.token.id
      else this.callbacks.onDragAbort(hit.token.id)
    }
  }

  private onPointerMove = (event: PointerEvent) => {
    const screen = this.localPoint(event)
    if (this.panning && this.pointerStart) {
      this.camera.x += screen.x - this.pointerStart.x
      this.camera.y += screen.y - this.pointerStart.y
      this.pointerStart = screen
      this.applyCamera()
      return
    }
    const world = screenToWorld(screen, this.camera)
    if (this.draggingToken) {
      const view = this.tokens.get(this.draggingToken)
      if (!view) return
      const point = this.clampAndSnap(world, view, false)
      view.container.position.set(point.x, point.y)
      this.redrawSelection()
      this.callbacks.onDragMove(this.draggingToken, point)
      return
    }
    if (this.measureStart) {
      this.drawLocalMeasure(this.measureStart, world)
      this.callbacks.onMeasure('move', this.measureStart, world)
    }
  }

  private onPointerUp = (event: PointerEvent) => {
    if (event.type === 'pointercancel') { this.cancelDrag(); return }
    this.pointerIsDown = false
    const world = screenToWorld(this.localPoint(event), this.camera)
    if (this.draggingToken) {
      const id = this.draggingToken
      const view = this.tokens.get(id)
      const point = this.clampAndSnap(world, view)
      view?.container.position.set(point.x, point.y)
      this.draggingToken = null
      this.callbacks.onDragEnd(id, point)
    }
    if (this.measureStart) {
      const start = this.measureStart
      this.measureStart = null
      this.measure.clear()
      this.measureLabel.visible = false
      this.callbacks.onMeasure('end', start, world)
    }
    this.panning = false
    this.pointerStart = null
  }

  private drawLocalMeasure(start: Point, end: Point) {
    this.measure.clear().moveTo(start.x, start.y).lineTo(end.x, end.y).stroke({ color: 0xf2bd68, width: 3 / this.camera.zoom })
    const cell = this.scene?.grid_cell_size ?? 70
    const length = distanceInCells(start, end, cell)
    this.measure.circle(end.x, end.y, Math.max(4, length / 20)).fill(0xf2bd68)
    this.measureLabel.text = `${length.toFixed(1)} células`
    this.measureLabel.scale.set(1 / this.camera.zoom)
    this.measureLabel.position.set(end.x + 10 / this.camera.zoom, end.y + 10 / this.camera.zoom)
    this.measureLabel.visible = true
  }

  private onWheel = (event: WheelEvent) => {
    event.preventDefault()
    const next = Math.min(4, Math.max(0.08, this.camera.zoom * Math.exp(-event.deltaY * 0.0012)))
    this.camera = zoomAt(this.camera, this.localPoint(event), next)
    this.applyCamera()
  }

  private preventContextMenu = (event: Event) => event.preventDefault()
  private onContextLost = (event: Event) => { event.preventDefault(); this.callbacks.onContextLost(true) }
  private onContextRestored = () => this.callbacks.onContextLost(false)
}
