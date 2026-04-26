/**
 * test/schema.test.js
 * Teste de integridade para o ToolRegistry (Auto-Discovery).
 * Garante que todas as ferramentas exportadas em /tools/ foram carregadas e seguem o schema.
 */

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const ToolRegistry = require("../src/core/ToolRegistry");

describe("Integridade do ToolRegistry (Auto-Discovery)", () => {
  const definitions = ToolRegistry.getDefinitions();

  test("ToolRegistry deve carregar ferramentas automaticamente", () => {
    assert.ok(Array.isArray(definitions), "As definições de ferramentas devem ser um array");
    assert.ok(definitions.length > 0, "O registro deve conter ferramentas carregadas dos módulos em /tools");
  });

  test("Toda ferramenta carregada deve ter estrutura válida (OpenAI Function Schema)", () => {
    for (const t of definitions) {
      assert.strictEqual(t.type, "function", `A tool ${t.function?.name} deve ter type='function'`);
      assert.ok(t.function?.name, "A tool deve ter um nome definido");
      assert.ok(t.function?.description, `A tool ${t.function?.name} deve ter uma descrição para o LLM`);
      assert.strictEqual(
        t.function?.parameters?.type, 
        "object", 
        `A tool ${t.function?.name} deve definir parameters.type como 'object'`
      );
    }
  });

  test("Não deve haver nomes de ferramentas duplicados no registro", () => {
    const names = definitions.map(t => t.function.name);
    const uniqueNames = new Set(names);
    assert.strictEqual(
      names.length, 
      uniqueNames.size, 
      `Foram detectados nomes duplicados: ${names.filter((n, i) => names.indexOf(n) !== i)}`
    );
  });

  test("Toda definição deve ter um handler funcional vinculado", async () => {
    for (const t of definitions) {
      const name = t.function.name;
      try {
        // Tentamos executar com null apenas para verificar se o ToolRegistry encontra o handler.
        // O erro esperado é de lógica interna do handler, NÃO de "Tool não encontrada".
        await ToolRegistry.execute(name, null);
      } catch (err) {
        assert.notStrictEqual(
          err.message, 
          `Tool não encontrada no registro: ${name}`, 
          `A ferramenta ${name} está no array de definições mas não possui um handler mapeado`
        );
      }
    }
  });

  test("ToolRegistry.execute() deve lançar erro explícito para ferramentas inexistentes", async () => {
    await assert.rejects(
      () => ToolRegistry.execute("ferramenta_fantasma", {}),
      /Tool não encontrada no registro/,
      "O registro deveria barrar ferramentas não cadastradas"
    );
  });
});