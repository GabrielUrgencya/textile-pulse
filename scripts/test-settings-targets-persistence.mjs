import { readFile } from "node:fs/promises";
import ts from "typescript";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let adminResult;
const currentSettings = { dailyPiecesTarget: 1000, shiftStart: "07:00", shiftEnd: "17:00" };
let persistedSettings = currentSettings;
const supabase = {
  from: () => ({
    select: () => ({ eq: () => ({ single: async () => ({ data: { settings: currentSettings } }) }) }),
  }),
};
const supabaseAdmin = {
  from: () => ({
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: { settings: persistedSettings }, error: null }) }),
    }),
    update: () => ({
      eq: () => ({
        select: () => ({ maybeSingle: async () => adminResult }),
      }),
    }),
  }),
};

const source = await readFile("src/app/api/settings/targets/route.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
const mocks = {
  "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
  "@/lib/auth-middleware": { withAuth: async () => ({ supabase, user: {}, error: null }) },
  "@/lib/effective-permissions": { can: () => true },
  "@/lib/api-helpers": {
    requireTenantId: () => ({ tenantId: "factory-test", error: null }),
    dbError: () => Response.json({ error: "database error" }, { status: 500 }),
  },
  "@/lib/supabase-admin": { supabaseAdmin },
};
new Function("exports", "require", "module", compiled)(
  module.exports,
  (request) => {
    if (!(request in mocks)) throw new Error(`Unexpected module request: ${request}`);
    return mocks[request];
  },
  module,
);

const request = () => new Request("http://localhost/api/settings/targets", {
  method: "PATCH",
  body: JSON.stringify({ shiftStart: "00:00", shiftEnd: "23:59" }),
});

persistedSettings = { ...currentSettings, shiftStart: "00:00", shiftEnd: "23:59" };
adminResult = { data: { id: "factory-test", settings: persistedSettings }, error: null };
const success = await module.exports.PATCH(request());
const successBody = await success.json();
assert(success.status === 200, "A confirmed tenant update must return 200.");
assert(successBody.data.settings.shiftStart === "00:00", "The confirmed response must return saved shiftStart.");
assert(successBody.data.settings.shiftEnd === "23:59", "The confirmed response must return saved shiftEnd.");

persistedSettings = currentSettings;
adminResult = { data: { id: "factory-test", settings: { ...currentSettings, shiftStart: "00:00", shiftEnd: "23:59" } }, error: null };
const staleRead = await module.exports.PATCH(request());
assert(staleRead.status === 409, "A mutation echo must not override a stale confirmation read.");

adminResult = { data: null, error: null };
const noRow = await module.exports.PATCH(request());
assert(noRow.status === 409, "A zero-row update must not report success.");

console.log("PASS: targets save only succeeds after a tenant row is confirmed.");
