# Sincronização Artifact → Firestore

Este diretório guarda o export mais recente do banco de dados do painel
mantido no Artifact (claude.ai) — a fonte de verdade da pesquisa semanal
("Radar Clima Sul-Sul").

## Como funciona

1. A cada rodada da tarefa agendada, o Claude exporta as coleções do
   Artifact (`items`, `contexto_itens`, `candidatos`, `notas`, `sintese`,
   `contexto_sintese`, `meta`) para `sync/data-export.json` e faz commit
   + push neste repositório.
2. Esse push dispara o workflow `.github/workflows/sync-firestore.yml`,
   que roda `scripts/sync-firestore.mjs` nos servidores do GitHub.
3. O script escreve os dados no Firestore do projeto `radar-clima-sul-sul`
   (o mesmo que o `index.html` deste site lê ao vivo), usando uma
   credencial de conta de serviço guardada no secret
   `FIREBASE_SERVICE_ACCOUNT`.

## Regras de sincronização

- `items`, `contexto_itens`, `notas`, `sintese`, `contexto_sintese`: são
  **upsert** (cria/atualiza pelo id) — nada é apagado automaticamente.
  Isso significa que itens que já estavam no Firestore mas não vieram
  deste export continuam lá.
- `candidatos`: é **substituição total** — a cada rodada, a coleção no
  Firestore passa a refletir exatamente a fila de pendentes do Artifact
  (candidatos já triados desaparecem daqui e viram histórico só nos
  `items`/`contexto_itens` do Artifact).
- `trechos_codificados`, `argumentos`, `relatorios_semanais`,
  `revisao_manual`: **nunca são tocados** por esta sincronização — são
  mantidos manualmente direto no site.

## Configurar o secret (uma vez só)

1. Firebase Console → Configurações do projeto → Contas de serviço →
   "Gerar nova chave privada" (projeto `radar-clima-sul-sul`).
2. No GitHub: Settings → Secrets and variables → Actions → New repository
   secret → nome `FIREBASE_SERVICE_ACCOUNT`, valor = conteúdo do JSON
   baixado.

## Rodar manualmente

Além de disparar automaticamente a cada push em `sync/data-export.json`,
o workflow pode ser disparado manualmente em Actions → "Sincronizar
Firestore (radar-clima-sul-sul)" → Run workflow.
