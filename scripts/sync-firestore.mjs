// Sincroniza o Firestore do projeto radar-clima-sul-sul com o export gerado
// a partir do banco de dados do Artifact (claude.ai), sync/data-export.json.
//
// Coleções tocadas por este script (fonte de verdade = Artifact):
//   items, contexto_itens, notas, sintese, contexto_sintese, meta  -> upsert (nunca apaga)
//   candidatos                                                     -> substituição total
//     (o Artifact é quem decide o conjunto de pendentes; a fila de
//     triagem do site deve refletir exatamente o que está no Artifact)
//
// Coleções NUNCA tocadas por este script (mantidas como estão no Firestore,
// produzidas manualmente no próprio site):
//   trechos_codificados, argumentos, relatorios_semanais, revisao_manual
//
// Credencial: variável de ambiente FIREBASE_SERVICE_ACCOUNT contendo o JSON
// completo da chave de conta de serviço (Firebase > Configurações do projeto
// > Contas de serviço > Gerar nova chave privada).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import admin from "firebase-admin";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT não definida. Configure este secret no repositório " +
      "(Settings > Secrets and variables > Actions) com o JSON da conta de serviço do Firebase."
    );
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT não é um JSON válido: " + e.message);
  }
}

function loadExport() {
  const path = process.env.DATA_EXPORT_PATH || join(__dirname, "..", "sync", "data-export.json");
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw);
}

async function upsertMap(db, collectionName, map, { label }) {
  const ids = Object.keys(map || {});
  console.log(`[${label}] upsert em "${collectionName}": ${ids.length} documentos`);
  let batch = db.batch();
  let count = 0;
  for (const id of ids) {
    const ref = db.collection(collectionName).doc(id);
    batch.set(ref, map[id], { merge: false });
    count++;
    if (count % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (count % 400 !== 0 || count === 0) {
    if (count > 0) await batch.commit();
  }
  return ids.length;
}

async function replaceCollection(db, collectionName, map, { label }) {
  const existingSnap = await db.collection(collectionName).get();
  const existingIds = existingSnap.docs.map((d) => d.id);
  console.log(
    `[${label}] substituindo "${collectionName}": ${existingIds.length} existentes -> ` +
    `${Object.keys(map || {}).length} novos`
  );

  // apaga tudo que existe hoje
  let batch = db.batch();
  let count = 0;
  for (const id of existingIds) {
    batch.delete(db.collection(collectionName).doc(id));
    count++;
    if (count % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (count > 0 && count % 400 !== 0) await batch.commit();
  else if (count > 0 && existingIds.length % 400 === 0) {
    // já commitado no loop acima
  }

  // escreve o conjunto novo
  const ids = Object.keys(map || {});
  batch = db.batch();
  count = 0;
  for (const id of ids) {
    batch.set(db.collection(collectionName).doc(id), map[id], { merge: false });
    count++;
    if (count % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (count > 0) await batch.commit();

  return ids.length;
}

async function main() {
  const serviceAccount = loadServiceAccount();
  const data = loadExport();

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
  const db = admin.firestore();

  await upsertMap(db, "items", data.items, { label: "items" });
  await upsertMap(db, "contexto_itens", data.contexto_itens, { label: "contexto_itens" });
  await upsertMap(db, "notas", data.notas, { label: "notas" });
  await upsertMap(db, "sintese", data.sintese, { label: "sintese" });
  await upsertMap(db, "contexto_sintese", data.contexto_sintese, { label: "contexto_sintese" });

  await replaceCollection(db, "candidatos", data.candidatos, { label: "candidatos" });

  await db.collection("meta").doc("info").set(data.meta || {}, { merge: true });
  console.log("[meta] atualizado meta/info");

  console.log("Sincronização concluída com sucesso.");
}

main().catch((err) => {
  console.error("Falha na sincronização com o Firestore:", err);
  process.exit(1);
});
