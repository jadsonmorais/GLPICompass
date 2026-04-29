/**
 * src/core/Agent.js
 * LangChain-based agent: ChatOpenAI + typed message history + token-aware trimming.
 */

const { ChatOpenAI } = require("@langchain/openai");
const { HumanMessage, SystemMessage, AIMessage, ToolMessage } = require("@langchain/core/messages");
const { createLogger } = require("../../lib/log");
const { truncateToolResult } = require("../../lib/helpers");

const log = createLogger("agent");

const MAX_TOOL_ROUNDS = 8;
// 1 token ≈ 4 chars — used for approximate history budget
const CHARS_PER_TOKEN = 4;

function buildLLM(modelName) {
  const provider = process.env.AI_PROVIDER || "ollama";

  if (provider === "openrouter") {
    return new ChatOpenAI({
      modelName,
      apiKey: process.env.OPENROUTER_API_KEY,
      configuration: {
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": "https://github.com/jadsonmorais/compass-glpi",
          "X-Title": "Compass-GLPI",
        },
      },
    });
  }

  if (provider === "openai") {
    return new ChatOpenAI({ modelName, apiKey: process.env.OPENAI_API_KEY });
  }

  // Default: Ollama via OpenAI-compatible endpoint
  return new ChatOpenAI({
    modelName,
    apiKey: "ollama",
    configuration: { baseURL: process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1" },
  });
}

function estimateTokens(messages) {
  return messages.reduce((sum, m) => {
    const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    return sum + Math.ceil(content.length / CHARS_PER_TOKEN);
  }, 0);
}

class Agent {
  /**
   * @param {Object} config
   * @param {string} config.systemPrompt - Prompt consolidado (minimal context + SOUL.md).
   * @param {Array}  config.tools        - OpenAI function definitions para bindTools().
   * @param {Function} config.toolExecutor - Registry.execute(name, args).
   */
  constructor({ systemPrompt, tools, toolExecutor }) {
    this.systemPrompt = systemPrompt;
    this.toolExecutor = toolExecutor;
    this.maxHistoryTokens = parseInt(process.env.HISTORY_MAX_TOKENS || "4000", 10);

    const modelName = process.env.MODEL || "llama3.2";
    const base = buildLLM(modelName);
    this.llm = tools.length > 0 ? base.bindTools(tools) : base;
    this.summaryLlm = buildLLM(modelName); // unbound — used for summarization only

    // Typed message history — owned by the Agent
    this.history = [];
    this.model = modelName;
  }

  /** Clears conversation history (e.g. on /reset command). */
  resetHistory() {
    this.history = [];
    log.info("histórico resetado");
  }

  /**
   * Summarizes old messages into a single SystemMessage to keep history under budget.
   * @private
   */
  async _summarize(messages) {
    log.info("resumindo histórico", { messages: messages.length });
    const response = await this.summaryLlm.invoke([
      new SystemMessage(
        "Faça um resumo conciso em português da conversa a seguir, preservando fatos, decisões e contexto importantes:"
      ),
      ...messages,
    ]);
    return new SystemMessage(`[Contexto anterior resumido: ${response.content}]`);
  }

  /**
   * Trims history when estimated token count exceeds maxHistoryTokens.
   * Keeps the most recent messages intact and summarizes the rest.
   * @private
   */
  async _trimHistoryIfNeeded() {
    const tokens = estimateTokens(this.history);
    if (tokens <= this.maxHistoryTokens) return;

    log.info("histórico muito longo, resumindo", { estimatedTokens: tokens, limit: this.maxHistoryTokens });

    const halfIdx = Math.floor(this.history.length / 2);
    const toSummarize = this.history.slice(0, halfIdx);
    const toKeep = this.history.slice(halfIdx);

    const summary = await this._summarize(toSummarize);
    this.history = [summary, ...toKeep];
    log.info("histórico trimado", { newLength: this.history.length });
  }

  /**
   * Sends a user message and returns the assistant reply.
   * History is managed internally; caller only provides the raw user text.
   *
   * @param {string} userInput
   * @returns {Promise<string>}
   */
  async chat(userInput) {
    this.history.push(new HumanMessage(userInput));
    await this._trimHistoryIfNeeded();

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      log.info("turno de chat", { round, model: this.model });

      const messages = [new SystemMessage(this.systemPrompt), ...this.history];
      const response = await this.llm.invoke(messages);

      const toolCalls = response.tool_calls;

      if (!toolCalls || toolCalls.length === 0) {
        if (!response.content) throw new Error("Resposta vazia da IA.");
        this.history.push(response);
        return response.content;
      }

      this.history.push(response);
      log.info("executando ferramentas", { count: toolCalls.length });

      for (const toolCall of toolCalls) {
        // LangChain already parses args — no JSON.parse needed
        const { name, args, id } = toolCall;
        try {
          const rawResult = await this.toolExecutor(name, args);
          const result = truncateToolResult(rawResult);
          this.history.push(
            new ToolMessage({ content: JSON.stringify(result), tool_call_id: id })
          );
        } catch (err) {
          log.error("erro na ferramenta", { tool: name, error: err.message });
          this.history.push(
            new ToolMessage({ content: JSON.stringify({ error: err.message }), tool_call_id: id })
          );
        }
      }
    }

    throw new Error("Limite de rodadas de ferramentas (MAX_TOOL_ROUNDS) excedido.");
  }
}

module.exports = Agent;
