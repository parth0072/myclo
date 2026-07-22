/* ==========================================================
   FLARE — SQLite data layer
   Stores every product + homepage setting the storefront and
   admin panel share. File lives at ./data/flare.db so it
   persists between restarts (see PROJECT.md for the caveat
   about Render's free-tier ephemeral disk).
   ========================================================== */

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const db = new Database(path.join(dataDir, "flare.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    cat TEXT NOT NULL,
    price INTEGER NOT NULL,
    mrp INTEGER NOT NULL,
    sizes TEXT NOT NULL DEFAULT '[]',
    colors TEXT NOT NULL DEFAULT '[]',
    rating REAL NOT NULL DEFAULT 4.5,
    reviews INTEGER NOT NULL DEFAULT 0,
    image TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    trending INTEGER NOT NULL DEFAULT 0,
    spin_images TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_email TEXT NOT NULL DEFAULT '',
    shipping_address TEXT NOT NULL DEFAULT '',
    items TEXT NOT NULL DEFAULT '[]',
    cart_total INTEGER NOT NULL,
    deposit_amount INTEGER NOT NULL,
    balance_due INTEGER NOT NULL,
    razorpay_order_id TEXT NOT NULL DEFAULT '',
    razorpay_payment_id TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'created',
    tracking_status TEXT NOT NULL DEFAULT 'reserved',
    tracking_note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL DEFAULT '',
    google_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

/* ---------- Migrate bookings table for databases created before accounts/
   tracking existed (customer_id, shipping_address, tracking_status,
   tracking_note, updated_at). SQLite has no "ADD COLUMN IF NOT EXISTS", so
   we check PRAGMA table_info first and only add what's missing. Safe to run
   on every startup. ---------- */

const bookingColumns = new Set(db.prepare("PRAGMA table_info(bookings)").all().map((c) => c.name));
const bookingMigrations = [
  ["customer_id", "ALTER TABLE bookings ADD COLUMN customer_id INTEGER"],
  ["shipping_address", "ALTER TABLE bookings ADD COLUMN shipping_address TEXT NOT NULL DEFAULT ''"],
  ["tracking_status", "ALTER TABLE bookings ADD COLUMN tracking_status TEXT NOT NULL DEFAULT 'reserved'"],
  ["tracking_note", "ALTER TABLE bookings ADD COLUMN tracking_note TEXT NOT NULL DEFAULT ''"],
  ["updated_at", "ALTER TABLE bookings ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP"],
];
for (const [col, sql] of bookingMigrations) {
  if (!bookingColumns.has(col)) db.exec(sql);
}

/* ---------- Migrate products table for databases created before the 360°
   spin viewer existed (spin_images: optional JSON array of photo URLs shot
   in a circle around the garment; empty by default, which just means the
   product page falls back to the single-photo 3D tilt viewer). ---------- */

const productColumns = new Set(db.prepare("PRAGMA table_info(products)").all().map((c) => c.name));
if (!productColumns.has("spin_images")) {
  db.exec("ALTER TABLE products ADD COLUMN spin_images TEXT NOT NULL DEFAULT '[]'");
}

/* ---------- Seed products (only runs once, on an empty table) ---------- */

const existingProducts = db.prepare("SELECT COUNT(*) AS c FROM products").get().c;

if (existingProducts === 0) {
  const seed = [
    {
      name: "Wide-Leg Cargo Cords", cat: "Cords", price: 1799, mrp: 2599,
      colors: ["#8f6ed6", "#3b3540"], sizes: ["XS", "S", "M", "L", "XL"],
      rating: 4.6, reviews: 128, trending: 1,
      image: "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=800&h=1000&fit=crop&q=80",
      description: "Relaxed wide-leg corduroy pants with utility cargo pockets and an adjustable elastic waistband. The one pair you'll reach for on repeat this season.",
    },
    {
      name: "Flared Corduroy Trousers", cat: "Cords", price: 2099, mrp: 2999,
      colors: ["#c9506b", "#3b3540"], sizes: ["XS", "S", "M", "L"],
      rating: 4.7, reviews: 203, trending: 1,
      image: "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=800&h=1000&fit=crop&q=80",
      description: "A soft-touch corduroy flare cut with a high rise and just enough stretch to move with you all day, from class to the coffee run after.",
    },
    {
      name: "Cropped Rib Knit Top", cat: "Tops", price: 899, mrp: 1299,
      colors: ["#ff3e7f", "#3b3540"], sizes: ["XS", "S", "M", "L"],
      rating: 4.5, reviews: 156, trending: 1,
      image: "https://images.unsplash.com/photo-1566174053879-31528523f8ae?w=800&h=1000&fit=crop&q=80",
      description: "A fitted ribbed knit crop with a rounded neckline, made to layer under jackets or pair straight with high-rise cords.",
    },
    {
      name: "Floral Wrap Midi Dress", cat: "Dresses", price: 1699, mrp: 2399,
      colors: ["#8f6ed6", "#c9506b"], sizes: ["XS", "S", "M", "L"],
      rating: 4.8, reviews: 241, trending: 0,
      image: "https://images.unsplash.com/photo-1571945153237-4929e783af4a?w=800&h=1000&fit=crop&q=80",
      description: "A lightweight floral midi with a wrap front tie and flutter sleeves, cut for warm days and dressed-up dinners alike.",
    },
    {
      name: "Corduroy Co-ord Set", cat: "Co-ords", price: 2499, mrp: 3299,
      colors: ["#e8b94d", "#8f6ed6"], sizes: ["S", "M", "L"],
      rating: 4.7, reviews: 98, trending: 0,
      image: "https://images.unsplash.com/photo-1622445275576-721325763afe?w=800&h=1000&fit=crop&q=80",
      description: "A matching corduroy jacket and trouser set for when you want a whole outfit sorted in one click, no styling required.",
    },
    {
      name: "Straight Fit Denim Jeans", cat: "Denim", price: 1599, mrp: 2199,
      colors: ["#5c6bc0", "#3b3540"], sizes: ["S", "M", "L", "XL"],
      rating: 4.4, reviews: 172, trending: 0,
      image: "https://images.unsplash.com/photo-1560243563-062bfc001d68?w=800&h=1000&fit=crop&q=80",
      description: "A classic mid-rise straight leg in rigid denim that softens with wear — the everyday jean that goes with everything else in your closet.",
    },
    {
      name: "Satin Cami Top", cat: "Tops", price: 999, mrp: 1499,
      colors: ["#c9506b", "#e8b94d"], sizes: ["XS", "S", "M"],
      rating: 4.6, reviews: 74, trending: 0,
      image: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=800&h=1000&fit=crop&q=80",
      description: "A silky satin cami with adjustable straps and a subtle sheen, equally at home under a blazer or on its own.",
    },
    {
      name: "Ribbed Bodycon Dress", cat: "Dresses", price: 1499, mrp: 1999,
      colors: ["#ff3e7f", "#3b3540"], sizes: ["XS", "S", "M", "L"],
      rating: 4.3, reviews: 69, trending: 0,
      image: "https://images.unsplash.com/photo-1568252542512-9fe8fe9c87bb?w=800&h=1000&fit=crop&q=80",
      description: "A stretch ribbed bodycon with a square neckline, built to hold its shape from the first wear to the fiftieth.",
    },
    {
      name: "Corduroy Flare Skirt", cat: "Cords", price: 1399, mrp: 1999,
      colors: ["#c9506b", "#e8b94d"], sizes: ["XS", "S", "M", "L"],
      rating: 4.6, reviews: 77, trending: 0,
      image: "https://images.unsplash.com/photo-1585487000160-6ebcfceb0d03?w=800&h=1000&fit=crop&q=80",
      description: "A knee-length corduroy skirt with a flared hem and side zip, styled easily with tucked-in tops and ankle boots.",
    },
  ];

  const insertProduct = db.prepare(`
    INSERT INTO products (name, cat, price, mrp, sizes, colors, rating, reviews, image, description, trending)
    VALUES (@name, @cat, @price, @mrp, @sizes, @colors, @rating, @reviews, @image, @description, @trending)
  `);

  const insertProducts = db.transaction((rows) => {
    for (const r of rows) {
      insertProduct.run({
        name: r.name, cat: r.cat, price: r.price, mrp: r.mrp,
        sizes: JSON.stringify(r.sizes), colors: JSON.stringify(r.colors),
        rating: r.rating, reviews: r.reviews,
        image: r.image, description: r.description, trending: r.trending,
      });
    }
  });

  insertProducts(seed);
  console.log(`Seeded ${seed.length} products into flare.db`);
}

/* ---------- Backfill real photos onto rows seeded before images existed ---------- */
/* Safe to run every startup: only touches rows that still have an empty image
   and whose name matches one of our original seed products. Never overwrites
   an image an admin has already set. */

const seedImages = {
  "Wide-Leg Cargo Cords": "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=800&h=1000&fit=crop&q=80",
  "Flared Corduroy Trousers": "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=800&h=1000&fit=crop&q=80",
  "Cropped Rib Knit Top": "https://images.unsplash.com/photo-1566174053879-31528523f8ae?w=800&h=1000&fit=crop&q=80",
  "Floral Wrap Midi Dress": "https://images.unsplash.com/photo-1571945153237-4929e783af4a?w=800&h=1000&fit=crop&q=80",
  "Corduroy Co-ord Set": "https://images.unsplash.com/photo-1622445275576-721325763afe?w=800&h=1000&fit=crop&q=80",
  "Straight Fit Denim Jeans": "https://images.unsplash.com/photo-1560243563-062bfc001d68?w=800&h=1000&fit=crop&q=80",
  "Satin Cami Top": "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=800&h=1000&fit=crop&q=80",
  "Ribbed Bodycon Dress": "https://images.unsplash.com/photo-1568252542512-9fe8fe9c87bb?w=800&h=1000&fit=crop&q=80",
  "Corduroy Flare Skirt": "https://images.unsplash.com/photo-1585487000160-6ebcfceb0d03?w=800&h=1000&fit=crop&q=80",
};

const backfillImage = db.prepare("UPDATE products SET image = ? WHERE name = ? AND (image IS NULL OR image = '')");
const backfillTx = db.transaction(() => {
  for (const [name, url] of Object.entries(seedImages)) backfillImage.run(url, name);
});
backfillTx();

/* ---------- Seed homepage settings (only runs once) ---------- */

const existingSettings = db.prepare("SELECT COUNT(*) AS c FROM settings").get().c;

if (existingSettings === 0) {
  const defaults = {
    hero_eyebrow: "✦ New Season Drop",
    hero_title_1: "Cords that",
    hero_title_2: "hit different.",
    hero_subtitle: "Wide-leg, flared, cropped — corduroy pants and everyday fits designed for girls who move fast and dress louder. Premium fabric, unreal prices.",
    hero_cta_primary: "Shop Cords",
    hero_cta_secondary: "Explore All",
    hero_badge: "🔥 Bestseller",
    deposit_percent: "20",
  };

  const insertSetting = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
  const insertSettings = db.transaction((obj) => {
    for (const key of Object.keys(obj)) insertSetting.run(key, obj[key]);
  });
  insertSettings(defaults);
  console.log("Seeded default homepage settings");
}

// Backfill deposit_percent for databases seeded before payments existed —
// never overwrites a value the admin has already set.
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('deposit_percent', '20')").run();

module.exports = db;
