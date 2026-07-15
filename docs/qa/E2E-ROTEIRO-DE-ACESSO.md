# E2E — Roteiro de Acesso (para o Gabriel navegar e VER)

**Ambiente:** Fábrica Teste (`fabrica-teste-31ykr`) · dev server local **http://localhost:3000** · liserie intocada.
**Causa do "parado no login" (corrigida):** o numpad de PIN só envia com **6 dígitos**, e os PINs estavam com 4. Agora todos têm **6 dígitos**. E o login precisa do tenant na URL (`?tenant=fabrica-teste-31ykr`).

---

## 1) ADMIN — dashboard GERAL, setores e relatório (acesso ilimitado)
Entre por **Email e Senha** (não tem limite de tentativas):
- URL: **http://localhost:3000/login?tenant=fabrica-teste-31ykr** → botão **“Email e Senha”**
- **email:** `gestor.teste@fabricateste.local`
- **senha:** `Teste@123456`
- Cai em **/dashboard** (visão geral). No menu: **Meu Plano**, **Relatórios**, **Dashboard de Setor**.

## 2) OPERADORES — dashboard INDIVIDUAL (meta, %, déficit/ticker)
Entre por **PIN Rápido** (6 dígitos, envia sozinho ao 6º):
- URL: **http://localhost:3000/login?tenant=fabrica-teste-31ykr** → botão **“PIN Rápido”**
- Depois de entrar, abra **“Meu Plano”** (menu) — é a dashboard individual.

| Operador | Setor | PIN | O que você deve VER em “Meu Plano” |
|---|---|---|---|
| CORTADOR BRUNO | Corte | **111111** | produziu **1.200**, meta **1.200**, **100%** (batida) |
| COSTUREIRA ANA | Produção | **222222** | produziu **600**, meta efetiva **1.400**, **42,9%**, **déficit 600** |
| TRAVETADOR CARLOS | Travete | **333333** | produziu **650**, meta efetiva **600**, **108%** (quitou o déficit) |
| EMBALADORA DORA | Embalagem | **444444** | produziu **250**, meta **500** (herda do setor), **50%** |
| LIMPADORA EVA | Limpeza | **555555** | **sem meta** → estado vazio limpo (sem número absurdo) |

> ⚠️ **Limite de PIN:** 5 tentativas por 15 min por IP (segurança). Os 5 operadores cabem numa rodada. Se travar (“Too many attempts”), aguarde ~15 min **ou** peça para reiniciarmos o preview (zera o contador).

## 3) TV — sem login
- **Visão geral:** http://localhost:3000/tv?token=141eb884-12d8-4f9d-9cca-5f6583e66b5c
- **Por setor** (troca no seletor do topo, ou pela URL `&stage=`):
  - Corte `…&stage=7c87e0e3-f205-4ee2-8072-4bb8eddd534e` → **1.200 / 1.000 = 120%**
  - Produção `…&stage=dd16583e-4dad-4f0f-b967-f41abca3fafd` → **600 / 2.500 = 24%**
  - Travete `…&stage=742e410a-c3d9-4a7d-9c74-9d212469ff2e` → **650 / 1.200 = 54,2%**
  - Embalagem `…&stage=3352d65f-918b-4516-a8fe-53dbe66e3594` → **250 / 500 = 50%**

## 4) RELATÓRIO
- Logado como **admin** → menu **Relatórios** (`/reports`) → baixar **Excel** ou **PDF**.

---

## Fluxo sugerido (o que o Gabriel vê acontecendo)
1. **Admin** (email/senha) → **/dashboard** (geral) → **/reports** (baixa o relatório).
2. **Sair**, entrar por **PIN** como **ANA (222222)** → **Meu Plano**: vê **déficit 600** e meta **1.400** com os próprios olhos.
3. Repetir com **BRUNO (111111)** (100%) e **CARLOS (333333)** (108%, quitou).
4. **TV**: abrir a visão geral e trocar setores no seletor.

Todos os números acima são a **verdade** construída e validada no banco (ver `docs/qa/E2E-PLANO-DEFINITIVO.md`). Se algum não bater na tela, é FALHA — reportar.
