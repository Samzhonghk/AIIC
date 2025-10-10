const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db.sqlite');
db.all('SELECT * FROM clients', (err, rows) => {
  console.log(rows);
  db.close();
});