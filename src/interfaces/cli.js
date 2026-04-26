/**
 * src/interfaces/cli.js
 * Interface de Linha de Comando (REPL) para o Compass-GLPI.
 */

const readline = require("readline");
const fs = require("fs");
const path = require("path");
const { createLogger } = require("../../lib/log");
const WikiManager = require("../core/WikiManager");
const ToolRegistry = require("../core/ToolRegistry");
const Agent = require("../core/Agent");
const glpi = require("../../tools/glpi");

const log = createLogger("cli");

async function runCli() {
  // 1. Carregamento de Contexto
  const soulPath = process.env.SOUL_FILE || path.join(__dirname, "../../SOUL.md");
  const soulMd = fs.readFileSync(path.resolve(soulPath), "utf-8");
  const memoryWiki = WikiManager.loadMemoryWiki();
  const systemPrompt = memoryWiki + "\n" + soulMd;

  // 2. Inicialização do Agente
  const agent = new Agent({
    systemPrompt,
    tools: ToolRegistry.getDefinitions(),
    toolExecutor: (name, args) => ToolRegistry.execute(name, args)
  });

  // 3. Configuração do Readline
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const history = [];
  const model = process.env.MODEL || "llama3.2";
  const agentName = process.env.AGENT_NAME || "Compass-GLPI";

  console.log(`\n=== ${agentName} CLI ===`);
  console.log(`Model: ${model}`);
  console.log(`Wiki: ${memoryWiki.length} chars`);
  console.log(`Tools: ${ToolRegistry.getDefinitions().length} carregadas`);
  console.log("Digite 'exit' para sair.\n");

  // 4. Loop de Prompt (REPL)
  const promptUser = () => {
    rl.question("> ", async (input) => {
      const line = input.trim();

      if (line.toLowerCase() === "exit") {
        log.info("encerrando sessão...");
        await glpi.killSession().catch(() => {});
        rl.close();
        return;
      }

      if (!line) {
        promptUser();
        return;
      }

      history.push({ role: "user", content: line });

      try {
        const reply = await agent.chat(history);
        console.log(`\n${reply}\n`);
      } catch (err) {
        log.error("erro no processamento da mensagem", { error: err.message });
        console.error(`\nErro: ${err.message}\n`);
      }

      promptUser();
    });
  };

  promptUser();
}

module.exports = { runCli };