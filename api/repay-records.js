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

// Run lightweight migrations on startup: ensure repay has summary columns and create repay_payments table
db.serialize(() => {
    db.all("PRAGMA table_info('repay')", (err, cols) => {
        if (err) {
            console.error('Failed to read repay table info:', err.message);
            return;
        }
        const names = (cols || []).map(c => c.name);
        const toAdd = [];
        if (!names.includes('paid_amount')) toAdd.push("ALTER TABLE repay ADD COLUMN paid_amount REAL DEFAULT 0");
        if (!names.includes('status')) toAdd.push("ALTER TABLE repay ADD COLUMN status TEXT DEFAULT 'pending'");
        if (!names.includes('paid_date')) toAdd.push("ALTER TABLE repay ADD COLUMN paid_date INTEGER");
    if (!names.includes('late_fee')) toAdd.push("ALTER TABLE repay ADD COLUMN late_fee REAL DEFAULT 0");

        toAdd.forEach(sql => {
            db.run(sql, (aerr) => {
                if (aerr) {
                    // if column already exists this will error on some SQLite versions; ignore safely
                    console.warn('Migration statement failed (ignored):', aerr.message);
                } else {
                    console.log('Migration applied:', sql);
                }
            });
        });
    });

    // create payments history table if missing
    const createPayments = `CREATE TABLE IF NOT EXISTS repay_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repay_id INTEGER,
        loan_id INTEGER,
        client_id INTEGER,
        amount REAL NOT NULL,
        paid_date INTEGER NOT NULL,
        remark TEXT,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        FOREIGN KEY (repay_id) REFERENCES repay(repay_id),
        FOREIGN KEY (loan_id) REFERENCES loans(loan_number)
    )`;
    db.run(createPayments, (perr) => {
        if (perr) console.error('Failed to ensure repay_payments table:', perr.message);
    });

    // Ensure repay_payments has late_fee column (older DBs may have table without column)
    db.all("PRAGMA table_info('repay_payments')", (pErr, pCols) => {
        if (pErr) {
            console.warn('Could not read repay_payments table info:', pErr.message);
            return;
        }
        const pNames = (pCols || []).map(c => c.name);
        if (!pNames.includes('late_fee')) {
            db.run("ALTER TABLE repay_payments ADD COLUMN late_fee REAL DEFAULT 0", (aErr) => {
                if (aErr) console.warn('Failed to add late_fee column to repay_payments (ignored):', aErr.message);
                else console.log('Migration: added late_fee column to repay_payments');
            });
        }
    });

    // Ensure loans table has contract_signed column (used to control visibility of repay schedules)
    db.all("PRAGMA table_info('loans')", (lErr, lCols) => {
        if (lErr) {
            console.warn('Could not read loans table info:', lErr.message);
            return;
        }
        const lNames = (lCols || []).map(c => c.name);
        if (!lNames.includes('contract_signed')) {
            db.run("ALTER TABLE loans ADD COLUMN contract_signed INTEGER DEFAULT 0", (aErr) => {
                if (aErr) console.warn('Failed to add contract_signed to loans (ignored):', aErr.message);
                else console.log('Migration: added contract_signed column to loans');
            });
        }
    });
});

// Endpoint to fetch repay records by client number
router.get('/', (req, res) => {
    const clientNumber = req.query.clientNumber;

    if (!clientNumber) {
        return res.status(400).json({ error: 'Client number is required' });
    }

    // assume clientNumber is the clients.id (numeric client id)
    const clientId = parseInt(clientNumber, 10);
    if (isNaN(clientId)) {
        return res.status(400).json({ error: 'Client number must be a numeric client id' });
    }
    // By default only return repay rows whose loan has contract_signed = 1
    const includeHidden = req.query.include_hidden === 'true';
    let sql = `
        SELECT r.repay_id, r.loan_id, r.client_id, r.repay_date, r.due_date, r.repay_amount, r.paid_amount, r.late_fee, r.status, r.paid_date, r.payment_method, r.receipt_no, r.remark, r.create_date
        FROM repay r
        LEFT JOIN loans l ON l.loan_number = r.loan_id
        WHERE r.client_id = ?
    `;
    if (!includeHidden) {
        sql += " AND COALESCE(l.contract_signed,0) = 1";
    }
    sql += " ORDER BY r.repay_date ASC";

    db.all(sql, [clientId], (err, rows) => {
        if (err) {
            console.error('Database query error:', err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }

        // return empty array if none found to keep frontend simple
        return res.json(rows || []);
    });
});

// Endpoint to insert a new repay record
// Keep backwards-compatible POST that inserts a raw schedule row (legacy)
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

// New endpoints for payment history and creating payment (recommended)
// GET /api/repay-records/payments?repay_id=xxx
router.get('/payments', (req, res) => {
    const repayId = parseInt(req.query.repay_id, 10) || null;
    const clientId = parseInt(req.query.client_id, 10) || null;
    const params = [];
    let sql = `SELECT * FROM repay_payments WHERE 1=1`;
    if (repayId) { sql += ' AND repay_id = ?'; params.push(repayId); }
    if (clientId) { sql += ' AND client_id = ?'; params.push(clientId); }
    sql += ' ORDER BY paid_date ASC';

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: 'Internal server error' });
        return res.json(rows || []);
    });
});

// POST /api/repay-records/payments  -- record a payment and update repay summary
router.post('/payments', (req, res) => {
    const { repay_id, loan_id, client_id, amount, paid_date, remark, late_fee, late_fee_override } = req.body;
    if (!repay_id || !loan_id || !client_id || !amount || Number(amount) <= 0) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const paidTs = paid_date ? Number(paid_date) : Math.floor(Date.now() / 1000);

    // Use a transaction: compute/apply late fee if needed, insert payment (with late_fee), recompute total, update repay summary
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // fetch repay row to decide late fee
        db.get('SELECT repay_amount, due_date, COALESCE(paid_amount,0) AS paid_amount, COALESCE(late_fee,0) AS existing_late_fee FROM repay WHERE repay_id = ?', [repay_id], (fetchErr, repayRow) => {
            if (fetchErr || !repayRow) {
                console.error('Failed to fetch repay row:', fetchErr ? fetchErr.message : 'not found');
                db.run('ROLLBACK');
                return res.status(500).json({ success: false, error: 'Repay row not found' });
            }

                const expected = Number(repayRow.repay_amount) || 0;
                const existingPaid = Number(repayRow.paid_amount) || 0;
                const remainingAmount = Math.max(expected - existingPaid, 0);
            const existingLate = Number(repayRow.existing_late_fee) || 0;
            const nowTs = Math.floor(Date.now()/1000);
            let lateFeeToApply = 0;

            // If client provided an override and provided a late_fee, honor it
            if (late_fee_override && late_fee != null) {
                lateFeeToApply = Number(late_fee) || 0;
            } else {
                // otherwise, apply flat NZ$25 if overdue and not already charged
                if ((repayRow.due_date || 0) > 0 && nowTs > Number(repayRow.due_date) && existingPaid < expected && existingLate <= 0) {
                    lateFeeToApply = 25.00;
                }
            }

            // Note: overpayment checks have been removed by request; any amount will be recorded.

            const insertSql = `INSERT INTO repay_payments (repay_id, loan_id, client_id, amount, late_fee, paid_date, remark) VALUES (?, ?, ?, ?, ?, ?, ?)`;
            db.run(insertSql, [repay_id, loan_id, client_id, amount, lateFeeToApply, paidTs, remark || null], function (insErr) {
                if (insErr) {
                    console.error('Failed to insert payment:', insErr.message);
                    db.run('ROLLBACK');
                    return res.status(500).json({ success: false, error: 'Failed to record payment' });
                }

                const paymentId = this.lastID;

                // recompute total paid for this repay_id (sum of amounts only)
                db.get('SELECT COALESCE(SUM(amount),0) AS total_paid, COALESCE(SUM(late_fee),0) AS total_late_paid FROM repay_payments WHERE repay_id = ?', [repay_id], (sumErr, sums) => {
                    if (sumErr) {
                        console.error('Failed to compute total paid:', sumErr.message);
                        db.run('ROLLBACK');
                        return res.status(500).json({ success: false, error: 'Failed to compute payment total' });
                    }
                    const totalPaid = sums ? Number(sums.total_paid) : 0;
                    const totalLatePaid = sums ? Number(sums.total_late_paid) : 0;

                    // update repay summary: paid_amount, paid_date, status, and aggregate late_fee
                    const newLateAggregate = existingLate + lateFeeToApply;
                    let status = 'pending';
                    if (totalPaid <= 0) status = 'pending';
                    else if (totalPaid >= expected) status = 'paid';
                    else status = 'partial';

                    const updSql = 'UPDATE repay SET paid_amount = ?, paid_date = ?, status = ?, late_fee = ? WHERE repay_id = ?';
                    db.run(updSql, [totalPaid, paidTs, status, newLateAggregate, repay_id], function (updErr) {
                        if (updErr) {
                            console.error('Failed to update repay summary:', updErr.message);
                            db.run('ROLLBACK');
                            return res.status(500).json({ success: false, error: 'Failed to update repay summary' });
                        }

                        // fetch updated repay row to return to client
                        db.get('SELECT * FROM repay WHERE repay_id = ?', [repay_id], (getErr, updatedRepay) => {
                            if (getErr) {
                                console.error('Failed to fetch updated repay row:', getErr.message);
                                db.run('ROLLBACK');
                                return res.status(500).json({ success: false, error: 'Failed to fetch updated repay' });
                            }

                            db.run('COMMIT');
                            return res.status(201).json({
                                success: true,
                                payment_id: paymentId,
                                repay_id,
                                total_paid: totalPaid,
                                total_late_paid: totalLatePaid,
                                late_fee_applied: lateFeeToApply,
                                late_fee_total: newLateAggregate,
                                status,
                                repay: updatedRepay
                            });
                        });
                    });
                });
            });
        });
    });
});

module.exports = router;