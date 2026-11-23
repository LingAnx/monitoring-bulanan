const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} = require('@aws-sdk/client-s3');

const REQUIRED_CONFIG = [
  'S3_BUCKET',
  'AWS_ENDPOINT_URL_S3',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_REGION',
];

function storageError(code, message, status = 500, cause) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  if (cause) error.cause = cause;
  return error;
}

function validateStorageConfig(env = process.env) {
  const provider = String(env.STORAGE_PROVIDER || '').trim().toLowerCase();
  if (provider !== 's3') {
    throw storageError(
      'STORAGE_CONFIG_ERROR',
      'STORAGE_PROVIDER harus diatur ke s3'
    );
  }

  const missing = REQUIRED_CONFIG.filter((name) => !String(env[name] || '').trim());
  if (missing.length > 0) {
    throw storageError(
      'STORAGE_CONFIG_ERROR',
      `Konfigurasi Object Storage belum lengkap: ${missing.join(', ')}`
    );
  }

  let endpoint;
  try {
    endpoint = new URL(env.AWS_ENDPOINT_URL_S3);
  } catch (cause) {
    throw storageError(
      'STORAGE_CONFIG_ERROR',
      'AWS_ENDPOINT_URL_S3 harus berupa URL HTTPS yang valid',
      500,
      cause
    );
  }
  if (endpoint.protocol !== 'https:') {
    throw storageError(
      'STORAGE_CONFIG_ERROR',
      'AWS_ENDPOINT_URL_S3 harus menggunakan HTTPS'
    );
  }

  return {
    bucket: env.S3_BUCKET.trim(),
    endpoint: endpoint.toString().replace(/\/$/, ''),
    region: env.AWS_REGION.trim(),
    accessKeyId: env.AWS_ACCESS_KEY_ID.trim(),
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY.trim(),
  };
}

function isNotFound(error) {
  return Boolean(
    error &&
    (error.name === 'NoSuchKey' ||
      error.name === 'NotFound' ||
      error.Code === 'NoSuchKey' ||
      error.$metadata?.httpStatusCode === 404)
  );
}

function normalizeStorageError(error, operation) {
  if (error?.code === 'STORAGE_CONFIG_ERROR' || error?.code === 'STORAGE_NOT_FOUND') {
    return error;
  }
  if (isNotFound(error)) {
    return storageError('STORAGE_NOT_FOUND', 'Object tidak ditemukan', 404, error);
  }
  return storageError(
    'STORAGE_OPERATION_ERROR',
    `Operasi Object Storage gagal: ${operation}`,
    503,
    error
  );
}

function createObjectStorage({ env = process.env, client } = {}) {
  const config = validateStorageConfig(env);
  const s3 = client || new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  async function uploadObject({ key, body, contentType, contentLength }) {
    try {
      const result = await s3.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType || 'application/octet-stream',
        ContentLength: contentLength,
      }));
      return { etag: result.ETag || null };
    } catch (error) {
      throw normalizeStorageError(error, 'upload');
    }
  }

  async function getObjectStream(key) {
    try {
      const result = await s3.send(new GetObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }));
      if (!result.Body || typeof result.Body.pipe !== 'function') {
        throw storageError('STORAGE_OPERATION_ERROR', 'Respons download tidak memiliki stream', 503);
      }
      return {
        stream: result.Body,
        contentLength: result.ContentLength,
        contentType: result.ContentType || 'application/octet-stream',
        etag: result.ETag || null,
      };
    } catch (error) {
      throw normalizeStorageError(error, 'download');
    }
  }

  async function deleteObject(key) {
    try {
      await s3.send(new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }));
      return { deleted: true };
    } catch (error) {
      if (isNotFound(error)) return { deleted: false };
      throw normalizeStorageError(error, 'delete');
    }
  }

  async function objectExists(key) {
    try {
      await s3.send(new HeadObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }));
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw normalizeStorageError(error, 'head');
    }
  }

  return {
    uploadObject,
    getObjectStream,
    deleteObject,
    objectExists,
  };
}

async function uploadWithCompensation({ storage, upload, persistMetadata }) {
  await storage.uploadObject(upload);
  try {
    return await persistMetadata();
  } catch (error) {
    try {
      await storage.deleteObject(upload.key);
    } catch (cleanupError) {
      error.cleanupError = cleanupError;
    }
    throw error;
  }
}

let defaultStorage;
function getObjectStorage() {
  if (!defaultStorage) defaultStorage = createObjectStorage();
  return defaultStorage;
}

module.exports = {
  createObjectStorage,
  getObjectStorage,
  validateStorageConfig,
  normalizeStorageError,
  uploadWithCompensation,
};
