/* ==========================================================
   FLARE — SQLite data layer
   Stores every product the storefront and admin panel share.
   File lives at ./data/flare.db so it persists between restarts.
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
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const existing = db.prepare("SELECT COUNT(*) AS c FROM products").get().c;

if (existing === 0) {
  const seed = [
    { name:"Wide-Leg Cargo Cords",       cat:"Cords",   price:1799, mrp:2599, colors:["#8f6ed6","#3b3540"], sizes:["XS","S","M","L","XL"], rating:4.6, reviews:128 },
    { name:"High-Rise Straight Cords",   cat:"Cords",   price:1999, mrp:2799, colors:["#e8b94d","#a8763e"], sizes:["S","M","L","XL"],     rating:4.4, reviews:87  },
    { name:"Flared Corduroy Trousers",   cat:"Cords",   price:2099, mrp:2999, colors:["#c9506b","#3b3540"], sizes:["XS","S","M","L"],     rating:4.7, reviews:203 },
    { name:"Baggy Fit Corduroy Pants",   cat:"Cords",   price:1899, mrp:2499, colors:["#5c6bc0","#8f6ed6"], sizes:["S","M","L","XL"],     rating:4.3, reviews:64  },
    { name:"Cropped Rib Knit Top",       cat:"Tops",    price:899,  mrp:1299, colors:["#ff3e7f","#3b3540"], sizes:["XS","S","M","L"],     rating:4.5, reviews:156 },
    { name:"Oversized Graphic Tee",      cat:"Tops",    price:749,  mrp:999,  colors:["#4c8b7c","#3b3540"], sizes:["S","M","L","XL"],     rating:4.2, reviews:92  },
    { name:"Satin Cami Top",             cat:"Tops",    price:999,  mrp:1499, colors:["#c9506b","#e8b94d"], sizes:["XS","S","M"],         rating:4.6, reviews:74  },
    { name:"Puff Sleeve Blouse",         cat:"Tops",    price:1199, mrp:1699, colors:["#3b3540","#8f6ed6"], sizes:["S","M","L"],          rating:4.4, reviews:51  },
    { name:"Floral Wrap Midi Dress",     cat:"Dresses", price:1699, mrp:2399, colors:["#8f6ed6","#c9506b"], sizes:["XS","S","M","L"],     rating:4.8, reviews:241 },
    { name:"Denim Shirt Dress",          cat:"Dresses", price:1899, mrp:2599, colors:["#5c6bc0","#3b3540"], sizes:["S","M","L"],          rating:4.5, reviews:118 },
    { name:"Ribbed Bodycon Dress",       cat:"Dresses", price:1499, mrp:1999, colors:["#ff3e7f","#3b3540"], sizes:["XS","S","M","L"],     rating:4.3, reviews:69  },
    { name:"Corduroy Co-ord Set",        cat:"Co-ords", price:2499, mrp:3299, colors:["#e8b94d","#8f6ed6"], sizes:["S","M","L"],          rating:4.7, reviews:98  },
    { name:"Knit Top & Skirt Set",       cat:"Co-ords", price:2199, mrp:2999, colors:["#4c8b7c","#c9506b"], sizes:["XS","S","M","L"],     rating:4.5, reviews:83  },
    { name:"Straight Fit Denim Jeans",   cat:"Denim",   price:1599, mrp:2199, colors:["#5c6bc0","#3b3540"], sizes:["S","M","L","XL"],     rating:4.4, reviews:172 },
    { name:"Distressed Boyfriend Jeans", cat:"Denim",   price:1699, mrp:2399, colors:["#a8763e","#3b3540"], sizes:["S","M","L"],          rating:4.2, reviews:59  },
    { name:"Corduroy Flare Skirt",       cat:"Cords",   price:1399, mrp:1999, colors:["#c9506b","#e8b94d"], sizes:["XS","S","M","L"],     rating:4.6, reviews:77  },
  ];

  const insert = db.prepare(`
    INSERT INTO products (name, cat, price, mrp, sizes, colors, rating, reviews, image, description)
    VALUES (@name, @cat, @price, @mrp, @sizes, @colors, @rating, @reviews, '', '')
  `);

  const insertMany = db.transaction((rows) => {
    for (const r of rows) {
      insert.run({
        name: r.name, cat: r.cat, price: r.price, mrp: r.mrp,
        sizes: JSON.stringify(r.sizes), colors: JSON.stringify(r.colors),
        rating: r.rating, reviews: r.reviews,
      });
    }
  });

  insertMany(seed);
  console.log(`Seeded ${seed.length} products into flare.db`);
}

module.exports = db;
