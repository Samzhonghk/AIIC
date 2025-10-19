// tools/check_loans.js
// Usage: node tools/check_loans.js
// This script inspects the `loans` table in db.sqlite: table schema, indexes, and duplicate loan_number entries.

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, '..', 'db.sqlite');

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Failed to open database:', err.message);
    process.exit(1);
  }
});

function runChecks() {
  console.log('Checking database:', dbPath);

  db.serialize(() => {
    console.log('\n== PRAGMA table_info(loans) ==');
    db.all("PRAGMA table_info(loans);", (err, rows) => {
      if (err) return console.error('PRAGMA table_info error:', err.message);
      console.table(rows);
    });

    console.log('\n== PRAGMA index_list(loans) ==');
    db.all("PRAGMA index_list('loans');", (err, rows) => {
      if (err) return console.error('PRAGMA index_list error:', err.message);
      console.table(rows);
    });

    console.log('\n== CREATE TABLE SQL for loans ==');
    db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='loans';", (err, row) => {
      if (err) return console.error('sqlite_master query error:', err.message);
      if (!row || !row.sql) return console.log('No loans table found.');
      console.log(row.sql);
    });

    console.log('\n== Duplicate loan_number (loan_number, count) ==');
    db.all("SELECT loan_number, COUNT(*) AS cnt FROM loans GROUP BY loan_number HAVING cnt > 1;", (err, rows) => {
      if (err) return console.error('Duplicate check error:', err.message);
      if (!rows || rows.length === 0) {
        console.log('No duplicate loan_number values found.');
      } else {
        console.table(rows);
        // For each duplicated loan_number, show the rows
        (function showDupDetails(i){
          if (i >= rows.length) return;
          const ln = rows[i].loan_number;
          console.log('\n-- Rows for loan_number =', ln, '--');
          db.all("SELECT rowid, * FROM loans WHERE loan_number = ? ORDER BY rowid ASC;", [ln], (err2, recs) => {
            if (err2) console.error('Error fetching duplicate rows:', err2.message);
            else console.table(recs.map(r => ({rowid: r.rowid, loan_number: r.loan_number, customer_id: r.customer_id, created_date: r.created_date})));
            showDupDetails(i+1);
          });
        })(0);
      }
    });

  });
}

runChecks();

// close after a delay to allow async console output
setTimeout(() => db.close(), 800);
