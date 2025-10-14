const request = require('supertest');
const assert = require('assert');

// 注意：测试会连接到项目运行的服务器 http://localhost:3000
const base = 'http://localhost:3000';

describe('Loans API', function() {
    it('should return 400 when missing required fields', async function() {
        const res = await request(base)
            .post('/api/loans')
            .send({});
        assert.strictEqual(res.status, 400);
        assert.strictEqual(res.body.success, false);
        // Accept either a detailed errors array or at least a message string
        assert.ok((res.body.errors && res.body.errors.length > 0) || (res.body.message && typeof res.body.message === 'string'));
    });

    it('should create and retrieve a loan successfully', async function() {
        const payload = {
            loanNumber: 'TEST100',
            customerId: '1001',
            customerName: 'Sam',
            createdDate: '2025-10-12',
            loanAmount: 500,
            interestRate: 0.2,
            interestAmount: 100,
            paymentFrequency: 1,
            paymentAmount: 100,
            paymentDueDate: '2026-01-01',
            lenderName: 'TestLender'
        };

        const post = await request(base).post('/api/loans').send(payload);
        assert.strictEqual(post.status, 200);
        assert.strictEqual(post.body.success, true);
        assert.strictEqual(post.body.loanNumber, payload.loanNumber);

        const get = await request(base).get(`/api/loans/${encodeURIComponent(payload.loanNumber)}`);
        assert.strictEqual(get.status, 200);
        assert.strictEqual(get.body.success, true);
        assert.strictEqual(get.body.loan.loan_number, payload.loanNumber);
    });

    it('should reject negative loanAmount', async function() {
        const payload = { loanNumber: 'TEST_NEG', customerId: '1001', loanAmount: -100, paymentAmount: 50, interestRate: 0.1, createdDate: '2025-10-12' };
        const res = await request(base).post('/api/loans').send(payload);
        assert.strictEqual(res.status, 400);
        assert.strictEqual(res.body.success, false);
    });

    it('should return 409 on duplicate loanNumber unless forceReplace', async function() {
        const payload = { loanNumber: 'DUP100', customerId: '1001', loanAmount: 200, paymentAmount: 50, interestRate: 0.1, createdDate: '2025-10-12' };
        const r1 = await request(base).post('/api/loans').send(payload);
        assert.strictEqual(r1.status, 200);
        // second insert without forceReplace should 409
        const r2 = await request(base).post('/api/loans').send(payload);
        assert.strictEqual(r2.status, 409);
        // with forceReplace should succeed
        const r3 = await request(base).post('/api/loans').send(Object.assign({}, payload, { forceReplace: true }));
        assert.strictEqual(r3.status, 200);
    });
});
