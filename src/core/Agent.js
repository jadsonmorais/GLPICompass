
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
   * @param {Function} config.toolExecutor - Função runTool(name, args) para executar as chamadas.
   */
  constructor({ systemPrompt, tools, toolExecutor }) {
    this.systemPrompt = systemPrompt;
    this.tools = tools;
    this.toolExecutor = toolExecutor;
    
    // Configurações de provedor extraídas da lógica original [3], [2]
    const ollamaBase = process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1";
    const useOllama = !process.env.OPENAI_API_KEY || process.env.PROVIDER === "ollama";
    
    this.model = process.env.MODEL || "llama3.2";
    this.client = new OpenAI({
      baseURL: useOllama ? ollamaBase : undefined,
      apiKey: useOllama ? "ollama" : process.env.OPENAI_API_KEY,
    });

    log.info("inicializado", { 
      provider: useOllama ? "Ollama" : "OpenAI Cloud",
      model: this.model 
    });
  }

  /**
   * Processa uma conversa, lidando com o loop de ferramentas.
   * @param {Array} history - Histórico de mensagens da conversa.
   * @returns {Promise<string>} Resposta final do assistente.
   */
  async chat(history) {
    const MAX_TOOL_ROUNDS = 8; // Conforme definido no bot.js original [1]

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      try {
        const response = await this.client.chat.completions.create({
          model: this.model,
          messages: [{ role: "system", content: this.systemPrompt }, ...history],
          tools: this.tools,
          tool_choice: "auto",
        });

        const message = response.choices?.message;
        if (!message) throw new Error("Resposta vazia da IA.");

        // Adiciona a resposta do assistente ao histórico para manter o contexto do loop [2]
        history.push(message);

        // Se não houver chamadas de ferramenta, retornamos o conteúdo de texto
        if (!message.tool_calls || message.tool_calls.length === 0) {
          return message.content;
        }

        // Processa cada chamada de ferramenta emitida pelo modelo
        for (const toolCall of message.tool_calls) {
          const name = toolCall.function.name;
          let args;
          
          try {
            args = JSON.parse(toolCall.function.arguments);
            log.debug("executando tool", { name, args });

            const result = await this.toolExecutor(name, args);
            
            history.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify(result),
            });
          } catch (error) {
            log.error("erro na execução da tool", { name, error: error.message });
            
            // Retorna o erro para o modelo tentar se recuperar [2]
            history.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: `ERROR: ${error.message}` }),
            });
          }
        }
      } catch (err) {
        log.error("falha no ciclo de chat", { error: err.message });
        throw err;
      }
    }

    const errorMsg = "Loop de ferramentas excedeu o limite de rodadas.";
    log.warn(errorMsg);
    return errorMsg;
  }
}

module.exports = Agent;