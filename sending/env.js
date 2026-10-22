// Tiny .env loader. Reads KEY=VALUE lines from the .env file at the repo root.
// No library needed. Existing environment variables are never overwritten.
const fs = require("fs");
const path = require("path");

const ENV_FILE = path.join(__dirname, "..", ".env");
let loaded = false;

// Read the .env file once and copy its values into process.env
function load() {
  if (loaded) return;
  loaded = true;
  if (!fs.existsSync(ENV_FILE)) return; // no file is fine; get() will explain later
  const lines = fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue; // skip blanks and comments
    const eq = line.indexOf("=");
    if (eq === -1) continue; // not a KEY=VALUE line
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

// Return the value of a variable, or throw a plain-English error
function get(name) {
  load();
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing setting ${name}. Add a line like ${name}=... to the .env file at ${ENV_FILE} (see .env.example).`
    );
  }
  return value;
}

module.exports = { get, ENV_FILE };
