
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../server.js';
import { db } from '../../db/database.js';

const JWT_SECRET = 'test-secret-key-do-not-use-in-production';
const merchantId = 'qa-einvoice-merchant';
const token = jwt.sign(
  { id: merchantId, email: 'qa-invoice@test.com', type: 'merchant' },
  JWT_SECRET
);

const headers = { Authorization: `Bearer ${token}` };
const invoiceId = 'qa-invoice-test';

before(() => {
  db.users = db.users.filter(u => u.id !== merchantId);
  db.invoices = (db.invoices || []).filter(
    invoice => invoice.id !== invoiceId
  );

  db.users.push({
    id: merchantId,
    email: 'qa-invoice@test.com',
    type: 'merchant'
  });

  db.invoices.push({
    id: invoiceId,
    merchant_id: merchantId,
    invoice_number: 'INV-QA-001',
    amount: 100,
    currency: 'EUR',
    status: 'draft'
  });
});

after(() => {
  db.users = db.users.filter(u => u.id !== merchantId);
  db.invoices = (db.invoices || []).filter(
    invoice => invoice.id !== invoiceId
  );
});

test('requires authentication to submit an invoice', async () => {
  const response = await request(app)
    .post('/api/einvoice/submit')
    .send({
      invoice_id: invoiceId,
      customer_siret: '12345678901234'
    });

  assert.equal(response.status, 401);
});

test('rejects a submission without invoice_id', async () => {
  const response = await request(app)
    .post('/api/einvoice/submit')
    .set(headers)
    .send({ customer_siret: '12345678901234' });

  assert.equal(response.status, 400);
});

test('rejects a missing or invalid SIRET', async () => {
  const response = await request(app)
    .post('/api/einvoice/submit')
    .set(headers)
    .send({
      invoice_id: invoiceId,
      customer_siret: '12345'
    });

  assert.equal(response.status, 400);
});

test('submits an invoice with a valid 14-character SIRET', async () => {
  const response = await request(app)
    .post('/api/einvoice/submit')
    .set(headers)
    .send({
      invoice_id: invoiceId,
      customer_siret: '12345678901234'
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.invoice_id, invoiceId);
  assert.equal(response.body.data.status, 'submitted');
  assert.ok(response.body.data.submission_id);
});

test('rejects a duplicate invoice submission', async () => {
  const response = await request(app)
    .post('/api/einvoice/submit')
    .set(headers)
    .send({
      invoice_id: invoiceId,
      customer_siret: '12345678901234'
    });

  assert.equal(response.status, 409);
});

test('returns the invoice submission status', async () => {
  const response = await request(app)
    .get(`/api/einvoice/status/${invoiceId}`)
    .set(headers);

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.invoice_id, invoiceId);
  assert.equal(response.body.data.einvoice_status, 'submitted');
});

test('returns 404 for an unknown invoice status request', async () => {
  const response = await request(app)
    .get('/api/einvoice/status/nonexistent-invoice')
    .set(headers);

  assert.equal(response.status, 404);
});

test('prevents a different merchant from submitting an existing invoice', async () => {
  const otherMerchantId = 'qa-other-merchant';
  db.users.push({
    id: otherMerchantId,
    email: 'other-merchant@test.com',
    type: 'merchant'
  });

  const otherToken = jwt.sign(
    {
      id: otherMerchantId,
      email: 'other-merchant@test.com',
      type: 'merchant'
    },
    JWT_SECRET
  );

  try {
    const response = await request(app)
      .post('/api/einvoice/submit')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        invoice_id: invoiceId,
        customer_siret: '12345678901234'
      });

    assert.equal(response.status, 403);
  } finally {
    db.users = db.users.filter(u => u.id !== otherMerchantId);
  }
});

test('processes an e-invoice authority webhook', async () => {
  const webhookInvoiceId = 'qa-invoice-webhook';

  db.invoices.push({
    id: webhookInvoiceId,
    merchant_id: merchantId,
    invoice_number: 'INV-QA-WEBHOOK',
    amount: 100,
    currency: 'EUR',
    status: 'draft'
  });

  try {
    const response = await request(app)
      .post('/api/webhooks/e-invoice')
      .send({
        invoice_id: webhookInvoiceId,
        status: 'accepted',
        submission_id: 'SUB-QA-001',
        tax_authority_id: 'TAX-QA-001'
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.status, 'accepted');

    const invoice = db.invoices.find(
      item => item.id === webhookInvoiceId
    );

    assert.equal(invoice.einvoice_status, 'accepted');
    assert.equal(invoice.einvoice_submission_id, 'SUB-QA-001');
  } finally {
    db.invoices = db.invoices.filter(
      invoice => invoice.id !== webhookInvoiceId
    );
  }
});

test('returns 404 for an e-invoice webhook referencing an unknown invoice', async () => {
  const response = await request(app)
    .post('/api/webhooks/e-invoice')
    .send({
      invoice_id: 'unknown-webhook-invoice',
      status: 'accepted'
    });

  assert.equal(response.status, 404);
});
