/**
 * tools/customQuery.js
 * Camada 5 - Consultas Personalizadas via Plugin utilsdashboards.
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { createLogger } = require('../lib/log');

const log = createLogger('custom-query');

const WIKI_DIR = process.env.MEMORY_WIKI_DIR || path.join(__dirname, "..", "memory-wiki");
const BASE_URL = (process.env.GLPI_DASHBOARDS_BASE_URL || "").replace(/\?.*$/, "").replace(/\/$/, "");

let cachedCatalog = null;

// --- Helpers de Sanitização ---

const NAMED_ENTITIES = { 
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ccedil: "ç", 
  Ccedil: "Ç", aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  // ... (mantido conforme a versão original para suporte pt-BR)
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
  let s = html.replace(/<\/(p|li|div|tr|h[3-8])>/gi, "\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = s.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+/g, " ").trim();
  return s;
}

function cleanContent(value) {
  return stripHtml(decodeHtmlEntities(value));
}

// --- Lógica de Catálogo e Execução ---

function loadCatalog() {
  if (cachedCatalog) return cachedCatalog;
  const stackPath = path.join(WIKI_DIR, "stack.yaml");
  if (!fs.existsSync(stackPath)) {
    cachedCatalog = [];
    return cachedCatalog;
  }
  try {
    const raw = fs.readFileSync(stackPath, "utf-8");
    const data = yaml.load(raw) || {};
    cachedCatalog = Array.isArray(data.consultas_personalizadas) ? data.consultas_personalizadas : [];
  } catch (err) {
    log.error("erro ao carregar catálogo de consultas", { error: err.message });
    cachedCatalog = [];
  }
  return cachedCatalog;
}

function findEntry(name) {
  const catalog = loadCatalog();
  const norm = String(name || "").trim().toLowerCase();
  return catalog.find((q) => String(q.nome || "").trim().toLowerCase() === norm);
}

async function fetchCustomQuery(name) {
  if (!BASE_URL) throw new Error("GLPI_DASHBOARDS_BASE_URL não está setado no .env");

  const entry = findEntry(name);
  if (!entry) {
    const known = loadCatalog().map((q) => q.nome).filter(Boolean);
    throw new Error(`Consulta personalizada "${name}" não encontrada. Disponíveis: ${known.join(", ")}`);
  }

  const tokenEnv = entry.token_env;
  const token = process.env[tokenEnv];
  if (!token) throw new Error(`Token ${tokenEnv} não configurado no .env`);

  const url = `${BASE_URL}?token=${encodeURIComponent(token)}`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    const payload = await res.json();
    const rows = Array.isArray(payload?.data) ? payload.data : [];

    // Limpa o conteúdo HTML das linhas retornadas
    for (const row of rows) {
      if (row && typeof row.content === "string") row.content = cleanContent(row.content);
    }

    return {
      name: payload?.name || entry.nome,
      descricao: entry.descricao || "",
      colunas: entry.colunas || (rows ? Object.keys(rows) : []),
      count: rows.length,
      data: rows,
    };
  } catch (err) {
    log.error("falha na execução da query customizada", { query: name, error: err.message });
    throw err;
  }
}

// --- Definição de Skills (Auto-Discovery) ---

const skillDefinitions = [
  {
    definition: {
      type: "function",
      function: {
        name: "fetch_custom_query",
        description: "Executa uma consulta SQL personalizada do GLPI (plugin utilsdashboards). Use APENAS quando o pedido casa com um nome em STACK→consultas_personalizadas.",
        parameters: {
          type: "object",
          properties: {
            name: { 
              type: "string", 
              description: "Nome exato da consulta conforme listado na Memory Wiki." 
            }
          },
          required: ["name"]
        }
      }
    },
    handler: (args) => fetchCustomQuery(args.name)
  }
];

module.exports = {
  fetchCustomQuery,
  skillDefinitions,
  decodeHtmlEntities,
  stripHtml,
  cleanContent
};