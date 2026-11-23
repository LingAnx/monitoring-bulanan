const assert = require('assert');
const { Readable } = require('stream');

const {
  createObjectStorage,
  validateStorageConfig,
  uploadWithCompensation,
} = require('../lib/object-storage');

const VALID_ENV = {
  STORAGE_PROVIDER: 's3',
  S3_BUCKET: 'monitoring-bulanan',
  AWS_ENDPOINT_URL_S3: 'https://storage.example.test',
  AWS_ACCESS_KEY_ID: 'test-access-key',
  AWS_SECRET_ACCESS_KEY: 'test-secret-key',
  AWS_REGION: 'ap-southeast-1',
};

function mockClient(handler) {
  return { send: handler };
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test('configuration rejects missing values without exposing credentials', () => {
  assert.throws(
    () => validateStorageConfig({ STORAGE_PROVIDER: 's3' }),
    (error) => {
      assert.strictEqual(error.code, 'STORAGE_CONFIG_ERROR');
      assert.ok(error.message.includes('S3_BUCKET'));
      assert.ok(!error.message.includes('test-secret-key'));
      return true;
    }
  );
});

test('configuration rejects a non-HTTPS storage endpoint', () => {
  assert.throws(
    () => validateStorageConfig({
      ...VALID_ENV,
      AWS_ENDPOINT_URL_S3: 'http://127.0.0.1:9000',
    }),
    (error) => error.code === 'STORAGE_CONFIG_ERROR' && error.message.includes('HTTPS')
  );
});

test('upload sends bucket, key, stream, MIME, and content length', async () => {
  let captured;
  const storage = createObjectStorage({
    env: VALID_ENV,
    client: mockClient(async (command) => {
      captured = command;
      return { ETag: 'etag-1' };
    }),
  });

  const body = Readable.from(Buffer.from('test'));
  const result = await storage.uploadObject({
    key: 'ab/file.pdf',
    body,
    contentType: 'application/pdf',
    contentLength: 4,
  });

  assert.strictEqual(captured.constructor.name, 'PutObjectCommand');
  assert.strictEqual(captured.input.Bucket, VALID_ENV.S3_BUCKET);
  assert.strictEqual(captured.input.Key, 'ab/file.pdf');
  assert.strictEqual(captured.input.Body, body);
  assert.strictEqual(captured.input.ContentType, 'application/pdf');
  assert.strictEqual(captured.input.ContentLength, 4);
  assert.strictEqual(result.etag, 'etag-1');
});

test('download returns the private object body stream and metadata', async () => {
  const body = Readable.from(Buffer.from('download'));
  const storage = createObjectStorage({
    env: VALID_ENV,
    client: mockClient(async (command) => {
      assert.strictEqual(command.constructor.name, 'GetObjectCommand');
      return { Body: body, ContentLength: 8, ContentType: 'application/pdf' };
    }),
  });

  const result = await storage.getObjectStream('ab/file.pdf');
  assert.strictEqual(result.stream, body);
  assert.strictEqual(result.contentLength, 8);
  assert.strictEqual(result.contentType, 'application/pdf');
});

test('missing download is normalized to a storage not-found error', async () => {
  const storage = createObjectStorage({
    env: VALID_ENV,
    client: mockClient(async () => {
      const error = new Error('NoSuchKey');
      error.name = 'NoSuchKey';
      error.$metadata = { httpStatusCode: 404 };
      throw error;
    }),
  });

  await assert.rejects(
    storage.getObjectStream('missing.pdf'),
    (error) => error.code === 'STORAGE_NOT_FOUND' && error.status === 404
  );
});

test('delete is idempotent when the object is already missing', async () => {
  const storage = createObjectStorage({
    env: VALID_ENV,
    client: mockClient(async (command) => {
      assert.strictEqual(command.constructor.name, 'DeleteObjectCommand');
      return {};
    }),
  });

  assert.deepStrictEqual(await storage.deleteObject('ab/file.pdf'), { deleted: true });
});

test('exists returns false for an S3 not-found response', async () => {
  const storage = createObjectStorage({
    env: VALID_ENV,
    client: mockClient(async () => {
      const error = new Error('NotFound');
      error.name = 'NotFound';
      error.$metadata = { httpStatusCode: 404 };
      throw error;
    }),
  });

  assert.strictEqual(await storage.objectExists('missing.pdf'), false);
});

test('exists propagates provider failures instead of reporting a false negative', async () => {
  const storage = createObjectStorage({
    env: VALID_ENV,
    client: mockClient(async () => {
      throw new Error('network unavailable');
    }),
  });

  await assert.rejects(
    storage.objectExists('ab/file.pdf'),
    (error) => error.code === 'STORAGE_OPERATION_ERROR' && error.status === 503
  );
});

test('metadata failure triggers uploaded-object compensation', async () => {
  const calls = [];
  const storage = {
    uploadObject: async () => { calls.push('upload'); },
    deleteObject: async () => { calls.push('delete'); },
  };
  const metadataError = new Error('metadata insert failed');

  await assert.rejects(
    uploadWithCompensation({
      storage,
      upload: { key: 'ab/file.pdf', body: Readable.from('x') },
      persistMetadata: async () => {
        calls.push('metadata');
        throw metadataError;
      },
    }),
    (error) => error === metadataError
  );
  assert.deepStrictEqual(calls, ['upload', 'metadata', 'delete']);
});

test('compensation failure is reported without hiding the metadata error', async () => {
  const metadataError = new Error('metadata insert failed');
  const cleanupError = new Error('cleanup failed');

  await assert.rejects(
    uploadWithCompensation({
      storage: {
        uploadObject: async () => {},
        deleteObject: async () => { throw cleanupError; },
      },
      upload: { key: 'ab/file.pdf', body: Readable.from('x') },
      persistMetadata: async () => { throw metadataError; },
    }),
    (error) => error === metadataError && error.cleanupError === cleanupError
  );
});

(async () => {
  let passed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      passed += 1;
      console.log(`PASS: ${name}`);
    } catch (error) {
      console.error(`FAIL: ${name}`);
      console.error(error.stack || error.message);
      process.exitCode = 1;
    }
  }
  console.log(`Object storage tests: ${passed}/${tests.length} passed`);
})();
