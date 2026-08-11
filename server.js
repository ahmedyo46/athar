const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const Database = require("better-sqlite3");
const rateLimit = require("express-rate-limit");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA = path.join(ROOT, "data");
const UPLOADS = path.join(ROOT, "uploads");
fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(UPLOADS, { recursive: true });

const db = new Database(path.join(DATA, "athar.db"));
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
CREATE INDEX IF NOT EXISTS idx_memorial_status ON memorials(status);
CREATE INDEX IF NOT EXISTS idx_memorial_name ON memorials(display_name);
CREATE INDEX IF NOT EXISTS idx_memorial_date ON memorials(death_date);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
`);

const adminUser = process.env.ADMIN_USER || "admin";
const adminPass = process.env.ADMIN_PASS || "change-this-password";

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(ROOT, { maxAge: "1h" }));
app.use("/uploads", express.static(UPLOADS));

const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 90, standardHeaders: true, legacyHeaders: false });
app.use("/api", apiLimiter);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS),
  filename: (_req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase())
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ["image/jpeg","image/png","image/webp","image/avif"].includes(file.mimetype);
    cb(ok ? null : new Error("Unsupported image type"), ok);
  }
});
const audioUpload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(file.mimetype === "audio/mpeg" ? null : new Error("MP3 only"), file.mimetype === "audio/mpeg")
});

function now(){ return new Date().toISOString(); }
function safeMemorial(row){
  if(!row) return null;
  return {
    id: row.id, display_name: row.display_name, death_date: row.death_date,
    image_url: row.image_url, short_bio: row.short_bio, visitor_message: row.visitor_message,
    prayer_count: row.prayer_count, created_at: row.created_at, audio: row.audio_id ? db.prepare("SELECT id,title,audio_url FROM audio_library WHERE id=? AND active=1").get(row.audio_id) || null : null
  };
}
function approved(id){ return db.prepare("SELECT * FROM memorials WHERE id=? AND status='Approved'").get(id); }

app.get("/api/memorials", (req,res)=>{
  const q = String(req.query.q || "").trim();
  const page = Math.max(1, Number(req.query.page)||1);
  const limit = Math.min(24, Math.max(1, Number(req.query.limit)||12));
  const offset = (page-1)*limit;
  const rows = q
    ? db.prepare("SELECT * FROM memorials WHERE status='Approved' AND display_name LIKE ? ORDER BY RANDOM() LIMIT ? OFFSET ?").all("%"+q+"%",limit,offset)
    : db.prepare("SELECT * FROM memorials WHERE status='Approved' ORDER BY RANDOM() LIMIT ? OFFSET ?").all(limit,offset);
  res.json({ items: rows.map(safeMemorial), page, limit });
});

app.get("/memorial/:id",(req,res)=>res.sendFile(path.join(ROOT,"index.html")));
app.get("/admin",(req,res)=>res.sendFile(path.join(ROOT,"admin.html")));

app.get("/api/home", (_req,res)=>{
  const daily = db.prepare("SELECT * FROM memorials WHERE status='Approved' ORDER BY RANDOM() LIMIT 1").get();
  const latest = db.prepare("SELECT * FROM memorials WHERE status='Approved' ORDER BY approved_at DESC LIMIT 4").all();
  res.json({ daily: safeMemorial(daily), latest: latest.map(safeMemorial) });
});

app.get("/api/random", (_req,res)=>{
  const row = db.prepare("SELECT * FROM memorials WHERE status='Approved' ORDER BY RANDOM() LIMIT 1").get();
  if(!row) return res.status(404).json({error:"No approved memorials"});
  res.json(safeMemorial(row));
});

app.post("/api/prayers/:id", (req,res)=>{
  const row = approved(req.params.id);
  if(!row) return res.status(404).json({error:"Memorial not found"});
  const visitor = String(req.headers["x-visitor-key"] || "").slice(0,120);
  if(!visitor) return res.status(400).json({error:"Missing visitor key"});
  const tx = db.transaction(()=>{
    const result = db.prepare("INSERT OR IGNORE INTO prayers(memorial_id,visitor_key,created_at) VALUES(?,?,?)").run(row.id,visitor,now());
    if(result.changes) db.prepare("UPDATE memorials SET prayer_count=prayer_count+1 WHERE id=?").run(row.id);
    return result.changes === 1;
  });
  const added = tx();
  const count = db.prepare("SELECT prayer_count FROM memorials WHERE id=?").get(row.id).prayer_count;
  res.json({added, prayer_count:count});
});

app.post("/api/memorials", upload.single("image"), (req,res)=>{
  const {display_name, death_date, short_bio, visitor_message, relation} = req.body;
  if(!display_name || display_name.trim().length < 2) return res.status(400).json({error:"الاسم مطلوب"});
  const id = crypto.randomUUID();
  const image_url = req.file ? "/uploads/"+req.file.filename : null;
  db.prepare(`INSERT INTO memorials(id,display_name,death_date,image_url,short_bio,visitor_message,status,created_at)
    VALUES(?,?,?,?,?,?,?,?)`).run(id,display_name.trim(),death_date||null,image_url,short_bio||null,visitor_message||null,"Pending",now());
  res.json({ok:true,message:"تم استلام التذكرة 🤍",id});
});

app.post("/api/reports", (req,res)=>{
  const {memorial_id,reason,message} = req.body;
  if(!approved(memorial_id)) return res.status(404).json({error:"Memorial not found"});
  db.prepare("INSERT INTO reports(memorial_id,reason,message,created_at) VALUES(?,?,?,?)").run(memorial_id,reason,message||"",now());
  res.json({ok:true});
});

function admin(req,res,next){
  const auth = String(req.headers.authorization||"");
  if(!auth.startsWith("Basic ")) return res.status(401).set("WWW-Authenticate",'Basic realm="Athar Admin"').end();
  const decoded = Buffer.from(auth.slice(6),"base64").toString();
  const i = decoded.indexOf(":");
  if(decoded.slice(0,i)!==adminUser || decoded.slice(i+1)!==adminPass) return res.status(403).json({error:"Unauthorized"});
  next();
}
app.get("/api/admin/memorials",admin,(_req,res)=>{
  res.json(db.prepare("SELECT * FROM memorials ORDER BY created_at DESC").all());
});
app.post("/api/admin/memorials/:id/status",admin,(req,res)=>{
  const status = ["Approved","Rejected","Hidden","Pending"].includes(req.body.status) ? req.body.status : "Pending";
  const approvedAt = status==="Approved" ? now() : null;
  if(status==="Approved"){
    const audio = db.prepare("SELECT id FROM audio_library WHERE active=1 ORDER BY RANDOM() LIMIT 1").get();
    db.prepare("UPDATE memorials SET status=?,approved_at=?,audio_id=? WHERE id=?").run(status,approvedAt,audio?.id||null,req.params.id);
  } else db.prepare("UPDATE memorials SET status=?,approved_at=NULL WHERE id=?").run(status,req.params.id);
  res.json({ok:true});
});
app.delete("/api/admin/memorials/:id",admin,(req,res)=>{
  db.prepare("DELETE FROM memorials WHERE id=?").run(req.params.id);
  res.json({ok:true});
});
app.get("/api/admin/reports",admin,(_req,res)=>res.json(db.prepare("SELECT * FROM reports ORDER BY created_at DESC").all()));
app.post("/api/admin/reports/:id/status",admin,(req,res)=>{
  db.prepare("UPDATE reports SET status=? WHERE id=?").run(req.body.status||"Reviewed",req.params.id);
  res.json({ok:true});
});
app.post("/api/admin/audio",admin,audioUpload.single("audio"),(req,res)=>{
  if(!req.file) return res.status(400).json({error:"MP3 required"});
  db.prepare("INSERT INTO audio_library(title,audio_url,created_at) VALUES(?,?,?)").run(req.body.title||req.file.originalname,"/uploads/"+req.file.filename,now());
  res.json({ok:true});
});
app.get("/api/admin/audio",admin,(_req,res)=>res.json(db.prepare("SELECT * FROM audio_library ORDER BY created_at DESC").all()));
app.delete("/api/admin/audio/:id",admin,(req,res)=>{ db.prepare("DELETE FROM audio_library WHERE id=?").run(req.params.id); res.json({ok:true}); });

app.get("/memorial/:id",(req,res)=>res.sendFile(path.join(ROOT,"public","index.html")));
app.get("/admin",(req,res)=>res.sendFile(path.join(ROOT,"public","admin.html")));

app.use((err,_req,res,_next)=>res.status(400).json({error:err.message||"حدث خطأ"}));
app.listen(PORT,()=>console.log(`Athar running on http://localhost:${PORT}`));  fileFilter: (_req, file, cb) => {
    const ok = ["image/jpeg","image/png","image/webp","image/avif"].includes(file.mimetype);
    cb(ok ? null : new Error("Unsupported image type"), ok);
  }
});
const audioUpload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(file.mimetype === "audio/mpeg" ? null : new Error("MP3 only"), file.mimetype === "audio/mpeg")
});

function now(){ return new Date().toISOString(); }
function safeMemorial(row){
  if(!row) return null;
  return {
    id: row.id, display_name: row.display_name, death_date: row.death_date,
    image_url: row.image_url, short_bio: row.short_bio, visitor_message: row.visitor_message,
    prayer_count: row.prayer_count, created_at: row.created_at, audio: row.audio_id ? db.prepare("SELECT id,title,audio_url FROM audio_library WHERE id=? AND active=1").get(row.audio_id) || null : null
  };
}
function approved(id){ return db.prepare("SELECT * FROM memorials WHERE id=? AND status='Approved'").get(id); }

app.get("/api/memorials", (req,res)=>{
  const q = String(req.query.q || "").trim();
  const page = Math.max(1, Number(req.query.page)||1);
  const limit = Math.min(24, Math.max(1, Number(req.query.limit)||12));
  const offset = (page-1)*limit;
  const rows = q
    ? db.prepare("SELECT * FROM memorials WHERE status='Approved' AND display_name LIKE ? ORDER BY RANDOM() LIMIT ? OFFSET ?").all("%"+q+"%",limit,offset)
    : db.prepare("SELECT * FROM memorials WHERE status='Approved' ORDER BY RANDOM() LIMIT ? OFFSET ?").all(limit,offset);
  res.json({ items: rows.map(safeMemorial), page, limit });
});

app.get("/memorial/:id",(req,res)=>res.sendFile(path.join(ROOT,"index.html")));
app.get("/admin",(req,res)=>res.sendFile(path.join(ROOT,"admin.html")));

app.get("/api/home", (_req,res)=>{
  const daily = db.prepare("SELECT * FROM memorials WHERE status='Approved' ORDER BY RANDOM() LIMIT 1").get();
  const latest = db.prepare("SELECT * FROM memorials WHERE status='Approved' ORDER BY approved_at DESC LIMIT 4").all();
  res.json({ daily: safeMemorial(daily), latest: latest.map(safeMemorial) });
});

app.get("/api/random", (_req,res)=>{
  const row = db.prepare("SELECT * FROM memorials WHERE status='Approved' ORDER BY RANDOM() LIMIT 1").get();
  if(!row) return res.status(404).json({error:"No approved memorials"});
  res.json(safeMemorial(row));
});

app.post("/api/prayers/:id", (req,res)=>{
  const row = approved(req.params.id);
  if(!row) return res.status(404).json({error:"Memorial not found"});
  const visitor = String(req.headers["x-visitor-key"] || "").slice(0,120);
  if(!visitor) return res.status(400).json({error:"Missing visitor key"});
  const tx = db.transaction(()=>{
    const result = db.prepare("INSERT OR IGNORE INTO prayers(memorial_id,visitor_key,created_at) VALUES(?,?,?)").run(row.id,visitor,now());
    if(result.changes) db.prepare("UPDATE memorials SET prayer_count=prayer_count+1 WHERE id=?").run(row.id);
    return result.changes === 1;
  });
  const added = tx();
  const count = db.prepare("SELECT prayer_count FROM memorials WHERE id=?").get(row.id).prayer_count;
  res.json({added, prayer_count:count});
});

app.post("/api/memorials", upload.single("image"), (req,res)=>{
  const {display_name, death_date, short_bio, visitor_message, relation} = req.body;
  if(!display_name || display_name.trim().length < 2) return res.status(400).json({error:"الاسم مطلوب"});
  const id = crypto.randomUUID();
  const image_url = req.file ? "/uploads/"+req.file.filename : null;
  db.prepare(`INSERT INTO memorials(id,display_name,death_date,image_url,short_bio,visitor_message,status,created_at)
    VALUES(?,?,?,?,?,?,?,?)`).run(id,display_name.trim(),death_date||null,image_url,short_bio||null,visitor_message||null,"Pending",now());
  res.json({ok:true,message:"تم استلام التذكرة 🤍",id});
});

app.post("/api/reports", (req,res)=>{
  const {memorial_id,reason,message} = req.body;
  if(!approved(memorial_id)) return res.status(404).json({error:"Memorial not found"});
  db.prepare("INSERT INTO reports(memorial_id,reason,message,created_at) VALUES(?,?,?,?)").run(memorial_id,reason,message||"",now());
  res.json({ok:true});
});

function admin(req,res,next){
  const auth = String(req.headers.authorization||"");
  if(!auth.startsWith("Basic ")) return res.status(401).set("WWW-Authenticate",'Basic realm="Athar Admin"').end();
  const decoded = Buffer.from(auth.slice(6),"base64").toString();
  const i = decoded.indexOf(":");
  if(decoded.slice(0,i)!==adminUser || decoded.slice(i+1)!==adminPass) return res.status(403).json({error:"Unauthorized"});
  next();
}
app.get("/api/admin/memorials",admin,(_req,res)=>{
  res.json(db.prepare("SELECT * FROM memorials ORDER BY created_at DESC").all());
});
app.post("/api/admin/memorials/:id/status",admin,(req,res)=>{
  const status = ["Approved","Rejected","Hidden","Pending"].includes(req.body.status) ? req.body.status : "Pending";
  const approvedAt = status==="Approved" ? now() : null;
  if(status==="Approved"){
    const audio = db.prepare("SELECT id FROM audio_library WHERE active=1 ORDER BY RANDOM() LIMIT 1").get();
    db.prepare("UPDATE memorials SET status=?,approved_at=?,audio_id=? WHERE id=?").run(status,approvedAt,audio?.id||null,req.params.id);
  } else db.prepare("UPDATE memorials SET status=?,approved_at=NULL WHERE id=?").run(status,req.params.id);
  res.json({ok:true});
});
app.delete("/api/admin/memorials/:id",admin,(req,res)=>{
  db.prepare("DELETE FROM memorials WHERE id=?").run(req.params.id);
  res.json({ok:true});
});
app.get("/api/admin/reports",admin,(_req,res)=>res.json(db.prepare("SELECT * FROM reports ORDER BY created_at DESC").all()));
app.post("/api/admin/reports/:id/status",admin,(req,res)=>{
  db.prepare("UPDATE reports SET status=? WHERE id=?").run(req.body.status||"Reviewed",req.params.id);
  res.json({ok:true});
});
app.post("/api/admin/audio",admin,audioUpload.single("audio"),(req,res)=>{
  if(!req.file) return res.status(400).json({error:"MP3 required"});
  db.prepare("INSERT INTO audio_library(title,audio_url,created_at) VALUES(?,?,?)").run(req.body.title||req.file.originalname,"/uploads/"+req.file.filename,now());
  res.json({ok:true});
});
app.get("/api/admin/audio",admin,(_req,res)=>res.json(db.prepare("SELECT * FROM audio_library ORDER BY created_at DESC").all()));
app.delete("/api/admin/audio/:id",admin,(req,res)=>{ db.prepare("DELETE FROM audio_library WHERE id=?").run(req.params.id); res.json({ok:true}); });

app.get("/memorial/:id",(req,res)=>res.sendFile(path.join(ROOT,"public","index.html")));
app.get("/admin",(req,res)=>res.sendFile(path.join(ROOT,"public","admin.html")));

app.use((err,_req,res,_next)=>res.status(400).json({error:err.message||"حدث خطأ"}));
app.listen(PORT,()=>console.log(`Athar running on http://localhost:${PORT}`));
