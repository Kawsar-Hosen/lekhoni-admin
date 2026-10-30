import fs from 'node:fs';

const TURSO_URL = 'https://lekhoni-db-kawsar.turso.io';
const TURSO_AUTH_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTMzNzA5MzgsImlkIjoiMDFhMThkM2ItNTAwMS03NTlkLTg1NGEtMTA2ZDFjNmZkYjFkIiwia2lkIjoiN0FUYlh2QXlBRnVHRHJva0pnN1hkRnBXMkl2NWpVdzVsWnFaaEVkblFoYyIsInJpZCI6ImViMzA5YzI3LTg3NTAtNDBjOS05YmQ2LTNmNzYwMDY5YTkzNyJ9.LzPigATbN8xMsDvLQQJHpAxoh2jO9WwydQ9OKL7-GXhc3LSuppAt5gNqQK4WAgvZaiTDyju5uTgVBTGTpIyNCg';

function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const prev = i > 0 ? sql[i - 1] : '';

    if ((char === "'" || char === '"') && prev !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (stringChar === char) {
        // Check for escaped quote in SQL ('' or "")
        if (i + 1 < sql.length && sql[i + 1] === char) {
          current += char;
          i++; // Skip the next quote
        } else {
          inString = false;
        }
      }
    }

    if (char === ';' && !inString) {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        statements.push(trimmed);
      }
      current = '';
    } else {
      current += char;
    }
  }

  const trimmed = current.trim();
  if (trimmed.length > 0) {
    statements.push(trimmed);
  }

  return statements;
}

async function executeBatch(statements) {
  const requests = statements.map(sql => ({
    type: 'execute',
    stmt: { sql }
  }));

  const res = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TURSO_AUTH_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ requests })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Turso HTTP Error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const errors = [];
  data.results?.forEach((r, idx) => {
    if (r.type === 'error') {
      errors.push({ statement: statements[idx], error: r.error });
    }
  });
  return errors;
}

async function main() {
  console.log('Reading d1_backup.sql...');
  const sql = fs.readFileSync('d1_backup.sql', 'utf8');

  console.log('Parsing SQL statements...');
  const allStatements = splitSqlStatements(sql);
  console.log(`Found ${allStatements.length} statements to execute.`);

  const BATCH_SIZE = 50;
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < allStatements.length; i += BATCH_SIZE) {
    const batch = allStatements.slice(i, i + BATCH_SIZE);
    try {
      const errors = await executeBatch(batch);
      if (errors.length > 0) {
        for (const e of errors) {
          // If already exists or minor warning, continue
          console.warn(`[WARN] Statement warning/error: ${e.error.message || JSON.stringify(e.error)}`);
          errorCount++;
        }
      }
      successCount += (batch.length - errors.length);
    } catch (err) {
      console.error(`Batch failed at index ${i}:`, err.message);
      // Fallback: try individual statements in this batch
      for (const stmt of batch) {
        try {
          const errs = await executeBatch([stmt]);
          if (errs.length > 0) errorCount++;
          else successCount++;
        } catch (singleErr) {
          errorCount++;
          console.error('[Single Stmt Err]:', singleErr.message);
        }
      }
    }

    const progress = Math.min(i + BATCH_SIZE, allStatements.length);
    process.stdout.write(`\rProgress: ${progress}/${allStatements.length} (${Math.round(progress / allStatements.length * 100)}%)`);
  }

  console.log('\n--- Migration Finished ---');
  console.log(`Successfully executed: ${successCount}`);
  console.log(`Errors: ${errorCount}`);
}

main().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
