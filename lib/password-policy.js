'use strict';

const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_LENGTH = 128;

function strongPassword(value) {
  const password = String(value || '');
  return password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH &&
    /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}

module.exports = { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH, strongPassword };
