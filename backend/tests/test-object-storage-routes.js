const assert = require('assert');
const fs = require('fs');
const path = require('path');

const uploadSource = fs.readFileSync(path.join(__dirname, '..', 'routes', 'upload.js'), 'utf8');
const filesSource = fs.readFileSync(path.join(__dirname, '..', 'routes', 'files.js'), 'utf8');

const checks = [
  ['upload route uses the object-storage adapter', () => {
    assert.ok(uploadSource.includes("require('../lib/object-storage')"));
    assert.ok(uploadSource.includes('uploadWithCompensation'));
    assert.ok(uploadSource.includes('fs.createReadStream(tempPath'));
  }],
  ['upload route no longer moves validated files to permanent local storage', () => {
    assert.ok(!uploadSource.includes('fs.renameSync(tempPath, finalPath)'));
    assert.ok(!uploadSource.includes('removeFileSafely(sKey)'));
  }],
  ['download route streams from private object storage', () => {
    assert.ok(filesSource.includes("require('../lib/object-storage')"));
    assert.ok(filesSource.includes('getObjectStream(file.storage_key)'));
    assert.ok(!filesSource.includes('streamFile(file.storage_key'));
  }],
  ['download authorization executes before object retrieval', () => {
    const authorizationAt = filesSource.indexOf('canAccessFile(req.user, file)');
    const downloadAt = filesSource.indexOf('getObjectStream(file.storage_key)');
    assert.ok(authorizationAt >= 0, 'authorization check not found');
    assert.ok(downloadAt >= 0, 'object download not found');
    assert.ok(authorizationAt < downloadAt, 'object must not be fetched before authorization');
  }],
  ['delete route deletes the object before soft-deleting metadata', () => {
    const deleteObjectAt = uploadSource.indexOf('deleteObject(file.storage_key)');
    const softDeleteAt = uploadSource.indexOf('UPDATE files SET deleted_at = NOW()');
    assert.ok(deleteObjectAt >= 0, 'deleteObject call not found');
    assert.ok(softDeleteAt >= 0, 'soft-delete query not found');
    assert.ok(deleteObjectAt < softDeleteAt, 'object must be deleted before metadata soft-delete');
  }],
  ['delete authorization executes before object deletion', () => {
    const authorizationAt = uploadSource.indexOf("file.owner_user_id !== user.id && user.role !== 'SUPERADMIN'");
    const deleteObjectAt = uploadSource.indexOf('deleteObject(file.storage_key)');
    assert.ok(authorizationAt >= 0, 'delete authorization check not found');
    assert.ok(authorizationAt < deleteObjectAt, 'object must not be deleted before authorization');
  }],
  ['temporary validation files are cleaned after upload attempts', () => {
    assert.ok(uploadSource.includes('removeAbsoluteFileSafely(tempPath)'));
  }],
];

let passed = 0;
for (const [name, check] of checks) {
  try {
    check();
    passed += 1;
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    console.error(error.message);
    process.exitCode = 1;
  }
}

console.log(`Object storage route checks: ${passed}/${checks.length} passed`);
