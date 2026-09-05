import { expect, test, type BrowserContext, type Page } from '@playwright/test'

const users = {
  owner: { email: process.env.E2E_OWNER_EMAIL, password: process.env.E2E_OWNER_PASSWORD },
  player: { email: process.env.E2E_PLAYER_EMAIL, password: process.env.E2E_PLAYER_PASSWORD },
}
const enabled = Object.values(users).every((user) => user.email && user.password)

async function login(page: Page, user: { email?: string; password?: string }) {
  await page.getByLabel('E-mail').fill(user.email!)
  await page.getByLabel('Senha').fill(user.password!)
  await page.getByRole('button', { name: 'Entrar' }).click()
}

async function tokenPositions(page: Page) {
  return page.evaluate(() => window.__TABLETOP_ENGINE__?.tokenPositions() ?? [])
}

async function tokenScreenPosition(page: Page) {
  return page.evaluate(() => window.__TABLETOP_ENGINE__?.tokenScreenPositions()[0] ?? null)
}

test.describe('fatia vertical multiplayer', () => {
  test.setTimeout(180_000)
  test.skip(!enabled, 'Credenciais E2E não configuradas.')
  let ownerContext: BrowserContext
  let playerContext: BrowserContext

  test.beforeEach(async ({ browser }) => {
    ownerContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['clipboard-read', 'clipboard-write'] })
    playerContext = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  })

  test.afterEach(async () => {
    await Promise.race([Promise.all([ownerContext.close(), playerContext.close()]), new Promise((resolve) => setTimeout(resolve, 5_000))])
  })

  test('owner convida, concede token e vê o movimento suave que persiste', async ({}, testInfo) => {
    const owner = await ownerContext.newPage()
    const player = await playerContext.newPage()
    player.on('console', message => { if (message.text().startsWith('Tabletop channel')) console.log('PLAYER', message.text()) })
    const roomName = `Mesa E2E ${Date.now()}`
    const mapPath = testInfo.outputPath('map.png')

    await owner.goto('/auth')
    await owner.screenshot({ path: mapPath })
    await login(owner, users.owner)
    await expect(owner).toHaveURL(/\/rooms$/)
    await owner.getByLabel('Nome da nova sala').fill(roomName)
    await owner.getByRole('button', { name: 'Criar' }).click()
    await owner.getByRole('link', { name: new RegExp(roomName) }).click()
    await expect(owner.getByText(roomName, { exact: true })).toBeVisible()
    await expect(owner.getByTestId('connection-state')).toHaveText('Online', { timeout: 25_000 })

    await owner.getByRole('button', { name: 'Convidar' }).click()
    await owner.getByRole('button', { name: 'Gerar link' }).click()
    const inviteLink = await owner.locator('.invite-link input').inputValue()
    await owner.getByRole('button', { name: 'Fechar' }).click()

    await player.goto(inviteLink)
    await login(player, users.player)
    await expect(player.getByText(roomName, { exact: true })).toBeVisible({ timeout: 25_000 })
    await expect(player.getByTestId('connection-state')).toHaveText('Online', { timeout: 25_000 })

    await owner.getByRole('button', { name: 'Adicionar mapa' }).first().click()
    await owner.getByLabel('Nome da cena').fill('Templo do teste')
    await owner.getByLabel('Imagem do mapa').setInputFiles(mapPath)
    await owner.getByRole('button', { name: 'Criar cena' }).click()
    await expect(owner.locator('.tabletop-title').getByText('Templo do teste', { exact: true })).toBeVisible()
    await expect(player.locator('.tabletop-title').getByText('Templo do teste', { exact: true })).toBeVisible()
    await expect.poll(() => owner.evaluate(() => window.__TABLETOP_ENGINE__?.metrics().backgroundStatus)).toBe('ready')
    await expect.poll(() => player.evaluate(() => window.__TABLETOP_ENGINE__?.metrics().backgroundStatus)).toBe('ready')

    await owner.getByRole('button', { name: 'Criar token' }).click()
    await owner.getByLabel('Nome', { exact: true }).fill('Arqueira E2E')
    await owner.locator('.dialog-card').getByRole('button', { name: 'Criar token' }).click()
    await expect.poll(async () => (await tokenPositions(owner)).length).toBe(1)
    await expect.poll(async () => (await tokenPositions(player)).length).toBe(1)

    const playerCanvas = player.getByLabel('Mesa virtual 2D')
    const playerBox = (await playerCanvas.boundingBox())!
    const playerToken = (await tokenScreenPosition(player))!

    const ownerCanvas = owner.getByLabel('Mesa virtual 2D')
    const ownerBox = (await ownerCanvas.boundingBox())!
    const ownerToken = (await tokenScreenPosition(owner))!
    await ownerCanvas.click({ position: { x: ownerToken.x, y: ownerToken.y } })
    await expect(owner.getByRole('heading', { name: 'Arqueira E2E' })).toBeVisible()
    await owner.getByLabel('Player E2E').check()
    await expect(owner.getByLabel('Player E2E')).toBeChecked()
    await expect.poll(() => player.evaluate(() => window.__TABLETOP_ENGINE__?.controllableTokenIds() ?? [])).toHaveLength(1)

    const before = (await tokenPositions(owner))[0]
    await player.mouse.move(playerBox.x + playerToken.x, playerBox.y + playerToken.y)
    await player.mouse.down()
    await expect.poll(() => player.evaluate(() => window.__TABLETOP_ENGINE__?.metrics().dragging)).toBeTruthy()
    await player.mouse.move(playerBox.x + playerToken.x + 140, playerBox.y + playerToken.y + 70, { steps: 12 })
    await expect.poll(async () => (await tokenPositions(owner))[0]?.x ?? 0).toBeGreaterThan(before.x + 40)
    await player.mouse.up()
    await expect.poll(async () => (await tokenPositions(owner))[0]?.revision).toBeGreaterThan(before.revision)
    await expect.poll(async () => (await tokenPositions(player))[0]?.revision).toBeGreaterThan(before.revision)

    const finalOwner = (await tokenPositions(owner))[0]
    await Promise.all([owner.reload(), player.reload()])
    await expect.poll(async () => (await tokenPositions(owner)).length).toBe(1)
    await expect.poll(async () => (await tokenPositions(player)).length).toBe(1)
    const afterOwner = (await tokenPositions(owner))[0]
    const afterPlayer = (await tokenPositions(player))[0]
    expect(Math.abs(afterOwner.x - finalOwner.x)).toBeLessThan(2)
    expect(afterPlayer.x).toBe(afterOwner.x)
    expect(afterPlayer.y).toBe(afterOwner.y)

    await expect(owner.locator('.presence-stack').getByText('Player E2E')).toBeVisible({ timeout: 20_000 })
    await expect(player.locator('.presence-stack').getByText('Owner E2E')).toBeVisible({ timeout: 20_000 })
    await expect(owner.getByTestId('connection-state')).toHaveText('Online')
    await expect(player.getByTestId('connection-state')).toHaveText('Online')
    const effectsBefore = await player.evaluate(() => window.__TABLETOP_ENGINE__?.metrics().eventsSeen.ping ?? 0)
    await owner.getByRole('button', { name: 'Ping' }).click()
    await ownerCanvas.click({ position: { x: ownerBox.width * .6, y: ownerBox.height * .4 } })
    await expect.poll(async () => player.evaluate(() => window.__TABLETOP_ENGINE__?.metrics().eventsSeen.ping ?? 0)).toBeGreaterThan(effectsBefore)

    await owner.getByRole('button', { name: 'Régua' }).click()
    await owner.mouse.move(ownerBox.x + 400, ownerBox.y + 300)
    await owner.mouse.down()
    await owner.mouse.move(ownerBox.x + 600, ownerBox.y + 430, { steps: 8 })
    await owner.mouse.up()
    await expect.poll(async () => player.evaluate(() => window.__TABLETOP_ENGINE__?.metrics().eventsSeen.measure ?? 0)).toBeGreaterThan(0)

    // Camera state is local and must not be reset by a durable snapshot.
    const cameraBefore = await owner.evaluate(() => window.__TABLETOP_ENGINE__!.metrics().camera)
    const playerCamera = await player.evaluate(() => window.__TABLETOP_ENGINE__!.metrics().camera)
    await owner.getByRole('button', { name: 'Mover câmera' }).click()
    await owner.mouse.move(ownerBox.x + 500, ownerBox.y + 400)
    await owner.mouse.down()
    await owner.mouse.move(ownerBox.x + 580, ownerBox.y + 440, { steps: 8 })
    await owner.mouse.up()
    await owner.mouse.wheel(0, -240)
    await expect.poll(() => owner.evaluate(() => window.__TABLETOP_ENGINE__!.metrics().camera.zoom)).toBeGreaterThan(cameraBefore.zoom)
    expect(await player.evaluate(() => window.__TABLETOP_ENGINE__!.metrics().camera)).toEqual(playerCamera)
    await owner.getByRole('button', { name: 'Configurar grid' }).click()
    await owner.getByLabel('Célula').fill('80')
    await owner.getByRole('button', { name: 'Salvar grid' }).click()
    await expect(owner.getByRole('dialog')).toHaveCount(0)
    await owner.screenshot({ path: testInfo.outputPath('tabletop-owner.png') })

    // A transport reconnect must load the snapshot; it cannot replay old Broadcasts.
    await playerContext.setOffline(true)
    await expect(player.getByTestId('connection-state')).toHaveText('Conectando…')
    await playerContext.setOffline(false)
    await expect(player.getByTestId('connection-state')).toHaveText('Online', { timeout: 25_000 })
    await expect.poll(async () => (await tokenPositions(player))[0]?.x).toBe(afterPlayer.x)

    await owner.getByRole('button', { name: 'Adicionar mapa' }).click()
    await owner.getByLabel('Nome da cena').fill('Segunda cena')
    await owner.getByLabel('Imagem do mapa').setInputFiles(mapPath)
    await owner.getByRole('button', { name: 'Criar cena' }).click()
    await expect(owner.locator('.tabletop-title').getByText('Segunda cena', { exact: true })).toBeVisible()
    await expect(player.locator('.tabletop-title').getByText('Segunda cena', { exact: true })).toBeVisible()
    await expect.poll(async () => (await tokenPositions(player)).length).toBe(0)

    await owner.getByRole('button', { name: 'Menu da sala' }).click()
    owner.once('dialog', (dialog) => dialog.accept())
    await owner.getByRole('button', { name: 'Excluir sala' }).click()
    await expect(owner).toHaveURL(/\/rooms$/)
  })
})

test('benchmark mantém 200 tokens renderizados', async ({ page }, testInfo) => {
  await page.goto('/benchmark')
  await expect(page.getByText('Cenário de carga')).toBeVisible()
  await expect.poll(async () => (await page.evaluate(() => window.__TABLETOP_ENGINE__?.metrics().tokenCount ?? 0))).toBe(200)
  await expect.poll(() => page.evaluate(() => window.__TABLETOP_ENGINE__?.metrics().backgroundStatus), { timeout: 15000 }).toBe('ready')
  await expect.poll(async () => Number(await page.getByTestId('benchmark-fps').textContent()), { timeout: 20_000 }).toBeGreaterThan(0)
  await page.mouse.move(600, 400)
  await page.mouse.wheel(0, -150)
  await page.mouse.down()
  await page.mouse.move(650, 440, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(4000)
  const report = await page.evaluate(() => {
    const engine = window.__TABLETOP_ENGINE__!
    const canvas = document.querySelector('canvas')!
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    const debug = gl?.getExtension('WEBGL_debug_renderer_info')
    return { ...engine.metrics(), renderer: debug ? gl!.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable', userAgent: navigator.userAgent, viewport: { width: innerWidth, height: innerHeight }, note: '15 Hz simulated locally; no network Broadcasts' }
  })
  console.log('BENCHMARK', JSON.stringify(report))
  expect(report.renderer).toMatch(/SwiftShader|llvmpipe|ANGLE|NVIDIA|AMD|Intel|Apple/i)
  await testInfo.attach('benchmark.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' })
  await page.screenshot({ path: testInfo.outputPath('benchmark.png') })
})

test('WebGL context loss and unavailable asset do not destroy the board', async ({ page }) => {
  await page.goto('/benchmark')
  await expect.poll(() => page.evaluate(() => window.__TABLETOP_ENGINE__?.metrics().backgroundStatus), { timeout: 25_000 }).toBe('ready')
  const supported = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')!
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    const extension = gl?.getExtension('WEBGL_lose_context')
    if (!extension) return false
    extension.loseContext()
    setTimeout(() => extension.restoreContext(), 500)
    return true
  })
  test.skip(!supported, 'Browser does not expose WEBGL_lose_context')
  await page.waitForTimeout(1500)
  await expect.poll(() => page.evaluate(() => window.__TABLETOP_ENGINE__?.metrics().tokenCount)).toBe(200)
  await page.evaluate(() => window.__TABLETOP_ENGINE__!.setBackground('/missing-map.png', 4096, 4096))
  await expect.poll(() => page.evaluate(() => window.__TABLETOP_ENGINE__?.metrics().backgroundStatus)).toBe('error')
  expect(await page.evaluate(() => window.__TABLETOP_ENGINE__?.metrics().tokenCount)).toBe(200)
})
