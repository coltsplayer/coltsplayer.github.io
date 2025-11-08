// ==========================================================
// 👤 Authentication Module
// ==========================================================
import { supabase } from "./utils.js";
import { setCurrentUser, loadTransactionsFromSupabase } from "./transactions.js";
import { renderMappingsList } from "./mappings.js";

// ==========================================================
// 🧠 Check user session on page load
// ==========================================================
export async function checkUser() {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    console.error("[budget] checkUser error:", error);
    return null;
  }

  const user = data?.user || null;
  if (user) {
    console.log("[budget] Logged in user:", user.email);
    setCurrentUser(user);
    updateAuthUI(user);
    await loadTransactionsFromSupabase();
    await renderMappingsList();
  } else {
    console.log("[budget] No user session found.");
    updateAuthUI(null);
  }
  return user;
}

// ==========================================================
// 🔐 Login with Email and Password
// ==========================================================
export async function login() {
  const email = document.getElementById("emailInput").value.trim();
  const password = document.getElementById("passwordInput").value.trim();

  if (!email || !password) {
    alert("Please enter both email and password.");
    return;
  }

  console.log("[budget] Attempting login...");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    console.error("[budget] Login error:", error);
    alert("❌ Invalid credentials or login failed.");
    return;
  }

  const user = data?.user;
  console.log("[budget] Login successful:", user.email);

  setCurrentUser(user);
  updateAuthUI(user);
  await loadTransactionsFromSupabase();
  await renderMappingsList();
}

// ==========================================================
// 🚪 Logout current user
// ==========================================================
export async function logout() {
  console.log("[budget] Logging out...");
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("[budget] Logout error:", error);
    return;
  }

  setCurrentUser(null);
  updateAuthUI(null);
  document.getElementById("transactionsBody").innerHTML = "";
  document.querySelector("#mappingTable tbody").innerHTML = "";
  document.querySelector("#uncategorizedTable tbody").innerHTML = "";
  document.getElementById("incomeTotal").textContent = "$0.00";
  document.getElementById("expenseTotal").textContent = "$0.00";
  document.getElementById("balanceTotal").textContent = "$0.00";
}

// ==========================================================
// 🎨 Update UI based on login state
// ==========================================================
function updateAuthUI(user) {
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const userInfo = document.getElementById("userInfo");

  if (user) {
    loginBtn.style.display = "none";
    logoutBtn.style.display = "inline-block";
    userInfo.textContent = `Signed in as ${user.email}`;
  } else {
    loginBtn.style.display = "inline-block";
    logoutBtn.style.display = "none";
    userInfo.textContent = "";
  }
}

// ==========================================================
// ⚙️ Bind button events
// ==========================================================
const loginBtn = document.getElementById("loginBtn");
if (loginBtn) {
  loginBtn.addEventListener("click", async () => {
    await login();
  });
}

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await logout();
  });
}

// Automatically check session when page loads
checkUser();
