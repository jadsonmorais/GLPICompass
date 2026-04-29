/**
 * test/helpers.test.js
 * Unit tests for lib/helpers.js
 */

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { truncateToolResult } = require("../lib/helpers");

describe("truncateToolResult()", () => {
  test("returns original result when within limit", () => {
    const input = { id: 1, name: "test" };
    const result = truncateToolResult(input, 2000);
    assert.deepStrictEqual(result, input);
  });

  test("returns truncated object when serialized result exceeds limit", () => {
    const bigArray = Array.from({ length: 500 }, (_, i) => ({ id: i, value: "x".repeat(20) }));
    const result = truncateToolResult(bigArray, 100);

    assert.strictEqual(result._truncated, true);
    assert.ok(typeof result._originalLength === "number");
    assert.ok(result._originalLength > 100);
    assert.ok(result.data.endsWith("…"));
    assert.ok(result.data.length <= 101, "truncated data + ellipsis should be close to limit");
  });

  test("truncated data string starts with original JSON", () => {
    const input = { lista: ["a", "b", "c", "d", "e"] };
    const fullJson = JSON.stringify(input);
    const result = truncateToolResult(input, 10);

    assert.ok(result._truncated);
    assert.ok(fullJson.startsWith(result.data.slice(0, 9)));
  });

  test("handles null input without error", () => {
    const result = truncateToolResult(null, 2000);
    assert.strictEqual(result, null);
  });

  test("handles string input", () => {
    const result = truncateToolResult("short", 2000);
    assert.strictEqual(result, "short");
  });

  test("uses default maxChars of 2000", () => {
    // Small object — well within 2000 chars
    const small = { v: "x".repeat(10) };
    assert.deepStrictEqual(truncateToolResult(small), small);

    // Large object that definitely serializes to > 2000 chars
    const large = { v: "x".repeat(3000) };
    const result = truncateToolResult(large);
    assert.ok(result._truncated);
    assert.ok(result._originalLength > 2000);
  });
});
