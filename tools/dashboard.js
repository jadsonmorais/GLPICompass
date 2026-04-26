/**
 * tools/dashboard.js
 * Gerador de Dashboards HTML standalone.
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { OpenAI } = require("openai");
const log = require('../lib/log').createLogger('dashboard');

const SKILL_DIR = path.join(__dirname, "..", "skills", "dashboard");
const DASHBOARDS_DIR = process.env.DASHBOARDS_DIR || path.join(__dirname, "..", "dashboards");

let cachedSkillPrompt = null;

// Carrega as regras de negócio (SKILL.md) e os archetypes HTML [1, 5]
function loadSkillPrompt() {
  if (cachedSkillPrompt) return cachedSkillPrompt;
  const parts = [];
  const skillFile = path.join(SKILL_DIR, "SKILL.md");
  const glossaryFile = path.join(SKILL_DIR, "glossary.md");

  if (fs.existsSync(skillFile)) parts.push(fs.readFileSync(skillFile, "utf-8"));
  if (fs.existsSync(glossaryFile)) {
    parts.push("\n\n# Glossário GLPI\n\n" + fs.readFileSync(glossaryFile, "utf-8"));
  }

  const archetypesDir = path.join(SKILL_DIR, "archetypes");
  if (fs.existsSync(archetypesDir)) {
    parts.push("\n\n# Catálogo de archetypes (referência de estilo)\n");
    const files = fs.readdirSync(archetypesDir).filter((f) => f.endsWith(".html")).sort();
    for (const f of files) {
      const content = fs.readFileSync(path.join(archetypesDir, f), "utf-8");
      parts.push(`\n## Archetype: ${f.replace(".html", "")}\n\n\`\`\`html\n${content}\n\`\`\``);
    }
  }
  cachedSkillPrompt = parts.join("\n");
  return cachedSkillPrompt;
}

function slugify(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "dashboard";
}

async function generateDashboard({ title, description, data }) {
  try {
    if (!fs.existsSync(DASHBOARDS_DIR)) fs.mkdirSync(DASHBOARDS_DIR, { recursive: true });

    // Configura cliente próprio para permitir troca de modelo (ex: GPT-4o para dashboards) [1, 6]
    const useOllama = !process.env.OPENAI_API_KEY || process.env.PROVIDER === "ollama";
    const client = new OpenAI({
      baseURL: useOllama ? (process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1") : undefined,
      apiKey: useOllama ? "ollama" : process.env.OPENAI_API_KEY,
    });
    
    const model = process.env.MODEL_DASHBOARD || process.env.MODEL || "llama3.2";
    const trimmedData = JSON.stringify(data).slice(0, 200000); // Limite de segurança [6]

    const res = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: loadSkillPrompt() },
        { 
          role: "user", 
          content: `Título: ${title}\nBriefing: ${description}\nDados: ${trimmedData}\n\nResponda APENAS com HTML puro.` 
        },
      ],
    });

    let html = (res.choices?.message?.content || "").trim();
    
    // LIMPEZA PESADA: Remove fences de markdown (```html ... ```) que as IAs insistem em colocar [4]
    html = html.replace(/^```html/i, "").replace(/```$/g, "").trim();

    if (!/^<!doctype html|^<html/i.test(html)) {
      throw new Error("O modelo não gerou um HTML válido.");
    }

    const filename = `${slugify(title)}-${Date.now()}.html`;
    const filepath = path.join(DASHBOARDS_DIR, filename);
    fs.writeFileSync(filepath, html, "utf-8");

    return { 
      path: filepath, 
      url: "file:///" + filepath.replace(/\\/g, "/"),
      model_used: model 
    };
  } catch (err) {
    log.error("falha na geração do dashboard", { error: err.message });
    throw err;
  }
}

// Exportação para o ToolRegistry (Auto-Discovery)
const skillDefinitions = [
  {
    definition: {
      type: "function",
      function: {
        name: "generate_dashboard",
        description: "Gera um dashboard HTML analítico a partir de dados buscados. Exige título, descrição do que mostrar e o JSON bruto dos dados.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            data: { type: "object" }
          },
          required: ["title", "description", "data"]
        }
      }
    },
    handler: (args) => generateDashboard(args)
  }
];

module.exports = { generateDashboard, skillDefinitions, slugify };