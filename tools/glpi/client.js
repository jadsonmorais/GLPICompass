const { createLogger } = require("../../lib/log");
const log = createLogger("glpi-client");

require("dotenv").config();
const GLPI_URL = (process.env.GLPI_URL || "").trim();
const APP_TOKEN = (process.env.GLPI_APP_TOKEN || "").trim();
const USER_TOKEN = (process.env.GLPI_USER_TOKEN || "").trim();

let sessionToken = null;

function baseUrl() {
  if (!GLPI_URL) throw new Error("GLPI_URL não configurada no .env");
  return GLPI_URL.replace(/\/$/, "");
}

async function initSession() {
  if (!APP_TOKEN || !USER_TOKEN) {
    throw new Error("GLPI_APP_TOKEN e GLPI_USER_TOKEN devem estar no .env");
  }
  const url = `${baseUrl()}/initSession?app_token=${encodeURIComponent(APP_TOKEN)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "App-Token": APP_TOKEN,
      Authorization: `user_token ${USER_TOKEN}`,
    },
  });
  const data = await res.json();
  if (!res.ok || !data.session_token) {
    throw new Error(`initSession failed: ${JSON.stringify(data)}`);
  }
  sessionToken = data.session_token;
  return sessionToken;
}

async function request(path, { method = "GET", body, query } = {}) {
  if (!sessionToken) await initSession();
  const qs = query ? "?" + new URLSearchParams(query).toString() : "";
  const res = await fetch(`${baseUrl()}${path}${qs}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Session-Token": sessionToken,
      "App-Token": APP_TOKEN || "",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`GLPI ${method} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function killSession() {
  if (!sessionToken) return;
  await fetch(`${baseUrl()}/killSession`, {
    method: "GET",
    headers: { "Session-Token": sessionToken, "App-Token": APP_TOKEN || "" },
  }).catch(() => {});
  sessionToken = null;
}

module.exports = { request, initSession, killSession };