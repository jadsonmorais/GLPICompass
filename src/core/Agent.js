/**
 * src/core/Agent.js
 * Orquestra a comunicação com o LLM e o loop de execução de ferramentas.
 */

const { OpenAI } = require("openai");
const { createLogger } = require("../../lib/log");

const log = createLogger("agent");

class Agent {
  /**
   * @param {Object} config
   * @param {string} config.systemPrompt - O prompt consolidado (Wiki + SOUL.md).
   * @param {Array} config.tools - Definições das ferramentas para a API.
   * @param {Function} config.toolExecutor - Função Registry.execute(name, args).
   */
  constructor({ systemPrompt, tools, toolExecutor }) {
    this.systemPrompt = systemPrompt;
    this.tools = tools;
    this.toolExecutor = toolExecutor;

    const provider = process.env.AI_PROVIDER || "ollama";
    const aiConfig = {};

    // Configuração de Provedores
    if (provider === "openrouter") {
      aiConfig.baseURL = "https://openrouter.ai/api/v1";
      aiConfig.apiKey = process.env.OPENROUTER_API_KEY;
      aiConfig.defaultHeaders = {
        "HTTP-Referer": "https://github.com/jadsonmorais/compass-glpi",
        "X-Title": "Compass-GLPI",
      };
    } else if (provider === "openai") {
      aiConfig.apiKey = process.env.OPENAI_API_KEY;
    } else {
      // Padrão: Ollama
      aiConfig.baseURL = process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1";
      aiConfig.apiKey = "ollama";
    }

    this.client = new OpenAI(aiConfig);
    this.model = process.env.MODEL || "llama3.2";
  }

  /**
   * Processa uma conversa, lidando com o loop de ferramentas de forma síncrona.
   * @param {Array} history - Histórico de mensagens da conversa.
   */
  async chat(history) {
    const MAX_TOOL_ROUNDS = 8; // Conforme definido na arquitetura [1]

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      log.info("iniciando turno de chat", { round, model: this.model });

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: "system", content: this.systemPrompt }, ...history],
        tools: this.tools.length > 0 ? this.tools : undefined,
        tool_choice: this.tools.length > 0 ? "auto" : undefined,
      });

      // CORREÇÃO: Acessa choices.message com segurança
      const message = response.choices?.[0]?.message;
      if (!message) throw new Error("Resposta inválida da IA: 'choices' vazio.");

      const toolCalls = message.tool_calls;

      // Se não houver chamadas de ferramentas, retorna o conteúdo final
      if (!toolCalls || toolCalls.length === 0) {
        if (!message.content) throw new Error("Resposta vazia da IA.");
        return message.content;
      }

      // REGRA DE OURO: Preserva a mensagem do assistente com tool_calls no histórico [1]
      history.push(message);

      log.info("executando ferramentas", { count: toolCalls.length });

      for (const toolCall of toolCalls) {
        const name = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);

        try {
          const result = await this.toolExecutor(name, args);
          history.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
        } catch (err) {
          log.error("erro na execução da ferramenta", { tool: name, error: err.message });
          history.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: err.message }),
          });
        }
      }
    }

    throw new Error("Limite de rodadas de ferramentas (MAX_TOOL_ROUNDS) excedido.");
  }
}

module.exports = Agent;