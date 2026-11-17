# PDF Studio

A PDF editor that runs entirely in your browser. Open a PDF or a scan, edit its text in place, annotate, rearrange pages and export. Nothing is uploaded, and nothing is stored.

## Features

- **Edit existing text.** Hover a line, click it and retype. The original is covered with the sampled background colour, and the new text uses the sampled text colour and the closest standard font (Helvetica, Times or Courier).
- **Scanned documents.** Run OCR (English and Hindi are bundled, other languages download on first use). Each recognised line becomes clickable and editable like normal text. Exported files can include an invisible text layer so they stay searchable.
- **Annotate.** Add text, highlight, draw, box, ellipse, line, whiteout and insert images.
- **Pages.** Rotate, delete, add blank pages, drag thumbnails to reorder, merge several PDFs or images into one document.
- **Undo and redo, zoom, keyboard shortcuts** (V select, E edit text, T add text, H highlight, P draw, R box, O ellipse, L line, W whiteout, I image).
- **Export options.** "Flatten pages" turns every page into an image, which permanently removes anything hidden under whiteout.

## Run it locally

It is a static site with no build step. Serve the folder over HTTP (opening `index.html` straight from disk will not work, because browsers block web workers on `file://`):

```bash
npm start            # serves http://localhost:8080
# or
python3 -m http.server 8080
```

All libraries are bundled in `vendor/`, so it works offline.

## Deploy to GitHub Pages

1. Create a repository and push this folder to the `main` branch.
2. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Push again (or run the workflow manually). `.github/workflows/pages.yml` runs the tests and publishes the site at `https://<your-user>.github.io/<repo>/`.

Any other static host works too (Netlify, Cloudflare Pages, S3). Upload `index.html`, `css/`, `js/` and `vendor/`.

## Project layout

```
index.html              Page markup
css/app.css             Styles (light and dark theme follow the system setting)
js/app.js               Application code
vendor/                 Bundled libraries (see vendor/THIRD_PARTY.md)
  pdf.min.js, pdf.worker.min.js     pdf.js: render pages, read text
  pdf-lib.min.js                    pdf-lib: write the edited PDF
  tesseract/                        Tesseract.js: OCR engine, worker, English + Hindi data
tests/export.test.js    Tests the PDF-building code
.github/workflows/      GitHub Pages deployment
```

## How editing works

- pdf.js renders each page to a canvas and reads its text positions. Neighbouring text fragments on the same baseline are grouped into lines.
- Clicking a line adds a text object on top of the page and a rectangle that covers the original line. Edits, shapes and images are kept as plain objects in memory.
- On export, pdf-lib opens the original file, applies page order, rotation and deletions, then draws the covers, shapes and text on top. Nothing on the original page is removed unless you choose **Flatten pages**.

## Adding OCR languages

English (`eng`) and Hindi (`hin`) load from `vendor/tesseract/lang/`. Any other language in the dropdown is downloaded from `tessdata.projectnaptha.com` the first time it is used, so it needs an internet connection. To bundle another language, download `<code>.traineddata.gz` (the `4.0.0_best_int` set from [`@tesseract.js-data`](https://www.npmjs.com/org/tesseract.js-data)) into `vendor/tesseract/lang/` and add its code to `BUNDLED_LANGS` in `js/app.js`.

## Tests

```bash
npm install
npm test
```

The test runs the export code from `js/app.js` on a sample document and checks page order, rotation and drawing.

## Known limits

- **Fonts.** New or edited text uses Helvetica, Times or Courier. PDFs embed only the letters they use from each font, so the exact original typeface cannot be reused for new letters. Text with characters those fonts lack (for example Hindi) is exported as an image.
- **Alignment.** Edited text stays anchored at the original left edge. If you change a centred or right-aligned line a lot, move it by hand.
- **Rotated or vertical text** in the original file cannot be clicked and edited.
- **Whiteout** only hides content unless you export with **Flatten pages**.
- **Password-protected PDFs** are not supported. Remove the password first.
- **OCR accuracy** depends on scan quality. Turn on "Boost contrast" for faded pages.

## License

MIT. Bundled libraries keep their own licenses, listed in `vendor/THIRD_PARTY.md`.
