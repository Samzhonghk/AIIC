const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '..', 'db.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) return console.error('Failed to open DB:', err.message);
});

db.all("PRAGMA table_info('loans')", (err, rows) => {
  if (err) {
    console.error('PRAGMA error:', err.message);
    db.close();
    process.exit(1);
  }
  console.log('loans table columns:');
  rows.forEach(r => console.log(`- ${r.name} (type=${r.type})`));
  db.close();
});
