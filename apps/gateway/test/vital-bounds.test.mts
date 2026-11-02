import assert from 'node:assert/strict';
import test from 'node:test';
import { isAcceptedWebVital, MAX_TIMING_VITAL_MS } from '../src/vital-bounds.ts';

test('drops timing vitals above 60s and keeps the boundary', () => {
  assert.equal(isAcceptedWebVital('LCP', 765743916), false);
  assert.equal(isAcceptedWebVital('FCP', MAX_TIMING_VITAL_MS + 1), false);
  assert.equal(isAcceptedWebVital('INP', MAX_TIMING_VITAL_MS + 1), false);
  assert.equal(isAcceptedWebVital('TTFB', MAX_TIMING_VITAL_MS + 1), false);
  assert.equal(isAcceptedWebVital('LCP', MAX_TIMING_VITAL_MS), true);
  assert.equal(isAcceptedWebVital('LCP', 2500), true);
});

test('does not cap CLS', () => {
  assert.equal(isAcceptedWebVital('CLS', 765743916), true);
  assert.equal(isAcceptedWebVital('CLS', 0.04), true);
});
