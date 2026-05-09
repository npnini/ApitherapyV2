import { BigQuery } from '@google-cloud/bigquery';

/**
 * BIGQUERY VIEW SYNC SCRIPT (Summary Version)
 * 
 * Usage:
 *   node scripts/sync-bq-views.js --dry   (Show list of changes only)
 *   node scripts/sync-bq-views.js --wet   (Apply changes to Staging)
 */

const PROJECT_ID = 'apitherapyv2';
const SOURCE_DS = 'apitherapy_clinical_analytics_dev';
const TARGET_DS = 'apitherapy_clinical_analytics_stage';

const bq = new BigQuery({ projectId: PROJECT_ID });

function normalizeSql(sql) {
  if (!sql) return '';
  // Normalize SQL for a robust logical comparison (ignore case, backticks, whitespace)
  return sql.replace(/`/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

async function syncViews() {
  const isWet = process.argv.includes('--wet');
  const isDry = !isWet;

  console.log(`\n🚀 BigQuery View Sync [${isWet ? 'WET MODE - APPLYING' : 'DRY MODE - REPORTING'}]`);
  console.log(`Comparing [${SOURCE_DS}] to [${TARGET_DS}]...\n`);

  try {
    const [sourceTables] = await bq.dataset(SOURCE_DS).getTables({ maxResults: 1000 });
    const sourceViews = sourceTables.filter(t => t.metadata.type === 'VIEW');

    let outOfSync = [];
    let newViews = [];
    let upToDateCount = 0;

    for (const view of sourceViews) {
      const viewId = view.id;
      const [metadata] = await view.getMetadata();
      const sourceSql = metadata.view?.query;

      if (!sourceSql) continue;

      const transformedSql = sourceSql.replace(new RegExp(SOURCE_DS, 'g'), TARGET_DS);
      const targetView = bq.dataset(TARGET_DS).table(viewId);
      
      try {
        const [targetMetadata] = await targetView.getMetadata();
        const currentTargetSql = targetMetadata.view?.query;
        
        if (normalizeSql(currentTargetSql) !== normalizeSql(transformedSql)) {
          outOfSync.push(viewId);
          if (isWet) {
            const query = `CREATE OR REPLACE VIEW \`${PROJECT_ID}.${TARGET_DS}.${viewId}\` AS ${transformedSql}`;
            await bq.query({ query });
          }
        } else {
          upToDateCount++;
        }
      } catch (err) {
        if (err.code === 404) {
          newViews.push(viewId);
          if (isWet) {
            const query = `CREATE OR REPLACE VIEW \`${PROJECT_ID}.${TARGET_DS}.${viewId}\` AS ${transformedSql}`;
            await bq.query({ query });
          }
        } else {
          throw err;
        }
      }
    }

    // --- REPORTING ---
    if (newViews.length > 0) {
      console.log(`✨ NEW VIEWS (To be created in Staging):`);
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
        console.log(`Status: ALL CHANGES APPLIED TO STAGING.`);
      } else {
        console.log(`Status: DRY RUN ONLY. No changes made to Staging.`);
      }
      console.log(`--------------------------------------------------`);
    }

  } catch (error) {
    console.error(`\n❌ Sync failed:`, error.message);
    process.exit(1);
  }
}

syncViews();
