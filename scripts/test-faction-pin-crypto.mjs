import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import ts from "typescript";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const source = await readFile("src/lib/faction-pin-crypto.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const module = { exports: {} };
new Function("exports", "require", "module", compiled)(module.exports, createRequire(import.meta.url), module);
const { encryptFactionPin, decryptFactionPin } = module.exports;

const previousKey = process.env.FACTION_PIN_ENCRYPTION_KEY;
const previousServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
try {
  process.env.FACTION_PIN_ENCRYPTION_KEY = "ab".repeat(32);
  const first = encryptFactionPin("123456");
  const second = encryptFactionPin("123456");
  assert(first !== second, "AES-GCM must use a fresh nonce for every encryption");
  assert(decryptFactionPin(first) === "123456", "Configured 256-bit key must decrypt its PIN");
  assert(!first.includes("123456"), "Ciphertext must not contain plaintext PIN");

  delete process.env.FACTION_PIN_ENCRYPTION_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-fallback";
  assert(decryptFactionPin(encryptFactionPin("654321")) === "654321", "Service-role-derived fallback must work");
  let rejected = false;
  try { encryptFactionPin("12345"); } catch { rejected = true; }
  assert(rejected, "PINs other than six digits must be rejected");
} finally {
  if (previousKey === undefined) delete process.env.FACTION_PIN_ENCRYPTION_KEY;
  else process.env.FACTION_PIN_ENCRYPTION_KEY = previousKey;
  if (previousServiceRole === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceRole;
}

console.log("PASS: faction PIN AES-256-GCM is randomized, decryptable, and supports the service-role fallback.");
