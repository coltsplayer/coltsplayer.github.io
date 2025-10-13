//-------------------------------------------------------------
// Budget Tracker with Supabase Cloud Database
//-------------------------------------------------------------

// 🔧 Replace these with your Supabase credentials
const SUPABASE_URL = "https://uimrsmpjbweoohvbvywv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpbXJzbXBqYndlb29odmJ2eXd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4OTAxNTksImV4cCI6MjA3NTQ2NjE1OX0.QmU09jLhunbWKLAHM2ddGpsmgcBctw7ykX199Kmmn88";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------- Global state ----------
let allTransactions = [];
let allBudgets = {};         // from budgets.csv
let descriptionMap = {};     // from description_map.csv
let monthlyTotals = {};
let activeMonth = "All";
let activeCategory = "All";
let budgetChart = null;
let monthlyChart = null;
let utilityChart = null;

// ---------- DOM-ready startup ----------
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadCSVs();                // budgets.csv + description_map.csv
    await initialLoad();             // fetch transactions and render
    wireUpButtons();                 // event listeners
    console.log("App initialized");
  } catch (e) {
    console.error("Startup error:", e);
  }
});

// ---------- Load CSV files (budgets + description map) ----------
async function loadCSVs() {
  try {
    // description_map.csv: RawDescription,PrettyDescription
    const dres = await fetch("description_map.csv");
    if (dres.ok) {
      const txt = await dres.text();
      const parsed = Papa.parse(txt, { header: true }).data;
      descriptionMap = {};
      parsed.forEach(r => {
        if (r.RawDescription && r.PrettyDescription)
          descriptionMap[r.RawDescription.trim()] = r.PrettyDescription.trim();
      });
      console.log("Loaded description_map.csv", descriptionMap);
    } else {
      console.warn("description_map.csv not found (ok if you don't use it)");
    }

    // budgets.csv: Category,Budget
    const bres = await fetch("budgets.csv");
    if (bres.ok) {
      const txt2 = await bres.text();
      const parsedB = Papa.parse(txt2, { header: true }).data;
      allBudgets = {};
      parsedB.forEach(r => {
        if (r.Category && r.Budget) allBudgets[r.Category.trim()] = Number(r.Budget);
      });
      console.log("Loaded budgets.csv", allBudgets);
    } else {
      console.warn("budgets.csv not found (create budgets.json or CSV)");
    }
  } catch (err) {
    console.error("Error loading CSVs:", err);
  }
}

// ---------- Initial load: transactions + filters ----------
async function initialLoad() {
  await loadTransactionsFromSupabase();
  await loadBillAverages();   // separate table for averages
}

// ---------- Upload CSV handler (file input + upload button) ----------
function wireUpButtons() {
  const fileInput = document.getElementById("fileInput");
  const uploadBtn = document.getElementById("uploadBtn");
  const refreshAll = document.getElementById("refreshAll");

  uploadBtn?.addEventListener("click", async () => {
    const file = fileInput?.files?.[0];
    if (!file) { alert("Select a CSV file first."); return; }
    await uploadCSVFileToSupabase(file);
    fileInput.value = "";
  });

  refreshAll?.addEventListener("click", async () => {
    await loadTransactionsFromSupabase();
    alert("Data refreshed");
  });

  document.getElementById("exportExcel")?.addEventListener("click", exportExcel);
  document.getElementById("exportPDF")?.addEventListener("click", exportPDF);

  // Utility averages controls
  document.getElementById("addCategoryBtn")?.addEventListener("click", addNewCategory);
  document.getElementById("recalcAverages")?.addEventListener("click", recalcBillAverages);
  document.getElementById("refreshAverages")?.addEventListener("click", loadBillAverages);
}

// ---------- Upload CSV and insert rows into transactions table ----------
async function uploadCSVFileToSupabase(file) {
  try {
    const text = await file.text();
    const parsed = Papa.parse(text, { header: true, dynamicTyping: true }).data;
    const rows = parsed.filter(r => r.Date && r.Amount);

    if (!rows.length) { alert("No valid rows found in CSV."); return; }

    const supaRows = rows.map(r => ({
      date: r.Date,
      description: r.Description,
      amount: r.Amount,
      debitcredit: r.DebitCredit,
      category: r.Category
    }));

    const { error } = await supabase.from("transactions").insert(supaRows);
    if (error) { console.error("Upload error:", error); alert("Failed to upload CSV. See console."); return; }

    // reload everything
    await loadTransactionsFromSupabase();
    await recalcBillAverages(); // keep averages fresh
    alert(`Uploaded ${rows.length} transactions`);
  } catch (err) {
    console.error("Error uploading CSV:", err);
    alert("Upload failed (see console).");
  }
}

// ---------- Load all transactions from Supabase ----------
async function loadTransactionsFromSupabase() {
  try {
    const { data, error } = await supabase.from("transactions").select("*").order("date", { ascending: true });
    if (error) { console.error("Error loading transactions:", error); return; }
    allTransactions = data.map(t => ({
      Date: t.date,
      Description: t.description,
      Amount: t.amount,
      DebitCredit: t.debitcredit,
      Category: t.category
    }));

    // build months for filters
    const months = Array.from(new Set(allTransactions.map(t => {
      const d = new Date(t.Date);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }))).sort();

    await renderFilters(months, allBudgets);
    setupExportButtons(); // ensure export buttons wired (idempotent)
    updateDashboard();
  } catch (err) {
    console.error("loadTransactionsFromSupabase error:", err);
  }
}

// ---------- Try to get categories from categories table if present ----------
async function getCategoriesFromSupabase() {
  try {
    const candidates = ['name','category','title','label'];
    for (const c of candidates) {
      const { data, error } = await supabase.from('Categories').select(c).limit(200);
      if (!error && data && data.length) {
        const list = Array.from(new Set(data.map(r=>r[c]).filter(Boolean)));
        if (list.length) return list;
      }
    }
    // fallback: return empty array
    return [];
  } catch (err) {
    console.warn("getCategoriesFromSupabase error (table may not exist):", err);
    return [];
  }
}

// ---------- Render filter controls (month & category) ----------
async function renderFilters(months, budgetsObj) {
  const filterDiv = document.getElementById("filters");
  if (!filterDiv) return;

  const budgetCats = Object.keys(budgetsObj || {});
  const supaCats = await getCategoriesFromSupabase(); // may be []
  const combined = Array.from(new Set(['All', ...budgetCats, ...supaCats]));

  filterDiv.innerHTML = `
    <h3>Filters</h3>
    <div class="row" style="flex-wrap:wrap">
      <label>Month:
        <select id="monthFilter">${['All', ...months].map(m=>`<option value="${m}">${m}</option>`).join('')}</select>
      </label>
      <label>Category:
        <select id="categoryFilter">${combined.map(c=>`<option value="${c}">${c}</option>`).join('')}</select>
      </label>
    </div>
  `;

  document.getElementById("monthFilter")?.addEventListener("change", e => {
    activeMonth = e.target.value; updateDashboard();
  });
  document.getElementById("categoryFilter")?.addEventListener("change", e => {
    activeCategory = e.target.value; updateDashboard();
  });
}

// ---------- Update dashboard based on filters ----------
function updateDashboard() {
  let filtered = allTransactions.slice();

  if (activeMonth !== "All") {
    filtered = filtered.filter(tx => {
      const d = new Date(tx.Date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return key === activeMonth;
    });
  }
  if (activeCategory !== "All") filtered = filtered.filter(tx => tx.Category === activeCategory);

  // compute totals by category, monthly totals, income/expenses
  const totals = {};
  let totalIncome = 0, totalExpenses = 0;
  monthlyTotals = {};

  filtered.forEach(tx => {
    const cat = tx.Category ? tx.Category.trim() : 'Uncategorized';
    const amt = Math.abs(Number(tx.Amount) || 0);
    const d = new Date(tx.Date);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`;

    if (tx.DebitCredit === 'Debit') {
      totalExpenses += amt;
      totals[cat] = (totals[cat] || 0) + amt;
      monthlyTotals[monthKey] = monthlyTotals[monthKey] || { income:0, expenses:0 };
      monthlyTotals[monthKey].expenses += amt;
    } else if (tx.DebitCredit === 'Credit') {
      totalIncome += amt;
      monthlyTotals[monthKey] = monthlyTotals[monthKey] || { income:0, expenses:0 };
      monthlyTotals[monthKey].income += amt;
    }
  });

  const netBalance = totalIncome - totalExpenses;

  renderSummary(totalIncome, totalExpenses, netBalance);
  renderTable(totals, allBudgets);
  renderBudgetChart(totals, allBudgets);
  renderMonthlySummary(monthlyTotals);
  renderMonthlyChart(monthlyTotals);
  // also refresh utility averages UI
  loadBillAverages();
}

// ---------- Summary rendering ----------
function renderSummary(income, expenses, net) {
  const div = document.getElementById("summary");
  const netClass = net >= 0 ? 'positive' : 'negative';
  div.innerHTML = `
    <h3>Financial Summary</h3>
    <p class="muted">Showing: <strong>${activeMonth}</strong> / <strong>${activeCategory}</strong></p>
    <div class="row" style="gap:1rem;flex-wrap:wrap">
      <div class="card small"><strong>Total Income</strong><div>$${income.toFixed(2)}</div></div>
      <div class="card small"><strong>Total Expenses</strong><div>$${expenses.toFixed(2)}</div></div>
      <div class="card small ${netClass}"><strong>Net Balance</strong><div>$${net.toFixed(2)}</div></div>
    </div>
  `;
}

// ---------- Category table ----------
function renderTable(totals, budgetsObj) {
  const tbody = document.querySelector("#summaryTable tbody");
  tbody.innerHTML = '';
  const cats = Object.keys(totals);
  if (!cats.length) { tbody.innerHTML = `<tr><td colspan="4">No data</td></tr>`; return; }

  cats.forEach(cat => {
    const total = totals[cat];
    const budget = budgetsObj[cat] || 0;
    const within = total <= budget ? '✅ Yes' : '❌ No';
    tbody.insertAdjacentHTML('beforeend', `<tr><td>${cat}</td><td>$${total.toFixed(2)}</td><td>$${budget.toFixed(2)}</td><td>${within}</td></tr>`);
  });
}

// ---------- Budget Chart ----------
function renderBudgetChart(totals, budgetsObj) {
  const ctx = document.getElementById("budgetChart");
  const cats = Object.keys(totals);
  const spent = cats.map(c=>totals[c]);
  const budgets = cats.map(c=>budgetsObj[c] || 0);

  if (budgetChart) budgetChart.destroy();
  budgetChart = new Chart(ctx, {
    type:'bar',
    data:{ labels:cats, datasets:[
      { label:'Spent', data:spent, backgroundColor:'rgba(255,99,132,0.6)' },
      { label:'Budget', data:budgets, backgroundColor:'rgba(75,192,192,0.6)' }
    ]},
    options:{ responsive:true, scales:{ y:{ beginAtZero:true } } }
  });
}

// ---------- Monthly summary table ----------
function renderMonthlySummary(monthTotals) {
  const div = document.getElementById("monthlySummary");
  const months = Object.keys(monthTotals).sort();
  if (!months.length) { div.innerHTML = '<p>No monthly data</p>'; return; }

  let html = `<h3>Monthly Summary</h3><table class="table"><thead><tr><th>Month</th><th>Income</th><th>Expenses</th><th>Net</th></tr></thead><tbody>`;
  months.forEach(m => {
    const { income=0, expenses=0 } = monthTotals[m];
    const net = income - expenses;
    html += `<tr class="${net>=0?'positive':''}"><td>${m}</td><td>$${income.toFixed(2)}</td><td>$${expenses.toFixed(2)}</td><td>$${net.toFixed(2)}</td></tr>`;
  });
  html += '</tbody></table>';
  div.innerHTML = html;
}

// ---------- Monthly chart ----------
function renderMonthlyChart(monthTotals) {
  const labels = Object.keys(monthTotals).sort();
  const incomes = labels.map(l => (monthTotals[l].income||0));
  const expenses = labels.map(l => (monthTotals[l].expenses||0));

  const ctx = document.getElementById("monthlyChart");
  if (monthlyChart) monthlyChart.destroy();
  monthlyChart = new Chart(ctx, {
    type:'line',
    data:{
      labels,
      datasets:[
        { label:'Income', data:incomes, borderColor:'#16a34a', tension:0.2, fill:false },
        { label:'Expenses', data:expenses, borderColor:'#ef4444', tension:0.2, fill:false }
      ]
    },
    options:{ responsive:true, scales:{ y:{ beginAtZero:true } } }
  });
}

// ---------- Export buttons (Excel + PDF) ----------
function setupExportButtons() {
  // excel and pdf buttons wired in wireUpButtons to avoid duplicate handlers
}

// Excel export: writes summary table to sheet
function exportExcel() {
  try {
    const table = document.getElementById("summaryTable");
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.table_to_sheet(table);
    XLSX.utils.book_append_sheet(wb, ws, 'Category Summary');
    XLSX.writeFile(wb, `budget_report_${activeMonth}_${activeCategory}.xlsx`);
  } catch (err) {
    console.error("Excel export error:", err);
    alert("Failed to export Excel (see console).");
  }
}

// PDF export: summary + budget chart + monthly summary (makes two pages)
async function exportPDF() {
  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation:'portrait', unit:'pt', format:'a4' });

    // Title
    pdf.setFontSize(18); pdf.text('Budget Report', 220, 30);

    // Summary image
    const summaryEl = document.getElementById('summary');
    const summaryImg = await html2canvas(summaryEl).then(c=>c.toDataURL('image/png'));
    pdf.addImage(summaryImg, 'PNG', 20, 50, 550, 160);

    // Budget chart
    const chartCanvas = document.getElementById('budgetChart');
    const chartImg = await html2canvas(chartCanvas).then(c=>c.toDataURL('image/png'));
    pdf.addImage(chartImg, 'PNG', 20, 230, 550, 260);

    // Monthly table on next page
    pdf.addPage();
    pdf.setFontSize(16); pdf.text('Monthly Summary', 220, 30);
    const monthlyEl = document.getElementById('monthlySummary');
    const monthlyImg = await html2canvas(monthlyEl).then(c=>c.toDataURL('image/png'));
    pdf.addImage(monthlyImg, 'PNG', 20, 60, 550, 700);

    // Utility averages page
    pdf.addPage();
    pdf.setFontSize(16); pdf.text('Utility Bill Averages', 220, 30);
    const ua = document.getElementById('billAveragesTable');
    const uaImg = await html2canvas(ua).then(c=>c.toDataURL('image/png'));
    pdf.addImage(uaImg, 'PNG', 20, 60, 550, 700);

    pdf.save(`budget_report_${activeMonth}_${activeCategory}.pdf`);
  } catch (err) {
    console.error("PDF export error:", err);
    alert("Failed to export PDF (see console).");
  }
}

// ---------- Utility Averages: load and display ----------
async function loadBillAverages() {
  const tbody = document.querySelector("#billAveragesTable tbody");
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';

  try {
    const { data, error } = await supabase.from("bill_averages").select("*").order("category", { ascending:true });
    if (error) { console.error("Error loading bill_averages:", error); tbody.innerHTML = '<tr><td colspan="4">Error loading data</td></tr>'; return; }
    if (!data || !data.length) { tbody.innerHTML = '<tr><td colspan="4">No data yet</td></tr>'; renderUtilityChart([]); return; }

    tbody.innerHTML = '';
    let total = 0;
    data.forEach(row => {
      const icon = getIconForCategory(row.category);
      total += Number(row.avg_amount || 0);
      tbody.insertAdjacentHTML('beforeend', `<tr><td>${icon} ${row.category}</td><td>$${Number(row.avg_amount).toFixed(2)}</td><td>${row.num_months}</td><td>${new Date(row.last_updated).toLocaleDateString()}</td></tr>`);
    });

    tbody.insertAdjacentHTML('beforeend', `<tr style="font-weight:700;background:#f0f9ff"><td>💰 Total Avg</td><td>$${total.toFixed(2)}</td><td colspan="2"></td></tr>`);
    renderUtilityChart(data);
  } catch (err) {
    console.error("loadBillAverages error:", err);
    tbody.innerHTML = '<tr><td colspan="4">Error loading data</td></tr>';
  }
}

function getIconForCategory(cat) {
  const s = (cat||'').toString().toLowerCase();
  if (s.includes('water')) return '💧';
  if (s.includes('electric')) return '⚡';
  if (s.includes('gas')) return '🔥';
  if (s.includes('internet')) return '🌐';
  return '📦';
}

function renderUtilityChart(data) {
  const labels = data.map(d=>d.category);
  const vals = data.map(d=>Number(d.avg_amount));
  const ctx = document.getElementById('utilityChart');
  if (utilityChart) utilityChart.destroy();
  utilityChart = new Chart(ctx, {
    type:'bar',
    data:{ labels, datasets:[{ label:'Avg Monthly Bill ($)', data:vals, backgroundColor:labels.map((_,i)=>palette(i)) }]},
    options:{ responsive:true, scales:{ y:{ beginAtZero:true } }, plugins:{ legend:{ display:false } } }
  });
}
//-------------------------------------------------------------
// NEW: Utility Trend Chart (historical monthly trend)
//-------------------------------------------------------------
async function renderUtilityTrendChart() {
  try {
    const { data: transactions, error } = await supabase
      .from("transactions")
      .select("category, amount, debitcredit, date");
    if (error) throw error;

    if (window.utilityTrendChart instanceof Chart) {
      window.utilityTrendChart.destroy();
    }

    // Group by category + month
    const monthly = {};
    transactions.forEach(tx => {
      if (tx.debitcredit !== "Debit") return;
      const d = new Date(tx.date);
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const cat = tx.category || "Other";
      const key = `${cat}_${month}`;
      monthly[key] = (monthly[key] || 0) + Math.abs(Number(tx.amount) || 0);
    });

    const categoryMap = {};
    for (const key of Object.keys(monthly)) {
      const [cat, month] = key.split("_");
      categoryMap[cat] = categoryMap[cat] || {};
      categoryMap[cat][month] = monthly[key];
    }

    const months = Array.from(new Set(Object.keys(monthly).map(k => k.split("_")[1]))).sort();
    const datasets = Object.entries(categoryMap).map(([cat, vals], i) => ({
      label: cat,
      data: months.map(m => vals[m] || 0),
      borderColor: palette(i),
      backgroundColor: palette(i),
      tension: 0.3,
      fill: false
    }));

    const ctx = document.getElementById("utilityTrendChart");
    if (window.utilityTrendChart) window.utilityTrendChart.destroy();
    window.utilityTrendChart = new Chart(ctx, {
      type: "line",
      data: { labels: months, datasets },
      options: {
        responsive: true,
        plugins: { title: { display: true, text: "Utility Bill Trends by Month" } },
        scales: { y: { beginAtZero: true, title: { display: true, text: "Amount ($)" } } }
      }
    });
  } catch (err) {
    console.error("renderUtilityTrendChart error:", err);
  }
}

// Run trend chart after data loads
async function loadBillAverages() {
  // existing code...
  await renderUtilityTrendChart(); // 👈 add here at the end
}

function palette(i){ const colors = ['#60a5fa','#fbbf24','#f87171','#34d399','#a78bfa','#38bdf8','#f472b6']; return colors[i % colors.length]; }

// ---------- Add new category (manual) ----------
async function addNewCategory() {
  const name = (document.getElementById('newCategory')?.value || '').trim();
  const avg = Number(document.getElementById('newAverage')?.value || 0);
  if (!name) { alert('Enter a category name'); return; }

  const entry = { category:name, avg_amount: avg || 0, num_months: avg?1:0, last_updated: new Date().toISOString() };
  try {
    const { error } = await supabase.from('bill_averages').insert([entry]);
    if (error) { console.error('addNewCategory error:', error); alert('Failed to add category (see console)'); return; }
    document.getElementById('newCategory').value = '';
    document.getElementById('newAverage').value = '';
    await loadBillAverages();
    alert(`Added category "${name}"`);
  } catch (err) {
    console.error('addNewCategory exception:', err);
  }
}

// ---------- Recalculate bill averages from transactions (group by month) ----------
async function recalcBillAverages() {
  try {
    // try to get categories from categories table, fallback to common utilities
    let utilities = await getCategoriesFromSupabase();
    if (!utilities || utilities.length === 0) utilities = ['Water','Electric','Gas','Internet'];

    // fetch transactions with description and map descriptions
    const { data: transactions, error } = await supabase.from('transactions').select('category, description, amount, debitcredit, date');
    if (error) { console.error('fetch transactions error:', error); alert('Failed to load transactions (see console)'); return; }
    if (!transactions || transactions.length === 0) { alert('No transaction data found'); return; }

    // apply description map (if description_map.csv contains raw keys)
    const mapped = transactions.map(t => {
      const pretty = descriptionMap[t.description] || descriptionMap[t.Description] || t.description;
      return { ...t, description: pretty };
    });

    // aggregate monthly totals per category (only Debits)
    const monthTotals = {}; // key = `${category}_${YYYY-MM}`
    mapped.forEach(tx => {
      if (tx.debitcredit !== 'Debit') return;
      const d = new Date(tx.date);
      if (isNaN(d)) return;
      const key = `${tx.category}_${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      monthTotals[key] = (monthTotals[key] || 0) + Math.abs(Number(tx.amount) || 0);
    });

    // convert to per-category arrays
    const categoryMonthly = {};
    Object.entries(monthTotals).forEach(([k,v]) => {
      const [cat] = k.split('_');
      categoryMonthly[cat] = categoryMonthly[cat] || [];
      categoryMonthly[cat].push(v);
    });

    // upsert each category (safe: check exists -> update or insert)
    for (const [category, arr] of Object.entries(categoryMonthly)) {
      const sum = arr.reduce((a,b)=>a+b,0);
      const avg = arr.length ? sum / arr.length : 0;
      const row = { category, avg_amount: Number(avg.toFixed(2)), num_months: arr.length, last_updated: new Date().toISOString() };

      // check existing
      const { data: existing, error: selErr } = await supabase.from('bill_averages').select('id').eq('category', category).limit(1);
      if (selErr) { console.error('select existing avg error:', selErr); continue; }

      if (existing && existing.length) {
        await supabase.from('bill_averages').update({ avg_amount: row.avg_amount, num_months: row.num_months, last_updated: row.last_updated }).eq('id', existing[0].id);
      } else {
        await supabase.from('bill_averages').insert([row]);
      }
    }

    await loadBillAverages();
    alert('Recalculated averages successfully');
  } catch (err) {
    console.error('recalcBillAverages error:', err);
    alert('Failed to recalc averages (see console)');
  }
}

// ---------- Helper: safe get categories (used earlier) ----------
/* getCategoriesFromSupabase defined above */

// ---------- Utility: wire up export buttons idempotently ----------
function setupExportButtons() {
  // already wired in wireUpButtons; this exists for compatibility if called elsewhere
}

// ---------- END of script.js ----------
