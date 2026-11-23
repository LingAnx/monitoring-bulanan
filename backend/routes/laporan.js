const express = require('express');
const router = express.Router();

const pool = require('../db/database');

const {
  authenticateToken,
  requireRole
} = require('../middleware/auth');
const { logger } = require('../middleware/logger');


/* =========================================================
   CONSTANTS
========================================================= */

const READ_ROLES = [
  'PEGAWAI',
  'ADMIN_SEKSI',
  'KEPALA_KANTOR',
  'SUPERADMIN'
];

const VALID_STATUSES = [
  'draft',
  'diajukan',
  'diteruskan',
  'revisi_admin',
  'revisi_kantor',
  'disetujui'
];

const EDITABLE_STATUSES = [
  'draft',
  'revisi_admin',
  'revisi_kantor'
];

const SUBMITTABLE_STATUSES = [
  'draft',
  'revisi_admin',
  'revisi_kantor'
];


/* =========================================================
   HELPERS
========================================================= */

function parseId(value) {
  const id = Number.parseInt(value, 10);

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return id;
}


function parseInteger(
  value,
  fallback,
  {
    min,
    max
  } = {}
) {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  if (
    min !== undefined &&
    parsed < min
  ) {
    return fallback;
  }

  if (
    max !== undefined &&
    parsed > max
  ) {
    return fallback;
  }

  return parsed;
}


function normalizeLampiran(value) {
  // Format baru (pusat): array objek { id, downloadUrl } dari routes/files.js.
  // Format lama (kompatibilitas frontend pre-Tahap-4): array string URL.
  // Setiap elemen diverifikasi — elemen tak valid DIHAPUS, bukan membuat
  // seluruh field jadi null (sebelumnya satu URL beracun merombak semua).
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === '') {
    return null;
  }

  let arr;
  if (Array.isArray(value)) {
    arr = value;
  } else if (typeof value === 'string') {
    // Compatibility jika frontend lama mengirim JSON string.
    try {
      const parsed = JSON.parse(value);
      arr = Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  } else {
    return null;
  }

  if (arr === null) return null;

  // Validasi bentuk elemen: string URL atau objek { id, downloadUrl }.
  const safe = [];
  for (const item of arr) {
    if (typeof item === 'string') {
      const s = String(item).trim();
      if (!s) continue;
      // URL lama /uploads/<nama> DITOLAK (endpoint static sudah tidak ada
      // di server; hanya bentuk /api/files/<uuid> yang sah).
      if (s.startsWith('/api/files/')) {
        safe.push({ downloadUrl: s });
      }
      // String lain (path filesystem lama) diabaikan.
    } else if (item && typeof item === 'object') {
      const obj = {};
      if (typeof item.id === 'string' && /^[0-9a-fA-F-]{36}$/.test(item.id)) {
        obj.id = item.id;
      }
      if (typeof item.downloadUrl === 'string' && /^\/api\/files\//.test(item.downloadUrl)) {
        obj.downloadUrl = item.downloadUrl;
      }
      // Simpan hanya bagian yang sah; lewati objek kosong.
      if (Object.keys(obj).length > 0) safe.push(obj);
    }
    // Elemen tak valid (number, null, dst.) diabaikan.
  }
  return safe.length > 0 ? safe : null;
}


function jsonParam(value) {
  if (value === undefined) {
    return null;
  }

  if (value === null) {
    return null;
  }

  return JSON.stringify(value);
}

function validateBasicReportInput({
  judul,
  bulan,
  tahun
}) {
  if (
    !judul ||
    !String(judul).trim()
  ) {
    return 'Judul wajib diisi';
  }

  const parsedMonth =
    Number.parseInt(bulan, 10);

  if (
    !Number.isInteger(parsedMonth) ||
    parsedMonth < 1 ||
    parsedMonth > 12
  ) {
    return 'Bulan tidak valid';
  }

  const parsedYear =
    Number.parseInt(tahun, 10);

  if (
    !Number.isInteger(parsedYear) ||
    parsedYear < 2000 ||
    parsedYear > 2100
  ) {
    return 'Tahun tidak valid';
  }

  return null;
}
/**
 * Mengecek apakah user boleh membaca laporan.
 *
 * PEGAWAI
 * → hanya laporan sendiri
 *
 * ADMIN_SEKSI
 * → hanya seksi sendiri
 *
 * KEPALA_KANTOR
 * → seluruh kantor
 *
 * SUPERADMIN
 * → seluruh data untuk monitoring
 */
function canReadReport(report, user) {
  if (!report || !user) {
    return false;
  }

  if (user.role === 'PEGAWAI') {
    return (
      Number(report.id_user) ===
      Number(user.id)
    );
  }

  if (user.role === 'ADMIN_SEKSI') {
    return (
      Number(report.id_seksi) ===
      Number(user.id_seksi)
    );
  }

  if (
    user.role === 'KEPALA_KANTOR' ||
    user.role === 'SUPERADMIN'
  ) {
    return true;
  }

  return false;
}


/**
 * Mengambil laporan sekaligus data pemilik/seksi.
 *
 * lock = true
 * digunakan di transaction untuk menghindari
 * perubahan status secara bersamaan.
 */
async function getReportWithOwner(
  db,
  id,
  {
    lock = false
  } = {}
) {
  const lockClause =
    lock
      ? ' FOR UPDATE OF l'
      : '';

  const result = await db.query(
    `
    SELECT
      l.*,

      u.nama AS user_nama,
      u.username,
      u.nip,
      u.id_seksi,

      s.nama_seksi

    FROM laporan l

    JOIN users u
      ON u.id = l.id_user

    LEFT JOIN seksi s
      ON s.id = u.id_seksi

    WHERE l.id = $1
    ${lockClause}
    `,
    [id]
  );

  return result.rows[0] || null;
}


async function insertAudit(
  db,
  idLaporan,
  idUser,
  action,
  detail
) {
  await db.query(
    `
    INSERT INTO audit_trail (
      id_laporan,
      id_user,
      action,
      detail
    )
    VALUES ($1, $2, $3, $4)
    `,
    [
      idLaporan,
      idUser,
      action,
      detail
    ]
  );
}


async function notifyUser(
  db,
  idUser,
  title,
  message,
  type = 'info'
) {
  await db.query(
    `
    INSERT INTO notifications (
      id_user,
      title,
      message,
      type
    )
    VALUES ($1, $2, $3, $4)
    `,
    [
      idUser,
      title,
      message,
      type
    ]
  );
}


/**
 * Kirim notifikasi ke seluruh ADMIN_SEKSI
 * yang berada di seksi pegawai.
 *
 * PENTING:
 * notifications.id_user berisi USERS.ID,
 * bukan ID seksi.
 */
async function notifyAdminsInSection(
  db,
  sectionId,
  title,
  message,
  type = 'info'
) {
  if (!sectionId) {
    return;
  }

  await db.query(
    `
    INSERT INTO notifications (
      id_user,
      title,
      message,
      type
    )

    SELECT
      u.id,
      $2,
      $3,
      $4

    FROM users u

    WHERE
      u.role = 'ADMIN_SEKSI'
      AND u.id_seksi = $1
      AND COALESCE(u.is_active, true) = true
    `,
    [
      sectionId,
      title,
      message,
      type
    ]
  );
}


/**
 * Kirim notifikasi laporan yang telah diverifikasi
 * kepada Kepala Kantor.
 */
async function notifyHeads(
  db,
  title,
  message,
  type = 'info'
) {
  await db.query(
    `
    INSERT INTO notifications (
      id_user,
      title,
      message,
      type
    )

    SELECT
      u.id,
      $1,
      $2,
      $3

    FROM users u

    WHERE
      u.role = 'KEPALA_KANTOR'
      AND COALESCE(u.is_active, true) = true
    `,
    [
      title,
      message,
      type
    ]
  );
}


/* =========================================================
   GET /api/laporan
   LIST LAPORAN
========================================================= */

router.get(
  '/',
  authenticateToken,
  requireRole(...READ_ROLES),

  async (req, res) => {
    try {
      const page = parseInteger(
        req.query.page,
        1,
        {
          min: 1
        }
      );

      const limit = parseInteger(
        req.query.limit,
        50,
        {
          min: 1,
          max: 100
        }
      );

      const bulan =
        req.query.bulan
          ? parseInteger(
              req.query.bulan,
              null,
              {
                min: 1,
                max: 12
              }
            )
          : null;

      const tahun =
        req.query.tahun
          ? parseInteger(
              req.query.tahun,
              null,
              {
                min: 2000,
                max: 2100
              }
            )
          : null;

      const status =
        req.query.status
          ? String(req.query.status).trim()
          : '';

      const search =
        req.query.search
          ? String(req.query.search).trim()
          : '';


      if (
        req.query.bulan &&
        bulan === null
      ) {
        return res.status(400).json({
          success: false,
          message: 'Bulan tidak valid'
        });
      }


      if (
        req.query.tahun &&
        tahun === null
      ) {
        return res.status(400).json({
          success: false,
          message: 'Tahun tidak valid'
        });
      }


      if (
        status &&
        !VALID_STATUSES.includes(status)
      ) {
        return res.status(400).json({
          success: false,
          message: 'Status tidak valid'
        });
      }


      const params = [];
      const conditions = [];


      /*
       * DATA ISOLATION
       */

      if (req.user.role === 'PEGAWAI') {

        params.push(req.user.id);

        conditions.push(
          `l.id_user = $${params.length}`
        );

      } else if (
        req.user.role === 'ADMIN_SEKSI'
      ) {

        params.push(req.user.id_seksi);

        conditions.push(
          `u.id_seksi = $${params.length}`
        );
      }


      /*
       * FILTER BULAN
       */

      if (bulan !== null) {

        params.push(bulan);

        conditions.push(
          `l.bulan = $${params.length}`
        );
      }


      /*
       * FILTER TAHUN
       */

      if (tahun !== null) {

        params.push(tahun);

        conditions.push(
          `l.tahun = $${params.length}`
        );
      }


      /*
       * FILTER STATUS
       */

      if (status) {

        params.push(status);

        conditions.push(
          `l.status = $${params.length}`
        );
      }


      /*
       * SEARCH
       */

      if (search) {

        params.push(`%${search}%`);

        const searchParam =
          `$${params.length}`;

        conditions.push(`
          (
            l.judul ILIKE ${searchParam}
            OR u.nama ILIKE ${searchParam}
            OR COALESCE(u.nip, '') ILIKE ${searchParam}
          )
        `);
      }


      const whereClause =
        conditions.length
          ? `WHERE ${conditions.join(' AND ')}`
          : '';


      const fromClause = `
        FROM laporan l

        JOIN users u
          ON u.id = l.id_user

        LEFT JOIN seksi s
          ON s.id = u.id_seksi
      `;


      /*
       * COUNT
       */

      const countResult =
        await pool.query(
          `
          SELECT
            COUNT(*)::int AS total

          ${fromClause}

          ${whereClause}
          `,
          params
        );


      const total =
        countResult.rows[0]?.total || 0;

      const offset =
        (page - 1) * limit;


      /*
       * DATA
       */

      const dataParams = [
        ...params,
        limit,
        offset
      ];


      const result =
        await pool.query(
          `
          SELECT
            l.*,

            u.nama AS user_nama,
            u.username,
            u.nip,
            u.id_seksi,

            s.nama_seksi

          ${fromClause}

          ${whereClause}

          ORDER BY
            l.created_at DESC

          LIMIT $${params.length + 1}
          OFFSET $${params.length + 2}
          `,
          dataParams
        );


      return res.json({
        success: true,

        data: result.rows,

        pagination: {
          page,
          limit,
          total,

          totalPages:
            Math.ceil(total / limit)
        }
      });

    } catch (error) {

      logger.error('Error fetching laporan', { error: error.message });

      return res.status(500).json({
        success: false,
        message: 'Gagal memuat laporan'
      });
    }
  }
);


/* =========================================================
   GET /api/laporan/stats
========================================================= */

router.get(
  '/stats',
  authenticateToken,
  requireRole(...READ_ROLES),

  async (req, res) => {
    try {
      const stats = {};


      /*
       * PEGAWAI
       */

      if (req.user.role === 'PEGAWAI') {

        const result =
          await pool.query(
            `
            SELECT

              COUNT(*)::int AS total,

              COUNT(*)
                FILTER (
                  WHERE status = 'draft'
                )::int AS draft,

              COUNT(*)
                FILTER (
                  WHERE status IN (
                    'diajukan',
                    'diteruskan'
                  )
                )::int AS submitted,

              COUNT(*)
                FILTER (
                  WHERE status = 'disetujui'
                )::int AS approved,

              COUNT(*)
                FILTER (
                  WHERE status IN (
                    'revisi_admin',
                    'revisi_kantor'
                  )
                )::int AS revision

            FROM laporan

            WHERE id_user = $1
            `,
            [
              req.user.id
            ]
          );


        Object.assign(
          stats,
          result.rows[0]
        );
      }


      /*
       * ADMIN SEKSI
       */

      else if (
        req.user.role === 'ADMIN_SEKSI'
      ) {

        const result =
          await pool.query(
            `
            SELECT

              COUNT(*)::int AS total,

              COUNT(*)
                FILTER (
                  WHERE l.status = 'diajukan'
                )::int AS pending,

              COUNT(*)
                FILTER (
                  WHERE l.status = 'diteruskan'
                )::int AS verified,

              COUNT(*)
                FILTER (
                  WHERE l.status = 'revisi_admin'
                )::int AS rejected,

              COUNT(*)
                FILTER (
                  WHERE l.status = 'disetujui'
                )::int AS approved

            FROM laporan l

            JOIN users u
              ON u.id = l.id_user

            WHERE
              u.id_seksi = $1
            `,
            [
              req.user.id_seksi
            ]
          );


        Object.assign(
          stats,
          result.rows[0]
        );


        const sectionResult =
          await pool.query(
            `
            SELECT
              id,
              nama_seksi

            FROM seksi

            WHERE id = $1
            `,
            [
              req.user.id_seksi
            ]
          );


        stats.bySeksi =
          sectionResult.rows;
      }


      /*
       * KEPALA KANTOR / SUPERADMIN
       */

      else {

        const result =
          await pool.query(
            `
            SELECT

              COUNT(
                DISTINCT u.id
              )::int
                AS total_pegawai,

              COUNT(
                l.id
              )::int
                AS total_laporan,

              COUNT(l.id)
                FILTER (
                  WHERE l.status = 'diajukan'
                )::int
                AS pending_verification,

              COUNT(l.id)
                FILTER (
                  WHERE l.status = 'diteruskan'
                )::int
                AS pending,

              COUNT(l.id)
                FILTER (
                  WHERE l.status = 'disetujui'
                )::int
                AS approved,

              COUNT(l.id)
                FILTER (
                  WHERE l.status IN (
                    'revisi_admin',
                    'revisi_kantor'
                  )
                )::int
                AS rejected

            FROM users u

            LEFT JOIN laporan l
              ON l.id_user = u.id

            WHERE
              u.role = 'PEGAWAI'
            `
          );


        const row =
          result.rows[0];


        stats.total =
          row.total_pegawai;

        stats.totalLaporan =
          row.total_laporan;

        stats.pendingVerification =
          row.pending_verification;

        stats.pending =
          row.pending;

        stats.approved =
          row.approved;

        stats.rejected =
          row.rejected;


        const bySeksi =
          await pool.query(
            `
            SELECT

              s.id,
              s.nama_seksi,

              COUNT(
                DISTINCT u.id
              )::int
                AS total_pegawai,

              COUNT(
                DISTINCT l.id
              )::int
                AS total_laporan

            FROM seksi s

            LEFT JOIN users u
              ON
                u.id_seksi = s.id
                AND u.role = 'PEGAWAI'

            LEFT JOIN laporan l
              ON l.id_user = u.id

            GROUP BY
              s.id,
              s.nama_seksi

            ORDER BY
              s.id
            `
          );


        stats.bySeksi =
          bySeksi.rows;
      }


      return res.json({
        success: true,
        data: stats
      });

    } catch (error) {

      logger.error('Error fetching stats', { error: error.message });

      return res.status(500).json({
        success: false,
        message: 'Gagal memuat statistik'
      });
    }
  }
);


/* =========================================================
   POST /api/laporan
   CREATE REPORT

   HANYA PEGAWAI
========================================================= */

router.post(
  '/',
  authenticateToken,
  requireRole('PEGAWAI'),

  async (req, res) => {
    const client =
      await pool.connect();

    try {
      const {
        judul,
        bulan,
        tahun,
        isi_kegiatan,
        capaian,
        kendala,
        tindak_lanjut,
        rencana_bulan_depan
      } = req.body;


      const validationError =
        validateBasicReportInput({
          judul,
          bulan,
          tahun
        });


      if (validationError) {

        return res.status(400).json({
          success: false,
          message: validationError
        });
      }


      const parsedMonth =
        Number.parseInt(
          bulan,
          10
        );

      const parsedYear =
        Number.parseInt(
          tahun,
          10
        );

      const lampiran =
        normalizeLampiran(
          req.body.lampiran
        );


      await client.query('BEGIN');

      /*
       * Cegah laporan periode yang sama
       * dibuat dua kali oleh pegawai.
       */

      const duplicate =
        await client.query(
          `
          SELECT id, id_user, bulan, tahun, status

          FROM laporan

          WHERE
            id_user = $1
            AND bulan = $2
            AND tahun = $3

          LIMIT 1
          `,
          [
            req.user.id,
            parsedMonth,
            parsedYear
          ]
        );

      if (duplicate.rows.length) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          success: false,
          message:
            'Laporan untuk periode tersebut sudah tersedia'
        });
      }


      const result =
        await client.query(
          `
          INSERT INTO laporan (

            id_user,

            judul,
            bulan,
            tahun,

            isi_kegiatan,
            capaian,
            kendala,
            tindak_lanjut,
            rencana_bulan_depan,

            lampiran,

            status
          )

          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10::jsonb,
            'draft'
          )

          RETURNING *
          `,
          [
            req.user.id,

            String(judul).trim(),

            parsedMonth,
            parsedYear,

            isi_kegiatan || null,
            capaian || null,
            kendala || null,
            tindak_lanjut || null,
            rencana_bulan_depan || null,

            jsonParam(
              lampiran === undefined
                ? null
                : lampiran
            )
          ]
        );


      const laporan =
        result.rows[0];


      await insertAudit(
        client,
        laporan.id,
        req.user.id,
        'create',
        'Laporan dibuat sebagai draft'
      );


      await client.query(
        'COMMIT'
      );


      return res.status(201).json({
        success: true,
        data: laporan
      });

    } catch (error) {

      try {
        await client.query(
          'ROLLBACK'
        );
      } catch (rollbackErr) {
        logger.error('Rollback gagal — laporan.create', {
          requestId: req.requestId,
          error: (rollbackErr && rollbackErr.message) ? String(rollbackErr.message).slice(0, 200) : 'unknown',
        });
      }


      logger.error('Error creating laporan', { error: error.message });


      return res.status(500).json({
        success: false,
        message: 'Gagal membuat laporan'
      });

    } finally {

      client.release();
    }
  }
);


/* =========================================================
   PUT /api/laporan/:id
   UPDATE REPORT

   HANYA PEGAWAI
========================================================= */

router.put(
  '/:id',
  authenticateToken,
  requireRole('PEGAWAI'),

  async (req, res) => {
    const client =
      await pool.connect();

    try {
      const id =
        parseId(req.params.id);


      if (!id) {

        return res.status(400).json({
          success: false,
          message: 'ID laporan tidak valid'
        });
      }


      const {
        judul,
        bulan,
        tahun,
        isi_kegiatan,
        capaian,
        kendala,
        tindak_lanjut,
        rencana_bulan_depan
      } = req.body;


      const validationError =
        validateBasicReportInput({
          judul,
          bulan,
          tahun
        });


      if (validationError) {

        return res.status(400).json({
          success: false,
          message: validationError
        });
      }


      const parsedMonth =
        Number.parseInt(
          bulan,
          10
        );

      const parsedYear =
        Number.parseInt(
          tahun,
          10
        );


      const lampiran =
        normalizeLampiran(
          req.body.lampiran
        );


      await client.query(
        'BEGIN'
      );


      const laporan =
        await getReportWithOwner(
          client,
          id,
          {
            lock: true
          }
        );


      if (!laporan) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(404).json({
          success: false,
          message: 'Laporan tidak ditemukan'
        });
      }


      /*
       * Hanya pemilik laporan.
       */

      if (
        Number(laporan.id_user) !==
        Number(req.user.id)
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(403).json({
          success: false,
          message: 'Akses ditolak'
        });
      }


      /*
       * Tidak boleh edit ketika sedang diproses.
       */

      if (
        !EDITABLE_STATUSES.includes(
          laporan.status
        )
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          success: false,

          message:
            'Laporan hanya dapat diedit saat berstatus draft atau revisi'
        });
      }


      /*
       * Cegah perubahan periode menyebabkan duplicate.
       */

      const duplicate =
        await client.query(
          `
          SELECT id

          FROM laporan

          WHERE
            id_user = $1
            AND bulan = $2
            AND tahun = $3
            AND id <> $4

          LIMIT 1
          `,
          [
            req.user.id,
            parsedMonth,
            parsedYear,
            id
          ]
        );


      if (duplicate.rows.length) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          success: false,

          message:
            'Laporan untuk periode tersebut sudah tersedia'
        });
      }


      /*
       * Jika frontend tidak mengirim lampiran,
       * pertahankan lampiran lama.
       */

      const finalLampiran =
        lampiran === undefined
          ? laporan.lampiran
          : lampiran;


      const updateResult =
        await client.query(
          `
          UPDATE laporan

          SET
            judul = $1,
            bulan = $2,
            tahun = $3,

            isi_kegiatan = $4,
            capaian = $5,
            kendala = $6,
            tindak_lanjut = $7,
            rencana_bulan_depan = $8,

            lampiran = $9::jsonb,

            updated_at =
              CURRENT_TIMESTAMP

          WHERE
            id = $10

          RETURNING *
          `,
          [
            String(judul).trim(),

            parsedMonth,
            parsedYear,

            isi_kegiatan || null,
            capaian || null,
            kendala || null,
            tindak_lanjut || null,
            rencana_bulan_depan || null,

            jsonParam(
              finalLampiran
            ),

            id
          ]
        );


      await insertAudit(
        client,
        id,
        req.user.id,
        'update',

        laporan.status === 'draft'
          ? 'Draft laporan diperbarui'
          : 'Laporan diperbarui setelah permintaan revisi'
      );


      await client.query(
        'COMMIT'
      );


      return res.json({
        success: true,
        data: updateResult.rows[0]
      });

    } catch (error) {

      try {
        await client.query(
          'ROLLBACK'
        );
      } catch (rollbackErr) {
        logger.error('Rollback gagal — laporan.update', {
          requestId: req.requestId,
          error: (rollbackErr && rollbackErr.message) ? String(rollbackErr.message).slice(0, 200) : 'unknown',
        });
      }


      logger.error('Error updating laporan', { error: error.message });


      return res.status(500).json({
        success: false,
        message: 'Gagal memperbarui laporan'
      });

    } finally {

      client.release();
    }
  }
);


/* =========================================================
   POST /api/laporan/:id/submit

   draft
   revisi_admin
   revisi_kantor

   ↓

   diajukan
========================================================= */

router.post(
  '/:id/submit',
  authenticateToken,
  requireRole('PEGAWAI'),

  async (req, res) => {
    const client =
      await pool.connect();

    try {
      const id =
        parseId(req.params.id);


      if (!id) {

        return res.status(400).json({
          success: false,
          message: 'ID laporan tidak valid'
        });
      }


      await client.query(
        'BEGIN'
      );


      const laporan =
        await getReportWithOwner(
          client,
          id,
          {
            lock: true
          }
        );


      if (!laporan) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(404).json({
          success: false,
          message: 'Laporan tidak ditemukan'
        });
      }


      /*
       * Hanya pemilik.
       */

      if (
        Number(laporan.id_user) !==
        Number(req.user.id)
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(403).json({
          success: false,
          message: 'Akses ditolak'
        });
      }


      /*
       * Bisa submit pertama kali
       * atau submit ulang setelah revisi.
       */

      if (
        !SUBMITTABLE_STATUSES.includes(
          laporan.status
        )
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          success: false,

          message:
            'Laporan tidak dapat diajukan pada status saat ini'
        });
      }

      /*
       * Period enforcement: block submit if period is closed.
       * Only allow submit for active periods.
       */
      const periodCheck = await client.query(
        `SELECT status FROM periode_laporan WHERE bulan = $1 AND tahun = $2`,
        [laporan.bulan, laporan.tahun]
      );
      if (periodCheck.rows.length > 0 && periodCheck.rows[0].status === 'ditutup') {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: 'Periode laporan untuk bulan/tahun tersebut sudah ditutup'
        });
      }

      const previousStatus =
        laporan.status;


      /*
       * Submit ulang selalu kembali ke Admin Seksi.
       */

      const updateResult =
        await client.query(
          `
          UPDATE laporan

          SET
            status = 'diajukan',

            tanggal_pengajuan =
              CURRENT_TIMESTAMP,

            tanggal_verifikasi = NULL,
            tanggal_persetujuan = NULL,

            catatan_admin = NULL,
            catatan_kantor = NULL,

            updated_at =
              CURRENT_TIMESTAMP

          WHERE
            id = $1

          RETURNING *
          `,
          [
            id
          ]
        );


      await insertAudit(
        client,
        id,
        req.user.id,
        'submit',

        previousStatus === 'draft'
          ? 'Laporan diajukan untuk verifikasi Admin Seksi'
          : 'Laporan diajukan ulang setelah revisi'
      );


      /*
       * NOTIFIKASI ADMIN SEKSI
       */

      await notifyAdminsInSection(
        client,

        laporan.id_seksi,

        previousStatus === 'draft'
          ? 'Laporan Baru Diajukan'
          : 'Laporan Revisi Diajukan Ulang',

        `"${laporan.judul}" telah diajukan oleh ${laporan.user_nama}.`,

        'info'
      );


      await client.query(
        'COMMIT'
      );


      return res.json({
        success: true,
        data: updateResult.rows[0]
      });

    } catch (error) {

      try {
        await client.query(
          'ROLLBACK'
        );
      } catch (rollbackErr) {
        logger.error('Rollback gagal — laporan.submit', {
          requestId: req.requestId,
          error: (rollbackErr && rollbackErr.message) ? String(rollbackErr.message).slice(0, 200) : 'unknown',
        });
      }


      logger.error('Error submitting laporan', { error: error.message });


      return res.status(500).json({
        success: false,
        message: 'Gagal mengajukan laporan'
      });

    } finally {

      client.release();
    }
  }
);


/* =========================================================
   POST /api/laporan/:id/verify

   ADMIN_SEKSI

   diajukan
      ↓
   diteruskan

   ATAU

   revisi_admin
========================================================= */

router.post(
  '/:id/verify',
  authenticateToken,
  requireRole('ADMIN_SEKSI'),

  async (req, res) => {
    const client =
      await pool.connect();

    try {
      const id =
        parseId(req.params.id);


      if (!id) {

        return res.status(400).json({
          success: false,
          message: 'ID laporan tidak valid'
        });
      }


      const {
        status,
        catatan
      } = req.body;


      /*
       * Frontend mengirim:
       *
       * diverifikasi
       * revisi_admin
       */

      if (
        ![
          'diverifikasi',
          'revisi_admin'
        ].includes(status)
      ) {

        return res.status(400).json({
          success: false,
          message: 'Status verifikasi tidak valid'
        });
      }


      const cleanNote =
        String(
          catatan || ''
        ).trim();


      if (
        status === 'revisi_admin' &&
        !cleanNote
      ) {

        return res.status(400).json({
          success: false,

          message:
            'Catatan revisi wajib diisi'
        });
      }


      await client.query(
        'BEGIN'
      );


      const laporan =
        await getReportWithOwner(
          client,
          id,
          {
            lock: true
          }
        );


      if (!laporan) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(404).json({
          success: false,
          message: 'Laporan tidak ditemukan'
        });
      }


      /*
       * DATA ISOLATION
       *
       * Admin hanya boleh memproses
       * laporan seksi sendiri.
       */

      if (
        Number(laporan.id_seksi) !==
        Number(req.user.id_seksi)
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(403).json({
          success: false,

          message:
            'Laporan berasal dari seksi lain'
        });
      }


      /*
       * Admin hanya boleh memverifikasi
       * laporan yang sedang diajukan.
       */

      if (
        laporan.status !== 'diajukan'
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          success: false,

          message:
            'Hanya laporan berstatus diajukan yang dapat diverifikasi'
        });
      }


      const newStatus =
        status === 'diverifikasi'
          ? 'diteruskan'
          : 'revisi_admin';


      const updateResult =
        await client.query(
          `
          UPDATE laporan

          SET
            status = $1,

            catatan_admin = $2,

            tanggal_verifikasi =
              CURRENT_TIMESTAMP,

            tanggal_persetujuan = NULL,

            updated_at =
              CURRENT_TIMESTAMP

          WHERE id = $3

          RETURNING *
          `,
          [
            newStatus,
            cleanNote || null,
            id
          ]
        );


      /*
       * HISTORY VERIFIKASI
       */

      await client.query(
        `
        INSERT INTO verifikasi (
          id_laporan,
          id_admin_seksi,
          status,
          catatan
        )

        VALUES (
          $1,
          $2,
          $3,
          $4
        )
        `,
        [
          id,
          req.user.id,
          status,
          cleanNote || null
        ]
      );


      /*
       * AUDIT
       */

      await insertAudit(
        client,
        id,
        req.user.id,
        'verify',

        status === 'diverifikasi'

          ? 'Laporan diverifikasi dan diteruskan ke Kepala Kantor'

          : (
              'Laporan diminta revisi oleh Admin Seksi' +
              (
                cleanNote
                  ? `: ${cleanNote}`
                  : ''
              )
            )
      );


      /*
       * NOTIFIKASI PEGAWAI
       */

      await notifyUser(
        client,

        laporan.id_user,

        'Status Laporan Diperbarui',

        status === 'diverifikasi'

          ? `"${laporan.judul}" telah diverifikasi oleh Admin Seksi dan diteruskan ke Kepala Kantor.`

          : `"${laporan.judul}" diminta revisi oleh Admin Seksi.`,

        status === 'diverifikasi'
          ? 'success'
          : 'warning'
      );


      /*
       * Jika diverifikasi,
       * notif Kepala Kantor.
       */

      if (
        status === 'diverifikasi'
      ) {

        await notifyHeads(
          client,

          'Laporan Menunggu Persetujuan',

          `"${laporan.judul}" dari ${laporan.user_nama} (${laporan.nama_seksi || '-'}) menunggu persetujuan.`,

          'info'
        );
      }


      await client.query(
        'COMMIT'
      );


      return res.json({
        success: true,
        data: updateResult.rows[0]
      });

    } catch (error) {

      try {
        await client.query(
          'ROLLBACK'
        );
      } catch (rollbackErr) {
        logger.error('Rollback gagal — laporan.verify', {
          requestId: req.requestId,
          error: (rollbackErr && rollbackErr.message) ? String(rollbackErr.message).slice(0, 200) : 'unknown',
        });
      }


      logger.error('Error verifying laporan', { error: error.message });


      return res.status(500).json({
        success: false,
        message: 'Gagal memverifikasi laporan'
      });

    } finally {

      client.release();
    }
  }
);


/* =========================================================
   POST /api/laporan/:id/approve

   KEPALA_KANTOR

   diteruskan
      ↓
   disetujui

   ATAU

   revisi_kantor
========================================================= */

router.post(
  '/:id/approve',
  authenticateToken,
  requireRole('KEPALA_KANTOR'),

  async (req, res) => {
    const client =
      await pool.connect();

    try {
      const id =
        parseId(req.params.id);


      if (!id) {

        return res.status(400).json({
          success: false,
          message: 'ID laporan tidak valid'
        });
      }


      const {
        status,
        catatan
      } = req.body;


      if (
        ![
          'disetujui',
          'revisi_kantor'
        ].includes(status)
      ) {

        return res.status(400).json({
          success: false,

          message:
            'Status persetujuan tidak valid'
        });
      }


      const cleanNote =
        String(
          catatan || ''
        ).trim();


      if (
        status === 'revisi_kantor' &&
        !cleanNote
      ) {

        return res.status(400).json({
          success: false,

          message:
            'Catatan revisi wajib diisi'
        });
      }


      await client.query(
        'BEGIN'
      );


      const laporan =
        await getReportWithOwner(
          client,
          id,
          {
            lock: true
          }
        );


      if (!laporan) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(404).json({
          success: false,
          message: 'Laporan tidak ditemukan'
        });
      }


      /*
       * Kepala hanya boleh memproses
       * laporan yang sudah diverifikasi Admin.
       */

      if (
        laporan.status !== 'diteruskan'
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          success: false,

          message:
            'Hanya laporan yang sudah diverifikasi Admin Seksi yang dapat diproses'
        });
      }


      const updateResult =
        await client.query(
          `
          UPDATE laporan

          SET
            status = $1,

            catatan_kantor = $2,

            tanggal_persetujuan =
              CASE
                WHEN $1::varchar = 'disetujui'
                  THEN CURRENT_TIMESTAMP
                ELSE NULL
              END,  

            updated_at =
              CURRENT_TIMESTAMP

          WHERE id = $3

          RETURNING *
          `,
          [
            status,
            cleanNote || null,
            id
          ]
        );


      /*
       * HISTORY PERSETUJUAN
       */

      await client.query(
        `
        INSERT INTO persetujuan (
          id_laporan,
          id_kepala,
          status,
          catatan
        )

        VALUES (
          $1,
          $2,
          $3,
          $4
        )
        `,
        [
          id,
          req.user.id,
          status,
          cleanNote || null
        ]
      );


      /*
       * AUDIT
       */

      await insertAudit(
        client,
        id,
        req.user.id,

        status === 'disetujui'
          ? 'approve'
          : 'request_revision',

        status === 'disetujui'

          ? 'Laporan disetujui oleh Kepala Kantor'

          : (
              'Laporan diminta revisi oleh Kepala Kantor' +
              (
                cleanNote
                  ? `: ${cleanNote}`
                  : ''
              )
            )
      );


      /*
       * NOTIFIKASI PEGAWAI
       */

      await notifyUser(
        client,

        laporan.id_user,

        'Status Laporan Diperbarui',

        status === 'disetujui'

          ? `"${laporan.judul}" telah disetujui oleh Kepala Kantor.`

          : `"${laporan.judul}" diminta revisi oleh Kepala Kantor.`,

        status === 'disetujui'
          ? 'success'
          : 'warning'
      );


      await client.query(
        'COMMIT'
      );


      return res.json({
        success: true,
        data: updateResult.rows[0]
      });

    } catch (error) {

      try {
        await client.query(
          'ROLLBACK'
        );
      } catch (rollbackErr) {
        logger.error('Rollback gagal — laporan.approve', {
          requestId: req.requestId,
          error: (rollbackErr && rollbackErr.message) ? String(rollbackErr.message).slice(0, 200) : 'unknown',
        });
      }


      logger.error('Error approving laporan', { error: error.message });


      return res.status(500).json({
        success: false,

        message:
          'Gagal memproses persetujuan'
      });

    } finally {

      client.release();
    }
  }
);


/* =========================================================
   GET /api/laporan/:id/audit
========================================================= */

router.get(
  '/:id/audit',
  authenticateToken,
  requireRole(...READ_ROLES),

  async (req, res) => {
    try {
      const id =
        parseId(req.params.id);


      if (!id) {

        return res.status(400).json({
          success: false,
          message: 'ID laporan tidak valid'
        });
      }


      const laporan =
        await getReportWithOwner(
          pool,
          id
        );


      if (!laporan) {

        return res.status(404).json({
          success: false,
          message: 'Laporan tidak ditemukan'
        });
      }


      /*
       * DATA ISOLATION
       */

      if (
        !canReadReport(
          laporan,
          req.user
        )
      ) {

        return res.status(403).json({
          success: false,
          message: 'Akses ditolak'
        });
      }


      const result =
        await pool.query(
          `
          SELECT

            a.*,

            u.nama
              AS user_nama,

            u.username

          FROM audit_trail a

          LEFT JOIN users u
            ON u.id = a.id_user

          WHERE
            a.id_laporan = $1

          ORDER BY
            a.created_at DESC
          `,
          [
            id
          ]
        );


      return res.json({
        success: true,
        data: result.rows
      });

    } catch (error) {

      logger.error('Error fetching audit', { error: error.message });


      return res.status(500).json({
        success: false,
        message: 'Gagal memuat audit trail'
      });
    }
  }
);


/* =========================================================
   GET /api/laporan/:id/verifikasi-history
========================================================= */

router.get(
  '/:id/verifikasi-history',
  authenticateToken,
  requireRole(...READ_ROLES),

  async (req, res) => {
    try {
      const id =
        parseId(req.params.id);


      if (!id) {

        return res.status(400).json({
          success: false,
          message: 'ID laporan tidak valid'
        });
      }


      const laporan =
        await getReportWithOwner(
          pool,
          id
        );


      if (!laporan) {

        return res.status(404).json({
          success: false,
          message: 'Laporan tidak ditemukan'
        });
      }


      if (
        !canReadReport(
          laporan,
          req.user
        )
      ) {

        return res.status(403).json({
          success: false,
          message: 'Akses ditolak'
        });
      }


      const result =
        await pool.query(
          `
          SELECT

            v.*,

            u.nama
              AS admin_nama

          FROM verifikasi v

          JOIN users u
            ON
              u.id =
              v.id_admin_seksi

          WHERE
            v.id_laporan = $1

          ORDER BY
            v.created_at ASC
          `,
          [
            id
          ]
        );


      return res.json({
        success: true,
        data: result.rows
      });

    } catch (error) {

      logger.error('Error fetching verifikasi history', { error: error.message });


      return res.status(500).json({
        success: false,

        message:
          'Gagal memuat riwayat verifikasi'
      });
    }
  }
);


/* =========================================================
   GET /api/laporan/:id
   DETAIL LAPORAN
========================================================= */

router.get(
  '/:id',
  authenticateToken,
  requireRole(...READ_ROLES),

  async (req, res) => {
    try {
      const id =
        parseId(req.params.id);


      if (!id) {

        return res.status(400).json({
          success: false,
          message: 'ID laporan tidak valid'
        });
      }


      const laporan =
        await getReportWithOwner(
          pool,
          id
        );


      if (!laporan) {

        return res.status(404).json({
          success: false,
          message: 'Laporan tidak ditemukan'
        });
      }


      /*
       * DATA ISOLATION
       */

      if (
        !canReadReport(
          laporan,
          req.user
        )
      ) {

        return res.status(403).json({
          success: false,
          message: 'Akses ditolak'
        });
      }


      return res.json({
        success: true,
        data: laporan
      });

    } catch (error) {

      logger.error('Error fetching laporan', { error: error.message });


      return res.status(500).json({
        success: false,
        message: 'Gagal memuat laporan'
      });
    }
  }
);


/* =========================================================
   DELETE /api/laporan/:id

   HANYA PEGAWAI
   HANYA DRAFT
========================================================= */

router.delete(
  '/:id',
  authenticateToken,
  requireRole('PEGAWAI'),

  async (req, res) => {
    const client =
      await pool.connect();

    try {
      const id =
        parseId(req.params.id);


      if (!id) {

        return res.status(400).json({
          success: false,
          message: 'ID laporan tidak valid'
        });
      }


      await client.query(
        'BEGIN'
      );


      const laporan =
        await getReportWithOwner(
          client,
          id,
          {
            lock: true
          }
        );


      if (!laporan) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(404).json({
          success: false,
          message: 'Laporan tidak ditemukan'
        });
      }


      /*
       * Hanya pemilik.
       */

      if (
        Number(laporan.id_user) !==
        Number(req.user.id)
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(403).json({
          success: false,
          message: 'Akses ditolak'
        });
      }


      /*
       * Hanya draft yang bisa dihapus.
       */

      if (
        laporan.status !== 'draft'
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          success: false,

          message:
            'Hanya laporan berstatus draft yang dapat dihapus'
        });
      }


      /*
       * Hapus laporan.
       *
       * Audit yang terhubung laporan akan ikut terhapus
       * karena schema menggunakan ON DELETE CASCADE.
       *
       * Simpan audit penghapusan tanpa id_laporan
       * agar histori tindakan tetap ada.
       */

      await insertAudit(
        client,
        null,
        req.user.id,
        'delete',

        `Laporan ID ${laporan.id} "${laporan.judul}" dihapus`
      );


      await client.query(
        `
        DELETE FROM laporan
        WHERE id = $1
        `,
        [
          id
        ]
      );


      await client.query(
        'COMMIT'
      );


      return res.json({
        success: true,

        message:
          'Draft laporan berhasil dihapus'
      });

    } catch (error) {

      try {
        await client.query(
          'ROLLBACK'
        );
      } catch (rollbackErr) {
        logger.error('Rollback gagal — laporan.delete', {
          requestId: req.requestId,
          error: (rollbackErr && rollbackErr.message) ? String(rollbackErr.message).slice(0, 200) : 'unknown',
        });
      }


      logger.error('Error deleting laporan', { error: error.message });


      return res.status(500).json({
        success: false,
        message: 'Gagal menghapus laporan'
      });

    } finally {

      client.release();
    }
  }
);


module.exports = router;