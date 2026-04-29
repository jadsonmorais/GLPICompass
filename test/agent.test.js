/**
 * test/agent.test.js
 * Unit tests for src/core/Agent.js — uses mock LLM to avoid real API calls.
 */

const { test, describe, mock, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

// We test internal logic by mocking @langchain/openai at the module level.
// The mock intercepts ChatOpenAI constructor so no real HTTP calls are made.

const { AIMessage, ToolMessage } = require("@langchain/core/messages");

// Build a mock ChatOpenAI that returns pre-configured responses
function makeMockLLM(responses) {
  let callIndex = 0;
  return {
    bindTools: function () { return this; },
    invoke: async function () {
      const response = responses[callIndex] ?? responses[responses.length - 1];
      callIndex++;
      return response;
    },
  };
}

// Patch Agent to accept an injected LLM (testability seam)
function buildAgent(llm, toolExecutor = async () => ({ ok: true })) {
  const Agent = require("../src/core/Agent");
  const agent = new Agent({
    systemPrompt: "You are a test agent.",
    tools: [],
    toolExecutor,
  });
  // Inject mock LLM directly
  agent.llm = llm;
  agent.summaryLlm = makeMockLLM([new AIMessage("Resumo: conversa anterior.")]);
  return agent;
}

describe("Agent — chat()", () => {
  test("returns assistant text content when LLM responds without tool calls", async () => {
    const llm = makeMockLLM([new AIMessage("Olá! Como posso ajudar?")]);
    const agent = buildAgent(llm);

    const reply = await agent.chat("oi");
    assert.strictEqual(reply, "Olá! Como posso ajudar?");
  });

  test("executes a tool call and returns final text", async () => {
    const toolCallResponse = new AIMessage({ content: "", tool_calls: [{ id: "c1", name: "get_team_members", args: {} }] });
    const finalResponse = new AIMessage("O time tem 5 membros.");

    const llm = makeMockLLM([toolCallResponse, finalResponse]);
    let toolCalled = false;
    const toolExecutor = async (name) => { toolCalled = true; return { team: [] }; };

    const agent = buildAgent(llm, toolExecutor);
    const reply = await agent.chat("quem é o time?");

    assert.ok(toolCalled, "tool executor should have been called");
    assert.strictEqual(reply, "O time tem 5 membros.");
  });

  test("handles tool execution error and continues", async () => {
    const toolCallResponse = new AIMessage({ content: "", tool_calls: [{ id: "c2", name: "bad_tool", args: {} }] });
    const finalResponse = new AIMessage("Não foi possível buscar os dados.");

    const llm = makeMockLLM([toolCallResponse, finalResponse]);
    const toolExecutor = async () => { throw new Error("ferramenta falhou"); };

    const agent = buildAgent(llm, toolExecutor);
    const reply = await agent.chat("teste");

    assert.strictEqual(reply, "Não foi possível buscar os dados.");
  });

  test("throws when MAX_TOOL_ROUNDS is exceeded", async () => {
    // Always returns a tool call — agent loops until max
    const forever = new AIMessage({ content: "", tool_calls: [{ id: "loop", name: "loop_tool", args: {} }] });
    const llm = makeMockLLM(Array(10).fill(forever));

    const agent = buildAgent(llm);
    await assert.rejects(
      () => agent.chat("loop"),
      /MAX_TOOL_ROUNDS/
    );
  });

  test("throws when LLM returns empty content and no tool calls", async () => {
    const llm = makeMockLLM([new AIMessage("")]);
    const agent = buildAgent(llm);
    await assert.rejects(() => agent.chat("test"), /vazia/);
  });
});

describe("Agent — resetHistory()", () => {
  test("clears history to empty array", async () => {
    const llm = makeMockLLM([new AIMessage("hi")]);
    const agent = buildAgent(llm);
    await agent.chat("primeiro");
    assert.ok(agent.history.length > 0, "history should have messages after chat");

    agent.resetHistory();
    assert.strictEqual(agent.history.length, 0, "history should be empty after reset");
  });
});

describe("Agent — _trimHistoryIfNeeded()", () => {
  test("summarizes history when estimated tokens exceed limit", async () => {
    const llm = makeMockLLM([new AIMessage("ok")]);
    const summaryLlm = makeMockLLM([new AIMessage("Resumo comprimido.")]);

    const agent = buildAgent(llm);
    agent.summaryLlm = summaryLlm;
    agent.maxHistoryTokens = 10; // very low limit to force trimming

    // Fill history with enough content to exceed the limit
    const { HumanMessage } = require("@langchain/core/messages");
    for (let i = 0; i < 10; i++) {
      agent.history.push(new HumanMessage("Esta é uma mensagem longa para testar o trimming do histórico."));
    }

    const originalLength = agent.history.length;
    await agent._trimHistoryIfNeeded();

    assert.ok(agent.history.length < originalLength, "history should be shorter after trimming");
    // First message should be a system summary
    const firstMsg = agent.history[0];
    assert.ok(firstMsg.content.includes("Resumo") || firstMsg.content.includes("Contexto anterior"), "first message should be the summary");
  });

  test("does not trim when history is within token budget", async () => {
    const agent = buildAgent(makeMockLLM([]));
    agent.maxHistoryTokens = 10000;

    const { HumanMessage } = require("@langchain/core/messages");
    agent.history.push(new HumanMessage("curta"));
    const lengthBefore = agent.history.length;

    await agent._trimHistoryIfNeeded();
    assert.strictEqual(agent.history.length, lengthBefore, "history should not change when within budget");
  });
});
