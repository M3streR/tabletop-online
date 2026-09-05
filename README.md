# Mesa — Tabletop Online

VTT genérico, online-first e independente. Nome de engenharia: `tabletop-online`.
Este código não importa, reutiliza ou depende do repositório ou Supabase da ficha de Crônicas da Ressonância.

## Estado

Primeira fatia vertical em validação. **Ainda não é uma entrega concluída para uso público.**
Veja [o relatório de implementação](docs/IMPLEMENTATION.md) para evidências, limites e pendências.

## Desenvolvimento

Requer Node 24 e pnpm 11.19.0.

```sh
pnpm install --frozen-lockfile
```

Copie `.env.example` para `.env.local` e configure somente a URL e a chave **publishable** do projeto Supabase exclusivo do Tabletop. Nunca coloque `service_role`, chave secreta ou senha de banco em variáveis `VITE_*`.

```sh
pnpm dev
pnpm build
pnpm test
pnpm test:e2e
```

Para integração real e duas sessões, configure um arquivo ignorado `.env.e2e.local`:

```dotenv
E2E_OWNER_EMAIL=
E2E_OWNER_PASSWORD=
E2E_PLAYER_EMAIL=
E2E_PLAYER_PASSWORD=
E2E_EXTERNAL_EMAIL=
E2E_EXTERNAL_PASSWORD=
```

As três contas precisam ser distintas e confirmadas no **projeto de teste autorizado**. Não use contas ou dados de produção. As suítes criam salas temporárias; falhas abruptas podem deixar dados de teste, que devem ser removidos de forma escopada. Sem credenciais, os testes de integração são ignorados, não aprovados.

```sh
node --env-file=.env.e2e.local node_modules/vitest/vitest.mjs run
node --env-file=.env.e2e.local node_modules/@playwright/test/cli.js test
```

## Banco e configuração externa

Projeto remoto exclusivo: `gpjeuhrdjcmsfwxymjyd`, nome `tabletop-online`, região `sa-east-1`.
As quatro migrations locais correspondem às versões já aplicadas nesse projeto. Não reaplique como migrations novas. Para um projeto limpo, aplique-as em ordem.

O arquivo `supabase/config.toml` configura **desenvolvimento local**, não altera automaticamente as opções do projeto remoto. No dashboard remoto:

- Configurar Site URL e redirect allowlist com o domínio final e os caminhos de convite.
- Manter confirmação de e-mail e configurar SMTP para cadastros externos.
- Conferir CAPTCHA/rate limits e proteção de senhas antes de abertura pública.

Não desabilitar confirmação de e-mail apenas para fazer um teste passar.

## Benchmark

Abra `/benchmark`: imagem PNG gerada de 4096², 200 tokens, grid e previews locais a aproximadamente 15 Hz. Exibe FPS, frame e heap quando disponível. Não representa tráfego de rede real. O teste de navegador anexa um JSON com renderer, viewport e memória estimada das texturas.

O desempenho em SwiftShader (GPU emulada por CPU) não certifica a meta em hardware real. A aceitação do produto exige nova medição com GPU, duas sessões e diferentes mapas.

## Limites iniciais

- Mapas PNG/JPEG/WebP estáticos: 20 MB, até 4096 por lado.
- Imagens de token: 5 MB, até 2048 por lado.
- Grid quadrado, câmera local, sem regras específicas de RPG.
- Fog, chat, dados, fichas, combate, iluminação, áudio/vídeo, tiles e plugins estão fora do pacote.
