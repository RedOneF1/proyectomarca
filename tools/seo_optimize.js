const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const esbuild = require('esbuild');
const postcss = require('postcss');
const purgecss = require('@fullhuman/postcss-purgecss');
const { chromium } = require('playwright');

const ROOT = process.cwd();
const INDEX = path.join(ROOT, 'index.html');
const CSS_SRC = path.join(ROOT, 'css', 'estilos.css');
const CSS_MIN = path.join(ROOT, 'css', 'estilos.min.css');
const JS_SRC = path.join(ROOT, 'js', 'script.js');
const JS_MIN = path.join(ROOT, 'js', 'script.min.js');
const MANIFEST = path.join(ROOT, 'manifest.webmanifest');

// 1. Purge CSS, inline if <=20KB
async function purgeCss(){
  const css = fs.readFileSync(CSS_SRC, 'utf8');
  const result = await postcss([
    purgecss({
      content: [INDEX, JS_SRC],
      safelist: ['active','visible','nav-scrolled','form-highlight','has-error','is-invalid','is-valid'],
    })
  ]).process(css, { from: CSS_SRC });
  const purged = result.css;
  const size = Buffer.byteLength(purged);
  let html = fs.readFileSync(INDEX, 'utf8');
  if(size <= 20000){
    // inline
    html = html.replace(/<link rel="preload" href="css\/estilos.min.css"[^>]*>/, `<style>\n${purged}\n</style>`);
    html = html.replace(/<noscript>\s*<link rel="stylesheet" href="css\/estilos.min.css"\s*\/?>\s*<\/noscript>/, '');
    console.log('CSS inlined (size', size, 'bytes)');
  } else {
    // external non‑blocking load
    html = html.replace(/<link rel="preload" href="css\/estilos.min.css"[^>]*>/, `<link rel="stylesheet" href="css/estilos.min.css" media="print" onload="this.media='all'">`);
    // keep noscript fallback
    console.log('CSS kept external (size', size, 'bytes)');
  }
  fs.writeFileSync(INDEX, html);
  fs.writeFileSync(CSS_MIN, purged);
}

// 2. Minify JS, defer attribute
function minifyJs(){
  const js = fs.readFileSync(JS_SRC, 'utf8');
  esbuild.buildSync({
    stdin: { contents: js, resolveDir: path.dirname(JS_SRC), sourcefile: 'script.js' },
    minify: true,
    bundle: true,
    outfile: JS_MIN,
    target: ['es2020'],
  });
  // replace script tag
  let html = fs.readFileSync(INDEX, 'utf8');
  html = html.replace(/<script src="js\/script\.js"[^>]*>/, '<script src="js/script.min.js" defer></script>');
  fs.writeFileSync(INDEX, html);
  console.log('JS minified');
}

// 3. Add favicon, apple‑touch‑icon, manifest
function addIconsAndManifest(){
  let html = fs.readFileSync(INDEX, 'utf8');
  if(!html.includes('rel="apple-touch-icon"')){
    html = html.replace('</head>', '\n<link rel="apple-touch-icon" href="favicon.svg">\n<link rel="manifest" href="manifest.webmanifest">\n</head>');
  }
  fs.writeFileSync(INDEX, html);
  if(!fs.existsSync(MANIFEST)){
    const manifest = {
      name: 'NOVA – Indumentaria Urbana Técnica',
      short_name: 'NOVA',
      start_url: './',
      scope: './',
      display: 'standalone',
      theme_color: '#050505',
      background_color: '#050505',
      icons: [
        { src: 'favicon.svg', type: 'image/svg+xml', sizes: 'any' },
        { src: 'icon-192.png', type: 'image/png', sizes: '192x192' },
        { src: 'icon-512.png', type: 'image/png', sizes: '512x512' }
      ]
    };
    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
    console.log('manifest created');
  }
}

// 4. Update OG / Twitter and GA4 snippet
function updateSocialAndAnalytics(){
  let html = fs.readFileSync(INDEX, 'utf8');
  const title = 'NOVA | Indumentaria Urbana Técnica en Bogotá - Marca';
  const description = 'NOVA es indumentaria urbana técnica con diseño de precisión, fabricación limitada y textiles de alto rendimiento en Bogotá. Descubre la colección y solicita acceso exclusivo.';
  const ogImage = 'https://redonef1.github.io/proyectomarca/img/nova-hoodie-hero-1200w.jpg';
  // replace or insert meta tags
  const replaceOrInsert = (pattern, replacement) => {
    if(html.match(pattern)) {
      html = html.replace(pattern, replacement);
    } else {
      html = html.replace('</head>', `${replacement}\n</head>`);
    }
  };
  replaceOrInsert(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${title}">`);
  replaceOrInsert(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${title}">`);
  replaceOrInsert(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${description}">`);
  replaceOrInsert(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${description}">`);
  replaceOrInsert(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="https://redonef1.github.io/proyectomarca/">`);
  replaceOrInsert(/<meta property="og:site_name"[^>]*>/, `<meta property="og:site_name" content="NOVA">`);
  replaceOrInsert(/<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${ogImage}">`);
  replaceOrInsert(/<meta name="twitter:card"[^>]*>/, `<meta name="twitter:card" content="summary_large_image">`);
  replaceOrInsert(/<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${ogImage}">`);
  // GA4 snippet (async) – add if not present
  if(!html.includes('G-3VLNKX956T')){
    const ga = `\n<script async src="https://www.googletagmanager.com/gtag/js?id=G-3VLNKX956T"></script>\n<script>window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date()); gtag('config', 'G-3VLNKX956T');</script>`;
    html = html.replace('</head>', `${ga}\n</head>`);
  }
  fs.writeFileSync(INDEX, html);
  console.log('Social tags & GA4 updated');
}

// 5. Playwright checks (LCP, console, request count)
async function runPlaywright(){
  const browser = await chromium.launch({headless: true});
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const logs = [];
  page.on('console', msg => logs.push({type: msg.type(), text: msg.text()}));
  page.on('pageerror', err => logs.push({type: 'error', text: err.message}));
  page.on('requestfailed', req => logs.push({type: 'requestfailed', url: req.url(), error: req.failure().errorText}));
  await page.goto('http://localhost:4173/', {waitUntil: 'load'});
  await page.waitForTimeout(5000);
  const lcpEntry = await page.evaluate(() => performance.getEntriesByName('largest-contentful-paint')[0]);
  const lcp = lcpEntry ? lcpEntry.startTime : null;
  const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(r => r.name));
  const report = { lcp, requestCount: resources.length, logs };
  fs.writeFileSync(path.join(ROOT, 'playwright_report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  console.log('Playwright report saved');
}

// 6. Lighthouse runs
function runLighthouse(){
  console.log('Running Lighthouse mobile');
  execSync('npx lighthouse http://localhost:4173/ --output=json --output=html --quiet --output-path=reports/lh-mobile-final.json', {stdio: 'inherit'});
  console.log('Running Lighthouse desktop');
  execSync('npx lighthouse http://localhost:4173/ --preset=desktop --output=json --output=html --quiet --output-path=reports/lh-desktop-final.json', {stdio: 'inherit'});
}

async function main(){
  await purgeCss();
  minifyJs();
  addIconsAndManifest();
  updateSocialAndAnalytics();
  await runPlaywright();
  runLighthouse();
  // regenerate seo_check report for final comparison
  execSync('node seo_check.js', {stdio: 'inherit'});
  // Append Lighthouse medians to REPORT.md
  const reportPath = path.join(ROOT, 'REPORT.md');
  let reportMd = fs.readFileSync(reportPath, 'utf8');
  const mobile = JSON.parse(fs.readFileSync(path.join(ROOT,'reports','lh-mobile-final.report.json'),'utf8'));
  const desktop = JSON.parse(fs.readFileSync(path.join(ROOT,'reports','lh-desktop-final.report.json'),'utf8'));
  const median = arr => { const s = [...arr].sort((a,b)=>a-b); return s.length%2===0?(s[s.length/2-1]+s[s.length/2])/2:s[Math.floor(s.length/2)]; };
  const perf = median([mobile.categories.performance.score*100, desktop.categories.performance.score*100]);
  const acc = median([mobile.categories.accessibility.score*100, desktop.categories.accessibility.score*100]);
  const best = median([mobile.categories['best-practices'].score*100, desktop.categories['best-practices'].score*100]);
  const seo = median([mobile.categories.seo.score*100, desktop.categories.seo.score*100]);
  reportMd += `\n## Lighthouse medians after optimizations\n| Category | Median Score |\n|----------|-------------:|\n| Performance | ${perf.toFixed(0)} |\n| Accessibility | ${acc.toFixed(0)} |\n| Best Practices | ${best.toFixed(0)} |\n| SEO | ${seo.toFixed(0)} |\n`;
  fs.writeFileSync(reportPath, reportMd);
  console.log('REPORT.md updated');
}

main();

