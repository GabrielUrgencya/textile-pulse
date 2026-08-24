import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/app/vendas/tv/page.tsx", "utf8");
const ui = readFileSync("src/components/sales/tv/SalesTvWorkspace.tsx", "utf8");

assert.match(page, /history\.replaceState/);
assert.match(page, /h\.get\("token"\)/);
assert.match(page, /h\.get\("periodKey"\)/);
assert.match(
  page,
  /history\.replaceState\(null,\s*"",\s*u\.pathname\s*\+\s*u\.search\)/,
);
assert.doesNotMatch(
  page,
  /searchParams\.get\("token"\)|u\.searchParams\.delete\("token"\)/,
);
assert.doesNotMatch(
  page + ui,
  /localStorage|sessionStorage|document\.cookie|console\./,
);
assert.match(ui, /crypto\.getRandomValues\(new Uint8Array\(32\)\)/);
assert.match(ui, /AbortController/);
assert.match(ui, /controllerRef\.current\?\.abort\(\)/);
assert.match(ui, /currentRequest !== requestId\.current/);
assert.match(ui, /snapshotRef\.current/);
assert.match(ui, /setTimeout\(poll, refreshMsRef\.current\)/);
assert.match(ui, /parsed\.data\.refresh_after_seconds \* 1000/);
assert.match(ui, /delete host\.__salesTvBootstrap/);
assert.match(ui, /receiptRef\.current \?\?= receipt\(\)/);
assert.match(ui, /receipt_state === "ACKNOWLEDGED"/);
assert.match(ui, /seenReceipts\.current\.delete\(claimReceipt\)/);
assert.match(ui, /receiptRef\.current = receipt\(\)/);
assert.match(ui, /body: JSON\.stringify\(\{ receipt: eventReceipt \}\)/);
assert.doesNotMatch(
  ui,
  /ack\.status === 202[\s\S]{0,100}receiptRef\.current = receipt\(\)/,
);
assert.match(ui, /seenReceipts/);
assert.match(ui, /context\.state !== "closed"/);
assert.match(ui, /void context\.close\(\)/);
assert.doesNotMatch(ui, /enableSound[\s\S]{0,500}prefers-reduced-motion/);
assert.match(ui, /status: 202|method: "POST"/);
for (const band of [
  "Construindo ritmo",
  "Rumo à meta",
  "Meta coletiva atingida",
])
  assert.match(ui, new RegExp(band));
for (const state of [
  "Carregando painel coletivo",
  "Este painel não está disponível",
  "Offline · dados desatualizados",
  "Tentar novamente",
])
  assert.match(ui, new RegExp(state.replace(/[·]/g, "·")));
assert.match(ui, /motion-safe:animate/);
assert.match(ui, /aria-live="polite"/);
assert.match(ui, /Ativar som das celebrações/);
assert.match(ui, /Som indisponível; celebração visual mantida/);
assert.doesNotMatch(
  ui,
  /collective_percent|sales_tv_snapshot_v1|profile_id|tenant_id|realized_value|target_value|R\$/,
);

console.log(
  "PASS: sales TV UI removes bootstrap secrets, consumes canonical v2 state and covers recovery, celebration and accessibility.",
);
