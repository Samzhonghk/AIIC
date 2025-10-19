const express = require('express');
const sqlite3 = require('sqlite3');

const router = express.Router();

// Initialize database connection
const db = new sqlite3.Database('./db.sqlite', (err) => {
    if (err) {
        console.error('Failed to connect to database:', err.message);
    } else {
        console.log('Connected to database');
    }
});

// Endpoint to fetch customer information
router.get('/', (req, res) => {
    const { loanNumber, customerId } = req.query;

    if (!loanNumber || !customerId) {
        return res.status(400).json({ success: false, message: 'Missing loan number or customer ID' });
    }

    db.get(
        'SELECT loan_number AS loanNumber, customer_id AS customerId, customer_name AS customerName, signed_photo AS signedPhoto FROM loans WHERE loan_number = ? AND customer_id = ?',
        [loanNumber, customerId],
        (err, row) => {
            if (err) {
                console.error('Database error:', err.message);
                return res.status(500).json({ success: false, message: 'Database error' });
            }

            if (!row) {
                return res.status(404).json({ success: false, message: 'Customer not found' });
            }

            res.json({ success: true, ...row });
        }
    );
});

module.exports = router;