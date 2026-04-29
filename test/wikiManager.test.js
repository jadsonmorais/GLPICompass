/**
 * test/wikiManager.test.js
 * Unit tests for src/core/WikiManager.js — renderers and getMinimalContext.
 */

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const {
  getMinimalContext,
  isEmpty,
  line,
  bullets,
  renderProfile,
  renderStack,
  renderPeople,
  renderDecisions,
  renderProjects,
  renderWorking,
} = require("../src/core/WikiManager");

describe("WikiManager — helpers", () => {
  describe("isEmpty()", () => {
    test("null is empty", () => assert.ok(isEmpty(null)));
    test("undefined is empty", () => assert.ok(isEmpty(undefined)));
    test("empty array is empty", () => assert.ok(isEmpty([])));
    test("non-empty array is not empty", () => assert.ok(!isEmpty([1])));
    test("zero is not empty", () => assert.ok(!isEmpty(0)));
    test("false is not empty", () => assert.ok(!isEmpty(false)));
    test("string is not empty", () => assert.ok(!isEmpty("hi")));
  });

  describe("line()", () => {
    test("returns null when value is empty", () => assert.strictEqual(line("Label", null), null));
    test("returns formatted string when value is present", () =>
      assert.strictEqual(line("Empresa", "Carmel"), "- **Empresa:** Carmel"));
  });

  describe("bullets()", () => {
    test("returns '*(nenhum)*' for empty array", () => assert.ok(bullets([]).includes("nenhum")));
    test("returns formatted bullets for non-empty array", () => {
      const result = bullets(["a", "b"]);
      assert.ok(result.includes("- a"));
      assert.ok(result.includes("- b"));
    });
  });
});

describe("WikiManager — section renderers", () => {
  describe("renderProfile()", () => {
    test("returns empty string for null input", () => assert.strictEqual(renderProfile(null), ""));

    test("renders required fields when present", () => {
      const result = renderProfile({ name: "Jadson", cargo: "Dev", empresa: "Acme" });
      assert.ok(result.includes("Jadson"));
      assert.ok(result.includes("Dev"));
      assert.ok(result.includes("Acme"));
    });

    test("renders preferences when present", () => {
      const result = renderProfile({
        preferencias: { tom: "direto", evitar: ["formalidade"], preferir: ["objetividade"] },
      });
      assert.ok(result.includes("direto"));
      assert.ok(result.includes("formalidade"));
    });
  });

  describe("renderStack()", () => {
    test("returns empty string for null input", () => assert.strictEqual(renderStack(null), ""));

    test("renders instancia fields", () => {
      const result = renderStack({ instancia: { empresa: "Carmel", url_base: "https://glpi.test" } });
      assert.ok(result.includes("Carmel"));
      assert.ok(result.includes("https://glpi.test"));
    });

    test("renders convencoes when present", () => {
      const result = renderStack({
        instancia: {},
        convencoes: { idioma_padrao_respostas: "pt-BR", fuso_horario: "America/Fortaleza" },
      });
      assert.ok(result.includes("pt-BR"));
      assert.ok(result.includes("America/Fortaleza"));
    });
  });

  describe("renderPeople()", () => {
    test("renders team table header", () => {
      const result = renderPeople({ team: [{ nome: "Ana", glpi_id: 1, papel: "tecnico", atua_em: [], eh_admin: false, email: "a@b.com" }] });
      assert.ok(result.includes("Time de TI"));
      assert.ok(result.includes("Ana"));
    });

    test("shows VIP placeholder when vips is empty", () => {
      const result = renderPeople({ team: [], vips: [] });
      assert.ok(result.includes("ad-hoc"));
    });
  });

  describe("renderDecisions()", () => {
    test("shows placeholder when no rules", () => {
      const result = renderDecisions({ regras_roteamento: [], decisoes_operacionais: [] });
      assert.ok(result.includes("nenhuma regra cadastrada"));
    });

    test("renders routing rules", () => {
      const result = renderDecisions({
        regras_roteamento: [{ quando: "cupons", entao: "Problem 206", motivo: "causa raiz", data: "2026-01-01" }],
        decisoes_operacionais: [],
      });
      assert.ok(result.includes("cupons"));
      assert.ok(result.includes("Problem 206"));
    });
  });

  describe("renderProjects()", () => {
    test("shows placeholder when no initiatives", () => {
      const result = renderProjects({ iniciativas_ativas: [], problems_abertos: [] });
      assert.ok(result.includes("nenhuma iniciativa registrada"));
    });

    test("renders open problems", () => {
      const result = renderProjects({
        iniciativas_ativas: [],
        problems_abertos: [{ titulo: "Falha no PDV", categoria: "ERP", hipotese_causa: "Bug conhecido" }],
      });
      assert.ok(result.includes("Falha no PDV"));
      assert.ok(result.includes("Bug conhecido"));
    });
  });

  describe("renderWorking()", () => {
    test("renders foco_atual", () => {
      const result = renderWorking({ foco_atual: "Triagem de chamados", em_andamento: [], aguardando: [] });
      assert.ok(result.includes("Triagem de chamados"));
    });

    test("renders last update date when present", () => {
      const result = renderWorking({ ultima_atualizacao: "2026-04-29", foco_atual: "", em_andamento: [], aguardando: [] });
      assert.ok(result.includes("2026-04-29"));
    });
  });
});

describe("WikiManager — getMinimalContext()", () => {
  test("returns a non-empty string", () => {
    const ctx = getMinimalContext();
    assert.ok(typeof ctx === "string");
    assert.ok(ctx.length > 0, "minimal context should not be empty");
  });

  test("contains Contexto da instância header", () => {
    const ctx = getMinimalContext();
    assert.ok(ctx.includes("instância GLPI"), "should contain instance header");
  });

  test("contains instructions to use tools for bulk data", () => {
    const ctx = getMinimalContext();
    assert.ok(ctx.includes("get_team_members"), "should reference wiki tools");
  });

  test("does not include full supplier or tag lists", () => {
    const ctx = getMinimalContext();
    assert.ok(!ctx.includes("CMFlex"), "should not embed supplier names");
    assert.ok(!ctx.includes("Aberta"), "should not embed tag names");
  });
});
