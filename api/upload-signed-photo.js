const express = require('express');
const multer = require('multer');
const path = require('path');
const sqlite3 = require('sqlite3');
const fs = require('fs');

const router = express.Router();

// Initialize database connection
const db = new sqlite3.Database('./db.sqlite', (err) => {
    if (err) {
        console.error('Failed to connect to database:', err.message);
    } else {
        console.log('Connected to database');
    }
});

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = 'uploads/signatures/';
        // Ensure the directory exists, create it if not
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}-${file.fieldname}${ext}`);
    }
});

const upload = multer({ storage });

// Endpoint for uploading signed photos
router.post('/', upload.single('signedPhoto'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const { loanNumber, customerId } = req.body;
    const signedPhotoPath = `/uploads/signatures/${req.file.filename}`;

    // Validate loanNumber and customerId association
    db.get(
        'SELECT * FROM loans WHERE loan_number = ? AND customer_id = ?',
        [loanNumber, customerId],
        (err, row) => {
            if (err) {
                console.error('Database error:', err.message);
                return res.status(500).json({ success: false, message: 'Database error' });
            }

            if (!row) {
                return res.status(404).json({ success: false, message: 'Loan number and customer ID do not match' });
            }

            // Update loan record with the signed photo path and mark contract as signed, then unhide repay schedule rows
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                db.run(
                    'UPDATE loans SET signed_photo = ?, contract_signed = 1 WHERE loan_number = ? AND customer_id = ?',
                    [signedPhotoPath, loanNumber, customerId],
                    (err) => {
                        if (err) console.error('Failed to update loan signed_photo/contract_signed:', err.message);
                    }
                );

                // Note: we only set loan.contract_signed here; repay visibility is controlled by loan.contract_signed in queries

                db.run('COMMIT', (cErr) => {
                    if (cErr) {
                        console.error('Failed to commit transaction for signed photo update:', cErr.message);
                        return res.status(500).json({ success: false, message: 'Failed to save signed photo to database' });
                    }
                    return res.json({
                        success: true,
                        message: 'Signed photo uploaded successfully',
                        redirectUrl: `/customer-info.html?loanNumber=${encodeURIComponent(loanNumber)}&customerId=${encodeURIComponent(customerId)}`
                    });
                });
            });
        }
    );
});

module.exports = router;