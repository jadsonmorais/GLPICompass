# Como adicionar uma nova GLPI Query ao agente

Este guia explica como expor uma nova consulta SQL do plugin utilsdashboards para o agente via `tools/customQuery.js`.

Nenhuma mudança de código é necessária — o catálogo é dinâmico, lido do YAML a cada arranque.

---

## Passo 1 — Criar a query no GLPI

No painel do GLPI, acesse o plugin **utilsdashboards** e crie uma nova query SQL. Anote o **token** gerado para ela.

---

## Passo 2 — Adicionar o token no `.env`

```
GLPI_QUERY_TOKEN_MINHA_NOVA_QUERY=o_token_gerado_aqui
```

Convenção de nome: `GLPI_QUERY_TOKEN_` + identificador em maiúsculas.

---

## Passo 3 — Registrar a query em `memory-wiki/stack.yaml`

Adicione uma entrada em `consultas_personalizadas`:

```yaml
consultas_personalizadas:
  # ... entradas existentes ...

  - nome: "Minha Nova Query"
    descricao: "Descreva o que ela retorna e QUANDO o agente deve usá-la. Seja específico — o LLM usa esse texto para decidir quando chamar."
    colunas: ["id", "nome", "data", "status"]  # colunas que o endpoint retorna
    token_env: "GLPI_QUERY_TOKEN_MINHA_NOVA_QUERY"
```

> **O `nome` é a chave:** é exatamente o valor que o agente passará para `fetch_custom_query(name)`. Deve ser único e descritivo.

---

## Passo 4 — Verificar que a entrada foi encontrada

```bash
node -e "
require('dotenv').config();
const { fetchCustomQuery } = require('./tools/customQuery');
fetchCustomQuery('Minha Nova Query').catch(e => console.log(e.message));
"
```

| Saída | Significado |
|---|---|
| `Token GLPI_QUERY_TOKEN_... não configurado` | Entrada encontrada no YAML — token faltando no `.env` |
| `Consulta personalizada "..." não encontrada` | Nome errado no YAML ou erro de digitação |
| Dados JSON | Tudo certo |

---

## Passo 5 — Escrever o teste

Crie ou edite `test/customQuery.test.js`:

```js
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

describe("fetch_custom_query — Minha Nova Query", () => {
  test("retorna estrutura esperada com dados mockados", async () => {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        name: "Minha Nova Query",
        data: [{ id: 1, nome: "Teste", data: "2026-01-01", status: "ok" }]
      })
    });

    process.env.GLPI_DASHBOARDS_BASE_URL = "http://test.local";
    process.env.GLPI_QUERY_TOKEN_MINHA_NOVA_QUERY = "fake-token";

    // Limpa o cache do módulo para recarregar com os novos env vars
    delete require.cache[require.resolve("../tools/customQuery")];
    const { fetchCustomQuery } = require("../tools/customQuery");

    const result = await fetchCustomQuery("Minha Nova Query");

    assert.strictEqual(result.name, "Minha Nova Query");
    assert.ok(Array.isArray(result.data));
    assert.ok(result.count > 0);
  });
});
```

```bash
npm test
```

---

## Passo 6 (opcional) — Ajustar a descrição se o agente não acionar automaticamente

A `descricao` no YAML é o único sinal que o LLM usa para decidir quando chamar `fetch_custom_query`. Se o agente não estiver acionando a query quando deveria, seja mais específico sobre as situações de ativação:

```yaml
# Vago — evitar
descricao: "Retorna dados de SLA."

# Específico — preferir
descricao: "Retorna chamados com SLA vencido. Use quando o usuário perguntar sobre chamados atrasados, SLA estourado ou prazo excedido."
```

---

## Fluxo resumido

```
.env                       → GLPI_QUERY_TOKEN_*
        ↓
memory-wiki/stack.yaml     → consultas_personalizadas[].token_env
        ↓
tools/customQuery.js       → loadCatalog() lê o YAML
                           → findEntry() busca pelo nome exato
                           → fetch_custom_query(name) busca token do .env
                           → GET para o plugin utilsdashboards
                           → limpa HTML do conteúdo
                           → retorna { name, descricao, colunas, count, data }
```
