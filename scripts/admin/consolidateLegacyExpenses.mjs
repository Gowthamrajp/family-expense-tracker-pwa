/**
 * One-off ADMIN migration: consolidate legacy top-level `expenses` docs into
 * the single existing family's `expenses` subcollection.
 *
 * This uses firebase-admin (a service-account key), which BYPASSES Firestore
 * security rules, so it can read legacy expenses recorded by ANY user — unlike
 * the in-app migration which is restricted to the signed-in user's own uid.
 *
 * SAFETY:
 *  - Read-only AUDIT by default. It only writes when run with `--apply`.
 *  - Idempotent: each family expense is written under its legacy doc id, so a
 *    re-run never duplicates. Already-present ids are skipped.
 *  - Field-preserving: amount, source, date, description, recordedBy, createdAt
 *    are copied unchanged; categoryId is resolved/created from the legacy
 *    category string; the legacy `category` string is also retained.
 *  - Never deletes the legacy docs (leaves them in place).
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=.secrets/key.json node scripts/admin/consolidateLegacyExpenses.mjs           # audit
 *   GOOGLE_APPLICATION_CREDENTIALS=.secrets/key.json node scripts/admin/consolidateLegacyExpenses.mjs --apply   # write
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');
const KEY_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || '.secrets/key.json';

const serviceAccount = JSON.parse(readFileSync(KEY_PATH, 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

/** Normalize a category name for case/whitespace-insensitive comparison. */
function normalizeCategoryName(raw) {
  return String(raw ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

const VALID_SOURCES = new Set([
  'Cash',
  'Credit Card',
  'Reward Points',
  'Food Coupon',
  'Cashback Points',
]);

async function main() {
  console.log(`\n=== Legacy expense consolidation (${APPLY ? 'APPLY' : 'AUDIT (read-only)'}) ===\n`);

  // 1. Read legacy top-level expenses.
  const legacySnap = await db.collection('expenses').get();
  console.log(`Legacy top-level /expenses docs: ${legacySnap.size}`);
  const byUser = {};
  legacySnap.forEach((d) => {
    const uid = d.get('recordedBy') ?? '(none)';
    byUser[uid] = (byUser[uid] ?? 0) + 1;
  });
  console.log('  recordedBy breakdown:', byUser);

  // 2. Find the single family.
  const familiesSnap = await db.collection('families').get();
  console.log(`\nFamilies: ${familiesSnap.size}`);
  familiesSnap.forEach((f) =>
    console.log(`  - ${f.id}  name=${JSON.stringify(f.get('name'))}  inviteCode=${f.get('inviteCode')}  members=${JSON.stringify(f.get('memberUids'))}`),
  );
  if (familiesSnap.size !== 1) {
    console.error(`\nExpected exactly 1 family; found ${familiesSnap.size}. Aborting.`);
    process.exit(1);
  }
  const familyRef = familiesSnap.docs[0].ref;
  const familyId = familyRef.id;

  // 3. Load the family's existing categories + expenses (for mapping + idempotence).
  const [catSnap, famExpSnap] = await Promise.all([
    familyRef.collection('categories').get(),
    familyRef.collection('expenses').get(),
  ]);
  const idByNormName = new Map();
  catSnap.forEach((c) => idByNormName.set(normalizeCategoryName(c.get('name')), c.id));
  const existingExpenseIds = new Set(famExpSnap.docs.map((d) => d.id));
  console.log(`\nFamily ${familyId}: ${catSnap.size} categories, ${famExpSnap.size} expenses already present.`);

  // 4. Plan the migration.
  const toCopy = [];
  const toCreateCategories = new Map(); // normName -> displayName
  const skipped = [];
  const failures = [];

  legacySnap.forEach((d) => {
    const data = d.data();
    if (existingExpenseIds.has(d.id)) {
      skipped.push({ id: d.id, reason: 'already in family' });
      return;
    }
    if (!VALID_SOURCES.has(data.source)) {
      failures.push({ id: d.id, reason: `unknown source "${data.source}"` });
      return;
    }
    const norm = normalizeCategoryName(data.category);
    if (!idByNormName.has(norm) && !toCreateCategories.has(norm)) {
      toCreateCategories.set(norm, String(data.category));
    }
    toCopy.push({ id: d.id, data });
  });

  console.log('\n--- PLAN ---');
  console.log(`Categories to create: ${toCreateCategories.size}`, [...toCreateCategories.values()]);
  console.log(`Expenses to copy:     ${toCopy.length}`);
  console.log(`Expenses skipped:     ${skipped.length}`, skipped);
  console.log(`Expenses failing:     ${failures.length}`, failures);
  console.log('Expenses to copy detail:');
  toCopy.forEach((e) =>
    console.log(`  - ${e.id}: amount=${e.data.amount} category=${JSON.stringify(e.data.category)} source=${e.data.source} recordedBy=${e.data.recordedBy}`),
  );

  if (!APPLY) {
    console.log('\nAUDIT only — no writes performed. Re-run with --apply to migrate.\n');
    return;
  }

  // 5. Apply: create missing categories, then copy expenses.
  console.log('\n--- APPLYING ---');
  for (const [norm, displayName] of toCreateCategories) {
    const ref = familyRef.collection('categories').doc();
    await ref.set({ name: displayName });
    idByNormName.set(norm, ref.id);
    console.log(`Created category "${displayName}" -> ${ref.id}`);
  }

  let copied = 0;
  for (const { id, data } of toCopy) {
    const categoryId = idByNormName.get(normalizeCategoryName(data.category));
    if (!categoryId) {
      failures.push({ id, reason: 'category id unresolved at write time' });
      continue;
    }
    const target = familyRef.collection('expenses').doc(id);
    // Build doc preserving all original fields (Req 10.4).
    const doc = {
      amount: data.amount,
      category: data.category,
      categoryId,
      source: data.source,
      date: data.date instanceof Timestamp ? data.date : Timestamp.fromDate(new Date(data.date)),
      description: data.description ?? '',
      recordedBy: data.recordedBy,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt : Timestamp.now(),
    };
    if (data.recordedByName !== undefined) doc.recordedByName = data.recordedByName;
    if (data.subSourceId !== undefined) doc.subSourceId = data.subSourceId;
    await target.set(doc, { merge: false });
    copied += 1;
    console.log(`Copied legacy ${id} -> families/${familyId}/expenses/${id}`);
  }

  console.log(`\nDone. Copied ${copied} expense(s). Failures: ${failures.length}`, failures);
  console.log('Legacy top-level docs were left unchanged.\n');
}

main().catch((err) => {
  console.error('Migration script error:', err);
  process.exit(1);
});
