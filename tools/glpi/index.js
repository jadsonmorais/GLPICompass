const client = require("./client");
const tickets = require("./tickets");
const actions = require("./actions");
const extra = require("./extra");

const skillDefinitions = [
  ...tickets.ticketSkills,
  ...actions.actionSkills,
  ...extra.extraSkills
];

module.exports = {
  ...client,
  ...tickets,
  ...actions,
  ...extra,
  skillDefinitions
};