// Mocka globalThis.fetch e testa a construção de URL/criteria do wrapper GLPI.
// Não toca em rede real. Garante valores padrão antes de carregar dotenv.

process.env.GLPI_URL = process.env.GLPI_URL || "https://test.glpi.example/apirest.php";
process.env.GLPI_APP_TOKEN = process.env.GLPI_APP_TOKEN || "TEST_APP_TOKEN";
process.env.GLPI_USER_TOKEN = process.env.GLPI_USER_TOKEN || "TEST_USER_TOKEN";

const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

let glpi;
let originalFetch;
let calls;

function freshGlpi() {
  // Limpa cache pra zerar o sessionToken cacheado entre testes.
  const resolved = require.resolve("../tools/glpi");
  delete require.cache[resolved];
  glpi = require("../tools/glpi");
}

function makeFetchStub({ searchData = [], failInit = false } = {}) {
  return async function stubFetch(url, init = {}) {
    calls.push({ url: String(url), init });
    if (String(url).includes("/initSession")) {
      if (failInit) {
        return {
          ok: false,
          status: 401,
          text: async () => '{"error":"WRONG_APP_TOKEN"}',
          json: async () => ({ error: "WRONG_APP_TOKEN" }),
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => '{"session_token":"FAKE_SESSION_TOKEN"}',
        json: async () => ({ session_token: "FAKE_SESSION_TOKEN" }),
      };
    }
    const body = JSON.stringify({ totalcount: searchData.length, count: searchData.length, data: searchData });
    return {
      ok: true,
      status: 200,
      text: async () => body,
      json: async () => JSON.parse(body),
    };
  };
}

beforeEach(() => {
  calls = [];
  originalFetch = globalThis.fetch;
  globalThis.fetch = makeFetchStub();
  freshGlpi();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("initSession", () => {
  test("envia App-Token no header E na query string (regressão proxy)", async () => {
    await glpi.listOpenTickets({ limit: 1 });
    const initCall = calls.find((c) => c.url.includes("/initSession"));
    assert.ok(initCall, "deveria ter chamado initSession antes da search");
    assert.match(initCall.url, /[?&]app_token=TEST_APP_TOKEN(&|$)/);
    assert.equal(initCall.init.headers["App-Token"], "TEST_APP_TOKEN");
    assert.equal(initCall.init.headers.Authorization, "user_token TEST_USER_TOKEN");
  });
});

describe("listOpenTickets", () => {
  test("monta criteria de status=notold + range + sort", async () => {
    await glpi.listOpenTickets({ limit: 5, order: "ASC" });
    const search = calls.find((c) => c.url.includes("/search/Ticket"));
    assert.ok(search, "deveria ter chamado /search/Ticket");
    assert.match(search.url, /criteria%5B0%5D%5Bfield%5D=12/);
    assert.match(search.url, /criteria%5B0%5D%5Bsearchtype%5D=equals/);
    assert.match(search.url, /criteria%5B0%5D%5Bvalue%5D=notold/);
    assert.match(search.url, /range=0-4/);
    assert.match(search.url, /order=ASC/);
    assert.match(search.url, /sort=19/);
  });

  test("inclui forcedisplay para categoria/grupo/localização/fornecedor (dashboards)", async () => {
    await glpi.listOpenTickets({ limit: 10 });
    const search = calls.find((c) => c.url.includes("/search/Ticket"));
    assert.match(search.url, /forcedisplay%5B8%5D=7/, "forcedisplay[8]=7 (Categoria)");
    assert.match(search.url, /forcedisplay%5B9%5D=8/, "forcedisplay[9]=8 (Grupo técnico)");
    assert.match(search.url, /forcedisplay%5B10%5D=83/, "forcedisplay[10]=83 (Localização/Hotel)");
    assert.match(search.url, /forcedisplay%5B11%5D=6/, "forcedisplay[11]=6 (Fornecedor)");
  });
});

describe("searchTickets", () => {
  test("monta OR entre título (1) e conteúdo (21)", async () => {
    await glpi.searchTickets({ text: "cupom" });
    const search = calls.find((c) => c.url.includes("/search/Ticket"));
    assert.match(search.url, /criteria%5B0%5D%5Bfield%5D=1/);
    assert.match(search.url, /criteria%5B0%5D%5Bsearchtype%5D=contains/);
    assert.match(search.url, /criteria%5B0%5D%5Bvalue%5D=cupom/);
    assert.match(search.url, /criteria%5B1%5D%5Blink%5D=OR/);
    assert.match(search.url, /criteria%5B1%5D%5Bfield%5D=21/);
  });

  test("anexa filtro de status=notold quando onlyOpen (padrão)", async () => {
    await glpi.searchTickets({ text: "x" });
    const search = calls.find((c) => c.url.includes("/search/Ticket"));
    assert.match(search.url, /criteria%5B2%5D%5Bfield%5D=12/);
    assert.match(search.url, /criteria%5B2%5D%5Bvalue%5D=notold/);
  });

  test("não anexa filtro de status quando onlyOpen=false", async () => {
    await glpi.searchTickets({ text: "x", onlyOpen: false });
    const search = calls.find((c) => c.url.includes("/search/Ticket"));
    assert.doesNotMatch(search.url, /criteria%5B2%5D%5Bvalue%5D=notold/);
  });

  test("rejeita texto vazio", async () => {
    await assert.rejects(() => glpi.searchTickets({ text: "" }), /requires 'text'/);
  });
});

describe("listTicketsBySupplier", () => {
  test("aplica criteria field=6 (Atribuído a um fornecedor)", async () => {
    globalThis.fetch = makeFetchStub({
      searchData: [
        { 2: 100, 1: "ok", 76677: "EXT-1" },
        { 2: 101, 1: "vazio", 76677: "" },
        { 2: 102, 1: "null", 76677: null },
      ],
    });
    const res = await glpi.listTicketsBySupplier({ supplierId: 1 });
    const search = calls.find((c) => c.url.includes("/search/Ticket"));
    assert.match(search.url, /criteria%5B0%5D%5Bfield%5D=6/);
    assert.match(search.url, /criteria%5B0%5D%5Bvalue%5D=1/);
    // Por padrão filtra por ID externo populado — só o ticket 100 deveria sobrar
    assert.equal(res.data.length, 1);
    assert.equal(res.data[0]["2"], 100);
    assert.equal(res.count, 1);
  });

  test("requireExternalId=false desliga o filtro client-side", async () => {
    globalThis.fetch = makeFetchStub({
      searchData: [
        { 2: 100, 76677: "EXT-1" },
        { 2: 101, 76677: "" },
      ],
    });
    const res = await glpi.listTicketsBySupplier({ supplierId: 1, requireExternalId: false });
    assert.equal(res.data.length, 2);
  });

  test("inclui forcedisplay[12]=76677 (Ticket Externo)", async () => {
    await glpi.listTicketsBySupplier({ supplierId: 1 });
    const search = calls.find((c) => c.url.includes("/search/Ticket"));
    assert.match(search.url, /forcedisplay%5B12%5D=76677/);
  });

  test("rejeita supplierId não numérico", async () => {
    await assert.rejects(() => glpi.listTicketsBySupplier({ supplierId: "x" }), /numeric 'supplierId'/);
  });
});

describe("listTicketsByTag", () => {
  test("usa criteria field=10500 (Etiquetas)", async () => {
    await glpi.listTicketsByTag({ tagId: 205 });
    const search = calls.find((c) => c.url.includes("/search/Ticket"));
    assert.match(search.url, /criteria%5B0%5D%5Bfield%5D=10500/);
    assert.match(search.url, /criteria%5B0%5D%5Bvalue%5D=205/);
  });

  test("rejeita tagId não numérico", async () => {
    await assert.rejects(() => glpi.listTicketsByTag({ tagId: null }), /numeric 'tagId'/);
  });
});

module.exports = {
  
};
