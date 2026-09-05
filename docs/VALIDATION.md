# Validação — 4 de setembro de 2026

## Resultado atual

- TypeScript: passou.
- Build Vite de produção: passou; chunks separados para autenticação, mesa e Pixi.
- Vitest: **19 testes passaram** (11 unitários e 8 de integração real no Supabase exclusivo).
- Playwright: **3 testes passaram em uma única execução final**: cenário multiplayer, benchmark instrumentado e recuperação de WebGL/asset indisponível.

## Fluxo real de duas sessões

Owner e player usam contextos isolados Chromium, conectados ao Supabase remoto. O teste:

1. Faz login, cria sala e gera convite.
2. Player abre convite antes de login e entra na sala correta após autenticar.
3. Owner envia PNG e ambos confirmam textura carregada.
4. Owner cria token e concede controle ao player.
5. Player adquire lease e arrasta; owner vê coordenadas intermediárias antes da soltura.
6. Commit incrementa revisão; ambos recarregam e mantêm posição idêntica.
7. Ping, régua e Presence são observados no outro navegador.
8. Pan/zoom são locais; grid pode ser salvo.
9. Player perde rede, recebe estado de reconexão e volta Online após novo snapshot.
10. Owner cria/ativa segunda cena; player troca de cena e não mantém tokens da anterior.
11. Owner exclui a sala de teste.

O arquivo usado no teste como mapa é uma captura da página de autenticação, apenas um fixture PNG. A screenshot da mesa não representa arte final de mapa nem uma cena de RPG fornecida pelo usuário.

## Segurança testada de verdade

Usuário externo não lê sala/token/transform nem obtém URL de Storage; é recusado ao assinar o canal privado. Player consegue assinar. Player sem grant não adquire lease, não altera token arbitrário e não cria cena. Cena inativa e token GM-only não são retornados. Lease direto retorna permission denied. Arrastos concorrentes (também mesma conta) são recusados; lease expirado pode ser adquirido novamente. Revogação de grant impede renovação e commit. Token removido invalida commit. GM cria cena, mas não promove player, não reescreve papel de convite e não exclui sala.

## Correções encontradas durante a retomada

- Vitest estava incluindo arquivos Playwright: agora a seleção é explícita.
- Testes de WebSocket em jsdom colidiam com Event do Node: integração usa ambiente Node.
- Teste capturava preview interpolado como se fosse posição confirmada: agora aguarda revisão persistida.
- Fechar e recriar o mesmo canal sem aguardar o encerramento podia remover a nova inscrição: teardown idempotente e serializado.
- Preview remoto agora é condicionado a lease/revisão e expira visualmente; snap só na soltura.
- Dimensões reais são verificadas antes da decodificação/GPU, inclusive no cliente receptor.
- Cache global de imagens foi substituído por texturas pertencentes à mesa.
- Migrations locais foram alinhadas aos timestamps remotos, sem reaplicar SQL.

## Benchmark observado

Chromium 151 headless, Windows, viewport 1280 × 720, renderer ANGLE Vulkan **SwiftShader** (software, não GPU física). Imagem PNG 4096 × 4096, grid TilingSprite e 200 tokens visíveis; um movimento interpolado com entrada simulada a ~15 Hz; pan/zoom executados.

| Medida | Observação |
| --- | --- |
| FPS | 7,5–8,2 nas duas execuções |
| Tempo médio de frame | 122,7–134,0 ms |
| Textura do mapa estimada | 64 MiB, sem contar buffers/driver/textos |
| Heap JS na captura | aproximadamente 54 MB; não é memória GPU |
| Broadcasts no benchmark | zero; previews são simulados localmente |
| Tokens renderizados | 200 |

**Performance não aprovada como meta de produto.** O teste atual é um smoke test (>5 FPS), não uma aceitação de fluidez. Repetir em desktop com GPU, medir percentis de frame e tráfego real sustentado antes de liberar.

O teste final não exige um mínimo artificial de FPS em SwiftShader: exige métrica positiva e identifica explicitamente o renderer, evitando confundir fallback por software com GPU física.

## Ainda não comprovado

Cadastro com entrega/confirmação real de e-mail; uso publicado por convidado externo; abertura de repositório GitHub; GPU física; uso prolongado; muitos assets distintos; expiração/revogação concorrente de convites; garantias adversariais para identidade de eventos Broadcast. Inspeção visual confirma mapa ocupando a área principal, mas não substitui avaliação de usabilidade com usuários.

As contas E2E são dedicadas, não contas reais do usuário; credenciais ficam apenas no arquivo local ignorado. Dados temporários de execuções interrompidas devem ser limpos pelo script escopado `scripts/cleanup-e2e.mjs`.
