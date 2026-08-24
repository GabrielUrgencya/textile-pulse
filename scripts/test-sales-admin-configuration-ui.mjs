import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(path, "utf8");
const config = read("src/components/sales/admin/SalesAdminConfiguration.tsx");
const planning = read("src/components/sales/admin/SalesAdminPlanning.tsx");
const assignments = read("src/components/sales/admin/SalesAdminAssignments.tsx");
const route = read("src/components/sales/admin/SalesAdminRoute.tsx");
const nav = read("src/components/sales/admin/SalesAdminSubnavigation.tsx");
for (const path of ["configuracoes", "calendario", "periodos", "metas"]) {
  assert.match(nav, new RegExp(`/vendas/admin/${path}`));
  assert.match(read(`src/app/vendas/admin/${path}/page.tsx`), /SalesAdminRoute/);
}
assert.match(route, /role === "ADMIN"/);
assert.match(config, /aria-live="polite"/);
assert.match(planning, /role="alert"/);
assert.match(planning, /min-h-11/);
assert.match(planning, /Encerrado · somente leitura/);
assert.match(planning, /Comissão/);
assert.match(assignments, /membershipIsActive/);
assert.match(assignments, /goal-assignments/);
assert.match(assignments, /Promise\.all/);
assert.match(assignments, /setLoading\(true\)/);
assert.match(assignments, /setLoadError/);
assert.match(assignments, /finally\s*\{\s*setLoading\(false\)/);
assert.match(assignments, /Tentar novamente/);
assert.match(assignments, /ref=\{saveErrorRef\}/);
assert.match(assignments, /tabIndex=\{-1\}/);
assert.match(assignments, /role="alert"/);
assert.match(assignments, /requestAnimationFrame\(\(\) => saveErrorRef\.current\?\.focus\(\)\)/);
assert.match(assignments, /aria-live="polite"/);
assert.match(assignments, /if \(savingRef\.current\) return/);
assert.match(assignments, /disabled=\{saving \|\|/);
for (const source of [config, planning, assignments, route]) {
  assert.doesNotMatch(source, /tenantId|actorId|\.from\(/);
  assert.doesNotMatch(source, /fechar período|zerar progresso|resetar ciclo|sales_admin_(?:close|reset)/i);
}
console.log("PASS: sales admin configuration UI routes, a11y and boundaries verified.");
