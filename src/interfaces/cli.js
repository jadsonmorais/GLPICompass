/**
 * src/interfaces/cli.js
 * REPL interface. History is owned by Agent; cli just passes user input strings.
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
  const soulPath = process.env.SOUL_FILE || path.join(__dirname, "../../SOUL.md");
  const soulMd = fs.readFileSync(path.resolve(soulPath), "utf-8");

  // Minimal context from Wiki (just instance info — bulk data is now in tools)
  const minimalContext = WikiManager.getMinimalContext();
  const systemPrompt = minimalContext + "\n" + soulMd;

  const agent = new Agent({
    systemPrompt,
    tools: ToolRegistry.getDefinitions(),
    toolExecutor: (name, args) => ToolRegistry.execute(name, args),
  });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const agentName = process.env.AGENT_NAME || "Compass-GLPI";
  const model = process.env.MODEL || "llama3.2";

  console.log(`\n=== ${agentName} CLI ===`);
  console.log(`Model: ${model}`);
  console.log(`System prompt: ${systemPrompt.length} chars`);
  console.log(`Tools: ${ToolRegistry.getDefinitions().length} carregadas`);
  console.log("Comandos: 'exit' para sair, '/reset' para limpar histórico.\n");

  const promptUser = () => {
    rl.question("> ", async (input) => {
      const line = input.trim();

      if (line.toLowerCase() === "exit") {
        log.info("encerrando sessão...");
        await glpi.killSession().catch(() => {});
        rl.close();
        return;
      }

      if (line === "/reset") {
        agent.resetHistory();
        console.log("\nHistórico limpo.\n");
        promptUser();
        return;
      }

      if (!line) {
        promptUser();
        return;
      }

      try {
        const reply = await agent.chat(line);
        console.log(`\n${reply}\n`);
      } catch (err) {
        log.error("erro no processamento", { error: err.message });
        console.error(`\nErro: ${err.message}\n`);
      }

      promptUser();
    });
  };

  promptUser();
}

module.exports = { runCli };
