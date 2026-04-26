const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const bot = require("../bot");

describe("renderProfile", () => {
  test("renderiza perfil completo", () => {
    const out = bot.renderProfile({
      name: "Jadson",
      email: "j@example.com",
      glpi_user_id: 157,
      cargo: "Coord. de Sistemas",
      empresa: "Carmel",
      idioma: "pt-BR",
      preferencias: { tom: "direto", evitar: ["jargão"], preferir: ["bullets"] },
      colegas_que_tambem_usam: ["Kevin", "Icaro"],
    });
    assert.match(out, /\*\*Nome:\*\* Jadson/);
    assert.match(out, /\*\*Tom preferido:\*\* direto/);
    assert.match(out, /\*\*Evitar:\*\* jargão/);
    assert.match(out, /\*\*Preferir:\*\* bullets/);
    assert.match(out, /\*\*Colegas que também usam o agente:\*\* Kevin, Icaro/);
    assert.doesNotMatch(out, /undefined/);
  });

  test("perfil parcial — sem preferencias nem colegas", () => {
    const out = bot.renderProfile({ name: "X", email: "x@y.z" });
    assert.match(out, /\*\*Nome:\*\* X/);
    assert.doesNotMatch(out, /Tom preferido/);
    assert.doesNotMatch(out, /undefined/);
  });

  test("perfil vazio devolve string vazia", () => {
    assert.equal(bot.renderProfile({}), "");
  });
});

describe("renderStack", () => {
  test("renderiza instância, grupos, fornecedores e consultas personalizadas", () => {
    const out = bot.renderStack({
      instancia: { empresa: "Carmel", url_base: "https://x", versao_glpi: "10.x" },
      grupo_departamento_ti: { id: 20, nome: "TI" },
      grupos_atendimento: [{ nome: "N1", id: 37, escopo: "primeira linha" }],
      fornecedores: [{ nome: "CMFlex", id: 1, servico: "ERP" }],
      etiquetas: [{ nome: "Aberta", cor: "#45818e", id: 203 }],
      consultas_personalizadas: [
        {
          nome: "Chamados Aguardando Retorno",
          descricao: "Última interação foi do TI",
          colunas: ["id", "Ticket"],
          token_env: "GLPI_QUERY_TOKEN_X",
        },
      ],
      convencoes: { idioma_padrao_respostas: "pt-BR", fuso_horario: "America/Fortaleza" },
    });
    assert.match(out, /### Instância/);
    assert.match(out, /\*\*Empresa:\*\* Carmel/);
    assert.match(out, /TI \(id=20\)/);
    assert.match(out, /\| N1 \| 37 \|/);
    assert.match(out, /\| CMFlex \| 1 \| ERP \|/);
    assert.match(out, /### Consultas personalizadas/);
    assert.match(out, /Chamados Aguardando Retorno/);
    assert.match(out, /\*\*Idioma padrão:\*\* pt-BR/);
    assert.doesNotMatch(out, /undefined/);
  });

  test("não inclui seção de consultas se vazia/ausente", () => {
    const out = bot.renderStack({ instancia: { empresa: "X" } });
    assert.doesNotMatch(out, /Consultas personalizadas/);
  });
});

describe("renderPeople", () => {
  test("renderiza time e cai no fallback de VIPs ad-hoc", () => {
    const out = bot.renderPeople({
      team: [
        { nome: "Kevin", glpi_id: 100, papel: "Tech", atua_em: ["Infra"], eh_admin: false, email: "k@y" },
      ],
      vips: [],
    });
    assert.match(out, /### Time de TI/);
    assert.match(out, /\| Kevin \| 100 \| Tech \| Infra \| não \| k@y \|/);
    assert.match(out, /ad-hoc/);
  });

  test("VIPs cadastrados são renderizados", () => {
    const out = bot.renderPeople({
      team: [],
      vips: [{ criterio: "cargo", valor: "Diretor" }],
    });
    assert.match(out, /### VIPs/);
    assert.match(out, /Diretor/);
    assert.doesNotMatch(out, /ad-hoc/);
  });
});

describe("renderDecisions", () => {
  test("fallback quando não há regras nem decisões", () => {
    const out = bot.renderDecisions({});
    assert.match(out, /nenhuma regra cadastrada/);
    assert.match(out, /nenhuma decisão registrada/);
    assert.doesNotMatch(out, /undefined/);
  });

  test("renderiza regras e decisões operacionais", () => {
    const out = bot.renderDecisions({
      regras_roteamento: [
        { quando: "menciona 'cupom'", entao: "vincular ao Problem 206", motivo: "recorrente", data: "2026-04-01" },
      ],
      regras_vip: [{ criterio: "cargo", valor: "Diretor", urgencia_minima: 4 }],
      decisoes_operacionais: [
        { data: "2026-04-15", decisao: "Etiquetas viram status interno", motivo: "padronização" },
      ],
    });
    assert.match(out, /menciona 'cupom'/);
    assert.match(out, /cargo=Diretor → urgência mínima 4/);
    assert.match(out, /\*\*2026-04-15\*\* — Etiquetas viram status interno/);
    assert.match(out, /Motivo: padronização/);
  });
});

describe("renderProjects", () => {
  test("renderiza iniciativa com prazo_alvo null sem mostrar undefined", () => {
    const out = bot.renderProjects({
      iniciativas_ativas: [
        {
          nome: "Dashboards HTML on-demand",
          descricao: "BI via chat",
          status: "em_curso",
          donos: ["Jadson"],
          prazo_alvo: null,
        },
      ],
      problems_abertos: [],
      fora_do_escopo: [],
    });
    assert.match(out, /\*\*Dashboards HTML on-demand\*\* \(em_curso\)/);
    assert.match(out, /Donos: Jadson/);
    assert.doesNotMatch(out, /Prazo alvo/);
    assert.doesNotMatch(out, /undefined/);
    assert.match(out, /nenhum Problem aberto/);
  });

  test("renderiza problem com palavras-chave e chamados relacionados", () => {
    const out = bot.renderProjects({
      iniciativas_ativas: [],
      problems_abertos: [
        {
          titulo: "Falhas no PDV",
          categoria: "ERP / PDV",
          hipotese_causa: "X",
          chamados_relacionados: [4821, 4830],
        },
      ],
    });
    assert.match(out, /\*\*Falhas no PDV\*\* \(ERP \/ PDV\)/);
    assert.match(out, /Hipótese: X/);
    assert.match(out, /Chamados: 4821, 4830/);
  });
});

describe("renderWorking", () => {
  test("renderiza foco e listas vazias com fallback", () => {
    const out = bot.renderWorking({
      ultima_atualizacao: "2026-04-25",
      foco_atual: "Implementar testes",
      em_andamento: [],
      aguardando: [],
    });
    assert.match(out, /Última atualização: 2026-04-25/);
    assert.match(out, /Foco atual\nImplementar testes/);
    assert.match(out, /_\(nenhum\)_/);
    assert.doesNotMatch(out, /undefined/);
  });
});
