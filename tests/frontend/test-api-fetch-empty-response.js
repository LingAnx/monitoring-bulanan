#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync(path.resolve(__dirname, '..', '..', 'app.js'), 'utf8');
let jsonCalled = false;

const context = {
  AbortController,
  clearTimeout,
  confirm: () => false,
  console,
  document: {
    addEventListener: () => {},
    querySelector: () => null,
  },
  fetch: async () => ({
    status: 204,
    ok: true,
    headers: { get: () => null },
    json: async () => {
      jsonCalled = true;
      throw new Error('204 response must not be parsed as JSON');
    },
  }),
  setTimeout,
  window: {
    addEventListener: () => {},
    location: { href: '' },
  },
};

vm.createContext(context);
vm.runInContext(source, context);

context.apiFetch('/api/probe', { method: 'DELETE' }).then(result => {
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(result)),
    { success: true, status: 204 }
  );
  assert.strictEqual(jsonCalled, false, 'res.json() tidak boleh dipanggil untuk HTTP 204');
  console.log('PASS: HTTP 204 diperlakukan sebagai sukses tanpa parsing JSON');
}).catch(error => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
