/**
 * src/interfaces/telegram.js
 * Interface do Telegram para o Compass-GLPI.
 */

const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");
const { createLogger } = require("../../lib/log");
const WikiManager = require("../core/WikiManager");
const ToolRegistry = require("../core/ToolRegistry");
const Agent = require("../core/Agent");

const log = createLogger("telegram");

async function runTelegram() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN não configurado no .env");
  }

  // Inicializa o bot e o mapa de conversas (histórico por chatId)
  const bot = new TelegramBot(token, { polling: true });
  const conversations = new Map();

  // 1. Carregamento do Contexto (Wiki + Persona)
  const soulPath = process.env.SOUL_FILE || path.join(__dirname, "../../SOUL.md");
  const soulMd = fs.readFileSync(path.resolve(soulPath), "utf-8");
  const memoryWiki = WikiManager.loadMemoryWiki();
  const systemPrompt = memoryWiki + "\n" + soulMd;

  log.info("bot iniciado", { 
    model: process.env.MODEL || "llama3.2",
    wikiSize: memoryWiki.length,
    toolsLoaded: ToolRegistry.getDefinitions().length
  });

  // 2. Handlers de Comandos
  bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "Olá! Sou o **Compass-GLPI**. Estou pronto para ajudar com a triagem e gestão do seu backlog no GLPI.", { parse_mode: "Markdown" });
  });

  bot.onText(/\/id/, (msg) => {
    bot.sendMessage(msg.chat.id, `Seu Chat ID: \`${msg.chat.id}\``, { parse_mode: "Markdown" });
  });

  // 3. Listener Principal de Mensagens
  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Ignora comandos (já tratados) ou mensagens vazias
    if (!text || text.startsWith("/")) return;

    // Recupera ou inicializa o histórico da conversa
    if (!conversations.has(chatId)) {
      conversations.set(chatId, []);
    }
    const history = conversations.get(chatId);
    history.push({ role: "user", content: text });

    // Mantém o histórico sob controle (conforme regra de 40 msgs do CLAUDE.md)
    if (history.length > 40) history.splice(0, 2);

    try {
      // Feedback visual de "digitando"
      await bot.sendChatAction(chatId, "typing");

      // Instancia o Agente com o ToolRegistry para esta interação
      const agent = new Agent({
        systemPrompt,
        tools: ToolRegistry.getDefinitions(),
        toolExecutor: (name, args) => ToolRegistry.execute(name, args)
      });

      const reply = await agent.chat(history);
      
      // Envia a resposta final formatada em Markdown
      await bot.sendMessage(chatId, reply, { parse_mode: "Markdown" });
    } catch (err) {
      log.error("erro ao processar chat", { chatId, error: err.message });
      await bot.sendMessage(chatId, "⚠️ Tive um problema interno ao processar sua mensagem. Por favor, tente novamente em instantes.");
    }
  });
  
  // Nota: O agendador diário (Scheduler) será migrado na Task 3.1.
}

module.exports = { runTelegram };