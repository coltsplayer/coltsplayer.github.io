// import-export.js
import { parseValidDate } from "./utils.js";
import { supabase } from "./utils.js";
import { loadDescriptionMappings } from "./mappings.js";
import { allData } from "./transactions.js";

export function parseCsvBasic(text){
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",");
  let mode = "standard";
  if(header[0].toLowerCase().includes("transaction date")|| header[2]?.toLowerCase().includes("description")) mode="discover";
  const rows=[];
  for(let i=1;i<lines.length;i++){
    const cols = lines[i].split(",");
    if(cols.length<3) continue;
    let date,desc,amt;
    if(mode==="discover"){ date=parseValidDate(cols[0]); desc=cols[2].trim(); amt=parseFloat(cols[3])||0; } else { date=parseValidDate(cols[0]); desc=cols[1].trim(); amt=parseFloat(cols[2])||0; }
    if(!date||!desc) continue;
    rows.push({ date, description: desc, amount: amt, category:"Uncategorized", source: mode==="discover"?"Discover":"CSV" });
  }
  return rows;
}

export async function importTransactions(parsedCsv, currentUser){
  if(!currentUser) throw new Error("login required");
  // load mappings and apply before insert
  const mappings = await loadDescriptionMappings();
  const enriched = parsedCsv.map(r=>{
    const match = mappings.find(m=> r.description.toLowerCase().includes(m.description.toLowerCase()));
    if(match) r.category = match.category;
    return { ...r, user_id: currentUser.id };
  });
  const { error } = await supabase.from("transactions").insert(enriched);
  if(error) throw error;
  return enriched.length;
}

export function exportToCsv(rows, filename="budget_export.csv"){
  if(!rows||!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map(r=>headers.map(h=>JSON.stringify(r[h]||"")).join(","))].join("\n");
  const blob = new Blob([csv],{type:"text/csv;charset=utf-8;"});
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = filename; link.click();
}

export function exportToXlsx(rows, filename="budget_export.xlsx"){
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Transactions");
  XLSX.writeFile(wb, filename);
}
