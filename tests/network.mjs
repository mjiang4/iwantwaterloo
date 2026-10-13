import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clientNetwork } from '../lib/network.ts';

const from = (ip) =>
  clientNetwork(
    new Request('https://example.test/', {
      headers: ip ? { 'cf-connecting-ip': ip } : {},
    }),
  );

void test('abuse limits group IPv6 by /64 and keep IPv4 addresses whole', () => {
  assert.equal(from('203.0.113.7'), '203.0.113.7');
  assert.equal(from(null), null);
  assert.equal(from('::ffff:203.0.113.7'), '203.0.113.7');
  // One host's /64: every address in it shares a single budget.
  const net = from('2001:db8:85a3:42:1111:2222:3333:4444');
  assert.equal(net, '2001:db8:85a3:42::/64');
  assert.equal(from('2001:0db8:85a3:0042:ffff::1'), net);
  assert.equal(from('2001:db8:85a3:42::'), net);
  // Compressed forms expand before the prefix is taken.
  assert.equal(from('2001:db8::1'), '2001:db8:0:0::/64');
  assert.equal(from('::1'), '0:0:0:0::/64');
  assert.notEqual(from('2001:db8:85a3:43::1'), net);
});
