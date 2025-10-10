const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');

const router = express.Router();

// 初始化数据库
const db = new sqlite3.Database('./db.sqlite', (err) => {
    if (err) throw err;
});



// 创建用户表，增加 photo 字段
const createTableSql = `CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY,
    name TEXT,
    phone TEXT,
    occupation TEXT,
    address TEXT,
    photo TEXT
)`;
db.run(createTableSql,()=>{
    db.get('SELECT COUNT(*) AS count FROM clients', (err, result) => {
    if (result && result.count === 0) {
        db.run(
            'INSERT INTO clients (id, name, phone, occupation, address, photo) VALUES (?, ?, ?, ?, ?, ?)',
            [1001, 'sam', '13800000001', 'Engineer', 'Beijing', '']
        );
        db.run(
            'INSERT INTO clients (id, name, phone, occupation, address, photo) VALUES (?, ?, ?, ?, ?, ?)',
            [1002, 'max', '13800000002', 'Designer', 'Shanghai', '']
        );
    }
});
});



// 配置图片上传
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        cb(null, Date.now() + ext);
    }
});
const upload = multer({ storage });

// 处理新建用户
router.post('/', upload.single('photo'), (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const { id, name, phone, occupation, address } = req.body;
    const photoPath = req.file ? '/' + req.file.filename : '';
    db.run(
        'INSERT INTO clients (id, name, phone, occupation, address, photo) VALUES (?, ?, ?, ?, ?, ?)',
        [id, name, phone, occupation, address, photoPath],
        function(err) {
            if (err) return res.json({ success: false, message: '数据库写入失败' });
            res.json({ success: true, message: '用户创建成功', photo: photoPath });
        }
    );
});

// 获取所有客户列表
router.get('/all', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    db.all('SELECT * FROM clients', (err, rows) => {
        if (err) return res.json({ success: false, message: '数据库查询失败' });
        if (!rows || rows.length === 0) {
            return res.json({ success: true, clients: [], message: '没有客户数据' });
        }
        res.json({ success: true, clients: rows });
    });
});

// 按id查询客户
router.get('/:id',(req, res)=>{
    res.setHeader('Content-Type', 'application/json');
    const id = req.params.id;
    db.get('select * from clients where id = ?',[id],(err,row)=>{
        if(err) return res.json({success:false, message: 'fail to search database'});
        if(!row) return res.json({success:false, message: 'no such client information'});
        res.json({success:true, client: row, message: 'search ok'});
    });
});

// 支持 /api/clients?id=xxx 查询参数
router.get('/', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const id = req.query.id;
    if (!id) {
        return res.json({ success: false, message: 'Missing id parameter' });
    }
    db.get('select * from clients where id = ?', [id], (err, row) => {
        if (err) return res.json({ success: false, message: 'fail to search database' });
        if (!row) return res.json({ success: false, message: 'no such client information' });
        res.json({ success: true, client: row });
    });
});



module.exports = router;
