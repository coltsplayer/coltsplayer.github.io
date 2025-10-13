/***********************************************
 *  Stock / ETF / Mutual Fund / Crypto Tracker
 *  Data Sources:
 *   - Twelve Data (stocks + ETFs)
 *   - Financial Modeling Prep (mutual funds, ETFs, stocks)
 *   - CoinGecko (crypto)
 ***********************************************/

const TWELVE_API_KEY = "a923265ee2794dd188b6a66e507f16ad"; // 🔑 Replace with your key
const FMP_API_KEY = "RzqtKSjmMw4XG3PAdjdsRe3JMDHfeBFq";           // 🔑 Replace with your FMP key

const TWELVE_URL = "https://api.twelvedata.com/price?symbol=";
const FMP_URL = "https://financialmodelingprep.com/api/v3/quote/";
const COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price?vs_currencies=usd&ids=";

// Known crypto tickers for CoinGecko mapping
const CRYPTO_MAP = {
  BTC: "bitcoin",
  ETH: "ethereum",
  DOGE: "dogecoin",
  SOL: "solana",
  LTC: "litecoin",
  ADA: "cardano"
};

// Load ledger and display
document.getElementById("loadDataBtn").addEventListener("click", async () => {
  try {
    const response = await fetch("ledger.csv");
    if (!response.ok) throw new Error("Failed to load ledger.csv");
    const csvText = await response.text();
    const data = parseCSV(csvText);
    const results = await processStocks(data);
    displayResults(results);
  } catch (error) {
    console.error(error);
    alert("Error loading ledger or fetching stock prices.");
  }
});

if (window.location.search.includes("embed=true")) {
  document.querySelector("h1").textContent = "Stock Snapshot";
  document.getElementById("loadDataBtn").style.display = "none";
  document.body.style.background = "#111";
  document.body.style.overflow = "hidden";
}

/* ========== CSV PARSER ========== */
function parseCSV(csv) {
  const lines = csv.trim().split("\n");
  lines.shift(); // Remove header row
  return lines.map(line => {
    const [Symbol, Quantity, PurchasePrice] = line.split(",").map(s => s.trim());
    return {
      Symbol,
      Quantity: parseFloat(Quantity),
      PurchasePrice: parseFloat(PurchasePrice)
    };
  });
}

/* ========== PROCESS STOCKS ========== */
async function processStocks(data) {
  const grouped = {};
  data.forEach(item => {
    if (!grouped[item.Symbol]) grouped[item.Symbol] = { totalQty: 0, totalCost: 0 };
    grouped[item.Symbol].totalQty += item.Quantity;
    grouped[item.Symbol].totalCost += item.Quantity * item.PurchasePrice;
  });

  const results = [];
  for (const symbol in grouped) {
    const avgPrice = grouped[symbol].totalCost / grouped[symbol].totalQty;
    let currentPrice = null;
    let profit = null;

    try {
      currentPrice = await fetchHybridPrice(symbol);
      if (currentPrice !== null) {
        profit = (currentPrice - avgPrice) * grouped[symbol].totalQty;
      }
    } catch (err) {
      console.warn(`⚠️ Could not fetch price for ${symbol}:`, err.message);
    }

    results.push({
      symbol,
      avgPrice,
      qty: grouped[symbol].totalQty,
      currentPrice,
      profit
    });
  }
  return results;
}

/* ========== FETCH HYBRID PRICE ========== */
async function fetchHybridPrice(symbol) {
  // 1️⃣ Try Twelve Data (stocks + ETFs)
  let price = await tryTwelveData(symbol);
  if (price) return price;

  // 2️⃣ Try Financial Modeling Prep (mutual funds, ETFs, stocks)
  price = await tryFmpApi(symbol);
  if (price) return price;

  // 3️⃣ Try CoinGecko for crypto
  if (isCrypto(symbol)) {
    price = await tryCoinGecko(symbol);
    if (price) return price;
  }

  // 4️⃣ Nothing found
  console.warn(`No price found for ${symbol}`);
  return null;
}

/* ========== API HELPERS ========== */

async function tryTwelveData(symbol) {
  try {
    const url = `${TWELVE_URL}${symbol}&apikey=${TWELVE_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data && data.price) return parseFloat(data.price);
  } catch (err) {
    console.warn(`TwelveData error for ${symbol}: ${err.message}`);
  }
  return null;
}

async function tryFmpApi(symbol) {
  try {
    const url = `${FMP_URL}${symbol}?apikey=${FMP_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0 && data[0].price) {
      return parseFloat(data[0].price);
    }
  } catch (err) {
    console.warn(`FMP error for ${symbol}: ${err.message}`);
  }
  return null;
}

async function tryCoinGecko(symbol) {
  try {
    const id = CRYPTO_MAP[symbol.toUpperCase()];
    if (!id) return null;
    const url = `${COINGECKO_URL}${id}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data[id] && data[id].usd) return parseFloat(data[id].usd);
  } catch (err) {
    console.warn(`CoinGecko error for ${symbol}: ${err.message}`);
  }
  return null;
}

function isCrypto(symbol) {
  return CRYPTO_MAP.hasOwnProperty(symbol.toUpperCase());
}

/* ========== DISPLAY TABLE ========== */
function displayResults(results) {
  const tbody = document.querySelector("#resultsTable tbody");
  tbody.innerHTML = "";
  results.forEach(r => {
    const row = document.createElement("tr");
    const currentPriceText = r.currentPrice ? r.currentPrice.toFixed(2) : "N/A";
    const profitText = r.profit !== null ? r.profit.toFixed(2) : "—";
    const profitClass = r.profit !== null
      ? (r.profit >= 0 ? "profit" : "loss")
      : "";

    row.innerHTML = `
      <td>${r.symbol}</td>
      <td>${r.avgPrice.toFixed(2)}</td>
      <td>${r.qty}</td>
      <td>${currentPriceText}</td>
      <td class="${profitClass}">${profitText}</td>
    `;
    tbody.appendChild(row);
  });
}
