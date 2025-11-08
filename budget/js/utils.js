// ==========================================================
// 🧰 Utilities + Supabase Client
// ==========================================================

// ⚙️ Initialize Supabase Client (keep your own URL and anon key here)
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
export const SUPABASE_URL = "https://uimrsmpjbweoohvbvywv.supabase.co";
export const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpbXJzbXBqYndlb29odmJ2eXd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4OTAxNTksImV4cCI6MjA3NTQ2NjE1OX0.QmU09jLhunbWKLAHM2ddGpsmgcBctw7ykX199Kmmn88";

// Create the Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================================
// 🔢 Generic Helper Utilities
// ==========================================================

// Escape HTML to prevent table rendering issues
export function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Format date into YYYY-MM-DD
export function formatDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return "";
  return d.toISOString().split("T")[0];
}

// Format numbers into USD currency
export function formatCurrency(num) {
  if (typeof num !== "number") num = parseFloat(num) || 0;
  return num.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// ==========================================================
// 📦 CSV + XLSX Export Helper Functions
// ==========================================================

// Export a 2D array (or array of objects) to CSV and trigger download
export function exportToCSV(data, filename = "budget_export.csv") {
  if (!data || !data.length) {
    alert("No data available for export.");
    return;
  }

  const header = Object.keys(data[0]);
  const rows = data.map(obj => header.map(h => JSON.stringify(obj[h] ?? "")));
  const csv = [header.join(","), ...rows.map(r => r.join(","))].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

// Export data to XLSX format using SheetJS (if available)
export async function exportToXLSX(data, filename = "budget_export.xlsx") {
  if (!data || !data.length) {
    alert("No data available for export.");
    return;
  }

  try {
    // Dynamically import SheetJS
    const XLSX = await import("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm");
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Transactions");
    XLSX.writeFile(workbook, filename);
  } catch (err) {
    console.error("[budget] XLSX export error:", err);
    alert("⚠️ XLSX export failed. Check console for details.");
  }
}

// ==========================================================
// 🧹 Miscellaneous Helpers
// ==========================================================

// Convert an uploaded CSV file to array of objects
export function parseCSV(text) {
  const lines = text.split("\n").filter(l => l.trim());
  const header = lines[0].split(",").map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(",");
    const obj = {};
    header.forEach((h, i) => (obj[h] = values[i]));
    return obj;
  });
}

// Delay utility for async waits
export function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}

// Debug log wrapper
export function debugLog(...args) {
  console.log("[budget]", ...args);
}

export function parseValidDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d)) return "";
  return d.toISOString().split("T")[0];
}