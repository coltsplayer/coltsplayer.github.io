import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// TODO: Replace with your Supabase credentials
const SUPABASE_URL = "https://uimrsmpjbweoohvbvywv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpbXJzbXBqYndlb29odmJ2eXd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4OTAxNTksImV4cCI6MjA3NTQ2NjE1OX0.QmU09jLhunbWKLAHM2ddGpsmgcBctw7ykX199Kmmn88";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const taskForm = document.getElementById("taskForm");
const taskList = document.getElementById("taskList");
const searchInput = document.getElementById("search");
const filterPriority = document.getElementById("filterPriority");
const filterStatus = document.getElementById("filterStatus");
const filterProject = document.getElementById("filterProject");
const filterCategory = document.getElementById("filterCategory");
const headers = document.querySelectorAll("th[data-column]");
const exportBtn = document.getElementById("exportBtn");
const importFile = document.getElementById("importFile");
const projectSummaryBody = document.getElementById("projectSummaryBody");

let allTasks = [];
let sortConfig = [];
let editingId = null;
let activeProjectFilter = null;

/* === LOAD TASKS === */
async function loadTasks() {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return console.error(error);
  allTasks = data;
  renderTasks();
  renderProjectSummary();
}

if (window.location.search.includes("embed=true")) {
  document.querySelector("form").style.display = "none";
  document.querySelector(".filters").style.display = "none";
  document.getElementById("projectSummaryContainer").style.display = "block";
  document.getElementById("taskTable").style.display = "none";
  document.body.style.background = "#111";
}

/* === RENDER TASKS === */
function renderTasks() {
  const searchTerm = searchInput.value.toLowerCase();
  const priorityFilter = filterPriority.value;
  const statusFilter = filterStatus.value;
  const projectFilter =
    activeProjectFilter?.toLowerCase() || filterProject.value.toLowerCase();
  const categoryFilter = filterCategory.value.toLowerCase();

  let tasks = allTasks.filter((t) => {
    return (
      t.description?.toLowerCase().includes(searchTerm) &&
      (!priorityFilter || t.priority === priorityFilter) &&
      (!statusFilter || t.status === statusFilter) &&
      (!projectFilter || (t.project || "").toLowerCase().includes(projectFilter)) &&
      (!categoryFilter || (t.category || "").toLowerCase().includes(categoryFilter))
    );
  });

  // Apply multi-sort
  tasks.sort((a, b) => {
    for (const { column, direction } of sortConfig) {
      const valA = a[column]?.toString().toLowerCase() || "";
      const valB = b[column]?.toString().toLowerCase() || "";
      if (valA < valB) return direction === "asc" ? -1 : 1;
      if (valA > valB) return direction === "asc" ? 1 : -1;
    }
    return 0;
  });

  taskList.innerHTML = "";
  for (const task of tasks) {
    const row = document.createElement("tr");
    row.className = `priority-${task.priority}`;
    row.innerHTML = `
      <td>${task.description}</td>
      <td>${task.priority || ""}</td>
      <td>${task.status || ""}</td>
      <td>${task.project || ""}</td>
      <td>${task.category || ""}</td>
      <td class="actions">
        <button onclick="editTask('${task.id}')">✏️</button>
        <button onclick="deleteTask('${task.id}')">🗑️</button>
      </td>`;
    taskList.appendChild(row);
  }
}

/* === PROJECT SUMMARY === */
function renderProjectSummary() {
  const projects = {};

  for (const t of allTasks) {
    const proj = t.project || "Unassigned";
    if (!projects[proj]) {
      projects[proj] = { total: 0, done: 0 };
    }
    projects[proj].total++;
    if (t.status?.toLowerCase() === "done") projects[proj].done++;
  }

  projectSummaryBody.innerHTML = "";
  for (const [proj, stats] of Object.entries(projects)) {
    const percent = stats.total
      ? ((stats.done / stats.total) * 100).toFixed(1)
      : 0;
    const row = document.createElement("tr");
    row.classList.toggle("active-project", proj === activeProjectFilter);
    row.innerHTML = `
      <td>${proj}</td>
      <td>${stats.total}</td>
      <td>${stats.done}</td>
      <td>${percent}%</td>
    `;
    row.addEventListener("click", () => {
      if (activeProjectFilter === proj) {
        activeProjectFilter = null; // toggle off
      } else {
        activeProjectFilter = proj;
      }
      renderTasks();
      renderProjectSummary();
    });
    projectSummaryBody.appendChild(row);
  }
}

/* === ADD / EDIT === */
taskForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const descVal = document.getElementById("description").value.trim();
  const priorityVal = document.getElementById("priority").value || "Medium";
  const statusVal = document.getElementById("status").value || "Todo";
  const projectVal = document.getElementById("project").value.trim();
  const categoryVal = document.getElementById("category").value.trim();

  if (!descVal) {
    alert("Please enter a description.");
    return;
  }

  const taskData = {
    description: descVal,
    priority: priorityVal,
    status: statusVal,
    project: projectVal,
    category: categoryVal,
  };

  if (editingId) {
    const { error } = await supabase.from("tasks").update(taskData).eq("id", editingId);
    if (error) alert(error.message);
    editingId = null;
    taskForm.querySelector("button").textContent = "➕ Add Task";
  } else {
    const { error } = await supabase.from("tasks").insert([taskData]);
    if (error) alert(error.message);
  }

  taskForm.reset();
  loadTasks();
});

window.editTask = function (id) {
  const task = allTasks.find((t) => t.id === id);
  if (!task) return;
  document.getElementById("description").value = task.description;
  document.getElementById("priority").value = task.priority || "Medium";
  document.getElementById("status").value = task.status || "Todo";
  document.getElementById("project").value = task.project || "";
  document.getElementById("category").value = task.category || "";
  editingId = id;
  taskForm.querySelector("button").textContent = "💾 Save Task";
};

window.deleteTask = async function (id) {
  if (!confirm("Delete this task?")) return;
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) alert(error.message);
  loadTasks();
};

/* === MULTI-SORT WITH ORDER DISPLAY === */
headers.forEach((header) => {
  let arrowSpan = document.createElement("span");
  arrowSpan.className = "sort-arrow";
  header.appendChild(arrowSpan);

  header.addEventListener("click", (e) => {
    const column = header.dataset.column;
    const shift = e.shiftKey;
    const existing = sortConfig.find((c) => c.column === column);

    if (existing) {
      existing.direction = existing.direction === "asc" ? "desc" : "asc";
    } else {
      if (!shift) sortConfig = [];
      sortConfig.push({ column, direction: "asc" });
    }

    // Update header visuals
    headers.forEach((h) => (h.querySelector(".sort-arrow").textContent = ""));
    sortConfig.forEach((c, index) => {
      const h = document.querySelector(`th[data-column="${c.column}"] .sort-arrow`);
      if (h) h.textContent = `${c.direction === "asc" ? "▲" : "▼"}${index + 1}`;
    });

    renderTasks();
  });
});

/* === IMPORT / EXPORT === */
exportBtn.addEventListener("click", () => {
  const ws = XLSX.utils.json_to_sheet(allTasks);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Tasks");
  XLSX.writeFile(wb, "tasks_export.xlsx");
});

importFile.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (evt) => {
    const data = new Uint8Array(evt.target.result);
    const workbook = XLSX.read(data, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const sheet = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    if (sheet.length === 0) {
      alert("No data found in file.");
      return;
    }

    const cleaned = sheet.map((t) => ({
      description: t.description || t.Description,
      priority: t.priority || t.Priority || "Medium",
      status: t.status || t.Status || "Todo",
      project: t.project || t.Project || "",
      category: t.category || t.Category || "",
    }));

    const { error } = await supabase.from("tasks").insert(cleaned);
    if (error) alert("Error importing: " + error.message);
    loadTasks();
  };
  reader.readAsArrayBuffer(file);
});

/* === FILTER EVENTS === */
[searchInput, filterPriority, filterStatus, filterProject, filterCategory].forEach((el) =>
  el.addEventListener("input", () => {
    renderTasks();
    renderProjectSummary();
  })
);
loadTasks();
