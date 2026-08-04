import { readFile } from "node:fs/promises";
import ts from "typescript";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function loadModule(path, mocks) {
  const source = await readFile(path, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("exports", "require", "module", compiled)(
    module.exports,
    (request) => {
      if (!(request in mocks)) throw new Error(`Unexpected module request: ${request}`);
      return mocks[request];
    },
    module
  );
  return module.exports;
}

const tz = {
  TENANT_TZ: "America/Sao_Paulo",
  localDayStart: (date) => `${date}T00:00:00.000-03:00`,
  localDayEnd: (date) => `${date}T23:59:59.999-03:00`,
};

const { computeChartData } = await loadModule("src/lib/kpi-queries.ts", { "@/lib/tz": tz });
const rpcCalls = [];
const chart = await computeChartData(
  {
    rpc: async (name, args) => {
      rpcCalls.push({ name, args });
      return { data: [{ period: "2026-08-04T02:00", scans: 2, defects: 0 }], error: null };
    },
  },
  { from: "2026-08-03", to: "2026-08-03" },
  "hour"
);

assert(rpcCalls[0].args.from_date === "2026-08-03T00:00:00.000-03:00", "Chart start must use local day start.");
assert(rpcCalls[0].args.to_date === "2026-08-03T23:59:59.999-03:00", "Chart end must use local day end.");
assert(chart[0].scans === 2, "Chart data must preserve returned production events.");

const { chartPeriodToTenantHour } = await loadModule("src/lib/dashboard-chart-time.ts", { "@/lib/tz": tz });
assert(chartPeriodToTenantHour("2026-08-04T02:00") === "23h", "02:00 UTC must render as 23h in São Paulo.");

console.log("PASS: dashboard chart keeps 23:30 BRT events in the local-day range and renders them at 23h.");
