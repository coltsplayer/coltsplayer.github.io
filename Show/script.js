// ===============================
// ✅ API Keys
// Replace these with your own keys
// ===============================
const TMDB_KEY = "e5991c2a3b29b1b804acfd34849e5b10"; // TMDB v3 API key
const SUPABASE_URL = "https://uimrsmpjbweoohvbvywv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpbXJzbXBqYndlb29odmJ2eXd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4OTAxNTksImV4cCI6MjA3NTQ2NjE1OX0.QmU09jLhunbWKLAHM2ddGpsmgcBctw7ykX199Kmmn88";

// ✅ Import Supabase
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// ✅ Initialize Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
console.log('✅ Supabase connected:', SUPABASE_URL);

// ✅ DOM elements
const searchBtn = document.getElementById('searchBtn');
const searchInput = document.getElementById('searchInput');
const showInfo = document.getElementById('showInfo');
const favoritesList = document.getElementById('favoritesList');

// ✅ Event listeners
searchBtn.addEventListener('click', searchShow);
window.addEventListener('load', loadFavorites);

// ===============================
// 🔍 Search for a TV Show
// ===============================
async function searchShow() {
  const query = searchInput.value.trim();
  if (!query) {
    alert('Please enter a show name.');
    return;
  }

  try {
    const res = await fetch(`https://api.themoviedb.org/3/search/tv?query=${encodeURIComponent(query)}&api_key=${TMDB_KEY}`);
    if (!res.ok) throw new Error(`TMDB request failed (${res.status})`);

    const data = await res.json();
    if (!data.results || data.results.length === 0) {
      showInfo.innerHTML = `<p>No shows found for "${query}".</p>`;
      return;
    }

    const show = data.results[0];
    displayShow(show);
  } catch (err) {
    console.error('TMDB error:', err);
    showInfo.innerHTML = `<p>❌ Error loading show info. Check console for details.</p>`;
  }
}

// ===============================
// 📺 Display show info
// ===============================
function displayShow(show) {
  const image = show.poster_path
    ? `https://image.tmdb.org/t/p/w300${show.poster_path}`
    : 'https://via.placeholder.com/300x450?text=No+Image';

  showInfo.innerHTML = `
    <div class="show-card">
      <img src="${image}" alt="${show.name}" />
      <div class="show-details">
        <h2>${show.name}</h2>
        <p><strong>First Air Date:</strong> ${show.first_air_date || 'Unknown'}</p>
        <p>${show.overview || 'No description available.'}</p>
        <button id="addFavoriteBtn">⭐ Add to Favorites</button>
      </div>
    </div>
  `;

  document.getElementById('addFavoriteBtn').addEventListener('click', () => addFavorite(show));
}

// ===============================
// ⭐ Add to favorites
// ===============================
async function addFavorite(show) {
  try {
    const { error } = await supabase.from('favorites').insert([
      {
        show_id: show.id,
        show_name: show.name,
        poster_path: show.poster_path,
        overview: show.overview,
        first_air_date: show.first_air_date
      }
    ]);

    if (error) throw error;

    alert(`${show.name} added to favorites!`);
    loadFavorites();
  } catch (err) {
    console.error('Error adding favorite:', err);
    alert('Error adding to favorites. Check console.');
  }
}

// ===============================
// 📋 Load favorites list
// ===============================
async function loadFavorites() {
  try {
    const { data, error } = await supabase.from('favorites').select('*').order('added_at', { ascending: false });
    if (error) throw error;

    favoritesList.innerHTML = '';
    if (!data || data.length === 0) {
      favoritesList.innerHTML = '<li>No favorites saved yet.</li>';
      return;
    }

    data.forEach((fav) => {
      const li = document.createElement('li');
      li.textContent = fav.show_name;
      li.addEventListener('click', () => displayShow(fav));
      favoritesList.appendChild(li);
    });
  } catch (err) {
    console.error('Error loading favorites:', err);
    favoritesList.innerHTML = '<li>Error loading favorites. Check console.</li>';
  }
}
