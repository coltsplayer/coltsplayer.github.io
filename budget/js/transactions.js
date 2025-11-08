// ==========================================================
// 📋 Transactions Module
// ==========================================================
import { supabase } from "./utils.js";
import { renderUncategorizedSummary, applyAllMappingsToUncategorized } from "./mappings.js";

// ==========================================================
// 🧠 Shared State (exported so other modules can use them)
// ==========================================================
export let allData = [];
export let currentUser = null;

// ==========================================================
// 👤 Track user session (set by auth.js)
// ==========================================================
export function setCurrentUser(user) {
  currentUser = user;
}

// ==========================================================
// 📦 Load Transactions from Supabase
// ==========================================================
export async function loadTransactionsFromSupabase() {
  if (!currentUser) {
    console.warn("[budget] No current user; cannot load transactions.");
    return;
  }

  console.log("[budget] loading transactions from supabase...");
  const { data, error } = await supabase
    .from("transactions")
    .select("id, date, description, category, amount, user_id")
    .eq("user_id", currentUser.id)
    .order("date", { ascending: false });

  if (error) {
    console.error("[budget] loadTransactionsFromSupabase error:", error);
    alert("⚠️ Failed to load transactions. Check console for details.");
    return;
  }

  allData = data || [];
  console.log(`[budget] loaded ${allData.length} transactions`);

  renderTransactionsGroupedByMonth(allData);
  renderSummaryCards(allData);
  renderUncategorizedSummary(allData);
}

// ==========================================================
// 🧾 Render Transactions Grouped by Month
// ==========================================================
function renderTransactionsGroupedByMonth(data) {
  const tbody = document.getElementById("transactionsBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!data || !data.length) {
    tbody.innerHTML = `<tr><td colspan="5">No transactions found.</td></tr>`;
    return;
  }

  const grouped = {};
  for (const txn of data) {
    const month = new Date(txn.date).toLocaleString("default", { month: "long", year: "numeric" });
    if (!grouped[month]) grouped[month] = [];
    grouped[month].push(txn);
  }

  for (const [month, txns] of Object.entries(grouped)) {
    const headerRow = document.createElement("tr");
    headerRow.classList.add("month-header");
    headerRow.innerHTML = `<td colspan="5" style="font-weight:bold;background:#f2f2f2;cursor:pointer;">${month}</td>`;
    tbody.appendChild(headerRow);

    // Collapse toggle
    let collapsed = true;
    const rows = [];
    headerRow.addEventListener("click", () => {
      collapsed = !collapsed;
      rows.forEach(r => (r.style.display = collapsed ? "none" : ""));
    });

    for (const txn of txns) {
      const tr = document.createElement("tr");
      tr.style.display = "none"; // collapsed by default
      tr.dataset.id = txn.id;
      tr.innerHTML = `
        <td><input type="date" value="${formatDate(txn.date)}" class="edit-date"/></td>
        <td><input type="text" value="${escapeHtml(txn.description || "")}" class="edit-description"/></td>
        <td><input type="text" value="${escapeHtml(txn.category || "")}" class="edit-category"/></td>
        <td><input type="number" value="${txn.amount}" step="0.01" class="edit-amount"/></td>
        <td><button class="save-btn">💾</button></td>
      `;
      tbody.appendChild(tr);
      rows.push(tr);
    }
  }

  // Attach save handlers
  document.querySelectorAll(".save-btn").forEach(btn => {
    btn.addEventListener("click", async e => {
      const tr = e.target.closest("tr");
      const id = tr.dataset.id;
      const date = tr.querySelector(".edit-date").value;
      const description = tr.querySelector(".edit-description").value.trim();
      const category = tr.querySelector(".edit-category").value.trim() || "Uncategorized";
      const amount = parseFloat(tr.querySelector(".edit-amount").value) || 0;

      await updateTransaction(id, { date, description, category, amount });
    });
  });
}

// ==========================================================
// 💾 Update Transaction in Supabase
// ==========================================================
async function updateTransaction(id, updates) {
  if (!currentUser) return;
  console.log("[budget] Updating transaction:", id, updates);

  const { data, error } = await supabase
    .from("transactions")
    .update(updates)
    .eq("id", id)
    .eq("user_id", currentUser.id)
    .select();

  if (error) {
    console.error("[budget] updateTransaction error:", error);
    alert("⚠️ Update failed. See console for details.");
    return;
  }

  // Reflect change locally
  const index = allData.findIndex(t => t.id === id);
  if (index !== -1) Object.assign(allData[index], updates);

  renderTransactionsGroupedByMonth(allData);
  renderSummaryCards(allData);
  renderUncategorizedSummary(allData);
}

// ==========================================================
// 🧮 Render Summary Totals (Income, Expense, Balance)
// ==========================================================
function renderSummaryCards(data) {
  const income = data.filter(d => d.amount > 0).reduce((a, b) => a + b.amount, 0);
  const expense = data.filter(d => d.amount < 0).reduce((a, b) => a + b.amount, 0);
  const balance = income + expense;

  document.getElementById("incomeTotal").textContent = formatCurrency(income);
  document.getElementById("expenseTotal").textContent = formatCurrency(expense);
  document.getElementById("balanceTotal").textContent = formatCurrency(balance);
}

// ==========================================================
// 🧹 Utility Functions
// ==========================================================
function formatCurrency(num) {
  return num.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toISOString().split("T")[0];
}

function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ==========================================================
// 🔄 Refresh and Remap Button Wiring
// ==========================================================
const refreshBtn = document.getElementById("refreshBtn");
if (refreshBtn) {
  refreshBtn.addEventListener("click", async () => {
    await loadTransactionsFromSupabase();
  });
}

const remapBtn = document.getElementById("remapBtn");
if (remapBtn) {
  remapBtn.addEventListener("click", async () => {
    await applyAllMappingsToUncategorized();
    renderUncategorizedSummary(allData);
  });
}