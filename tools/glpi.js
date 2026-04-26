require("dotenv").config();

const GLPI_URL = (process.env.GLPI_URL || "").trim();
const APP_TOKEN = (process.env.GLPI_APP_TOKEN || "").trim();
const USER_TOKEN = (process.env.GLPI_USER_TOKEN || "").trim();

const PRIORITY = { 1: "very_low", 2: "low", 3: "medium", 4: "high", 5: "very_high", 6: "major" };
const STATUS = { 1: "new", 2: "assigned", 3: "planned", 4: "pending", 5: "solved", 6: "closed" };
const URGENCY = PRIORITY;
const IMPACT = PRIORITY;

const log = require('../lib/log');

let sessionToken = null;

function baseUrl() {
  if (!GLPI_URL) throw new Error("GLPI_URL is not set in .env");
  return GLPI_URL.replace(/\/$/, "");
}

async function request(path, { method = "GET", body, query } = {}) {
  if (!sessionToken) await initSession();
  const qs = query ? "?" + new URLSearchParams(query).toString() : "";
  const res = await fetch(`${baseUrl()}${path}${qs}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Session-Token": sessionToken,
      "App-Token": APP_TOKEN || "",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`GLPI ${method} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function initSession() {
  if (!APP_TOKEN || !USER_TOKEN) {
    throw new Error("GLPI_APP_TOKEN and GLPI_USER_TOKEN must be set in .env");
  }
  // Envia app_token como header E como query string — algumas configs de proxy
  // reverso descartam headers custom, mas query string sempre passa.
  const url = `${baseUrl()}/initSession?app_token=${encodeURIComponent(APP_TOKEN)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "App-Token": APP_TOKEN,
      Authorization: `user_token ${USER_TOKEN}`,
    },
  });
  const data = await res.json();
  if (!res.ok || !data.session_token) {
    const hint = JSON.stringify(data).includes("WRONG_APP_TOKEN")
      ? "\nPossíveis causas: (1) cliente de API não está Ativo em Configurar → Geral → API → Clientes da API; (2) token copiado do lugar errado (App-Token vem do cliente da API, User-Token do perfil do usuário); (3) espaço/quebra de linha no .env."
      : "";
    throw new Error(`initSession failed: ${JSON.stringify(data)}${hint}`);
  }
  sessionToken = data.session_token;
  return sessionToken;
}

async function killSession() {
  if (!sessionToken) return;
  await fetch(`${baseUrl()}/killSession`, {
    method: "GET",
    headers: { "Session-Token": sessionToken, "App-Token": APP_TOKEN || "" },
  });
  sessionToken = null;
}

// Campos exibidos por padrão em todas as buscas. Inclui categoria (7),
// grupo técnico (8), localização/hotel (83) e fornecedor (6) pra dashboards
// poderem agrupar por essas dimensões sem segunda chamada.
const TICKET_DISPLAY = {
  "forcedisplay[0]": "2",   // ID
  "forcedisplay[1]": "1",   // Título
  "forcedisplay[2]": "3",   // Prioridade
  "forcedisplay[3]": "4",   // Requerente
  "forcedisplay[4]": "5",   // Técnico
  "forcedisplay[5]": "12",  // Status
  "forcedisplay[6]": "15",  // Data de abertura
  "forcedisplay[7]": "19",  // Última atualização
  "forcedisplay[8]": "7",   // Categoria
  "forcedisplay[9]": "8",   // Grupo técnico
  "forcedisplay[10]": "83", // Localização (= hotel na Carmel)
  "forcedisplay[11]": "6",  // Fornecedor
};

async function listOpenTickets({ limit = 20, sortBy = "date_mod", order = "DESC" } = {}) {
  const sortField = sortBy === "date" ? "15" : "19";
  const query = {
    "criteria[0][field]": "12",
    "criteria[0][searchtype]": "equals",
    "criteria[0][value]": "notold",
    ...TICKET_DISPLAY,
    range: `0-${Math.max(0, limit - 1)}`,
    sort: sortField,
    order,
  };
  return request("/search/Ticket", { query });
}

async function searchTickets({ text, onlyOpen = true, limit = 20 } = {}) {
  if (!text || !text.trim()) throw new Error("searchTickets requires 'text'");
  const q = text.trim();
  // (titulo contains X) OR (conteudo contains X), opcionalmente AND status=notold
  const query = {
    "criteria[0][link]": "AND",
    "criteria[0][field]": "1",
    "criteria[0][searchtype]": "contains",
    "criteria[0][value]": q,
    "criteria[1][link]": "OR",
    "criteria[1][field]": "21",
    "criteria[1][searchtype]": "contains",
    "criteria[1][value]": q,
    ...TICKET_DISPLAY,
    range: `0-${Math.max(0, limit - 1)}`,
    sort: "19",
    order: "DESC",
  };
  if (onlyOpen) {
    query["criteria[2][link]"] = "AND";
    query["criteria[2][field]"] = "12";
    query["criteria[2][searchtype]"] = "equals";
    query["criteria[2][value]"] = "notold";
  }
  return request("/search/Ticket", { query });
}

async function getTicket(id) {
  return request(`/Ticket/${id}`, { query: { expand_dropdowns: "true" } });
}

async function updateTicket(id, fields) {
  return request(`/Ticket/${id}`, { method: "PATCH", body: { input: fields } });
}

async function setPriority(id, priority) {
  return updateTicket(id, { priority });
}

async function setStatus(id, status) {
  return updateTicket(id, { status });
}

async function assignToUser(id, userId) {
  return updateTicket(id, { _users_id_assign: userId });
}

async function assignToGroup(id, groupId) {
  return updateTicket(id, { _groups_id_assign: groupId });
}

async function addFollowup(ticketId, content, isPrivate = false) {
  return request("/ITILFollowup", {
    method: "POST",
    body: {
      input: {
        itemtype: "Ticket",
        items_id: ticketId,
        content,
        is_private: isPrivate ? 1 : 0,
      },
    },
  });
}

async function solveTicket(id, solution) {
  await request("/ITILSolution", {
    method: "POST",
    body: {
      input: {
        itemtype: "Ticket",
        items_id: id,
        content: solution,
      },
    },
  });
  return updateTicket(id, { status: 5 });
}

async function closeTicket(id) {
  return updateTicket(id, { status: 6 });
}

async function listCategories({ limit = 100 } = {}) {
  return request("/ITILCategory", { query: { range: `0-${limit - 1}` } });
}

async function listGroups({ limit = 100 } = {}) {
  return request("/Group", { query: { range: `0-${limit - 1}` } });
}

async function getTicketSearchOptions() {
  return request("/listSearchOptions/Ticket");
}

// Inclui o campo 76677 (Ticket Externo - Ticket ID): chamado realmente
// "pendente do fornecedor" tem esse ID populado. Sem ele, é só atribuição
// administrativa — não tá de fato na fila do fornecedor.
const SUPPLIER_DISPLAY = {
  ...TICKET_DISPLAY,
  "forcedisplay[12]": "76677", // Ticket Externo - Ticket ID
};

async function listTicketsBySupplier({
  supplierId,
  onlyOpen = true,
  limit = 20,
  requireExternalId = true,
} = {}) {
  if (!Number.isFinite(supplierId)) throw new Error("listTicketsBySupplier requires numeric 'supplierId'");
  const query = {
    "criteria[0][field]": "6",
    "criteria[0][searchtype]": "equals",
    "criteria[0][value]": String(supplierId),
    ...SUPPLIER_DISPLAY,
    range: `0-${Math.max(0, limit - 1)}`,
    sort: "19",
    order: "DESC",
  };
  if (onlyOpen) {
    query["criteria[1][link]"] = "AND";
    query["criteria[1][field]"] = "12";
    query["criteria[1][searchtype]"] = "equals";
    query["criteria[1][value]"] = "notold";
  }
  const res = await request("/search/Ticket", { query });
  if (!requireExternalId || !res?.data) return res;
  const filtered = res.data.filter((r) => {
    const v = r["76677"];
    return v !== undefined && v !== null && String(v).trim() !== "";
  });
  return { ...res, data: filtered, count: filtered.length };
}

async function listTicketsByTag({ tagId, onlyOpen = true, limit = 20 } = {}) {
  if (!Number.isFinite(tagId)) throw new Error("listTicketsByTag requires numeric 'tagId'");
  const query = {
    "criteria[0][field]": "10500",
    "criteria[0][searchtype]": "equals",
    "criteria[0][value]": String(tagId),
    ...TICKET_DISPLAY,
    range: `0-${Math.max(0, limit - 1)}`,
    sort: "19",
    order: "DESC",
  };
  if (onlyOpen) {
    query["criteria[1][link]"] = "AND";
    query["criteria[1][field]"] = "12";
    query["criteria[1][searchtype]"] = "equals";
    query["criteria[1][value]"] = "notold";
  }
  return request("/search/Ticket", { query });
}

async function listTagsForTicket(ticketId) {
  if (!ticketId) throw new Error("listTagsForTicket requires 'ticketId'");
  
  // Pedimos um range maior para garantir que o nosso chamado esteja no meio
  // e tentamos os dois formatos de filtro que o GLPI costuma aceitar
  const query = {
    'itemtype': 'Ticket',
    'items_id': ticketId,
    'searchText[items_id]': ticketId, 
    'range': '0-500' 
  };

  // 1. Faz a requisição
  const data = await request("/PluginTagTagItem", { query });

  // 2. FILTRO DE SEGURANÇA: 
  // Como o GLPI ignorou o filtro na URL, nós filtramos aqui no código.
  // Só deixamos passar o que for do chamado que você quer.
  if (Array.isArray(data)) {
    return data.filter(item => String(item.items_id) === String(ticketId));
  }

  return [];
}

// TODO(verificar): endpoint do plugin Tag (https://github.com/pluginsGLPI/tag).
// Validar com `npm run test:glpi` em ambiente real antes de promover a estável.
async function addTagToTicket(ticketId, tagId) {
  try {
    const payload = {
      input: [
        {
          itemtype: 'Ticket',
          items_id: parseInt(ticketId), // Garante que é número
          plugin_tag_tags_id: parseInt(tagId) // Garante que é número
        }
      ]
    };

    console.log('--> Enviando Payload (Objeto):', payload);

    // TESTE: Passe o 'payload' SEM o JSON.stringify
    // Se o seu helper for o padrão, ele deve stringificar lá dentro
    const result = await request("/PluginTagTagItem", {
      method: 'POST',
      body: payload // Mude de JSON.stringify(payload) para apenas payload
    });

    console.info(`[GLPI] Tag ${tagId} adicionada com sucesso!`);
    return result;

  } catch (error) {
    console.error(`[GLPI] Erro no Add: ${error.message}`);
    throw error;
  }
}

// TODO(verificar): endpoint do plugin Tag (https://github.com/pluginsGLPI/tag).
// Estratégia: search da tabela de junção pra achar o id da linha, depois DELETE.
// Fallback: DELETE direto com input — varia por versão do plugin.
async function removeTagFromTicket(ticketId, tagId) {
  try {
    // 1. Pega a lista que já validamos que funciona
    const tagsVinculadas = await listTagsForTicket(ticketId);
    
    // 2. Busca com comparação flexível (==) e log de debug
    const relacao = tagsVinculadas.find(t => {
      const idDaTagNoGLPI = t.plugin_tag_tags_id || t.tags_id;
      // Comparamos usando == para ignorar se é string ou número
      return idDaTagNoGLPI == tagId;
    });

    if (!relacao) {
      // Se não achar, vamos logar o que ele REALMENTE achou para conferirmos
      const IDsExistentes = tagsVinculadas.map(t => t.plugin_tag_tags_id || t.tags_id);
      console.warn(`[GLPI] Tag ${tagId} não achada. IDs no ticket: [${IDsExistentes.join(', ')}]`);
      return { success: false, message: 'Tag não encontrada no chamado' };
    }

    // 3. Executa o DELETE
    const resource = `/PluginTagTagItem/${relacao.id}`;
    const result = await request(resource, { method: 'DELETE' });

    console.info(`[GLPI] Sucesso! Tag ${tagId} removida (Rel: ${relacao.id})`);
    return result;

  } catch (error) {
    console.error(`[GLPI] Erro na remoção: ${error.message}`);
    throw error;
  }
}

async function listProblemTickets(problemId) {
  // /Problem_Ticket é a tabela de junção problems_id <-> tickets_id.
  // Tenta primeiro o search endpoint (padrão GLPI) e cai pro GET direto
  // se a instância não expuser search para tabelas de junção.
  const query = {
    "criteria[0][field]": "problems_id",
    "criteria[0][searchtype]": "equals",
    "criteria[0][value]": String(problemId),
    "forcedisplay[0]": "tickets_id",
    range: "0-999",
  };
  try {
    return await request("/search/Problem_Ticket", { query });
  } catch {
    return await request("/Problem_Ticket", {
      query: { searchText: JSON.stringify({ problems_id: problemId }), range: "0-999" },
    });
  }
}

async function linkTicketToProblem(ticketId, problemId) {
  return request("/Problem_Ticket", {
    method: "POST",
    body: { input: { problems_id: problemId, tickets_id: ticketId } },
  });
}

async function test() {
  console.log("GLPI URL:", GLPI_URL);
  console.log("Authenticating...");
  const token = await initSession();
  console.log("Session token:", token.slice(0, 8) + "...");
  console.log("\nFetching open tickets (up to 5)...");
  const tickets = await listOpenTickets({ limit: 5 });
  console.log(JSON.stringify(tickets, null, 2));
  console.log("\nFetching ticket search options...");
  const options = await getTicketSearchOptions();
  console.log("Available fields:");
  for (const [id, field] of Object.entries(options)) {
    console.log(`${id}: ${field.name}`);
  }
  await killSession();
  console.log("\nSession closed. All good.");
}

module.exports = {
  PRIORITY,
  STATUS,
  URGENCY,
  IMPACT,
  initSession,
  killSession,
  listOpenTickets,
  searchTickets,
  getTicket,
  updateTicket,
  setPriority,
  setStatus,
  assignToUser,
  assignToGroup,
  addFollowup,
  solveTicket,
  closeTicket,
  listCategories,
  listGroups,
  getTicketSearchOptions,
  listProblemTickets,
  linkTicketToProblem,
  listTicketsBySupplier,
  listTicketsByTag,
  addTagToTicket,
  removeTagFromTicket,
};

if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === "test") {
    test().catch((err) => {
      console.error("FAIL:", err.message);
      process.exit(1);
    });
  } else {
    console.log("Usage: node tools/glpi.js test");
    process.exit(1);
  }
}

/**
 * Definições de habilidades (tools) para o Agente.
 * Mapeia o JSON da API de ferramentas para as funções locais.
 */
const skillDefinitions = [
  {
    definition: {
      type: "function",
      function: {
        name: "list_open_tickets",
        description: "Lists open (not-closed) tickets from the GLPI backlog.",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "integer", description: "Max tickets to return. Default 20." },
            order: { type: "string", enum: ["ASC", "DESC"] }
          }
        }
      }
    },
    handler: (args) => listOpenTickets({ limit: args.limit, order: args.order })
  },
  {
    definition: {
      type: "function",
      function: {
        name: "search_tickets",
        description: "Busca chamados por palavra-chave em titulo e conteudo.",
        parameters: {
          type: "object",
          properties: {
            text: { type: "string", description: "Palavra-chave ou frase curta a buscar em titulo e conteudo." },
            only_open: { type: "boolean", description: "Se true (padrao), limita a chamados nao fechados." },
            limit: { type: "integer", description: "Maximo de resultados. Padrao 20." }
          },
          required: ["text"]
        }
      }
    },
    handler: (args) => searchTickets({ text: args.text, onlyOpen: args.only_open !== false, limit: args.limit })
  },
  {
    definition: {
      type: "function",
      function: {
        name: "get_ticket",
        description: "Fetches a single ticket by ID with dropdown fields expanded.",
        parameters: {
          type: "object",
          properties: { id: { type: "integer", description: "GLPI ticket ID." } },
          required: ["id"]
        }
      }
    },
    handler: (args) => getTicket(args.id)
  },
  {
    definition: {
      type: "function",
      function: {
        name: "update_ticket",
        description: "Updates arbitrary fields on a ticket. Prefer set_priority / set_status for common operations.",
        parameters: {
          type: "object",
          properties: {
            id: { type: "integer" },
            fields: { type: "object", description: "Map of GLPI field name to new value." }
          },
          required: ["id", "fields"]
        }
      }
    },
    handler: (args) => updateTicket(args.id, args.fields)
  },
  {
    definition: {
      type: "function",
      function: {
        name: "set_priority",
        description: "Sets priority (1-6) based on urgency × impact matrix.",
        parameters: {
          type: "object",
          properties: {
            id: { type: "integer" },
            priority: { type: "integer", minimum: 1, maximum: 6 }
          },
          required: ["id", "priority"]
        }
      }
    },
    handler: (args) => setPriority(args.id, args.priority)
  },
  {
    definition: {
      type: "function",
      function: {
        name: "set_status",
        description: "Sets status (1=new, 2=assigned, 3=planned, 4=pending, 5=solved, 6=closed).",
        parameters: {
          type: "object",
          properties: {
            id: { type: "integer" },
            status: { type: "integer", minimum: 1, maximum: 6 }
          },
          required: ["id", "status"]
        }
      }
    },
    handler: (args) => setStatus(args.id, args.status)
  },
  {
    definition: {
      type: "function",
      function: {
        name: "add_followup",
        description: "Adds a follow-up (comment) to a ticket.",
        parameters: {
          type: "object",
          properties: {
            ticket_id: { type: "integer" },
            content: { type: "string" },
            is_private: { type: "boolean", description: "If true, only technicians see it." }
          },
          required: ["ticket_id", "content"]
        }
      }
    },
    handler: (args) => addFollowup(args.ticket_id, args.content, args.is_private)
  },
  {
    definition: {
      type: "function",
      function: {
        name: "solve_ticket",
        description: "Creates a Solution record and sets status to Solved.",
        parameters: {
          type: "object",
          properties: {
            id: { type: "integer" },
            solution: { type: "string", description: "Solution text." }
          },
          required: ["id", "solution"]
        }
      }
    },
    handler: (args) => solveTicket(args.id, args.solution)
  },
  {
    definition: {
      type: "function",
      function: {
        name: "list_tickets_by_supplier",
        description: "Lista chamados pendentes por fornecedor (exige ID externo).",
        parameters: {
          type: "object",
          properties: {
            supplier_id: { type: "integer", description: "ID GLPI do fornecedor." },
            only_open: { type: "boolean" },
            limit: { type: "integer" }
          },
          required: ["supplier_id"]
        }
      }
    },
    handler: (args) => listTicketsBySupplier({ 
      supplierId: args.supplier_id, 
      onlyOpen: args.only_open !== false, 
      limit: args.limit 
    })
  },
  {
    definition: {
      type: "function",
      function: {
        name: "list_tickets_by_tag",
        description: "Lista chamados que possuem uma etiqueta específica.",
        parameters: {
          type: "object",
          properties: {
            tag_id: { type: "integer", description: "ID GLPI da etiqueta." },
            only_open: { type: "boolean" }
          },
          required: ["tag_id"]
        }
      }
    },
    handler: (args) => listTicketsByTag({ 
      tagId: args.tag_id, 
      onlyOpen: args.only_open !== false 
    })
  },
  {
    definition: {
      type: "function",
      function: {
        name: "add_tag_to_ticket",
        description: "Adiciona uma etiqueta ao chamado (Status interno da TI).",
        parameters: {
          type: "object",
          properties: {
            ticket_id: { type: "integer" },
            tag_id: { type: "integer" }
          },
          required: ["ticket_id", "tag_id"]
        }
      }
    },
    handler: (args) => addTagToTicket(args.ticket_id, args.tag_id)
  },
  {
    definition: {
      type: "function",
      function: {
        name: "link_ticket_to_problem",
        description: "Vincula um chamado a um Problem record.",
        parameters: {
          type: "object",
          properties: {
            ticket_id: { type: "integer" },
            problem_id: { type: "integer" }
          },
          required: ["ticket_id", "problem_id"]
        }
      }
    },
    handler: (args) => linkTicketToProblem(args.ticket_id, args.problem_id)
  }
];

// No final do arquivo, atualize o export:
module.exports = {
  skillDefinitions,
  initSession,
  request, // 
  listOpenTickets, 
  searchTickets,   
  listTicketsBySupplier, 
  listTicketsByTag,
  listTagsForTicket,
  addTagToTicket,
  removeTagFromTicket,
  killSession,
  listOpenTickets,
  searchTickets,
  getTicket,
  updateTicket,
  setPriority,
  setStatus,
  addFollowup,
  solveTicket,
  listTicketsBySupplier,
  listTicketsByTag,
  addTagToTicket,
  linkTicketToProblem
};


