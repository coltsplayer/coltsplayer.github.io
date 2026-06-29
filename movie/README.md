# Movie Library Website

This is a static website project generated from `movies.xlsx`. It can be copied into a folder in an existing GitHub Pages site and opened without a build step.

## Files

- `index.html` is the page markup.
- `styles.css` controls the layout and visual design.
- `app.js` powers search, filters, sorting, responsive cards, counts, and CSV export.
- `data/movies.js` contains the movie list.

## Add It To GitHub Pages

1. Copy the `movie-library-site` folder into your website repository.
2. Link to `movie-library-site/index.html` from your existing site navigation.
3. Commit and push the folder to GitHub.

If your GitHub Pages site is served from the repository root, the page will work as `/movie-library-site/`.

## Updating The Movie List

Edit `data/movies.js` and keep the same field names:

```js
{
  number: 86,
  title: "Movie title",
  genre: "action",
  description: "Short description",
  format: "DVD",
  status: "Own",
  mainActor: "Actor name",
  series: "Series name",
  condition: "Used"
}
```

Leave `series` blank for a standalone movie.
