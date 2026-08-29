# Epic 11 — LISION Vendas: Isolamento, Metas Flexíveis & Paridade de Configuração

**Autor:** Morgan (@pm) · **Arquitetura:** Aria (@architect)
**Status:** Draft · **Criado:** 2026-08-29
**Origem:** Teste em produção do LISION Vendas — 7 frentes de correção/implementação levantadas pelo usuário.

## Contexto & Problema

O LISION Vendas foi ao ar mas, em uso real, revelou acoplamento com o LISION de produção e lacunas de flexibilidade/UX:

- **Vazamento de dados:** a tela de Equipe do Vendas lista **toda a equipe de produção** (a RPC `sales_admin_directory_v1` faz `FROM profiles WHERE tenant_id`). Produção e Vendas são setores distintos, com equipes distintas.
- **Metas engessadas na UX:** metas individuais + coletivas já existem, mas a tela fragmenta em duas peças e as atribuições **empilham** (para criar uma nova é preciso rolar até o fim). Falta adicionar/renomear/excluir metas e editar/excluir atribuições.
- **Acesso "só Vendas":** o cargo VENDEDOR + guard já foram deployados (commit `6b4d100`), mas a UX de restrição precisa ficar no padrão do Lision e ganhar granularidade por área.
- **Config pobre:** o admin do Vendas é um conjunto de páginas soltas, sem a organização e os módulos do `SettingsPage` de produção.

## Objetivo

Isolar o LISION Vendas do LISION de produção (dados de equipe), tornar a gestão de metas/comissões flexível e fácil (padrão de UX de produção), e elevar o controle de acesso e o módulo de configuração à paridade útil com produção.

## Decisões de arquitetura (aprovadas pelo usuário)

1. **Isolamento da equipe:** escopar o diretório ao Vendas (membros + cargo VENDEDOR); criar consultora (usuário VENDEDOR) dentro do Vendas; adicionar administrador via busca explícita (única porta que consulta profiles).
2. **Metas:** manter as 6 metas canônicas como base editável (preserva o provisionador/inicializador), **liberando adicionar, renomear e remover** metas e **editar/excluir** atribuições. Tela única no padrão do `TargetsConfig`.
3. **Acesso:** melhorar o controle "Somente Vendas" no formulário de equipe (padrão Lision) **+ matriz fina de permissões por área por usuário** (copiar `PermissionsEditor`).
4. **Config:** admin do Vendas reorganizado em abas verticais (como `SettingsPage`) + módulos úteis (identidade do Vendas, referências). Entrega **faseada**.

## Fora de escopo

- Separar consultora de `profiles`/login (rejeitado — quebraria FKs de vendas/atribuições).
- Tenant separado para Vendas.
- Reescrever métricas/fechamento (já isolados nas tabelas `sales_*`).

## Stories

### Fase 1 — Isolamento da equipe
- **11.1 — Diretório escopado + criação de equipe no Vendas.**
  Reescreve `sales_admin_directory_v1` para listar só pessoas do Vendas (vínculo em `sales_memberships` OU cargo VENDEDOR). `SalesAdminTeam` ganha "Nova consultora" (cria VENDEDOR via `sales-vendedor-link`) e "Adicionar administrador" (busca explícita em profiles). Remove o texto/afluxo de "habilite perfis do tenant".

### Fase 2 — Metas & Comissões (flexível + tela única)
- **11.2 — Backend de metas flexíveis.**
  Aplica a migration `20260825160000` (delete de meta/atribuição, já escrita). Garante que `set_goal` cobre criar/renomear/mudar escopo de metas custom. Rotas DELETE de goal/assignment (já escritas). Contratos de erro.
- **11.3 — Workspace de Metas (UI única estilo produção).**
  `SalesGoalsWorkspace`: bloco "Metas coletivas/trimestrais" + tabela de metas individuais por consultora com edição inline e criação no topo. Incorpora editar/excluir metas e atribuições. Remove o empilhamento e o scroll.

### Fase 3 — Acesso & Configuração (refinada após investigação)

Descoberta: o Lision controla permissões **por CARGO** (`role_permissions`), não por usuário; o `PermissionsEditor` não inclui VENDEDOR. Decisão do usuário: o controle de permissões deve viver no **módulo de Configurações** (mesma UI/UX do Lision) e ser **por cargo E por usuário**. A config do Vendas deve ser **enriquecida** (a navegação lateral já existe).

- **11.4a — "Somente Vendas" + cargo Vendedor na matriz (bounded).**
  Melhora a UX de "Acesso: Somente Vendas" no `MemberForm` (padrão Lision) + inclui VENDEDOR no `PermissionsEditor` (controle por cargo no módulo de config). Revalida o guard em produção.
- **11.5 — Enriquecer Configurações do Vendas (bounded).**
  Mantém a navegação atual; adiciona módulos úteis à página de Configurações do Vendas (identidade/rótulos do Vendas, referências) no padrão visual do Lision.
- **11.6 — Permissões por usuário (subsistema novo — LARGE).**
  Camada de permissões por usuário (overrides por pessoa) além do por-cargo, no módulo de Configurações, controlando o que cada usuário vê. NÃO existe no Lision hoje → requer tabela + resolução de permissões efetivas + UI (matriz por cargo + seção por usuário) + gating. Construída como peça dedicada, com atenção a segurança (RLS, escopo por tenant).

**Status Fase 3:** Fases 1 e 2 entregues e em produção. Fase 3 planejada e fatiada; 11.6 é um subsistema que merece um ciclo próprio focado.

## Sequenciamento & entrega

Fases entregues incrementalmente, cada uma validada ao vivo (Quinn) e deployada (Gage) antes da próxima. Migrations aplicadas com protocolo probe→aplicar→verificar e OK do usuário.

## Métricas de sucesso

- Equipe do Vendas não exibe nenhum perfil exclusivo de produção.
- Criar/editar/excluir metas e atribuições sem sair da tela e sem scroll até o rodapé.
- Vendedora criada como VENDEDOR não acessa nenhuma área de produção (revalidado em produção).
- Admin do Vendas navegável por abas, com paridade útil de config.

## Change Log
| Data | Autor | Mudança |
|------|-------|---------|
| 2026-08-29 | @pm (Morgan) | Épico criado a partir da arquitetura aprovada (@architect) e das 7 frentes do usuário. |
