import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kioskViewport } from './driver.mjs';

test('kiosk viewport: 1080x1600 by default, the device size from KIOSK_VIEWPORT otherwise', () => {
  assert.deepEqual(kioskViewport({}), { width: 1080, height: 1600 });
  assert.deepEqual(kioskViewport({ KIOSK_VIEWPORT: '1280x800' }), { width: 1280, height: 800 });
  assert.throws(() => kioskViewport({ KIOSK_VIEWPORT: 'wide' }), /KIOSK_VIEWPORT/);
});
