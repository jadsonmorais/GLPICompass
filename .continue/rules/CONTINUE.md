# CONTINUE.md — Guia de Desenvolvimento do Projeto

> **Regra de ouro:** Qualquer mudança arquitetural, de fluxo ou decisão técnica deve atualizar este arquivo no mesmo commit.

---

## Visão Geral do Projeto

Solução integrada com o GLPI para gestão de chamados: automação de processos, triagem inteligente e notificações via Telegram.

**Tecnologias Principais:**
- Node.js (>=18) com CommonJS
- LangChain JS (`langchain`, `@langchain/openai`) — orquestração do LLM
- OpenAI SDK (interno ao LangChain) — suporte a Ollama, OpenAI Cloud e OpenRouter
- GLPI REST API com plugins customizados
- PostgreSQL via Plugin utilsdashboards
- Telegram Bot API

---

## Arquitetura de Camadas

### Camada 1 — System Prompt (Contexto Mínimo + SOUL.md)

**Responsabilidade:** Injetar apenas o contexto fixo sempre relevante no início de cada sessão.

**Mudança arquitetural (v2.0):** O Memory Wiki completo **não é mais injetado** no system prompt.
Apenas `WikiManager.getMinimalContext()` é usado — empresa, URL base, idioma e fuso horário.

**Estrutura:**
```
memory-wiki/
├── profile.yaml       # Perfil do agente (não injetado no prompt)
├── stack.yaml         # Instância GLPI, grupos, etiquetas, fornecedores
├── projects.yaml      # Projetos ativos e Problems abertos
├── decisions.yaml     # Regras de roteamento e decisões operacionais
├── people.yaml        # Time de TI e VIPs
└── working.yaml       # Contexto de trabalho atual
```

**Por que:** Injetar os 6 YAMLs completos a cada request custava ~1500–2000 tokens fixos, independente de relevância. Agora esse dado é buscado sob demanda via tools.

---

### Camada 2 — LangChain Agent (`src/core/Agent.js`)

**Responsabilidade:** Orquestrar o LLM com gerenciamento de histórico e token budget.

**Implementação:**
- `ChatOpenAI` do `@langchain/openai` com `bindTools()` para tool calling
- Provider switching via `AI_PROVIDER` env: `ollama` (default), `openai`, `openrouter`
- Histórico tipado: `HumanMessage`, `AIMessage`, `ToolMessage` de `@langchain/core/messages`
- O Agent **é dono do histórico** — `cli.js` passa apenas a string do usuário

**Gerenciamento de contexto:**
```javascript
// Trimming automático quando tokens estimados excedem HISTORY_MAX_TOKENS (default: 4000)
// Algoritmo: mantém metade mais recente + resume a metade mais antiga via LLM
await agent._trimHistoryIfNeeded();
```

**Variáveis de ambiente relevantes:**
| Var | Padrão | Descrição |
|---|---|---|
| `AI_PROVIDER` | `ollama` | `ollama` / `openai` / `openrouter` |
| `MODEL` | `llama3.2` | Nome do modelo |
| `HISTORY_MAX_TOKENS` | `4000` | Budget de tokens do histórico |
| `OLLAMA_BASE_URL` | `http://localhost:11434/v1` | URL do servidor Ollama |

**Interface pública:**
```javascript
const reply = await agent.chat("mensagem do usuário"); // string → string
agent.resetHistory(); // limpa histórico (ex: comando /reset na CLI)
```

---

### Camada 3 — Wrapper GLPI REST (`tools/glpi.js`)

**Responsabilidade:** Integração com o GLPI via REST API.

**Autenticação:**
- App-Token no header e query string (garante compatibilidade)
- Session-Token cacheado e reutilizado

**Plugin Tag (Etiquetas) — Regras Críticas:**
```javascript
// ADIÇÃO: input DEVE ser um Array
await glpiPluginTag.add({ input: [{ items_id: 123, itemtype: 'Ticket', tag_id: 456 }] });

// REMOÇÃO: Requer encontrar o id da relação primeiro
const tags = await glpiPluginTag.listTagsForTicket(ticketId);
const relationId = tags.find(t => t.tag_id === 456).id;
await glpiPluginTag.delete(relationId);

// BUSCA: Filtrar manualmente após listagem (GLPI ignora filtros items_id na URL)
const tickets = await glpiTicket.list();
const filtered = tickets.filter(t => t.items_id === specificId);
```

---

### Camada 4 — Memory Wiki como Tools (`tools/wiki.js`)

**Responsabilidade:** Expor dados do Memory Wiki sob demanda como ferramentas do agente.

**Motivação:** Elimina o custo fixo de tokens dos YAMLs no system prompt. O agente busca apenas o que é relevante para a conversa.

**Catálogo de tools:**
| Tool | Fonte YAML | Quando usar |
|---|---|---|
| `get_team_members()` | `people.yaml` | Identificar técnicos, papéis, IDs GLPI |
| `get_glpi_tags()` | `stack.yaml` | Buscar IDs de etiquetas antes de taggear |
| `get_suppliers()` | `stack.yaml` | Identificar fornecedores por nome/serviço |
| `get_support_groups()` | `stack.yaml` | Rotear chamados aos grupos corretos |
| `get_custom_queries_catalog()` | `stack.yaml` | Descobrir queries disponíveis antes de executar |
| `get_active_projects()` | `projects.yaml` | Verificar Problems abertos (ex: Problem 206) |
| `get_routing_rules()` | `decisions.yaml` | Seguir regras de roteamento e VIP |

**Observação sobre RAG:** Para dados estruturados pequenos (YAMLs), tools são mais adequadas que RAG (sem infraestrutura extra, determinístico). RAG pode ser considerado no futuro para bases de conhecimento de texto livre (SOPs, manuais).

---

### Camada 5 — Scheduler Diário de Problem 206

**Responsabilidade:** Monitoramento e notificação de chamados críticos.

**Configuração:**
- Execução: Diariamente às 9h locais
- `TELEGRAM_OWNER_CHAT_ID`: Owner identificado para notificações

**Workflow:**
1. Varredura de chamados abertos
2. Filtro por keywords no título/conteúdo (Problem 206)
3. Envio de notificações formatadas via Telegram

---

### Camada 6 — Consultas Personalizadas (Plugin utilsdashboards)

**Responsabilidade:** Execução de queries SQL arbitrárias.

**Catálogo:** Definido em `memory-wiki/stack.yaml` → acessível via tool `get_custom_queries_catalog()`.

```javascript
const results = await utilsDashboards.executeQuery(queryName, params);
```

---

## Otimização de Tokens

Medidas implementadas, em ordem de impacto:

1. **Memory Wiki como Tools** — remove ~1500 tokens fixos do system prompt por request
2. **Summarization do histórico** — `Agent._trimHistoryIfNeeded()` resume automaticamente quando `HISTORY_MAX_TOKENS` é excedido
3. **Truncamento de respostas de tools** — `truncateToolResult(result, maxChars=2000)` em `lib/helpers.js` limita respostas longas da API GLPI antes de entrar no histórico
4. **Budget configurável** — `HISTORY_MAX_TOKENS` ajustável via `.env`

---

## Workflow de Testes

### Regra

> **Toda função exportada em `src/` ou `tools/` deve ter pelo menos um teste em `test/*.test.js`.** Nenhuma PR sem testes.

### Arquivos de teste

| Arquivo | O que testa |
|---|---|
| `test/schema.test.js` | ToolRegistry — schema OpenAI e auto-discovery |
| `test/wiki.test.js` | `tools/wiki.js` — todos os getters, estrutura dos YAMLs |
| `test/wikiManager.test.js` | `WikiManager` — renderers, helpers, `getMinimalContext()` |
| `test/agent.test.js` | `Agent` — chat, tool loop, trimming, reset (mock LLM) |
| `test/helpers.test.js` | `truncateToolResult` — todos os casos |

### Comandos

```bash
# Todos os testes
npm test

# Com cobertura
npm run test:coverage

# Smoke test GLPI (requer .env configurado)
npm run test:glpi
```

### Framework

Node.js native test runner (`node:test`) — sem Jest ou Vitest.

---

## Regras de Ouro e Boas Práticas

### Node.js & CommonJS

- Node.js >= 18
- Sintaxe CommonJS (`require`/`module.exports`)
- **NÃO usar** `"type": "module"` no package.json

### LangChain — Padrões de Uso

```javascript
// Provider switching via factory buildLLM() em Agent.js
// NÃO instanciar ChatOpenAI diretamente fora de Agent.js

// Mensagens tipadas — usar sempre no histórico
const { HumanMessage, AIMessage, ToolMessage, SystemMessage } = require("@langchain/core/messages");

// args de tool_calls já vêm parseados (não é JSON string)
// LangChain: toolCall.args (objeto)
// OpenAI SDK raw: toolCall.function.arguments (string JSON)
```

### Helper request (GLPI)

**Regra:** Sempre passar body como objeto literal.
```javascript
// ✅ Correto
await request({ endpoint: '/Ticket', method: 'POST', body: { input: [{ name: 'Teste' }] } });

// ❌ Erro — double stringification
await request({ endpoint: '/Ticket', method: 'POST', body: JSON.stringify({ input: [...] }) });
```

### Tipagem de IDs

```javascript
const ticketId = parseInt(process.env.TICKET_ID, 10);
const tagId = Number(variableId);
// GLPI espera números; variáveis de ambiente são strings
```

### PII (Informações Pessoalmente Identificáveis)

1. **NUNCA** logar tokens de forma bruta
2. **NUNCA** expor conteúdo de mensagens sensíveis
3. **SEMPRE** mascarar dados sensíveis: `console.log('Token:', mask(token))`
4. **SEMPRE** usar variáveis de ambiente para credenciais
5. **NUNCA** commitar arquivos `.env` ou `.env.local`

### Idioma e Documentação

- **Respostas:** pt-BR
- **Código e Documentação:** EN
- **CONTINUE.md:** pt-BR

---

## Estrutura de Arquivos

```
src/
├── core/
│   ├── Agent.js          # LangChain agent (histórico + tool loop)
│   ├── WikiManager.js    # YAML loaders, renderers, getMinimalContext()
│   └── ToolRegistry.js   # Auto-discovery de tools
└── interfaces/
    └── cli.js            # REPL — passa input para agent.chat()

tools/
├── glpi.js               # Wrapper GLPI REST
├── customQuery.js        # Plugin utilsdashboards
└── wiki.js               # Memory Wiki como tools sob demanda

lib/
├── log.js                # Logger seguro (sem PII)
└── helpers.js            # truncateToolResult()

test/
├── schema.test.js        # ToolRegistry schema
├── wiki.test.js          # tools/wiki.js
├── wikiManager.test.js   # WikiManager renderers
├── agent.test.js         # Agent chat loop (mock LLM)
└── helpers.test.js       # truncateToolResult

memory-wiki/              # YAMLs — fonte de verdade (não injetados no prompt)
SOUL.md                   # Persona do agente (injetada no system prompt)
```

---

## Workflow de Desenvolvimento

### 1. Inicialização do Ambiente

```bash
npm install
cp .env.example .env
# Editar .env com credenciais
```

### 2. Feature Flow

```bash
git checkout -b feature/minha-feature

# Desenvolver
# Escrever teste ANTES ou JUNTO com a função

npm test                # deve passar antes do commit
npm run test:glpi       # se tocou em glpi.js

git commit -m "feat: descrição"
```

### 3. Regra de Documentação

Toda mudança que altere:
- Fluxo de mensagens / histórico
- Adição ou remoção de tools
- Variáveis de ambiente
- Decisões arquiteturais

**deve atualizar este arquivo no mesmo commit.**

---

## Solução de Problemas

### Issue: Autenticação GLPI Falha
```
1. Verificar APP_TOKEN em .env
2. Confirmar permissões do token no GLPI
3. Limpar cache de sessão
4. Executar: npm run test:glpi
```

### Issue: Tags Não São Removidas
```
1. GLPI não deleta por tagId — requer o relationId
2. Listar tags do ticket, extrair .id da relação
3. Aplicar DELETE no relationId
```

### Issue: Double Stringification Error
```
1. Localizar JSON.stringify no body da request
2. Remover — passar objeto literal diretamente
3. O helper request faz o stringify internamente
```

### Issue: Histórico Crescendo Demais
```
1. Reduzir HISTORY_MAX_TOKENS em .env
2. Usar /reset na CLI para limpar sessão
3. Verificar se tool results muito grandes — truncateToolResult(result, maxChars)
```

---

## Referências

- [GLPI REST API](https://docs.glpi-project.org/)
- [LangChain JS](https://js.langchain.com/docs/)
- [@langchain/openai](https://js.langchain.com/docs/integrations/chat/openai)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- `memory-wiki/` — fonte de verdade dos dados contextuais
- `SOUL.md` — persona e instruções do agente
