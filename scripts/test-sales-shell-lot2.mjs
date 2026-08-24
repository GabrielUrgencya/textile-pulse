import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const layout = read("src/app/vendas/layout.tsx");
const globals = read("src/app/globals.css");
const login = read("src/components/sales/SalesLoginForm.tsx");
const sidebar = read("src/components/sales/SalesSidebarLink.tsx");
const appSidebar = read("src/components/layout/AppSidebar.tsx");
const tv = read("src/app/vendas/tv/page.tsx");

assert.match(layout, /className="sales-theme/);
assert.doesNotMatch(layout, /documentElement|localStorage|classList|\.dark/);

const theme = globals.match(/\.sales-theme\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
for (const token of [
  "--background: #ffffff",
  "--surface: #f6f6f6",
  "--foreground: #0a0a0a",
  "--muted-foreground: #6b6b6b",
  "--border: #e6e6e6",
  "--success: #16a34a",
  "--warning: #eab308",
]) {
  assert.ok(theme.includes(token), `missing sales token: ${token}`);
}

assert.match(login, /value === "\/vendas" \|\| value\?\.startsWith\("\/vendas\/"\)/);
assert.match(login, /fetch\("\/api\/auth\/login"/);
assert.match(login, /role="alert"/);
assert.match(sidebar, /useState<string \| null>\(null\)/);
assert.match(sidebar, /fetch\("\/api\/vendas\/access"/);
assert.match(sidebar, /access\.enabled === true/);
assert.match(sidebar, /target="_blank"/);
assert.match(sidebar, /rel="noopener noreferrer"/);
assert.match(sidebar, /if \(!home\) return null/);
assert.match(appSidebar, /<SalesSidebarLink collapsed=\{collapsed\} \/>/);
assert.doesNotMatch(tv, /SalesShell/);

for (const route of ["app", "coletivo"]) {
  const page = read(`src/app/vendas/${route}/page.tsx`);
  assert.match(page, /resolveSalesPageAccess\(\)/);
  assert.match(page, /<SalesShell role=/);
  if (route === "app") {
    assert.match(page, /<SalesConsultantWorkspace \/>/);
    assert.match(page, /state\.access\.role === "CONSULTANT"/);
  } else {
    assert.match(page, /<SalesCollectiveWorkspace \/>/);
    assert.match(page, /state\.kind === "enabled" && state\.access\.role/);
  }
}

const adminPage = read("src/app/vendas/admin/page.tsx");
const adminRoute = read("src/components/sales/admin/SalesAdminRoute.tsx");
assert.match(adminPage, /<SalesAdminRoute redirectPath="\/vendas\/admin">/);
assert.match(adminRoute, /resolveSalesPageAccess\(\)/);
assert.match(adminRoute, /state\.access\.role === "ADMIN"/);
assert.match(adminRoute, /<SalesShell role="ADMIN">/);

console.log("PASS: sales theme, role-gated pages, login redirect and authorized sidebar link verified.");
