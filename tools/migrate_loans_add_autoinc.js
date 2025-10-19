// tools/migrate_loans_add_autoinc.js
// Migration script: add an integer AUTOINCREMENT `id` primary key to `loans` table.
// It creates a new table `loans_new (id INTEGER PRIMARY KEY AUTOINCREMENT, ...same columns...)`, copies data,
// and swaps tables. It will abort if duplicate loan_number values exist.
// Usage: node tools/migrate_loans_add_autoinc.js

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbFile = path.resolve(__dirname, '..', 'db.sqlite');
if (!fs.existsSync(dbFile)) {
  console.error('Database file not found:', dbFile);
  process.exit(1);
}

// Backup
const backupFile = dbFile + '.bak.' + Date.now();
fs.copyFileSync(dbFile, backupFile);
console.log('Backup created:', backupFile);

const db = new sqlite3.Database(dbFile);

function runAsync(sql, params=[]) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err); else resolve(this);
    });
  });
}

function allAsync(sql, params=[]) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err); else resolve(rows);
    });
  });
}

(async () => {
  try {
    console.log('Reading existing loans table schema...');
    const cols = await allAsync("PRAGMA table_info(loans);");
    if (!cols || cols.length === 0) {
      console.error('No `loans` table found in database. Aborting.');
      process.exit(1);
    }

    const colNames = cols.map(c => c.name);
    console.log('Existing columns:', colNames.join(', '));

    // Archive non-numeric loan_number records first (move to loans_non_numeric then delete from loans)
    const nonNumericCountRow = await allAsync("SELECT COUNT(*) AS cnt FROM loans WHERE loan_number NOT GLOB '[0-9]*';");
    const nonNumericCount = nonNumericCountRow && nonNumericCountRow[0] ? nonNumericCountRow[0].cnt : 0;
    if (nonNumericCount > 0) {
      console.log(`Found ${nonNumericCount} non-numeric loan_number entries. Archiving to loans_non_numeric...`);
      // create archive table if not exists (same structure)
      await runAsync("CREATE TABLE IF NOT EXISTS loans_non_numeric AS SELECT * FROM loans WHERE 0;");
      await runAsync("INSERT INTO loans_non_numeric SELECT * FROM loans WHERE loan_number NOT GLOB '[0-9]*';");
      console.log('Inserted non-numeric rows into loans_non_numeric.');
      // delete from original table
      await runAsync("DELETE FROM loans WHERE loan_number NOT GLOB '[0-9]*';");
      console.log('Deleted non-numeric rows from loans table.');
    }

    // Check for duplicate loan_number values among remaining (numeric) rows
    const dups = await allAsync("SELECT loan_number, COUNT(*) AS cnt FROM loans GROUP BY loan_number HAVING cnt > 1;");
    if (dups && dups.length > 0) {
      console.error('Duplicate loan_number values detected after archiving non-numeric rows. Please resolve duplicates before migrating.');
      console.table(dups);
      process.exit(1);
    }

    // Build CREATE TABLE statement for loans_new
    // We will make loan_number the INTEGER PRIMARY KEY AUTOINCREMENT column (no separate id)
    const otherCols = cols.filter(c => c.name !== 'loan_number');
    const otherColDefs = otherCols.map(c => {
      const name = c.name;
      let type = (c.type || 'TEXT').toUpperCase();
      if (!type) type = 'TEXT';
      return `${name} ${type}`;
    });

    const createSQL = `CREATE TABLE loans_new (loan_number INTEGER PRIMARY KEY AUTOINCREMENT, ${otherColDefs.join(', ')} );`;
    console.log('\nCreate SQL for loans_new:\n', createSQL);

    // Start migration transaction
    await runAsync('BEGIN TRANSACTION;');
    console.log('Transaction started.');

    // Create new table
    await runAsync(createSQL);
    console.log('Created loans_new.');

    // Copy data from old table to new table (exclude old loan_number so autoincrement assigns new values)
    const insertCols = otherCols.map(c => c.name).join(', ');
    const insertSQL = `INSERT INTO loans_new (${insertCols}) SELECT ${insertCols} FROM loans;`;
    console.log('Copying data with:', insertSQL);
    await runAsync(insertSQL);
    console.log('Data copied.');

    // Verify counts
    const oldCountRow = await allAsync('SELECT COUNT(*) AS cnt FROM loans;');
    const newCountRow = await allAsync('SELECT COUNT(*) AS cnt FROM loans_new;');
    const oldCount = oldCountRow[0] && oldCountRow[0].cnt ? oldCountRow[0].cnt : 0;
    const newCount = newCountRow[0] && newCountRow[0].cnt ? newCountRow[0].cnt : 0;
    console.log(`Old rows: ${oldCount}, New rows: ${newCount}`);
    if (oldCount !== newCount) {
      throw new Error('Row counts differ after copy; aborting.');
    }

    // Before renaming, check if 'loans_backup' already exists; if so, move it aside to avoid conflict
    const existingBackup = await allAsync("SELECT name, type FROM sqlite_master WHERE name = 'loans_backup';");
    if (existingBackup && existingBackup.length > 0) {
      const entry = existingBackup[0];
      const ts = Date.now();
      if (entry.type === 'table') {
        const newName = `loans_backup_${ts}`;
        console.log(`Existing table 'loans_backup' found. Renaming it to ${newName} to avoid conflict.`);
        await runAsync(`ALTER TABLE loans_backup RENAME TO ${newName};`);
      } else if (entry.type === 'index') {
        console.log("Existing index named 'loans_backup' found. Dropping it to avoid conflict.");
        await runAsync(`DROP INDEX IF EXISTS loans_backup;`);
      } else {
        console.log(`Existing sqlite_master entry 'loans_backup' of type ${entry.type} found. Dropping if possible.`);
        try { await runAsync(`DROP TABLE IF EXISTS loans_backup;`); } catch(e) { /* ignore */ }
      }
    }

    // Rename tables: keep backup of old table by renaming it
    await runAsync('ALTER TABLE loans RENAME TO loans_backup;');
    await runAsync('ALTER TABLE loans_new RENAME TO loans;');
    console.log('Renamed tables: old->loans_backup, new->loans');

    // Commit
    await runAsync('COMMIT;');
    console.log('Migration committed successfully.');
    console.log('NOTE: old table is now `loans_backup`. If everything looks good you can drop it later.');

    // Close DB
    db.close();

  } catch (err) {
    console.error('Migration failed:', err.message);
    try { await runAsync('ROLLBACK;'); console.log('Rolled back transaction.'); } catch (e) {}
    db.close();
    process.exit(1);
  }
})();
