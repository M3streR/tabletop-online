import { expect, test, type Page } from '@playwright/test'

const enabled = Boolean(process.env.PLAYWRIGHT_BASE_URL && process.env.E2E_OWNER_EMAIL && process.env.E2E_OWNER_PASSWORD && process.env.E2E_PLAYER_EMAIL && process.env.E2E_PLAYER_PASSWORD)

async function login(page: Page, email: string, password: string) {
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
}

test('GitHub Pages suporta a sessão essencial pela interface pública', async ({ browser }, testInfo) => {
  test.skip(!enabled, 'Executado somente contra a URL pública com contas E2E.')
  test.setTimeout(300_000)
  const ownerContext = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const playerContext = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const owner = await ownerContext.newPage()
  const player = await playerContext.newPage()
  const criticalErrors: string[] = []
  owner.on('pageerror', (error) => criticalErrors.push(`owner: ${error.message}`))
  player.on('pageerror', (error) => criticalErrors.push(`player: ${error.message}`))
  const roomName = `Mesa Produção ${Date.now()}`
  const mapPath = testInfo.outputPath('public-map.png')
  const tokenPath = testInfo.outputPath('public-character.png')

  try {
    const assets = await ownerContext.newPage()
    await assets.setViewportSize({ width: 1280, height: 800 })
    await assets.setContent('<style>html,body{margin:0;background:#18252c;color:#fff;font:48px system-ui}.map{height:100vh;display:grid;place-items:center;background:linear-gradient(135deg,#18363c,#11151c)}.map:after{content:"MAPA DE PRODUÇÃO"}</style><div class="map"></div>')
    await assets.screenshot({ path: mapPath })
    await assets.setViewportSize({ width: 240, height: 520 })
    await assets.setContent('<style>html,body{margin:0;background:transparent}.figure{position:absolute;left:92px;top:18px;width:56px;height:480px;background:linear-gradient(#64dfd2,#724ee8);clip-path:polygon(50% 0,72% 12%,67% 31%,86% 56%,68% 58%,64% 100%,36% 100%,32% 58%,14% 56%,33% 31%,28% 12%)}</style><div class="figure"></div>')
    await assets.screenshot({ path: tokenPath, omitBackground: true })
    await assets.close()

    await owner.goto('./auth')
    await login(owner, process.env.E2E_OWNER_EMAIL!, process.env.E2E_OWNER_PASSWORD!)
    await expect(owner).toHaveURL(/\/rooms$/)
    await owner.getByLabel('Nome da nova sala').fill(roomName)
    await owner.getByRole('button', { name: 'Criar' }).click()
    await owner.getByRole('link', { name: new RegExp(roomName) }).click()
    await expect(owner.getByTestId('connection-state')).toHaveText('Online', { timeout: 25_000 })

    await owner.getByRole('button', { name: 'Convidar' }).click()
    await owner.getByRole('button', { name: 'Gerar link' }).click()
    const invite = await owner.locator('.invite-link input').inputValue()
    expect(invite).toContain('/tabletop-online/invite/')
    await player.goto(invite)
    await login(player, process.env.E2E_PLAYER_EMAIL!, process.env.E2E_PLAYER_PASSWORD!)
    await expect(player.getByText(roomName, { exact: true })).toBeVisible({ timeout: 25_000 })

    await owner.getByRole('button', { name: 'Fechar' }).click()
    await owner.getByRole('button', { name: 'Adicionar mapa' }).first().click()
    await owner.getByLabel('Nome da cena').fill('Mapa público')
    await owner.getByLabel('Imagem do mapa').setInputFiles(mapPath)
    await owner.getByRole('button', { name: 'Criar cena' }).click()
    await expect(player.locator('.tabletop-title').getByText('Mapa público', { exact: true })).toBeVisible({ timeout: 25_000 })

    await owner.getByRole('button', { name: 'Criar token' }).click()
    await owner.getByLabel('Nome', { exact: true }).fill('Personagem público')
    await owner.getByLabel('Tamanho').fill('180')
    await owner.getByLabel('Imagem opcional').setInputFiles(tokenPath)
    await owner.locator('.dialog-card').getByRole('button', { name: 'Criar token' }).click()
    await owner.waitForTimeout(16_000)

    const ownerCanvas = owner.getByLabel('Mesa virtual 2D')
    const playerCanvas = player.getByLabel('Mesa virtual 2D')
    const ownerBox = (await ownerCanvas.boundingBox())!
    const playerBox = (await playerCanvas.boundingBox())!
    const tokenPoint = { x: ownerBox.width / 2, y: ownerBox.height / 2 - 70 }
    await ownerCanvas.click({ position: tokenPoint })
    await expect(owner.getByRole('heading', { name: 'Personagem público' })).toBeVisible()
    await owner.getByLabel('Player E2E').check()
    await owner.waitForTimeout(16_000)

    await playerCanvas.click({ position: { x: playerBox.width / 2, y: playerBox.height / 2 - 70 } })
    await expect(player.getByText('Você controla este token.')).toBeVisible()
    await player.mouse.move(playerBox.x + playerBox.width / 2, playerBox.y + playerBox.height / 2 - 70)
    await player.mouse.down()
    await player.mouse.move(playerBox.x + playerBox.width / 2 + 140, playerBox.y + playerBox.height / 2)
    await player.mouse.up()
    await player.waitForTimeout(16_000)

    for (const [page, box] of [[owner, ownerBox], [player, playerBox]] as const) {
      await page.getByRole('button', { name: 'Régua' }).click()
      await page.mouse.move(box.x + 350, box.y + 280)
      await page.mouse.down()
      await page.mouse.move(box.x + 560, box.y + 410)
      await page.mouse.up()
    }

    await Promise.all([owner.reload(), player.reload()])
    await expect(owner.getByText(roomName, { exact: true })).toBeVisible({ timeout: 25_000 })
    await expect(player.getByText(roomName, { exact: true })).toBeVisible({ timeout: 25_000 })
    await expect(owner.getByLabel('Mesa virtual 2D')).toBeVisible()
    await expect(player.getByLabel('Mesa virtual 2D')).toBeVisible()
    await owner.screenshot({ path: testInfo.outputPath('github-pages-session.png') })
    expect(criticalErrors).toEqual([])

    await owner.getByRole('button', { name: 'Menu da sala' }).click()
    owner.once('dialog', (dialog) => dialog.accept())
    await owner.getByRole('button', { name: 'Excluir sala' }).click()
    await expect(owner).toHaveURL(/\/rooms$/)
  } finally {
    await Promise.allSettled([ownerContext.close(), playerContext.close()])
  }
})
