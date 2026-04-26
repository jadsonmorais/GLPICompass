/**
 * src/core/WikiManager.js
 * Gerencia o carregamento e a renderização da Memory Wiki (YAML -> Markdown).
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { createLogger } = require("../../lib/log");
const glpi = require("../../tools/glpi");
const log = createLogger("../../lib/log-wiki");

// Configurações extraídas do ambiente ou caminhos padrão [1]
const WIKI_DIR = process.env.MEMORY_WIKI_DIR || path.join(__dirname, "../../memory-wiki");
const WIKI_FILES = [
  "profile.yaml",
  "stack.yaml",
  "projects.yaml",
  "decisions.yaml",
  "people.yaml",
  "working.yaml",
];

// --- Helpers de renderização [2] ---
const isEmpty = (v) => v === undefined || v === null || (Array.isArray(v) && v.length === 0);
const line = (label, value) => (isEmpty(value) ? null : `- **${label}:** ${value}`);
const bullets = (arr) => (isEmpty(arr) ? " *(nenhum)* " : arr.map((x) => `- ${x}`).join("\n"));

// --- Funções de Renderização Específicas [2-7] ---

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
  out.push([
    line("Empresa", inst.empresa),
    line("URL base", inst.url_base),
    line("Endpoint API", inst.endpoint_api),
    line("Autenticação", inst.autenticacao),
    line("Entidade", inst.entidade),
    line("Versão GLPI", inst.versao_glpi),
  ].filter(Boolean).join("\n"));

  if (d.grupo_departamento_ti) {
    const g = d.grupo_departamento_ti;
    out.push(`\n### Grupo do departamento de TI\n- ${g.nome} (id=${g.id})`);
  }

  if (!isEmpty(d.grupos_atendimento)) {
    out.push("\n### Grupos de atendimento");
    out.push("| Nome | ID | Coordenador | Escopo |");
    out.push("|---|---|---|---|");
    for (const g of d.grupos_atendimento) {
      out.push(`| ${g.nome} | ${g.id ?? "_(a preencher)_"} | ${g.coordenador || "—"} | ${g.escopo || ""} |`);
    }
  }

  if (!isEmpty(d.fornecedores)) {
    out.push("\n### Fornecedores cadastrados");
    out.push("| Nome | ID | Serviço |");
    out.push("|---|---|---|");
    for (const f of d.fornecedores) {
      out.push(`| ${f.nome} | ${f.id} | ${f.servico || ""} |`);
    }
  }

  if (!isEmpty(d.consultas_personalizadas)) {
    out.push("\n### Consultas personalizadas (plugin utilsdashboards)");
    out.push("Use a tool fetch_custom_query(name) SOMENTE quando o pedido casa com um destes nomes:");
    out.push("| Nome | Descrição | Colunas retornadas |");
    out.push("|---|---|---|");
    for (const q of d.consultas_personalizadas) {
      const cols = Array.isArray(q.colunas) ? q.colunas.join(", ") : "—";
      out.push(`| ${q.nome} | ${q.descricao || ""} | ${cols} |`);
    }
  }

  if (d.convencoes) {
    out.push("\n### Convenções");
    out.push([
      line("Idioma padrão", d.convencoes.idioma_padrao_respostas),
      line("Fuso horário", d.convencoes.fuso_horario),
    ].filter(Boolean).join("\n"));
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
      out.push(`| ${p.nome} | ${p.glpi_id} | ${p.papel} | ${atua} | ${p.eh_admin ? "sim" : "não"} | ${p.email} |`);
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
      out.push(`- **${r.quando}** → ${r.entao} _(${r.motivo || "sem motivo registrado"}, ${r.data || "sem data"})_`);
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

// --- Mapeamento de Renderizadores [8] ---
const RENDERERS = {
  "profile.yaml": renderProfile,
  "stack.yaml": renderStack,
  "projects.yaml": renderProjects,
  "decisions.yaml": renderDecisions,
  "people.yaml": renderPeople,
  "working.yaml": renderWorking,
};

/**
 * Carrega e processa todos os arquivos YAML da wiki para compor o System Prompt. [8]
 */
function loadMemoryWiki() {
  if (!fs.existsSync(WIKI_DIR)) {
    log.warn("diretório não encontrado", { path: WIKI_DIR });
    return "";
  }

  const sections = [];
  for (const name of WIKI_FILES) {
    const full = path.join(WIKI_DIR, name);
    if (!fs.existsSync(full)) continue;

    const raw = fs.readFileSync(full, "utf-8").trim();
    if (!raw) continue;

    let data;
    try {
      data = yaml.load(raw);
    } catch (err) {
      log.error("falha no parse do arquivo", { file: name, error: err.message });
      continue;
    }

    if (!data) continue;

    const renderer = RENDERERS[name];
    if (renderer) {
      const title = name.replace(".yaml", "").toUpperCase();
      const rendered = renderer(data);
      sections.push(`## ${title}\n\n${rendered}`);
    }
  }

  if (!sections.length) return "";

  return [
    "# Memory Wiki (fatos read-only sobre o contexto)",
    ...sections,
    "# Fim da Memory Wiki",
    ""
  ].join("\n\n");
}

module.exports = {
  loadMemoryWiki,
  isEmpty,
  line,
  bullets,
  renderProfile,
  renderStack,
  renderPeople,
  renderDecisions,
  renderProjects,
  renderWorking
};