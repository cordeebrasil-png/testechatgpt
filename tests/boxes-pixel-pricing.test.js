import { test } from 'node:test';
import assert from 'node:assert/strict';
import { receipt, publicOrder } from '../functions/_lib/orders.js';

test('order API preserves selected plan and complete conversion amount', () => {
  for (const [plan, base] of [['bronze', 4970], ['prata', 7990], ['ouro', 9990]]) {
    const saved = receipt({ plan, shipping: 'jadlog', upgrade: 'premium' }, { customer: {} });
    const order = publicOrder({ receipt_json: JSON.stringify(saved), state: 'pending' });
    assert.equal(order.amount, base + 990 + 1990);
    assert.equal(order.pricing.plan.id, plan);
  }
});
