/* ==========================================================
   FLARE — shared product data + cart logic
   ========================================================== */

let PRODUCTS = [];
let SETTINGS = {};

async function loadProducts() {
  try {
    const res = await fetch("/api/products");
    if (!res.ok) throw new Error("bad response");
    PRODUCTS = await res.json();
  } catch (e) {
    console.error("Could not load products from the server. Is `npm start` running?", e);
    PRODUCTS = [];
  }
}

async function loadSettings() {
  try {
    const res = await fetch("/api/settings");
    if (!res.ok) throw new Error("bad response");
    SETTINGS = await res.json();
  } catch (e) {
    console.error("Could not load homepage settings from the server.", e);
    SETTINGS = {};
  }
}

/* ---------- Homepage hero (admin-editable copy + trending-driven tags) ---------- */
function renderHero(){
  const copy = document.getElementById("hero-copy");
  if(!copy) return; // not on the homepage

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if(el && value) el.textContent = value;
  };
  setText("hero-eyebrow", SETTINGS.hero_eyebrow);
  setText("hero-title-1", SETTINGS.hero_title_1);
  setText("hero-title-2", SETTINGS.hero_title_2);
  setText("hero-subtitle", SETTINGS.hero_subtitle);
  setText("hero-cta-primary", SETTINGS.hero_cta_primary);
  setText("hero-cta-secondary", SETTINGS.hero_cta_secondary);
  setText("hero-badge", SETTINGS.hero_badge);

  const trending = PRODUCTS.filter(p => p.trending);
  const priceTag = document.getElementById("hero-price-tag");
  if(priceTag){
    if(trending.length){
      const minPrice = Math.min(...trending.map(p => p.price));
      priceTag.textContent = `Starting ₹${minPrice}`;
    } else {
      priceTag.textContent = "";
      priceTag.style.display = "none";
    }
  }

  // smooth fade-in once real copy is in place
  requestAnimationFrame(()=>{
    copy.classList.add("loaded");
    document.querySelectorAll(".tag-float").forEach(t=>t.classList.add("loaded"));
  });
}

const CART_KEY = "flareCart";

function getCart(){
  try{ return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
  catch(e){ return []; }
}
function saveCart(cart){ localStorage.setItem(CART_KEY, JSON.stringify(cart)); }

function cartCount(){
  return getCart().reduce((sum,i)=>sum+i.qty,0);
}

function updateCartBadge(){
  document.querySelectorAll(".cart-count").forEach(el=>{
    el.textContent = cartCount();
  });
}

function addToCart(id, size, color, qty=1){
  const product = PRODUCTS.find(p=>p.id===Number(id));
  if(!product) return;
  const cart = getCart();
  const key = `${id}-${size}-${color}`;
  const existing = cart.find(i=>i.key===key);
  if(existing){ existing.qty += qty; }
  else{
    cart.push({
      key, id:product.id, name:product.name, price:product.price,
      g:product.g, image:product.image||"", size:size||product.sizes[1]||product.sizes[0],
      color:color||product.colors[0], qty
    });
  }
  saveCart(cart);
  updateCartBadge();
  showToast(`Added "${product.name}" to your bag`);
}

function removeFromCart(key){
  saveCart(getCart().filter(i=>i.key!==key));
  updateCartBadge();
  if(typeof renderCartPage==="function") renderCartPage();
}

function changeQty(key, delta){
  const cart = getCart();
  const item = cart.find(i=>i.key===key);
  if(!item) return;
  item.qty += delta;
  if(item.qty<1) item.qty=1;
  saveCart(cart);
  updateCartBadge();
  if(typeof renderCartPage==="function") renderCartPage();
}

function showToast(msg){
  let toast = document.querySelector(".toast");
  if(!toast){
    toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `<span class="dot"></span><span class="toast-msg"></span>`;
    document.body.appendChild(toast);
  }
  toast.querySelector(".toast-msg").textContent = msg;
  toast.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=>toast.classList.remove("show"), 2200);
}

/* ---------- Image helpers ----------
   Real product photos live in the database (p.image, set via seed data or the
   admin panel's "Image URL" field). If a product doesn't have one yet, fall
   back to a placeholder photo so the layout never shows a broken image. */
function demoImg(seed, w=600, h=750){
  return `https://picsum.photos/seed/${seed}/${w}/${h}`;
}
function productImage(p, w, h){
  return p.image ? p.image : demoImg("flare"+p.id, w, h);
}

/* ---------- Product card renderer (shared by home + shop) ---------- */
function productCardHTML(p){
  const off = Math.round((1 - p.price/p.mrp)*100);
  const swatches = p.colors.map(c=>`<span class="swatch" style="background:${c}"></span>`).join("");
  return `
  <a class="pcard" href="product.html?id=${p.id}">
    <div class="pcard-media ${p.g}">
      <img src="${productImage(p, 600, 750)}" alt="${p.name}" loading="lazy">
      <span class="badge">${off}% OFF</span>
      <span class="badge wishlist">&#9825;</span>
      <div class="quickadd" onclick="event.preventDefault(); addToCart(${p.id}, '${p.sizes[Math.floor(p.sizes.length/2)]}', '${p.colors[0]}');">Quick Add</div>
    </div>
    <div class="pcard-body">
      <span class="pcard-cat">${p.cat}</span>
      <span class="pcard-name">${p.name}</span>
      <div class="pcard-price-row">
        <span class="price">₹${p.price}</span>
        <span class="price-strike">₹${p.mrp}</span>
        <span class="price-off">${off}% off</span>
      </div>
      <div class="swatches">${swatches}</div>
    </div>
  </a>`;
}

/* ---------- Home page bestsellers ---------- */
function renderBestsellers(containerId, list){
  const el = document.getElementById(containerId);
  if(!el) return;
  el.innerHTML = list.map(productCardHTML).join("");
}

/* ---------- Shop page ---------- */
function renderShopGrid(){
  const grid = document.getElementById("shop-grid");
  if(!grid) return;

  const state = { cats:new Set(), sizes:new Set(), maxPrice:5000, sort:"popular" };

  function apply(){
    let list = PRODUCTS.filter(p=>{
      if(state.cats.size && !state.cats.has(p.cat)) return false;
      if(state.sizes.size && !p.sizes.some(s=>state.sizes.has(s))) return false;
      if(p.price > state.maxPrice) return false;
      return true;
    });
    if(state.sort==="price-low") list.sort((a,b)=>a.price-b.price);
    if(state.sort==="price-high") list.sort((a,b)=>b.price-a.price);
    if(state.sort==="rating") list.sort((a,b)=>b.rating-a.rating);
    grid.innerHTML = list.length ? list.map(productCardHTML).join("") : `<p style="grid-column:1/-1;color:var(--gray);padding:40px 0;">No products match these filters.</p>`;
    const rc = document.getElementById("result-count");
    if(rc) rc.textContent = `${list.length} products`;
  }

  document.querySelectorAll(".cat-filter").forEach(cb=>{
    cb.addEventListener("change",()=>{
      cb.checked ? state.cats.add(cb.value) : state.cats.delete(cb.value);
      apply();
    });
  });
  document.querySelectorAll(".size-filter").forEach(btn=>{
    btn.addEventListener("click",()=>{
      btn.classList.toggle("active-size");
      btn.classList.contains("active-size") ? state.sizes.add(btn.dataset.size) : state.sizes.delete(btn.dataset.size);
      btn.style.borderColor = btn.classList.contains("active-size") ? "var(--black)" : "";
      btn.style.background = btn.classList.contains("active-size") ? "var(--black)" : "";
      btn.style.color = btn.classList.contains("active-size") ? "#fff" : "";
      apply();
    });
  });
  const priceRange = document.getElementById("price-range");
  if(priceRange){
    priceRange.addEventListener("input",()=>{
      state.maxPrice = Number(priceRange.value);
      document.getElementById("price-range-val").textContent = `Up to ₹${state.maxPrice}`;
      apply();
    });
  }
  const sortSelect = document.getElementById("sort-select");
  if(sortSelect){
    sortSelect.addEventListener("change",()=>{
      state.sort = sortSelect.value;
      apply();
    });
  }

  // preselect category from URL param
  const params = new URLSearchParams(window.location.search);
  const catParam = params.get("cat");
  if(catParam){
    const cb = document.querySelector(`.cat-filter[value="${catParam}"]`);
    if(cb){ cb.checked = true; state.cats.add(catParam); }
  }

  apply();
}

function setMainImage(src, el){
  document.getElementById("pd-main").innerHTML = `<img src="${src}" alt="">`;
  document.querySelectorAll(".pd-thumb").forEach(t=>t.classList.remove("active"));
  if(el) el.classList.add("active");
}

/* ---------- Product detail page ---------- */
function renderProductPage(){
  const main = document.getElementById("pd-main");
  if(!main) return;
  const params = new URLSearchParams(window.location.search);
  const id = Number(params.get("id")) || 1;
  const p = PRODUCTS.find(x=>x.id===id) || PRODUCTS[0];

  document.title = `${p.name} — FLARE`;
  document.getElementById("pd-crumb").textContent = p.name;
  document.getElementById("pd-cat").textContent = p.cat;
  document.getElementById("pd-title").textContent = p.name;
  document.getElementById("pd-price").textContent = `₹${p.price}`;
  document.getElementById("pd-mrp").textContent = `₹${p.mrp}`;
  const off = Math.round((1 - p.price/p.mrp)*100);
  document.getElementById("pd-off").textContent = `${off}% off`;
  document.getElementById("pd-rating-count").textContent = `${p.rating} (${p.reviews} reviews)`;
  main.className = `pd-gallery-main ${p.g}`;
  const galleryImages = p.image
    ? [p.image, p.image, p.image, p.image] // one real photo — shown consistently across all thumbnail slots
    : [1,2,3,4].map(n => demoImg(`flare${p.id}-${n}`, 900, 1125));
  const galleryThumbs = p.image
    ? [p.image, p.image, p.image, p.image]
    : [1,2,3,4].map(n => demoImg(`flare${p.id}-${n}`, 200, 250));

  main.innerHTML = `<img src="${galleryImages[0]}" alt="${p.name}">`;

  const thumbs = document.getElementById("pd-thumbs");
  thumbs.innerHTML = galleryThumbs
    .map((thumbSrc,i)=>`<div class="pd-thumb ${i===0?'active':''}" onclick="setMainImage('${galleryImages[i]}', this)"><img src="${thumbSrc}" alt=""></div>`).join("");

  const colorRow = document.getElementById("pd-colors");
  colorRow.innerHTML = p.colors.map((c,i)=>`<span class="color-swatch-lg ${i===0?'active':''}" style="background:${c}" onclick="document.querySelectorAll('.color-swatch-lg').forEach(s=>s.classList.remove('active'));this.classList.add('active');window.__selectedColor='${c}';"></span>`).join("");
  window.__selectedColor = p.colors[0];

  const sizeRow = document.getElementById("pd-sizes");
  sizeRow.innerHTML = p.sizes.map((s,i)=>`<span class="size-opt ${i===1?'active-size':''}" style="${i===1?'background:var(--black);color:#fff;border-color:var(--black);':''}" onclick="document.querySelectorAll('#pd-sizes .size-opt').forEach(o=>{o.classList.remove('active-size');o.style.background='';o.style.color='';o.style.borderColor='';});this.classList.add('active-size');this.style.background='var(--black)';this.style.color='#fff';window.__selectedSize='${s}';">${s}</span>`).join("");
  window.__selectedSize = p.sizes[1] || p.sizes[0];

  let qty = 1;
  document.getElementById("qty-display").textContent = qty;
  document.getElementById("qty-inc").onclick = ()=>{ qty++; document.getElementById("qty-display").textContent=qty; };
  document.getElementById("qty-dec").onclick = ()=>{ qty=Math.max(1,qty-1); document.getElementById("qty-display").textContent=qty; };

  document.getElementById("pd-add-cart").onclick = ()=>{
    addToCart(p.id, window.__selectedSize, window.__selectedColor, qty);
  };

  // related products
  const related = PRODUCTS.filter(x=>x.cat===p.cat && x.id!==p.id).slice(0,4);
  const relEl = document.getElementById("related-grid");
  if(relEl) relEl.innerHTML = related.map(productCardHTML).join("");
}

/* ---------- Cart page ---------- */
function renderCartPage(){
  const wrap = document.getElementById("cart-items");
  if(!wrap) return;
  const cart = getCart();

  if(!cart.length){
    wrap.innerHTML = `
      <div class="empty-cart">
        <div class="big-emoji">🛍️</div>
        <h3 style="margin-bottom:10px;">Your bag is empty</h3>
        <p style="color:var(--gray);margin-bottom:22px;">Looks like you haven't added anything yet.</p>
        <a href="shop.html" class="btn btn-primary">Start Shopping</a>
      </div>`;
    document.getElementById("cart-summary").style.display = "none";
    return;
  }

  document.getElementById("cart-summary").style.display = "block";
  wrap.innerHTML = cart.map(item=>`
    <div class="cart-row">
      <div class="cart-thumb ${item.g}"><img src="${item.image || demoImg('flare'+item.id, 200, 240)}" alt="${item.name}"></div>
      <div>
        <div class="cart-name">${item.name}</div>
        <div class="cart-meta">Size: ${item.size} &nbsp;·&nbsp; Color: <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${item.color};vertical-align:middle;"></span></div>
        <div class="cart-remove" onclick="removeFromCart('${item.key}')">Remove</div>
      </div>
      <div class="qty-box">
        <button onclick="changeQty('${item.key}', -1)">−</button>
        <span>${item.qty}</span>
        <button onclick="changeQty('${item.key}', 1)">+</button>
      </div>
      <div class="price">₹${item.price * item.qty}</div>
    </div>
  `).join("");

  const subtotal = cart.reduce((s,i)=>s+i.price*i.qty,0);
  const shipping = subtotal > 999 ? 0 : 79;
  const total = subtotal + shipping;
  document.getElementById("sum-subtotal").textContent = `₹${subtotal}`;
  document.getElementById("sum-shipping").textContent = shipping===0 ? "Free" : `₹${shipping}`;
  document.getElementById("sum-total").textContent = `₹${total}`;
}

/* ---------- Checkout: pre-book deposit flow (Razorpay) ----------
   Customer pays a partial deposit now to reserve their cart, balance due
   later. Prices/totals shown here are for display only — the server always
   recomputes the real total and deposit from the database before creating
   the Razorpay order, so nothing here needs to be trusted. */
let __checkoutOrder = null;

function depositPercentPreview(){
  const n = Number(SETTINGS.deposit_percent);
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : 20;
}

function openCheckoutModal(){
  const cart = getCart();
  if(!cart.length) return;
  const subtotal = cart.reduce((s,i)=>s+i.price*i.qty,0);
  const shipping = subtotal > 999 ? 0 : 79;
  const total = subtotal + shipping;
  const pct = depositPercentPreview();
  const deposit = Math.max(1, Math.round(total * pct / 100));

  document.getElementById("co-cart-total").textContent = `₹${total}`;
  document.getElementById("co-deposit").textContent = `₹${deposit} (${pct}%)`;
  document.getElementById("co-balance").textContent = `₹${total - deposit}`;

  document.getElementById("checkout-error").style.display = "none";
  document.getElementById("checkout-form-view").style.display = "block";
  document.getElementById("checkout-success-view").style.display = "none";
  document.getElementById("checkout-modal").classList.add("open");
}

function closeCheckoutModal(){
  document.getElementById("checkout-modal").classList.remove("open");
}

function showCheckoutError(msg){
  const el = document.getElementById("checkout-error");
  el.textContent = msg;
  el.style.display = "block";
}

async function submitCheckout(e){
  e.preventDefault();
  const cart = getCart();
  if(!cart.length) return;

  const name = document.getElementById("co-name").value.trim();
  const phone = document.getElementById("co-phone").value.trim();
  const email = document.getElementById("co-email").value.trim();
  const btn = document.getElementById("checkout-submit-btn");

  if(typeof Razorpay === "undefined"){
    showCheckoutError("Payment couldn't load. Check your connection and try again.");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Starting payment…";
  document.getElementById("checkout-error").style.display = "none";

  try {
    const res = await fetch("/api/checkout/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: cart.map(i => ({ id: i.id, qty: i.qty, size: i.size, color: i.color })),
        customerName: name, customerPhone: phone, customerEmail: email,
      }),
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || "Could not start payment");

    __checkoutOrder = data;

    const rzp = new Razorpay({
      key: data.key_id,
      amount: data.amount * 100,
      currency: data.currency,
      name: "FLARE",
      description: `Reservation deposit — balance ₹${data.balance_due} due later`,
      order_id: data.razorpay_order_id,
      prefill: { name, contact: phone, email },
      theme: { color: "#141115" },
      handler: function(response){
        handleCheckoutSuccess(response);
      },
      modal: {
        ondismiss: function(){
          btn.disabled = false;
          btn.textContent = "Pay Deposit & Reserve";
        },
      },
    });
    rzp.on("payment.failed", function(){
      showCheckoutError("Payment failed. Please try again.");
      btn.disabled = false;
      btn.textContent = "Pay Deposit & Reserve";
    });
    rzp.open();
  } catch(err){
    showCheckoutError(err.message || "Something went wrong. Please try again.");
    btn.disabled = false;
    btn.textContent = "Pay Deposit & Reserve";
  }
}

async function handleCheckoutSuccess(response){
  try {
    const res = await fetch("/api/checkout/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        booking_id: __checkoutOrder.booking_id,
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
      }),
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || "Payment verification failed");

    saveCart([]);
    updateCartBadge();
    document.getElementById("checkout-form-view").style.display = "none";
    document.getElementById("checkout-success-msg").textContent =
      `Deposit received. Balance of ₹${data.balance_due} is due later — we'll reach out on the phone number you provided.`;
    document.getElementById("checkout-success-view").style.display = "block";
    renderCartPage();
  } catch(err){
    showCheckoutError((err.message || "We couldn't confirm your payment") + " — if money was deducted, contact us and we'll sort it out.");
    const btn = document.getElementById("checkout-submit-btn");
    btn.disabled = false;
    btn.textContent = "Pay Deposit & Reserve";
  }
}

/* ---------- Newsletter ---------- */
function handleNewsletter(e){
  e.preventDefault();
  showToast("You're subscribed! Watch your inbox 💌");
  e.target.reset();
  return false;
}

/* ---------- Mobile menu ---------- */
function toggleMobileMenu(){
  document.querySelector(".nav-links").classList.toggle("mobile-open");
}

document.addEventListener("DOMContentLoaded", async ()=>{
  updateCartBadge();
  await Promise.all([loadProducts(), loadSettings()]);
  renderHero();
  const trendingFirst = [...PRODUCTS.filter(p=>p.trending), ...PRODUCTS.filter(p=>!p.trending)];
  renderBestsellers("bestseller-grid", trendingFirst.slice(0,8));
  renderShopGrid();
  renderProductPage();
  renderCartPage();
});
