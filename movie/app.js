(function () {
  const movies = window.movieLibraryMovies || [];

  const els = {
    totalCount: document.querySelector("#total-count"),
    ownCount: document.querySelector("#own-count"),
    wishCount: document.querySelector("#wish-count"),
    resultCount: document.querySelector("#result-count"),
    search: document.querySelector("#search-input"),
    genre: document.querySelector("#genre-filter"),
    format: document.querySelector("#format-filter"),
    status: document.querySelector("#status-filter"),
    series: document.querySelector("#series-filter"),
    sort: document.querySelector("#sort-select"),
    clear: document.querySelector("#clear-filters"),
    exportCsv: document.querySelector("#export-csv"),
    tableBody: document.querySelector("#movie-table-body"),
    cards: document.querySelector("#movie-cards"),
    empty: document.querySelector("#empty-state")
  };

  const fields = [
    "number",
    "title",
    "genre",
    "description",
    "format",
    "status",
    "mainActor",
    "series",
    "condition"
  ];

  function titleCase(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\b([a-z])/g, (letter) => letter.toUpperCase());
  }

  function display(value, fallback = "Not listed") {
    return String(value || "").trim() || fallback;
  }

  function displaySeries(value) {
    return display(value, "Standalone");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function uniqueValues(key) {
    return [...new Set(movies.map((movie) => display(movie[key], "")).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }

  function addOptions(select, values) {
    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = titleCase(value);
      select.append(option);
    });
  }

  function updateStats() {
    els.totalCount.textContent = movies.length;
    els.ownCount.textContent = movies.filter((movie) => movie.status.toLowerCase() === "own").length;
    els.wishCount.textContent = movies.filter((movie) => movie.status.toLowerCase() === "wish").length;
  }

  function getFilteredMovies() {
    const query = els.search.value.trim().toLowerCase();
    const activeGenre = els.genre.value.toLowerCase();
    const activeFormat = els.format.value.toLowerCase();
    const activeStatus = els.status.value.toLowerCase();
    const activeSeries = els.series.value.toLowerCase();

    return movies.filter((movie) => {
      const haystack = fields.map((field) => movie[field]).join(" ").toLowerCase();
      return (!query || haystack.includes(query))
        && (!activeGenre || movie.genre.toLowerCase() === activeGenre)
        && (!activeFormat || movie.format.toLowerCase() === activeFormat)
        && (!activeStatus || movie.status.toLowerCase() === activeStatus)
        && (!activeSeries || movie.series.toLowerCase() === activeSeries);
    });
  }

  function sortMovies(list) {
    const [field, direction] = els.sort.value.split("-");
    const key = field === "actor" ? "mainActor" : field;

    return [...list].sort((a, b) => {
      const aValue = key === "number" ? Number(a[key]) : display(a[key], "").toLowerCase();
      const bValue = key === "number" ? Number(b[key]) : display(b[key], "").toLowerCase();
      const result = aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      return direction === "desc" ? -result : result;
    });
  }

  function tag(text, type = "") {
    const className = type ? `tag tag--${type}` : "tag";
    return `<span class="${className}">${escapeHtml(display(text))}</span>`;
  }

  function renderTable(list) {
    els.tableBody.innerHTML = list.map((movie) => `
      <tr>
        <td>${movie.number}</td>
        <td><strong>${escapeHtml(display(movie.title))}</strong></td>
        <td>${escapeHtml(titleCase(movie.genre))}</td>
        <td class="muted">${escapeHtml(display(movie.description))}</td>
        <td>${tag(movie.format, movie.format.toLowerCase().includes("blue") ? "gold" : "")}</td>
        <td>${tag(movie.status, movie.status.toLowerCase() === "wish" ? "red" : "")}</td>
        <td>${escapeHtml(display(movie.mainActor))}</td>
        <td>${escapeHtml(displaySeries(movie.series))}</td>
        <td>${escapeHtml(display(movie.condition))}</td>
      </tr>
    `).join("");
  }

  function renderCards(list) {
    els.cards.innerHTML = list.map((movie) => `
      <article class="movie-card">
        <div class="movie-card__top">
          <h2>${escapeHtml(display(movie.title))}</h2>
          <span class="movie-card__number">#${movie.number}</span>
        </div>
        <dl>
          <dt>Genre</dt><dd>${escapeHtml(titleCase(movie.genre))}</dd>
          <dt>Description</dt><dd>${escapeHtml(display(movie.description))}</dd>
          <dt>Format</dt><dd>${escapeHtml(display(movie.format))}</dd>
          <dt>Own/Wish</dt><dd>${escapeHtml(display(movie.status))}</dd>
          <dt>Main Actor</dt><dd>${escapeHtml(display(movie.mainActor))}</dd>
          <dt>Series</dt><dd>${escapeHtml(displaySeries(movie.series))}</dd>
          <dt>Condition</dt><dd>${escapeHtml(display(movie.condition))}</dd>
        </dl>
      </article>
    `).join("");
  }

  function render() {
    const filtered = sortMovies(getFilteredMovies());
    els.resultCount.textContent = filtered.length;
    els.empty.hidden = filtered.length !== 0;
    renderTable(filtered);
    renderCards(filtered);
  }

  function clearFilters() {
    els.search.value = "";
    els.genre.value = "";
    els.format.value = "";
    els.status.value = "";
    els.series.value = "";
    els.sort.value = "number-asc";
    render();
  }

  function exportCsv() {
    const headers = ["Movie Number", "Movie Title", "Genre", "Description", "DVD/Blu-ray", "Own/Wish", "Main Actor", "Series", "New/Used"];
    const rows = sortMovies(getFilteredMovies()).map((movie) => fields.map((field) => movie[field]));
    const csv = [headers, ...rows].map((row) =>
      row.map((cell) => `"${String(cell || "").replace(/"/g, '""')}"`).join(",")
    ).join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "movie-library.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  addOptions(els.genre, uniqueValues("genre"));
  addOptions(els.format, uniqueValues("format"));
  addOptions(els.status, uniqueValues("status"));
  addOptions(els.series, uniqueValues("series"));
  updateStats();
  render();

  [els.search, els.genre, els.format, els.status, els.series, els.sort].forEach((input) => {
    input.addEventListener("input", render);
  });
  els.clear.addEventListener("click", clearFilters);
  els.exportCsv.addEventListener("click", exportCsv);
}());
