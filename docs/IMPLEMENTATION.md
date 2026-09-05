# Relatório de implementação — checkpoint

## Situação geral

Implementado com Supabase remoto próprio. Ainda em validação e **não marcado como concluído**. O fluxo principal já executou com duas contas reais de teste, mas faltam liberação externa e validações descritas abaixo.

## 1. Repositório

Git local independente, branch `codex/first-playable`. Checkpoint inicial `1d6e9aa`.
Nome pretendido no GitHub: `M3streR/tabletop-online`, privado.
O conector disponível não permite criar repositórios e o navegador disponível pediu login. Nenhum repositório da ficha foi usado. GitHub/PR/push final ainda pendentes.

## 2. Supabase

Projeto `tabletop-online`, ref `gpjeuhrdjcmsfwxymjyd`, região `sa-east-1`. Auth, PostgreSQL, Storage e Realtime exclusivos. Nenhuma chave administrativa no cliente. A URL e a publishable key locais são ignoradas pelo Git.

## 3. Arquitetura

React + TypeScript + Vite; React Router; TanStack Query para snapshots e mutações; PixiJS 8 em WebGL; supabase-js; Zod para mensagens. Pointer Events são processados diretamente pelo motor de mesa, sem rerender React por movimento. Câmera transforma um container `world` com background, grid, tokens, effects e selection/tools.

## 4. Schema

| Tabela | Responsabilidade |
| --- | --- |
| profiles | Nome de exibição; nunca autoridade de papel |
| rooms | Sala privada, owner e tópico Realtime |
| room_members | Membership de gm/player; owner vem de rooms |
| room_invites | Hash SHA-256 de segredo aleatório, papel, expiração, revogação e usos |
| room_state | Cena ativa da sala |
| media_assets | Metadados, bucket, caminho interno, dimensões e estado de upload |
| scenes | Fundo, espaço do mapa e configuração do grid |
| tokens | Nome, aparência, cena, visibilidade e bloqueio |
| token_transforms | Posição confirmada e revisão monotônica |
| token_control_grants | Controle explícito concedido a membros |
| token_leases | Exclusão temporária de arrasto; acesso direto negado |

IDs internos e relacionamentos compostos impedem vincular objetos de salas diferentes. Assets não são cenas. Uma sala pode ter várias cenas; o player só lê a cena ativa.

## 5. Migrations

Aplicadas e versionadas, com nomes locais alinhados ao histórico remoto:

1. `20260904171610_initial_tabletop_schema.sql`: schema, RPCs, triggers, RLS, buckets e publicação Realtime.
2. `20260904173749_harden_and_index_schema.sql`: índices de FKs e negação explícita para leases.
3. `20260904174337_fix_insert_returning_policies.sql`: políticas que permitem INSERT RETURNING sem lookup da linha ainda invisível.
4. `20260904221958_security_review.sql`: colunas mutáveis restritas, lease concorrente inclusive entre abas da mesma conta, renovação com permissão atual e commit serializado.

## 6. RLS e permissões

RLS em todas as tabelas públicas. Policies no servidor, não só botões ocultos. Helpers em schema privado evitam recursão de membership. Owner administra/exclui; GM administra sessão sem promoção de privilégios ou exclusão da sala; player só lê estado permitido e move via RPC com grant.

As RPCs de convite/lease/commit usam SECURITY DEFINER intencionalmente, com search_path fixo, verificações explícitas e EXECUTE revogado de PUBLIC/anon. O advisor ainda aponta seis RPCs privilegiadas acessíveis por authenticated; isso exige manter revisão de autorização, não remover o aviso indiscriminadamente. Também há aviso de proteção contra senhas vazadas desabilitada no Auth.

## 7. Storage

Buckets privados `room-maps` (20 MB) e `room-tokens` (5 MB), MIME permitido PNG/JPEG/WebP. Chaves `roomId/assetId/randomId.ext`, nunca o nome fornecido pelo usuário. Policies cruzam caminho com metadados e visibilidade. Apenas owner/GM fazem upload.

Upload cria metadata pendente, envia objeto sem sobrescrever e marca ready. Falha não substitui mapa anterior. Imagens são inspecionadas no upload e novamente pelo receptor antes de decodificação/GPU. Texturas pertencem à mesa e são liberadas, em vez de ficar indefinidamente no cache global do Pixi.

URLs assinadas duram uma hora, com cache local de 45 minutos. Uma URL já emitida pode continuar válida após revogação; dados já baixados não podem ser recolhidos. Isso não equivale a bucket público.

## 8. Realtime

Canal privado por sala, policies de membership em `realtime.messages`. Broadcast para drag/ping/régua, Presence para conectados, Postgres Changes para invalidar snapshots persistentes. Reconciliação periódica de 15 segundos; novo snapshot após SUBSCRIBED e retorno da rede.

Sem rotação de tópicos. A revogação no banco impede novos acessos persistentes, mas autorização de uma conexão Realtime já aberta não deve ser tratada como expulsão instantânea de um cliente malicioso. O cliente normal se reconcilia; expulsão rígida de canais fica para evolução futura.

## 9. Protocolo de movimento

Protocolo `v: 1` validado com Zod; IDs de evento, sala, cena, usuário, token, gesto, lease, sequência e revisão. Preview local imediato após adquirir lease; no máximo um move por 67 ms (~15 Hz); interpolação remota; snap na soltura; commit com revisão esperada; evento final apenas solicita estado confirmado.

O receptor compara preview com lease atual via leitura coalescida por token (até uma consulta/segundo de arrasto), ignora revisões/sequências antigas e volta à posição confirmada se o preview parar. Não há UPDATE de posição por pointermove. O envio direto pelo cliente **não autentica criptograficamente userId**; a verificação de lease reduz spoofing, mas um membro malicioso que observe um lease válido ainda pode falsificar preview. Não pode persistir esse movimento sem seu próprio auth.uid autorizado. Relay autenticado/per-sender topic é uma melhoria de segurança antes de ambientes adversariais.

## 10. Lease

Token, usuário, lease aleatório e expiração de 10 segundos. Aquisição atômica via UPSERT condicional; renovação a cada 5 segundos; segundo arrasto recebe TOKEN_BUSY, inclusive outra aba do mesmo usuário. Commit trava a linha, valida permissão atual, validade, limites e revisão; incrementa revisão e libera lease. Desconexão não bloqueia para sempre.

## 11. Funcionalidades

Login/logout/sessão; formulário de cadastro; salas privadas/listagem/criação/saída/exclusão owner; convites por link com retorno após autenticação; cenas e seleção da ativa; upload privado; pan/zoom local; grid eficiente TilingSprite; tokens com fallback, nome, tamanho, cor, seleção, lock, visibilidade e grants; drag multiplayer, persistência, ping, régua e Presence discreto.

## 12. Arquivos principais

- `src/features/auth/`: sessão e formulários.
- `src/features/rooms/`: salas e aceitação de convite.
- `src/features/tabletop/`: integração, mesa e painéis contextuais.
- `src/data/`: cliente, tipos gerados e operações persistentes.
- `src/rendering/`: Pixi, câmera, grid, validação de imagem e texturas.
- `src/realtime/`: canal, protocolo e validação de preview.
- `supabase/migrations/`: schema e segurança.
- `src/test/` e `tests/e2e/`: integração RLS e sessões de navegador.

## 13–15. Testes, resultados e benchmark

Evidências atualizadas em `docs/VALIDATION.md`. Sem credenciais, um teste ignorado não conta como aprovação. Benchmark de 200 tokens é observação, não selo de performance.

## 16–17. Limitações e pendências

- Cadastro/confirmacão de e-mail real ainda não foi validado: os testes usam contas provisionadas especificamente para E2E. Auth remoto exige confirmação. SMTP/redirects do domínio final precisam ser configurados e testados; não foram desativadas proteções para contornar essa etapa.
- GitHub ainda depende de login/criação do novo repositório.
- Publicação/domínio e acesso de convidados externos ainda não liberados. Manifesto Sites existente é apenas registro de hospedagem, não prova de deploy.
- Performance em GPU física não medida; medição em SwiftShader ficou muito abaixo da meta de fluidez. Testar desktop real antes de aceitar o pacote.
- Assets são limitados por arquivo, não por um orçamento total de texturas da sala. Duzentas imagens distintas de 2048² podem exceder memória: falta orçamento agregado/downscale de token em projetos mais pesados.
- Validação de dimensões no receptor protege o cliente oficial; não há pipeline de validação server-side do conteúdo binário. MIME/tamanho são limitados pelo Storage.
- Exclusão de sala remove Storage antes do banco; não é uma transação única entre ambos. Uma falha na segunda etapa pode exigir recuperação/limpeza manual. Upload interrompido pode deixar metadata/objeto órfão; falta limpeza periódica.
- Imagem de token pode ser definida na criação; troca da imagem de token existente ainda não tem interface. Sem editor de fundo de cena existente; criar outra cena é o fluxo atual.
- UI com responsividade básica, sem certificação de acessibilidade completa/mobile. Controles de câmera centrados no ponteiro e botões; sem atalhos avançados.
- Controle de abuso/rate limit confiável por remetente de Broadcast não implementado. Eventos efêmeros são não autoritativos.
- Sem teste automatizado de entrega de e-mail, de corrida entre múltiplos convites expirados/revogados, nem teste prolongado de memória por horas.
- Fora de escopo deliberado: fog, chat, dados, ficha, iniciativa/combate, desenho persistente, luz/paredes, AV, macros/marketplace/plugins, anônimos, WebRTC, tiles e undo complexo.

## 18. Versionamento

Branch local `codex/first-playable`; use `git log -1` para o checkpoint mais recente. Sem PR remoto enquanto o GitHub estiver bloqueado. Não há vínculo técnico com a ficha.
