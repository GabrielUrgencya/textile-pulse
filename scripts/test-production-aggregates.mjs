import { readFile } from "node:fs/promises";
import ts from "typescript";

function assert(condition, message) { if (!condition) throw new Error(message); }
const source = await readFile("src/lib/production-aggregates.ts", "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
new Function("exports", "require", "module", compiled)(module.exports, () => ({}), module);
const { getProductionAggregates, stageProduced, userProduced } = module.exports;

const payload = {
  stage_totals: [{ stage_id: "stage-a", produced: 1501, lots: 1501 }],
  user_totals: [{ stage_id: "stage-a", user_id: "user-a", full_name: "Operador", produced: 1501, lots: 1501 }],
  hourly_stage: [], stage_timing: [], user_timing: [], stock: { pieces: 1501, weighted: 1501 },
};
let received;
const supabase = { rpc: async (name, params) => { received = { name, params }; return { data: payload, error: null }; } };
const result = await getProductionAggregates(supabase, { tenantId: "tenant-a", from: "2026-08-05T00:00:00-03:00", to: "2026-08-05T23:59:59-03:00", stageId: "stage-a" });
assert(received.name === "production_aggregates_v1", "Canonical RPC must be used");
assert(received.params.p_tenant_id === "tenant-a", "Server-resolved tenant must scope the RPC");
assert(stageProduced(result, "stage-a") === 1501, "Stage aggregation must preserve totals above 1000 rows");
assert(userProduced(result, "stage-a", "user-a") === 1501, "User aggregation must match the same canonical total");

console.log("PASS: canonical production RPC preserves and reconciles totals above 1000 rows.");
