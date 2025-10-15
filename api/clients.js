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
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    phone TEXT,
    occupation TEXT,
    address TEXT,
    photo TEXT,
    passport_number TEXT,
    driver_license_number TEXT,
    owner_of_vehicle_number TEXT,
    business_license_number TEXT,
    vehicle_number_plate TEXT
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

// 修改数据库表结构，逐个添加字段

// const alterTableSql = 'ALTER TABLE clients ADD COLUMN driver_license_number TEXT';
// db.run(alterTableSql,(err)=>{
//     if(err){
//         console.error(`Failed to execute: ${alterTableSql}`, err.message);
//     }else{
//         console.log(`Executed: ${alterTableSql}`);
//     }
// });



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
    const { name, phone, occupation, address, passport_number, driver_license_number, owner_of_vehicle_number, business_license_number, vehicle_number_plate } = req.body;
    const photoPath = req.file ? '/' + req.file.filename : '';
    db.run(
        'INSERT INTO clients (name, phone, occupation, address, photo, passport_number, driver_license_number, owner_of_vehicle_number, business_license_number, vehicle_number_plate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', // Removed explicit insertion of `id` in the SQL query
        [name, phone, occupation, address, photoPath, passport_number, driver_license_number, owner_of_vehicle_number, business_license_number, vehicle_number_plate],
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

// 更新客户信息
router.put('/:id', upload.single('photo'), (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const id = req.params.id;
    const { name, phone, occupation, address, passport_number, driver_license_number, owner_of_vehicle_number, business_license_number, vehicle_number_plate } = req.body;
    const photoPath = req.file ? '/' + req.file.filename : null;

    const updateFields = [];
    const updateValues = [];

    if (name) { updateFields.push('name = ?'); updateValues.push(name); }
    if (phone) { updateFields.push('phone = ?'); updateValues.push(phone); }
    if (occupation) { updateFields.push('occupation = ?'); updateValues.push(occupation); }
    if (address) { updateFields.push('address = ?'); updateValues.push(address); }
    if (passport_number) { updateFields.push('passport_number = ?'); updateValues.push(passport_number); }
    if (driver_license_number) { updateFields.push('driver_license_number = ?'); updateValues.push(driver_license_number); }
    if (owner_of_vehicle_number) { updateFields.push('owner_of_vehicle_number = ?'); updateValues.push(owner_of_vehicle_number); }
    if (business_license_number) { updateFields.push('business_license_number = ?'); updateValues.push(business_license_number); }
    if (vehicle_number_plate) { updateFields.push('vehicle_number_plate = ?'); updateValues.push(vehicle_number_plate); }
    if (photoPath) { updateFields.push('photo = ?'); updateValues.push(photoPath); }

    if (updateFields.length === 0) {
        return res.json({ success: false, message: 'No fields to update' });
    }

    updateValues.push(id);
    const sql = `UPDATE clients SET ${updateFields.join(', ')} WHERE id = ?`;

    db.run(sql, updateValues, function(err) {
        if (err) return res.json({ success: false, message: 'Failed to update client information' });
        res.json({ success: true, message: 'Client information updated successfully' });
    });
});

// Endpoint to get the next available client ID
router.get('/next-id', (req, res) => {
    db.get('SELECT MAX(id) AS maxId FROM clients', (err, row) => {
        if (err) {
            return res.json({ success: false, message: 'Failed to fetch next client ID' });
        }
        const nextId = (row && row.maxId) ? row.maxId + 1 : 1;
        res.json({ success: true, nextId });
    });
});



module.exports = router;
