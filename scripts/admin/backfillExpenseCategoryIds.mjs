/**
 * One-off ADMIN backfill: ensure every family expense has a valid `categoryId`.
 *
 * After categories became managed data, some (migrated/legacy) expenses may
 * carry only the legacy `category` string and no `categoryId`, or a
 * `categoryId` pointing at a category that was later deleted. Those expenses
 * show up as "Uncategorized" in the distribution. This script resolves each
 * such expense to a real family Category by normalized-name match (creating the
 * category when none exists) and sets its `categoryId`, so the category
 * distribution attributes all spending correctly.
 *
 * This uses firebase-admin (a service-account key), which BYPASSES Firestore
 * security rules.
 *
 * SAFETY:
 *  - Read-only AUDIT by default. Writes only with `--apply`.
 *  - Idempotent: expenses that already have a valid categoryId are skipped.
 *  - Only sets `categoryId` (and creates categories as needed). Never changes
 *    amount/date/description/recordedBy/createdAt and never deletes anything.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=.secrets/key.json node scripts/admin/backfillExpenseCategoryIds.mjs           # audit
 *   GOOGLE_APPLICATION_CREDENTIALS=.secrets/key.json node scripts/admin/backfillExpenseCategoryIds.mjs --apply   # write
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
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

async function main() {
  console.log(`\n=== Expense categoryId backfill (${APPLY ? 'APPLY' : 'AUDIT (read-only)'}) ===\n`);

  const familiesSnap = await db.collection('families').get();
  if (familiesSnap.empty) {
    console.log('No families found. Nothing to do.');
    return;
  }

  let totalFixed = 0;
  let totalCreatedCategories = 0;

  for (const familyDoc of familiesSnap.docs) {
    const familyId = familyDoc.id;
    const familyRef = familyDoc.ref;

    // Load current categories into a normalized-name -> id map.
    const catsSnap = await familyRef.collection('categories').get();
    const idByNormName = new Map();
    const validIds = new Set();
    catsSnap.forEach((c) => {
      validIds.add(c.id);
      idByNormName.set(normalizeCategoryName(c.get('name')), c.id);
    });

    const expensesSnap = await familyRef.collection('expenses').get();
    let familyFixed = 0;

    for (const exp of expensesSnap.docs) {
      const categoryId = exp.get('categoryId');
      // Skip when the expense already references a category that still exists.
      if (typeof categoryId === 'string' && validIds.has(categoryId)) {
        continue;
      }

      const legacyName = exp.get('category');
      const norm = normalizeCategoryName(legacyName);
      const displayName =
        typeof legacyName === 'string' && legacyName.trim() !== ''
          ? legacyName.trim()
          : 'Other';
      const normKey = norm !== '' ? norm : 'other';

      let resolvedId = idByNormName.get(normKey);
      if (resolvedId === undefined) {
        // Need to create the category.
        if (APPLY) {
          const newRef = familyRef.collection('categories').doc();
          await newRef.set({ name: displayName });
          resolvedId = newRef.id;
        } else {
          resolvedId = `(new:${displayName})`;
        }
        idByNormName.set(normKey, resolvedId);
        if (resolvedId !== undefined && !String(resolvedId).startsWith('(new:')) {
          validIds.add(resolvedId);
        }
        totalCreatedCategories += 1;
        console.log(`  [${familyId}] would create category "${displayName}"`);
      }

      console.log(
        `  [${familyId}] expense ${exp.id}: categoryId -> ${resolvedId} (from "${legacyName ?? ''}")`,
      );
      if (APPLY && typeof resolvedId === 'string' && !resolvedId.startsWith('(new:')) {
        await exp.ref.update({ categoryId: resolvedId });
      }
      familyFixed += 1;
    }

    if (familyFixed > 0) {
      console.log(`  [${familyId}] ${familyFixed} expense(s) ${APPLY ? 'updated' : 'would be updated'}`);
    }
    totalFixed += familyFixed;
  }

  console.log(
    `\nDone. ${totalFixed} expense(s) ${APPLY ? 'updated' : 'would be updated'}; ` +
      `${totalCreatedCategories} categor(ies) ${APPLY ? 'created' : 'would be created'}.`,
  );
  if (!APPLY) {
    console.log('\nThis was an AUDIT. Re-run with --apply to write changes.\n');
  }
}

main().catch((error) => {
  console.error('Backfill failed:', error);
  process.exit(1);
});
