# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Comandos

- `npm start` — roda o agente em modo Telegram (padrão). Requer `TELEGRAM_BOT_TOKEN` no `.env`.
- `npm run cli` — REPL local. Mais rápido para iterar em prompts/tools sem subir o bot.
- `npm test` — suíte automatizada via Node native test runner (`node --test`). Cobre helpers puros, renderers da Memory Wiki, construção de criteria/query do wrapper GLPI (com fetch mockado) e integridade de schema (toda TOOLS tem case em runTool e vice-versa). Roda offline, < 500ms, sem dependência de `.env` ou GLPI.
- `npm run test:glpi` — smoke live separado: `node tools/glpi.js test`. Faz initSession, lista 5 chamados abertos e dumpa as searchOptions de Ticket. Exige `.env` configurado. Primeiro passo quando há suspeita de problema de credencial/conectividade GLPI.
- Modo também pode ser forçado por `MODE=cli` no `.env` ou `node bot.js cli`.

Não há linter configurado. Testes automatizados em [test/](test/) (4 arquivos, 55 testes): `helpers.test.js`, `renderers.test.js`, `glpi.test.js` (mock fetch), `schema.test.js` (meta-teste TOOLS↔runTool).

## Arquitetura

Agente single-process em [bot.js](bot.js) que orquestra três camadas:

**1. System prompt = Memory Wiki + SOUL.md** ([bot.js:210-235](bot.js#L210-L235))
   - 6 YAMLs em [memory-wiki/](memory-wiki/) (`profile`, `stack`, `projects`, `decisions`, `people`, `working`) são lidos no startup e renderizados em markdown estruturado por funções dedicadas (`renderProfile`, `renderStack`, etc.). Cada arquivo tem seu renderer — se você adicionar campo no YAML, atualize o renderer correspondente.
   - O markdown da wiki é prependado a [SOUL.md](SOUL.md) e injetado como `system` em toda chamada de chat. SOUL.md é a "persona/regras" do agente; a wiki são fatos de contexto.
   - Wiki é **read-only** pelo agente em runtime. Apenas `working.yaml` pode ser editada (com confirmação humana). PROFILE/STACK/PROJECTS/DECISIONS/PEOPLE são fatos congelados que o usuário edita à mão.

**2. Loop de tool calling** ([bot.js:579-621](bot.js#L579-L621))
   - Usa o **OpenAI SDK apontado para Ollama** por padrão (`baseURL=http://localhost:11434/v1`, `apiKey="ollama"`). Se `OPENAI_API_KEY` estiver setada e `PROVIDER !== "ollama"`, troca para OpenAI cloud.
   - Loop síncrono com `MAX_TOOL_ROUNDS=8`. Cada turno preserva o `assistant` message com `tool_calls` exatamente como o modelo emitiu (crítico — sem isso o próximo turno quebra com "tool_call_id sem assistant correspondente").
   - Erros de tool viram `{error: "..."}` e voltam pro modelo como conteúdo de tool com prefixo `ERROR:` — o modelo decide se pede confirmação humana ou tenta outro caminho.
   - Conversas Telegram são keyed por `chatId` (Map), truncadas a 40 mensagens.

**3. Wrapper GLPI REST** ([tools/glpi.js](tools/glpi.js))
   - 19 funções (todas exportadas) cobrem: list/search/get tickets, update/priority/status, assign user/group, follow-up, solve, close, list categories/groups, Problem_Ticket link, filtro por fornecedor, filtro por etiqueta e add/remove de etiqueta (plugin Tag).
   - **Auth**: `initSession` envia `App-Token` como header **E** query string (`?app_token=...`) — alguns proxies reversos descartam headers custom mas a query sempre passa. Bug histórico do GLPI.
   - Session token é cacheado no módulo (`let sessionToken`) e reusado em todas as chamadas. `killSession` é chamado apenas no exit do CLI.
   - Buscas usam o endpoint `/search/Ticket` com criteria numerados (campo 1=titulo, 12=status, 19=date_mod, 21=conteudo). `TICKET_DISPLAY` força o conjunto de colunas retornadas. As IDs de campo vêm de [tools/glpi-search-options.json](tools/glpi-search-options.json) (snapshot de `/listSearchOptions/Ticket`).
   - Ao adicionar uma tool: **a definição em [bot.js](bot.js) (TOOLS array + runTool switch) e a função em [tools/glpi.js](tools/glpi.js) andam juntas**. Esquecer de exportar e mapear no switch é o erro mais comum.

**4. Scheduler diário de Problem 206** ([bot.js:500-577](bot.js#L500-L577))
   - Às 9h locais varre chamados abertos cujo título/conteúdo contém keywords (atualmente `["baixa", "cupons"]`), cruza com `listProblemTickets(206)` e manda no Telegram do owner os candidatos novos (não vinculados ainda).
   - Owner = `TELEGRAM_OWNER_CHAT_ID` (descoberto via `/id` no chat). Sem essa env, scheduler é desativado com warning.
   - Comandos do bot: `/start`, `/id` (mostra chatId), `/sweep` (roda a varredura sob demanda).

**5. Consultas personalizadas via plugin utilsdashboards** ([tools/customQuery.js](tools/customQuery.js))
   - Plugin GLPI `utilsdashboards` expõe SQL arbitrária como endpoint JSON: `${GLPI_DASHBOARDS_BASE_URL}?token=<token>` retorna `{name, comment, data: [...]}`. Usado pra cruzamentos que `/search/Ticket` não cobre (ex: última interação por chamado vinda de followups+tasks unidos).
   - Catálogo em [memory-wiki/stack.yaml](memory-wiki/stack.yaml) sob `consultas_personalizadas` — cada entrada tem `nome`, `descricao`, `colunas`, `token_env`. Token real em `.env` como `GLPI_QUERY_TOKEN_*`. Adicionar query nova é editar 2 arquivos: stack.yaml + .env.
   - O renderer `renderStack` ([bot.js](bot.js)) imprime o catálogo como tabela no system prompt, então o agente vê os nomes disponíveis e a tool `fetch_custom_query(name)` resolve nome→token.
   - Tool processa o response: decodifica entidades HTML duplo-encoded (`&#60;` → `<`) e strip de tags em campos `content`, devolvendo texto limpo. Helpers exportados: `decodeHtmlEntities`, `stripHtml`, `cleanContent`.
   - **Regra de roteamento**: catálogo tem precedência sobre tools nativas. Se o pedido casa com nome de consulta, usa a custom; senão cai em `search_tickets`/`list_tickets_by_*`.

**6. Geração de dashboards HTML on-demand** ([tools/dashboard.js](tools/dashboard.js) + [skills/dashboard/](skills/dashboard/))
   - Tool `generate_dashboard(title, description, data)`: o agente busca dados primeiro com tools de leitura, depois passa o JSON cru pra essa tool, que gera um HTML standalone (ECharts inline, dados embutidos) em `dashboards/<slug>-<timestamp>.html` e devolve `{path, url}`.
   - **Skill** em `skills/dashboard/` (lida no startup do módulo, cacheada): `SKILL.md` (regras de output/layout/paleta) + `glossary.md` (mapeamentos canônicos de campos GLPI: status 1-6, prioridade 1-5, IDs de search) + `archetypes/*.html` (KPI cards, top-bar, time-series, heatmap, pivot-table — referência de estilo, não templates fechados).
   - **Modelo separado**: usa `MODEL_DASHBOARD` (env) caindo em `MODEL` se ausente. HTML é exigente — manter agente no Ollama leve e a geração de dashboard num modelo robusto (gpt-4o-mini, qwen2.5-coder, etc.) é o padrão. Cliente OpenAI próprio dentro de [tools/dashboard.js](tools/dashboard.js) — o cliente do `bot.js` não é reusado porque o `model` precisa ser override por chamada.
   - **Validação**: faz strip de fences markdown e checa se o output começa com `<!doctype html|<html`. Output bruto que não bate vira erro lançado de volta pro loop de tool calling.
   - **Não-objetivos do MVP**: sem proxy de dados live, sem auto-open do navegador, sem auth na intranet. Saída é file:// — usuário copia o url e abre. Próximas iterações tratam disso (ver `iniciativas_ativas` em projects.yaml).

## Regras operacionais que vinculam código e prompt

A semântica do agente em runtime é definida em [SOUL.md](SOUL.md). Ao mexer em tools ou no loop, leia SOUL.md primeiro — várias decisões de código são contratos com o prompt:

- **Toda tool de escrita exige confirmação humana antes da chamada.** Lista canônica: `update_ticket`, `set_priority`, `set_status`, `assign_to_user`, `assign_to_group`, `add_followup`, `solve_ticket`, `close_ticket`, `link_ticket_to_problem`. Se você adicionar uma tool de escrita, ela deve constar no SOUL e seguir o fluxo "propor → esperar ok → executar uma por vez".
- **Prioridade nunca é livre**. Sempre derivada da matriz urgência × impacto em SOUL.md. Toda mudança de prioridade exige `add_followup` privado explicando o cálculo.
- **`solve_ticket` antes de `close_ticket`**. `solve_ticket` cria um `ITILSolution` e seta status=5; só depois `close_ticket` pode setar status=6. Nunca pular.
- **`search_tickets` vs `list_open_tickets`** são tools distintas no contrato. Pedidos do tipo "chamados sobre X" usam `search_tickets` — nunca filtrar em cima do retorno de `list_open_tickets`.
- **Anti-alucinação**: se o usuário pedir algo que nenhuma tool faz (CSV, gráfico, e-mail), o agente deve recusar e oferecer 2-3 tools próximas — nunca gerar código Python/shell/SQL para "simular".

## Convenções de código

- Tudo em CommonJS (`require`), Node ≥18 (usa `fetch` global).
- pt-BR para mensagens ao usuário e comentários explicativos. Identificadores e descrições de tool em inglês (modelo entende melhor schemas em EN).
- Sem TypeScript, sem build step. Edits em `.js` rodam direto.
