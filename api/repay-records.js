const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Connect to SQLite database using an absolute path relative to this file
const dbPath = path.join(__dirname, '..', 'db.sqlite');
console.log('repay-records: opening database at', dbPath);
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
    } else {
        console.log('Connected to the SQLite database at', dbPath);
    }
});

// Endpoint to fetch repay records by client number
router.get('/', (req, res) => {
    const clientNumber = req.query.clientNumber;

    if (!clientNumber) {
        return res.status(400).json({ error: 'Client number is required' });
    }

    const query = `
        SELECT r.repay_id, r.loan_id, r.client_id, r.repay_date, r.due_date, r.repay_amount, r.late_fee, r.payment_method, r.receipt_no, r.remark, r.create_date
        FROM repay r
        JOIN clients c ON r.client_id = c.id
        WHERE c.client_number = ?
    `;

    db.all(query, [clientNumber], (err, rows) => {
        if (err) {
            console.error('Database query error:', err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }

        if (rows.length === 0) {
            return res.status(404).json({ message: 'No repay records found for the provided client number' });
        }

        res.json(rows);
    });
});

// Endpoint to insert a new repay record
router.post('/', (req, res) => {
    const { loan_id, client_id, repay_date, due_date, repay_amount, late_fee, payment_method, receipt_no, remark } = req.body;

    if (!loan_id || !client_id || !repay_date || !due_date || !repay_amount) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const query = `
        INSERT INTO repay (loan_id, client_id, repay_date, due_date, repay_amount, late_fee, payment_method, receipt_no, remark)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [loan_id, client_id, repay_date, due_date, repay_amount, late_fee || 0, payment_method || null, receipt_no || null, remark || null];

    db.run(query, params, function (err) {
        if (err) {
            console.error('Database insert error:', err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }

        res.status(201).json({ message: 'Repay record created successfully', repay_id: this.lastID });
    });
});

module.exports = router;