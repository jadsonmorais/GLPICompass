const { request } = require("./client");

const TICKET_DISPLAY = {
  "forcedisplay": "2", "forcedisplay[1]": "1", "forcedisplay[2]": "3",
  "forcedisplay[3]": "4", "forcedisplay[4]": "5", "forcedisplay[5]": "12",
  "forcedisplay[6]": "15", "forcedisplay[7]": "19", "forcedisplay[8]": "7",
  "forcedisplay[9]": "8", "forcedisplay[10]": "83", "forcedisplay[11]": "6"
};

async function listOpenTickets({ limit = 20, order = "DESC" } = {}) {
  const query = {
    "criteria[field]": "12",
    "criteria[searchtype]": "equals",
    "criteria[value]": "notold",
    ...TICKET_DISPLAY,
    range: `0-${Math.max(0, limit - 1)}`,
    sort: "19", order,
  };
  return request("/search/Ticket", { query });
}

async function searchTickets({ text, onlyOpen = true, limit = 20 } = {}) {
  const q = (text || "").trim();
  const query = {
    "criteria[link]": "AND", "criteria[field]": "1", "criteria[searchtype]": "contains", "criteria[value]": q,
    "criteria[1][link]": "OR", "criteria[1][field]": "21", "criteria[1][searchtype]": "contains", "criteria[1][value]": q,
    ...TICKET_DISPLAY,
    range: `0-${Math.max(0, limit - 1)}`, sort: "19", order: "DESC",
  };
  if (onlyOpen) {
    query["criteria[2][link]"] = "AND";
    query["criteria[2][field]"] = "12";
    query["criteria[2][value]"] = "notold";
  }
  return request("/search/Ticket", { query });
}

async function getTicket(id) {
  return request(`/Ticket/${id}`, { query: { expand_dropdowns: "true" } });
}

const ticketSkills = [
  {
    definition: {
      type: "function",
      function: {
        name: "list_open_tickets",
        description: "Lists open (not-closed) tickets from the GLPI backlog.",
        parameters: { type: "object", properties: { limit: { type: "integer" }, order: { type: "string", enum: ["ASC", "DESC"] } } }
      }
    },
    handler: (args) => listOpenTickets(args)
  },
  {
    definition: {
      type: "function",
      function: {
        name: "search_tickets",
        description: "Busca chamados por palavra-chave em titulo e conteudo.",
        parameters: {
          type: "object",
          properties: { text: { type: "string" }, only_open: { type: "boolean" }, limit: { type: "integer" } },
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
        description: "Fetches a single ticket by ID.",
        parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] }
      }
    },
    handler: (args) => getTicket(args.id)
  },
  {
    definition: {
      type: "function",
      function: {
        name: "get_ticket_timeline",
        description: "Analisa a linha do tempo (acompanhamentos e tarefas) de um chamado específico.",
        parameters: {
          type: "object",
          properties: {
            ticket_id: { type: "integer", description: "ID do chamado no GLPI" }
          },
          required: ["ticket_id"]
        }
      }
    },
    handler: (args) => getTicketTimeline(args.ticket_id)
  }
];

// tools/glpi/tickets.js
const { fetchCustomQuery } = require("../customQuery");

/**
 * Busca e filtra a linha do tempo (followups + tasks) de um chamado específico.
 * Inicialmente restrito a chamados não fechados conforme regra de negócio.
 */
async function getTicketTimeline(ticketId) {
    // Busca o dump de interações da Camada 5
    const rawData = await fetchCustomQuery("Linha do Tempo de Interações");
    
    // Filtro via JavaScript por ID do chamado
    const timeline = rawData.filter(item => Number(item.Ticket) === Number(ticketId));
    
    if (timeline.length === 0) {
        return { message: "Nenhuma interação encontrada ou o chamado está fechado/fora do critério." };
    }

    return timeline;
}

module.exports = { listOpenTickets, searchTickets, getTicket, ticketSkills };