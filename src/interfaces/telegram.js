/**
 * src/interfaces/telegram.js
 * Interface do Telegram para o Compass-GLPI.
 * Suporta chats privados e grupos — em grupos, responde apenas quando mencionado (@botname).
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

  const bot = new TelegramBot(token, { polling: true });

  // Histórico separado por usuário dentro de cada chat: "chatId:userId"
  const conversations = new Map();

  // 1. Carregamento do Contexto (Wiki + Persona)
  const soulPath = process.env.SOUL_FILE || path.join(__dirname, "../../SOUL.md");
  const soulMd = fs.readFileSync(path.resolve(soulPath), "utf-8");
  const memoryWiki = WikiManager.loadMemoryWiki();
  const systemPrompt = memoryWiki + "\n" + soulMd;

  // Busca o @username do próprio bot para detectar menções em grupos
  const me = await bot.getMe();
  const botUsername = me.username;

  log.info("bot iniciado", {
    username: botUsername,
    model: process.env.MODEL || "llama3.2",
    wikiSize: memoryWiki.length,
    toolsLoaded: ToolRegistry.getDefinitions().length,
  });

  // 2. Handlers de Comandos
  bot.onText(/\/start/, (msg) => {
    const name = msg.from.first_name || "pessoal";
    const isGroup = ["group", "supergroup"].includes(msg.chat.type);
    const greeting = isGroup
      ? `Olá, ${name}! Sou o **Compass-GLPI**. Em grupos, me mencione com @${botUsername} para que eu responda.`
      : `Olá, ${name}! Sou o **Compass-GLPI**. Estou pronto para ajudar com a triagem e gestão do seu backlog no GLPI.`;
    bot.sendMessage(msg.chat.id, greeting, { parse_mode: "Markdown" });
  });

  bot.onText(/\/id/, (msg) => {
    bot.sendMessage(
      msg.chat.id,
      `Chat ID: \`${msg.chat.id}\`\nSeu User ID: \`${msg.from.id}\``,
      { parse_mode: "Markdown" }
    );
  });

  // 3. Listener Principal de Mensagens
  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const isGroup = ["group", "supergroup"].includes(msg.chat.type);
    let text = msg.text;

    if (!text || text.startsWith("/")) return;

    // Em grupos: só responde quando o bot é mencionado diretamente
    if (isGroup) {
      const mention = `@${botUsername}`;
      if (!text.includes(mention)) return;
      // Remove a menção do texto antes de enviar ao agente
      text = text.replace(new RegExp(mention, "g"), "").trim();
      if (!text) return;
    }

    // Chave de histórico por usuário dentro do chat
    const historyKey = `${chatId}:${userId}`;
    if (!conversations.has(historyKey)) {
      conversations.set(historyKey, []);
    }
    const history = conversations.get(historyKey);

    // Injeta o nome do usuário no conteúdo para o agente poder citá-lo
    const senderName = msg.from.first_name || msg.from.username || `Usuário ${userId}`;
    history.push({ role: "user", content: `[${senderName}]: ${text}` });

    if (history.length > 40) history.splice(0, 2);

    try {
      await bot.sendChatAction(chatId, "typing");

      const agent = new Agent({
        systemPrompt,
        tools: ToolRegistry.getDefinitions(),
        toolExecutor: (name, args) => ToolRegistry.execute(name, args),
      });

      const reply = await agent.chat(history);

      // Em grupos, cita o usuário no início da resposta
      const finalReply = isGroup
        ? `*${senderName}*, ${reply}`
        : reply;

      await bot.sendMessage(chatId, finalReply, { parse_mode: "Markdown" });
    } catch (err) {
      log.error("erro ao processar chat", { chatId, userId, error: err.message });
      await bot.sendMessage(
        chatId,
        "⚠️ Tive um problema interno ao processar sua mensagem. Por favor, tente novamente em instantes."
      );
    }
  });
}

module.exports = { runTelegram };
