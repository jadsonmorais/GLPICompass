require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { OpenAI } = require("openai");

const log = require('../lib/log');

const SKILL_DIR = path.join(__dirname, "..", "skills", "dashboard");
const DASHBOARDS_DIR = process.env.DASHBOARDS_DIR || path.join(__dirname, "..", "dashboards");

let cachedSkillPrompt = null;

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
    parts.push("\n\n# Catálogo de archetypes (referência de estilo, não templates fechados)\n");
    const files = fs.readdirSync(archetypesDir).filter((f) => f.endsWith(".html")).sort();
    for (const f of files) {
      const name = f.replace(/\.html$/, "");
      const content = fs.readFileSync(path.join(archetypesDir, f), "utf-8");
      parts.push(`\n## Archetype: ${name}\n\n\`\`\`html\n${content}\n\`\`\``);
    }
  }
  cachedSkillPrompt = parts.join("\n");
  return cachedSkillPrompt;
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "dashboard";
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

async function generateDashboard({ title, description, data } = {}) {
  try {
  if (!title || !description) throw new Error("generateDashboard requires title and description");
  if (!fs.existsSync(DASHBOARDS_DIR)) fs.mkdirSync(DASHBOARDS_DIR, { recursive: true });

  const useOllama = !process.env.OPENAI_API_KEY || process.env.PROVIDER === "ollama";
  const client = new OpenAI({
    baseURL: useOllama ? (process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1") : undefined,
    apiKey: useOllama ? "ollama" : process.env.OPENAI_API_KEY,
  });
  const model = process.env.MODEL_DASHBOARD || process.env.MODEL || "llama3.2";

    log.info("dashboard generation started", { title });

  const dataJson = JSON.stringify(data ?? null, null, 2);
  const trimmed = dataJson.length > 200_000 ? dataJson.slice(0, 200_000) + "\n/* truncated */" : dataJson;

  const userMsg = [
    `# Título: ${title}`,
    "",
    `# Descrição (briefing do que o usuário quer ver):`,
    description,
    "",
    `# Dados (JSON bruto vindo da API GLPI — não invente nada fora disso):`,
    "```json",
    trimmed,
    "```",
    "",
    "Responda APENAS com o HTML completo (de <!doctype html> a </html>). Sem fences markdown, sem texto antes ou depois.",
  ].join("\n");

  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: loadSkillPrompt() },
      { role: "user", content: userMsg },
    ],
  });

  let html = (res.choices[0]?.message?.content || "").trim();
  html = html.replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "").trim();
  if (!/^<!doctype html|^<html/i.test(html)) {
    throw new Error("Generated content is not valid HTML — got: " + html.slice(0, 200));
  }

  const filename = `${slugify(title)}-${timestamp()}.html`;
  const filepath = path.join(DASHBOARDS_DIR, filename);
  fs.writeFileSync(filepath, html, "utf-8");

    log.info("dashboard generation ok", { path: filepath });

  return {
    path: filepath,
    url: "file:///" + filepath.replace(/\\/g, "/"),
    bytes: Buffer.byteLength(html, "utf-8"),
    model_used: model,
  };
  } catch (err) {
    log.error("dashboard generation failed", { error: err.message });
    throw err;
}
}

module.exports = { generateDashboard, loadSkillPrompt, slugify };
