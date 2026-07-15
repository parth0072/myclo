/* ==========================================================
   FLARE — Admin panel logic
   Talks to the same server (server.js) via the /api/products
   and /api/admin/login endpoints. Token is kept in
   localStorage only for this browser's admin session.
   ========================================================== */

const TOKEN_KEY = "flareAdminToken";
let ALL_PRODUCTS = [];
let editingId = null;

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
  document.getElementById("table-count").textContent = `${ALL_PRODUCTS.length} products`;

  if(!ALL_PRODUCTS.length){
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">No products yet — add your first one above.</td></tr>`;
    return;
  }

  tbody.innerHTML = ALL_PRODUCTS.map(p=>{
    const dotColor = (p.colors && p.colors[0]) || "#ccc";
    return `
    <tr>
      <td>#${p.id}</td>
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

  if(getToken()){
    showDashboard();
  } else {
    showLogin();
  }
});
