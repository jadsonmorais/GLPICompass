// Meta-teste de integridade: toda TOOLS[].function.name aparece como case em runTool,
// e todo case em runTool aparece em TOOLS. Pega o erro mais comum: adicionar tool
// e esquecer do switch (ou vice-versa).

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const bot = require("../bot");

function extractCases(fn) {
  const src = fn.toString();
  const re = /case\s+"([^"]+)"\s*:/g;
  const out = new Set();
  let m;
  while ((m = re.exec(src))) out.add(m[1]);
  return out;
}

describe("integridade TOOLS ↔ runTool", () => {
  const toolNames = new Set(bot.TOOLS.map((t) => t.function.name));
  const cases = extractCases(bot.runTool);

  test("toda tool declarada em TOOLS tem case correspondente em runTool", () => {
    const missing = [...toolNames].filter((n) => !cases.has(n));
    assert.deepEqual(missing, [], `Faltando case em runTool para: ${missing.join(", ")}`);
  });

  test("todo case em runTool tem tool declarada em TOOLS", () => {
    const orphans = [...cases].filter((n) => !toolNames.has(n));
    assert.deepEqual(orphans, [], `Cases sem TOOLS correspondente: ${orphans.join(", ")}`);
  });

  test("não há nomes duplicados em TOOLS", () => {
    const all = bot.TOOLS.map((t) => t.function.name);
    assert.equal(all.length, new Set(all).size, "Nomes duplicados em TOOLS");
  });

  test("toda TOOLS tem name, description e parameters", () => {
    for (const t of bot.TOOLS) {
      assert.equal(t.type, "function", `tool sem type=function`);
      assert.ok(t.function?.name, `tool sem name`);
      assert.ok(t.function?.description, `tool ${t.function?.name} sem description`);
      assert.equal(t.function?.parameters?.type, "object", `tool ${t.function.name} sem parameters.type=object`);
    }
  });

  test("runTool lança erro pra tool desconhecida", async () => {
    await assert.rejects(() => bot.runTool("__nao_existe__", {}), /Unknown tool/);
  });
});
