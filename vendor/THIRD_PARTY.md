# Third-party code bundled in `vendor/`

| Library | Version | License | Used for |
|---|---|---|---|
| [pdf.js](https://github.com/mozilla/pdf.js) (`pdf.min.js`, `pdf.worker.min.js`) | 3.11.174 | Apache-2.0 | Rendering pages, reading text |
| [pdf-lib](https://github.com/Hopding/pdf-lib) (`pdf-lib.min.js`) | 1.17.1 | MIT | Writing the edited PDF |
| [Tesseract.js](https://github.com/naptha/tesseract.js) (`tesseract/tesseract.min.js`, `worker.min.js`) | 5.1.1 | Apache-2.0 | OCR driver |
| [Tesseract.js Core](https://github.com/naptha/tesseract.js-core) (`tesseract/core/*`) | 5.1.0 | Apache-2.0 | OCR engine (WebAssembly) |
| [tessdata_best (int)](https://github.com/tesseract-ocr/tessdata_best) via `@tesseract.js-data/eng` and `hin` (`tesseract/lang/*`) | 4.0.0 | Apache-2.0 | English and Hindi OCR models |

Each library keeps its own license. Their license texts are available in their repositories linked above.
