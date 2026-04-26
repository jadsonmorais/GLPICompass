/**
 * bot.js - Entry Point do Compass-GLPI
 * Orquestrador simplificado após a refatoração modular.
 */

require('dotenv').config();
const { createLogger } = require("./lib/log");

const log = createLogger("bot");

// Importação das interfaces modulares
const { runCli } = require("./src/interfaces/cli.js");
const { runTelegram } = require("./src/interfaces/telegram.js");

/**
 * Função principal de inicialização
 */
async function main() {
  // Determina o modo de operação (Argumento de linha de comando ou ENV)
  const mode = process.argv[4] || process.env.MODE || "telegram";

  log.info("iniciando Compass-GLPI", { 
    mode,
    node_version: process.version 
  });

  try {
    if (mode === "cli") {
      log.info("ativando modo REPL (CLI)");
      await runCli();
    } else {
      log.info("ativando modo Telegram");
      await runTelegram();
    }
  } catch (err) {
    log.error("falha fatal na inicialização do serviço", { 
      error: err.message,
      stack: err.stack 
    });
    process.exit(1);
  }
}

// Execução do entry point
if (require.main === module) {
  main();
}