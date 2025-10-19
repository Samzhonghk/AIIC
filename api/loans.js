const express = require('express');
const sqlite3 = require('sqlite3').verbose();

const router = express.Router();

// 使用与其他模块相同的数据库文件
const db = new sqlite3.Database('./db.sqlite', (err) => {
    if (err) throw err;
});

// 创建 loans 表
const createLoansTable = `CREATE TABLE IF NOT EXISTS loans (
    loan_number TEXT PRIMARY KEY,
    customer_id TEXT,
    customer_name TEXT,
    created_date TEXT,
    loan_amount REAL,
    interest_rate REAL,
    interest_amount REAL,
    payment_frequency INTEGER,
    payment_amount REAL,
    payment_due_date TEXT,
    lender_name TEXT,
    raw TEXT
)`;
db.run(createLoansTable);

// 创建贷款记录
router.post('/', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const p = req.body || {};

    const customerId = p.customerId || p.customer_id;
    const loanAmount = p.loanAmount || p.loan_amount;
    const paymentAmount = p.paymentAmount || p.payment_amount;

    const errors = [];
    if (!customerId) errors.push('Missing customerId');
    if (loanAmount == null || isNaN(Number(loanAmount)) || Number(loanAmount) <= 0) errors.push('Invalid loanAmount');
    if (paymentAmount == null || isNaN(Number(paymentAmount)) || Number(paymentAmount) <= 0) errors.push('Invalid paymentAmount');

    const interestRate = p.interestRate || p.interest_rate;
    if (interestRate == null || isNaN(Number(interestRate)) || Number(interestRate) < 0.05 || Number(interestRate) > 1.0) {
        errors.push('Invalid interestRate (must be between 0.05 and 1.0)');
    }

    const createdDate = p.createdDate || p.created_date;
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!createdDate || !dateRegex.test(createdDate) || isNaN(new Date(createdDate).getTime())) {
        errors.push('Invalid createdDate (expected YYYY-MM-DD)');
    }

    const paymentDueDate = p.paymentDueDate || p.payment_due_date;
    if (paymentDueDate && (!dateRegex.test(paymentDueDate) || isNaN(new Date(paymentDueDate).getTime()))) {
        errors.push('Invalid paymentDueDate (expected YYYY-MM-DD)');
    }

    if (errors.length) return res.status(400).json({ success: false, message: 'Validation failed', errors });

    // Generate a unique loan_number
    // const loanNumber = `LN-${Date.now()}`;

    const stmt = `INSERT INTO loans ( customer_id, customer_name, created_date, loan_amount, interest_rate, interest_amount, payment_frequency, payment_amount, payment_due_date, lender_name, raw)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    db.run(stmt, [
        customerId,
        p.customerName || p.customer_name || '',
        createdDate,
        loanAmount,
        interestRate,
        p.interestAmount || p.interest_amount || 0,
        p.paymentFrequency || p.payment_frequency || 1,
        paymentAmount,
        paymentDueDate || '',
        p.lenderName || '',
        JSON.stringify(p)
    ], function(err) {
        if (err) return res.status(500).json({ success: false, message: 'DB insert failed' });
        return res.json({ success: true, message: 'Loan created successfully', loanNumber: this.lastID});
    });
});

// 按 loanNumber 查询
router.get('/:loanNumber', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const loanNumber = req.params.loanNumber;
    db.get('SELECT * FROM loans WHERE loan_number = ?', [loanNumber], (err, row) => {
        if (err) return res.status(500).json({ success: false, message: 'DB query failed' });
        if (!row) return res.status(404).json({ success: false, message: 'Loan not found' });
        // 尝试解析 raw 字段回原始对象
        let parsed = row.raw || null;
        try { parsed = row.raw ? JSON.parse(row.raw) : parsed; } catch (e) { /* ignore */ }
        return res.json({ success: true, loan: Object.assign({}, row, { raw: parsed }) });
    });
});

// 支持 /api/loans?loanNumber=xxx
router.get('/', (req, res) => {
    const loanNumber = req.query.loanNumber || req.query.loan_number;
    if (!loanNumber) return res.status(400).json({ success: false, message: 'Missing loanNumber' });
    db.get('SELECT * FROM loans WHERE loan_number = ?', [loanNumber], (err, row) => {
        if (err) return res.status(500).json({ success: false, message: 'DB query failed' });
        if (!row) return res.status(404).json({ success: false, message: 'Loan not found' });
        let parsed = row.raw || null;
        try { parsed = row.raw ? JSON.parse(row.raw) : parsed; } catch (e) {}
        return res.json({ success: true, loan: Object.assign({}, row, { raw: parsed }) });
    });
});

module.exports = router;
