---
status: frozen
title: Neon Object Storage Integration
source: internal
source_doc: user request 2026-11-22
created: 2026-11-22
updated: 2026-11-22
primary_domain: file-storage
secondary_domains: [auth-security, deployment]
---

# Neon Object Storage Integration

## Goal

Store private report attachments in Neon's S3-compatible Object Storage so files survive Render restarts and redeploys while preserving the existing authenticated API and authorization rules.

## Acceptance Criteria

1. [FROM-SOURCE] Validated uploads are stored in the configured private S3 bucket; local disk is used only for temporary validation files.
2. [INFERRED] `GET /api/files/:id` streams the object only after the existing owner/role authorization check succeeds.
3. [INFERRED] Deleting a file removes the object and soft-deletes metadata without exposing storage credentials or keys.
4. [INFERRED] If object upload succeeds but the database insert fails, the uploaded object is deleted as compensation.
5. [INFERRED] Existing magic-byte, OOXML, ZIP-bomb, size, ownership, report-status, and role checks remain effective.
6. [INFERRED] Missing or invalid S3 configuration fails clearly in production and never falls back silently to ephemeral local storage.
7. [INFERRED] Provider behavior has mocked tests for upload, download, deletion, missing objects, and configuration errors.

## Non-goals

- Public buckets or unauthenticated download URLs.
- Browser-direct uploads or presigned URLs.
- Migrating legacy files already stored on local disk.
- Changing the `files` table or API response schema.

## Constraints

- Bucket remains private.
- Credentials are environment variables only and must never be logged.
- S3 client uses the Neon endpoint, region, and path-style addressing.
- Existing filesystem helper behavior remains available for local compatibility tests.

## API Contract

The existing endpoints remain compatible:

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/upload?report_id=:id` | PEGAWAI | Validate and store one attachment |
| GET | `/api/files/:id` | Role/ownership policy | Stream a private attachment |
| GET | `/api/files/:id/metadata` | Role/ownership policy | Return safe metadata only |
| DELETE | `/api/upload/:fileId` | Owner or SUPERADMIN | Delete object and soft-delete metadata |

## Auth & Permissions

| Action | Required role | Rule |
|---|---|---|
| Upload | PEGAWAI | Own editable report when `report_id` is supplied |
| Download | Existing authenticated roles | Existing `canAccessFile` policy |
| Delete | Owner or SUPERADMIN | Existing endpoint policy |

## Testing Strategy

### Unit Tests

| Test | AC Ref | Expected |
|---|---|---|
| provider rejects incomplete configuration | AC 6 | sealed configuration error without secret values |
| upload sends private object metadata | AC 1 | `PutObjectCommand` receives bucket, key, stream, MIME, and length |
| download returns SDK body stream | AC 2 | stream is returned without public URL |
| delete tolerates missing object | AC 3 | missing key is idempotent |
| upload compensation deletes object | AC 4 | delete called after DB insert failure |

### Integration Tests

- Upload -> metadata row -> authenticated download -> delete using mocked S3 transport.
- Production UAT: upload -> download -> Render redeploy -> download again.

## Domain Decisions

- [DECISION] Use Neon S3-compatible Object Storage through AWS SDK v3 with path-style addressing.
- [DECISION] Keep the bucket private and stream downloads through authenticated Express routes.
- [DECISION] Keep temporary local files only until security validation and object upload complete.
- [TRADEOFF] Server-proxied downloads use application bandwidth but preserve the existing authorization boundary.
- [CONSTRAINT] Production must fail closed when S3 configuration is incomplete.
- [CONSTRAINT] `storage_key` remains opaque and is never returned to clients.

## File Relationship

INDEPENDENT

## Dependencies

- `@aws-sdk/client-s3`
- Neon private Object Storage bucket `monitoring-bulanan`
- Existing `files` metadata table and authentication middleware

## Open Questions

- Legacy local files require a separate migration if production data exists.
