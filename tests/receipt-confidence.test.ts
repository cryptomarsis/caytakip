import test from 'node:test';
import assert from 'node:assert/strict';
import { assessReceiptConfidence } from '../src/services/receiptConfidence.ts';

test('receipt confidence is full when required fields exist', () => {
  assert.deepEqual(assessReceiptConfidence({ date: '2026-08-20', company: 'EFOR', netWeightKg: 531.4 }), { confidence: 100, warnings: [] });
});

test('receipt confidence warns about missing fields', () => {
  const result = assessReceiptConfidence({ date: '', company: 'EFOR' });
  assert.equal(result.confidence, 33);
  assert.match(result.warnings[0], /Net ağırlık/);
});
