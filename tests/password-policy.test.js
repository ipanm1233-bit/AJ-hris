'use strict';

const assert = require('assert');
const { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH, strongPassword } = require('../lib/password-policy.js');

assert.strictEqual(MIN_PASSWORD_LENGTH, 6);
assert.strictEqual(MAX_PASSWORD_LENGTH, 128);
assert.strictEqual(strongPassword('Aa1!aa'), true, 'password kompleks 6 karakter harus diterima');
assert.strictEqual(strongPassword('Aa1!a'), false, 'password 5 karakter harus ditolak');
assert.strictEqual(strongPassword('abcdef'), false, 'huruf kecil saja harus ditolak');
assert.strictEqual(strongPassword('ABCDEF'), false, 'huruf besar saja harus ditolak');
assert.strictEqual(strongPassword('Abcdef'), false, 'password tanpa angka dan simbol harus ditolak');
assert.strictEqual(strongPassword('Abc1de'), false, 'password tanpa simbol harus ditolak');
assert.strictEqual(strongPassword('Ab!cde'), false, 'password tanpa angka harus ditolak');
assert.strictEqual(strongPassword(`Aa1!${'a'.repeat(125)}`), false, 'password di atas 128 karakter harus ditolak');

console.log('Password policy tests passed.');
