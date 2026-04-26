require("dotenv").config();
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const WIKI_DIR = process.env.MEMORY_WIKI_DIR || path.join(__dirname, "..", "memory-wiki");
const BASE_URL = (process.env.GLPI_DASHBOARDS_BASE_URL || "").replace(/\?.*$/, "").replace(/\/$/, "");

const log = require('../lib/log');

let cachedCatalog = null;

function loadCatalog() {
  if (cachedCatalog) return cachedCatalog;
  const stackPath = path.join(WIKI_DIR, "stack.yaml");
  if (!fs.existsSync(stackPath)) {
    cachedCatalog = [];
    return cachedCatalog;
  }
  const raw = fs.readFileSync(stackPath, "utf-8");
  const data = yaml.load(raw) || {};
  cachedCatalog = Array.isArray(data.consultas_personalizadas) ? data.consultas_personalizadas : [];
  return cachedCatalog;
}

const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ccedil: "ç", Ccedil: "Ç", aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  atilde: "ã", otilde: "õ", Atilde: "Ã", Otilde: "Õ",
  acirc: "â", ecirc: "ê", icirc: "î", ocirc: "ô", ucirc: "û",
  Acirc: "Â", Ecirc: "Ê", Icirc: "Î", Ocirc: "Ô", Ucirc: "Û",
};

function decodeHtmlEntities(str) {
  if (typeof str !== "string") return str;
  let s = str.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
  s = s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
  s = s.replace(/&([a-zA-Z]+);/g, (m, name) => (NAMED_ENTITIES[name] !== undefined ? NAMED_ENTITIES[name] : m));
  return s;
}

function stripHtml(html) {
  if (typeof html !== "string") return html;
  let s = html.replace(/<\/(p|li|div|tr|h[1-6])>/gi, "\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = s.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+/g, " ").trim();
  return s;
}

function cleanContent(value) {
  return stripHtml(decodeHtmlEntities(value));
}

function findEntry(name) {
  const catalog = loadCatalog();
  const norm = String(name || "").trim().toLowerCase();
  return catalog.find((q) => String(q.nome || "").trim().toLowerCase() === norm);
}

async function fetchCustomQuery(name) {
  if (!BASE_URL) {
    throw new Error("GLPI_DASHBOARDS_BASE_URL não está setado no .env");
  }
  const entry = findEntry(name);
  if (!entry) {
    const known = loadCatalog().map((q) => q.nome).filter(Boolean);
    throw new Error(
      `Consulta personalizada "${name}" não encontrada. Disponíveis: ${known.length ? known.join(", ") : "(nenhuma)"}.`
    );
  }
  const tokenEnv = entry.token_env;
  if (!tokenEnv) throw new Error(`Entrada "${entry.nome}" sem token_env definido em stack.yaml.`);
  const token = process.env[tokenEnv];
  if (!token) throw new Error(`Variável ${tokenEnv} não está setada no .env.`);

  const url = `${BASE_URL}?token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Custom query "${entry.nome}" -> HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (err) {
    throw new Error(`Custom query "${entry.nome}" devolveu JSON inválido: ${text.slice(0, 300)}`);
  }

  const rows = Array.isArray(payload?.data) ? payload.data : [];
  for (const row of rows) {
    if (row && typeof row.content === "string") row.content = cleanContent(row.content);
  }

  return {
    name: payload?.name || entry.nome,
    comment: payload?.comment || entry.descricao || "",
    descricao: entry.descricao || "",
    colunas: entry.colunas || (rows[0] ? Object.keys(rows[0]) : []),
    count: rows.length,
    data: rows,
  };
}

function listCustomQueries() {
  return loadCatalog().map((q) => ({
    nome: q.nome,
    descricao: q.descricao || "",
    colunas: q.colunas || [],
  }));
}

module.exports = {
  fetchCustomQuery,
  listCustomQueries,
  decodeHtmlEntities,
  stripHtml,
  cleanContent,
};
