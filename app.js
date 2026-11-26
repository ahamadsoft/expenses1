// ---------- Settings ----------
const CURRENCY = "₹";
const CATEGORIES = [
  { name: "Food",     color: "#FF6B6B", icon: "🍔" },
  { name: "Travel",   color: "#3EA8FF", icon: "🚌" },
  { name: "Shopping", color: "#FF5DA2", icon: "🛍️" },
  { name: "Bills",    color: "#FFC53D", icon: "💡" },
  { name: "Fun",      color: "#7C5CFF", icon: "🎉" },
  { name: "Health",   color: "#2EC4B6", icon: "💊" },
  { name: "Other",    color: "#8D99AE", icon: "📦" },
];
const catByName = Object.fromEntries(CATEGORIES.map(c => [c.name, c]));
const PALETTE = ["#FF6B6B", "#FFC53D", "#2EC4B6", "#7C5CFF", "#3EA8FF", "#FF5DA2"];

// ---------- Firebase (compat SDK) ----------
const firebaseConfig = {
  apiKey: "AIzaSyBplNBi9BdwcxEtK2DCD187Z3wGq6h0i6Y",
  authDomain: "expensivetracker1.firebaseapp.com",
  projectId: "expensivetracker1",
  storageBucket: "expensivetracker1.firebasestorage.app",
  messagingSenderId: "588796807783",
  appId: "1:588796807783:web:9785e80952e1aae0da62c2"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const expensesRef = db.collection("expenses");

// ---------- Helpers ----------
const $ = (sel) => document.querySelector(sel);
const money = (n) => CURRENCY + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const escapeHtml = (s) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; // YYYY-MM-DD (local)
const parseKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const todayStart = () => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); };
const weekStart = (d) => addDays(d, -((d.getDay() + 6) % 7)); // weeks start on Monday
const formatDate = (k) => parseKey(k).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

// ---------- State ----------
let expenses = [];
let mode = "day";
let selectedCat = CATEGORIES[0].name;
let trendChart = null;
let catChart = null;

// ---------- Aggregation ----------
// Sum of expenses whose date falls in [start, end)
function sumBetween(start, end) {
  const s = keyOf(start), e = keyOf(end);
  return expenses.filter(x => x.date >= s && x.date < e).reduce((t, x) => t + x.amount, 0);
}

// Time buckets for the trend chart
function buckets(kind) {
  const now = todayStart();
  const out = [];
  if (kind === "day") {
    for (let i = 13; i >= 0; i--) {
      const s = addDays(now, -i);
      out.push({ s, e: addDays(s, 1), label: s.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) });
    }
  } else if (kind === "week") {
    const ws = weekStart(now);
    for (let i = 7; i >= 0; i--) {
      const s = addDays(ws, -7 * i);
      out.push({ s, e: addDays(s, 7), label: "Wk " + s.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) });
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const s = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push({ s, e: new Date(s.getFullYear(), s.getMonth() + 1, 1), label: s.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }) });
    }
  }
  return out;
}

// ---------- Rendering ----------
function renderStats() {
  const now = todayStart();
  $("#statToday").textContent = money(sumBetween(now, addDays(now, 1)));

  const ws = weekStart(now);
  $("#statWeek").textContent = money(sumBetween(ws, addDays(ws, 7)));

  const ms = new Date(now.getFullYear(), now.getMonth(), 1);
  $("#statMonth").textContent = money(sumBetween(ms, new Date(now.getFullYear(), now.getMonth() + 1, 1)));
}

function renderTrend() {
  const b = buckets(mode);
  const values = b.map(x => sumBetween(x.s, x.e));
  const last = b.length - 1;
  // Current period is drawn in ink; the others cycle through the palette
  const colors = values.map((_, i) => (i === last ? "#1f1b3a" : PALETTE[i % PALETTE.length]));

  trendChart?.destroy();
  trendChart = new Chart($("#trendChart"), {
    type: "bar",
    data: {
      labels: b.map(x => x.label),
      datasets: [{ data: values, backgroundColor: colors, borderRadius: 10, maxBarThickness: 48 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => ` ${money(c.parsed.y)}` } }
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: (v) => CURRENCY + v } },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderCategories() {
  const now = todayStart();
  const s = keyOf(new Date(now.getFullYear(), now.getMonth(), 1));
  const e = keyOf(new Date(now.getFullYear(), now.getMonth() + 1, 1));
  const monthly = expenses.filter(x => x.date >= s && x.date < e);

  const totals = CATEGORIES.map(c => monthly.filter(x => x.category === c.name).reduce((t, x) => t + x.amount, 0));
  const grand = totals.reduce((a, b) => a + b, 0);

  catChart?.destroy();
  catChart = new Chart($("#catChart"), {
    type: "doughnut",
    data: {
      labels: CATEGORIES.map(c => c.name),
      datasets: [{ data: totals, backgroundColor: CATEGORIES.map(c => c.color), borderWidth: 0, hoverOffset: 8 }]
    },
    options: {
      maintainAspectRatio: false,
      cutout: "65%",
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => ` ${money(c.parsed)}` } }
      }
    }
  });

  const rows = CATEGORIES.map((c, i) => ({ c, v: totals[i] }))
    .filter(r => r.v > 0)
    .sort((a, b) => b.v - a.v);

  $("#legend").innerHTML = rows.length
    ? rows.map(({ c, v }) => `
        <li>
          <span class="dot" style="background:${c.color}"></span>
          ${c.icon} ${c.name}
          <span class="pct">${Math.round((v / grand) * 100)}%</span>
          <span class="amt">${money(v)}</span>
        </li>`).join("")
    : `<li class="empty">No spending this month yet.</li>`;
}

function renderList() {
  const ul = $("#list");
  if (!expenses.length) {
    ul.innerHTML = `<li class="empty">No expenses yet. Add your first one on the left ✨</li>`;
    return;
  }
  ul.innerHTML = expenses.slice(0, 30).map(x => {
    const c = catByName[x.category] || CATEGORIES[CATEGORIES.length - 1];
    return `
      <li class="item">
        <span class="badge" style="background:${c.color}" aria-hidden="true">${c.icon}</span>
        <div class="item-info">
          <strong>${escapeHtml(x.title)}</strong>
          <small>${c.name} · ${formatDate(x.date)}</small>
        </div>
        <span class="item-amt">−${money(x.amount)}</span>
        <button class="del" data-id="${x.id}" aria-label="Delete ${escapeHtml(x.title)}">✕</button>
      </li>`;
  }).join("");
}

function renderAll() {
  renderStats();
  renderTrend();
  renderCategories();
  renderList();
}

function setStatus(text, type = "") {
  const el = $("#status");
  el.textContent = text;
  el.className = "status " + type;
}

function buildChips() {
  $("#catChips").innerHTML = CATEGORIES.map(c => `
    <button type="button" class="chip" style="--c:${c.color}" data-cat="${c.name}"
      aria-pressed="${c.name === selectedCat}">${c.icon} ${c.name}</button>`).join("");
}

// ---------- Firestore ----------
function listenForExpenses() {
  expensesRef.orderBy("date", "desc").onSnapshot(
    (snap) => {
      expenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const n = expenses.length;
      setStatus(`${n} expense${n === 1 ? "" : "s"} · live`, "ok");
      renderAll();
    },
    (err) => {
      console.error(err);
      setStatus("Connection error: " + err.message, "err");
    }
  );
}

// ---------- Events ----------
$("#catChips").addEventListener("click", (e) => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  selectedCat = btn.dataset.cat;
  document.querySelectorAll(".chip").forEach(ch =>
    ch.setAttribute("aria-pressed", String(ch.dataset.cat === selectedCat)));
});

$("#tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  mode = btn.dataset.mode;
  document.querySelectorAll(".tab").forEach(t => t.setAttribute("aria-selected", String(t === btn)));
  renderTrend();
});

$("#expenseForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = $("#title").value.trim();
  const amount = Math.round(parseFloat($("#amount").value) * 100) / 100;
  const date = $("#date").value;
  if (!title || !(amount > 0) || !date) return;

  const btn = $("#saveBtn");
  btn.disabled = true;
  try {
    await expensesRef.add({
      title,
      amount,
      category: selectedCat,
      date,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    e.target.reset();
    $("#date").value = keyOf(new Date());
    $("#title").focus();
  } catch (err) {
    console.error(err);
    setStatus("Couldn't save: " + err.message, "err");
  } finally {
    btn.disabled = false;
  }
});

$("#list").addEventListener("click", async (e) => {
  const btn = e.target.closest(".del");
  if (!btn) return;
  if (!confirm("Delete this expense?")) return;
  try {
    await expensesRef.doc(btn.dataset.id).delete();
  } catch (err) {
    console.error(err);
    setStatus("Couldn't delete: " + err.message, "err");
  }
});

// ---------- Init ----------
buildChips();
$("#date").value = keyOf(new Date());
listenForExpenses();
renderAll();
