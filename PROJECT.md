# FLARE — girls' cords & clothing store

Live project (not a demo/throwaway build). Started 2026-07-14, styled after Snitch.com's bold storefront feel, adapted for a girls' cords & clothing brand called **FLARE**.

## What this is

A storefront (browse, filter, product detail, cart) plus a small admin panel, backed by a real Node server and a SQLite database — so products added through the admin panel show up for every visitor, not just in one browser.

## Current features

- **Storefront**: home page, shop/listing page with category + size + price filters and sorting, product detail page (gallery, color/size picker, tabs, related products), cart page with quantity controls and order summary.
- **Mobile responsive**: breakpoints at 1024 / 900 / 768 / 640 / 420px covering nav (burger menu below 900px), hero, product grid, filters, product detail layout, and cart rows.
- **Cart**: persisted per-browser in `localStorage` (key `flareCart`) — this is normal shopping-cart behavior, not something that needs a backend.
- **Product images**: placeholder photos from picsum.photos, seeded per product id (`demoImg()` in `js/script.js`) so each product keeps a consistent-looking photo. Swap these for real product photography whenever it's ready — either paste a real image URL into the admin panel's "Image URL" field per product, or replace the `demoImg()` helper.
- **Admin panel** (`admin.html`): password-gated. Lets you add, edit, and delete products (name, category, price, MRP, sizes, colors, rating, review count, image URL, description). Changes are stored in the shared database and immediately visible to all storefront visitors.

## Architecture

```
demoWeb/
├── index.html, shop.html, product.html, cart.html   ← storefront pages
├── admin.html                                        ← admin panel page
├── css/style.css                                     ← storefront styles
├── css/admin.css                                      ← admin-only styles
├── js/script.js                                       ← storefront logic, fetches products from /api/products
├── js/admin.js                                        ← admin panel logic, calls /api/admin/login + /api/products
├── server.js                                          ← Express server: serves the site + the API
├── db.js                                              ← SQLite setup, schema, and seed data
├── data/flare.db                                      ← the database file (created on first run, gitignored)
└── package.json
```

One Node process serves everything — static pages and the API — so there's only one thing to run or deploy.

### Why a real backend instead of localStorage

Originally considered a localStorage-only admin (no server), but the requirement was that admin-added products show up for **every** visitor, not just the browser that added them. That needs shared, server-side storage — hence Express + SQLite.

### API

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/api/products` | none | list all products (used by storefront + admin) |
| GET | `/api/products/:id` | none | single product |
| POST | `/api/products` | admin token | create product |
| PUT | `/api/products/:id` | admin token | update product |
| DELETE | `/api/products/:id` | admin token | delete product |
| POST | `/api/admin/login` | none | exchange admin password for a JWT (12h expiry) |

Admin routes require an `Authorization: Bearer <token>` header. The admin panel handles this automatically once you log in.

## Running it locally

```bash
npm install
npm start
```

Then open:
- Storefront: http://localhost:3000
- Admin panel: http://localhost:3000/admin.html

**Default admin password: `flareadmin123`** — change it by setting the `ADMIN_PASSWORD` environment variable before starting the server (and set `JWT_SECRET` to something random too). Don't ship the defaults to a public deployment.

Important: because the storefront now fetches product data from the server, opening `index.html` directly as a file (double-clicking it) will **not** work anymore — the server has to be running. This is expected now that there's a real backend.

## Deployment

This is a small persistent Node server with a SQLite file on disk — it needs a host that runs a long-lived Node process with writable disk, not a pure static host. Options: Render, Railway, Fly.io, or any VPS. Set `ADMIN_PASSWORD` and `JWT_SECRET` as environment variables on whichever host is used, and run `npm install && npm start`.

**GitHub**: code lives at https://github.com/parth0072/myclo.git. `git push` requires your own GitHub auth (SSH key or personal access token) — that's not something I can do on your behalf, so push it yourself from a terminal on your machine.

**Render**: `render.yaml` in this repo is a Render "blueprint" — once the repo is on GitHub, Render's dashboard can read it and set the service up automatically (build command `npm install`, start command `npm start`, `JWT_SECRET` auto-generated, `ADMIN_PASSWORD` prompted for at deploy time so it never sits in git). Deploying still requires signing into your own Render account, so that step is on you too.

**Free-tier caveat**: Render's free web service plan has an ephemeral filesystem — `data/flare.db` will reset (back to the 16 seed products) on every redeploy or when the service spins down from inactivity. Fine for testing, not fine for a real store where admin-added products need to stick around. For real persistence, either upgrade to a paid Render instance and add a persistent disk mounted at `data/`, or migrate off SQLite to a hosted database (e.g., Render's managed Postgres) later.

## Notes for future sessions

- Product `id`, category, price, etc. all live in the database now — the old hardcoded `PRODUCTS` array in `js/script.js` is gone, replaced by `loadProducts()` which fetches from the API.
- The gradient CSS classes (`.g1`–`.g8`) are still used as a loading-state background behind product images; they're computed from `id % 8` server-side (see `formatProduct` in `server.js`), not stored per-product.
- `server.js` blocks direct HTTP access to itself, `db.js`, `package.json`, and the `/data` folder — don't remove that middleware, it's the only thing stopping the admin password defaults and the raw database file from being publicly downloadable.
