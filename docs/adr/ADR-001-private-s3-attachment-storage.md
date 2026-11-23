# ADR-001: Private S3-Compatible Attachment Storage

## Status

Accepted

## Date

2026-11-22

## Context

Render's free web-service filesystem is ephemeral. Report attachments must remain available after restart or redeploy without weakening the existing authenticated download and role-based access controls.

## Decision

- Store attachment objects in the private Neon S3-compatible bucket.
- Use AWS SDK v3 with the configured endpoint, region, credentials, and `forcePathStyle: true`.
- Retain local disk only for Multer temporary files needed by magic-byte and OOXML validation.
- Keep downloads server-proxied through `/api/files/:id`; do not publish bucket URLs or presigned URLs.
- Preserve `files.storage_key` as the provider-neutral object key; no schema migration is required.
- Upload the object before inserting metadata and delete the object if metadata insertion fails.
- Delete the object before marking metadata deleted so an object-store failure does not create an inaccessible orphan silently.

## Alternatives Considered

- Render local filesystem: rejected because it is ephemeral on the free plan.
- Public bucket URLs: rejected because they bypass application authorization.
- Presigned downloads: deferred because they change the download contract and require expiry/revocation design.
- Storing binary data in PostgreSQL: rejected due to database growth and inefficient file serving.

## Consequences

- Deployments require private S3 environment variables and AWS SDK dependencies.
- Application bandwidth carries downloads, preserving current access checks.
- Existing local files are not migrated automatically.
- Provider failures are observable and fail closed in production.

## Rollback

Revert the provider integration and restore the filesystem adapter. The `files` schema and object keys remain compatible; objects already uploaded to Neon remain recoverable for a later migration or restore.
