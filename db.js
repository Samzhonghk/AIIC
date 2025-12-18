const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// 原始数据库路径（在项目根目录）
const sourceDbPath = path.resolve(__dirname, 'db.sqlite');
let dbPath = sourceDbPath;

// 检测是否在 Vercel 环境中 (Vercel 会设置 VERCEL 环境变量)
// 或者简单地检测是否无法写入当前目录，为了保险起见，我们在 Vercel 上总是使用 /tmp
if (process.env.VERCEL) {
    const tmpDbPath = path.join('/tmp', 'db.sqlite');
    
    // 如果 /tmp 下没有数据库文件，则从源文件复制一份
    // 注意：Serverless 函数每次冷启动 /tmp 都是空的，所以这里每次都会复制
    if (!fs.existsSync(tmpDbPath)) {
        if (fs.existsSync(sourceDbPath)) {
            try {
                fs.copyFileSync(sourceDbPath, tmpDbPath);
                console.log('Database copied to /tmp/db.sqlite');
            } catch (e) {
                console.error('Failed to copy database to /tmp:', e);
            }
        } else {
            console.warn('Source database not found at:', sourceDbPath);
        }
    }
    dbPath = tmpDbPath;
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Could not connect to database:', err);
    } else {
        console.log('Connected to database at:', dbPath);
    }
});

module.exports = db;
