require('dotenv').config();
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const TelegramBot = require("node-telegram-bot-api");
const { OpenAI } = require("openai");
const glpi = require("./tools/glpi");
const dashboard = require("./tools/dashboard");
const customQuery = require("./tools/customQuery");
const { createLogger } = require("./lib/log");

const log = createLogger("bot");
const schedLog = createLogger("scheduler");
const wikiLog = createLogger("wiki");

const soulPath = process.env.SOUL_FILE || path.join(__dirname, "SOUL.md");
const soulMd = fs.readFileSync(path.resolve(soulPath), "utf-8");

// Memory Wiki — 6 arquivos YAML lidos no startup, renderizados em markdown
// estruturado e injetados no system prompt antes do SOUL.
const WIKI_DIR = process.env.MEMORY_WIKI_DIR || path.join(__dirname, "memory-wiki");
const WIKI_FILES = [
  "profile.yaml",
  "stack.yaml",
  "projects.yaml",
  "decisions.yaml",
  "people.yaml",
  "working.yaml",
];

const PROVIDER = process.env.AI_PROVIDER || 'ollama';

// Helpers de renderização
const isEmpty = (v) => v === undefined || v === null || (Array.isArray(v) && v.length === 0);
const line = (label, value) => (isEmpty(value) ? null : `- **${label}:** ${value}`);
const bullets = (arr) => (isEmpty(arr) ? "_(nenhum)_" : arr.map((x) => `- ${x}`).join("\n"));


// Substitua o console.log antigo por este:
// log.info("starting", { 
//   provider: PROVIDER, 
//   // model: MODEL, 
//   wikiSize: wikiStatus ? wikiStatus.length : 0 
// });


function renderProfile(d) {
  const out = [
    line("Nome", d.name),
    line("Email", d.email),
    line("GLPI user ID", d.glpi_user_id),
    line("Cargo", d.cargo),
    line("Empresa", d.empresa),
    line("Idioma", d.idioma),
  ].filter(Boolean);
  const pref = d.preferencias || {};
  if (pref.tom) out.push(`- **Tom preferido:** ${pref.tom}`);
  if (!isEmpty(pref.evitar)) out.push(`- **Evitar:** ${pref.evitar.join(", ")}`);
  if (!isEmpty(pref.preferir)) out.push(`- **Preferir:** ${pref.preferir.join(", ")}`);
  if (!isEmpty(d.colegas_que_tambem_usam)) {
    out.push(`- **Colegas que também usam o agente:** ${d.colegas_que_tambem_usam.join(", ")}`);
  }
  return out.join("\n");
}

function renderStack(d) {
  const out = [];
  const inst = d.instancia || {};
  out.push("### Instância");
  out.push([
    line("Empresa", inst.empresa),
    line("URL base", inst.url_base),
    line("Endpoint API", inst.endpoint_api),
    line("Autenticação", inst.autenticacao),
    line("Entidade", inst.entidade),
    line("Versão GLPI", inst.versao_glpi),
  ].filter(Boolean).join("\n"));

  if (d.grupo_departamento_ti) {
    const g = d.grupo_departamento_ti;
    out.push(`\n### Grupo do departamento de TI\n- ${g.nome} (id=${g.id})`);
  }

  if (!isEmpty(d.grupos_atendimento)) {
    out.push("\n### Grupos de atendimento");
    out.push("| Nome | ID | Coordenador | Escopo |");
    out.push("|---|---|---|---|");
    for (const g of d.grupos_atendimento) {
      out.push(`| ${g.nome} | ${g.id ?? "_(a preencher)_"} | ${g.coordenador || "—"} | ${g.escopo || ""} |`);
    }
  }

  if (!isEmpty(d.fornecedores)) {
    out.push("\n### Fornecedores cadastrados");
    out.push("| Nome | ID | Serviço |");
    out.push("|---|---|---|");
    for (const f of d.fornecedores) {
      out.push(`| ${f.nome} | ${f.id} | ${f.servico || ""} |`);
    }
  }

  if (!isEmpty(d.canais_notificacao)) {
    out.push("\n### Canais de notificação");
    for (const c of d.canais_notificacao) out.push(`- **${c.tipo}** — ${c.papel}`);
  }

  if (!isEmpty(d.consultas_personalizadas)) {
    out.push("\n### Consultas personalizadas (plugin utilsdashboards)");
    out.push("Use a tool `fetch_custom_query(name)` SOMENTE quando o pedido casa com um destes nomes:");
    out.push("| Nome | Descrição | Colunas retornadas |");
    out.push("|---|---|---|");
    for (const q of d.consultas_personalizadas) {
      const cols = Array.isArray(q.colunas) ? q.colunas.join(", ") : "—";
      out.push(`| ${q.nome} | ${q.descricao || ""} | ${cols} |`);
    }
  }

  if (d.convencoes) {
    out.push("\n### Convenções");
    out.push([
      line("Idioma padrão", d.convencoes.idioma_padrao_respostas),
      line("Fuso horário", d.convencoes.fuso_horario),
    ].filter(Boolean).join("\n"));
  }

  return out.join("\n");
}

function renderPeople(d) {
  const out = [];
  if (!isEmpty(d.team)) {
    out.push("### Time de TI");
    out.push("| Nome | GLPI ID | Papel | Atua em | Admin | Email |");
    out.push("|---|---|---|---|---|---|");
    for (const p of d.team) {
      const atua = isEmpty(p.atua_em) ? "—" : p.atua_em.join(", ");
      out.push(
        `| ${p.nome} | ${p.glpi_id} | ${p.papel} | ${atua} | ${p.eh_admin ? "sim" : "não"} | ${p.email} |`
      );
    }
  }
  if (!isEmpty(d.vips)) {
    out.push("\n### VIPs");
    for (const v of d.vips) out.push(`- ${JSON.stringify(v)}`);
  } else {
    out.push("\n### VIPs\n_(ad-hoc por enquanto — sem regra formal)_");
  }
  return out.join("\n");
}

function renderDecisions(d) {
  const out = [];
  out.push("### Regras de roteamento");
  if (isEmpty(d.regras_roteamento)) {
    out.push("_(nenhuma regra cadastrada — acumular conforme aparecer)_");
  } else {
    for (const r of d.regras_roteamento) {
      out.push(`- **${r.quando}** → ${r.entao} _(${r.motivo || "sem motivo registrado"}, ${r.data || "sem data"})_`);
    }
  }

  out.push("\n### Regras de VIP");
  if (isEmpty(d.regras_vip)) {
    out.push("_(nenhuma regra cadastrada)_");
  } else {
    for (const r of d.regras_vip) {
      out.push(`- ${r.criterio}=${r.valor} → urgência mínima ${r.urgencia_minima}`);
    }
  }

  out.push("\n### Decisões operacionais (append-only)");
  if (isEmpty(d.decisoes_operacionais)) {
    out.push("_(nenhuma decisão registrada)_");
  } else {
    for (const dec of d.decisoes_operacionais) {
      out.push(`- **${dec.data}** — ${dec.decisao}`);
      if (dec.motivo) out.push(`  - Motivo: ${dec.motivo}`);
      if (dec.contrapartida) out.push(`  - Contrapartida: ${dec.contrapartida}`);
    }
  }
  return out.join("\n");
}

function renderProjects(d) {
  const out = [];
  out.push("### Iniciativas ativas");
  if (isEmpty(d.iniciativas_ativas)) {
    out.push("_(nenhuma iniciativa registrada)_");
  } else {
    for (const i of d.iniciativas_ativas) {
      out.push(`- **${i.nome}** (${i.status}) — ${i.descricao}`);
      if (!isEmpty(i.donos)) out.push(`  - Donos: ${i.donos.join(", ")}`);
      if (i.prazo_alvo) out.push(`  - Prazo alvo: ${i.prazo_alvo}`);
    }
  }

  out.push("\n### Problems em aberto");
  if (isEmpty(d.problems_abertos)) {
    out.push("_(nenhum Problem aberto)_");
  } else {
    for (const p of d.problems_abertos) {
      out.push(`- **${p.titulo}** (${p.categoria || "sem categoria"})`);
      if (p.hipotese_causa) out.push(`  - Hipótese: ${p.hipotese_causa}`);
      if (!isEmpty(p.chamados_relacionados)) out.push(`  - Chamados: ${p.chamados_relacionados.join(", ")}`);
    }
  }

  if (!isEmpty(d.fora_do_escopo)) {
    out.push("\n### Fora do escopo");
    out.push(bullets(d.fora_do_escopo));
  }
  return out.join("\n");
}

function renderWorking(d) {
  const out = [];
  if (d.ultima_atualizacao) out.push(`_Última atualização: ${d.ultima_atualizacao}_`);
  out.push(`\n### Foco atual\n${d.foco_atual || "_(não definido)_"}`);
  out.push(`\n### Em andamento\n${bullets(d.em_andamento)}`);
  out.push(`\n### Aguardando\n${bullets(d.aguardando)}`);
  if (!isEmpty(d.rotinas_ativas)) {
    out.push(`\n### Rotinas ativas\n${bullets(d.rotinas_ativas.map((r) => (typeof r === "string" ? r : JSON.stringify(r))))}`);
  }
  if (!isEmpty(d.notas_proxima_sessao)) {
    out.push(`\n### Notas para próxima sessão\n${bullets(d.notas_proxima_sessao)}`);
  }
  return out.join("\n");
}

const RENDERERS = {
  "profile.yaml": renderProfile,
  "stack.yaml": renderStack,
  "projects.yaml": renderProjects,
  "decisions.yaml": renderDecisions,
  "people.yaml": renderPeople,
  "working.yaml": renderWorking,
};

function loadMemoryWiki() {
  if (!fs.existsSync(WIKI_DIR)) return "";
  const sections = [];
  for (const name of WIKI_FILES) {
    const full = path.join(WIKI_DIR, name);
    if (!fs.existsSync(full)) continue;
    const raw = fs.readFileSync(full, "utf-8").trim();
    if (!raw) continue;
    let data;
    try {
      data = yaml.load(raw);
    } catch (err) {
      wikiLog.error("parse failed", { file: name, error: err.message });
      continue;
    }
    if (!data) continue;
    const rendered = RENDERERS[name](data);
    const title = name.replace(/\.yaml$/, "").toUpperCase();
    sections.push(`## ${title}\n\n${rendered}`);
  }
  if (!sections.length) return "";
  return `# Memory Wiki (fatos read-only sobre o usuário e o contexto)\n\n${sections.join("\n\n")}\n\n# Fim da Memory Wiki\n\n`;
}

const memoryWiki = loadMemoryWiki();
const systemPrompt = memoryWiki + soulMd;

// Mesmo padrão do inbox-zero: Ollama por padrão, troca para OpenAI se houver OPENAI_API_KEY.
const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1";
const USE_OLLAMA = !process.env.OPENAI_API_KEY || process.env.PROVIDER === "ollama";
const client = new OpenAI({
  baseURL: USE_OLLAMA ? OLLAMA_BASE : undefined,
  apiKey: USE_OLLAMA ? "ollama" : process.env.OPENAI_API_KEY,
});
const MODEL = process.env.MODEL || "llama3.2";

const TOOLS = [
  {
    type: "function",
    function: {
      name: "list_open_tickets",
      description: "Lists open (not-closed) tickets from the GLPI backlog. Returns the raw search payload.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "integer", description: "Max tickets to return. Default 20, max 100." },
          order: { type: "string", enum: ["ASC", "DESC"], description: "Sort order by priority." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_tickets",
      description: "Busca chamados por palavra-chave em titulo e conteudo. Use SEMPRE que o usuario pedir 'chamados sobre X', 'relacionados a X', 'que mencionam X'. NAO invente filtro em cima de list_open_tickets — use essa tool.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Palavra-chave ou frase curta a buscar em titulo e conteudo." },
          only_open: { type: "boolean", description: "Se true (padrao), limita a chamados nao fechados." },
          limit: { type: "integer", description: "Maximo de resultados. Padrao 20." },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_ticket",
      description: "Fetches a single ticket by ID with dropdown fields expanded.",
      parameters: {
        type: "object",
        properties: { id: { type: "integer", description: "GLPI ticket ID." } },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_ticket",
      description: "Updates arbitrary fields on a ticket. Prefer set_priority / set_status / assign_* for common operations.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "integer" },
          fields: {
            type: "object",
            description: "Map of GLPI field name to new value. Example: { urgency: 4, impact: 3 }.",
            additionalProperties: true,
          },
        },
        required: ["id", "fields"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_priority",
      description: "Sets priority (1=very low .. 5=very high, 6=major). Always derive from urgency × impact matrix.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "integer" },
          priority: { type: "integer", minimum: 1, maximum: 6 },
        },
        required: ["id", "priority"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_status",
      description: "Sets status. 1=new 2=assigned 3=planned 4=pending 5=solved 6=closed. Prefer solve_ticket over direct 5/6.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "integer" },
          status: { type: "integer", minimum: 1, maximum: 6 },
        },
        required: ["id", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "assign_to_user",
      description: "Assigns a ticket to a specific GLPI user (technician) by user ID.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "integer" },
          user_id: { type: "integer" },
        },
        required: ["id", "user_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "assign_to_group",
      description: "Assigns a ticket to a GLPI group by group ID. Prefer group over individual user assignment when unclear.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "integer" },
          group_id: { type: "integer" },
        },
        required: ["id", "group_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_followup",
      description: "Adds a follow-up (comment) to a ticket. Public follow-ups are visible to the requester.",
      parameters: {
        type: "object",
        properties: {
          ticket_id: { type: "integer" },
          content: { type: "string" },
          is_private: { type: "boolean", description: "If true, only technicians see it." },
        },
        required: ["ticket_id", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "solve_ticket",
      description: "Creates a Solution record and sets status to Solved. Always call this instead of set_status=5.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "integer" },
          solution: { type: "string", description: "Solution text written so a future technician can understand it." },
        },
        required: ["id", "solution"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "close_ticket",
      description: "Sets status=Closed. Only call after the ticket has been solved and the requester had time to review.",
      parameters: {
        type: "object",
        properties: { id: { type: "integer" } },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_categories",
      description: "Lists ITIL categories configured in GLPI.",
      parameters: {
        type: "object",
        properties: { limit: { type: "integer" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_groups",
      description: "Lists GLPI groups (assignable teams).",
      parameters: {
        type: "object",
        properties: { limit: { type: "integer" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_problem_tickets",
      description: "Lista chamados já vinculados a um Problem record. Use para saber se um ticket já está associado antes de propor vinculação.",
      parameters: {
        type: "object",
        properties: { problem_id: { type: "integer" } },
        required: ["problem_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_custom_query",
      description: "Executa uma consulta SQL personalizada do GLPI (plugin utilsdashboards) e retorna os dados. USE SOMENTE quando o pedido do usuário casa exatamente com o nome de uma consulta listada em STACK→consultas_personalizadas. Não invente nome de consulta. Tools nativas (search_tickets, list_tickets_by_*) cobrem a maioria dos casos — esta tool é pra cruzamentos que /search não faz (ex: 'aguardando retorno' que cruza followups+tasks).",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nome exato da consulta no catálogo (STACK→consultas_personalizadas)." },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_dashboard",
      description: "Gera um arquivo HTML standalone (snapshot) com dashboard a partir de dados JÁ buscados via tools de leitura. FLUXO OBRIGATÓRIO: (1) primeiro chame list_open_tickets / search_tickets / list_tickets_by_supplier / list_tickets_by_tag / get_ticket pra pegar os dados; (2) só ENTÃO chame esta tool passando 'data' com o resultado bruto. Nunca invente dados. Retorna {path, url, bytes, model_used} — devolva o url pro usuário abrir no navegador.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título curto do dashboard (vira nome do arquivo). Ex: 'Backlog por grupo', 'SLA em risco semana 17'." },
          description: { type: "string", description: "Briefing pro gerador: o que destacar, agrupar, comparar. Detalhe quais archetypes fazem sentido (KPI cards, top-bar, time-series, heatmap, pivot-table)." },
          data: { description: "JSON com os dados a usar. Geralmente o retorno cru de uma tool de leitura. Pode ser objeto único ou {tickets: [...], grupos: [...]} pra agregar fontes." },
        },
        required: ["title", "description", "data"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_tickets_by_supplier",
      description: "Lista chamados pendentes por parte de um fornecedor. Filtra por campo 6 (Atribuído a um fornecedor) E exige campo 76677 (Ticket Externo - Ticket ID) populado — sem ID externo, o chamado não está de fato na fila do fornecedor, é só atribuição administrativa. O agente DEVE resolver supplier_id consultando STACK→fornecedores antes de chamar.",
      parameters: {
        type: "object",
        properties: {
          supplier_id: { type: "integer", description: "ID GLPI do fornecedor (lido da STACK)." },
          only_open: { type: "boolean", description: "Se true (padrão), limita a chamados não fechados." },
          limit: { type: "integer", description: "Máximo de resultados. Padrão 20." },
          require_external_id: { type: "boolean", description: "Se true (padrão), só retorna chamados com Ticket Externo ID populado. Setar false só quando o usuário explicitamente quiser ver atribuições sem ID externo." },
        },
        required: ["supplier_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_tickets_by_tag",
      description: "Lista chamados que possuem uma etiqueta específica (campo 10500 'Etiquetas'). Etiquetas funcionam como status interno da TI (Aguardando Fornecedor, Em Homologação, Backlog, etc.). IDs em STACK→etiquetas.",
      parameters: {
        type: "object",
        properties: {
          tag_id: { type: "integer", description: "ID GLPI da etiqueta (lido da STACK)." },
          only_open: { type: "boolean", description: "Se true (padrão), limita a chamados não fechados." },
          limit: { type: "integer", description: "Máximo de resultados. Padrão 20." },
        },
        required: ["tag_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_tag_to_ticket",
      description: "ESCRITA — exige confirmação humana. Adiciona uma etiqueta ao chamado. Use para refletir status interno da TI (ex: marcar 'Em Homologação/Testes' quando entra em validação).",
      parameters: {
        type: "object",
        properties: {
          ticket_id: { type: "integer" },
          tag_id: { type: "integer", description: "ID GLPI da etiqueta (lido da STACK)." },
        },
        required: ["ticket_id", "tag_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_tag_from_ticket",
      description: "ESCRITA — exige confirmação humana. Remove uma etiqueta do chamado. Combine com add_tag_to_ticket quando o status interno muda (ex: tira 'Aguardando Fornecedor', põe 'Em Andamento').",
      parameters: {
        type: "object",
        properties: {
          ticket_id: { type: "integer" },
          tag_id: { type: "integer" },
        },
        required: ["ticket_id", "tag_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "link_ticket_to_problem",
      description: "Vincula um chamado a um Problem record (Problem_Ticket). Operação de ESCRITA — exige confirmação explícita do usuário antes de chamar.",
      parameters: {
        type: "object",
        properties: {
          ticket_id: { type: "integer" },
          problem_id: { type: "integer" },
        },
        required: ["ticket_id", "problem_id"],
      },
    },
  },
];

async function runTool(name, args) {
  const input = args || {};
  switch (name) {
    case "list_open_tickets":
      return glpi.listOpenTickets({ limit: input.limit, order: input.order });
    case "search_tickets":
      return glpi.searchTickets({ text: input.text, onlyOpen: input.only_open !== false, limit: input.limit });
    case "get_ticket":
      return glpi.getTicket(input.id);
    case "update_ticket":
      return glpi.updateTicket(input.id, input.fields);
    case "set_priority":
      return glpi.setPriority(input.id, input.priority);
    case "set_status":
      return glpi.setStatus(input.id, input.status);
    case "assign_to_user":
      return glpi.assignToUser(input.id, input.user_id);
    case "assign_to_group":
      return glpi.assignToGroup(input.id, input.group_id);
    case "add_followup":
      return glpi.addFollowup(input.ticket_id, input.content, input.is_private);
    case "solve_ticket":
      return glpi.solveTicket(input.id, input.solution);
    case "close_ticket":
      return glpi.closeTicket(input.id);
    case "list_categories":
      return glpi.listCategories({ limit: input.limit });
    case "list_groups":
      return glpi.listGroups({ limit: input.limit });
    case "list_problem_tickets":
      return glpi.listProblemTickets(input.problem_id);
    case "link_ticket_to_problem":
      return glpi.linkTicketToProblem(input.ticket_id, input.problem_id);
    case "list_tickets_by_supplier":
      return glpi.listTicketsBySupplier({
        supplierId: input.supplier_id,
        onlyOpen: input.only_open !== false,
        limit: input.limit,
        requireExternalId: input.require_external_id !== false,
      });
    case "list_tickets_by_tag":
      return glpi.listTicketsByTag({
        tagId: input.tag_id,
        onlyOpen: input.only_open !== false,
        limit: input.limit,
      });
    case "add_tag_to_ticket":
      return glpi.addTagToTicket(input.ticket_id, input.tag_id);
    case "remove_tag_from_ticket":
      return glpi.removeTagFromTicket(input.ticket_id, input.tag_id);
    case "fetch_custom_query":
      return customQuery.fetchCustomQuery(input.name);
    case "generate_dashboard":
      return dashboard.generateDashboard({
        title: input.title,
        description: input.description,
        data: input.data,
      });
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ---------- Rotina diária: varredura Problem 206 ----------
const PROBLEM_206_ID = 206;
const PROBLEM_206_KEYWORDS = [
  "baixa",
  "cupons",
];

async function runProblemSweep(bot, ownerChatId) {
  try {
    const searches = await Promise.all(
      PROBLEM_206_KEYWORDS.map((k) =>
        glpi.searchTickets({ text: k, onlyOpen: true, limit: 50 })
      )
    );
    const candidates = new Map();
    for (const res of searches) {
      for (const row of res?.data || []) {
        const id = Number(row["2"]);
        if (!Number.isFinite(id)) continue;
        if (!candidates.has(id)) {
          candidates.set(id, { id, titulo: row["1"], status: row["12"], mod: row["19"] });
        }
      }
    }
    const linked = await glpi.listProblemTickets(PROBLEM_206_ID);
    const linkedIds = new Set(
      (linked?.data || []).map((r) => Number(r["tickets_id"] ?? r["2"])).filter(Number.isFinite)
    );
    const novos = [...candidates.values()].filter((t) => !linkedIds.has(t.id));

    if (!novos.length) {
      schedLog.info("sweep-206 no candidates", { problem_id: PROBLEM_206_ID });
      return;
    }
    schedLog.info("sweep-206 candidates", { problem_id: PROBLEM_206_ID, count: novos.length });
    const lines = [
      `🔎 *Varredura Problem 206* — ${new Date().toLocaleDateString("pt-BR")}`,
      "",
      `${novos.length} chamado(s) candidato(s) a vincular:`,
      "",
      "| ID | Título | Status |",
      "|---|---|---|",
      ...novos.slice(0, 20).map(
        (t) => `| ${t.id} | ${String(t.titulo).slice(0, 60)} | ${t.status} |`
      ),
      "",
      "Responda aqui se quer que eu vincule algum (ou todos) ao Problem 206.",
    ];
    await bot.sendMessage(ownerChatId, lines.join("\n"), { parse_mode: "Markdown" });
  } catch (err) {
    schedLog.error("sweep-206 failed", { error: err.message });
    try {
      await bot.sendMessage(ownerChatId, `⚠️ Varredura Problem 206 falhou: ${err.message}`);
    } catch {}
  }
}

function startDailyScheduler(bot) {
  const ownerChatId = process.env.TELEGRAM_OWNER_CHAT_ID;
  if (!ownerChatId) {
    schedLog.warn("disabled", { reason: "TELEGRAM_OWNER_CHAT_ID not set" });
    return;
  }
  function scheduleNext() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(9, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const delay = next - now;
    schedLog.info("next sweep scheduled", {
      minutes: Math.round(delay / 1000 / 60),
      at: next.toISOString(),
    });
    setTimeout(async () => {
      await runProblemSweep(bot, ownerChatId);
      scheduleNext();
    }, delay);
  }
  scheduleNext();
}

async function chat(history) {
  const MAX_TOOL_ROUNDS = 8;
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: "system", content: systemPrompt }, ...history],
      tools: TOOLS,
      tool_choice: "auto",
    });

    const msg = response.choices[0].message;
    const toolCalls = msg.tool_calls || [];

    // Preserve the assistant turn exactly as the model emitted it (including tool_calls).
    history.push({
      role: "assistant",
      content: msg.content || "",
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    });

    if (!toolCalls.length) {
      return (msg.content || "").trim() || "(empty response)";
    }

    for (const call of toolCalls) {
      const toolName = call.function.name;
      const t0 = Date.now();
      log.debug("tool start", { name: toolName, round });
      let result, isError = false;
      try {
        const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        result = await runTool(toolName, args);
        log.info("tool ok", { name: toolName, duration_ms: Date.now() - t0, round });
      } catch (err) {
        result = { error: err.message };
        isError = true;
        log.error("tool failed", { name: toolName, duration_ms: Date.now() - t0, round, error: err.message });
      }
      const payload = JSON.stringify(result).slice(0, 50_000);
      history.push({
        role: "tool",
        tool_call_id: call.id,
        content: isError ? `ERROR: ${payload}` : payload,
      });
    }
  }
  return "Tool loop exceeded max rounds. Aborting.";
}

function runTelegram() {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set in .env");
  }
  const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
  startDailyScheduler(bot);
  const conversations = new Map();

  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // A.2 - Log de entrada seguro contra PII
    log.info("message received", { 
        chatId, 
        hasText: !!text, 
        isCommand: text ? text.startsWith("/") : false 
    });

    if (!text || text.startsWith("/start")) {
      bot.sendMessage(chatId, `Oi! Eu sou o ${process.env.AGENT_NAME || "Compass-GLPI"}. Posso listar, triar, priorizar e fechar chamados do seu GLPI. O que precisa?`);
      return;
    }
    if (text.startsWith("/id")) {
      bot.sendMessage(
        chatId,
        `chat_id: \`${chatId}\`\n\nPra ativar o scheduler, cole em \`.env\`:\n\`TELEGRAM_OWNER_CHAT_ID=${chatId}\`\ne reinicie o bot.`,
        { parse_mode: "Markdown" }
      );
      return;
    }
    if (text.startsWith("/sweep")) {
      bot.sendMessage(chatId, "⏳ Rodando varredura Problem 206 agora...");
      await runProblemSweep(bot, chatId);
      return;
    }
    if (!conversations.has(chatId)) conversations.set(chatId, []);
    const history = conversations.get(chatId);
    
    // LINHA CRÍTICA QUE O MODELO TINHA APAGADO
    history.push({ role: "user", content: text });
    
    if (history.length > 40) history.splice(0, history.length - 40);
    try {
      const reply = await chat(history);
      bot.sendMessage(chatId, reply, { parse_mode: "Markdown" });
    } catch (err) {
      // A.2 - Log de erro estruturado
      log.error("chat loop failed", { chatId, error: err.message });
      bot.sendMessage(chatId, `Erro: ${err.message}`);
    }
});

  const provider = USE_OLLAMA ? `Ollama (${OLLAMA_BASE})` : "OpenAI";
  const wikiStatus = memoryWiki ? `Wiki: ${memoryWiki.length} chars` : "Wiki: (none)";
  log.info("starting", { provider, model: MODEL, wikiSize: wikiStatus ? wikiStatus.length : 0 });
}

async function runCli() {
  const readline = require("readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const history = [];
  const provider = USE_OLLAMA ? `Ollama (${OLLAMA_BASE})` : "OpenAI";
  const wikiStatus = memoryWiki ? `Wiki: ${memoryWiki.length} chars` : "Wiki: (none)";
  console.log(`${process.env.AGENT_NAME || "Compass-GLPI"} CLI | Provider: ${provider} | Model: ${MODEL} | ${wikiStatus}`);
  console.log("Type 'exit' to quit.\n");
  const prompt = () => {
    rl.question("> ", async (line) => {
      if (line.trim() === "exit") {
        await glpi.killSession().catch(() => {});
        rl.close();
        return;
      }
      history.push({ role: "user", content: line });
      try {
        const reply = await chat(history);
        console.log(`\n${reply}\n`);
      } catch (err) {
        console.error("Error:", err.message);
      }
      prompt();
    });
  };
  prompt();
}

if (require.main === module) {
  const mode = process.argv[2] || process.env.MODE || "telegram";
  if (mode === "cli") runCli();
  else runTelegram();
}

module.exports = {
  chat,
  TOOLS,
  runTool,
  // Exposto para testes — não usar em runtime.
  renderProfile,
  renderStack,
  renderPeople,
  renderDecisions,
  renderProjects,
  renderWorking,
  isEmpty,
  line,
  bullets,
};
