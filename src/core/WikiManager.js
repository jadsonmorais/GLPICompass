/**
 * src/core/WikiManager.js
 * Loads and renders Memory Wiki YAMLs.
 *
 * Architecture change: bulk Wiki data (team, tags, suppliers, etc.) is now
 * exposed via on-demand tools in tools/wiki.js. WikiManager only provides
 * getMinimalContext() — a small fixed string injected into the system prompt
 * with instance-level facts that are always relevant.
 *
 * Individual section loaders (renderProfile, renderStack, …) are kept and
 * exported so they can be tested independently and reused if needed.
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { createLogger } = require("../../lib/log");

const log = createLogger("wiki");

const WIKI_DIR = process.env.MEMORY_WIKI_DIR || path.join(__dirname, "../../memory-wiki");

// --- Helpers ---
const isEmpty = (v) => v === undefined || v === null || (Array.isArray(v) && v.length === 0);
const line = (label, value) => (isEmpty(value) ? null : `- **${label}:** ${value}`);
const bullets = (arr) => (isEmpty(arr) ? " *(nenhum)* " : arr.map((x) => `- ${x}`).join("\n"));

function loadYaml(filename) {
  const full = path.join(WIKI_DIR, filename);
  if (!fs.existsSync(full)) {
    log.warn("arquivo não encontrado", { file: filename });
    return null;
  }
  try {
    return yaml.load(fs.readFileSync(full, "utf-8").trim()) || null;
  } catch (err) {
    log.error("falha no parse", { file: filename, error: err.message });
    return null;
  }
}

// --- Section renderers (kept for tests and potential reuse) ---

function renderProfile(d) {
  if (isEmpty(d)) return "";
  const out = [
    line("Nome", d.name),
    line("Email", d.email),
    line("GLPI user ID", d.glpi_user_id),
    line("Cargo", d.cargo),
    line("Empresa", d.empresa),
    line("Idioma", d.idioma),
  ].filter(Boolean);

  const pref = d.preferencias || {};
  if (pref.tom) out.push(`- **Tom preferido:** ${pref.tom}`);
  if (!isEmpty(pref.evitar)) out.push(`- **Evitar:** ${pref.evitar.join(", ")}`);
  if (!isEmpty(pref.preferir)) out.push(`- **Preferir:** ${pref.preferir.join(", ")}`);
  if (!isEmpty(d.colegas_que_tambem_usam)) {
    out.push(`- **Colegas que também usam o agente:** ${d.colegas_que_tambem_usam.join(", ")}`);
  }
  return out.join("\n");
}

function renderStack(d) {
  if (isEmpty(d)) return "";
  const out = [];
  const inst = d.instancia || {};
  out.push("### Instância");
  out.push(
    [
      line("Empresa", inst.empresa),
      line("URL base", inst.url_base),
      line("Endpoint API", inst.endpoint_api),
      line("Autenticação", inst.autenticacao),
      line("Entidade", inst.entidade),
      line("Versão GLPI", inst.versao_glpi),
    ]
      .filter(Boolean)
      .join("\n")
  );
  if (d.convencoes) {
    out.push("\n### Convenções");
    out.push(
      [
        line("Idioma padrão", d.convencoes.idioma_padrao_respostas),
        line("Fuso horário", d.convencoes.fuso_horario),
      ]
        .filter(Boolean)
        .join("\n")
    );
  }
  return out.join("\n");
}

function renderPeople(d) {
  const out = [];
  if (!isEmpty(d.team)) {
    out.push("### Time de TI");
    out.push("| Nome | GLPI ID | Papel | Atua em | Admin | Email |");
    out.push("|---|---|---|---|---|---|");
    for (const p of d.team) {
      const atua = isEmpty(p.atua_em) ? "—" : p.atua_em.join(", ");
      out.push(
        `| ${p.nome} | ${p.glpi_id} | ${p.papel} | ${atua} | ${p.eh_admin ? "sim" : "não"} | ${p.email} |`
      );
    }
  }
  if (!isEmpty(d.vips)) {
    out.push("\n### VIPs");
    for (const v of d.vips) out.push(`- ${JSON.stringify(v)}`);
  } else {
    out.push("\n### VIPs\n_(ad-hoc por enquanto — sem regra formal)_");
  }
  return out.join("\n");
}

function renderDecisions(d) {
  const out = [];
  out.push("### Regras de roteamento");
  if (isEmpty(d.regras_roteamento)) {
    out.push(" *(nenhuma regra cadastrada)* ");
  } else {
    for (const r of d.regras_roteamento) {
      out.push(
        `- **${r.quando}** → ${r.entao} _(${r.motivo || "sem motivo registrado"}, ${r.data || "sem data"})_`
      );
    }
  }
  out.push("\n### Decisões operacionais (append-only)");
  if (isEmpty(d.decisoes_operacionais)) {
    out.push(" *(nenhuma decisão registrada)* ");
  } else {
    for (const dec of d.decisoes_operacionais) {
      out.push(`- **${dec.data}** — ${dec.decisao}`);
      if (dec.motivo) out.push(`  - Motivo: ${dec.motivo}`);
    }
  }
  return out.join("\n");
}

function renderProjects(d) {
  const out = [];
  out.push("### Iniciativas ativas");
  if (isEmpty(d.iniciativas_ativas)) {
    out.push(" *(nenhuma iniciativa registrada)* ");
  } else {
    for (const i of d.iniciativas_ativas) {
      out.push(`- **${i.nome}** (${i.status}) — ${i.descricao}`);
      if (!isEmpty(i.donos)) out.push(`  - Donos: ${i.donos.join(", ")}`);
    }
  }
  out.push("\n### Problems em aberto");
  if (isEmpty(d.problems_abertos)) {
    out.push(" *(nenhum Problem aberto)* ");
  } else {
    for (const p of d.problems_abertos) {
      out.push(`- **${p.titulo}** (${p.categoria || "sem categoria"})`);
      if (p.hipotese_causa) out.push(`  - Hipótese: ${p.hipotese_causa}`);
    }
  }
  return out.join("\n");
}

function renderWorking(d) {
  const out = [];
  if (d.ultima_atualizacao) out.push(`_Última atualização: ${d.ultima_atualizacao}_`);
  out.push(`\n### Foco atual\n${d.foco_atual || "_(não definido)_"}`);
  out.push(`\n### Em andamento\n${bullets(d.em_andamento)}`);
  out.push(`\n### Aguardando\n${bullets(d.aguardando)}`);
  return out.join("\n");
}

/**
 * Returns a compact string with only instance-level facts that are always
 * relevant (company, base URL, timezone). Injected into every system prompt.
 *
 * All bulk data (team, tags, suppliers, groups, projects, rules) is fetched
 * on demand via tools/wiki.js tools.
 */
function getMinimalContext() {
  const stack = loadYaml("stack.yaml");
  if (!stack) return "";

  const inst = stack.instancia || {};
  const conv = stack.convencoes || {};

  const lines = [
    "# Contexto da instância GLPI",
    inst.empresa ? `- **Empresa:** ${inst.empresa}` : null,
    inst.url_base ? `- **URL base:** ${inst.url_base}` : null,
    inst.endpoint_api ? `- **API endpoint:** ${inst.endpoint_api}` : null,
    conv.idioma_padrao_respostas ? `- **Idioma de resposta:** ${conv.idioma_padrao_respostas}` : null,
    conv.fuso_horario ? `- **Fuso horário:** ${conv.fuso_horario}` : null,
    "",
    "Para consultar times, etiquetas, fornecedores, grupos, projetos ou regras, use as ferramentas disponíveis (get_team_members, get_glpi_tags, etc.).",
  ].filter((l) => l !== null);

  return lines.join("\n");
}

module.exports = {
  getMinimalContext,
  loadYaml,
  isEmpty,
  line,
  bullets,
  renderProfile,
  renderStack,
  renderPeople,
  renderDecisions,
  renderProjects,
  renderWorking,
};
