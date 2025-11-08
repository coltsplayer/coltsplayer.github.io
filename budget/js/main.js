// main.js - app bootstrap
import { supabase, escapeHtml } from "./utils.js";
import * as Auth from "./auth.js";
import * as Tx from "./transactions.js";
import * as Mappings from "./mappings.js";
import * as ImportExport from "./import-export.js";
import * as Charts from "./charts.js";

window._transactionsAPIs = { renderTransactionsGroupedByMonth: Tx.renderTransactionsGroupedByMonth };

async function onLogin(user){
  // hide modal
  document.getElementById("loginModal").style.display="none";
  // load data
  await Mappings.loadDescriptionMappings();
  await Tx.loadTransactionsForUser(user);
  Mappings.renderMappingsList();
  Mappings.applyAllMappingsToUncategorized().catch(()=>{});
}

// init
await Auth.initAuth(onLogin);

// wire UI
document.getElementById("loginBtn")?.addEventListener("click", async ()=>{
  const email = document.getElementById("loginEmail").value.trim();
  const pass = document.getElementById("loginPassword").value.trim();
  const msg = document.getElementById("loginMsg");
  try {
    msg.textContent = "Signing in...";
    const u = await Auth.login(email,pass);
    msg.textContent = "✅ Logged in";
    onLogin(u);
  } catch(err){ console.error("login err",err); msg.textContent = "❌ "+(err.message||err); }
});

document.getElementById("logoutBtn")?.addEventListener("click", async ()=>{ await Auth.logout(); document.getElementById("loginModal").style.display="flex"; });

// File input
document.getElementById("fileInput")?.addEventListener("change", async (e)=>{
  const f = e.target.files?.[0]; if(!f) return;
  const txt = await f.text();
  const rows = ImportExport.parseCsvBasic(txt);
  window.allData = rows; // for preview
  Tx.renderTransactionsPreview?.();
});

// Load CSV preview button
document.getElementById("loadBtn")?.addEventListener("click", ()=>{
  document.getElementById("fileInput")?.click();
});

// Insert to DB
document.getElementById("insertBtn")?.addEventListener("click", async ()=>{
  try {
    const rows = window.allData || [];
    const count = await ImportExport.importTransactions(rows, Auth.currentUser || Auth.currentUser);
    alert(`Imported ${count} rows`);
    await Tx.loadTransactionsForUser(Auth.currentUser || Auth.currentUser);
  } catch(err){ console.error(err); alert("Import failed"); }
});

// Save mapping button
document.getElementById("saveMappingBtn")?.addEventListener("click", async ()=>{
  const desc = document.getElementById("mapDescriptionInput")?.value?.trim();
  const cat = document.getElementById("mapCategoryInput")?.value?.trim();
  const display = document.getElementById("mapDisplayInput")?.value?.trim() || desc;
  if(!desc||!cat){ alert("desc + category required"); return; }
  try{
    const res = await Mappings.saveMapping(desc,cat,display,Auth.currentUser || Auth.currentUser);
    alert("Saved mapping");
    Mappings.renderMappingsList();
  }catch(err){ console.error("Save mapping error",err); alert("Failed to save mapping (see console)"); }
});

// refresh uncat
document.getElementById("refreshUncatBtn")?.addEventListener("click", ()=>{ Tx.renderUncategorizedSummary?.(); Mappings.renderMappingsList?.(); });

// export buttons
document.getElementById("exportCsvBtn")?.addEventListener("click", ()=>{
  const rows = Tx.allData || [];
  ImportExport.exportToCsv(rows);
});
document.getElementById("exportXlsxBtn")?.addEventListener("click", ()=>{
  const rows = Tx.allData || [];
  ImportExport.exportToXlsx(rows);
});
