# FLARE — girls' cords & clothing store

Live project (not a demo/throwaway build). Started 2026-07-14, styled after Snitch.com's bold storefront feel, adapted for a girls' cords & clothing brand called **FLARE**.

## What this is

A storefront (browse, filter, product detail, cart) plus a small admin panel, backed by a real Node server and a SQLite database — so products added through the admin panel show up for every visitor, not just in one browser.

## Current features

- **Storefront**: home page, shop/listing page with category + size + price filters and sorting, product detail page (gallery, color/size picker, tabs, related products), cart page with quantity controls and order summary.
- **Mobile responsive**: breakpoints at 1024 / 900 / 768 / 640 / 420px covering nav (burger menu below 900px), hero, product grid, filters, product detail layout, and cart rows.
- **Cart**: persisted per-browser in `localStorage` (key `flareCart`) — this is normal shopping-cart behavior, not something that needs a backend.
- **Product images**: the 9 seed products each have a real, verified clothing photo (curated Unsplash URLs, stored in each product's `image` field via `db.js`). Products without an `image` set (e.g. new ones added via admin without an Image URL) fall back to a picsum.photos placeholder (`demoImg()` in `js/script.js`) so the layout never shows a broken image. Swap in real product photography anytime via the admin panel's "Image URL" field per product.
- **App-like mobile experience**: a fixed bottom tab bar (Home / Shop / Cart / Menu) appears on phones (≤640px), mirroring common shopping-app navigation; `manifest.json` + `icon.svg` + apple meta tags let the site be added to a phone's home screen and open full-screen like an installed app.
- **Product catalog**: 9 curated seed products (trimmed down from an earlier 16-item placeholder catalog) with real one-line descriptions instead of blank filler. 3 are marked `trending`.
- **Trending products**: products can be flagged "Trending" from the admin panel. The homepage hero's price tag ("Starting ₹X") is computed live from whichever products are marked trending — no manual price editing needed. Bestsellers on the homepage also show trending items first.
- **Admin-editable homepage hero**: the hero's eyebrow tag, headline (two lines), subtitle, both button labels, and badge text are all stored in the database (`settings` table) and editable from the admin panel's "Homepage Content" tab, with a live preview that updates as you type — no code changes or redeploys needed to update the homepage pitch.
- **Admin panel** (`/admin`, or `admin.html` directly): password-gated, with three tabs:
  - **Products** — add/edit/delete products (name, category, price, MRP, sizes, colors, rating, review count, image URL, description, trending flag), plus a search box to filter the product table by name/category.
  - **Homepage Content** — edit the hero copy described above, with an instant live preview panel.
  - **Bookings & Payments** — stat cards (total orders, deposits collected, balance pending, total order value), deposit percentage setting, and a table of every reservation (customer, shipping address, items, order total, deposit paid, balance due, payment status, and an editable **tracking status** dropdown per order).
  Changes in all tabs are stored in the shared database and immediately visible to all storefront visitors.
- **Pre-sale / pre-book checkout with Razorpay**: instead of a full checkout, the cart page's "Reserve Now" button collects the customer's name/phone/shipping address and charges a partial **deposit** (admin-configurable percentage of the order total, default 20%) via Razorpay's hosted checkout. The balance is tracked as "due later" per reservation. See the "Payments" section below for how this actually works and what you need to do to go live with real money.
- **Customer accounts (required before checkout)**: shoppers must sign in — email/password or "Sign in with Google" — before they can pay a deposit. The account modal (`openAccountModal()` in `js/script.js`) is on every storefront page via the header's Account icon. Session is a JWT kept in `localStorage` (`flareCustomerToken`), separate from the admin token.
- **Order tracking for customers**: `orders.html` ("My Orders") lists every reservation tied to the signed-in account, with a visual step tracker (Reserved → Confirmed → Packed → Shipped → Out for Delivery → Delivered, or a red "Cancelled" badge) driven by the same `tracking_status` the admin sets.

## Architecture

```
demoWeb/
├── index.html, shop.html, product.html, cart.html   ← storefront pages (each has a mobile-tabbar nav + account modal)
├── orders.html                                       ← "My Orders" customer order-tracking page
├── admin.html                                        ← admin panel page
├── manifest.json, icon.svg                           ← PWA / add-to-home-screen assets
├── css/style.css                                     ← storefront styles (incl. account modal, order tracker)
├── css/admin.css                                      ← admin-only styles
├── js/script.js                                       ← storefront logic: products, cart, Razorpay checkout, customer auth, order tracking
├── js/admin.js                                        ← admin panel logic: products, settings, bookings + tracking status
├── server.js                                          ← Express server: site + API, Razorpay routes, customer auth routes
├── db.js                                              ← SQLite setup, schema (products, settings, bookings, customers), seed data + migrations
├── data/flare.db                                      ← the database file (created on first run, gitignored)
├── .env.example                                       ← template for local env vars (copy to .env, never commit .env)
└── package.json
```

One Node process serves everything — static pages and the API — so there's only one thing to run or deploy.

### Why a real backend instead of localStorage

Originally considered a localStorage-only admin (no server), but the requirement was that admin-added products show up for **every** visitor, not just the browser that added them. That needs shared, server-side storage — hence Express + SQLite.

### API

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/api/products` | none | list all products (used by storefront + admin) — each includes a `trending` boolean |
| GET | `/api/products/:id` | none | single product |
| POST | `/api/products` | admin token | create product (accepts `trending: true/false`) |
| PUT | `/api/products/:id` | admin token | update product |
| DELETE | `/api/products/:id` | admin token | delete product |
| POST | `/api/admin/login` | none | exchange admin password for a JWT (12h expiry) |
| GET | `/api/settings` | none | homepage hero copy + `deposit_percent` as a flat key/value object |
| PUT | `/api/settings` | admin token | update any subset of settings keys (partial updates supported) |
| POST | `/api/auth/register` | none | create a customer account (name, email, phone, password), returns a customer JWT |
| POST | `/api/auth/login` | none | email + password login, returns a customer JWT |
| POST | `/api/auth/google` | none | verifies a Google ID token server-side, creates or logs in the matching customer account |
| GET | `/api/auth/me` | customer token | returns the signed-in customer's profile |
| GET | `/api/config` | none | public config the frontend needs, currently just `google_client_id` (empty string if Google sign-in isn't configured) |
| POST | `/api/checkout/create-order` | customer token | recomputes cart total server-side from the DB, creates a Razorpay order for the deposit amount, inserts a `bookings` row tied to the signed-in customer |
| POST | `/api/checkout/verify` | customer token | verifies the Razorpay payment signature (HMAC-SHA256) and that the booking belongs to the caller, marks it `paid` |
| GET | `/api/my-orders` | customer token | the signed-in customer's own bookings, with tracking status |
| GET | `/api/bookings` | admin token | list all reservations (customer, address, items, deposit paid, balance due, status, tracking status) |
| PATCH | `/api/bookings/:id/tracking` | admin token | update a booking's `tracking_status` (reserved/confirmed/packed/shipped/out_for_delivery/delivered/cancelled) and/or `tracking_note` |

Admin routes require an `Authorization: Bearer <admin-token>` header (from `/api/admin/login`); customer routes require an `Authorization: Bearer <customer-token>` header (from `/api/auth/*`) — these are two separate token types, both JWTs signed with `JWT_SECRET` but with a different `role` claim, so an admin token can't be used to call customer routes or vice versa.

Settings keys: `hero_eyebrow`, `hero_title_1`, `hero_title_2`, `hero_subtitle`, `hero_cta_primary`, `hero_cta_secondary`, `hero_badge`, `deposit_percent`. The hero's price tag isn't a stored setting — it's computed on the frontend from whichever products have `trending: true`.

## Payments (Razorpay pre-book deposits)

This is real-money functionality on a live production site — treat it with care.

**How it works:** on the cart page, "Reserve Now — Pay Deposit" opens a form for name/phone/email, then charges a **deposit** — a percentage of the order total, set by the admin (`deposit_percent` setting, default 20%) — through Razorpay's hosted Checkout.js. The server never sees raw card details (Razorpay's checkout is PCI-compliant and hosted by Razorpay), and always recomputes the order total from the database (never trusts prices sent by the browser), so a tampered request can't reserve items for less than they cost. After payment, the client sends Razorpay's payment ID + signature to `/api/checkout/verify`, which checks the signature with HMAC-SHA256 using your secret key before marking the booking `paid`. The balance (order total minus deposit) is tracked per booking and shown in the admin "Bookings & Payments" tab — collecting it is a manual/offline step (call the customer, collect on delivery, etc.), not automated yet.

**What you need to do yourself (I can't do this on your behalf):**
1. Create a Razorpay account at razorpay.com and complete their KYC/business verification for a **live** account. Until that's done, use **test mode**.
2. From the Razorpay Dashboard → Settings → API Keys, generate a key pair. Test mode keys look like `rzp_test_...`; live keys look like `rzp_live_...`.
3. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` as environment variables — locally via a `.env` file (copy `.env.example`, never commit `.env`), and on Render via the dashboard's Environment tab (or the blueprint prompt, since `render.yaml` now declares both as `sync: false`).
4. **Test the full flow with test-mode keys first.** Razorpay's test mode accepts fake card numbers (see their docs) so you can confirm create-order → checkout modal → verify → booking-marked-paid works end-to-end before any real money is involved.
5. Only switch to live keys once you've tested thoroughly and your Razorpay account is fully verified.

Until `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` are set, `/api/checkout/create-order` returns a 503 with a clear "payments aren't configured yet" message instead of crashing — the rest of the site works normally.

**Not legal/compliance advice, but worth flagging:** collecting deposits for pre-orders may carry consumer-protection obligations depending on your jurisdiction (clear refund policy, expected delivery/fulfillment timeline, what happens if an item goes out of stock after a deposit is paid). Worth a quick check before taking real payments at scale.

## Customer accounts & Google Sign-In

Checkout is gated behind a customer account — shoppers must register or sign in before they can pay a deposit.

**How it works:** Email/password accounts hash the password with Node's built-in `scrypt` (salted, no extra dependency). Google Sign-In uses [Google Identity Services](https://developers.google.com/identity/gsi/web) on the frontend (`accounts.google.com/gsi/client`, loaded on every storefront page) — clicking the Google button gets an ID token from Google directly in the browser, which the frontend then POSTs to `/api/auth/google`. The server verifies that token server-side with `google-auth-library` before trusting it, so a forged token can't create a fake login. Both flows issue the same kind of JWT (30-day expiry, kept in `localStorage` as `flareCustomerToken`), and both a `customers` row and a JWT are enough to place an order — no email verification step exists yet.

**What you need to do yourself (I can't create this for you):**
1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → Create Credentials → OAuth client ID → type "Web application".
2. Add your site's origins under "Authorized JavaScript origins" — e.g. `http://localhost:3000` for local dev and your Render URL (`https://flare-site.onrender.com`) for production. No redirect URI is needed for this flow.
3. Copy the generated **Client ID** (looks like `xxxx.apps.googleusercontent.com`) and set it as `GOOGLE_CLIENT_ID` — locally in `.env`, and on Render via the dashboard (declared as `sync: false` in `render.yaml`). No client secret is needed.
4. Until `GOOGLE_CLIENT_ID` is set, the Google button just doesn't render (`/api/config` returns an empty `google_client_id`, and `initGoogleSignIn()` in `js/script.js` hides the button) — email/password sign-in keeps working regardless.

**Tracking:** admin manually moves each order through stages (Reserved → Confirmed → Packed → Shipped → Out for Delivery → Delivered, or Cancelled) from the Bookings & Payments tab — there's no live courier/carrier integration (e.g. Shiprocket/Delhivery) wired up. If that's wanted later, it would replace or extend the `PATCH /api/bookings/:id/tracking` endpoint with real carrier webhooks.

## Running it locally

```bash
npm install
cp .env.example .env   # then fill in ADMIN_PASSWORD, JWT_SECRET, and Razorpay test keys
npm start
```

Then open:
- Storefront: http://localhost:3000
- Admin panel: http://localhost:3000/admin

**Default admin password: `flareadmin123`** — change it by setting the `ADMIN_PASSWORD` environment variable before starting the server (and set `JWT_SECRET` to something random too). Don't ship the defaults to a public deployment.

Important: because the storefront now fetches product data from the server, opening `index.html` directly as a file (double-clicking it) will **not** work anymore — the server has to be running. This is expected now that there's a real backend.

## Deployment

This is a small persistent Node server with a SQLite file on disk — it needs a host that runs a long-lived Node process with writable disk, not a pure static host. Options: Render, Railway, Fly.io, or any VPS. Set `ADMIN_PASSWORD` and `JWT_SECRET` as environment variables on whichever host is used, and run `npm install && npm start`.

**GitHub**: code lives at https://github.com/parth0072/myclo.git. `git push` requires your own GitHub auth (SSH key or personal access token) — that's not something I can do on your behalf, so push it yourself from a terminal on your machine.

**Render**: `render.yaml` in this repo is a Render "blueprint" — once the repo is on GitHub, Render's dashboard can read it and set the service up automatically (build command `npm install`, start command `npm start`, `JWT_SECRET` auto-generated, `ADMIN_PASSWORD` prompted for at deploy time so it never sits in git). Deploying still requires signing into your own Render account, so that step is on you too.

**Free-tier caveat**: Render's free web service plan has an ephemeral filesystem — `data/flare.db` will reset (back to the 9 seed products and default hero copy) on every redeploy or when the service spins down from inactivity. Fine for testing, **not fine once real payments are involved** — a redeploy would wipe the `bookings` table and you'd lose the record of who paid a deposit and what they're owed. Before taking real customer payments, upgrade to a paid Render instance with a persistent disk mounted at `data/`, or migrate off SQLite to a hosted database (e.g., Render's managed Postgres).

## Notes for future sessions

- Product `id`, category, price, etc. all live in the database now — the old hardcoded `PRODUCTS` array in `js/script.js` is gone, replaced by `loadProducts()` which fetches from the API. Homepage hero copy similarly comes from `loadSettings()` fetching `/api/settings`, not hardcoded HTML.
- The gradient CSS classes (`.g1`–`.g8`) are still used as a loading-state background behind product images; they're computed from `id % 8` server-side (see `formatProduct` in `server.js`), not stored per-product.
- `server.js` blocks direct HTTP access to itself, `db.js`, `package.json`, and the `/data` folder — don't remove that middleware, it's the only thing stopping the admin password defaults and the raw database file from being publicly downloadable.
- The `settings` table is a plain key/value store (`key TEXT PRIMARY KEY, value TEXT`) so adding more editable homepage fields later is just adding a key to `SETTINGS_KEYS` in `server.js` plus a form field in `admin.html` — no schema migration needed.
- Admin panel now has two tabs (`switchTab()` in `js/admin.js`): Products and Homepage Content. If adding a third tab (e.g. site-wide banner text, footer links), follow the same `tab-panel-admin` / `tab-link` pattern for consistency.
- Product images: `db.js` seeds each of the 9 products with a real Unsplash photo URL in the `image` column, plus a startup "backfill" query that fills in `image` for any row matching a seed product name whose image is still blank (safe to leave in — it never overwrites an image an admin has set). Frontend rendering goes through `productImage(p, w, h)` in `js/script.js`, which prefers `p.image` and falls back to the picsum placeholder — any new image logic should go through that helper, not call `demoImg()` directly.
- `icon.svg` is a plain SVG (not a raster PNG) used for the favicon, apple-touch-icon, and manifest icon — this was a deliberate tool constraint (no way to write binary PNG bytes in this environment), and works in effectively all modern browsers/iOS versions for home-screen install. If pixel-perfect PNG icons matter later, generate proper 192x192/512x512 PNGs and swap the `<link>`/manifest references.
- **Payments**: `server.js` only initializes the Razorpay SDK if both `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are set in the environment — see the "Payments" section above for what the user needs to do to get real keys. `/api/checkout/create-order` is the only place order totals are computed; it always re-reads prices from the `products` table rather than trusting the client, so don't "optimize" that by accepting a client-sent total. Signature verification in `/api/checkout/verify` uses `crypto.timingSafeEqual` — don't swap that for a plain `===` string compare, timing attacks are a real (if narrow) risk on signature checks. The `bookings` table records every reservation attempt; a booking only flips to `status: 'paid'` after signature verification succeeds, so `created`-status rows are abandoned/incomplete checkouts, not paid orders.
- Local dev now loads a `.env` file via `dotenv` (see `.env.example`) — Render doesn't need this since it injects env vars directly into the process, but it makes `RAZORPAY_KEY_ID`/`SECRET`/`ADMIN_PASSWORD`/`JWT_SECRET`/`GOOGLE_CLIENT_ID` easy to set locally without exporting shell vars every session.
- **Customer accounts**: there are now two independent JWT "roles" — `role: "admin"` (from `/api/admin/login`) and `role: "customer"` (from `/api/auth/*`), both signed with the same `JWT_SECRET` but checked separately by `requireAdmin` vs `requireCustomer` in `server.js`. Don't merge these or let one token type satisfy the other's middleware. Customer session state lives in `localStorage` under `flareCustomerToken` + `flareCustomer` (see `getCustomer()`/`setCustomerSession()` in `js/script.js`) — separate keys from the admin panel's `flareAdminToken`.
- The account login/register modal markup is duplicated across `index.html`, `shop.html`, `product.html`, `cart.html`, and `orders.html` (same pattern as the mobile-tabbar) — if you add a new storefront page, copy the `#account-modal` block and the two `<script>` tags (`accounts.google.com/gsi/client` + `js/script.js`) from any existing page rather than reinventing it.
- **Tracking status** lives on the `bookings` row (`tracking_status`, default `'reserved'`) and is a fixed enum (`TRACKING_STATUSES` in `server.js` — keep the admin dropdown in `admin.html`/`js/admin.js` and the customer stepper in `js/script.js`'s `TRACKING_STAGES` in sync if this list ever changes). Admin updates it via `PATCH /api/bookings/:id/tracking`; customers only ever read it via `GET /api/my-orders`, scoped to their own `customer_id` — never trust a client-supplied customer id anywhere, always derive it from the verified JWT (`req.customerId`).
- `db.js` migrates the `bookings` table for pre-existing databases (`customer_id`, `shipping_address`, `tracking_status`, `tracking_note`, `updated_at` via `PRAGMA table_info` + conditional `ALTER TABLE`) since SQLite has no "ADD COLUMN IF NOT EXISTS". If you add more columns later, follow the same `bookingMigrations` array pattern instead of assuming a fresh table.
