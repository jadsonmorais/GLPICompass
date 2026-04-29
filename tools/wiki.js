/**
 * tools/wiki.js
 * Memory Wiki sections exposed as on-demand tools.
 * Each tool reads from the YAML files only when called by the agent,
 * eliminating the static system prompt token cost.
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const WIKI_DIR = process.env.MEMORY_WIKI_DIR || path.join(__dirname, "../memory-wiki");

function loadYaml(filename) {
  const full = path.join(WIKI_DIR, filename);
  if (!fs.existsSync(full)) return null;
  return yaml.load(fs.readFileSync(full, "utf-8").trim()) || null;
}

// --- Handlers ---

function getTeamMembers() {
  const d = loadYaml("people.yaml");
  if (!d) return { error: "people.yaml não encontrado" };
  return { team: d.team || [], vips: d.vips || [] };
}

function getTags() {
  const d = loadYaml("stack.yaml");
  if (!d) return { error: "stack.yaml não encontrado" };
  return { tags: d.etiquetas || [] };
}

function getSuppliers() {
  const d = loadYaml("stack.yaml");
  if (!d) return { error: "stack.yaml não encontrado" };
  return { suppliers: d.fornecedores || [] };
}

function getSupportGroups() {
  const d = loadYaml("stack.yaml");
  if (!d) return { error: "stack.yaml não encontrado" };
  return {
    ti_group: d.grupo_departamento_ti || null,
    support_groups: d.grupos_atendimento || [],
  };
}

function getCustomQueriesCatalog() {
  const d = loadYaml("stack.yaml");
  if (!d) return { error: "stack.yaml não encontrado" };
  return { queries: d.consultas_personalizadas || [] };
}

function getActiveProjects() {
  const d = loadYaml("projects.yaml");
  if (!d) return { error: "projects.yaml não encontrado" };
  return {
    active_initiatives: d.iniciativas_ativas || [],
    open_problems: d.problems_abertos || [],
    out_of_scope: d.fora_do_escopo || [],
  };
}

function getRoutingRules() {
  const d = loadYaml("decisions.yaml");
  if (!d) return { error: "decisions.yaml não encontrado" };
  return {
    routing_rules: d.regras_roteamento || [],
    vip_rules: d.regras_vip || [],
    operational_decisions: d.decisoes_operacionais || [],
  };
}

// --- Skill Definitions ---

const skillDefinitions = [
  {
    definition: {
      type: "function",
      function: {
        name: "get_team_members",
        description:
          "Retorna a lista de membros do time de TI da empresa com seus papéis, IDs GLPI e permissões. Use quando precisar saber quem é responsável por algo, atribuir chamados ou verificar permissões de um técnico.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    handler: () => getTeamMembers(),
  },
  {
    definition: {
      type: "function",
      function: {
        name: "get_glpi_tags",
        description:
          "Retorna o catálogo de etiquetas (tags) disponíveis no GLPI com seus IDs e cores. Use para consultar IDs de etiquetas antes de adicionar ou remover uma etiqueta de um chamado.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    handler: () => getTags(),
  },
  {
    definition: {
      type: "function",
      function: {
        name: "get_suppliers",
        description:
          "Retorna a lista de fornecedores cadastrados no GLPI com IDs e serviços prestados. Use para identificar fornecedores ao trabalhar com chamados ou atribuições.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    handler: () => getSuppliers(),
  },
  {
    definition: {
      type: "function",
      function: {
        name: "get_support_groups",
        description:
          "Retorna os grupos de atendimento do departamento de TI (N1, N2-Infra, N2-Sistemas, Dados) com seus IDs GLPI, coordenadores e escopos. Use ao precisar rotear ou atribuir um chamado a um grupo.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    handler: () => getSupportGroups(),
  },
  {
    definition: {
      type: "function",
      function: {
        name: "get_custom_queries_catalog",
        description:
          "Retorna o catálogo de consultas SQL personalizadas disponíveis via plugin utilsdashboards, com nomes e descrições. Use para descobrir quais queries pré-configuradas estão disponíveis antes de chamar fetch_custom_query.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    handler: () => getCustomQueriesCatalog(),
  },
  {
    definition: {
      type: "function",
      function: {
        name: "get_active_projects",
        description:
          "Retorna iniciativas ativas, Problems abertos (incluindo Problem 206) e itens fora do escopo do time de TI. Use ao contextualizar chamados recorrentes ou verificar se algo está relacionado a um Problem conhecido.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    handler: () => getActiveProjects(),
  },
  {
    definition: {
      type: "function",
      function: {
        name: "get_routing_rules",
        description:
          "Retorna as regras de roteamento, regras VIP e decisões operacionais acumuladas. Use antes de decidir para qual grupo rotear um chamado ou como tratar usuários VIP.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    handler: () => getRoutingRules(),
  },
];

module.exports = {
  skillDefinitions,
  // Exposed for testing
  getTeamMembers,
  getTags,
  getSuppliers,
  getSupportGroups,
  getCustomQueriesCatalog,
  getActiveProjects,
  getRoutingRules,
};
