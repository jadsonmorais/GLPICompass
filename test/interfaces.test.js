/**
 * test/interfaces.test.js
 * Smoke tests for src/interfaces — verifies that runCli() and runTelegram()
 * wire up their dependencies correctly without calling real APIs.
 *
 * These tests catch the class of bug where a module refactor renames a function
 * (e.g. loadMemoryWiki → getMinimalContext) but an interface that calls it is
 * not updated.
 */

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("module");

// Minimal env so modules don't throw on missing vars
process.env.GLPI_URL = "http://test.local";
process.env.GLPI_APP_TOKEN = "fake";
process.env.GLPI_USER_TOKEN = "fake";
process.env.TELEGRAM_BOT_TOKEN = "12345:fake";
process.env.AI_PROVIDER = "ollama";
process.env.MODEL = "llama3.2";

// Stub node-telegram-bot-api via require.cache before telegram.js is loaded
const fakeBotPath = require.resolve("node-telegram-bot-api");
require.cache[fakeBotPath] = {
  id: fakeBotPath,
  filename: fakeBotPath,
  loaded: true,
  exports: class FakeBot {
    constructor() {}
    getMe() { return Promise.resolve({ username: "test_bot" }); }
    onText() {}
    on() {}
  },
};

describe("Interface smoke tests — dependency wiring", () => {
  describe("WikiManager public API", () => {
    test("exports getMinimalContext (not loadMemoryWiki)", () => {
      const WikiManager = require("../src/core/WikiManager");
      assert.strictEqual(
        typeof WikiManager.getMinimalContext, "function",
        "WikiManager must export getMinimalContext — cli.js and telegram.js depend on it"
      );
      assert.strictEqual(
        typeof WikiManager.loadMemoryWiki, "undefined",
        "loadMemoryWiki was removed — any remaining caller will crash at runtime"
      );
    });

    test("getMinimalContext() returns a non-empty string", () => {
      const { getMinimalContext } = require("../src/core/WikiManager");
      const result = getMinimalContext();
      assert.ok(typeof result === "string" && result.length > 0);
    });
  });

  describe("cli.js", () => {
    test("imports without error", () => {
      assert.doesNotThrow(() => require("../src/interfaces/cli"));
    });

    test("exports runCli as a function", () => {
      const { runCli } = require("../src/interfaces/cli");
      assert.strictEqual(typeof runCli, "function");
    });
  });

  describe("telegram.js", () => {
    test("imports without error", () => {
      assert.doesNotThrow(() => require("../src/interfaces/telegram"));
    });

    test("exports runTelegram as a function", () => {
      const { runTelegram } = require("../src/interfaces/telegram");
      assert.strictEqual(typeof runTelegram, "function");
    });

    test("runTelegram() resolves without throwing (mocked bot)", async () => {
      const { runTelegram } = require("../src/interfaces/telegram");
      await assert.doesNotReject(() => runTelegram());
    });
  });

  describe("ToolRegistry wiring", () => {
    test("wiki tools are all registered", () => {
      const ToolRegistry = require("../src/core/ToolRegistry");
      const names = ToolRegistry.getDefinitions().map(t => t.function.name);
      const expected = [
        "get_team_members", "get_glpi_tags", "get_suppliers",
        "get_support_groups", "get_custom_queries_catalog",
        "get_active_projects", "get_routing_rules",
      ];
      for (const name of expected) {
        assert.ok(names.includes(name), `Tool '${name}' must be registered`);
      }
    });
  });
});
