// Runs the PDF-building code from js/app.js on a sample document and checks the result.
// Usage: npm install && npm test
const fs = require('fs');
const path = require('path');
const assert = require('assert');
global.PDFLib = require('pdf-lib');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const m = src.match(/\/\*EXPORT_START\*\/([\s\S]*?)\/\*EXPORT_END\*\//);
assert(m, 'EXPORT_START / EXPORT_END markers not found in js/app.js');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const { buildPdfCore, mkMap } = new Function('clamp', 'PDFLib', m[1] + ';return {buildPdfCore,mkMap}')(clamp, PDFLib);

(async () => {
  const d = await PDFLib.PDFDocument.create();
  [[300, 400], [500, 600], [200, 200]].forEach(s => d.addPage(s));
  const bytes = await d.save();
  const text = { id: 'a', t: 'text', text: 'Hello world', size: 14, color: '#112233', font: 'serif', bold: true, italic: false, x: 20, y: 30, cover: { x: 10, y: 20, w: 120, h: 30, color: '#ffffff' } };
  const shapes = [
    { id: 'b', t: 'rect', x: 50, y: 100, w: 80, h: 40, stroke: '#ff0000', fill: '#ffe14d', sw: 2, op: .5 },
    { id: 'c', t: 'ellipse', x: 50, y: 160, w: 60, h: 30, stroke: '#00aa00', fill: null, sw: 1, op: 1 },
    { id: 'd', t: 'line', x1: 10, y1: 10, x2: 100, y2: 90, stroke: '#000000', sw: 2, op: 1, arrow: true },
    { id: 'e', t: 'pen', pts: [{ x: 1, y: 1 }, { x: 20, y: 30 }, { x: 40, y: 10 }], stroke: '#0000ff', sw: 2, op: 1 }
  ];
  const pg = (id, srcIdx, rot, w, h, annots, blank) => ({ id, src: srcIdx, blank: !!blank, rot, base: [w, h], baseRot: 0, annots });
  // Reordered, one page deleted, one blank page added, one page rotated and annotated.
  const pages = [pg('p3', 2, 0, 200, 200, []), pg('pb', null, 0, 300, 400, [], true), pg('p1', 0, 90, 300, 400, [text, ...shapes]), pg('p2', 1, 0, 500, 600, [{ ...text, id: 'z' }])];
  const out = await buildPdfCore({
    bytes, pages, images: new Map(), searchable: true,
    ocr: p => p.id === 'p2' ? { rot: 0, words: [{ t: 'word', x: 10, y: 10, w: 40, h: 12 }] } : null,
    rasterText: async () => { throw new Error('rasterText should not be needed for Latin text'); }
  });
  const r = await PDFLib.PDFDocument.load(out);
  const got = r.getPages().map(p => `${p.getSize().width}x${p.getSize().height}@${p.getRotation().angle}`);
  assert.deepStrictEqual(got, ['200x200@0', '300x400@0', '300x400@90', '500x600@0']);

  // Rotated coordinate maps send the view corners to the right page corners.
  const m90 = mkMap(90, { x: 0, y: 0, width: 300, height: 400 });
  assert.deepStrictEqual(m90.f(0, 0), [0, 0]);
  assert.deepStrictEqual(m90.f(400, 300), [300, 400]);
  console.log('ok - export builds, reorders, rotates and annotates pages:', got.join(' | '));
})().catch(e => { console.error('FAIL', e); process.exit(1); });
