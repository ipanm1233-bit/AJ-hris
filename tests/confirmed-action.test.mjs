import test from 'node:test';
import assert from 'node:assert/strict';
import { runConfirmedAction } from '../js/confirmed-action.mjs';

test('canceling a deletion confirmation never invokes its action', async () => {
  let deleted = false;
  const result = await runConfirmedAction(async () => false, 'Hapus tugas?', async () => { deleted = true; });
  assert.equal(result, false);
  assert.equal(deleted, false);
});

test('confirming a deletion waits for the action to complete', async () => {
  let deleted = false;
  const result = await runConfirmedAction(async message => {
    assert.equal(message, 'Hapus tugas?');
    return true;
  }, 'Hapus tugas?', async () => { deleted = true; });
  assert.equal(result, true);
  assert.equal(deleted, true);
});
