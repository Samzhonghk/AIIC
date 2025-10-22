const express = require('express');
const sqlite3 = require('sqlite3').verbose();

const router = express.Router();

// 使用与其他模块相同的数据库文件
const db = new sqlite3.Database('./db.sqlite', (err) => {
    if (err) throw err;
});

// 创建 loans 表
const createLoansTable = `CREATE TABLE IF NOT EXISTS loans (
    loan_number INTEGER PRIMARY KEY AUTOINCREMENT, -- 自增主键，贷款编号
    customer_id INTEGER ,                 -- 客户编号，外键关联 Clients 表
    customer_name TEXT ,                  -- 客户名字
    currency TEXT ,                       -- 货币类型，外键关联 Currency 表
    loan_amount REAL ,                    -- 贷款本金金额
    interest_rate REAL ,                  -- 贷款利率
    interest_amount REAL ,                -- 利息金额
    payment_frequency INTEGER ,           -- 还款频率
    payment_amount REAL ,                 -- 还款总金额
    term INTEGER ,                        -- 还款期数
    repay_cycle TEXT ,                    -- 还款周期
    repay_amount REAL,                            -- 单次还款金额
    created_date TEXT ,                -- 贷款签约日
    payment_due_date TEXT ,            -- 贷款结束日
    next_pay_date TEXT,                        -- 下一次还款日
    apply_status TEXT,                            -- 申请状态
    payment_status TEXT,                          -- 贷款还款状态
    last_pay_date TEXT,                    -- 最近一次还款日
    paid_amount REAL DEFAULT 0,                   -- 已还款金额，默认 0
    remain_amount REAL ,                  -- 未还款金额
    reviewed_date TEXT,                        -- 审核日
    signed_photo TEXT,                            -- 签约图片路径
    raw TEXT,                                     -- JSON 键值对
    lender_name TEXT ,                    -- 出借人
    FOREIGN KEY (customer_id) REFERENCES clients(id), -- 外键，关联 Clients 表
    FOREIGN KEY (currency) REFERENCES currency(code)  -- 外键，关联 Currency 表
)`;
db.run(createLoansTable);

// 创建 repay 表（如果不存在）
const createRepayTable = `CREATE TABLE IF NOT EXISTS repay (
    repay_id INTEGER PRIMARY KEY AUTOINCREMENT,
    loan_id INTEGER NOT NULL,
    client_id INTEGER NOT NULL,
    repay_date INTEGER NOT NULL,
    due_date INTEGER NOT NULL,
    repay_amount REAL NOT NULL,
    late_fee REAL DEFAULT 0,
    payment_method TEXT,
    receipt_no TEXT,
    remark TEXT,
    create_date INTEGER DEFAULT (strftime('%s','now')),
    FOREIGN KEY (loan_id) REFERENCES loans(loan_number),
    FOREIGN KEY (client_id) REFERENCES clients(id)
)`;
db.run(createRepayTable);

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

    // compute term and repay amount
    const frequencyDays = Number(p.paymentFrequency) || Number(p.payment_frequency) || 7;
    // paymentAmount: total payment (from front end) OR loanAmount + interest
    const totalPayment = Number(p.paymentAmount) || Number(p.payment_amount) || (Number(loanAmount) + Number(p.interestAmount || p.interest_amount || 0));
    // repayAmount: per installment (from front end) OR compute from total/term if term provided
    let repayAmount = (p.repayAmount != null) ? Number(p.repayAmount) : (p.repay_amount != null ? Number(p.repay_amount) : null);
    let term = (p.term != null) ? Number(p.term) : (p.term_number || null);

    // if repayAmount not provided but term provided, compute repayAmount
    if ((!repayAmount || repayAmount <= 0) && term && term > 0) {
        repayAmount = Math.round((totalPayment / term) * 100) / 100;
    }

    // if term not provided but repayAmount provided, compute term
    if ((!term || term <= 0) && repayAmount && repayAmount > 0) {
        term = Math.ceil(totalPayment / repayAmount);
    }

    // final validation
    if (!term || term <= 0) return res.status(400).json({ success: false, message: 'Invalid term or repayAmount' });
    if (!repayAmount || repayAmount <= 0) return res.status(400).json({ success: false, message: 'Invalid repayAmount' });

    const insertStmt = `INSERT INTO loans ( customer_id, customer_name, created_date, loan_amount, interest_rate, interest_amount, payment_frequency, payment_amount, term, repay_amount, payment_due_date, lender_name, raw)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    db.run(insertStmt, [
        customerId,
        p.customerName || p.customer_name || '',
        createdDate,
        loanAmount,
        interestRate,
        p.interestAmount || p.interest_amount || 0,
        frequencyDays,
        totalPayment,
        term,
        repayAmount,
        paymentDueDate || '',
        p.lenderName || '',
        JSON.stringify(p)
    ], function(err) {
        if (err) return res.status(500).json({ success: false, message: 'DB insert failed', error: err.message });
        const loanNumber = this.lastID; // loan_number is INTEGER AUTOINCREMENT

        // generate schedule and insert into repay table
        const schedule = [];
        const firstRepayDateStr = p.firstRepayDate || p.first_repay_date || createdDate;
        let dt = new Date(firstRepayDateStr);
        if (isNaN(dt.getTime())) dt = new Date(createdDate);
        for (let i = 0; i < term; i++) {
            const amount = (i === term - 1) ? Math.round((totalPayment - (repayAmount * (term - 1))) * 100) / 100 : repayAmount;
            const repayDateUnix = Math.floor(dt.getTime() / 1000);
            schedule.push({ loan_id: loanNumber, client_id: customerId, repay_date: repayDateUnix, due_date: repayDateUnix, repay_amount: amount, create_date: Math.floor(Date.now() / 1000) });
            dt.setDate(dt.getDate() + frequencyDays);
        }

        // insert schedule rows
        db.serialize(() => {
            const stmt2 = db.prepare(`INSERT INTO repay (loan_id, client_id, repay_date, due_date, repay_amount, create_date) VALUES (?, ?, ?, ?, ?, ?)`);
            for (const r of schedule) {
                stmt2.run([r.loan_id, r.client_id, r.repay_date, r.due_date, r.repay_amount, r.create_date]);
            }
            stmt2.finalize((err2) => {
                if (err2) {
                    // schedule insertion failed; report but loan already created
                    console.error('Failed to insert schedule', err2.message);
                    return res.status(500).json({ success: false, message: 'Loan created but failed to create repay schedule' });
                }
                return res.json({ success: true, message: 'Loan created successfully', loanNumber, repayCount: schedule.length });
            });
        });
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
