const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');

const router = express.Router();
const SECRET_KEY = 'your_secret_key';

// 初始化数据库
const db = new sqlite3.Database('./db.sqlite', (err) => {
    if (err) throw err;
});

// 创建用户表（如不存在）
db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
)`);

// 插入一个默认用户（用户名：admin，密码：123456）
db.get('SELECT * FROM users WHERE username = ?', ['admin'], (err, row) => {
    if (!row) {
        db.run('INSERT INTO users (username, password) VALUES (?, ?)', ['admin', '123456']);
    }
});

// 登录接口
router.post('/', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.json({ success: false, message: '请输入用户名和密码' });
    }
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err) return res.json({ success: false, message: '数据库错误' });
        if (!user || user.password !== password) {
            return res.json({ success: false, message: '用户名或密码错误aaaa' });
        }
        // 登录成功，生成 token
        const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '2h' });
        res.json({ success: true, message: 'login ok', token });
    });
});

module.exports = router;
