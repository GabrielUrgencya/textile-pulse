import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const middleware = read("src/middleware.ts");
const accessRoute = read("src/app/api/vendas/access/route.ts");
const tvRoute = read("src/app/api/vendas/tv/route.ts");
const tvPage = read("src/app/vendas/tv/page.tsx");
const tvAccess = read("src/lib/sales-tv-access.ts");
const salesAccess = read("src/lib/sales-access.ts");
const consultantPage = read("src/app/vendas/app/page.tsx");
const adminPage = read("src/app/vendas/admin/page.tsx");
const adminRoute = read("src/components/sales/admin/SalesAdminRoute.tsx");
const adminSalesRoutes = [
  adminPage,
  read("src/app/vendas/admin/vendas/page.tsx"),
  read("src/app/vendas/admin/vendas/nova/page.tsx"),
  read("src/app/vendas/admin/vendas/[saleId]/page.tsx"),
];
const collectivePage = read("src/app/vendas/coletivo/page.tsx");

assert.match(middleware, /isSalesLoginPage/);
assert.match(middleware, /isSalesPage \? "\/vendas\/login" : "\/login"/);
assert.match(middleware, /requestedRedirect === "\/vendas" \|\| requestedRedirect\?\.startsWith\("\/vendas\/"\)/);
assert.match(middleware, /path === "\/vendas\/tv" \|\| path\.startsWith\("\/vendas\/tv\/"\)/);
assert.doesNotMatch(middleware, /if \(path\.startsWith\("\/vendas\/tv"\)\)/);

assert.match(salesAccess, /sales_my_access_v1/);
assert.match(accessRoute, /status: 503/);
assert.match(accessRoute, /enabled: false/);
assert.match(consultantPage, /role === "CONSULTANT"/);
assert.match(adminRoute, /role === "ADMIN"/);
assert.match(collectivePage, /state\.kind === "enabled"/);
assert.match(adminRoute, /resolveSalesPageAccess/);
assert.match(adminRoute, /state\.kind === "enabled" && state\.access\.role === "ADMIN"/);
for (const source of adminSalesRoutes) {
  assert.match(source, /import \{ SalesAdminRoute \}/, "admin routes must import the shared access gate");
  assert.match(source, /<SalesAdminRoute\b/, "admin routes must render through the shared access gate");
}

assert.match(tvAccess, /SALES_TV_HEX_PATTERN/);
assert.match(tvAccess, /sales_tv_kiosk_snapshot_v2/);
assert.match(tvAccess, /sales_tv_kiosk_ack_v2/);
assert.doesNotMatch(tvAccess, /sales_tv_snapshot_v1/);
assert.match(tvRoute, /supabaseAdmin/);
assert.match(tvRoute, /status: 404/);
assert.doesNotMatch(tvRoute, /status: 429|Retry-After/);
assert.ok((tvRoute.match(/status: 404/g) ?? []).length >= 2);
assert.match(tvRoute, /status: 202/);
assert.match(tvRoute, /"Cache-Control": "no-store, max-age=0"/);
assert.match(tvPage, /history\.replaceState/);
assert.match(tvPage, /h\.get\("token"\)/);
assert.doesNotMatch(tvPage, /searchParams\.get\("token"\)/);
assert.doesNotMatch(tvPage, /loadSalesTvSnapshot|collective_percent/);

for (const source of [tvRoute, tvPage, tvAccess, collectivePage]) {
  assert.doesNotMatch(source, /\.from\(["']sales["']\)/);
  assert.doesNotMatch(source, /commission|sale_value|freight_value/i);
}

console.log("PASS: LISION Vendas route, role and TV token contracts verified.");
