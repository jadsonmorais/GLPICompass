// Logger custom — stdout/stderr, níveis, namespace, redação automática.
// Configura via env: LOG_LEVEL (debug|info|warn|error), LOG_FORMAT (human|json).
// Sem deps externas. Use createLogger('namespace') no topo de cada módulo.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function readLevel() {
  const raw = String(process.env.LOG_LEVEL || "info").toLowerCase();
  return LEVELS[raw] !== undefined ? LEVELS[raw] : LEVELS.info;
}
function readFormat() {
  return String(process.env.LOG_FORMAT || "human").toLowerCase() === "json" ? "json" : "human";
}

// Cabeçalhos/credenciais — nunca aparecem no log.
const SENSITIVE_KEYS = new Set([
  "authorization",
  "app-token",
  "session-token",
  "apikey",
  "api_key",
  "token",
  "user_token",
  "password",
  "telegram_bot_token",
]);
// Campos com PII de chamados — só metadados, conteúdo vira placeholder.
const PII_KEYS = new Set(["content", "description", "descricao", "titulo", "title", "name"]);
const PII_MAX = 80;

function redact(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(redact);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const kl = k.toLowerCase();
    if (SENSITIVE_KEYS.has(kl)) {
      out[k] = "<redacted>";
    } else if (PII_KEYS.has(kl) && typeof v === "string" && v.length > PII_MAX) {
      out[k] = `<text:${v.length} chars>`;
    } else if (v && typeof v === "object") {
      out[k] = redact(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function formatLine(level, ns, msg, fields, format = "human", tsOverride = null) {
  const ts = tsOverride || new Date().toISOString();
  const safe = fields ? redact(fields) : null;
  if (format === "json") {
    return JSON.stringify({ ts, level: level.toUpperCase(), ns, msg, ...(safe || {}) });
  }
  const lvl = level.toUpperCase().padEnd(5);
  let line = `${ts} ${lvl} [${ns}] ${msg}`;
  if (safe && Object.keys(safe).length) {
    const pairs = Object.entries(safe).map(([k, v]) => {
      if (v === null || v === undefined) return `${k}=null`;
      if (typeof v === "string") {
        return v.includes(" ") || v.includes("=") ? `${k}=${JSON.stringify(v)}` : `${k}=${v}`;
      }
      return `${k}=${JSON.stringify(v)}`;
    });
    line += " | " + pairs.join(" ");
  }
  return line;
}

function emit(level, ns, msg, fields) {
  if (LEVELS[level] < readLevel()) return;
  const line = formatLine(level, ns, msg, fields, readFormat());
  const stream = LEVELS[level] >= LEVELS.warn ? process.stderr : process.stdout;
  stream.write(line + "\n");
}

function createLogger(namespace) {
  return {
    debug: (msg, fields) => emit("debug", namespace, msg, fields),
    info: (msg, fields) => emit("info", namespace, msg, fields),
    warn: (msg, fields) => emit("warn", namespace, msg, fields),
    error: (msg, fields) => emit("error", namespace, msg, fields),
  };
}

module.exports = { createLogger, redact, formatLine, LEVELS };
