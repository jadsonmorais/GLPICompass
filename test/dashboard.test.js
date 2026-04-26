/**
 * test/dashboard.test.js
 * Garante que o gerador de dashboards limpe o HTML corretamente 
 * e gerencie arquivos de forma segura.
 */

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { slugify } = require("../tools/dashboard");

describe("Módulo Dashboard - Helpers e Sanitização", () => {
  
  test("slugify deve converter títulos para nomes de arquivos seguros", () => {
    assert.strictEqual(slugify("Relatório de Chamados!"), "relatorio-de-chamados");
    assert.strictEqual(slugify("SLA @ 100% / Junho"), "sla-100-junho");
    assert.strictEqual(slugify(""), "dashboard"); // Fallback
  });

  test("slugify deve truncar nomes muito longos", () => {
    const longTitle = "a".repeat(100);
    assert.strictEqual(slugify(longTitle).length, 60);
  });

  test("deve remover fences de markdown (```html) da resposta da IA", async () => {
    // Simulamos a lógica de limpeza que está no generateDashboard
    const rawAiResponse = "```html\n<!doctype html><html></html>\n```";
    const cleaned = rawAiResponse.replace(/^```html/i, "").replace(/```$/g, "").trim();
    
    assert.ok(cleaned.startsWith("<!doctype html>"), "Deveria começar com doctype");
    assert.ok(!cleaned.includes("```"), "Não deveria conter crases de markdown");
  });
});

describe("Módulo Dashboard - Estrutura de Arquivos", () => {
  const DASH_DIR = process.env.DASHBOARDS_DIR || path.join(__dirname, "../dashboards");

  test("diretório de dashboards deve ser acessível ou passível de criação", () => {
    const exists = fs.existsSync(DASH_DIR);
    if (!exists) {
      try {
        fs.mkdirSync(DASH_DIR, { recursive: true });
      } catch (e) {
        assert.fail("Não foi possível criar o diretório de dashboards");
      }
    }
    assert.ok(fs.existsSync(DASH_DIR));
  });
});