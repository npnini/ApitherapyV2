import { BigQuery } from '@google-cloud/bigquery';

/**
 * BIGQUERY VIEW SYNC SCRIPT
 * 
 * Usage:
 *   node scripts/sync-bq-views.js --diff --dev_stage    (Compare Dev and Stage)
 *   node scripts/sync-bq-views.js --deploy --dev_stage  (Sync Dev to Stage)
 *   node scripts/sync-bq-views.js --deploy --stage_prod (Sync Stage to Prod)
 */

// --- ARGUMENT PARSING & VALIDATION ---
const args = process.argv;
const action = args.includes('--diff') ? 'diff' : args.includes('--deploy') ? 'deploy' : null;
const envPair = args.includes('--dev_stage') ? 'dev_stage' : args.includes('--stage_prod') ? 'stage_prod' : null;

if (!action) {
  console.error("❌ Error: Missing action. Use --diff or --deploy");
  process.exit(1);
}
if (!envPair) {
  console.error("❌ Error: Missing environment pair. Use --dev_stage or --stage_prod");
  process.exit(1);
}

// --- CONFIGURATION LOGIC ---
let SOURCE_PROJECT, SOURCE_DS, TARGET_PROJECT, TARGET_DS;

if (envPair === 'dev_stage') {
  SOURCE_PROJECT = 'apitherapyv2';
  SOURCE_DS = 'apitherapy_clinical_analytics_dev';
  TARGET_PROJECT = 'apitherapyv2';
  TARGET_DS = 'apitherapy_clinical_analytics_stage';
} else {
  SOURCE_PROJECT = 'apitherapyv2';
  SOURCE_DS = 'apitherapy_clinical_analytics_stage';
  TARGET_PROJECT = 'apitherapy-c94a6';
  TARGET_DS = 'apitherapy_clinical_analytics_prod';
}

const bqSource = new BigQuery({ projectId: SOURCE_PROJECT });
const bqTarget = new BigQuery({ projectId: TARGET_PROJECT });

function normalizeSql(sql) {
  if (!sql) return '';
  return sql.replace(/`/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

async function syncViews() {
  const isWet = (action === 'deploy');
  const displayTarget = envPair === 'dev_stage' ? 'STAGING' : 'PRODUCTION';

  console.log(`\n🚀 BigQuery View Sync [${action.toUpperCase()} MODE]`);
  console.log(`Comparing [${SOURCE_PROJECT}:${SOURCE_DS}] to [${TARGET_PROJECT}:${TARGET_DS}]...\n`);

  try {
    const [sourceTables] = await bqSource.dataset(SOURCE_DS).getTables({ maxResults: 1000 });
    const sourceViews = sourceTables.filter(t => t.metadata.type === 'VIEW');

    let outOfSync = [];
    let newViews = [];
    let upToDateCount = 0;

    for (const view of sourceViews) {
      const viewId = view.id;
      const [metadata] = await view.getMetadata();
      const sourceSql = metadata.view?.query;

      if (!sourceSql) continue;

      const transformedSql = sourceSql
        .replace(new RegExp(SOURCE_DS, 'g'), TARGET_DS)
        .replace(new RegExp(SOURCE_PROJECT, 'g'), TARGET_PROJECT);
      const targetView = bqTarget.dataset(TARGET_DS).table(viewId);
      
      try {
        const [targetMetadata] = await targetView.getMetadata();
        const currentTargetSql = targetMetadata.view?.query;
        
        if (normalizeSql(currentTargetSql) !== normalizeSql(transformedSql)) {
          outOfSync.push(viewId);
          if (isWet) {
            const query = `CREATE OR REPLACE VIEW \`${TARGET_PROJECT}.${TARGET_DS}.${viewId}\` AS ${transformedSql}`;
            await bqTarget.query({ query });
          }
        } else {
          upToDateCount++;
        }
      } catch (err) {
        if (err.code === 404) {
          newViews.push(viewId);
          if (isWet) {
            const query = `CREATE OR REPLACE VIEW \`${TARGET_PROJECT}.${TARGET_DS}.${viewId}\` AS ${transformedSql}`;
            await bqTarget.query({ query });
          }
        } else {
          throw err;
        }
      }
    }

    // --- REPORTING ---
    if (newViews.length > 0) {
      console.log(`✨ NEW VIEWS (To be created in ${displayTarget}):`);
      newViews.forEach(name => console.log(`   [+] ${name}`));
      console.log('');
    }

    if (outOfSync.length > 0) {
      console.log(`⚠️  OUT OF SYNC (Definitions differ):`);
      outOfSync.forEach(name => console.log(`   [Δ] ${name}`));
      console.log('');
    }

    if (newViews.length === 0 && outOfSync.length === 0) {
      console.log(`✅ All ${sourceViews.length} views are perfectly in sync.`);
    } else {
      console.log(`--------------------------------------------------`);
      console.log(`Summary: ${upToDateCount} up-to-date, ${outOfSync.length} modified, ${newViews.length} new.`);
      if (isWet) {
        console.log(`Status: ALL CHANGES APPLIED TO ${displayTarget}.`);
      } else {
        console.log(`Status: DIFF REPORT ONLY. No changes made to ${displayTarget}.`);
      }
      console.log(`--------------------------------------------------`);
    }

  } catch (error) {
    console.error(`\n❌ Sync failed:`, error.message);
    process.exit(1);
  }
}

syncViews();
