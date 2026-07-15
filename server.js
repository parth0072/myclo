/* ==========================================================
   FLARE — server
   Serves the storefront + admin panel as static files and
   exposes a small product API backed by SQLite (db.js).
   Run: npm install && npm start   (defaults to http://localhost:3000)
   ========================================================== */

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const path = require("path");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "flare-dev-secret-change-me";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "flareadmin123";

app.use(cors());
app.use(express.json());

// Don't let the static server hand out server source, deps, or the raw db file.
const BLOCKED_PATHS = ["/server.js", "/db.js", "/package.json", "/package-lock.json"];
app.use((req, res, next) => {
  if (BLOCKED_PATHS.includes(req.path) || req.path.startsWith("/node_modules") || req.path.startsWith("/data")) {
    return res.status(404).send("Not found");
  }
  next();
});
app.use(express.static(__dirname));

/* ---------------- Auth ---------------- */

app.post("/api/admin/login", (req, res) => {
  const { password } = req.body || {};
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Incorrect password" });
  }
  const token = jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "12h" });
  res.json({ token });
});

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: "Invalid or expired session, please log in again" });
  }
}

/* ---------------- Helpers ---------------- */

function formatProduct(row) {
  return {
    id: row.id,
    name: row.name,
    cat: row.cat,
    price: row.price,
    mrp: row.mrp,
    sizes: JSON.parse(row.sizes || "[]"),
    colors: JSON.parse(row.colors || "[]"),
    rating: row.rating,
    reviews: row.reviews,
    image: row.image || "",
    description: row.description || "",
    g: "g" + (((row.id - 1) % 8) + 1),
  };
}

function validateProductBody(body) {
  const { name, cat, price, mrp, sizes, colors, rating, reviews, image, description } = body || {};
  if (!name || !String(name).trim()) return { error: "Product name is required" };
  if (!cat || !String(cat).trim()) return { error: "Category is required" };
  if (price == null || isNaN(Number(price))) return { error: "A valid price is required" };
  if (mrp == null || isNaN(Number(mrp))) return { error: "A valid MRP (strike-through price) is required" };

  const toList = (v) =>
    Array.isArray(v) ? v.map(String) : String(v || "").split(",").map((s) => s.trim()).filter(Boolean);

  return {
    name: String(name).trim(),
    cat: String(cat).trim(),
    price: Math.round(Number(price)),
    mrp: Math.round(Number(mrp)),
    sizes: toList(sizes),
    colors: toList(colors),
    rating: rating != null && !isNaN(Number(rating)) ? Number(rating) : 4.5,
    reviews: reviews != null && !isNaN(Number(reviews)) ? Number(reviews) : 0,
    image: image ? String(image).trim() : "",
    description: description ? String(description).trim() : "",
  };
}

/* ---------------- Product API ---------------- */

app.get("/api/products", (req, res) => {
  const rows = db.prepare("SELECT * FROM products ORDER BY id ASC").all();
  res.json(rows.map(formatProduct));
});

app.get("/api/products/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Product not found" });
  res.json(formatProduct(row));
});

app.post("/api/products", requireAdmin, (req, res) => {
  const p = validateProductBody(req.body);
  if (p.error) return res.status(400).json({ error: p.error });

  const info = db
    .prepare(`
      INSERT INTO products (name, cat, price, mrp, sizes, colors, rating, reviews, image, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(p.name, p.cat, p.price, p.mrp, JSON.stringify(p.sizes), JSON.stringify(p.colors), p.rating, p.reviews, p.image, p.description);

  const row = db.prepare("SELECT * FROM products WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json(formatProduct(row));
});

app.put("/api/products/:id", requireAdmin, (req, res) => {
  const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Product not found" });

  const p = validateProductBody(req.body);
  if (p.error) return res.status(400).json({ error: p.error });

  db.prepare(`
    UPDATE products SET name=?, cat=?, price=?, mrp=?, sizes=?, colors=?, rating=?, reviews=?, image=?, description=?
    WHERE id=?
  `).run(p.name, p.cat, p.price, p.mrp, JSON.stringify(p.sizes), JSON.stringify(p.colors), p.rating, p.reviews, p.image, p.description, req.params.id);

  const row = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  res.json(formatProduct(row));
});

app.delete("/api/products/:id", requireAdmin, (req, res) => {
  const info = db.prepare("DELETE FROM products WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Product not found" });
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`FLARE server running at http://localhost:${PORT}`);
  console.log(`Admin panel:  http://localhost:${PORT}/admin.html`);
  console.log(`Admin password (change via ADMIN_PASSWORD env var): ${ADMIN_PASSWORD}`);
});
