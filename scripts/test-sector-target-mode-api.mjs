import { readFile } from "node:fs/promises";
import ts from "typescript";

function assert(condition, message) { if (!condition) throw new Error(message); }
function compile(source) {
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
}
function loadCommonJs(source, requireFn) {
  const module = { exports: {} };
  new Function("exports", "require", "module", compile(source))(module.exports, requireFn, module);
  return module.exports;
}

const hourlySource = await readFile("src/lib/hourly-target-mode.ts", "utf8");
const hourly = loadCommonJs(hourlySource, () => { throw new Error("hourly helper must stay pure"); });

const rows = new Map([["stage-a", {
  id: "target-a", stage_id: "stage-a", daily_target: 900, unit: "peças",
  shift_start: null, shift_end: null, lunch_start: null, lunch_end: null,
  hourly_target: null, hourly_target_mode: "NONE",
}]]);
let permission = true;
let forceMissingConfirmation = false;
const writeDelay = new Map();

class Query {
  constructor(table) { this.table = table; this.filters = new Map(); this.operation = "select"; }
  select() { return this; }
  eq(key, value) { this.filters.set(key, value); return this; }
  upsert(value) { this.operation = "upsert"; this.value = value; return this; }
  async single() { return this.execute(true); }
  async maybeSingle() { return this.execute(true); }
  then(resolve, reject) { return this.execute(false).then(resolve, reject); }
  async execute(single) {
    if (this.table === "stages") {
      const owned = this.filters.get("tenant_id") === "tenant-a" && this.filters.get("id") === "stage-a";
      return { data: owned ? { id: "stage-a" } : null, error: null };
    }
    if (this.table !== "sector_targets") throw new Error(`Unexpected table ${this.table}`);
    if (this.operation === "upsert") {
      const delay = writeDelay.get(this.value.hourly_target_mode) || 0;
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      rows.set(this.value.stage_id, { id: `target-${this.value.stage_id}`, ...this.value });
      return { data: { id: `target-${this.value.stage_id}` }, error: null };
    }
    const stageId = this.filters.get("stage_id");
    if (stageId) return { data: forceMissingConfirmation ? null : (rows.get(stageId) || null), error: null };
    const data = Array.from(rows.values()).filter((row) => row.tenant_id == null || row.tenant_id === this.filters.get("tenant_id"));
    return { data: single ? (data[0] || null) : data, error: null };
  }
}
const supabase = { from: (table) => new Query(table) };
const user = { id: "admin-a", app_metadata: { tenant_id: "tenant-a" } };

const routeSource = await readFile("src/app/api/settings/sector-targets/route.ts", "utf8");
const route = loadCommonJs(routeSource, (id) => {
  if (id === "next/server") return { NextResponse: { json: (body, init = {}) => Response.json(body, { status: init.status || 200 }) } };
  if (id === "@/lib/auth-middleware") return { withAuth: async () => ({ supabase, user }) };
  if (id === "@/lib/effective-permissions") return { can: () => permission };
  if (id === "@/lib/api-helpers") return {
    requireTenantId: () => ({ tenantId: "tenant-a" }),
    dbError: (_scope, error) => Response.json({ error: error?.message || "db" }, { status: 500 }),
  };
  if (id === "@/lib/hourly-target-mode") return hourly;
  throw new Error(`Unexpected import ${id}`);
});

const request = (body) => new Request("http://localhost/api/settings/sector-targets", {
  method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const payload = (mode, hourlyTarget = null) => ({ stage_id: "stage-a", daily_target: 900, unit: "peças", hourly_target_mode: mode, hourly_target: hourlyTarget });

let response = await route.GET();
assert(response.status === 200 && (await response.json()).data[0].hourly_target_mode === "NONE", "GET must expose an explicit mode");

permission = false;
response = await route.GET();
assert(response.status === 403, "GET must reject users without settings:manage");
response = await route.PUT(request(payload("AUTO")));
assert(response.status === 403, "PUT must reject users without settings:manage");
permission = true;

response = await route.PUT(request({ ...payload("AUTO"), stage_id: "stage-other-tenant" }));
assert(response.status === 404, "Cross-tenant stage must not be disclosed or changed");

response = await route.PUT(request(payload("MANUAL", 300)));
let body = await response.json();
assert(response.status === 200 && body.data.hourly_target_mode === "MANUAL" && body.data.hourly_target === 300, "PUT must return the confirmed MANUAL state");

forceMissingConfirmation = true;
response = await route.PUT(request(payload("NONE")));
assert(response.status === 409, "Missing post-write confirmation must return 409");
forceMissingConfirmation = false;

writeDelay.set("AUTO", 5);
writeDelay.set("MANUAL", 20);
const concurrent = await Promise.all([
  route.PUT(request(payload("AUTO"))),
  route.PUT(request(payload("MANUAL", 321))),
]);
assert(concurrent.every((result) => result.status === 200 || result.status === 409), "Concurrent writes must be confirmed or report a visible conflict");
assert(rows.get("stage-a").hourly_target_mode === "MANUAL" && rows.get("stage-a").hourly_target === 321, "Last completed write must be visible deterministically");

console.log("PASS: sector-target route covers GET/PUT, permission, tenant isolation, confirmation and concurrent last-write visibility.");
