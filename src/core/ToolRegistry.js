/**
 * src/core/ToolRegistry.js
 * Centralizes dynamic tool loading (Auto-Discovery).
 */

const glpi = require("../../tools/glpi");
const customQuery = require("../../tools/customQuery");
const wiki = require("../../tools/wiki");
const { createLogger } = require("../../lib/log");

const log = createLogger("registry");

class ToolRegistry {
  constructor() {
    this.tools = [];
    this.handlers = new Map();
    this._initialize();
  }

  _initialize() {
    const modules = [glpi, customQuery, wiki];

    for (const module of modules) {
      if (!module.skillDefinitions || !Array.isArray(module.skillDefinitions)) continue;

      for (const skill of module.skillDefinitions) {
        const { definition, handler } = skill;
        const name = definition.function.name;

        this.tools.push(definition);
        this.handlers.set(name, handler);
        log.debug("tool registrada", { name });
      }
    }

    log.info("inicializado", { total_tools: this.tools.length });
  }

  getDefinitions() {
    return this.tools;
  }

  async execute(name, args) {
    const handler = this.handlers.get(name);
    if (!handler) throw new Error(`Tool não encontrada no registro: ${name}`);
    return await handler(args);
  }
}

module.exports = new ToolRegistry();
