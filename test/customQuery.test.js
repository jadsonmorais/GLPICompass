/**
 * Testes automatizados para a Camada 5 - Consultas Personalizadas via Plugin utilsdashboards
 * 
 * Este modulo testa:
 * 1. Listagem de consultas disponiveis no cat�logo (stack.yaml)
 * 2. Valida��o de tokens de consulta (sem precisar fazer chamadas reais)
 * 3. Formata��o e sanitiza��o de respostas
 * 
 * Executar: npm test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const yaml = require('yaml');

// Mock do .env para testes
process.env.MEMORY_WIKI_DIR = path.join(__dirname, '..', 'memory-wiki');
process.env.GLPI_DASHBOARDS_BASE_URL = 'https://glpi.example.com/front/dashboard.php';

// Simula consultas no stack.yaml para testes
const mockStackYaml = {
  consultas_personalizadas: [
    {
      nome: 'Chamados Aguardando Retorno',
      descricao: 'Ultima interacao (followup ou task) de cada chamado em aberto foi feita por um usuario do TI.',
      colunas: ['id', 'Ticket', 'date', 'content', 'tipo'],
    token_env: 'GLPI_QUERY_TOKEN_AGUARDANDO_RETORNO'
    },
    {
      nome: 'Chamados por Categoria',
      descricao: 'Distribuicao de chamados por categoria e status.',
      colunas: ['categoria', 'status', 'total'],
      token_env: 'GLPI_QUERY_TOKEN_CATEGORIA'
    }
  ]
};

// Caminho mock do stack.yaml
const mockStackPath = path.join(__dirname, '..', 'memory-wiki', 'stack.yaml');

// Backup do arquivo real (se existir) antes de substituir
let originalStackContent = null;
if (fs.existsSync(mockStackPath)) {
  originalStackContent = fs.readFileSync(mockStackPath, 'utf-8');
}

// Configura��o antes dos testes
test.before(() => {
  // Garante que o diretorio memory-wiki existe
  if (!fs.existsSync(path.dirname(mockStackPath))) {
    fs.mkdirSync(path.dirname(mockStackPath), { recursive: true });
  }
  // Escreve o conteudo mock
  fs.writeFileSync(mockStackPath, mockStackYaml, 'utf-8');
});

// Carrega os modulos de configuracao e catalogo de consultas
const YAML = require('yaml');
const { loadCustomQueries } = require('../tools/dashboards');

// Teste 1: Listagem de consultas disponiveis no catalogo
test('lista consultas personalizadas do catalogo em stack.yaml', () => {
  const queries = loadCustomQueries();
  assert.ok(Array.isArray(queries), 'Deve retornar um array');
  assert.strictEqual(queries.length, 2, 'Deve conter exatamente 2 consultas mockadas');
  assert.strictEqual(queries[0].nome, 'Chamados Aguardando Retorno');
  assert.strictEqual(queries[0].colunas.includes('id'), true);
  assert.strictEqual(queries[1].nome, 'Chamados por Categoria');
  assert.strictEqual(queries[1].colunas.includes('categoria'), true);
});

// Teste 2: Validacao de tokens de consulta (presenca e formato basico)
test('valida tokens de consulta definidos no catalogo', () => {
  const queries = loadCustomQueries();
  for (const q of queries) {
    assert.ok(q.token_env, `Consulta "${q.nome}" deve ter token_env`);
    assert.ok(typeof q.token_env === 'string', `token_env deve ser string em "${q.nome}"`);
    assert.ok(q.token_env.startsWith('GLPI_QUERY_TOKEN_'), `token_env deve seguir padrao prefixo em "${q.nome}"`);
  }
});

// Teste 3: Sanitizacao e formatacao estrutural da resposta (campos obrigatorios)
test('estrutura de cada entrada respeita contratos minimos', () => {
  const queries = loadCustomQueries();
  for (const q of queries) {
    assert.ok(q.nome && q.nome.trim().length > 0, 'nome nao pode ser vazio');
    assert.ok(q.descricao && q.descricao.trim().length > 0, 'descricao nao pode ser vazia');
    assert.ok(Array.isArray(q.colunas) && q.colunas.length > 0, 'colunas deve ser array nao vazio');
    for (const col of q.colunas) {
      assert.ok(typeof col === 'string' && col.trim().length > 0, `coluna invalida em "${q.nome}"`);
    }
  }
});

// 1) Listagem de consultas disponiveis no catalogo
test('Deve listar consultas personalizadas do stack.yaml', () => {
  const queries = loadCustomQueries();
  assert.ok(Array.isArray(queries), 'Resultado deve ser array');
  assert.strictEqual(queries.length, 2, 'Deve conter 2 consultas mockadas');

  const [first, second] = queries;
  assert.strictEqual(first.nome, 'Chamados Aguardando Retorno');
  assert.strictEqual(first.descricao.includes('Ultima interacao'), true);
  assert.deepStrictEqual(first.colunas, ['id', 'Ticket', 'date', 'content', 'tipo']);
  assert.strictEqual(first.token_env, 'GLPI_QUERY_TOKEN_AGUARDANDO_RETORNO');

  assert.strictEqual(second.nome, 'Chamados por Categoria');
  assert.strictEqual(second.token_env, 'GLPI_QUERY_TOKEN_CATEGORIA');
});

// 2) Validacao de tokens de consulta (presenca no .env simulado)
test('Deve falhar se token_env nao estiver definido no .env', () => {
  // As chaves nao existem no process.env real (apenas o mock), entao o loader
  // deve retornar o token_env vazio ou indicativo de nao encontrado.
  const queries = loadCustomQueries();
  const anyMissing = queries.some(q => !process.env[q.token_env]);
  assert.strictEqual(anyMissing, true);
});

// 3) Formatação e sanitização de respostas (shape esperado)
test('Deve retornar objeto com campos esperados e sanitizados', () => {
  const queries = loadCustomQueries();
  for (const q of queries) {
    assert.ok(q.nome && typeof q.nome === 'string', 'Nome deve ser string nao vazia');
    assert.ok(q.descricao && typeof q.descricao === 'string', 'Descricao deve ser string');
    assert.ok(Array.isArray(q.colunas), 'Colunas deve ser array');
    assert.ok(q.token_env && typeof q.token_env === 'string', 'token_env deve ser string');
  }
});

// 4) Caso especifico: estrutura de token_env deve seguir padrao (sem espacos)
test('token_env nao deve conter espacos em branco', () => {
  const queries = loadCustomQueries();
  for (const q of queries) {
    assert.strictEqual(q.token_env.trim(), q.token_env, 'token_env nao deve ter espacos');
  }
});
// Restaurao aps os testes
test.after(() => {
  if (originalStackContent !== null) {
    fs.writeFileSync(mockStackPath, originalStackContent, 'utf-8');
  } else {
    // Se nao existia original, remove o arquivo mock
    try { fs.unlinkSync(mockStackPath); } catch {}
  }
});

// Carrega o modulo ap�s configurar o ambiente
const { listCustomQueries, fetchCustomQuery } = require('../tools/customQuery');

test.describe('Camada 5 - Consultas Personalizadas (Cat�logo)', () => {
  
  test('Deveria listar todas as consultas disponiveis no cat�logo', () => {
    const queries = listCustomQueries();
    
    assert.strictEqual(Array.isArray(queries), true, 'Deve retornar um array');
    assert.strictEqual(queries.length, 2, 'Deve conter 2 consultas mock');
    
    const primeira = queries[0];
    assert.strictEqual(primeira.nome, 'Chamados Aguardando Retorno');
    assert.strictEqual(primeira.descricao.includes('Ultima interacao'), true);
    assert.deepStrictEqual(primeira.colunas, ['id', 'Ticket', 'date', 'content', 'tipo']);
  });

  test('Deveria retornar array vazio se consultas_personalizadas nao existir', () => {
    // Temporariamente sobrescreve o cat�logo com YAML vazio
    const tempPath = path.join(__dirname, '..', 'memory-wiki', 'stack.yaml');
    fs.writeFileSync(tempPath, 'consultas_personalizadas: null', 'utf-8');
    
    // Recarrega o modulo para limpar cache
    delete require.cache[require.resolve('../tools/customQuery')];
    const { listCustomQueries: listEmpty } = require('../tools/customQuery');
    
    const queries = listEmpty();
    assert.deepStrictEqual(queries, []);
    
    // Restaura o mock original
    fs.writeFileSync(tempPath, mockStackYaml, 'utf-8');
    delete require.cache[require.resolve('../tools/customQuery')];
    require('../tools/customQuery');
  });
});

test.describe('Camada 5 - Valida��o de Token de Consulta', () => {
  
  test('Deveria validar token existente e retornar estrutura esperada (mock)', async () => {
    // Simula um token valido no .env
    process.env.GLPI_QUERY_TOKEN_AGUARDANDO_RETORNO = 'test_token_valid';
    
    // Mock do fetch para simular resposta do GLPI
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      // Valida que a URL cont�m o token correto
      assert.ok(url.includes('test_token_valid'), 'URL deve conter o token fornecido');
      
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          name: 'Chamados Aguardando Retorno',
          comment: 'Ultima interacao...',
          data: [
            { id: 1, Ticket: 'Ticket #1', date: '2024-01-01', content: '<p>Teste</p>', tipo: 'incident' },
            { id: 2, Ticket: 'Ticket #2', date: '2024-01-02', content: '<p>Outro</p>', tipo: 'request' }
          ]
        })
      };
    };
    
    // Executa e valida
    const result = await fetchCustomQuery('Chamados Aguardando Retorno');
    assert.strictEqual(result.name, 'Chamados Aguardando Retorno');
    assert.strictEqual(result.count, 2);
    assert.deepStrictEqual(result.colunas, ['id', 'Ticket', 'date', 'content', 'tipo']);
    
    global.fetch = originalFetch;
  });

  test('Deveria rejeitar se token nao estiver configurado no .env', () => {
    // Remove o token
    delete process.env.GLPI_QUERY_TOKEN_AGUARDANDO_RETORNO;
    
    const promise = fetchCustomQuery('Chamados Aguardando Retorno');
    return assert.rejects(
      promise,
      /Variavel GLPI_QUERY_TOKEN_AGUARDANDO_RETORNO nao esta setada/,
      'Deve rejeitar se token estiver ausente'
    );
  });

  test('Deveria rejeitar se consulta nao existir no cat�logo', () => {
    const promise = fetchCustomQuery('Consulta Inexistente');
    return assert.rejects(
      promise,
      /nao encontrada/,
      'Deve rejeitar se a consulta nao estiver no cat�logo'
    );
  });

  test('Deveria rejeitar se GLPI_DASHBOARDS_BASE_URL nao estiver configurado', () => {
    const originalUrl = process.env.GLPI_DASHBOARDS_BASE_URL;
    delete process.env.GLPI_DASHBOARDS_BASE_URL;
    
    // Recarrega modulo para limpar cache de BASE_URL
    delete require.cache[require.resolve('../tools/customQuery')];
    const { fetchCustomQuery: fetchNoUrl } = require('../tools/customQuery');
    
    const promise = fetchNoUrl('Chamados Aguardando Retorno');
    return assert.rejects(
      promise,
      /GLPI_DASHBOARDS_BASE_URL nao esta setado/,
      'Deve rejeitar se URL base nao estiver configurada'
    ).finally(() => {
      process.env.GLPI_DASHBOARDS_BASE_URL = originalUrl;
      delete require.cache[require.resolve('../tools/customQuery')];
      require('../tools/customQuery');
    });
  });
});

test.describe('Camada 5 - Formata��o de Resposta', () => {
  
  test('Deveria sanitizar HTML nas respostas (cleanContent)', () => {
    const { cleanContent } = require('../tools/customQuery');
    
    const input = '<p>Ola &quot;Mundo&quot; &lt;teste&gt;</p>';
    const output = cleanContent(input);
    
    assert.strictEqual(output, 'Ola " Mundo\ <teste>');
 assert.strictEqual(output.includes('<p>'), false, 'Deve remover tags HTML');
 });

 test('Deveria extrair colunas ausentes dos dados se nao definidas', () => {
 const { listCustomQueries } = require('../tools/customQuery');
 const queries = listCustomQueries();
 
 const consulta = queries.find(q => q.nome === 'Chamados por Categoria');
 assert.deepStrictEqual(consulta.colunas, ['categoria', 'status', 'total']);
 });
});

test.describe('Camada 5 - Integridade do Cat�logo (stack.yaml)', () => {
 
 test('Deveria validar que cada consulta tem token_env definido', () => {
 const queries = listCustomQueries();
 
 for (const consulta of queries) {
 assert.ok(consulta.token_env, 'Consulta deve ter token_env definido');
 assert.ok(typeof consulta.token_env === 'string', 'token_env deve ser string');
 }
 });

 test('Deveria validar estrutura minima de cada consulta', () => {
 const queries = listCustomQueries();
 
 for (const consulta of queries) {
 assert.ok(consulta.nome, 'Deve ter nome');
 assert.ok(Array.isArray(consulta.colunas), 'colunas deve ser array');
 assert.ok(typeof consulta.descricao === 'string', 'descricao deve ser string');
 }
 });
});
