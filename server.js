/* ==========================================================
   FLARE — server
   Serves the storefront + admin panel as static files and
   exposes a small product API backed by SQLite (db.js).
   Run: npm install && npm start   (defaults to http://localhost:3000)
   ========================================================== */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const path = require("path");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "flare-dev-secret-change-me";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "flareadmin123";

// Razorpay is optional to configure — if the keys aren't set yet, checkout
// endpoints return a clear "not configured" error instead of crashing the
// whole server. Get real keys from the Razorpay Dashboard > Settings > API Keys.
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";
let razorpay = null;
if (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) {
  const Razorpay = require("razorpay");
  razorpay = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
}

// Google Sign-In is optional to configure — same pattern as Razorpay. Get a
// Client ID from Google Cloud Console > APIs & Services > Credentials
// (OAuth client ID, type "Web application"). No client secret is needed for
// this ID-token verification flow.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
let googleClient = null;
if (GOOGLE_CLIENT_ID) {
  const { OAuth2Client } = require("google-auth-library");
  googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
}

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

// Clean URL for the admin panel — /admin works the same as /admin.html
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

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

/* ---------------- Customer accounts (email/password + Google) ----------------
   Customers must be signed in to place a pre-book order. Passwords are hashed
   with Node's built-in scrypt (salted) — no extra dependency needed. Google
   Sign-In verifies the ID token server-side via google-auth-library, so we
   never see or need the customer's Google password. */

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const attempt = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(attempt, "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function formatCustomer(row) {
  return { id: row.id, name: row.name, email: row.email, phone: row.phone };
}

function requireCustomer(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Please sign in to continue" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== "customer") throw new Error("wrong role");
    req.customerId = payload.customerId;
    next();
  } catch (e) {
    res.status(401).json({ error: "Your session expired, please sign in again" });
  }
}

app.post("/api/auth/register", (req, res) => {
  const { name, email, phone, password } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: "Name is required" });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) return res.status(400).json({ error: "A valid email is required" });
  if (!password || String(password).length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

  const emailNorm = String(email).trim().toLowerCase();
  const existing = db.prepare("SELECT id FROM customers WHERE email = ?").get(emailNorm);
  if (existing) return res.status(409).json({ error: "An account with this email already exists. Try logging in instead." });

  const info = db.prepare(`
    INSERT INTO customers (name, email, phone, password_hash) VALUES (?, ?, ?, ?)
  `).run(String(name).trim(), emailNorm, phone ? String(phone).trim() : "", hashPassword(String(password)));

  const customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(info.lastInsertRowid);
  const token = jwt.sign({ customerId: customer.id, role: "customer" }, JWT_SECRET, { expiresIn: "30d" });
  res.status(201).json({ token, customer: formatCustomer(customer) });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

  const customer = db.prepare("SELECT * FROM customers WHERE email = ?").get(String(email).trim().toLowerCase());
  if (!customer || !customer.password_hash || !verifyPassword(String(password), customer.password_hash)) {
    return res.status(401).json({ error: "Incorrect email or password" });
  }

  const token = jwt.sign({ customerId: customer.id, role: "customer" }, JWT_SECRET, { expiresIn: "30d" });
  res.json({ token, customer: formatCustomer(customer) });
});

app.post("/api/auth/google", async (req, res) => {
  if (!googleClient) return res.status(503).json({ error: "Google sign-in isn't configured yet" });

  const { credential } = req.body || {};
  if (!credential) return res.status(400).json({ error: "Missing Google credential" });

  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const googleId = payload.sub;
    const email = String(payload.email || "").toLowerCase();
    const name = payload.name || email.split("@")[0];
    if (!email) return res.status(400).json({ error: "Google account has no email" });

    let customer = db.prepare("SELECT * FROM customers WHERE google_id = ? OR email = ?").get(googleId, email);
    if (!customer) {
      const info = db.prepare(`
        INSERT INTO customers (name, email, phone, password_hash, google_id) VALUES (?, ?, '', '', ?)
      `).run(name, email, googleId);
      customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(info.lastInsertRowid);
    } else if (!customer.google_id) {
      db.prepare("UPDATE customers SET google_id = ? WHERE id = ?").run(googleId, customer.id);
      customer.google_id = googleId;
    }

    const token = jwt.sign({ customerId: customer.id, role: "customer" }, JWT_SECRET, { expiresIn: "30d" });
    res.json({ token, customer: formatCustomer(customer) });
  } catch (err) {
    console.error("Google sign-in failed:", err);
    res.status(401).json({ error: "Could not verify Google sign-in" });
  }
});

app.get("/api/auth/me", requireCustomer, (req, res) => {
  const customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(req.customerId);
  if (!customer) return res.status(404).json({ error: "Account not found" });
  res.json({ customer: formatCustomer(customer) });
});

// Public, non-secret config the frontend needs (e.g. to decide whether to
// render the Google sign-in button and which client ID to use).
app.get("/api/config", (req, res) => {
  res.json({ google_client_id: GOOGLE_CLIENT_ID || "" });
});

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
    trending: !!row.trending,
    spinImages: JSON.parse(row.spin_images || "[]"),
    g: "g" + (((row.id - 1) % 8) + 1),
  };
}

function validateProductBody(body) {
  const { name, cat, price, mrp, sizes, colors, rating, reviews, image, description, trending, spinImages } = body || {};
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
    trending: trending === true || trending === "true" || trending === "on" || trending === 1 || trending === "1" ? 1 : 0,
    // Optional: URLs of photos shot in a circle around the garment, for a
    // true 360° spin viewer. Fewer than 2 just means the product page falls
    // back to the single-photo 3D tilt viewer — nothing breaks either way.
    spinImages: toList(spinImages),
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
      INSERT INTO products (name, cat, price, mrp, sizes, colors, rating, reviews, image, description, trending, spin_images)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(p.name, p.cat, p.price, p.mrp, JSON.stringify(p.sizes), JSON.stringify(p.colors), p.rating, p.reviews, p.image, p.description, p.trending, JSON.stringify(p.spinImages));

  const row = db.prepare("SELECT * FROM products WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json(formatProduct(row));
});

app.put("/api/products/:id", requireAdmin, (req, res) => {
  const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Product not found" });

  const p = validateProductBody(req.body);
  if (p.error) return res.status(400).json({ error: p.error });

  db.prepare(`
    UPDATE products SET name=?, cat=?, price=?, mrp=?, sizes=?, colors=?, rating=?, reviews=?, image=?, description=?, trending=?, spin_images=?
    WHERE id=?
  `).run(p.name, p.cat, p.price, p.mrp, JSON.stringify(p.sizes), JSON.stringify(p.colors), p.rating, p.reviews, p.image, p.description, p.trending, JSON.stringify(p.spinImages), req.params.id);

  const row = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  res.json(formatProduct(row));
});

app.delete("/api/products/:id", requireAdmin, (req, res) => {
  const info = db.prepare("DELETE FROM products WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Product not found" });
  res.json({ ok: true });
});

/* ---------------- Settings API (homepage hero content) ---------------- */

const SETTINGS_KEYS = [
  "hero_eyebrow", "hero_title_1", "hero_title_2", "hero_subtitle",
  "hero_cta_primary", "hero_cta_secondary", "hero_badge", "deposit_percent",
];

app.get("/api/settings", (req, res) => {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  const out = {};
  for (const row of rows) out[row.key] = row.value;
  res.json(out);
});

app.put("/api/settings", requireAdmin, (req, res) => {
  const body = req.body || {};
  const upsert = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  const tx = db.transaction(() => {
    for (const key of SETTINGS_KEYS) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        upsert.run(key, String(body[key] ?? "").trim());
      }
    }
  });
  tx();
  const rows = db.prepare("SELECT key, value FROM settings").all();
  const out = {};
  for (const row of rows) out[row.key] = row.value;
  res.json(out);
});

/* ---------------- Checkout / pre-book deposit API (Razorpay) ----------------
   Pre-sale model: the customer pays a partial "deposit" now to reserve their
   order, with the balance due later (e.g. on delivery). The deposit percentage
   is admin-configurable via the `deposit_percent` setting. Prices are always
   recomputed from the database here — never trusted from the client — so a
   tampered request can't reserve an item for less than its real price. */

function getDepositPercent() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'deposit_percent'").get();
  const n = row ? Number(row.value) : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > 100) return 20;
  return n;
}

app.post("/api/checkout/create-order", requireCustomer, (req, res) => {
  const customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(req.customerId);
  if (!customer) return res.status(401).json({ error: "Please sign in again" });

  const { items, customerName, customerPhone, shippingAddress } = req.body || {};

  if (!customerName || !String(customerName).trim()) return res.status(400).json({ error: "Name is required" });
  if (!customerPhone || !String(customerPhone).trim()) return res.status(400).json({ error: "Phone number is required" });
  if (!shippingAddress || !String(shippingAddress).trim()) return res.status(400).json({ error: "Shipping address is required" });
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "Your bag is empty" });

  // Recompute the order total from the DB — client-sent prices are ignored.
  const lineItems = [];
  let cartTotal = 0;
  for (const it of items) {
    const product = db.prepare("SELECT * FROM products WHERE id = ?").get(it.id);
    if (!product) return res.status(400).json({ error: `Product ${it.id} no longer exists` });
    const qty = Math.max(1, Math.min(20, Math.round(Number(it.qty) || 1)));
    const lineTotal = product.price * qty;
    cartTotal += lineTotal;
    lineItems.push({
      id: product.id, name: product.name, price: product.price, qty,
      size: it.size ? String(it.size) : "", color: it.color ? String(it.color) : "",
    });
  }
  if (cartTotal <= 0) return res.status(400).json({ error: "Invalid order total" });

  const depositPercent = getDepositPercent();
  const depositAmount = Math.max(1, Math.round((cartTotal * depositPercent) / 100));
  const balanceDue = cartTotal - depositAmount;

  // TEST MODE: no Razorpay keys configured yet, so there's no real payment
  // gateway to talk to. Instead of blocking the whole checkout flow with a
  // 503, simulate an instantly-"paid" booking (clearly tagged with TEST_
  // order/payment ids) so the order flow, admin bookings view, tracking
  // updates, and "My Orders" page can all be exercised end-to-end before
  // real Razorpay keys are wired up. This path disappears automatically the
  // moment RAZORPAY_KEY_ID/SECRET are set — see the real flow below.
  if (!razorpay) {
    const testOrderId = `TEST_ORDER_${Date.now()}`;
    const testPaymentId = `TEST_PAYMENT_${Date.now()}`;
    const info = db.prepare(`
      INSERT INTO bookings (customer_id, customer_name, customer_phone, customer_email, shipping_address, items, cart_total, deposit_amount, balance_due, razorpay_order_id, razorpay_payment_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid')
    `).run(
      customer.id, String(customerName).trim(), String(customerPhone).trim(), customer.email,
      String(shippingAddress).trim(),
      JSON.stringify(lineItems), cartTotal, depositAmount, balanceDue, testOrderId, testPaymentId
    );

    return res.json({
      test_mode: true,
      booking_id: info.lastInsertRowid,
      cart_total: cartTotal,
      deposit_amount: depositAmount,
      balance_due: balanceDue,
      deposit_percent: depositPercent,
    });
  }

  razorpay.orders.create({
    amount: depositAmount * 100, // paise
    currency: "INR",
    receipt: `flare_${Date.now()}`,
  }).then((order) => {
    const info = db.prepare(`
      INSERT INTO bookings (customer_id, customer_name, customer_phone, customer_email, shipping_address, items, cart_total, deposit_amount, balance_due, razorpay_order_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'created')
    `).run(
      customer.id, String(customerName).trim(), String(customerPhone).trim(), customer.email,
      String(shippingAddress).trim(),
      JSON.stringify(lineItems), cartTotal, depositAmount, balanceDue, order.id
    );

    res.json({
      key_id: RAZORPAY_KEY_ID,
      razorpay_order_id: order.id,
      booking_id: info.lastInsertRowid,
      amount: depositAmount,
      currency: "INR",
      cart_total: cartTotal,
      deposit_amount: depositAmount,
      balance_due: balanceDue,
      deposit_percent: depositPercent,
    });
  }).catch((err) => {
    console.error("Razorpay order creation failed:", err);
    res.status(502).json({ error: "Could not start payment. Please try again." });
  });
});

app.post("/api/checkout/verify", requireCustomer, (req, res) => {
  if (!razorpay) return res.status(503).json({ error: "Payments aren't configured yet" });

  const { booking_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (!booking_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: "Missing payment details" });
  }

  const booking = db.prepare("SELECT * FROM bookings WHERE id = ?").get(booking_id);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (booking.customer_id !== req.customerId) {
    return res.status(403).json({ error: "This booking doesn't belong to your account" });
  }
  if (booking.razorpay_order_id !== razorpay_order_id) {
    return res.status(400).json({ error: "Order mismatch" });
  }

  const expected = crypto
    .createHmac("sha256", RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "utf8");
  const gotBuf = Buffer.from(String(razorpay_signature), "utf8");
  const valid = expectedBuf.length === gotBuf.length && crypto.timingSafeEqual(expectedBuf, gotBuf);

  if (!valid) {
    db.prepare("UPDATE bookings SET status = 'failed' WHERE id = ?").run(booking_id);
    return res.status(400).json({ error: "Payment verification failed" });
  }

  db.prepare("UPDATE bookings SET status = 'paid', razorpay_payment_id = ? WHERE id = ?").run(razorpay_payment_id, booking_id);
  res.json({ ok: true, balance_due: booking.balance_due, cart_total: booking.cart_total, deposit_amount: booking.deposit_amount });
});

const TRACKING_STATUSES = ["reserved", "confirmed", "packed", "shipped", "out_for_delivery", "delivered", "cancelled"];

function formatBooking(r) {
  return {
    id: r.id,
    customer_name: r.customer_name,
    customer_phone: r.customer_phone,
    customer_email: r.customer_email,
    shipping_address: r.shipping_address || "",
    items: JSON.parse(r.items || "[]"),
    cart_total: r.cart_total,
    deposit_amount: r.deposit_amount,
    balance_due: r.balance_due,
    status: r.status,
    tracking_status: r.tracking_status || "reserved",
    tracking_note: r.tracking_note || "",
    created_at: r.created_at,
    updated_at: r.updated_at,
    is_test: (r.razorpay_order_id || "").startsWith("TEST_"),
  };
}

app.get("/api/bookings", requireAdmin, (req, res) => {
  const rows = db.prepare("SELECT * FROM bookings ORDER BY id DESC").all();
  res.json(rows.map(formatBooking));
});

app.patch("/api/bookings/:id/tracking", requireAdmin, (req, res) => {
  const booking = db.prepare("SELECT * FROM bookings WHERE id = ?").get(req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking not found" });

  const { tracking_status, tracking_note } = req.body || {};
  if (tracking_status && !TRACKING_STATUSES.includes(tracking_status)) {
    return res.status(400).json({ error: `tracking_status must be one of: ${TRACKING_STATUSES.join(", ")}` });
  }

  db.prepare(`
    UPDATE bookings SET
      tracking_status = COALESCE(?, tracking_status),
      tracking_note = COALESCE(?, tracking_note),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(tracking_status || null, tracking_note != null ? String(tracking_note).trim() : null, req.params.id);

  const updated = db.prepare("SELECT * FROM bookings WHERE id = ?").get(req.params.id);
  res.json(formatBooking(updated));
});

// Customer-facing order history + tracking, scoped to their own account only.
app.get("/api/my-orders", requireCustomer, (req, res) => {
  const rows = db.prepare("SELECT * FROM bookings WHERE customer_id = ? ORDER BY id DESC").all(req.customerId);
  res.json(rows.map(formatBooking));
});

app.listen(PORT, () => {
  console.log(`FLARE server running at http://localhost:${PORT}`);
  console.log(`Admin panel:  http://localhost:${PORT}/admin`);
  console.log(`Admin password (change via ADMIN_PASSWORD env var): ${ADMIN_PASSWORD}`);
  console.log(razorpay
    ? "Razorpay: configured — checkout deposits are live."
    : "Razorpay: NOT configured — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to enable checkout.");
});
