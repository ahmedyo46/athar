const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const Database = require("better-sqlite3");
const rateLimit = require("express-rate-limit");
const multer = require("multer");

const app = express();

const PORT = Number(process.env.PORT) || 8080;
const ROOT = __dirname;

const DATA_DIR = path.join(ROOT, "data");
const UPLOADS_DIR = path.join(ROOT, "uploads");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

/* =========================
   DATABASE
========================= */

const db = new Database(
  path.join(DATA_DIR, "athar.db")
);

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS memorials (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  death_date TEXT,
  image_url TEXT,
  short_bio TEXT,
  visitor_message TEXT,
  status TEXT NOT NULL DEFAULT 'Pending',
  created_at TEXT NOT NULL,
  approved_at TEXT,
  prayer_count INTEGER NOT NULL DEFAULT 0,
  audio_id INTEGER
);

CREATE TABLE IF NOT EXISTS prayers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  memorial_id TEXT NOT NULL,
  visitor_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(memorial_id, visitor_key)
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  memorial_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'Open',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audio_library (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  audio_url TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memorial_status
ON memorials(status);

CREATE INDEX IF NOT EXISTS idx_memorial_name
ON memorials(display_name);

CREATE INDEX IF NOT EXISTS idx_memorial_date
ON memorials(death_date);

CREATE INDEX IF NOT EXISTS idx_reports_status
ON reports(status);

CREATE INDEX IF NOT EXISTS idx_prayers_memorial
ON prayers(memorial_id);
`);

/* =========================
   ADMIN
========================= */

const ADMIN_USER =
  process.env.ADMIN_USER || "admin";

const ADMIN_PASS =
  process.env.ADMIN_PASS || "change-this-password";

app.set("trust proxy", 1);

/* =========================
   MIDDLEWARE
========================= */

app.use(
  express.json({
    limit: "1mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "1mb"
  })
);

/* =========================
   RATE LIMIT
========================= */

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 90,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || "unknown"
});

app.use("/api", apiLimiter);

/* =========================
   UPLOAD STORAGE
========================= */

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },

  filename: (_req, file, cb) => {
    const ext =
      path.extname(file.originalname || "")
        .toLowerCase();

    cb(
      null,
      crypto.randomUUID() + ext
    );
  }
});

/* =========================
   IMAGE UPLOAD
========================= */

const imageUpload = multer({
  storage,

  limits: {
    fileSize: 8 * 1024 * 1024
  },

  fileFilter: (_req, file, cb) => {
    const allowed = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/avif"
    ]);

    if (!allowed.has(file.mimetype)) {
      return cb(
        new Error("نوع الصورة غير مدعوم")
      );
    }

    cb(null, true);
  }
});

/* =========================
   AUDIO UPLOAD
========================= */

const audioUpload = multer({
  storage,

  limits: {
    fileSize: 25 * 1024 * 1024
  },

  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "audio/mpeg") {
      return cb(
        new Error("يجب رفع ملف MP3 فقط")
      );
    }

    cb(null, true);
  }
});

/* =========================
   HELPERS
========================= */

function now() {
  return new Date().toISOString();
}

function fileFromUrl(url) {
  if (!url || typeof url !== "string") {
    return null;
  }

  if (!url.startsWith("/uploads/")) {
    return null;
  }

  const filename =
    path.basename(url);

  return path.join(
    UPLOADS_DIR,
    filename
  );
}

function deleteUploadedFile(url) {
  const file = fileFromUrl(url);

  if (!file) {
    return;
  }

  try {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  } catch (err) {
    console.error(
      "Failed to delete uploaded file:",
      err
    );
  }
}

function getAudio(audioId) {
  if (!audioId) {
    return null;
  }

  return (
    db
      .prepare(`
        SELECT
          id,
          title,
          audio_url
        FROM audio_library
        WHERE id = ?
          AND active = 1
      `)
      .get(audioId) || null
  );
}

function safeMemorial(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    display_name: row.display_name,
    death_date: row.death_date,
    image_url: row.image_url,
    short_bio: row.short_bio,
    visitor_message: row.visitor_message,
    prayer_count: Number(row.prayer_count || 0),
    created_at: row.created_at,
    audio: getAudio(row.audio_id)
  };
}

function getApprovedMemorial(id) {
  if (!id) {
    return null;
  }

  return db
    .prepare(`
      SELECT *
      FROM memorials
      WHERE id = ?
        AND status = 'Approved'
    `)
    .get(id);
}

/* =========================
   PUBLIC FILES
========================= */

app.get("/", (_req, res) => {
  res.sendFile(
    path.join(ROOT, "index.html")
  );
});

app.get("/index.html", (_req, res) => {
  res.sendFile(
    path.join(ROOT, "index.html")
  );
});

app.get("/admin", (_req, res) => {
  res.sendFile(
    path.join(ROOT, "admin.html")
  );
});

app.get("/admin/", (_req, res) => {
  res.sendFile(
    path.join(ROOT, "admin.html")
  );
});

app.get("/admin.html", (_req, res) => {
  res.sendFile(
    path.join(ROOT, "admin.html")
  );
});

app.get(
  "/memorial/:id",
  (_req, res) => {
    res.sendFile(
      path.join(ROOT, "index.html")
    );
  }
);

app.use(
  express.static(ROOT, {
    index: false,
    maxAge: "1h"
  })
);

app.use(
  "/uploads",
  express.static(UPLOADS_DIR, {
    maxAge: "1h"
  })
);

/* =========================
   PUBLIC API
========================= */

app.get(
  "/api/home",
  (_req, res) => {
    try {
      const daily =
        db
          .prepare(`
            SELECT *
            FROM memorials
            WHERE status = 'Approved'
            ORDER BY RANDOM()
            LIMIT 1
          `)
          .get();

      const latest =
        db
          .prepare(`
            SELECT *
            FROM memorials
            WHERE status = 'Approved'
            ORDER BY approved_at DESC
            LIMIT 4
          `)
          .all();

      res.json({
        daily: safeMemorial(daily),
        latest: latest.map(safeMemorial)
      });
    } catch (err) {
      console.error(err);

      res.status(500).json({
        error: "تعذر تحميل الصفحة الرئيسية"
      });
    }
  }
);

app.get(
  "/api/memorials",
  (req, res) => {
    try {
      const q =
        String(req.query.q || "").trim();

      const page = Math.max(
        1,
        Number(req.query.page) || 1
      );

      const limit = Math.min(
        24,
        Math.max(
          1,
          Number(req.query.limit) || 12
        )
      );

      const offset =
        (page - 1) * limit;

      let rows;

      if (q) {
        rows =
          db
            .prepare(`
              SELECT *
              FROM memorials
              WHERE status = 'Approved'
                AND display_name LIKE ?
              ORDER BY approved_at DESC
              LIMIT ? OFFSET ?
            `)
            .all(
              `%${q}%`,
              limit,
              offset
            );
      } else {
        rows =
          db
            .prepare(`
              SELECT *
              FROM memorials
              WHERE status = 'Approved'
              ORDER BY approved_at DESC
              LIMIT ? OFFSET ?
            `)
            .all(
              limit,
              offset
            );
      }

      res.json({
        items: rows.map(safeMemorial),
        page,
        limit
      });
    } catch (err) {
      console.error(err);

      res.status(500).json({
        error: "تعذر تحميل التذكارات"
      });
    }
  }
);

app.get(
  "/api/memorials/:id",
  (req, res) => {
    try {
      const row =
        getApprovedMemorial(
          req.params.id
        );

      if (!row) {
        return res
          .status(404)
          .json({
            error:
              "التذكار غير موجود أو لم تتم الموافقة عليه بعد"
          });
      }

      res.json(
        safeMemorial(row)
      );
    } catch (err) {
      console.error(err);

      res.status(500).json({
        error: "تعذر تحميل التذكار"
      });
    }
  }
);

app.get(
  "/api/random",
  (_req, res) => {
    try {
      const row =
        db
          .prepare(`
            SELECT *
            FROM memorials
            WHERE status = 'Approved'
            ORDER BY RANDOM()
            LIMIT 1
          `)
          .get();

      if (!row) {
        return res
          .status(404)
          .json({
            error:
              "لا توجد تذكارات منشورة"
          });
      }

      res.json(
        safeMemorial(row)
      );
    } catch (err) {
      console.error(err);

      res.status(500).json({
        error: "تعذر تحميل التذكار"
      });
    }
  }
);

/* =========================
   PRAYERS
========================= */

app.post(
  "/api/prayers/:id",
  (req, res) => {
    try {
      const row =
        getApprovedMemorial(
          req.params.id
        );

      if (!row) {
        return res
          .status(404)
          .json({
            error: "التذكار غير موجود"
          });
      }

      const visitorKey =
        String(
          req.headers["x-visitor-key"] || ""
        ).trim().slice(0, 120);

      if (!visitorKey) {
        return res
          .status(400)
          .json({
            error:
              "تعذر التعرف على الزائر"
          });
      }

      const transaction =
        db.transaction(() => {
          const result =
            db
              .prepare(`
                INSERT OR IGNORE INTO prayers
                (
                  memorial_id,
                  visitor_key,
                  created_at
                )
                VALUES (?, ?, ?)
              `)
              .run(
                row.id,
                visitorKey,
                now()
              );

          if (result.changes === 1) {
            db
              .prepare(`
                UPDATE memorials
                SET prayer_count =
                  prayer_count + 1
                WHERE id = ?
              `)
              .run(row.id);
          }

          return result.changes === 1;
        });

      const added =
        transaction();

      const updated =
        db
          .prepare(`
            SELECT prayer_count
            FROM memorials
            WHERE id = ?
          `)
          .get(row.id);

      res.json({
        added,
        prayer_count:
          Number(
            updated?.prayer_count || 0
          )
      });
    } catch (err) {
      console.error(err);

      res.status(500).json({
        error:
          "تعذر تسجيل الدعاء"
      });
    }
  }
);

/* =========================
   CREATE MEMORIAL
========================= */

app.post(
  "/api/memorials",
  imageUpload.single("image"),
  (req, res) => {
    try {
      const displayName =
        String(
          req.body.display_name || ""
        ).trim();

      const deathDate =
        String(
          req.body.death_date || ""
        ).trim();

      const shortBio =
        String(
          req.body.short_bio || ""
        ).trim();

      const visitorMessage =
        String(
          req.body.visitor_message || ""
        ).trim();

      if (displayName.length < 2) {
        if (req.file) {
          deleteUploadedFile(
            "/uploads/" +
            req.file.filename
          );
        }

        return res
          .status(400)
          .json({
            error: "الاسم مطلوب"
          });
      }

      if (
        deathDate &&
        !/^\d{4}-\d{2}-\d{2}$/.test(
          deathDate
        )
      ) {
        if (req.file) {
          deleteUploadedFile(
            "/uploads/" +
            req.file.filename
          );
        }

        return res
          .status(400)
          .json({
            error:
              "تاريخ الوفاة غير صحيح"
          });
      }

      const id =
        crypto.randomUUID();

      const imageUrl =
        req.file
          ? "/uploads/" +
            req.file.filename
          : null;

      db
        .prepare(`
          INSERT INTO memorials
          (
            id,
            display_name,
            death_date,
            image_url,
            short_bio,
            visitor_message,
            status,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          id,
          displayName,
          deathDate || null,
          imageUrl,
          shortBio || null,
          visitorMessage || null,
          "Pending",
          now()
        );

      res.status(201).json({
        ok: true,
        message:
          "تم استلام التذكار للمراجعة 🤍",
        id
      });
    } catch (err) {
      console.error(err);

      if (req.file) {
        deleteUploadedFile(
          "/uploads/" +
          req.file.filename
        );
      }

      res.status(500).json({
        error:
          "تعذر إرسال التذكار"
      });
    }
  }
);

/* =========================
   REPORTS
========================= */

app.post(
  "/api/reports",
  (req, res) => {
    try {
      const memorialId =
        String(
          req.body.memorial_id || ""
        ).trim();

      const reason =
        String(
          req.body.reason || ""
        ).trim();

      const message =
        String(
          req.body.message || ""
        ).trim();

      if (!memorialId) {
        return res
          .status(400)
          .json({
            error:
              "معرف التذكار مطلوب"
          });
      }

      if (!reason) {
        return res
          .status(400)
          .json({
            error:
              "سبب البلاغ مطلوب"
          });
      }

      if (
        !getApprovedMemorial(
          memorialId
        )
      ) {
        return res
          .status(404)
          .json({
            error:
              "التذكار غير موجود"
          });
      }

      db
        .prepare(`
          INSERT INTO reports
          (
            memorial_id,
            reason,
            message,
            created_at
          )
          VALUES (?, ?, ?, ?)
        `)
        .run(
          memorialId,
          reason.slice(0, 300),
          message.slice(0, 2000),
          now()
        );

      res.status(201).json({
        ok: true
      });
    } catch (err) {
      console.error(err);

      res.status(500).json({
        error:
          "تعذر إرسال البلاغ"
      });
    }
  }
);

/* =========================
   ADMIN AUTH
========================= */

function requireAdmin(
  req,
  res,
  next
) {
  const auth =
    String(
      req.headers.authorization || ""
    );

  if (!auth.startsWith("Basic ")) {
    res.set(
      "WWW-Authenticate",
      'Basic realm="Athar Admin"'
    );

    return res
      .status(401)
      .json({
        error:
          "مطلوب تسجيل الدخول"
      });
  }

  try {
    const decoded =
      Buffer
        .from(
          auth.slice(6),
          "base64"
        )
        .toString("utf8");

    const separator =
      decoded.indexOf(":");

    if (separator < 0) {
      return res
        .status(403)
        .json({
          error:
            "بيانات الدخول غير صحيحة"
        });
    }

    const username =
      decoded.slice(
        0,
        separator
      );

    const password =
      decoded.slice(
        separator + 1
      );

    if (
      username !== ADMIN_USER ||
      password !== ADMIN_PASS
    ) {
      return res
        .status(403)
        .json({
          error:
            "بيانات الدخول غير صحيحة"
        });
    }

    next();
  } catch (err) {
    console.error(err);

    return res
      .status(403)
      .json({
        error:
          "بيانات الدخول غير صحيحة"
      });
  }
}

/* =========================
   ADMIN MEMORIALS
========================= */

app.get(
  "/api/admin/memorials",
  requireAdmin,
  (_req, res) => {
    try {
      const rows =
        db
          .prepare(`
            SELECT *
            FROM memorials
            ORDER BY created_at DESC
          `)
          .all();

      res.json(rows);
    } catch (err) {
      console.error(err);

      res.status(500).json({
        error:
          "تعذر تحميل التذكارات"
      });
    }
  }
);

app.post(
  "/api/admin/memorials/:id/status",
  requireAdmin,
  (req, res) => {
    try {
      const id =
        String(
          req.params.id || ""
        ).trim();

      const requestedStatus =
        String(
          req.body.status || ""
        ).trim();

      const allowed = new Set([
        "Approved",
        "Rejected",
        "Hidden",
        "Pending"
      ]);

      if (!allowed.has(requestedStatus)) {
        return res
          .status(400)
          .json({
            error:
              "حالة غير صحيحة"
          });
      }

      const memorial =
        db
          .prepare(`
            SELECT *
            FROM memorials
            WHERE id = ?
          `)
          .get(id);

      if (!memorial) {
        return res
          .status(404)
          .json({
            error:
              "التذكار غير موجود"
          });
      }

      if (
        requestedStatus === "Approved"
      ) {
        const audio =
          db
            .prepare(`
              SELECT id
              FROM audio_library
              WHERE active = 1
              ORDER BY RANDOM()
              LIMIT 1
            `)
            .get();

        db
          .prepare(`
            UPDATE memorials
            SET
              status = ?,
              approved_at = ?,
              audio_id = ?
            WHERE id = ?
          `)
          .run(
            "Approved",
            now(),
            audio
              ? audio.id
              : null,
            id
          );
      } else {
        db
          .prepare(`
            UPDATE memorials
            SET
              status = ?,
              approved_at = NULL
            WHERE id = ?
          `)
          .run(
            requestedStatus,
            id
          );
      }

      res.json({
        ok: true,
        status: requestedStatus
      });
    } catch (err) {
      console.error(err);

      res.status(500).json({
        error:
          "تعذر تغيير حالة التذكار"
      });
    }
  }
);

app.delete(
  "/api/admin/memorials/:id",
  requireAdmin,
  (req, res) => {
    try {
      const memorial =
        db
          .prepare(`
            SELECT image_url
            FROM memorials
            WHERE id = ?
          `)
          .get(req.params.id);

      if (!memorial) {
        return res
          .status(404)
          .json({
            error:
              "التذكار غير موجود"
          });
      }

      const transaction =
        db.transaction(() => {
          db
            .prepare(`
              DELETE FROM prayers
              WHERE memorial_id = ?
            `)
            .run(req.params.id);

          db
            .prepare(`
              DELETE FROM reports
              WHERE memorial_id = ?
            `)
            .run(req.params.id);

          db
            .prepare(`
              DELETE FROM memorials
              WHERE id = ?
            `)
            .run(req.params.id);
        });

      transaction();

      deleteUploadedFile(
        memorial.image_url
      );

      res.json({
        ok: true
      });
    } catch (err) {
      console.error(err);

      res.status(500).json({
        error:
          "تعذر حذف التذكار"
      });
    }
  }
);

/* =========================
   ADMIN REPORTS
========================= */

app.get(
  "/api/admin/reports",
  requireAdmin,
  (_req, res) => {
    try {
      const rows =
        db
          .prepare(`
            SELECT
              reports.*,
              memorials.display_name
                AS memorial_name
            FROM reports
            LEFT JOIN memorials
              ON memorials.id =
                 reports.memorial_id
            ORDER BY
              reports.created_at DESC
          `)
          .all();

      res.json(rows);
    } catch (err) {
      console.error(err);

      res.status(500).json({
        error:
          "تعذر تحميل البلاغات"
      });
    }
  }
);

app.post(
  "/api/admin/reports/:id/status",
  requireAdmin,
  (req, res) => {
    try {
      const status =
        String(
          req.body.status ||
            "Reviewed"
        ).trim();

      const allowed = new Set([
        "Open",
        "Reviewed",
        "Resolved",
        "Ignored"
      ]);

      if (!allowed.has(status)) {
        return res
          .status(400)
          .json({
            error:
              "حالة البلاغ غير صحيحة"
          });
      }

      db
        .prepare(`
          UPDATE reports
          SET status = ?
          WHERE id = ?
        `)
        .run(
          status,
          req.params.id
        );

      res.json({
        ok: true
      });
    } catch (err) {
      console.error(err);

      res.status(500).json({
        error:
          "تعذر تحديث البلاغ"
      });
    }
  }
);

/* =========================
   ADMIN AUDIO
========================= */

app.post(
  "/api/admin/audio",
  requireAdmin,
  audioUpload.single("audio"),
  (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({
            error:
              "يجب رفع ملف MP3"
          });
      }

      const title =
        String(
          req.body.title || ""
        ).trim() ||
        req.file.originalname;

      db
        .prepare(`
          INSERT INTO audio_library
          (
            title,
            audio_url,
            active,
            created_at
          )
          VALUES (?, ?, 1, ?)
        `)
        .run(
          title.slice(0, 200),
          "/uploads/" +
            req.file.filename,
          now()
        );

      res.status(201).json({
        ok: true
      });
    } catch (err) {
      console.error(err);

      if (req.file) {
        deleteUploadedFile(
          "/uploads/" +
          req.file.filename
        );
      }

      res.status(500).json({
        error:
          "تعذر رفع المقطع"
      });
    }
  }
);

app.get(
  "/api/admin/audio",
  requireAdmin,
  (_req, res) => {
    try {
      const rows =
        db
          .prepare(`
            SELECT *
            FROM audio_library
            ORDER BY created_at DESC
          `)
          .all();

      res.json(rows);
    } catch (err) {
      console.error(err);

      res.status(500).json({
        error:
          "تعذر تحميل المقاطع"
      });
    }
  }
);

app.delete(
  "/api/admin/audio/:id",
  requireAdmin,
  (req, res) => {
    try {
      const audio =
        db
          .prepare(`
            SELECT *
            FROM audio_library
            WHERE id = ?
          `)
          .get(req.params.id);

      if (!audio) {
        return res
          .status(404)
          .json({
            error:
              "المقطع غير موجود"
          });
      }

      db.transaction(() => {
        db
          .prepare(`
            UPDATE memorials
            SET audio_id = NULL
            WHERE audio_id = ?
          `)
          .run(audio.id);

        db
          .prepare(`
            DELETE FROM audio_library
            WHERE id = ?
          `)
          .run(audio.id);
      })();

      deleteUploadedFile(
        audio.audio_url
      );

      res.json({
        ok: true
      });
    } catch (err) {
      console.error(err);

      res.status(500).json({
        error:
          "تعذر حذف المقطع"
      });
    }
  }
);

/* =========================
   ERROR HANDLER
========================= */

app.use(
  (
    err,
    _req,
    res,
    _next
  ) => {
    console.error(err);

    if (res.headersSent) {
      return;
    }

    res
      .status(400)
      .json({
        error:
          err.message ||
          "حدث خطأ غير متوقع"
      });
  }
);

/* =========================
   START
========================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Athar running on port ${PORT}`
    );
  }
);
