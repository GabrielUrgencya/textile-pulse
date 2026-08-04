# HOTFIX — Login resiliente quando o Supabase está indisponível

| Campo | Valor |
|---|---|
| **ID** | HOTFIX-LOGIN-SUPABASE-503 |
| **Epic** | Sustentação / incidente de autenticação |
| **Sprint** | Hotfix |
| **Prioridade** | P0 — CRÍTICO (bloqueia o acesso administrativo) |
| **Complexidade** | XS |
| **Status** | Ready for Review |
| **Agentes** | @dev (Dex), @qa (Quinn) |
| **Origem** | Incidente reproduzido no login da Fábrica Teste: `fetch failed` ao submeter email e senha. |

## Atribuição de Execução e Gate

| Campo | Valor |
|---|---|
| **executor** | @dev (Dex) |
| **quality_gate** | @architect (Aria) |
| **quality_gate_tools** | revisão de contrato HTTP, teste automatizado de rota/UI, `npm run lint`, `npm run build` |

O executor implementa a correção de código e os testes. O gate arquitetural valida que o comportamento preserva 400/401, entrega somente o contrato neutro 503 para indisponibilidade e não amplia o escopo do hotfix. A validação funcional dos ACs permanece registrada por @qa na seção **QA Results**.

## Descrição

Quando o Supabase Auth está indisponível, falha de rede ou falha ao inicializar o cliente, o `POST /api/auth/login` deixa a exceção propagar. O navegador recebe uma falha de fetch e a pessoa administradora não recebe uma orientação segura ou acionável.

Como administradora da Fábrica Teste, preciso receber uma resposta controlada e amigável quando o serviço de autenticação estiver temporariamente indisponível, para saber que minhas credenciais não foram expostas nem necessariamente estão incorretas.

## Critérios de Aceitação

- [x] **AC1 — API:** Dado que a chamada `supabase.auth.signInWithPassword` lança uma exceção de rede/indisponibilidade, quando `POST /api/auth/login` é chamado com corpo válido, então a rota responde JSON com HTTP **503**, sem propagar a exceção.
- [x] **AC2 — Sem vazamento:** A resposta 503 usa uma mensagem neutra para o usuário (sem stack trace, URL, credenciais, variáveis de ambiente ou texto bruto do erro do provedor).
- [x] **AC3 — Credenciais inválidas preservadas:** Dado que o Supabase responde erro normal de autenticação, a rota mantém a semântica atual de credenciais inválidas (401) e também não expõe detalhes internos.
- [x] **AC4 — UI:** Dado o HTTP 503, quando a pessoa tenta entrar pela tela `/login`, então vê mensagem amigável de indisponibilidade temporária e pode tentar novamente; a tela não exibe `fetch failed` nem erro cru do provedor.
- [x] **AC5 — Regressão:** Dado login válido do administrador da Fábrica Teste com Supabase disponível, quando enviado, então o redirecionamento para `/dashboard` continua funcionando.
- [x] **AC6 — Teste automatizado:** Há teste que simula a exceção do Supabase e verifica status 503, contrato seguro da resposta e a mensagem apresentada na UI; os checks disponíveis do projeto (`npm run lint`, `npm run build`) passam.

## Escopo

**IN:**

- Tratamento explícito de exceções na rota `src/app/api/auth/login/route.ts` para indisponibilidade do Supabase.
- Mensagem neutra e contrato JSON de erro para o 503.
- Tratamento específico do 503 na tela `src/app/login/page.tsx`.
- Teste automatizado da rota e do comportamento visível no login, usando a infraestrutura de testes já presente no repositório ou adicionando o mínimo necessário para este hotfix.

**OUT:**

- Alterações de credenciais, contas, tenants ou dados da Fábrica Teste.
- Mudanças no fluxo de PIN, RBAC, schema/migrations, Stripe ou cobrança.
- Retries automáticos, circuit breaker, observabilidade externa ou mudanças de provedor.

## Notas Técnicas

- A rota atual chama `createSupabaseServerClient()` e `signInWithPassword` sem fronteira de tratamento para exceções inesperadas; manter a validação 400 já existente para corpo inválido.
- O contrato de erro documentado pela arquitetura é JSON com campo `error` e status HTTP apropriado. [Source: `docs/architecture/PHASE1-GAP-ANALYSIS.md` §5.3]
- O padrão de interface para erro de rede é banner inline com possibilidade de nova tentativa. [Source: `docs/architecture/PHASE1-GAP-ANALYSIS.md` §6.2]
- Não registrar senha, corpo completo da requisição, token ou variáveis de ambiente. O diagnóstico técnico, se necessário, deve permanecer somente no log seguro do servidor.

## Tarefas / Subtarefas

- [x] **T1 (AC1, AC2, AC3):** Envolver a criação/uso do cliente e a autenticação do Supabase em tratamento de erro; mapear indisponibilidade inesperada para 503 e manter 401 para falha normal de autenticação.
- [x] **T2 (AC2):** Definir resposta JSON neutra para indisponibilidade, sem refletir a mensagem original do erro.
- [x] **T3 (AC4):** Atualizar o submit de email em `/login` para diferenciar 503 de credenciais inválidas e exibir a mensagem amigável com nova tentativa disponível.
- [x] **T4 (AC6):** Criar/atualizar teste automatizado que force a exceção do Supabase, confira 503 e valide que o texto bruto `fetch failed` não chega à interface.
- [x] **T5 (AC5, AC6):** Executar login manual com a conta administrativa de teste somente após o serviço estar disponível; rodar `npm run lint` e `npm run build`; registrar resultados abaixo.

## File List

| Arquivo | Ação |
|---|---|
| `src/app/api/auth/login/route.ts` | Modificar — tratamento seguro de indisponibilidade do Supabase. |
| `src/app/login/page.tsx` | Modificar — mensagem amigável para 503. |
| `scripts/test-login-supabase-unavailable.mjs` | Criado — teste de contrato 503 e mensagem da interface. |
| `package.json` | Modificado — script `test:login-unavailable`. |

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> A configuração correspondente não está habilitada em `.aiox-core/core-config.yaml`. A validação usará revisão manual, teste automatizado e os checks do projeto.

## Dev Agent Record

### Agent Model Used

GPT-5 Codex / Dex

### Debug Log References

- `npm run test:login-unavailable`: PASS elevado — contrato 503/401, ausência de usuário/sessão e mensagem segura na UI validados; nenhum `fetch failed` exposto.
- Login manual da administradora da Fábrica Teste: PASS, com redirecionamento para `/dashboard`.
- `npm run lint`: PASS, sem warnings ou erros.
- Build isolado: PASS — compile, lint/typecheck, 108/108 páginas, otimização e traces concluídos.

### Completion Notes

- Implementados o contrato JSON neutro de indisponibilidade (503), a resposta neutra para credenciais inválidas (401) e a mensagem específica de 503 na tela de login.
- A rota também preserva 401 neutro quando o provedor não retorna usuário ou sessão, evitando acesso inseguro a valores nulos.
- O teste usa porta efêmera, retry em disputa de porta, sincronização após hidratação e cleanup da árvore de processos no Windows.
- T4 e T5 concluídas após execução elevada do Playwright, login real e build isolado completo.

## QA Results

### 2026-08-04 - Gate final

**Decisao:** PASS

- Teste automatizado UI/contrato passou para 503 seguro, 401 preservado e ausencia de `fetch failed` exposto.
- Login real da Fabrica Teste passou com redirecionamento ao dashboard.
- Lint e build completo, incluindo typecheck integrado e 108/108 paginas, passaram. AC1-AC6 atendidos.

-- Quinn (@qa)

<!-- @qa: registre resultados de AC1–AC6, evidência do teste de indisponibilidade e dos checks aqui. -->

## Change Log

| Data | Agente | Ação |
|---|---|---|
| 2026-08-03 | @sm (River) | Story de hotfix criada a partir do incidente reportado, com Supabase indisponível tratado como P0. |
| 2026-08-03 | @po (Pax) | Escopo, critérios e sequência validados contra o incidente P0; story liberada como Ready for Dev. |
| 2026-08-04 | @dev (Dex) | Hotfix, teste automatizado e gates finais concluídos; status promovido para Ready for Review. |
