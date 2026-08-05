import { readFile } from "node:fs/promises";
import ts from "typescript";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const source = await readFile("src/lib/hourly-target-mode.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
new Function("exports", "require", "module", compiled)(module.exports, () => {
  throw new Error("hourly-target-mode must stay pure and dependency-free");
}, module);

const { normalizeHourlyTargetMode, resolveHourlyTarget, validateHourlyTargetInput } = module.exports;
const resolve = (mode, manualTarget = null, baseDailyTarget = 2000, usefulHours = 9, globalFeatureEnabled = true) =>
  resolveHourlyTarget({ mode, manualTarget, baseDailyTarget, usefulHours, globalFeatureEnabled });

assert(normalizeHourlyTargetMode(null) === "NONE", "Missing mode must default to NONE");
assert(resolve("NONE").target === null, "NONE must never calculate a target");
assert(resolve("AUTO").target === 222, "AUTO must round base daily / useful hours consistently");
assert(resolve("AUTO", null, 2000, 0).effectiveMode === "NONE", "AUTO with zero useful hours must fall back");
assert(resolve("AUTO", null, 0, 9).effectiveMode === "NONE", "AUTO with zero base must fall back");
assert(resolve("MANUAL", 300).target === 300, "MANUAL must preserve its explicit positive value");
assert(resolve("MANUAL", 0).effectiveMode === "NONE", "Invalid MANUAL zero must never become AUTO");
assert(resolve("AUTO", null, 2000, 9, false).effectiveMode === "NONE", "Global off must not create an hourly target");
assert(validateHourlyTargetInput("MANUAL", 0).ok === false, "API validation must reject MANUAL zero");
assert(validateHourlyTargetInput("MANUAL", "").ok === false, "API validation must reject empty MANUAL");
const autoInput = validateHourlyTargetInput("AUTO", 500);
assert(autoInput.ok && autoInput.manualTarget === null, "AUTO must clear a stale manual value");
const noneInput = validateHourlyTargetInput("NONE", 500);
assert(noneInput.ok && noneInput.manualTarget === null, "NONE must clear a stale manual value");

console.log("PASS: NONE/AUTO/MANUAL contract, zero rejection, fallback and transitions are deterministic.");
