# Compass-GLPI

Agente de IA para gestão do backlog de chamados GLPI. Triagem, priorização, atribuição, follow-ups e relatórios — via CLI ou Telegram Bot.

## Como funciona

O agente conversa com você em português e executa ações diretamente no GLPI (abrir, atualizar, etiquetar, resolver chamados) usando a REST API. O contexto institucional (time, grupos, fornecedores, regras) é carregado sob demanda via ferramentas, sem inflar o histórico com dados fixos.

```
Você → CLI / Telegram → Agent (LangChain) → Tools → GLPI REST API
                                           ↘ Consultas SQL (utilsdashboards)
                                           ↘ Telegram (notificações)
```

## Pré-requisitos

- Node.js >= 18
- GLPI com plugin **utilsdashboards** instalado
- Ollama local **ou** conta OpenAI/OpenRouter

## Instalação

```bash
git clone <repo>
cd GLPICompass
npm install
cp .env.example .env   # editar com suas credenciais
```

## Configuração (`.env`)

```env
# Provider do LLM: ollama | openai | openrouter
AI_PROVIDER=ollama
MODEL=llama3.2
OLLAMA_BASE_URL=http://localhost:11434/v1

# OpenAI / OpenRouter (se AI_PROVIDER != ollama)
OPENAI_API_KEY=
OPENROUTER_API_KEY=

# GLPI REST API
GLPI_URL=https://sua-instancia.glpi.com/apirest.php
GLPI_APP_TOKEN=
GLPI_USER_TOKEN=

# Consultas personalizadas (plugin utilsdashboards)
GLPI_DASHBOARDS_BASE_URL=https://sua-instancia.glpi.com/plugins/utilsdashboards/front/ajax/graphic.json.php
GLPI_QUERY_TOKEN_AGUARDANDO_RETORNO=
GLPI_QUERY_TOKEN_ACOMPANHAMENTOS=
# ... demais tokens (ver memory-wiki/stack.yaml)

# Telegram (modo bot)
TELEGRAM_BOT_TOKEN=
TELEGRAM_OWNER_CHAT_ID=

# Opcional
AGENT_NAME=Compass-GLPI
HISTORY_MAX_TOKENS=4000   # budget do histórico de conversa
MODE=cli                  # cli | telegram
```

## Uso

```bash
# CLI (REPL interativo)
npm run cli

# Telegram Bot
npm start

# Testes
npm test
npm run test:coverage

# Smoke test GLPI (requer .env configurado)
npm run test:glpi
```

### Comandos da CLI

| Comando | Ação |
|---|---|
| `exit` | Encerra a sessão |
| `/reset` | Limpa o histórico da conversa |

## Estrutura do projeto

```
src/
├── core/
│   ├── Agent.js          # LangChain: histórico tipado + tool loop + trimming
│   ├── WikiManager.js    # Loaders dos YAMLs + contexto mínimo para o system prompt
│   └── ToolRegistry.js   # Auto-discovery de todas as tools
└── interfaces/
    ├── cli.js            # REPL interativo
    └── telegram.js       # Telegram Bot

tools/
├── glpi.js              # Wrapper completo da GLPI REST API
├── customQuery.js       # Consultas SQL via plugin utilsdashboards
└── wiki.js              # Dados do Memory Wiki como tools sob demanda

lib/
├── log.js               # Logger estruturado (sem PII)
└── helpers.js           # truncateToolResult()

memory-wiki/             # Contexto institucional (YAMLs)
├── profile.yaml         # Perfil do usuário
├── stack.yaml           # Instância, grupos, etiquetas, fornecedores, queries
├── projects.yaml        # Iniciativas e Problems abertos
├── decisions.yaml       # Regras de roteamento
├── people.yaml          # Time de TI
└── working.yaml         # Foco atual

docs/
└── add-custom-query.md  # Como adicionar uma nova query SQL ao agente

test/                    # Node.js native test runner
SOUL.md                  # Persona e instruções do agente
```

## Memory Wiki

Os arquivos em `memory-wiki/` definem o contexto institucional. O agente os acessa via tools (`get_team_members`, `get_glpi_tags`, etc.) apenas quando necessário — sem custo fixo de tokens por conversa.

Para editar o time, grupos, fornecedores ou regras de roteamento: edite o YAML correspondente. Nenhuma mudança de código necessária.

## Adicionando uma nova query SQL

Ver [docs/add-custom-query.md](docs/add-custom-query.md).

## Variáveis de contexto relevantes

| Variável | Padrão | Descrição |
|---|---|---|
| `AI_PROVIDER` | `ollama` | Provider do LLM |
| `MODEL` | `llama3.2` | Modelo a usar |
| `HISTORY_MAX_TOKENS` | `4000` | Budget do histórico — acima disso, resume automaticamente |
| `MODE` | `telegram` | Modo de operação (`cli` ou `telegram`) |

## Testes

```bash
npm test
```

65 testes, cobertura de: `Agent`, `WikiManager`, `tools/wiki`, `tools/customQuery`, `lib/helpers`, `ToolRegistry`.
