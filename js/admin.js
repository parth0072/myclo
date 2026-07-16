/* ==========================================================
   FLARE — Admin panel logic
   Talks to the same server (server.js) via the /api/products
   and /api/admin/login endpoints. Token is kept in
   localStorage only for this browser's admin session.
   ========================================================== */

const TOKEN_KEY = "flareAdminToken";
let ALL_PRODUCTS = [];
let editingId = null;
let SETTINGS = {};
let tableSearchTerm = "";

function getToken(){ return localStorage.getItem(TOKEN_KEY); }
function setToken(t){ localStorage.setItem(TOKEN_KEY, t); }
function clearToken(){ localStorage.removeItem(TOKEN_KEY); }

function showLogin(message){
  document.getElementById("dashboard-screen").style.display = "none";
  document.getElementById("login-screen").style.display = "flex";
  const err = document.getElementById("login-error");
  if(message){
    err.textContent = message;
    err.classList.add("show");
  } else {
    err.classList.remove("show");
  }
}

function showDashboard(){
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("dashboard-screen").style.display = "block";
  refreshProducts();
  loadSettingsAdmin();
  switchTab("products");
}

/* ---------- Auth ---------- */

async function login(){
  const password = document.getElementById("login-password").value;
  const btn = document.getElementById("login-btn");
  btn.disabled = true; btn.textContent = "Signing in...";
  try{
    const res = await fetch("/api/admin/login", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if(!res.ok){
      showLogin(data.error || "Incorrect password. Try again.");
      return;
    }
    setToken(data.token);
    showDashboard();
  }catch(e){
    showLogin("Couldn't reach the server. Is it running?");
  }finally{
    btn.disabled = false; btn.textContent = "Sign In";
  }
}

function logout(){
  clearToken();
  showLogin();
}

async function authedFetch(url, options={}){
  const token = getToken();
  const res = await fetch(url, {
    ...options,
    headers:{
      ...(options.headers||{}),
      "Authorization": `Bearer ${token}`
    }
  });
  if(res.status === 401){
    clearToken();
    showLogin("Your session expired. Please sign in again.");
    throw new Error("unauthorized");
  }
  return res;
}

/* ---------- Product list + stats ---------- */

async function refreshProducts(){
  const res = await fetch("/api/products");
  ALL_PRODUCTS = await res.json();
  renderStats();
  renderTable();
  updateHeroPreview();
}

function renderStats(){
  const count = ALL_PRODUCTS.length;
  const cats = new Set(ALL_PRODUCTS.map(p=>p.cat)).size;
  const avgPrice = count ? Math.round(ALL_PRODUCTS.reduce((s,p)=>s+p.price,0)/count) : 0;
  const avgRating = count ? (ALL_PRODUCTS.reduce((s,p)=>s+Number(p.rating||0),0)/count).toFixed(1) : "0.0";
  document.getElementById("stat-count").textContent = count;
  document.getElementById("stat-cats").textContent = cats;
  document.getElementById("stat-avgprice").textContent = `₹${avgPrice}`;
  document.getElementById("stat-avgrating").textContent = avgRating;
}

function renderTable(){
  const tbody = document.getElementById("product-tbody");

  const term = tableSearchTerm.trim().toLowerCase();
  const filtered = term
    ? ALL_PRODUCTS.filter(p => p.name.toLowerCase().includes(term) || p.cat.toLowerCase().includes(term))
    : ALL_PRODUCTS;

  document.getElementById("table-count").textContent = `${filtered.length} of ${ALL_PRODUCTS.length} products`;

  if(!filtered.length){
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">${ALL_PRODUCTS.length ? "No products match your search." : "No products yet — add your first one above."}</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(p=>{
    const dotColor = (p.colors && p.colors[0]) || "#ccc";
    return `
    <tr>
      <td>${p.trending ? '<span class="trend-star" title="Trending">★</span>' : ''}</td>
      <td><span class="p-swatch-dot" style="background:${dotColor}"></span>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.cat)}</td>
      <td>₹${p.price}</td>
      <td>₹${p.mrp}</td>
      <td>${p.rating}</td>
      <td>
        <div class="row-actions">
          <button onclick="startEdit(${p.id})">Edit</button>
          <button class="danger" onclick="deleteProduct(${p.id})">Delete</button>
        </div>
      </td>
    </tr>`;
  }).join("");
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, ch => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[ch]));
}

/* ---------- Form ---------- */

function openForm(){
  document.getElementById("product-form").classList.add("open");
  document.getElementById("toggle-form-btn").textContent = "Hide Form";
}
function closeForm(){
  document.getElementById("product-form").classList.remove("open");
  document.getElementById("toggle-form-btn").textContent = "+ Add Product";
  document.getElementById("product-form").reset();
  document.getElementById("p-id").value = "";
  document.getElementById("p-trending").checked = false;
  editingId = null;
  document.getElementById("form-error").classList.remove("show");
  document.getElementById("save-btn").textContent = "Save Product";
}

function startEdit(id){
  const p = ALL_PRODUCTS.find(x=>x.id===id);
  if(!p) return;
  editingId = id;
  document.getElementById("p-id").value = p.id;
  document.getElementById("p-name").value = p.name;
  document.getElementById("p-cat").value = p.cat;
  document.getElementById("p-price").value = p.price;
  document.getElementById("p-mrp").value = p.mrp;
  document.getElementById("p-sizes").value = (p.sizes||[]).join(", ");
  document.getElementById("p-colors").value = (p.colors||[]).join(", ");
  document.getElementById("p-rating").value = p.rating;
  document.getElementById("p-reviews").value = p.reviews;
  document.getElementById("p-image").value = p.image || "";
  document.getElementById("p-description").value = p.description || "";
  document.getElementById("p-trending").checked = !!p.trending;
  document.getElementById("save-btn").textContent = "Update Product";
  openForm();
  document.getElementById("product-form").scrollIntoView({behavior:"smooth", block:"start"});
}

async function deleteProduct(id){
  const p = ALL_PRODUCTS.find(x=>x.id===id);
  if(!confirm(`Delete "${p ? p.name : "this product"}"? This can't be undone.`)) return;
  try{
    const res = await authedFetch(`/api/products/${id}`, { method:"DELETE" });
    if(!res.ok){
      const data = await res.json();
      alert(data.error || "Couldn't delete product.");
      return;
    }
    await refreshProducts();
  }catch(e){ /* handled by authedFetch on 401 */ }
}

async function submitForm(e){
  e.preventDefault();
  const errBox = document.getElementById("form-error");
  errBox.classList.remove("show");

  const body = {
    name: document.getElementById("p-name").value,
    cat: document.getElementById("p-cat").value,
    price: document.getElementById("p-price").value,
    mrp: document.getElementById("p-mrp").value,
    sizes: document.getElementById("p-sizes").value,
    colors: document.getElementById("p-colors").value,
    rating: document.getElementById("p-rating").value,
    reviews: document.getElementById("p-reviews").value,
    image: document.getElementById("p-image").value,
    description: document.getElementById("p-description").value,
    trending: document.getElementById("p-trending").checked,
  };

  const id = document.getElementById("p-id").value;
  const saveBtn = document.getElementById("save-btn");
  saveBtn.disabled = true;

  try{
    const res = await authedFetch(id ? `/api/products/${id}` : "/api/products", {
      method: id ? "PUT" : "POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if(!res.ok){
      errBox.textContent = data.error || "Something went wrong.";
      errBox.classList.add("show");
      return;
    }
    closeForm();
    await refreshProducts();
  }catch(e){ /* handled by authedFetch on 401 */ }
  finally{
    saveBtn.disabled = false;
  }
}

/* ---------- Homepage content (settings) ---------- */

async function loadSettingsAdmin(){
  try{
    const res = await fetch("/api/settings");
    SETTINGS = await res.json();
  }catch(e){
    SETTINGS = {};
  }
  document.getElementById("s-eyebrow").value = SETTINGS.hero_eyebrow || "";
  document.getElementById("s-title1").value = SETTINGS.hero_title_1 || "";
  document.getElementById("s-title2").value = SETTINGS.hero_title_2 || "";
  document.getElementById("s-subtitle").value = SETTINGS.hero_subtitle || "";
  document.getElementById("s-cta1").value = SETTINGS.hero_cta_primary || "";
  document.getElementById("s-cta2").value = SETTINGS.hero_cta_secondary || "";
  document.getElementById("s-badge").value = SETTINGS.hero_badge || "";
  document.getElementById("deposit-percent").value = SETTINGS.deposit_percent || "20";
  updateHeroPreview();
}

function updateHeroPreview(){
  const val = (id) => document.getElementById(id).value;
  const setPreview = (id, text) => { document.getElementById(id).textContent = text || ""; };

  setPreview("mp-eyebrow", val("s-eyebrow"));
  setPreview("mp-title1", val("s-title1"));
  setPreview("mp-title2", val("s-title2"));
  setPreview("mp-subtitle", val("s-subtitle"));
  setPreview("mp-cta1", val("s-cta1"));
  setPreview("mp-cta2", val("s-cta2"));
  setPreview("mp-badge", val("s-badge"));

  const trending = ALL_PRODUCTS.filter(p => p.trending);
  const priceEl = document.getElementById("mp-price");
  if(trending.length){
    priceEl.textContent = `Starting ₹${Math.min(...trending.map(p=>p.price))}`;
    priceEl.style.display = "";
  } else {
    priceEl.textContent = "No trending products yet";
    priceEl.style.display = "";
  }
}

async function submitSettingsForm(e){
  e.preventDefault();
  const errBox = document.getElementById("settings-error");
  errBox.classList.remove("show");

  const body = {
    hero_eyebrow: document.getElementById("s-eyebrow").value,
    hero_title_1: document.getElementById("s-title1").value,
    hero_title_2: document.getElementById("s-title2").value,
    hero_subtitle: document.getElementById("s-subtitle").value,
    hero_cta_primary: document.getElementById("s-cta1").value,
    hero_cta_secondary: document.getElementById("s-cta2").value,
    hero_badge: document.getElementById("s-badge").value,
  };

  const btn = document.getElementById("settings-save-btn");
  const originalLabel = btn.textContent;
  btn.disabled = true;

  try{
    const res = await authedFetch("/api/settings", {
      method: "PUT",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if(!res.ok){
      errBox.textContent = data.error || "Something went wrong saving the homepage content.";
      errBox.classList.add("show");
      return;
    }
    SETTINGS = data;
    btn.textContent = "Saved ✓";
    setTimeout(()=>{ btn.textContent = originalLabel; }, 1800);
  }catch(e){ /* handled by authedFetch on 401 */ }
  finally{
    btn.disabled = false;
  }
}

/* ---------- Bookings & payments ---------- */

async function submitDepositForm(e){
  e.preventDefault();
  const errBox = document.getElementById("deposit-error");
  errBox.classList.remove("show");

  const value = document.getElementById("deposit-percent").value;
  const n = Number(value);
  if(!value || !Number.isFinite(n) || n <= 0 || n > 100){
    errBox.textContent = "Enter a percentage between 1 and 100.";
    errBox.classList.add("show");
    return;
  }

  const btn = document.getElementById("deposit-save-btn");
  const originalLabel = btn.textContent;
  btn.disabled = true;

  try{
    const res = await authedFetch("/api/settings", {
      method: "PUT",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ deposit_percent: String(n) })
    });
    const data = await res.json();
    if(!res.ok){
      errBox.textContent = data.error || "Something went wrong saving the deposit percentage.";
      errBox.classList.add("show");
      return;
    }
    SETTINGS = data;
    btn.textContent = "Saved ✓";
    setTimeout(()=>{ btn.textContent = originalLabel; }, 1800);
  }catch(e){ /* handled by authedFetch on 401 */ }
  finally{
    btn.disabled = false;
  }
}

const TRACKING_STATUSES = ["reserved", "confirmed", "packed", "shipped", "out_for_delivery", "delivered", "cancelled"];
const TRACKING_LABELS = {
  reserved: "Reserved", confirmed: "Confirmed", packed: "Packed",
  shipped: "Shipped", out_for_delivery: "Out for Delivery",
  delivered: "Delivered", cancelled: "Cancelled",
};
let ALL_BOOKINGS = [];

function renderBookingStats(bookings){
  // Test-mode bookings (no real Razorpay payment) are excluded from revenue
  // stats so they don't make the numbers look like real money collected.
  const paid = bookings.filter(b => b.status === "paid" && !b.is_test);
  const deposits = paid.reduce((s,b)=>s+b.deposit_amount, 0);
  const balancePending = paid.reduce((s,b)=>s+b.balance_due, 0);
  const orderValue = paid.reduce((s,b)=>s+b.cart_total, 0);
  document.getElementById("stat-order-count").textContent = paid.length;
  document.getElementById("stat-deposits").textContent = `₹${deposits}`;
  document.getElementById("stat-balance-pending").textContent = `₹${balancePending}`;
  document.getElementById("stat-order-value").textContent = `₹${orderValue}`;
}

async function loadBookings(){
  const tbody = document.getElementById("bookings-tbody");
  try{
    const res = await authedFetch("/api/bookings");
    const bookings = await res.json();
    ALL_BOOKINGS = bookings;
    document.getElementById("bookings-count").textContent = `${bookings.length} reservation${bookings.length===1?"":"s"}`;
    renderBookingStats(bookings);

    if(!bookings.length){
      tbody.innerHTML = `<tr class="empty-row"><td colspan="9">No reservations yet. They'll show up here as customers pay their deposit at checkout.</td></tr>`;
      return;
    }

    tbody.innerHTML = bookings.map(b=>{
      const itemsSummary = (b.items||[]).map(i=>`${i.name} ×${i.qty}`).join(", ");
      const statusClass = b.status === "paid" ? "status-paid" : b.status === "failed" ? "status-failed" : "status-pending";
      const date = new Date(b.created_at).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" });
      const trackingOptions = TRACKING_STATUSES.map(s =>
        `<option value="${s}" ${b.tracking_status===s?"selected":""}>${TRACKING_LABELS[s]}</option>`
      ).join("");
      return `
      <tr>
        <td>${escapeHtml(b.customer_name)}<br><span style="color:var(--gray);font-size:12px;">${escapeHtml(b.customer_phone)}</span></td>
        <td style="max-width:180px;white-space:normal;font-size:12px;color:var(--gray);">${escapeHtml(b.shipping_address || "—")}</td>
        <td>${escapeHtml(itemsSummary)}</td>
        <td>₹${b.cart_total}</td>
        <td>₹${b.deposit_amount}</td>
        <td>₹${b.balance_due}</td>
        <td><span class="booking-status ${statusClass}">${escapeHtml(b.status)}</span>${b.is_test ? ' <span class="test-badge" title="Created via test mode — no real Razorpay payment">TEST</span>' : ''}</td>
        <td>
          <select class="tracking-select" onchange="updateTrackingStatus(${b.id}, this.value)">
            ${trackingOptions}
          </select>
        </td>
        <td>${date}</td>
      </tr>`;
    }).join("");
  }catch(e){
    if(tbody) tbody.innerHTML = `<tr class="empty-row"><td colspan="9">Couldn't load reservations.</td></tr>`;
  }
}

async function updateTrackingStatus(bookingId, trackingStatus){
  try{
    const res = await authedFetch(`/api/bookings/${bookingId}/tracking`, {
      method: "PATCH",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ tracking_status: trackingStatus })
    });
    const data = await res.json();
    if(!res.ok){
      alert(data.error || "Couldn't update tracking status.");
      await loadBookings();
      return;
    }
    showAdminToast(`Order #${bookingId} marked "${TRACKING_LABELS[trackingStatus]}"`);
  }catch(e){ /* handled by authedFetch on 401 */ }
}

function showAdminToast(msg){
  let toast = document.querySelector(".admin-toast");
  if(!toast){
    toast = document.createElement("div");
    toast.className = "admin-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(window.__adminToastTimer);
  window.__adminToastTimer = setTimeout(()=>toast.classList.remove("show"), 2200);
}

/* ---------- Tabs ---------- */

function switchTab(name){
  document.querySelectorAll(".tab-link").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".tab-panel-admin").forEach(panel => {
    const isTarget = panel.id === `tab-${name}`;
    if(isTarget){
      panel.style.display = "block";
      panel.classList.add("active");
      requestAnimationFrame(()=> panel.classList.add("in"));
      if(name === "content") updateHeroPreview();
      if(name === "bookings") loadBookings();
    } else {
      panel.classList.remove("active", "in");
      panel.style.display = "none";
    }
  });
}

/* ---------- Wire up ---------- */

document.addEventListener("DOMContentLoaded", ()=>{
  document.getElementById("login-btn").addEventListener("click", login);
  document.getElementById("login-password").addEventListener("keydown", (e)=>{
    if(e.key === "Enter") login();
  });
  document.getElementById("logout-btn").addEventListener("click", logout);
  document.getElementById("toggle-form-btn").addEventListener("click", ()=>{
    const form = document.getElementById("product-form");
    form.classList.contains("open") ? closeForm() : openForm();
  });
  document.getElementById("cancel-form-btn").addEventListener("click", closeForm);
  document.getElementById("product-form").addEventListener("submit", submitForm);

  document.getElementById("product-search").addEventListener("input", (e)=>{
    tableSearchTerm = e.target.value;
    renderTable();
  });

  document.querySelectorAll(".tab-link").forEach(btn=>{
    btn.addEventListener("click", ()=> switchTab(btn.dataset.tab));
  });

  document.getElementById("settings-form").addEventListener("submit", submitSettingsForm);
  ["s-eyebrow","s-title1","s-title2","s-subtitle","s-cta1","s-cta2","s-badge"].forEach(id=>{
    document.getElementById(id).addEventListener("input", updateHeroPreview);
  });

  document.getElementById("deposit-form").addEventListener("submit", submitDepositForm);

  if(getToken()){
    showDashboard();
  } else {
    showLogin();
  }
});
