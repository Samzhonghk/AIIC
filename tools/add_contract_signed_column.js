const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '..', 'db.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) return console.error('Failed to open DB:', err.message);
});

const alterSql = "ALTER TABLE loans ADD COLUMN contract_signed INTEGER DEFAULT 0";
console.log('Running:', alterSql);

db.run(alterSql, (err) => {
  if (err) {
    console.error('ALTER TABLE failed:', err.message);
  } else {
    console.log('ALTER TABLE succeeded: added contract_signed');
  }
  db.all("PRAGMA table_info('loans')", (err2, rows) => {
    if (err2) { console.error('PRAGMA error:', err2.message); db.close(); process.exit(1); }
    console.log('loans table columns after change:');
    rows.forEach(r => console.log(`- ${r.name} (type=${r.type})`));
    db.close();
  });
});
