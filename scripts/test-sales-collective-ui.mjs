import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const ui = await read(
  "src/components/sales/collective/SalesCollectiveWorkspace.tsx",
);
const page = await read("src/app/vendas/coletivo/page.tsx");
for (const text of [
  "Painel coletivo",
  "Ritmo coletivo",
  "Agregados operacionais",
  "Ranking de formas de pagamento",
  "Distribuição de parcelamentos",
  "Ranking sanitizado de vendedoras",
  "Sem conexão",
  "Tentar novamente",
  "Histórico · período encerrado",
  "Empate na",
  "Ranking suprimido",
  "Página",
])
  assert.match(ui, new RegExp(text));
assert.match(ui, /data && !data\.allowed/);
assert.match(ui, /cache: "no-store"/);
assert.match(ui, /motion-safe:animate-pulse/);
assert.match(ui, /hidden overflow-x-auto[\s\S]*md:block/);
assert.match(ui, /grid gap-3 md:hidden/);
assert.match(ui, /aria-live="polite"/);
assert.match(ui, /items=\{data\.installments\.items\}/);
assert.match(ui, /data\.installments\.has_suppressed_buckets/);
assert.match(ui, /Indicador suprimido para preservar privacidade/);
assert.match(ui, /Alguns buckets foram suprimidos para preservar privacidade/);
for (const key of [
  "META_1",
  "META_2",
  "META_3",
  "CHALLENGE",
  "QUARTERLY",
  "COLLECTIVE",
])
  assert.match(ui, new RegExp(key));
assert.match(ui, /Nenhum agregado autorizado neste período/);
assert.match(ui, /Nenhuma posição autorizada neste período/);
assert.match(ui, /role="alert"/);
for (const forbidden of [
  "profile_id",
  "user_id",
  "display_name",
  "avatar",
  "realized_value",
  "commission",
  "ticket",
  "payment_method_id",
  "goal_id",
  "tenantId",
  "kiosk",
  "sales_tv_snapshot",
  "sound",
  "autoplay",
])
  assert.doesNotMatch(ui, new RegExp(forbidden, "i"));
assert.doesNotMatch(
  ui,
  /sort\(|reduce\(|\/\s*data\.|contribution_percent\s*[+*/-]/,
);
assert.match(page, /<SalesCollectiveWorkspace \/>/);
assert.match(page, /state\.access\.role/);
console.log(
  "PASS: collective UI renders sanitized canonical aggregates, rankings, privacy states, a11y and mobile.",
);
