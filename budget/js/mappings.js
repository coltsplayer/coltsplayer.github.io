// ==========================================================
// 🔖 Mappings Manager Module
// ==========================================================
import { supabase } from "./utils.js";
import { currentUser, allData } from "./transactions.js";

// ==========================================================
// 🧩 Load all description mappings for the logged-in user
// ==========================================================
export async function loadDescriptionMappings() {
  if (!currentUser) return [];
  try {
    const { data, error } = await supabase
      .from("description_mappings")
      .select("id, description, category, display_text, match_pattern, user_id, created_at")
      .eq("user_id", currentUser.id)
      .order("description", { ascending: true });

    if (error) {
      console.error("[budget] loadDescriptionMappings error:", error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error("[budget] loadDescriptionMappings exception:", err);
    return [];
  }
}

// ==========================================================
// 💾 Save a new or edited mapping record
// ==========================================================
export async function saveMapping() {
  if (!currentUser) {
    alert("Please log in first.");
    return;
  }

  const desc = document.getElementById("mapDescriptionInput").value.trim();
  const displayText = document.getElementById("mapDisplayInput").value.trim() || desc;
  const cat = document.getElementById("mapCategoryInput").value.trim();

  if (!desc || !cat) {
    alert("Please enter both a description and category.");
    return;
  }

  const insertObj = {
    description: desc,
    category: cat,
    display_text: displayText,
    match_pattern: desc.toLowerCase(),
    user_id: currentUser.id,
  };

  console.log("[budget] Saving mapping:", insertObj);

  const { data, error } = await supabase
    .from("description_mappings")
    .insert([insertObj])
    .select();

  if (error) {
    console.error("[budget] Save mapping error:", error);
    alert("⚠️ Error saving mapping. Check console for details.");
    return;
  }

  console.log("[budget] Mapping saved:", data);
  alert(`✅ Mapping saved:\n"${desc}" → "${cat}"`);

  // Refresh mappings and reapply immediately
  await renderMappingsList();
  await applyAllMappingsToUncategorized();
  renderUncategorizedSummary(allData);
}

// ==========================================================
// 📜 Render the saved mapping list table
// ==========================================================
export async function renderMappingsList() {
  if (!currentUser) return;
  const list = await loadDescriptionMappings();
  const tbody = document.querySelector("#mappingTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="3">No saved mappings yet.</td></tr>`;
    return;
  }

  for (const m of list) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="padding:6px;border-bottom:1px solid #ddd;">${escapeHtml(m.description)}</td>
      <td style="padding:6px;border-bottom:1px solid #ddd;">${escapeHtml(m.category)}</td>
      <td style="padding:6px;border-bottom:1px solid #ddd;">${escapeHtml(m.display_text || "")}</td>
    `;
    tbody.appendChild(tr);
  }
}

// ==========================================================
// 🧠 Apply all mappings to uncategorized transactions
// ==========================================================
export async function applyAllMappingsToUncategorized() {
  if (!currentUser || !Array.isArray(allData) || allData.length === 0) return;
  const mappings = await loadDescriptionMappings();
  if (!mappings.length) return;

  const uncategorized = allData.filter(
    r => !r.category || r.category.toLowerCase() === "uncategorized"
  );

  let updatedCount = 0;
  for (const map of mappings) {
    const match = (map.match_pattern || map.description || "").toLowerCase();
    const matches = uncategorized.filter(
      r => r.description && r.description.toLowerCase().includes(match)
    );
    if (matches.length === 0) continue;

    const ids = matches.map(r => r.id);
    const { error } = await supabase
      .from("transactions")
      .update({ category: map.category })
      .in("id", ids);

    if (error) {
      console.error("[budget] Apply mapping error:", error);
      continue;
    }

    matches.forEach(r => (r.category = map.category));
    updatedCount += matches.length;
  }

  if (updatedCount > 0) {
    console.log(`[budget] Applied ${updatedCount} mappings`);
    alert(`✅ ${updatedCount} transactions reclassified.`);
  }
}

// ==========================================================
// ❓ Render Uncategorized Summary Table
// ==========================================================
export function renderUncategorizedSummary(data = allData) {
  const tbody = document.querySelector("#uncategorizedTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!data || !data.length) {
    tbody.innerHTML = `<tr><td colspan="2">No transactions loaded.</td></tr>`;
    return;
  }

  // Count uncategorized by description
  const counts = {};
  for (const txn of data) {
    const cat = txn.category?.trim().toLowerCase() || "";
    if (cat === "" || cat === "uncategorized") {
      const desc = txn.description?.trim() || "(No Description)";
      counts[desc] = (counts[desc] || 0) + 1;
    }
  }

  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    tbody.innerHTML = `<tr><td colspan="2">🎉 No uncategorized transactions!</td></tr>`;
    return;
  }

  for (const [desc, count] of entries) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(desc)}</td>
      <td style="text-align:center;">${count}</td>
    `;
    tr.addEventListener("click", () => {
      const descInput = document.getElementById("mapDescriptionInput");
      if (descInput) descInput.value = desc;
      window.scrollTo({
        top: document.getElementById("mappingSection").offsetTop,
        behavior: "smooth",
      });
    });
    tbody.appendChild(tr);
  }
}

// ==========================================================
// 🧹 Small Helper for safe text rendering
// ==========================================================
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
// ⚙️ Hook up the Save Mapping button
// ==========================================================
const saveBtn = document.getElementById("saveMappingBtn");
if (saveBtn) {
  saveBtn.addEventListener("click", async () => {
    await saveMapping();
  });
}