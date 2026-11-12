import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import esbuild from 'esbuild';
import purgecss from '@fullhuman/postcss-purgecss';
import postcss from 'postcss';
import { test, expect } from '@playwright/test';

const ROOT = process.cwd();
const INDEX = path.join(ROOT, 'index.html');
const CSS_SRC = path.join(ROOT, 'css', 'estilos.css');
const CSS_MIN = path.join(ROOT, 'css', 'estilos.min.css');
const JS_SRC = path.join(ROOT, 'js', 'script.js');
const JS_MIN = path.join(ROOT, 'js', 'script.min.js');
const MANIFEST = path.join(ROOT, 'manifest.webmanifest');

// 1. Purge unused CSS (keep dynamic classes)
const safelist = ['active','visible','nav-scrolled','form-highlight','has-error','is-invalid','is-valid'];
async function purgeCss(){
  const css = fs.readFileSync(CSS_SRC, 'utf8');
  const result = await postcss([
    purgecss({
      content: [INDEX, path.join(ROOT,'js','script.js')],
      safelist: safelist,
    })
  ]).process(css, {from: CSS_SRC});
  const purged = result.css;
  const size = Buffer.byteLength(purged);
  if(size <= 20000){ // inline
    // replace preload link with inline <style>
    let html = fs.readFileSync(INDEX,'utf8');
    html = html.replace(/<link rel="preload" href="css\/estilos.min.css"[^>]*>/, `<style>\n${purged}\n</style>`);
    // remove noscript fallback
    html = html.replace(/<noscript>\s*<link rel="stylesheet" href="css\/estilos.min.css"\s*\/?>\s*<\/noscript>/, '');
    fs.writeFileSync(INDEX, html);
    console.log('CSS inlined (size', size, 'bytes)');
  } else {
    // keep external but change to print+onload
    let html = fs.readFileSync(INDEX,'utf8');
    html = html.replace(/<link rel="preload" href="css\/estilos.min.css"[^>]*>/, `<link rel="stylesheet" href="css/estilos.min.css" media="print" onload="this.media='all'">`);
    // keep noscript
    fs.writeFileSync(INDEX, html);
    console.log('CSS kept external (size', size, 'bytes)');
  }
  // write purged css to min file for future builds
  fs.writeFileSync(CSS_MIN, purged);
}

// 2. Minify JS with esbuild (defer)
function minifyJs(){
  const js = fs.readFileSync(JS_SRC,'utf8');
  const result = esbuild.buildSync({
    stdin: {contents: js, resolveDir: path.dirname(JS_SRC), sourcefile: 'script.js'},
    minify: true,
    bundle: true,
    outfile: JS_MIN,
    target: ['es2020'],
  });
  console.log('JS minified');
  // ensure script tag uses defer and points to min file
  let html = fs.readFileSync(INDEX,'utf8');
  html = html.replace(/<script src="js\/script\.js"[^>]*>/, '<script src="js/script.min.js" defer></script>');
  fs.writeFileSync(INDEX, html);
}

// 3. Add favicon, apple-touch-icon, manifest
function addIconsAndManifest(){
  let html = fs.readFileSync(INDEX,'utf8');
  const headClose = '</head>';
  const extras = `\n<link rel="apple-touch-icon" href="favicon.svg">\n<link rel="manifest" href="manifest.webmanifest">`;
  if(!html.includes('rel="apple-touch-icon"')){
    html = html.replace(headClose, extras + headClose);
  }
  fs.writeFileSync(INDEX, html);
  // create simple manifest if not exists
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
        {src: 'favicon.svg', type: 'image/svg+xml', sizes: 'any'},
        {src: 'icon-192.png', type: 'image/png', sizes: '192x192'},
        {src: 'icon-512.png', type: 'image/png', sizes: '512x512'}
      ]
    };
    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
    console.log('manifest created');
  }
}

// 4. Update OG & Twitter tags and GA4 snippet
function updateSocialAndAnalytics(){
  let html = fs.readFileSync(INDEX,'utf8');
  const title = 'NOVA | Indumentaria Urbana Técnica en Bogotá - Marca';
  const description = 'NOVA es indumentaria urbana técnica con diseño de precisión, fabricación limitada y textiles de alto rendimiento en Bogotá. Descubre la colección y solicita acceso exclusivo.';
  const ogImage = 'https://redonef1.github.io/proyectomarca/img/nova-hoodie-hero-1200w.jpg';
  // replace og:title, twitter:title, description if exist
  html = html.replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${title}">`);
  html = html.replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${title}">`);
  // ensure og:description and twitter:description
  html = html.replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${description}">`);
  if(!html.includes('name="twitter:description"')){
    html = html.replace('</head>', `<meta name="twitter:description" content="${description}">\n</head>`);
  } else {
    html = html.replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${description}">`);
  }
  // og:url, og:site_name, og:image
  html = html.replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="https://redonef1.github.io/proyectomarca/">`);
  html = html.replace(/<meta property="og:site_name"[^>]*>/, `<meta property="og:site_name" content="NOVA">`);
  html = html.replace(/<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${ogImage}">`);
  // twitter:card and twitter:image
  if(!html.includes('name="twitter:card"')){
    html = html.replace('</head>', `<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:image" content="${ogImage}">\n</head>`);
  } else {
    html = html.replace(/<meta name="twitter:card"[^>]*>/, `<meta name="twitter:card" content="summary_large_image">`);
    html = html.replace(/<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${ogImage}">`);
  }
  // GA4 snippet (async) – place after meta tags
  const gaSnippet = `\n<script async src="https://www.googletagmanager.com/gtag/js?id=G-3VLNKX956T"></script>\n<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-3VLNKX956T');</script>`;
  if(!html.includes('G-3VLNKX956T')){
    html = html.replace('</head>', `${gaSnippet}\n</head>`);
  }
  fs.writeFileSync(INDEX, html);
  console.log('Social tags & GA4 updated');
}

// 5. Playwright LCP & console check
async function runPlaywright(){
  import { chromium } from 'playwright';
  const browser = await chromium.launch({headless: true});
  const context = await browser.newContext({
    viewport: {width: 390, height: 844},
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const logs = [];
  page.on('console', msg => logs.push({type: msg.type(), text: msg.text()}));
  page.on('pageerror', err => logs.push({type: 'error', text: err.message}));
  page.on('requestfailed', req => logs.push({type: 'requestfailed', url: req.url(), error: req.failure().errorText}));
  await page.goto('http://localhost:4173/', {waitUntil: 'load'});
  // wait a bit for LCP
  await page.waitForTimeout(5000);
  const lcpEntry = await page.evaluate(() => performance.getEntriesByName('largest-contentful-paint')[0]);
  const lcpTime = lcpEntry ? lcpEntry.startTime : null;
  console.log('LCP (ms):', lcpTime);
  // count requests
  const requests = await page.evaluate(() => performance.getEntriesByType('resource').map(r=>r.name));
  console.log('Requests count:', requests.length);
  // write a small report
  const report = {lcp: lcpTime, requestCount: requests.length, logs};
  fs.writeFileSync(path.join(ROOT,'playwright_report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}

// 6. Run Lighthouse (mobile & desktop) and generate summary
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
  // generate REPORT.md with checklist results (reuse existing seo_check.js)
  execSync('node seo_check.js', {stdio: 'inherit'});
  // Append Lighthouse medians to REPORT.md
  const reportPath = path.join(ROOT,'REPORT.md');
  let reportContent = fs.readFileSync(reportPath,'utf8');
  // parse lighthouse JSONs for medians
  const mobile = JSON.parse(fs.readFileSync(path.join(ROOT,'reports','lh-mobile-final.report.json'),'utf8'));
  const desktop = JSON.parse(fs.readFileSync(path.join(ROOT,'reports','lh-desktop-final.report.json'),'utf8'));
  const med = (arr)=>{ const s=arr.slice().sort((a,b)=>a-b); return s.length%2===0?(s[s.length/2-1]+s[s.length/2])/2:s[Math.floor(s.length/2)]; };
  const mPerf = med([mobile.categories.performance.score*100, desktop.categories.performance.score*100]);
  const mAcc = med([mobile.categories.accessibility.score*100, desktop.categories.accessibility.score*100]);
  const mBest = med([mobile.categories['best-practices'].score*100, desktop.categories['best-practices'].score*100]);
  const mSeo = med([mobile.categories.seo.score*100, desktop.categories.seo.score*100]);
  reportContent += `\n## Lighthouse medians after optimizations\n| Category | Median Score |\n|----------|-------------:|\n| Performance | ${mPerf.toFixed(0)} |\n| Accessibility | ${mAcc.toFixed(0)} |\n| Best Practices | ${mBest.toFixed(0)} |\n| SEO | ${mSeo.toFixed(0)} |\n`;
  fs.writeFileSync(reportPath, reportContent);
  console.log('REPORT.md updated');
}

main();
