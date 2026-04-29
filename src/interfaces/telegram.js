/**
 * src/interfaces/telegram.js
 * Interface do Telegram para o Compass-GLPI.
 * Suporta chats privados e grupos — em grupos, responde apenas quando mencionado (@botname).
 *
 * Cada conversa (chatId:userId) tem seu próprio Agent, que gerencia o histórico internamente.
 */

const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");
const { createLogger } = require("../../lib/log");
const WikiManager = require("../core/WikiManager");
const ToolRegistry = require("../core/ToolRegistry");
const Agent = require("../core/Agent");

const log = createLogger("telegram");

function buildSystemPrompt() {
  const soulPath = process.env.SOUL_FILE || path.join(__dirname, "../../SOUL.md");
  const soulMd = fs.readFileSync(path.resolve(soulPath), "utf-8");
  const minimalContext = WikiManager.getMinimalContext();
  return minimalContext + "\n" + soulMd;
}

function buildAgent(systemPrompt) {
  return new Agent({
    systemPrompt,
    tools: ToolRegistry.getDefinitions(),
    toolExecutor: (name, args) => ToolRegistry.execute(name, args),
  });
}

async function runTelegram() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN não configurado no .env");

  const bot = new TelegramBot(token, { polling: true });

  // Um Agent por conversa (chatId:userId) — cada um gerencia seu próprio histórico
  const agents = new Map();
  const systemPrompt = buildSystemPrompt();

  const me = await bot.getMe();
  const botUsername = me.username;

  log.info("bot iniciado", {
    username: botUsername,
    model: process.env.MODEL || "llama3.2",
    systemPromptSize: systemPrompt.length,
    toolsLoaded: ToolRegistry.getDefinitions().length,
  });

  // --- Comandos ---

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

  bot.onText(/\/reset/, (msg) => {
    const key = `${msg.chat.id}:${msg.from.id}`;
    if (agents.has(key)) agents.get(key).resetHistory();
    bot.sendMessage(msg.chat.id, "Histórico limpo. Começando uma nova conversa.");
  });

  // --- Listener principal ---

  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const isGroup = ["group", "supergroup"].includes(msg.chat.type);
    let text = msg.text;

    if (!text || text.startsWith("/")) return;

    // Em grupos: só responde quando mencionado diretamente
    if (isGroup) {
      const mention = `@${botUsername}`;
      if (!text.includes(mention)) return;
      text = text.replace(new RegExp(mention, "g"), "").trim();
      if (!text) return;
    }

    // Recupera ou cria o Agent desta conversa
    const key = `${chatId}:${userId}`;
    if (!agents.has(key)) {
      agents.set(key, buildAgent(systemPrompt));
      log.info("nova conversa iniciada", { key });
    }
    const agent = agents.get(key);

    // Inclui o nome do remetente para o agente poder citá-lo nas respostas
    const senderName = msg.from.first_name || msg.from.username || `Usuário ${userId}`;
    const input = `[${senderName}]: ${text}`;

    try {
      await bot.sendChatAction(chatId, "typing");

      const reply = await agent.chat(input);

      const finalReply = isGroup ? `*${senderName}*, ${reply}` : reply;
      await bot.sendMessage(chatId, finalReply, { parse_mode: "Markdown" });
    } catch (err) {
      log.error("erro ao processar mensagem", { chatId, userId, error: err.message });
      await bot.sendMessage(
        chatId,
        "Tive um problema interno ao processar sua mensagem. Por favor, tente novamente."
      );
    }
  });
}

module.exports = { runTelegram };
