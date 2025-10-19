const sqlite3 = require('sqlite3').verbose();
const dbPath = 'e:\\vscode_proj\\AIIC_management\\db.sqlite';
const db = new sqlite3.Database(dbPath, (err)=>{ if(err) { console.error(err); process.exit(1); }});

db.all("SELECT name, type, sql FROM sqlite_master WHERE name LIKE 'loans%';", (err, rows) => {
  if (err) { console.error(err); process.exit(1); }
  console.log(JSON.stringify(rows, null, 2));
  db.close();
});
