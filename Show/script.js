// ✅ Load environment variables from env.js
const TMDB_KEY = window.env.TMDB_KEY;
const SUPABASE_URL = window.env.SUPABASE_URL;
const SUPABASE_KEY = window.env.SUPABASE_KEY;

// ✅ Import Supabase client
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// ✅ Initialize Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ✅ DOM Elements
const searchBtn = document.getElementById('searchBtn');
const searchInput = document.getElementById('searchInput');
const showInfo = document.getElementById('showInfo');
const favoritesList = document.getElementById('favoritesList');

// ✅ Event Listeners
searchBtn.addEventListener('click', searchShow);
window.addEventListener('load', loadFavorites);

// ✅ Search for a TV Show
async function searchShow() {
  const query = searchInput.value.trim();
  if (!query) return alert('Please enter a show name.');

  showInfo.innerHTML = 'Loading...';

  try {
    const searchUrl = `https://api.themoviedb.org/3/search/tv?query=${encodeURIComponent(query)}`;
    const searchRes = await fetch(searchUrl, {
      headers: {
        Authorization: TMDB_KEY,
        'Content-Type': 'application/json;charset=utf-8',
      },
    });

    const searchData = await searchRes.json();
    if (!searchRes.ok) {
      console.error('TMDB error:', searchData);
      showInfo.innerHTML = `<p>API Error: ${searchData.status_message || 'Unauthorized'}</p>`;
      return;
    }

    if (!searchData.results?.length) {
      showInfo.innerHTML = '<p>No shows found.</p>';
      return;
    }

    const show = searchData.results[0];
    displayShowDetails(show.id);
  } catch (err) {
    console.error('Error fetching show:', err);
    showInfo.innerHTML = `<p>Unexpected error occurred.</p>`;
  }
}

// ✅ Display Show Details
async function displayShowDetails(showId) {
  showInfo.innerHTML = 'Loading show details...';

  try {
    const detailsUrl = `https://api.themoviedb.org/3/tv/${showId}?append_to_response=credits`;
    const detailsRes = await fetch(detailsUrl, {
      headers: {
        Authorization: TMDB_KEY,
        'Content-Type': 'application/json;charset=utf-8',
      },
    });

    const details = await detailsRes.json();

    if (!detailsRes.ok) {
      showInfo.innerHTML = `<p>Failed to load show details: ${details.status_message}</p>`;
      return;
    }

    const nextSeason = details.next_episode_to_air
      ? `Next season airs on: ${details.next_episode_to_air.air_date}`
      : 'No upcoming season announced';

    const topActors =
      details.credits?.cast?.slice(0, 5).map((a) => a.name).join(', ') || 'N/A';

    const { data: existing } = await supabase
      .from('favorites')
      .select('show_id')
      .eq('show_id', showId)
      .maybeSingle();

    const isFavorited = !!existing;

    showInfo.innerHTML = `
      <div class="show-card">
        <h2>${details.name} (${details.first_air_date?.slice(0, 4) || 'N/A'})</h2>
        <img src="https://image.tmdb.org/t/p/w300${details.poster_path}" alt="${details.name}" />
        <p><strong>Rating:</strong> ${details.vote_average}</p>
        <p><strong>Seasons:</strong> ${details.number_of_seasons}</p>
        <p><strong>Actors:</strong> ${topActors}</p>
        <p><strong>Overview:</strong> ${details.overview}</p>
        <p>${nextSeason}</p>
        ${
          isFavorited
            ? `<button onclick="removeFavorite(${details.id})">❌ Remove from Favorites</button>`
            : `<button onclick="saveFavorite(${details.id}, '${escapeQuotes(details.name)}', '${details.poster_path}')">❤️ Save to Favorites</button>`
        }
      </div>
    `;
  } catch (err) {
    console.error('Error loading details:', err);
    showInfo.innerHTML = `<p>Error loading details.</p>`;
  }
}

// ✅ Save Favorite to Supabase
window.saveFavorite = async (id, title, poster) => {
  try {
    const { error } = await supabase
      .from('favorites')
      .insert([{ show_id: id, title, poster }]);
    if (error) throw error;
    alert('✅ Added to favorites!');
    loadFavorites();
  } catch (err) {
    alert('❌ Error saving favorite: ' + err.message);
  }
};

// ✅ Remove Favorite
window.removeFavorite = async (id) => {
  try {
    const { error } = await supabase.from('favorites').delete().eq('show_id', id);
    if (error) throw error;
    alert('🗑️ Removed from favorites!');
    loadFavorites();
    showInfo.innerHTML = '';
  } catch (err) {
    alert('❌ Error removing favorite: ' + err.message);
  }
};

// ✅ Load Favorites from Supabase
async function loadFavorites() {
  const { data, error } = await supabase
    .from('favorites')
    .select('*')
    .order('added_at', { ascending: false });

  if (error) {
    console.error('Error loading favorites:', error);
    favoritesList.innerHTML = '<p>Could not load favorites.</p>';
    return;
  }

  if (!data.length) {
    favoritesList.innerHTML = '<p>No favorites saved yet.</p>';
    return;
  }

  favoritesList.innerHTML = data
    .map(
      (f) => `
      <div class="favorite-item" onclick="displayShowDetails(${f.show_id})">
        <img src="https://image.tmdb.org/t/p/w200${f.poster}" alt="${f.title}" />
        <p>${f.title}</p>
        <button class="remove-btn" onclick="event.stopPropagation(); removeFavorite(${f.show_id});">Remove</button>
      </div>
    `
    )
    .join('');
}

// ✅ Helper: Escape Quotes
function escapeQuotes(str) {
  return str.replace(/'/g, "\\'");
}
