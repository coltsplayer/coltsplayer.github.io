/******************************************************************************
 * script.js
 *
 * Full, final version for your Budget Tracker app.
 *
 * Requirements:
 *  - index.html must include:
 *      <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
 *      and then <script src="script.js"></script>
 *  - DOM element IDs must match those used below (see index.html we created).
 *
 * Replace SUPABASE_URL and SUPABASE_KEY with your project values.
 ******************************************************************************/

/* ============================
   Supabase configuration
   ============================ */
// Use window.supabase.createClient because we load supabase-js via CDN in index.html
const SUPABASE_URL = "https://uimrsmpjbweoohvbvywv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpbXJzbXBqYndlb29odmJ2eXd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4OTAxNTksImV4cCI6MjA3NTQ2NjE1OX0.QmU09jLhunbWKLAHM2ddGpsmgcBctw7ykX199Kmmn88";
// const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// then require login before showing data
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let allData = [];

// ----------------------------------------------
// Show login modal until authenticated
// ----------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    currentUser = user;
    hideLoginModal();
    loadTransactionsFromSupabase();
  } else {
    showLoginModal();
  }
});

// ----------------------------------------------
// Login UI logic
// ----------------------------------------------
function showLoginModal() {
  document.getElementById("loginModal").style.display = "flex";
}
function hideLoginModal() {
  document.getElementById("loginModal").style.display = "none";
}

document.getElementById("loginBtn").addEventListener("click", async () => {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value.trim();
  const msg = document.getElementById("loginMsg");
  msg.textContent = "Signing in...";

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    msg.textContent = "❌ " + error.message;
    return;
  }

  currentUser = data.user;
  msg.textContent = "✅ Logged in!";
  setTimeout(() => {
    hideLoginModal();
    loadTransactionsFromSupabase();
  }, 600);
});

// Optional: auto-react to login/logout events
supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.user) {
    currentUser = session.user;
    hideLoginModal();
    loadTransactionsFromSupabase();
  } else {
    currentUser = null;
    showLoginModal();
  }
});

/* ============================
   Global state
   ============================ */
let descriptionMap = []; // mapping table rows
let monthList = []; // available months (YYYY-MM)
let activeMonthFilter = "All";
let activeCategoryFilter = "All";
let activeSourceFilter = "All";
let collapsedMonths = {}; // map month->boolean
let budgetChart = null;
let utilityTrendChart = null;

/* ============================
   DOM references
   ============================ */
const uploadInput = document.getElementById("uploadCsv");
const sourceInput = document.getElementById("sourceInput"); // the select for source when uploading
const loadBtn = document.getElementById("loadBtn");
const insertBtn = document.getElementById("insertBtn");

const dataTableBody = document.querySelector("#dataTable tbody");
const mappingForm = document.getElementById("mappingForm");
const mappingIdInput = document.getElementById("mappingId");
const matchPatternInput = document.getElementById("matchPattern");
const displayNameInput = document.getElementById("displayName");
const categoryNameInput = document.getElementById("categoryName");
const resetFormBtn = document.getElementById("resetForm");
const mappingTableBody = document.querySelector("#mappingTable tbody");

const utilityTableBody = document.querySelector("#utilityTable tbody");
const budgetCanvas = document.getElementById("budgetChart");
const trendCanvas = document.getElementById("utilityTrendChart");

const filterSummary = document.getElementById("filterSummary");
let monthFilterSelect; // inserted dynamically
let categoryFilterSelect;
let sourceFilterSelect;
let reMapBtn;
let suggestBtn;

/* ============================
   Small helpers
   ============================ */

// Escape text before injecting into DOM
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Make sure a value is a valid date string YYYY-MM-DD
function parseValidDate(value) {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (isNaN(d)) return null;
  return d.toISOString().split("T")[0];
}

// Format money (two decimals)
function formatMoney(n) {
  return Number(n || 0).toFixed(2);
}

// Get YYYY-MM key for grouping
function getMonthKey(dateString) {
  const d = new Date(dateString);
  if (isNaN(d)) return "Unknown";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Color palette for charts
function palette(i) {
  const colors = ["#60a5fa","#f87171","#34d399","#fbbf24","#a78bfa","#38bdf8","#f472b6","#fde68a"];
  return colors[i % colors.length];
}

/* ============================
   Initialization
   ============================ */
document.addEventListener("DOMContentLoaded", async () => {
  // Load description mappings first (so preview mapping works)
  await loadDescriptionMap();

  // Load transactions & utilities from Supabase
  await loadTransactionsFromSupabase();
  await loadUtilities();

  // Wire other UI event handlers
  wireUpEventHandlers();
});

/* ============================
   Wire up event handlers
   ============================ */
function wireUpEventHandlers() {
  if (loadBtn) loadBtn.addEventListener("click", handleLoadCsvClick);
  if (insertBtn) insertBtn.addEventListener("click", handleInsertClick);
  if (mappingForm) mappingForm.addEventListener("submit", handleMappingFormSubmit);
  if (resetFormBtn) resetFormBtn.addEventListener("click", resetMappingForm);
}

/* ============================
   CSV Loading & Preview
   ============================ */
/*
  NOTE: This is a basic CSV parser (split on commas). It will break on
  quoted fields that contain commas. For real bank exports consider
  using PapaParse:
    https://www.papaparse.com/
*/

function parseCsvBasic(text) {
  // remove BOM
  let cleaned = text.replace(/^\uFEFF/, "");
  const lines = cleaned.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = lines.shift().split(",").map(h => h.trim());
  return lines.map(line => {
    const cols = line.split(",");
    const obj = {};
    headers.forEach((h, i) => obj[h.trim()] = cols[i] !== undefined ? cols[i].trim() : "");
    return obj;
  });
}

function handleLoadCsvClick() {
  const file = uploadInput?.files?.[0];
  const source = sourceInput?.value?.trim();

  if (!source) {
    alert("Please select a source (e.g., Checking, Mastercard) before loading.");
    return;
  }
  if (!file) {
    alert("Please choose a CSV file.");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const rows = parseCsvBasic(text);
    // attach source to each parsed row
    rows.forEach(r => r.Source = source);
    allData = rows;
    renderTransactionsPreview();
    buildMonthFilterFromData(allData); // builds filters from preview data too
    alert(`Loaded ${rows.length} rows from CSV (preview).`);
  };
  reader.onerror = (err) => {
    console.error("CSV read error:", err);
    alert("Failed to read CSV (see console).");
  };
  reader.readAsText(file);
}

/* ============================
   Description Mapping CRUD + UI
   ============================ */

async function loadDescriptionMap() {
  try {
    const { data, error } = await supabase.from("description_mapping").select("*").order("id", { ascending: true });
    if (error) {
      console.error("Error loading description mapping:", error);
      descriptionMap = [];
      return;
    }
    descriptionMap = data || [];
    renderMappingTable();
  } catch (err) {
    console.error("Unexpected error loading mapping:", err);
  }
}

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
        <button class="edit-inline">✏️</button>
        <button class="delete-mapping">🗑️</button>
      </td>
    `;
    mappingTableBody.appendChild(tr);
  });

  // attach events to newly created buttons
  mappingTableBody.querySelectorAll(".edit-inline").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const tr = e.currentTarget.closest("tr");
      startInlineEdit(tr);
    });
  });

  mappingTableBody.querySelectorAll(".delete-mapping").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = Number(e.currentTarget.closest("tr").dataset.id);
      if (!confirm("Delete mapping?")) return;
      try {
        const { error } = await supabase.from("description_mapping").delete().eq("id", id);
        if (error) throw error;
        await loadDescriptionMap();
      } catch (err) {
        console.error("Delete mapping error:", err);
        alert("Failed to delete mapping.");
      }
    });
  });
}

function startInlineEdit(tr) {
  if (!tr) return;
  const id = Number(tr.dataset.id);
  const m = descriptionMap.find(x => x.id === id);
  if (!m) return alert("Mapping not found.");

  tr.innerHTML = `
    <td><input class="edit-pattern" value="${escapeHtml(m.match_pattern)}" /></td>
    <td><input class="edit-name" value="${escapeHtml(m.display_name)}" /></td>
    <td><input class="edit-category" value="${escapeHtml(m.category)}" /></td>
    <td>
      <button class="save-inline">💾</button>
      <button class="cancel-inline">✖</button>
    </td>
  `;

  tr.querySelector(".save-inline").addEventListener("click", async () => {
    const newPattern = tr.querySelector(".edit-pattern").value.trim();
    const newName = tr.querySelector(".edit-name").value.trim();
    const newCategory = tr.querySelector(".edit-category").value.trim() || "Uncategorized";
    if (!newPattern || !newName) { alert("Pattern and display name required."); return; }
    try {
      const { error } = await supabase.from("description_mapping").update({
        match_pattern: newPattern, display_name: newName, category: newCategory
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

async function handleMappingFormSubmit(evt) {
  evt.preventDefault();
  const id = mappingIdInput.value ? Number(mappingIdInput.value) : null;
  const match_pattern = matchPatternInput.value.trim();
  const display_name = displayNameInput.value.trim();
  const category = categoryNameInput.value.trim() || "Uncategorized";
  if (!match_pattern || !display_name) {
    alert("Please provide pattern and display name.");
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
    resetMappingForm();
    await loadDescriptionMap();
  } catch (err) {
    console.error("Mapping save error:", err);
    alert("Failed to save mapping (see console).");
  }
}

function resetMappingForm() {
  mappingIdInput.value = "";
  matchPatternInput.value = "";
  displayNameInput.value = "";
  categoryNameInput.value = "";
}

/* ============================
   Mapping application (client-side)
   ============================ */
/**
 * mapDescription(rawDescription)
 * Returns { description, category }
 * Uses simple substring match against mapping.match_pattern
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
      console.warn("Error checking mapping", m, err);
    }
  }
  return { description: rawDescription, category: "Uncategorized" };
}

/* ============================
   Insert transactions into Supabase
   ============================ */

async function handleInsertClick() {
  if (!allData || !allData.length) {
    alert("No CSV data loaded to insert.");
    return;
  }

  // Normalize payload; ensure field names match DB columns
  const clean = allData.map(r => {
    const rawDate = r.Date || r.date || r.PostDate || r.transaction_date;
    const rawDesc = r.Description || r.description || r.Memo || "";
    const rawAmount = r.Amount || r.amount || r.Value || "0";
    const rawDebitCredit = r.DebitCredit || r.debitcredit || "";
    const amountNum = parseFloat(String(rawAmount).replace(/[^0-9.-]/g, "")) || 0;
    const dateVal = parseValidDate(rawDate);
    const debitcreditVal = rawDebitCredit || (amountNum < 0 ? "Debit" : "Credit");
    // Apply mapping for nicer description/category before insert
    const mapped = mapDescription(rawDesc);
    return {
      date: dateVal,
      description: mapped.description || rawDesc,
      amount: amountNum,
      debitcredit: debitcreditVal,
      category: mapped.category || r.Category || r.category || "Uncategorized",
      source: r.Source || r.source || sourceInput?.value?.trim() || "Unknown"
    };
  }).filter(r => r.date && !isNaN(r.amount)); // filter invalid rows

  if (!clean.length) {
    alert("No valid rows to insert (missing date/amount).");
    return;
  }

  try {
    const { data, error } = await supabase.from("transactions").insert(clean.map(row => ({
      ...row,
      user_id: currentUser?.id,   // 👈 REQUIRED for RLS policies
      })));
    if (error) {
      console.error("Insert error:", error);
      alert(`Insert failed: ${error.message || JSON.stringify(error)}`);
      return;
    }
    alert(`Inserted ${Array.isArray(data) ? data.length : 1} transactions.`);
    // reload from Supabase (ensures source/budgets/triggers processed)
    await loadTransactionsFromSupabase();
    await loadUtilities();
  } catch (err) {
    console.error("Unexpected insert error:", err);
    alert("Insert failed (see console).");
  }
}

/* ============================
   Load transactions from Supabase & render
   ============================ */
// Replace your existing loadTransactionsFromSupabase with this
async function loadTransactionsFromSupabase() {
  if (!currentUser) {
    console.warn("No user logged in.");
    return;
  }
  console.log("[budget] loading transactions for:", currentUser.email);

  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("date", { ascending: false });

  if (error) {
    console.error("Load error:", error);
    alert("Failed to load transactions");
    return;
  }

  allData = (data || []).map(r => ({
    id: r.id,
    date: parseValidDate(r.date) || r.date,
    description: r.description,
    amount: Number(r.amount),
    category: r.category || "Uncategorized",
    source: r.source || "",
    created_at: r.created_at,
    user_id: r.user_id,
  }));

  console.log(`[budget] loaded ${allData.length} transactions`);
  buildMonthFilterFromData(allData);
  renderTransactionsGroupedByMonth(allData);
  renderSummaryFromData(allData);
  renderBudgetChartFromData(allData);
}

// ============================
// Export to CSV / XLSX
// ============================
document.addEventListener("DOMContentLoaded", () => {
  const csvBtn = document.getElementById("exportCsvBtn");
  const xlsxBtn = document.getElementById("exportXlsxBtn");

  if (csvBtn) csvBtn.addEventListener("click", exportToCsv);
  if (xlsxBtn) xlsxBtn.addEventListener("click", exportToXlsx);
});

function getFilteredDataForExport() {
  let rows = [...allData];

  if (activeCategoryFilter && activeCategoryFilter !== "All") {
    rows = rows.filter(r => (r.category || "Uncategorized") === activeCategoryFilter);
  }
  if (activeSourceFilter && activeSourceFilter !== "All") {
    rows = rows.filter(r => (r.source || "") === activeSourceFilter);
  }
  if (activeMonthFilter && activeMonthFilter !== "All") {
    rows = rows.filter(r => getMonthKey(r.date) === activeMonthFilter);
  }

  return rows.map(r => ({
    Date: r.date,
    Description: r.description,
    Category: r.category,
    Amount: r.amount,
    Source: r.source
  }));
}

function exportToCsv() {
  const rows = getFilteredDataForExport();
  if (!rows.length) {
    alert("No data to export for current filters.");
    return;
  }

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map(r => headers.map(h => JSON.stringify(r[h] || "")).join(","))
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "budget_filtered.csv";
  link.click();
}

function exportToXlsx() {
  const rows = getFilteredDataForExport();
  if (!rows.length) {
    alert("No data to export for current filters.");
    return;
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "FilteredTransactions");
  XLSX.writeFile(wb, "budget_filtered.xlsx");
}

/* ============================
   Filters: month, category, source and filter summary
   ============================ */

/**
 * buildMonthFilterFromData
 * Creates the filter controls dynamically above the transactions table.
 * Also creates re-map and suggest buttons.
 */
function buildMonthFilterFromData(data) {
  // gather months & categories & sources
  const months = new Set();
  const categories = new Set();
  const sources = new Set();
  data.forEach(r => {
    if (r.date) months.add(getMonthKey(r.date));
    if (r.category) categories.add(r.category);
    if (r.source) sources.add(r.source);
  });
  monthList = Array.from(months).sort((a,b) => b.localeCompare(a));
  const categoryList = Array.from(categories).sort();
  const sourceList = Array.from(sources).sort();

  // container element
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

  // Build HTML for filters
  container.innerHTML = `
    <label style="color:#00e0ff;">Month:
      <select id="monthFilterSelect" style="background:#222;color:#fff;border:1px solid #00e0ff;padding:6px;border-radius:6px;">
        <option value="All">All</option>
        ${monthList.map(m => `<option value="${m}">${m}</option>`).join("")}
      </select>
    </label>
    <label style="color:#00e0ff;">Category:
      <select id="categoryFilterSelect" style="background:#222;color:#fff;border:1px solid #00e0ff;padding:6px;border-radius:6px;">
        <option value="All">All</option>
        ${categoryList.map(c => `<option value="${c}">${c}</option>`).join("")}
      </select>
    </label>
    <label style="color:#00e0ff;">Source:
      <select id="sourceFilterSelect" style="background:#222;color:#fff;border:1px solid #00e0ff;padding:6px;border-radius:6px;">
        <option value="All">All</option>
        ${sourceList.map(s => `<option value="${s}">${s}</option>`).join("")}
      </select>
    </label>
    <label style="color:#00e0ff;display:flex;align-items:center;">
      <input type="checkbox" id="toggleCollapseAll" style="margin-right:6px;"/> Collapse all months
    </label>
    <button id="reMapBtn" style="background:#00e0ff;color:#000;padding:6px 12px;border-radius:6px;cursor:pointer;">
      ♻️ Re-Map Uncategorized
    </button>
    <button id="suggestBtn" style="background:#111;color:#00e0ff;border:1px solid #00e0ff;padding:6px 12px;border-radius:6px;cursor:pointer;">
      💡 Suggest Matches
    </button>
  `;

  // Get refs to new controls
  monthFilterSelect = document.getElementById("monthFilterSelect");
  categoryFilterSelect = document.getElementById("categoryFilterSelect");
  sourceFilterSelect = document.getElementById("sourceFilterSelect");
  const toggleCollapseAll = document.getElementById("toggleCollapseAll");
  reMapBtn = document.getElementById("reMapBtn");
  suggestBtn = document.getElementById("suggestBtn");

  // Setup initial values
  monthFilterSelect.value = activeMonthFilter || "All";
  categoryFilterSelect.value = activeCategoryFilter || "All";
  sourceFilterSelect.value = activeSourceFilter || "All";

  // Event listeners
  monthFilterSelect.addEventListener("change", () => {
    activeMonthFilter = monthFilterSelect.value;
    renderTransactionsGroupedByMonth(allData);
  });
  categoryFilterSelect.addEventListener("change", () => {
    activeCategoryFilter = categoryFilterSelect.value;
    renderTransactionsGroupedByMonth(allData);
  });
  sourceFilterSelect.addEventListener("change", () => {
    activeSourceFilter = sourceFilterSelect.value;
    renderTransactionsGroupedByMonth(allData);
  });

  toggleCollapseAll.addEventListener("change", (e) => {
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

/* ============================
   Render grouped transactions (collapsible by month)
   ============================ */

// Replace your existing renderTransactionsGroupedByMonth with this improved version
function renderTransactionsGroupedByMonth(data) {
  if (!dataTableBody) return;
  dataTableBody.innerHTML = "";

  if (!data || !data.length) {
    dataTableBody.innerHTML = "<tr><td colspan='7'>No transactions found.</td></tr>";
    if (filterSummary) filterSummary.textContent = "Showing 0 transactions";
    return;
  }

  // Apply filters
  let filtered = data;
  if (activeCategoryFilter && activeCategoryFilter !== "All") {
    filtered = filtered.filter(r => (r.category || "Uncategorized") === activeCategoryFilter);
  }
  if (activeSourceFilter && activeSourceFilter !== "All") {
    filtered = filtered.filter(r => (r.source || "") === activeSourceFilter);
  }
  if (activeMonthFilter && activeMonthFilter !== "All") {
    filtered = filtered.filter(r => getMonthKey(r.date) === activeMonthFilter);
  }

  // Update summary
  if (filterSummary) {
    const monthText = (activeMonthFilter && activeMonthFilter !== "All") ? activeMonthFilter : "All months";
    const catText = (activeCategoryFilter && activeCategoryFilter !== "All") ? activeCategoryFilter : "All categories";
    const srcText = (activeSourceFilter && activeSourceFilter !== "All") ? activeSourceFilter : "All sources";
    filterSummary.textContent = `Showing ${filtered.length} transactions (${catText} — ${monthText} — ${srcText})`;
  }

  // Category list for dropdown (keep in sync with allData)
  const categories = [...new Set(allData.map(r => r.category).filter(Boolean))].sort();

  // Group by month
  const groups = {};
  filtered.forEach(r => {
    const key = getMonthKey(r.date || r.Date || r.created_at);
    groups[key] = groups[key] || [];
    groups[key].push(r);
  });

  const months = Object.keys(groups).sort((a, b) => b.localeCompare(a));
  const shownMonths = (activeMonthFilter && activeMonthFilter !== "All") ? [activeMonthFilter] : months;

  shownMonths.forEach(monthKey => {
    const rows = groups[monthKey] || [];
    if (!rows.length) return;

    // Header
    const headerRow = document.createElement("tr");
    headerRow.innerHTML = `
      <td colspan="7" style="background:#0f172a;color:#00e0ff;padding:8px;cursor:pointer">
        <strong>${monthKey}</strong>
        <span style="float:right">${collapsedMonths[monthKey] ? "▶ Expand" : "▼ Collapse"}</span>
      </td>
    `;
    headerRow.addEventListener("click", () => {
      collapsedMonths[monthKey] = !collapsedMonths[monthKey];
      renderTransactionsGroupedByMonth(allData);
    });
    dataTableBody.appendChild(headerRow);

    if (collapsedMonths[monthKey]) {
      const noteRow = document.createElement("tr");
      noteRow.innerHTML = `<td colspan="7" style="padding:8px;opacity:0.9;">${rows.length} transactions (collapsed)</td>`;
      dataTableBody.appendChild(noteRow);
      return;
    }

    // Rows
    rows.forEach(r => {
      const tr = document.createElement("tr");
      const amountColor = Number(r.amount) < 0 ? "tomato" : "limegreen";

      // Inputs defaultValue set so Cancel can revert
      const dateVal = escapeHtml(r.date || "");
      const descVal = escapeHtml(r.description || "");
      const catVal = escapeHtml(r.category || "");
      const amtVal = formatMoney(r.amount);

      tr.innerHTML = `
        <td><input type="date" class="tx-date" value="${dateVal}" disabled style="background:#111;color:#fff;border:1px solid #333;border-radius:4px;padding:2px 4px;width:135px;" /></td>
        <td><input type="text" class="tx-desc" value="${descVal}" disabled style="width:220px;background:#111;color:#fff;border:1px solid #333;border-radius:4px;padding:2px 4px;" /></td>
        <td>
          <select class="tx-cat" disabled style="width:150px;background:#111;color:#fff;border:1px solid #333;border-radius:4px;padding:2px 4px;">
            ${categories.map(c => `<option value="${escapeHtml(c)}" ${c === r.category ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
          </select>
        </td>
        <td><input type="number" step="0.01" class="tx-amt" value="${amtVal}" disabled style="width:100px;background:#111;color:${amountColor};border:1px solid #333;border-radius:4px;padding:2px 4px;text-align:right;" /></td>
        <td>${escapeHtml(r.source || "")}</td>
        <td>
          <button class="edit-tx">✏️</button>
          <button class="save-tx hidden">💾</button>
          <button class="cancel-tx hidden">✖</button>
        </td>
      `;
      dataTableBody.appendChild(tr);

      // Grab references
      const editBtn = tr.querySelector(".edit-tx");
      const saveBtn = tr.querySelector(".save-tx");
      const cancelBtn = tr.querySelector(".cancel-tx");
      const dateInput = tr.querySelector(".tx-date");
      const descInput = tr.querySelector(".tx-desc");
      const catSelect = tr.querySelector(".tx-cat");
      const amtInput = tr.querySelector(".tx-amt");
      const inputs = [dateInput, descInput, catSelect, amtInput];

      // Set defaultValue properties so cancel can revert properly
      dateInput.defaultValue = dateInput.value;
      descInput.defaultValue = descInput.value;
      catSelect.defaultValue = catSelect.value;
      amtInput.defaultValue = amtInput.value;

      // Enter edit
      editBtn.addEventListener("click", () => {
        inputs.forEach(i => i.disabled = false);
        editBtn.classList.add("hidden");
        saveBtn.classList.remove("hidden");
        cancelBtn.classList.remove("hidden");
        tr.style.background = "#1e293b";
      });

      // Cancel - revert to defaults
      cancelBtn.addEventListener("click", () => {
        dateInput.value = dateInput.defaultValue;
        descInput.value = descInput.defaultValue;
        catSelect.value = catSelect.defaultValue;
        amtInput.value = amtInput.defaultValue;
        inputs.forEach(i => i.disabled = true);
        tr.style.background = "";
        editBtn.classList.remove("hidden");
        saveBtn.classList.add("hidden");
        cancelBtn.classList.add("hidden");
      });

      // Save - robustly update DB and then update local state to re-render fast
    saveBtn.addEventListener("click", async () => {
      if (!r.id) {
        alert("⚠️ This row does not have an ID. Only saved transactions can be updated.");
        console.warn("Missing ID for transaction:", r);
        return;
      }

      const newDate = parseValidDate(tr.querySelector(".tx-date").value.trim());
      const newDesc = tr.querySelector(".tx-desc").value.trim();
      const newCat = tr.querySelector(".tx-cat").value.trim() || "Uncategorized";
      const newAmt = parseFloat(tr.querySelector(".tx-amt").value) || 0;

      saveBtn.disabled = true;
      saveBtn.textContent = "⏳";

      try {
        console.log(`[budget] updating id=${r.id}`, { newDate, newDesc, newCat, newAmt });

        const { data, error, count } = await supabase
          .from("transactions")
          .update({
            date: newDate,
            description: newDesc,
            category: newCat,
            amount: newAmt,
          })
          .eq("id", String(r.id))  // 👈 make sure it's a string if UUID
          .select();

        if (error) {
          console.error("[budget] Update failed:", error);
          alert(`❌ Update failed: ${error.message}`);
          return;
        }

        if (!data || !data.length) {
          console.warn("[budget] Update found no matching row. ID mismatch or RLS?");
          alert("No matching record found to update — check console for details.");
          return;
        }

        console.log("[budget] Update success:", data);

        // Update local data so UI refreshes
        const idx = allData.findIndex(x => x.id === r.id);
        if (idx >= 0) {
          allData[idx] = { ...allData[idx], date: newDate, description: newDesc, category: newCat, amount: newAmt };
        }
        renderTransactionsGroupedByMonth(allData);
        alert("✅ Transaction updated successfully.");
      } catch (err) {
        console.error("[budget] Save exception:", err);
        alert("Unexpected error during save (see console).");
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "💾";
      }
    });
    });
  });
}

/* ============================
   Summary & Charts
   ============================ */

function renderSummaryFromData(data) {
  const income = data.filter(r => Number(r.amount) > 0).reduce((s,r) => s + Number(r.amount), 0);
  const expenses = data.filter(r => Number(r.amount) < 0).reduce((s,r) => s + Number(r.amount), 0);
  const totalExpensesEl = document.getElementById("totalExpenses");
  const totalIncomeEl = document.getElementById("totalIncome");
  const netTotalEl = document.getElementById("netTotal");
  if (totalExpensesEl) totalExpensesEl.textContent = `Expenses: $${formatMoney(Math.abs(expenses))}`;
  if (totalIncomeEl) totalIncomeEl.textContent = `Income: $${formatMoney(income)}`;
  if (netTotalEl) netTotalEl.textContent = `Net: $${formatMoney(income + expenses)}`;
}

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
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });
}

/* ============================
   Utilities: load & trend chart
   ============================ */

async function loadUtilities() {
  if (!utilityTableBody) return;
  utilityTableBody.innerHTML = "<tr><td colspan='4'>Loading...</td></tr>";
  try {
    const { data, error } = await supabase.from("bill_averages").select("*").order("category", { ascending: true });
    if (error) {
      console.error("Error loading bill_averages:", error);
      utilityTableBody.innerHTML = "<tr><td colspan='4'>Error</td></tr>";
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
  }
}

async function renderUtilityTrendChart() {
  if (!trendCanvas) return;
  try {
    const { data, error } = await supabase.from("transactions").select("category, amount, debitcredit, date");
    if (error) throw error;

    const monthly = {}; // key: `${cat}_${YYYY-MM}`
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
    const ctx = trendCanvas.getContext("2d");
    utilityTrendChart = new Chart(ctx, {
      type: "line",
      data: { labels: months, datasets },
      options: { plugins: { title: { display: true, text: "Utility Bill Trends (Monthly)" }, legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
    });
  } catch (err) {
    console.error("renderUtilityTrendChart error:", err);
  }
}

/* ============================
   Re-map & Suggest helpers
   ============================ */

/**
 * reMapUncategorizedTransactions
 * - Re-applies mapping logic for all transactions where category='Uncategorized'
 * - Updates those rows in Supabase and refreshes the local view
 */
async function reMapUncategorizedTransactions() {
  if (!confirm("Re-run mapping for all Uncategorized transactions?")) return;
  try {
    // Fetch uncategorized transactions
    const { data: uncategorized, error: loadErr } = await supabase
      .from("transactions")
      .select("id, description")
      .eq("category", "Uncategorized");
    if (loadErr) throw loadErr;
    if (!uncategorized || !uncategorized.length) {
      alert("No Uncategorized transactions found.");
      return;
    }

    // Load mapping table (ensure we have latest)
    await loadDescriptionMap();

    const updates = [];
    for (const tx of uncategorized) {
      const mapped = mapDescription(tx.description || "");
      if (mapped && mapped.category && mapped.category !== "Uncategorized") {
        updates.push({ id: tx.id, description: mapped.description, category: mapped.category });
      }
    }

    if (!updates.length) {
      alert("No remappable uncategorized transactions found.");
      return;
    }

    // Batch / sequential updates - Supabase doesn't have multi-row upsert with differing keys, so update individually
    let successCount = 0;
    for (const u of updates) {
      const { error } = await supabase.from("transactions").update({
        description: u.description,
        category: u.category
      }).eq("id", u.id);
      if (error) console.error("Update error:", error);
      else successCount++;
    }

    alert(`Re-mapped ${successCount} transactions.`);
    await loadTransactionsFromSupabase();
  } catch (err) {
    console.error("reMapUncategorizedTransactions error:", err);
    alert("Failed to re-map uncategorized transactions (see console).");
  }
}

/**
 * suggestMappingsForUncategorized
 * - Finds possible mappings for uncategorized transactions and shows them
 * - This function currently shows suggestions in an alert; we can upgrade to inline picks later
 */
async function suggestMappingsForUncategorized() {
  try {
    const { data: uncategorized, error: loadErr } = await supabase
      .from("transactions")
      .select("id, description")
      .eq("category", "Uncategorized");
    if (loadErr) throw loadErr;
    if (!uncategorized || !uncategorized.length) {
      alert("No Uncategorized transactions found.");
      return;
    }

    await loadDescriptionMap();

    // Helper to compute similarity between two strings
    function similarity(a, b) {
      if (!a || !b) return 0;
      const aWords = a.toUpperCase().replace(/[^A-Z0-9\s]/g, "").split(/\s+/).filter(Boolean);
      const bWords = b.toUpperCase().replace(/[^A-Z0-9\s]/g, "").split(/\s+/).filter(Boolean);
      const matchCount = aWords.filter(w => bWords.includes(w)).length;
      const totalWords = Math.max(aWords.length, bWords.length);
      return totalWords === 0 ? 0 : matchCount / totalWords;
    }

    const suggestions = [];
    for (const tx of uncategorized) {
      const desc = tx.description || "";
      const scored = descriptionMap.map(m => ({
        ...m,
        score: similarity(desc, m.match_pattern)
      }));
      const bestMatches = scored
        .filter(x => x.score >= 0.4)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      if (bestMatches.length > 0) {
        suggestions.push({
          id: tx.id,
          description: desc,
          matches: bestMatches
        });
      }
    }

    if (!suggestions.length) {
      alert("No good suggestions found for Uncategorized transactions.");
      return;
    }

    let msg = "💡 Suggested Matches for Uncategorized Transactions:\n\n";
    suggestions.forEach(s => {
      msg += `• ${s.description}\n`;
      s.matches.forEach(m => {
        msg += `   → ${m.display_name} (${m.category}) [${Math.round(m.score * 100)}%]\n`;
      });
      msg += "\n";
    });

    console.log("Suggestion details:", suggestions);
    alert(msg);
  } catch (err) {
    console.error("suggestMappingsForUncategorized error:", err);
    alert("Failed to suggest mappings (see console).");
  }
}

/* ============================
   Preview rendering (CSV preview, not persisted)
   ============================ */
function renderTransactionsPreview() {
  if (!dataTableBody) return;
  dataTableBody.innerHTML = "";

  if (!allData || !allData.length) {
    dataTableBody.innerHTML = "<tr><td colspan='5'>No preview loaded.</td></tr>";
    if (filterSummary) filterSummary.textContent = "Showing 0 transactions";
    return;
  }

  // render first N rows as preview
  const limit = Math.min(allData.length, 200);
  for (let i = 0; i < limit; i++) {
    const r = allData[i];
    const rawDate = r.Date || r.date || r.PostDate || "";
    const rawDesc = r.Description || r.description || r.Payee || "";
    const rawAmount = r.Amount || r.amount || r.Value || "0";
    const amountNum = parseFloat(String(rawAmount).replace(/[^0-9.-]/g, "")) || 0;
    const mapped = mapDescription(rawDesc);
    const amountColor = amountNum < 0 ? "tomato" : "limegreen";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(parseValidDate(rawDate) || rawDate || "")}</td>
      <td>${escapeHtml(mapped.description || rawDesc)}</td>
      <td>${escapeHtml(mapped.category || "")}</td>
      <td style="color:${amountColor}">$${formatMoney(amountNum)}</td>
      <td>${escapeHtml(r.Source || r.source || "")}</td>
    `;
    dataTableBody.appendChild(tr);
  }
  if (allData.length > limit) {
    const noteRow = document.createElement("tr");
    noteRow.innerHTML = `<td colspan="5">Preview limited to ${limit} rows. Insert will include all rows.</td>`;
    dataTableBody.appendChild(noteRow);
  }
}

/* ============================
   Initialization helpers & tips
   ============================ */
/*
 Tips:
 - If your CSV has quoted fields with commas, swap parseCsvBasic with PapaParse.
 - If you see RLS errors when inserting/updating in Supabase, add/adjust table policies in the Supabase SQL editor.
 - Use console.log(...) to inspect variables while debugging.
*/

/* ============================
   Exported small utilities (optional)
   ============================ */
// expose some helpers for debugging in console
window._budgetApp = {
  loadDescriptionMap,
  loadTransactionsFromSupabase,
  reMapUncategorizedTransactions,
  suggestMappingsForUncategorized,
  parseValidDate
};