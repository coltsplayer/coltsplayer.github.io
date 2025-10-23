//-------------------------------------------------------------
// 🔗 Supabase Connection
//-------------------------------------------------------------
const SUPABASE_URL = "https://uimrsmpjbweoohvbvywv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpbXJzbXBqYndlb29odmJ2eXd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4OTAxNTksImV4cCI6MjA3NTQ2NjE1OX0.QmU09jLhunbWKLAHM2ddGpsmgcBctw7ykX199Kmmn88";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

//-------------------------------------------------------------
// 🧠 Global State
//-------------------------------------------------------------
let allData = [];
let descriptionMap = [];
let chart, utilityTrendChart;

//-------------------------------------------------------------
// 🔄 Initialization
//-------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  await loadDescriptionMap();
  await loadTransactions();
  await loadUtilities();
});

//-------------------------------------------------------------
// 🧭 Load Description Mapping Table
//-------------------------------------------------------------
async function loadDescriptionMap() {
  const { data, error } = await supabase.from("description_mapping").select("*");
  if (error) {
    console.error("❌ Error loading mapping table:", error);
    return;
  }
  descriptionMap = data || [];
  console.log("✅ Loaded description mapping:", descriptionMap);
}

//-------------------------------------------------------------
// 🗂️ Apply Mapping to Raw Descriptions
//-------------------------------------------------------------
function mapDescription(rawDescription) {
  if (!rawDescription)
    return { description: rawDescription, category: "Uncategorized" };
  const descUpper = rawDescription.toUpperCase();
  for (const m of descriptionMap) {
    if (descUpper.includes(m.match_pattern.toUpperCase())) {
      return { description: m.display_name, category: m.category };
    }
  }
  return { description: rawDescription, category: "Uncategorized" };
}

//-------------------------------------------------------------
// 📥 Load Transactions from Supabase
//-------------------------------------------------------------
async function loadTransactions() {
  const { data, error } = await supabase.from("transactions").select("*");
  if (error) {
    console.error("Error loading transactions:", error);
    alert("❌ Failed to load transactions.");
    return;
  }
  allData = data || [];
  renderTransactions();
  renderSummary();
  renderChart();
}

//-------------------------------------------------------------
// 📤 Insert Transactions from CSV into Supabase
//-------------------------------------------------------------
document.getElementById("insertBtn").addEventListener("click", async () => {
  if (!allData.length) {
    alert("No data loaded to insert.");
    return;
  }

  // Map + normalize data
  const cleanData = allData
    .map((r) => {
      const amountVal = parseFloat(r.Amount || r.amount || 0);
      const dateVal = parseValidDate(r.Date || r.date);
      const debitcreditVal =
        r.DebitCredit ||
        r.debitcredit ||
        (amountVal < 0 ? "Debit" : "Credit");

      const mapped = mapDescription(r.Description || r.description || "");

      return {
        date: dateVal,
        description: mapped.description,
        amount: amountVal,
        debitcredit: debitcreditVal,
        category: mapped.category,
      };
    })
    .filter((r) => !!r.date && !isNaN(r.amount) && r.description);

  console.log("Payload to insert:", cleanData);

  const { error } = await supabase.from("transactions").insert(cleanData);

  if (error) {
    console.error("Insert error details:", error);
    alert(
      `❌ Insert failed.\n\n${error.message || JSON.stringify(error, null, 2)}`
    );
  } else {
    alert(`✅ Inserted ${cleanData.length} transactions.`);
    loadTransactions();
  }
});

//-------------------------------------------------------------
// 📄 Load CSV File into Memory
//-------------------------------------------------------------
document.getElementById("loadBtn").addEventListener("click", () => {
  const file = document.getElementById("uploadCsv").files[0];
  if (!file) {
    alert("Please choose a CSV file.");
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    const lines = e.target.result
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l);
    const headers = lines.shift().split(",");
    allData = lines.map((line) => {
      const cols = line.split(",");
      const row = {};
      headers.forEach((h, i) => (row[h.trim()] = cols[i]?.trim()));
      return row;
    });
    alert(`✅ Loaded ${allData.length} rows from CSV.`);
  };
  reader.readAsText(file);
});

//-------------------------------------------------------------
// 🧾 Render Transactions Table
//-------------------------------------------------------------
function renderTransactions() {
  const tbody = document.querySelector("#dataTable tbody");
  tbody.innerHTML = "";
  for (const row of allData) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.date || ""}</td>
      <td>${row.description || ""}</td>
      <td>${row.category || ""}</td>
      <td style="color:${row.amount < 0 ? "red" : "lime"}">
        ${Number(row.amount).toFixed(2)}
      </td>`;
    tbody.appendChild(tr);
  }
}

//-------------------------------------------------------------
// 💰 Render Summary (Income, Expenses, Net)
//-------------------------------------------------------------
function renderSummary() {
  const expenses = allData
    .filter((r) => r.amount < 0)
    .reduce((sum, r) => sum + r.amount, 0);
  const income = allData
    .filter((r) => r.amount > 0)
    .reduce((sum, r) => sum + r.amount, 0);
  const net = income + expenses;
  document.getElementById(
    "totalExpenses"
  ).textContent = `Expenses: $${Math.abs(expenses).toFixed(2)}`;
  document.getElementById(
    "totalIncome"
  ).textContent = `Income: $${income.toFixed(2)}`;
  document.getElementById(
    "netTotal"
  ).textContent = `Net: $${net.toFixed(2)}`;
}

//-------------------------------------------------------------
// 📊 Render Category Bar Chart
//-------------------------------------------------------------
function renderChart() {
  const ctx = document.getElementById("budgetChart").getContext("2d");
  const categories = {};
  for (const r of allData) {
    const cat = r.category || "Other";
    if (!categories[cat]) categories[cat] = 0;
    categories[cat] += r.amount;
  }
  const labels = Object.keys(categories);
  const values = Object.values(categories);
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Amount",
          data: values,
          backgroundColor: values.map((v) =>
            v >= 0 ? "rgba(0,255,100,0.5)" : "rgba(255,80,80,0.5)"
          ),
        },
      ],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#fff" } },
        y: { ticks: { color: "#fff" } },
      },
    },
  });
}

//-------------------------------------------------------------
// ⚙️ Utility Bill Averages Table
//-------------------------------------------------------------
async function loadUtilities() {
  const tbody = document.querySelector("#utilityTable tbody");
  tbody.innerHTML = "<tr><td colspan='4'>Loading...</td></tr>";

  const { data, error } = await supabase.from("bill_averages").select("*");
  if (error) {
    console.error(error);
    tbody.innerHTML = "<tr><td colspan='4'>Error loading data.</td></tr>";
    return;
  }

  tbody.innerHTML = "";
  for (const row of data) {
    const icon = getIcon(row.category);
    tbody.insertAdjacentHTML(
      "beforeend",
      `
      <tr>
        <td>${icon} ${row.category}</td>
        <td>$${Number(row.avg_amount).toFixed(2)}</td>
        <td>${row.num_months}</td>
        <td>${new Date(row.last_updated).toLocaleDateString()}</td>
      </tr>`
    );
  }

  renderUtilityTrend();
}

//-------------------------------------------------------------
// 📈 Render Utility Trends Chart
//-------------------------------------------------------------
async function renderUtilityTrend() {
  const { data, error } = await supabase
    .from("transactions")
    .select("category, amount, debitcredit, date");
  if (error) return console.error("Trend error", error);

  const monthly = {};
  for (const tx of data) {
    if (tx.debitcredit !== "Debit") continue;
    const d = new Date(tx.date);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      "0"
    )}`;
    const cat = tx.category || "Other";
    const key = `${cat}_${month}`;
    monthly[key] = (monthly[key] || 0) + Math.abs(tx.amount);
  }

  const categoryMap = {};
  for (const key in monthly) {
    const [cat, month] = key.split("_");
    categoryMap[cat] = categoryMap[cat] || {};
    categoryMap[cat][month] = monthly[key];
  }

  const months = Array.from(
    new Set(Object.keys(monthly).map((k) => k.split("_")[1]))
  ).sort();
  const datasets = Object.entries(categoryMap).map(([cat, vals], i) => ({
    label: cat,
    data: months.map((m) => vals[m] || 0),
    borderColor: getColor(i),
    backgroundColor: getColor(i),
    tension: 0.3,
    fill: false,
  }));

  const ctx = document.getElementById("utilityTrendChart");
  if (utilityTrendChart) utilityTrendChart.destroy();
  utilityTrendChart = new Chart(ctx, {
    type: "line",
    data: { labels: months, datasets },
    options: {
      plugins: { title: { display: true, text: "Utility Bill Trends" } },
      scales: { x: { ticks: { color: "#fff" } }, y: { ticks: { color: "#fff" } } },
    },
  });
}

//-------------------------------------------------------------
// 💧 Helper Functions
//-------------------------------------------------------------
function parseValidDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d)) return null;
  return d.toISOString().split("T")[0];
}

function getIcon(cat) {
  const c = (cat || "").toLowerCase();
  if (c.includes("water")) return "💧";
  if (c.includes("electric")) return "⚡";
  if (c.includes("gas")) return "🔥";
  if (c.includes("internet")) return "🌐";
  return "📦";
}

function getColor(i) {
  const colors = ["#60a5fa", "#f87171", "#34d399", "#fbbf24", "#a78bfa"];
  return colors[i % colors.length];
}