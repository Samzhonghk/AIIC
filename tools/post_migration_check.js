const sqlite3 = require('sqlite3').verbose();
const dbPath = 'e:\\vscode_proj\\AIIC_management\\db.sqlite';
const db = new sqlite3.Database(dbPath, (err)=>{ if(err){ console.error(err); process.exit(1);} });

(async ()=>{
  function all(sql, params=[]) { return new Promise((res, rej)=> db.all(sql, params, (e,r)=> e?rej(e):res(r))); }
  function get(sql, params=[]) { return new Promise((res, rej)=> db.get(sql, params, (e,r)=> e?rej(e):res(r))); }
  try {
    console.log('PRAGMA table_info(loans):');
    console.log(JSON.stringify(await all("PRAGMA table_info(loans);"), null, 2));

    const cnt = await get('SELECT COUNT(*) AS cnt FROM loans;');
    console.log('loans count:', cnt.cnt);

    const sample = await all('SELECT * FROM loans LIMIT 5;');
    console.log('sample rows (first 5):');
    console.log(JSON.stringify(sample, null, 2));

    const backups = await all("SELECT name, type FROM sqlite_master WHERE name LIKE 'loans_backup%';");
    console.log('backup entries:', JSON.stringify(backups, null, 2));

    const nonnumExists = await get("SELECT COUNT(*) AS cnt FROM sqlite_master WHERE name='loans_non_numeric' AND type='table';");
    if (nonnumExists && nonnumExists.cnt>0) {
      const nonnumCnt = await get('SELECT COUNT(*) AS cnt FROM loans_non_numeric;');
      console.log('loans_non_numeric count:', nonnumCnt.cnt);
      const nonnumSample = await all('SELECT * FROM loans_non_numeric LIMIT 5;');
      console.log('loans_non_numeric sample:', JSON.stringify(nonnumSample, null, 2));
    } else {
      console.log('loans_non_numeric table not found.');
    }

    // show sqlite_master entry for loans
    const loansMaster = await all("SELECT name, type, sql FROM sqlite_master WHERE name='loans' OR name LIKE 'loans_backup%';");
    console.log('sqlite_master entries for loans*:', JSON.stringify(loansMaster, null, 2));

    db.close();
  } catch (err) {
    console.error('Error:', err);
    db.close();
    process.exit(1);
  }
})();
