import { test } from "node:test";
import assert from "node:assert";
import { startPrivacyMeter, getCount, subscribe, resetCount } from "../js/core/privacy-meter.js";

// Node has no PerformanceObserver, so startPrivacyMeter is a safe no-op and
// the counter stays at zero. This exercises the subscriber lifecycle instead.
test("startPrivacyMeter is a safe no-op in Node and count stays at zero", (t) => {
  startPrivacyMeter();
  assert.equal(getCount(), 0);
});

test("subscribe delivers the current count once and then updates", (t) => {
  startPrivacyMeter();
  assert.equal(getCount(), 0);

  const seen = [];
  const unsubscribe = subscribe((count) => {
    seen.push(count);
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0], 0);

  resetCount();
  assert.equal(getCount(), 0);
  assert.equal(seen[seen.length - 1], 0);

  unsubscribe();
});
