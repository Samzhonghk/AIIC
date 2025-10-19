const express = require('express');
const sqlite3 = require('sqlite3');
const path = require('path');

const router = express.Router();

// open database (same file used elsewhere)
const dbPath = path.join(__dirname, '..', 'db.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('records.js: failed to open database', err.message);
    } else {
        console.log('records.js: connected to database');
    }
});

router.get('/:id', (req, res) => {
    const clientId = req.params.id;
    console.log('GET /api/records/:id hit, id=', clientId);

    const sql = `SELECT loan_number, loan_amount, interest_amount, created_date, payment_due_date, lender_name FROM loans WHERE customer_id = ?`;
    db.all(sql, [clientId], (err, rows) => {
        if (err) {
            console.error('records.js: DB error', err.message);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        if (!rows || rows.length === 0) {
            return res.status(404).json({ success: false, message: 'No records found for this client ID' });
        }

        res.json({ success: true, records: rows });
    });
});

module.exports = router;
