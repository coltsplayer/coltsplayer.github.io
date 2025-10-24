/******************************************************************************
 * script.js  —  Full app code
 *
 * Features included:
 *  - Supabase client initialization
 *  - CSV upload (basic parser) and preview
 *  - Insert transactions into Supabase (mapped & normalized)
 *  - description_mapping manager (create/read/update/delete)
 *  - Inline edit UI for mapping rows
 *  - Month dropdown filter + collapsible month grouping for transactions
 *  - Summary totals, category bar chart, utility averages & trend chart
 *
 * IMPORTANT:
 *  - Replace SUPABASE_URL and SUPABASE_KEY with your project's values.
 *  - If your CSV contains quoted fields with commas, use PapaParse instead
 *    (recommended for real bank exports).
 *****************************************************************************/

/* =========================
   Supabase configuration
   ========================= */
const SUPABASE_URL = "https://uimrsmpjbweoohvbvywv.supabase.co"; // <- replace with your project URL
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpbXJzbXBqYndlb29odmJ2eXd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4OTAxNTksImV4cCI6MjA3NTQ2NjE1OX0.QmU09jLhunbWKLAHM2ddGpsmgcBctw7ykX199Kmmn88";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const filterSummary = document.getElementById("filterSummary");

/* =========================
   Global state variables
   ========================= */
let allData = []; // preview or transactions loaded from Supabase
let descriptionMap = []; // rows from description_mapping table
let monthList = []; // YYYY-MM list
let activeMonthFilter = "All";
let activeCategoryFilter = "All";
let collapsedMonths = {}; // map of month => boolean (true => collapsed)
let budgetChart = null;
let utilityTrendChart = null;

/* =========================
   DOM references (shortcuts)
   ========================= */
const uploadInput = document.getElementById("uploadCsv");
const loadBtn = document.getElementById("loadBtn");
const insertBtn = document.getElementById("insertBtn");
const dataTableBody = document.querySelector("#dataTable tbody");

const mappingForm = document.getElementById("mappingForm");
const mappingIdInput = document.getElementById("mappingId");
const matchPatternInput = document.getElementById("matchPattern");
const displayNameInput = document.getElementById("displayName");
const categoryNameInput = document.getElementById("categoryName");
const mappingTableBody = document.querySelector("#mappingTable tbody");
const resetFormBtn = document.getElementById("resetForm");

const utilityTableBody = document.querySelector("#utilityTable tbody");
const budgetCanvas = document.getElementById("budgetChart");
const trendCanvas = document.getElementById("utilityTrendChart");

/* =========================
   Initialization
   ========================= */
document.addEventListener("DOMContentLoaded", async () => {
  // Load mapping table first (so CSV preview can apply mappings)
  await loadDescriptionMap();

  // Load transactions & utilities from Supabase
  await loadTransactionsFromSupabase();
  await loadUtilities();

  // Wire UI events
  wireUpEventHandlers();
});

/* =========================
   Event wiring
   ========================= */
function wireUpEventHandlers() {
  if (loadBtn) loadBtn.addEventListener("click", handleLoadCsvClick);
  if (insertBtn) insertBtn.addEventListener("click", handleInsertClick);
  if (mappingForm) mappingForm.addEventListener("submit", handleMappingFormSubmit);
  if (resetFormBtn) resetFormBtn.addEventListener("click", resetMappingForm);
}

/* =========================
   Small helpers
   ========================= */

// Convert various date forms to YYYY-MM-DD or return null
function parseValidDate(value) {
  if (!value) return null;
  // If already in ISO date yyyy-mm-dd
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (isNaN(d)) return null;
  return d.toISOString().split("T")[0];
}

// Format number to two decimals
function formatMoney(n) {
  return Number(n || 0).toFixed(2);
}

// Escape HTML for safe insertion into DOM
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Get YYYY-MM string from a date string
function getMonthKey(dateString) {
  const d = new Date(dateString);
  if (isNaN(d)) return "Unknown";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Small color palette for charts
function palette(i) {
  const colors = ["#60a5fa","#f87171","#34d399","#fbbf24","#a78bfa","#38bdf8","#f472b6","#fde68a"];
  return colors[i % colors.length];
}

/* =========================
   CSV load & preview
   ========================= */

/**
 * handleLoadCsvClick
 * - Reads CSV file from input and stores rows in allData
 * - Uses a basic splitter; for real bank exports use PapaParse
 */
function handleLoadCsvClick() {
  const file = uploadInput?.files?.[0];
  if (!file) {
    alert("Please choose a CSV file first.");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const raw = e.target.result.replace(/^\uFEFF/, ""); // strip BOM
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      alert("CSV looks empty.");
      return;
    }
    const headers = lines.shift().split(",").map(h => h.trim());
    const rows = lines.map(line => {
      const cols = line.split(","); // simple split — not robust for quoted fields
      const obj = {};
      headers.forEach((h, i) => obj[h] = cols[i] !== undefined ? cols[i].trim() : "");
      return obj;
    });
    allData = rows;
    // Show preview and build month filter
    renderTransactionsPreview();
    buildMonthFilterFromData(allData);
    alert(`Loaded ${allData.length} rows (preview).`);
  };
  reader.onerror = (err) => {
    console.error("File read error:", err);
    alert("Failed to read file.");
  };
  reader.readAsText(file);
}

/* =========================
   Description mapping (CRUD)
   ========================= */

/**
 * loadDescriptionMap - read description_mapping from Supabase
 */
async function loadDescriptionMap() {
  try {
    const { data, error } = await supabase.from("description_mapping").select("*").order("id", { ascending: true });
    if (error) {
      console.error("Error loading mapping:", error);
      return;
    }
    descriptionMap = data || [];
    renderMappingTable();
  } catch (err) {
    console.error("Unexpected loadDescriptionMap error:", err);
  }
}

/**
 * renderMappingTable - builds mapping manager table (with inline edit buttons)
 */
function renderMappingTable() {
  if (!mappingTableBody) return;
  mappingTableBody.innerHTML = "";

  if (!descriptionMap.length) {
    mappingTableBody.innerHTML = "<tr><td colspan='4'>No mappings yet</td></tr>";
    return;
  }

  descriptionMap.forEach(m => {
    const tr = document.createElement("tr");
    tr.dataset.id = m.id;
    tr.innerHTML = `
      <td>${escapeHtml(m.match_pattern)}</td>
      <td>${escapeHtml(m.display_name)}</td>
      <td>${escapeHtml(m.category)}</td>
      <td>
        <button class="edit-inline">✏️ Edit</button>
        <button class="delete-mapping">🗑️ Delete</button>
      </td>
    `;
    mappingTableBody.appendChild(tr);
  });

  // attach handlers for edit & delete
  mappingTableBody.querySelectorAll(".edit-inline").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const tr = e.currentTarget.closest("tr");
      startInlineEdit(tr);
    });
  });
  mappingTableBody.querySelectorAll(".delete-mapping").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = Number(e.currentTarget.closest("tr").dataset.id);
      if (!confirm("Delete this mapping?")) return;
      await deleteMapping(id);
    });
  });
}

/**
 * handleMappingFormSubmit - top form create/update
 */
async function handleMappingFormSubmit(evt) {
  evt.preventDefault();
  const id = mappingIdInput.value ? Number(mappingIdInput.value) : null;
  const match_pattern = matchPatternInput.value.trim();
  const display_name = displayNameInput.value.trim();
  const category = categoryNameInput.value.trim() || "Uncategorized";

  if (!match_pattern || !display_name) {
    alert("Pattern and display name required.");
    return;
  }

  try {
    if (id) {
      const { error } = await supabase.from("description_mapping").update({
        match_pattern, display_name, category
      }).eq("id", id);
      if (error) throw error;
      alert("Mapping updated.");
    } else {
      const { error } = await supabase.from("description_mapping").insert([{ match_pattern, display_name, category }]);
      if (error) throw error;
      alert("Mapping added.");
    }
    await loadDescriptionMap();
    resetMappingForm();
  } catch (err) {
    console.error("Mapping save error:", err);
    alert("Failed to save mapping.");
  }
}

/**
 * startInlineEdit - convert a mapping row into inline inputs
 */
function startInlineEdit(tr) {
  if (!tr) return;
  const id = Number(tr.dataset.id);
  const mapping = descriptionMap.find(m => m.id === id);
  if (!mapping) return alert("Mapping not found.");
  tr.innerHTML = `
    <td><input class="edit-pattern" value="${escapeHtml(mapping.match_pattern)}" /></td>
    <td><input class="edit-name" value="${escapeHtml(mapping.display_name)}" /></td>
    <td><input class="edit-category" value="${escapeHtml(mapping.category)}" /></td>
    <td>
      <button class="save-inline">💾 Save</button>
      <button class="cancel-inline">✖️ Cancel</button>
    </td>
  `;

  tr.querySelector(".save-inline").addEventListener("click", async () => {
    const newPattern = tr.querySelector(".edit-pattern").value.trim();
    const newName = tr.querySelector(".edit-name").value.trim();
    const newCategory = tr.querySelector(".edit-category").value.trim() || "Uncategorized";
    if (!newPattern || !newName) { alert("Pattern and name required."); return; }
    try {
      const { error } = await supabase.from("description_mapping").update({
        match_pattern: newPattern,
        display_name: newName,
        category: newCategory
      }).eq("id", id);
      if (error) throw error;
      await loadDescriptionMap();
    } catch (err) {
      console.error("Inline update error:", err);
      alert("Failed to update mapping.");
    }
  });

  tr.querySelector(".cancel-inline").addEventListener("click", () => {
    renderMappingTable();
  });
}

/**
 * deleteMapping - deletes mapping row by id
 */
async function deleteMapping(id) {
  try {
    const { error } = await supabase.from("description_mapping").delete().eq("id", id);
    if (error) throw error;
    alert("Mapping deleted.");
    await loadDescriptionMap();
  } catch (err) {
    console.error("Delete mapping error:", err);
    alert("Failed to delete mapping.");
  }
}

/**
 * resetMappingForm - clears the top mapping form
 */
function resetMappingForm() {
  if (!mappingIdInput) return;
  mappingIdInput.value = "";
  matchPatternInput.value = "";
  displayNameInput.value = "";
  categoryNameInput.value = "";
}

/* =========================
   Mapping application (client-side)
   ========================= */

/**
 * mapDescription - tries to match a raw description to a mapping
 * Returns { description, category }
 */
function mapDescription(rawDescription) {
  if (!rawDescription) return { description: rawDescription, category: "Uncategorized" };
  const upper = rawDescription.toUpperCase();
  for (const m of descriptionMap) {
    if (!m || !m.match_pattern) continue;
    try {
      if (upper.includes(m.match_pattern.toUpperCase())) {
        return { description: m.display_name, category: m.category };
      }
    } catch (err) {
      console.warn("Mapping check failed for", m, err);
    }
  }
  return { description: rawDescription, category: "Uncategorized" };
}

/* =========================
   Insert transactions (mapped) into Supabase
   ========================= */

/**
 * handleInsertClick
 * - Normalizes rows, applies mapping, filters invalid rows
 * - Inserts into Supabase transactions table
 */
async function handleInsertClick() {
  if (!allData || !allData.length) {
    alert("No CSV data loaded to insert.");
    return;
  }

  // Normalize and map each row
  const payload = allData.map(raw => {
    const rawDate = raw.Date || raw.date || raw.transaction_date || raw.DatePosted || raw.PostDate;
    const rawDescription = raw.Description || raw.description || raw.memo || raw.Payee || "";
    const rawAmount = raw.Amount || raw.amount || raw.AMT || raw.Value || "0";
    const rawDebitCredit = raw.DebitCredit || raw.debitcredit || "";

    const amountNum = parseFloat(String(rawAmount).replace(/[^0-9.-]/g, "")) || 0;
    const dateVal = parseValidDate(rawDate);
    const debitcreditVal = rawDebitCredit || (amountNum < 0 ? "Debit" : "Credit");

    const mapped = mapDescription(rawDescription);

    return {
      date: dateVal,
      description: mapped.description || rawDescription,
      amount: amountNum,
      debitcredit: debitcreditVal,
      category: mapped.category || raw.Category || raw.category || "Uncategorized"
    };
  })
  .filter(r => r.date && !isNaN(r.amount)); // filter invalid rows

  console.log("Payload to insert:", payload);

  if (!payload.length) {
    alert("No valid rows to insert (missing date/amount).");
    return;
  }

  try {
    const { data, error } = await supabase.from("transactions").insert(payload);
    if (error) {
      console.error("Insert error details:", error);
      alert(`Insert failed: ${error.message || JSON.stringify(error)}`);
      return;
    }
    alert(`Inserted ${Array.isArray(data) ? data.length : 1} transactions.`);
    // Refresh local views
    await loadTransactionsFromSupabase();
    await loadUtilities();
  } catch (err) {
    console.error("Unexpected insert error:", err);
    alert("Insert failed (see console).");
  }
}

/**
 * reMapUncategorizedTransactions
 * - Re-applies mapping logic to all "Uncategorized" transactions
 *   and updates their descriptions/categories in Supabase.
 */
async function reMapUncategorizedTransactions() {
  if (!confirm("Re-run mapping for all Uncategorized transactions?")) return;
  try {
    const { data, error } = await supabase
      .from("transactions")
      .select("id, description, category")
      .eq("category", "Uncategorized");

    if (error) throw error;
    if (!data.length) {
      alert("No Uncategorized transactions found.");
      return;
    }

    const updates = data.map(tx => {
      const mapped = mapDescription(tx.description);
      return {
        id: tx.id,
        description: mapped.description,
        category: mapped.category
      };
    });

    for (const u of updates) {
      const { error: upErr } = await supabase
        .from("transactions")
        .update({ description: u.description, category: u.category })
        .eq("id", u.id);
      if (upErr) console.error("Update failed:", upErr);
    }

    alert(`Re-mapped ${updates.length} transactions.`);
    await loadTransactionsFromSupabase();
  } catch (err) {
    console.error("reMapUncategorizedTransactions error:", err);
    alert("Failed to re-map (check console).");
  }
}

/* =========================
   Load transactions from Supabase and render
   ========================= */

/**
 * loadTransactionsFromSupabase
 * - Fetches transactions and stores into allData
 * - Builds month filter and renders grouped table + charts
 */
async function loadTransactionsFromSupabase() {
  try {
    const { data, error } = await supabase.from("transactions").select("*").order("date", { ascending: false });
    if (error) {
      console.error("Error loading transactions:", error);
      alert("Failed to load transactions (see console).");
      return;
    }
    // Normalize fields shape
    allData = (data || []).map(r => ({
      id: r.id,
      date: r.date,
      description: r.description,
      amount: Number(r.amount),
      debitcredit: r.debitcredit,
      category: r.category,
      created_at: r.created_at
    }));

    buildMonthFilterFromData(allData);
    renderTransactionsGroupedByMonth(allData);
    renderSummaryFromData(allData);
    renderBudgetChartFromData(allData);
  } catch (err) {
    console.error("Unexpected error reading transactions:", err);
  }
}

/**
 * buildMonthFilterFromData
 * - Creates a month dropdown, category dropdown, collapse-all checkbox, and re-map button.
 */
function buildMonthFilterFromData(data) {
  // gather months present in data
  const months = new Set();
  const categories = new Set();
  data.forEach(r => {
    if (r.date) months.add(getMonthKey(r.date));
    if (r.category) categories.add(r.category);
  });

  monthList = Array.from(months).sort((a, b) => b.localeCompare(a)); // newest first
  const categoryList = Array.from(categories).sort();

  // create container if not present
  let container = document.getElementById("monthFilterContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "monthFilterContainer";
    container.style.margin = "8px 0";
    container.style.display = "flex";
    container.style.flexWrap = "wrap";
    container.style.gap = "10px";
    const transactionsSection = document.getElementById("transactions");
    if (transactionsSection) transactionsSection.prepend(container);
  }

  container.innerHTML = `
    <label style="color:#00e0ff;">
      Month:
      <select id="monthFilterSelect" style="background:#222;color:#fff;border:1px solid #00e0ff;padding:6px;border-radius:6px;">
        <option value="All">All</option>
        ${monthList.map(m => `<option value="${m}">${m}</option>`).join("")}
      </select>
    </label>
    <label style="color:#00e0ff;">
      Category:
      <select id="categoryFilterSelect" style="background:#222;color:#fff;border:1px solid #00e0ff;padding:6px;border-radius:6px;">
        <option value="All">All</option>
        ${categoryList.map(c => `<option value="${c}">${c}</option>`).join("")}
      </select>
    </label>
    <label style="color:#00e0ff;align-items:center;display:flex;">
      <input type="checkbox" id="toggleCollapseAll" style="margin-right:6px;"/> Collapse all months
    </label>
    <button id="reMapBtn" style="background:#00e0ff;color:#000;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;">
      ♻️ Re-Map Uncategorized
    </button>
    <button id="suggestBtn" style="background:#111;color:#00e0ff;border:1px solid #00e0ff;padding:6px 12px;border-radius:6px;cursor:pointer;">
  💡 Suggest Matches
    </button>

  `;

  // attach listeners
  const monthSel = document.getElementById("monthFilterSelect");
  const catSel = document.getElementById("categoryFilterSelect");
  const toggle = document.getElementById("toggleCollapseAll");
  const reMapBtn = document.getElementById("reMapBtn");
  const suggestBtn = document.getElementById("suggestBtn");

  monthSel.value = activeMonthFilter || "All";
  monthSel.addEventListener("change", () => {
    activeMonthFilter = monthSel.value;
    renderTransactionsGroupedByMonth(allData);
  });

  catSel.addEventListener("change", () => {
    activeCategoryFilter = catSel.value;
    renderTransactionsGroupedByMonth(allData);
  });

  toggle.addEventListener("change", (e) => {
    const collapse = e.target.checked;
    monthList.forEach(m => collapsedMonths[m] = collapse);
    renderTransactionsGroupedByMonth(allData);
  });

  reMapBtn.addEventListener("click", async () => {
    await reMapUncategorizedTransactions();
  });

  suggestBtn.addEventListener("click", async () => {
    await suggestMappingsForUncategorized();
  });
}

/**
 * renderTransactionsGroupedByMonth
 * - Shows transactions grouped by month with collapsible headers, filtered by month & category.
 */
function renderTransactionsGroupedByMonth(data) {
  if (!dataTableBody) return;
  dataTableBody.innerHTML = "";

  if (!data || !data.length) {
    dataTableBody.innerHTML = "<tr><td colspan='4'>No transactions found.</td></tr>";
    return;
  }

  // Apply category filter
let filtered = data;
if (activeCategoryFilter && activeCategoryFilter !== "All") {
  filtered = filtered.filter(r => (r.category || "Uncategorized") === activeCategoryFilter);
}

// Display summary info
if (filterSummary) {
  const monthText = (activeMonthFilter && activeMonthFilter !== "All") ? activeMonthFilter : "All months";
  const catText = (activeCategoryFilter && activeCategoryFilter !== "All") ? activeCategoryFilter : "All categories";
  filterSummary.textContent = `Showing ${filtered.length} transactions (${catText} — ${monthText})`;
}

  // group rows by month
  const groups = {};
  filtered.forEach(r => {
    const key = getMonthKey(r.date || r.Date || r.created_at);
    groups[key] = groups[key] || [];
    groups[key].push(r);
  });

  const months = Object.keys(groups).sort((a,b) => b.localeCompare(a)); // newest first
  const shownMonths = (activeMonthFilter && activeMonthFilter !== "All") ? [activeMonthFilter] : months;

  shownMonths.forEach(monthKey => {
    const rows = groups[monthKey] || [];
    if (!rows.length) return;

    // header row
    const headerRow = document.createElement("tr");
    headerRow.innerHTML = `
      <td colspan="4" style="background:#0f172a;color:#00e0ff;padding:8px;cursor:pointer">
        <strong>${monthKey}</strong>
        <span style="float:right">${collapsedMonths[monthKey] ? "▶ Expand" : "▼ Collapse"}</span>
      </td>
    `;
    headerRow.addEventListener("click", () => {
      collapsedMonths[monthKey] = !collapsedMonths[monthKey];
      renderTransactionsGroupedByMonth(allData);
    });
    dataTableBody.appendChild(headerRow);

    // collapsed?
    if (collapsedMonths[monthKey]) {
      const infoRow = document.createElement("tr");
      infoRow.innerHTML = `<td colspan="4" style="opacity:0.8;padding:8px;">${rows.length} transactions (collapsed)</td>`;
      dataTableBody.appendChild(infoRow);
      return;
    }

    // show rows
    rows.forEach(r => {
      const tr = document.createElement("tr");
      const amountColor = Number(r.amount) < 0 ? "tomato" : "limegreen";
      tr.innerHTML = `
        <td>${escapeHtml(r.date || "")}</td>
        <td>${escapeHtml(r.description || "")}</td>
        <td>${escapeHtml(r.category || "")}</td>
        <td style="color:${amountColor}">$${formatMoney(r.amount)}</td>
      `;
      dataTableBody.appendChild(tr);
    });
  });
}

/* =========================
   Summary and charts
   ========================= */

/**
 * renderSummaryFromData - calculate totals and update DOM
 */
function renderSummaryFromData(data) {
  const income = data.filter(r => Number(r.amount) > 0).reduce((s,r) => s + Number(r.amount), 0);
  const expenses = data.filter(r => Number(r.amount) < 0).reduce((s,r) => s + Number(r.amount), 0);
  const net = income + expenses;
  const totalExpensesEl = document.getElementById("totalExpenses");
  const totalIncomeEl = document.getElementById("totalIncome");
  const netTotalEl = document.getElementById("netTotal");
  if (totalExpensesEl) totalExpensesEl.textContent = `Expenses: $${formatMoney(Math.abs(expenses))}`;
  if (totalIncomeEl) totalIncomeEl.textContent = `Income: $${formatMoney(income)}`;
  if (netTotalEl) netTotalEl.textContent = `Net: $${formatMoney(net)}`;
}

/**
 * renderBudgetChartFromData - draws category totals bar chart
 */
function renderBudgetChartFromData(data) {
  if (!budgetCanvas) return;
  const byCat = {};
  data.forEach(r => {
    const cat = r.category || "Other";
    byCat[cat] = (byCat[cat] || 0) + Number(r.amount || 0);
  });
  const labels = Object.keys(byCat);
  const values = labels.map(l => byCat[l]);

  if (budgetChart) budgetChart.destroy();
  const ctx = budgetCanvas.getContext("2d");
  budgetChart = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ label: "Amount", data: values, backgroundColor: labels.map((_,i) => palette(i)) }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });
}

/* =========================
   Utilities: load + trend
   ========================= */

/**
 * loadUtilities - read bill_averages and show table + render trend chart
 */
async function loadUtilities() {
  if (!utilityTableBody) return;
  utilityTableBody.innerHTML = "<tr><td colspan='4'>Loading...</td></tr>";
  try {
    const { data, error } = await supabase.from("bill_averages").select("*").order("category", { ascending: true });
    if (error) {
      console.error("Error loading bill_averages:", error);
      utilityTableBody.innerHTML = "<tr><td colspan='4'>Error loading data</td></tr>";
      return;
    }
    utilityTableBody.innerHTML = "";
    (data || []).forEach(row => {
      utilityTableBody.insertAdjacentHTML("beforeend", `
        <tr>
          <td>${escapeHtml(row.category)}</td>
          <td>$${formatMoney(row.avg_amount)}</td>
          <td>${row.num_months}</td>
          <td>${new Date(row.last_updated).toLocaleDateString()}</td>
        </tr>
      `);
    });
    await renderUtilityTrendChart();
  } catch (err) {
    console.error("loadUtilities error:", err);
    utilityTableBody.innerHTML = "<tr><td colspan='4'>Error</td></tr>";
  }
}

/**
 * renderUtilityTrendChart - builds monthly series per category (line chart)
 */
async function renderUtilityTrendChart() {
  try {
    const { data, error } = await supabase.from("transactions").select("category, amount, debitcredit, date");
    if (error) { console.error("Trend fetch error:", error); return; }

    const monthly = {}; // key: `${cat}_${YYYY-MM}` => total
    data.forEach(tx => {
      if (tx.debitcredit !== "Debit") return;
      const month = getMonthKey(tx.date);
      const cat = tx.category || "Other";
      const key = `${cat}_${month}`;
      monthly[key] = (monthly[key] || 0) + Math.abs(Number(tx.amount || 0));
    });

    const categoryMap = {};
    Object.keys(monthly).forEach(k => {
      const parts = k.split("_");
      const month = parts.pop();
      const cat = parts.join("_");
      categoryMap[cat] = categoryMap[cat] || {};
      categoryMap[cat][month] = monthly[k];
    });

    const months = Array.from(new Set(Object.keys(monthly).map(k => k.split("_").pop()))).sort();
    const datasets = Object.entries(categoryMap).map(([cat, vals], i) => ({
      label: cat,
      data: months.map(m => vals[m] || 0),
      borderColor: palette(i),
      backgroundColor: palette(i),
      tension: 0.3,
      fill: false
    }));

    if (utilityTrendChart && typeof utilityTrendChart.destroy === "function") utilityTrendChart.destroy();
    if (!trendCanvas) return;
    const ctx = trendCanvas.getContext("2d");
    utilityTrendChart = new Chart(ctx, {
      type: "line",
      data: { labels: months, datasets },
      options: { responsive: true, plugins: { title: { display: true, text: "Utility Bill Trends (Monthly)" }, legend: { position: "bottom" } }, scales: { y: { beginAtZero: true } } }
    });
  } catch (err) {
    console.error("renderUtilityTrendChart error:", err);
  }
}

/* =========================
   Preview rendering - used for CSV preview (not persisted)
   ========================= */

/**
 * renderTransactionsPreview - show the loaded CSV rows (allData preview)
 * This doesn't require Supabase, it's for previewing before insert.
 */
function renderTransactionsPreview() {
  if (!dataTableBody) return;
  dataTableBody.innerHTML = "";

  if (!allData || !allData.length) {
    dataTableBody.innerHTML = "<tr><td colspan='4'>No preview loaded.</td></tr>";
    return;
  }

  // Show first 200 rows to avoid huge table problems
  const limit = Math.min(allData.length, 200);
  for (let i = 0; i < limit; i++) {
    const r = allData[i];
    const rawDate = r.Date || r.date || r.PostDate || "";
    const rawDesc = r.Description || r.description || r.Payee || "";
    const rawAmt = r.Amount || r.amount || r.Value || "0";
    const mapped = mapDescription(rawDesc);
    const amountNum = parseFloat(String(rawAmt).replace(/[^0-9.-]/g, "")) || 0;
    const amountColor = amountNum < 0 ? "tomato" : "limegreen";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(parseValidDate(rawDate) || rawDate || "")}</td>
      <td>${escapeHtml(mapped.description || rawDesc)}</td>
      <td>${escapeHtml(mapped.category || "")}</td>
      <td style="color:${amountColor}">$${formatMoney(amountNum)}</td>
    `;
    dataTableBody.appendChild(tr);
  }
  if (allData.length > limit) {
    const noteRow = document.createElement("tr");
    noteRow.innerHTML = `<td colspan="4">Preview limited to ${limit} rows. Insert will include all rows.</td>`;
    dataTableBody.appendChild(noteRow);
  }
}

/* ====================================================
   Suggest Matching Ideas for Uncategorized Transactions
   ==================================================== */

/**
 * suggestMappingsForUncategorized
 * - Scans transactions still marked as "Uncategorized"
 * - Finds possible mapping patterns that appear in their descriptions
 * - Displays suggestions directly in the table with a button to apply
 */
async function suggestMappingsForUncategorized() {
  try {
    const { data, error } = await supabase
      .from("transactions")
      .select("id, description, category")
      .eq("category", "Uncategorized");

    if (error) throw error;
    if (!data.length) {
      alert("No Uncategorized transactions found.");
      return;
    }

    let suggestions = [];
    for (const tx of data) {
      const descUpper = tx.description.toUpperCase();
      const possible = descriptionMap.filter(m => descUpper.includes(m.match_pattern.toUpperCase()));
      if (possible.length) {
        suggestions.push({
          id: tx.id,
          description: tx.description,
          possible: possible.map(p => `${p.display_name} (${p.category})`)
        });
      }
    }

    if (!suggestions.length) {
      alert("No good matches found for Uncategorized transactions.");
      return;
    }

    // Display suggestion modal or alert (simple version)
    let suggestionText = "Suggested mappings:\n\n";
    suggestions.forEach(s => {
      suggestionText += `• ${s.description}\n   → ${s.possible.join(", ")}\n\n`;
    });
    alert(suggestionText);

  } catch (err) {
    console.error("suggestMappingsForUncategorized error:", err);
    alert("Failed to suggest mappings (check console).");
  }
}

/* =========================
   End of file
   =========================
   Tips:
    - If CSV parsing fails on quoted fields, include PapaParse and replace the simple parser.
    - Use console.log to inspect variables while learning.
    - If Supabase returns RLS errors, review your table policies in Supabase SQL.
    - You can refactor functions into modules as project grows.
   ========================= */