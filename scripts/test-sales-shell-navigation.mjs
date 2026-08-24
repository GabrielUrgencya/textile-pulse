import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const matrix = read("src/lib/sales-navigation.ts");
const navigation = read("src/components/sales/SalesNavigation.tsx");
const shell = read("src/components/sales/SalesShell.tsx");
const layout = read("src/app/vendas/layout.tsx");
const pageState = read("src/components/sales/SalesPageState.tsx");
const globals = read("src/app/globals.css");
const appSidebar = read("src/components/layout/AppSidebar.tsx");
const salesSidebarLink = read("src/components/sales/SalesSidebarLink.tsx");

const adminBlock = matrix.match(/ADMIN:\s*\[([\s\S]*?)\],\s*CONSULTANT:/)?.[1] ?? "";
const consultantBlock = matrix.match(/CONSULTANT:\s*\[([\s\S]*?)\],\s*};/)?.[1] ?? "";

for (const href of ["/vendas/admin", "/vendas/coletivo", "/vendas/tv"]) {
  assert.match(adminBlock, new RegExp(href.replaceAll("/", "\\/")));
}
assert.doesNotMatch(adminBlock, /\/vendas\/app/);
for (const href of ["/vendas/app", "/vendas/coletivo"]) {
  assert.match(consultantBlock, new RegExp(href.replaceAll("/", "\\/")));
}
assert.doesNotMatch(consultantBlock, /\/vendas\/(admin|tv)/);

assert.match(navigation, /aria-current=\{active \? "page"/);
assert.match(navigation, /min-h-11/);
assert.match(shell, /href="#sales-content"/);
assert.match(shell, /aria-label="Abrir menu"/);
assert.match(shell, /noopener|href="\/dashboard"/);
assert.match(shell, /motion-reduce:/);
assert.doesNotMatch(shell, /document\.documentElement|localStorage|classList/);
assert.match(layout, /className="sales-theme/);
assert.doesNotMatch(layout, /document\.documentElement|localStorage|classList|dark/);
for (const token of ["--background: #ffffff", "--foreground: #0a0a0a", "--border: #e6e6e6"]) {
  assert.match(globals, new RegExp(token));
}
assert.match(pageState, /titleRef\.current\?\.focus\(\)/);
assert.match(pageState, /tabIndex=\{-1\}/);
assert.match(appSidebar, /<SalesSidebarLink collapsed=\{collapsed\} \/>/);
assert.match(salesSidebarLink, /access\.enabled === true/);
assert.match(salesSidebarLink, /access\.home === "\/vendas\/admin" \|\| access\.home === "\/vendas\/app"/);
assert.match(salesSidebarLink, /target="_blank" rel="noopener noreferrer"/);
assert.match(salesSidebarLink, /controller\.abort\(\)/);

console.log("PASS: sales role navigation matrix and accessible shell contracts verified.");
