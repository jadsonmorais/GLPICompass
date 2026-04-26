const { request } = require("./client");
const { createLogger } = require("../../lib/log");

const log = createLogger("glpi-actions");

async function updateTicket(id, fields) {
  return request(`/Ticket/${id}`, { method: "PATCH", body: { input: fields } });
}

async function setPriority(id, priority) {
  return updateTicket(id, { priority });
}

async function setStatus(id, status) {
  return updateTicket(id, { status });
}

async function addFollowup(ticketId, content, isPrivate = false) {
  return request("/ITILFollowup", {
    method: "POST",
    body: {
      input: { itemtype: "Ticket", items_id: ticketId, content, is_private: isPrivate ? 1 : 0 },
    },
  });
}

async function solveTicket(id, solution) {
  await request("/ITILSolution", {
    method: "POST",
    body: { input: { itemtype: "Ticket", items_id: id, content: solution } },
  });
  return updateTicket(id, { status: 5 });
}

async function closeTicket(id) {
  return updateTicket(id, { status: 6 });
}

const actionSkills = [
  {
    definition: {
      type: "function",
      function: {
        name: "update_ticket",
        description: "Updates arbitrary fields on a ticket.",
        parameters: {
          type: "object",
          properties: {
            id: { type: "integer" },
            fields: { type: "object" }
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
        name: "solve_ticket",
        description: "Creates a Solution record and sets status to Solved.",
        parameters: {
          type: "object",
          properties: {
            id: { type: "integer" },
            solution: { type: "string" }
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
        name: "add_followup",
        description: "Adds a follow-up (comment) to a ticket.",
        parameters: {
          type: "object",
          properties: {
            ticket_id: { type: "integer" },
            content: { type: "string" },
            is_private: { type: "boolean" }
          },
          required: ["ticket_id", "content"]
        }
      }
    },
    handler: (args) => addFollowup(args.ticket_id, args.content, args.is_private)
  }
];

module.exports = { 
  updateTicket, setPriority, setStatus, addFollowup, solveTicket, closeTicket, actionSkills 
};