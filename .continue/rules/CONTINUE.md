# CONTINUE.md - Guia de Desenvolvimento do Projeto

## Visão Geral do Projeto

Este projeto implementa uma solução integrada com o GLPI para gestão de chamados, com foco em automação de processos, notificações via Telegram e geração de dashboards analíticos. A arquitetura foi desenhada em 6 camadas distintas, garantindo separação de responsabilidades e escalabilidade.

**Tecnologias Principais:**
- Node.js (>=18) com CommonJS
- OpenAI SDK (com suporte a Ollama e OpenAI Cloud)
- GLPI REST API com plugins customizados
- PostgreSQL via Plugin utilsdashboards
- Telegram Bot API

## Arquitetura de 6 Camadas

### Camada 1: System Prompt = Memory Wiki + SOUL.md

**Responsabilidade:** Configuração inicial e definição da persona do agente.

**Estrutura:**
```
memory-wiki/
├── profile.yaml       # Perfil do agente
├── stack.yaml         # Stack técnica e consultas personalizadas
├── projects.yaml      # Projetos ativos
├── decisions.yaml     # Decisões arquiteturais
├── people.yaml        # Contatos e stakeholders
└── working.yaml       # Contexto de trabalho atual
```

**Funcionamento:**
- Na inicialização, o sistema lê os 6 arquivos YAML e os renderiza em markdown estruturado
- Funções dedicadas (`renderProfile`, `renderStack`, etc.) processam cada arquivo
- SOUL.md é injetado como system prompt em todas as chamadas de chat
- **Manutenção:** Se novos campos forem adicionados ao YAML, os renderers correspondentes devem ser atualizados

### Camada 2: Loop de Tool Calling

**Responsabilidade:** Execução síncrona de comandos via ferramentas.

**Configuração:**
- OpenAI SDK configurado por padrão para Ollama
- Suporte a OpenAI Cloud via variável `OPENAI_API_KEY`
- `MAX_TOOL_ROUNDS = 8` (máximo de rodadas síncronas)

**Fluxo:**
1. Preserva a mensagem do assistant com `tool_calls` exatamente como emitido pelo modelo
2. Em caso de erro: retorna `{error: "..."}` 
3. Mensagens de erro são prefixadas com `ERROR:` no conteúdo de tool

### Camada 3: Wrapper GLPI REST (`tools/glpi.js`)

**Responsabilidade:** Integração com o GLPI via REST API.

**Autenticação:**
- App-Token no header e query string (garante compatibilidade)
- Session-Token cacheado e reutilizado

**Plugin Tag (Etiquetas) - Regras Críticas:**
```javascript
// ADIÇÃO: input DEVE ser um Array
const result = await glpiPluginTag.add({
  input: [{
    items_id: 123,
    itemtype: 'Ticket',
    tag_id: 456
  }]
});

// REMOÇÃO: Requer encontrar o id da relação primeiro
const tags = await glpiPluginTag.listTagsForTicket(ticketId);
const relationId = tags.find(t => t.tag_id === 456).id;
await glpiPluginTag.delete(relationId);

// BUSCA: Filtrar manualmente após listagem
const tickets = await glpiTicket.list();
const filtered = tickets.filter(t => t.items_id === specificId);
```

**Limitações Conhecidas:**
- GLPI ignora filtros `items_id` na URL em alguns endpoints
- Sempre aplicar `.filter()` manual em JavaScript

### Camada 4: Scheduler Diário de Problem 206

**Responsabilidade:** Monitoramento e notificação de chamados críticos.

**Configuração:**
- Execução: Diariamente às 9h locais
- `TELEGRAM_OWNER_CHAT_ID`: Owner identificado para notificações

**Workflow:**
1. Varredura de chamados abertos
2. Filtro por keywords no título/conteúdo (Problem 206 específico)
3. Envio de notificações formatadas via Telegram

### Camada 5: Consultas Personalizadas (Plugin utilsdashboards)

**Responsabilidade:** Execução de queries SQL arbitrárias.

**Catálogo:** Definido em `memory-wiki/stack.yaml`

**Uso:**
```javascript
const results = await utilsDashboards.executeQuery(queryName, params);
// Retorna JSON estruturado
```

**Casos de Uso:**
- Extração de métricas personalizadas
- Relatórios complexos não disponíveis via API REST
- Dashboards analíticos avançados

### Camada 6: Geração de Dashboards HTML On-demand

**Responsabilidade:** Criação de visualizações analíticas standalone.

**Interface:**
```javascript
const dashboard = await generate_dashboard(
  "Título do Dashboard",
  "Descrição detalhada",
  { /* dados JSON */ }
);

// Retorna: { path: "/caminho/arquivo.html", url: "/rota/acesso" }
```

**Características:**
- HTML standalone (sem dependências externas)
- Responsivo e acessível
- Pronto para compartilhamento

## Workflow de Testes

### Testes Automatizados

**Comando:**
```bash
npm test
```

**Características:**
- Utiliza Node.js native test runner
- Foco em lógica pura e mocks
- Executa testes unitários e de integração

### Scripts de Fumaça (Integração Direta)

**1. Validação GLPI:**
```bash
npm run test:glpi
```
- Valida sessão ativa
- Listagem básica de recursos
- Verificação de conectividade

## Regras de Ouro e Boas Práticas

### Node.js & CommonJS

**Obrigatório:**
- Node.js >= 18
- Sintaxe CommonJS (require/module.exports)
- **NÃO usar** `"type": "module"` no package.json

**Exemplo:**
```javascript
// Correto
const glpi = require('./tools/glpi');
module.exports = { processTicket };

// Incorreto - EVITAR
import glpi from './tools/glpi';  // ❌
```

### Helper request

**Regra:** Sempre passar body como objeto literal.

**Correto:**
```javascript
await request({
  endpoint: '/Ticket',
  method: 'POST',
  body: { input: [{ name: 'Teste' }] } // ✅ Objeto literal
});
```

**Incorreto - ERRO:**
```javascript
await request({
  endpoint: '/Ticket',
  method: 'POST',
  body: JSON.stringify({ input: [...] }) // ❌ Double stringification!
});
```

### Tipagem de IDs

**Regra:** Sempre converter IDs para números explícitos.

```javascript
const ticketId = parseInt(process.env.TICKET_ID, 10);
const tagId = Number(variableId);

// Necessário porque:
// - GLPI espera números
// - Variáveis de ambiente são strings
// - Comparação string/number falha
```

### PII (Informações Pessoalmente Identificáveis)

**REGRAS CRÍTICAS:**
1. **NUNCA** logar tokens de forma bruta
2. **NUNCA** expor conteúdo de mensagens sensíveis
3. **SEMPRE** mascarar dados sensíveis:
   ```javascript
   console.log('Token:', mask(token)); // ✅
   console.log('Token:', token);        // ❌
   ```
4. **SEMPRE** usar variáveis de ambiente para credenciais
5. **NUNCA** commit arquivos .env ou .env.local

### Idioma e Documentação

**Respostas:** pt-BR (Portuguese Brazil)
**Código e Documentação:** EN (English)

## Padrões de Desenvolvimento

### Estrutura de Código

```
src/
├── tools/
│   ├── glpi.js          # Wrapper GLPI REST
│   ├── telegram.js      # Notificações Telegram
│   └── dashboard.js     # Geração de dashboards
├── utils/
│   ├── logger.js        # Logging seguro (sem PII)
│   ├── auth.js          # Autenticação
│   └── helpers.js       # Funções auxiliares
├── memory-wiki/         # YAMLs de configuração
├── templates/           # Templates de dashboard
└── index.js            # Ponto de entrada
```

### Convenções de Nomenclatura

**Funções/Variáveis:**
```javascript
// Camel case para funções e variáveis
const getTicketData = () => { ... }
const userId = 123

// Pascal case para classes/construtores
class DashboardGenerator { ... }

// Snake case para arquivos YAML
memory-wiki/
  profile.yaml
  stack.yaml
```

**Constantes:**
```javascript
const MAX_TOOL_ROUNDS = 8
const TELEGRAM_OWNER_CHAT_ID = process.env.OWNER_CHAT
```

## Workflow de Desenvolvimento

### 1. Inicialização do Ambiente

```bash
# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env
# Edite .env com suas credenciais

```

### 2. Desenvolvimento de Features

```bash
# Criar branch
git checkout -b feature/minha-feature

# Desenvolver (seguir padrões)
# Escrever/atualizar testes

# Validar localmente
npm test
npm run test:glpi

# Commitar
git commit -m "feat: adiciona widget de métricas"
```

### 3. Testes de Integração

```bash
# Teste de fumaça completo
node test-tags-smoke.js

# Validar dashboard
node test-dashboard-smoke.js

# Notificações
node test-telegram-smoke.js
```

## Solução de Problemas

### Issue: Autenticação GLPI Falha
```
SOLUÇÃO:
1. Verificar APP_TOKEN em .env
2. Confirmar permissões do token no GLPI
3. Limpar cache de sessão
4. Executar: npm run test:glpi
```

### Issue: Tags Não São Removidas
```
SOLUÇÃO:
1. Entender que GLPI não deleta por tagId
3. Aplicar DELETE no relationId, não na tagId
4. Verificar permissões de usuário
```

### Issue: Double Stringification Error
```
SOLUÇÃO:
1. Procurar por JSON.stringify no body
2. Remover JSON.stringify - passar objeto literal
3. O helper request faz o stringify internamente
4. Testar com npm test
```

### Issue: Dashboard HTML Não Gera
```
SOLUÇÃO:
1. Verificar estrutura dos dados JSON
2. Confirmar template disponível
3. Chegar permissões de escrita
4. Debug: console.log(JSON.stringify(data))
```

## Recursos e Referências

### Documentação Oficial
- [GLPI REST API](https://docs.glpi-project.org/)
- [Plugin Tag Documentation](docs/glpi-tag-plugin.md)
- [OpenAI SDK for Node.js](https://platform.openai.com/docs/api-reference)
- [Telegram Bot API](https://core.telegram.org/bots/api)

### Scripts Úteis
```bash

# Teste completo
npm run test:full

# Monitoramento
node monitor-tickets.js --interval=300

# Dashboard rápido
node quick-dashboard.js --type=tickets --format=html
```

### Arquivos de Configuração
- `.env.example` - Template de variáveis
- `memory-wiki/` - Configurações YAML
- `@CLAUDE.md` - Regras do agente
- `CONTINUE.md` - Este guia

### Ambiente de Teste
Use sempre ambiente de desenvolvimento para testes:
```bash
# Setar variável de ambiente
export NODE_ENV=development
export GLPI_URL=https://glpi.dev.local
```

## Contribuição e Revisão

### Pull Requests
1. Atualizar/criar testes para novas features
2. Documentar mudanças em memory-wiki/
3. Seguir padrões de código estabelecidos
4. Executar testes locais antes do commit
5. Incluir descrição de mudanças em pt-BR

### Code Review
- Foco em: segurança (PII), performance, legibilidade
- Validar: padrões de GLPI, formatação de IDs
- Aprovar: somente após testes passarem

---

**IMPORTANTE:** Este guia reflete as arquitetura e workflows estabelecidos no @CLAUDE.md. Qualquer desvio deve ser documentado e aprovado pela equipe de arquitetura.