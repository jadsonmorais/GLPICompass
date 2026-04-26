const { request } = require("./client");
const { createLogger } = require("../../lib/log");

const log = createLogger("glpi-extra");

// Reutiliza a configuração de exibição do glpi.js original [1, 2]
const TICKET_DISPLAY = {
  "forcedisplay": "2", "forcedisplay[3]": "1", "forcedisplay[4]": "3",
  "forcedisplay[5]": "12", "forcedisplay[6]": "83", "forcedisplay[7]": "6"
};

async function listTicketsByTag({ tagId, onlyOpen = true, limit = 20 } = {}) {
  const query = {
    "criteria[field]": "10500",
    "criteria[searchtype]": "equals",
    "criteria[value]": String(tagId),
    ...TICKET_DISPLAY,
    range: `0-${limit - 1}`,
    sort: "19", order: "DESC",
  };
  if (onlyOpen) {
    query["criteria[3][link]"] = "AND";
    query["criteria[3][field]"] = "12";
    query["criteria[3][value]"] = "notold";
  }
  return request("/search/Ticket", { query });
}

async function addTagToTicket(ticketId, tagId) {
  const payload = {
    input: [{ itemtype: 'Ticket', items_id: parseInt(ticketId), plugin_tag_tags_id: parseInt(tagId) }]
  };
  return request("/PluginTagTagItem", { method: "POST", body: payload });
}

async function linkTicketToProblem(ticketId, problemId) {
  return request("/Problem_Ticket", {
    method: "POST",
    body: { input: { problems_id: problemId, tickets_id: ticketId } },
  });
}

const extraSkills = [
  {
    definition: {
      type: "function",
      function: {
        name: "list_tickets_by_tag",
        description: "Lista chamados que possuem uma etiqueta específica.",
        parameters: {
          type: "object",
          properties: {
            tag_id: { type: "integer" },
            only_open: { type: "boolean" }
          },
          required: ["tag_id"]
        }
      }
    },
    handler: (args) => listTicketsByTag({ tagId: args.tag_id, onlyOpen: args.only_open !== false })
  },
  {
    definition: {
      type: "function",
      function: {
        name: "add_tag_to_ticket",
        description: "Adiciona uma etiqueta ao chamado.",
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

module.exports = { listTicketsByTag, addTagToTicket, linkTicketToProblem, extraSkills };