import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const team = read("src/components/sales/admin/SalesAdminTeam.tsx");
const methods = read("src/components/sales/admin/SalesAdminPaymentMethods.tsx");
const subnav = read("src/components/sales/admin/SalesAdminSubnavigation.tsx");
const teamPage = read("src/app/vendas/admin/equipe/page.tsx");
const methodsPage = read("src/app/vendas/admin/metodos-pagamento/page.tsx");

assert.match(teamPage, /state\.access\.role === "ADMIN"/);
assert.match(methodsPage, /state\.access\.role === "ADMIN"/);
assert.match(teamPage, /redirect\("\/vendas\/login\?redirect=\/vendas\/admin\/equipe"\)/);
assert.match(methodsPage, /redirect\("\/vendas\/login\?redirect=\/vendas\/admin\/metodos-pagamento"\)/);
assert.match(subnav, /aria-current=\{active \? "page"/);
assert.match(team, /\/api\/vendas\/admin\/directory/);
assert.match(team, /\/api\/vendas\/admin\/memberships/);
assert.match(team, /AlertDialogTitle>Desativar acesso de/);
assert.doesNotMatch(team, /tenantId/);
assert.match(methods, /\/api\/vendas\/admin\/payment-methods\/reorder/);
assert.match(methods, /expectedOrderRevision: orderRevision/);
assert.match(methods, /const reorderIdempotencyKeyRef = useRef<string \| null>\(null\)/);
assert.match(methods, /reorderIdempotencyKeyRef\.current = crypto\.randomUUID\(\)/);
assert.match(methods, /const idempotencyKey = reorderIdempotencyKeyRef\.current \?\? crypto\.randomUUID\(\)/);
assert.match(methods, /reorderIdempotencyKeyRef\.current = idempotencyKey/);
assert.match(methods, /idempotencyKey,/);
assert.match(methods, /function cancelReorder\(\)[\s\S]*?reorderIdempotencyKeyRef\.current = null/);
assert.match(methods, /await load\(\);[\s\S]*?reorderIdempotencyKeyRef\.current = null;[\s\S]*?setReordering\(false\)/);
assert.match(methods, /AlertDialogHeader>[\s\S]*?ref=\{errorRef\} tabIndex=\{-1\} role="alert"/);
assert.match(methods, /Mover \$\{method\.name\} para cima/);
assert.match(methods, /continuará legível no histórico/);
assert.doesNotMatch(methods, /method:\s*"DELETE"/);
assert.doesNotMatch(methods, /tenantId/);

console.log("PASS: UI administrativa 10.4A preserva gate, contratos, estados e reorder acessível.");
