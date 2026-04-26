const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const customQuery = require("../tools/customQuery");
const dashboard = require("../tools/dashboard");
const bot = require("../bot");

describe("customQuery.decodeHtmlEntities", () => {
  test("decodifica entidades numéricas decimais", () => {
    assert.equal(customQuery.decodeHtmlEntities("&#60;p&#62;oi&#60;/p&#62;"), "<p>oi</p>");
  });

  test("decodifica entidades hexadecimais", () => {
    assert.equal(customQuery.decodeHtmlEntities("&#x3c;b&#x3E;x&#x3c;/b&#x3E;"), "<b>x</b>");
  });

  test("decodifica entidades nomeadas básicas", () => {
    assert.equal(customQuery.decodeHtmlEntities("a &amp; b &lt; c &gt; d &quot;e&quot;"), 'a & b < c > d "e"');
  });

  test("decodifica entidades pt-BR (cedilha, til, agudo)", () => {
    assert.equal(
      customQuery.decodeHtmlEntities("a&ccedil;&atilde;o n&atilde;o &eacute; f&aacute;cil"),
      "ação não é fácil"
    );
  });

  test("preserva entidade desconhecida", () => {
    assert.equal(customQuery.decodeHtmlEntities("hello &foo; world"), "hello &foo; world");
  });

  test("trata string vazia e não-string", () => {
    assert.equal(customQuery.decodeHtmlEntities(""), "");
    assert.equal(customQuery.decodeHtmlEntities(null), null);
    assert.equal(customQuery.decodeHtmlEntities(undefined), undefined);
    assert.equal(customQuery.decodeHtmlEntities(42), 42);
  });
});

describe("customQuery.stripHtml", () => {
  test("converte tags de bloco em quebras de linha", () => {
    assert.equal(customQuery.stripHtml("<p>linha 1</p><p>linha 2</p>"), "linha 1\nlinha 2");
  });

  test("trata <br> e <br/>", () => {
    assert.equal(customQuery.stripHtml("a<br>b<br/>c"), "a\nb\nc");
  });

  test("strip de tags inline preserva conteúdo", () => {
    assert.equal(customQuery.stripHtml("<b>bold</b> <i>italic</i>"), "bold italic");
  });

  test("strip de listas com <li>", () => {
    const input = "<ol><li>um</li><li>dois</li></ol>";
    assert.equal(customQuery.stripHtml(input), "um\ndois");
  });

  test("colapsa múltiplas quebras", () => {
    assert.equal(customQuery.stripHtml("a</p><p></p><p></p><p>b"), "a\n\nb");
  });

  test("colapsa múltiplos espaços/tabs", () => {
    assert.equal(customQuery.stripHtml("hello   \t  world"), "hello world");
  });

  test("trata input vazio e não-string", () => {
    assert.equal(customQuery.stripHtml(""), "");
    assert.equal(customQuery.stripHtml(null), null);
    assert.equal(customQuery.stripHtml(123), 123);
  });
});

describe("customQuery.cleanContent (composição)", () => {
  test("decodifica e strip de tags em payload do plugin utilsdashboards", () => {
    // Caso real: &#60;p&#62;Cobrei o desenvolvimento&#60;/p&#62;
    // Já vem como &#60;p&#62; após JSON.parse — esse é o input.
    const raw = "&#60;p&#62;Cobrei o desenvolvimento&#60;/p&#62;";
    assert.equal(customQuery.cleanContent(raw), "Cobrei o desenvolvimento");
  });

  test("preserva estrutura de lista após cleanup", () => {
    const raw =
      "&#60;p&#62;Plano:&#60;/p&#62;&#60;ol&#62;&#60;li&#62;Editar BPM&#60;/li&#62;&#60;li&#62;Testar&#60;/li&#62;&#60;/ol&#62;";
    const out = customQuery.cleanContent(raw);
    assert.match(out, /Plano:/);
    assert.match(out, /Editar BPM/);
    assert.match(out, /Testar/);
  });
});

describe("dashboard.slugify", () => {
  test("normaliza acentos e caracteres pt-BR", () => {
    assert.equal(dashboard.slugify("Não-Solucionados por Categoria"), "nao-solucionados-por-categoria");
  });

  test("substitui caracteres inválidos por hífen", () => {
    assert.equal(dashboard.slugify("backlog @ 100% / dia"), "backlog-100-dia");
  });

  test("trunca em 60 caracteres", () => {
    const long = "a".repeat(120);
    const out = dashboard.slugify(long);
    assert.equal(out.length, 60);
    assert.equal(out, "a".repeat(60));
  });

  test("fallback 'dashboard' quando string fica vazia", () => {
    assert.equal(dashboard.slugify("@@@"), "dashboard");
    assert.equal(dashboard.slugify(""), "dashboard");
  });

  test("remove hífens de borda", () => {
    assert.equal(dashboard.slugify("---hello---world---"), "hello-world");
  });
});

describe("bot helpers (isEmpty / line / bullets)", () => {
  test("isEmpty trata undefined, null, [] e valores válidos", () => {
    assert.equal(bot.isEmpty(undefined), true);
    assert.equal(bot.isEmpty(null), true);
    assert.equal(bot.isEmpty([]), true);
    assert.equal(bot.isEmpty(""), false); // strings vazias não são tratadas como empty pelo helper atual
    assert.equal(bot.isEmpty("x"), false);
    assert.equal(bot.isEmpty([1]), false);
    assert.equal(bot.isEmpty(0), false);
  });

  test("line devolve null quando valor está vazio", () => {
    assert.equal(bot.line("Nome", undefined), null);
    assert.equal(bot.line("Nome", null), null);
    assert.equal(bot.line("Nome", []), null);
  });

  test("line formata em markdown com label em negrito", () => {
    assert.equal(bot.line("Nome", "Jadson"), "- **Nome:** Jadson");
  });

  test("bullets devolve fallback quando array vazio", () => {
    assert.equal(bot.bullets([]), "_(nenhum)_");
    assert.equal(bot.bullets(undefined), "_(nenhum)_");
  });

  test("bullets monta lista markdown", () => {
    assert.equal(bot.bullets(["a", "b", "c"]), "- a\n- b\n- c");
  });
});
