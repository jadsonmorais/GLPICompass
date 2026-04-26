/**
 * src/core/ToolRegistry.js
 * Centraliza o carregamento dinâmico de ferramentas (Auto-Discovery).
 */

const glpi = require("../../tools/glpi");
const dashboard = require("../../tools/dashboard");
const customQuery = require("../../tools/customQuery");
const { createLogger } = require("../../lib/log");

const log = createLogger("registry");

class ToolRegistry {
  constructor() {
    this.tools = [];
    this.handlers = new Map();
    this._initialize();
  }

  /**
   * Registra as ferramentas dos módulos importados.
   * No futuro, isso pode ser automatizado com fs.readdirSync.
   */
  _initialize() {
    const modules = [glpi, dashboard, customQuery];

    for (const module of modules) {
      if (module.skillDefinitions && Array.isArray(module.skillDefinitions)) {
        for (const skill of module.skillDefinitions) {
          const { definition, handler } = skill;
          const name = definition.function.name;

          this.tools.push(definition);
          this.handlers.set(name, handler);
          log.debug("tool registrada", { name });
        }
      }
    }
    log.info("inicializado", { total_tools: this.tools.length });
  }

  /**
   * Retorna o array de definições para o LLM.
   */
  getDefinitions() {
    return this.tools;
  }

  /**
   * Executa uma ferramenta pelo nome.
   */
  async execute(name, args) {
    const handler = this.handlers.get(name);
    if (!handler) {
      throw new Error(`Tool não encontrada no registro: ${name}`);
    }
    return await handler(args);
  }
}

module.exports = new ToolRegistry();