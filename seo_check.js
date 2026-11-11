const fs = require('fs');
const path = require('path');

function read(file){
  try { return fs.readFileSync(file,'utf8'); } catch(e){ return null; }
}

function checkTitle(html){
  const m = html.match(/<title>([^<]*)<\/title>/i);
  if(!m) return ['FALLA','<title> missing'];
  const len = m[1].trim().length;
  const ok = len>=50 && len<=60;
  return [ok?'OK':'FALLA', `length ${len}`];
}
function checkMetaDescription(html){
  const m = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']\s*\/?>/i);
  if(!m) return ['FALLA','meta description missing'];
  const len = m[1].trim().length;
  const ok = len>=120 && len<=155;
  return [ok?'OK':'FALLA', `length ${len}`];
}
function checkSingleH1(html){
  const count = (html.match(/<h1\b/gi)||[]).length;
  return [count===1?'OK':'FALLA', `${count} <h1>`];
}
function checkHeadingOrder(html){
  // simple check: no h3 before h2, no h2 before h1 etc.
  const headings = [];
  const re = /<(h[1-6])\b[^>]*>/gi;
  let m;
  while((m=re.exec(html))){headings.push(parseInt(m[1][1]));}
  for(let i=1;i<headings.length;i++){
    if(headings[i] > headings[i-1]+1) return ['FALLA', `heading level jump from h${headings[i-1]} to h${headings[i]}`];
  }
  return ['OK',''];
}
function checkImages(html){
  const imgs = html.match(/<img\b[^>]*>/gi)||[];
  for(const img of imgs){
    if(!/\balt=/.test(img)) return ['FALLA','img missing alt'];
    if(!/\bwidth=/.test(img) || !/\bheight=/.test(img)) return ['FALLA','img missing width/height'];
  }
  return ['OK',''];
}
function checkTextLength(html){
  // Strip tags
  const text = html.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,'');
  const words = text.trim().split(/\s+/).filter(w=>w.length>0).length;
  return [words>=300?'OK':'FALLA', `${words} words`];
}
function checkLang(html){
  const m = html.match(/<html[^>]*\blang=["']([^"']+)["']/i);
  return [m && m[1]==='es-CO'?'OK':'FALLA', m?`lang=${m[1]}`:'missing'];
}
function checkCharset(html){
  return /<meta\s+charset=["']?utf-8["']?/i.test(html)?['OK','']:['FALLA',''];
}
function checkViewport(html){
  return /<meta\s+name=["']viewport["']\s+content=["'][^"']*["']\s*\/?>/i.test(html)?['OK','']:['FALLA',''];
}
function checkCanonical(html){
  const m = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
  if(!m) return ['FALLA','missing'];
  const ok = m[1]=== 'https://redonef1.github.io/proyectomarca/';
  return [ok?'OK':'FALLA', m[1]];
}
function checkMetaRobots(html){
  const m = html.match(/<meta\s+name=["']robots["']\s+content=["']([^"']+)["']/i);
  if(!m) return ['FALLA','missing'];
  const ok = /index/.test(m[1]) && /follow/.test(m[1]);
  return [ok?'OK':'FALLA', m[1]];
}
function checkRobotsTxt(){
  const file = path.join(__dirname,'robots.txt');
  if(!fs.existsSync(file)) return ['FALLA','missing'];
  const content = fs.readFileSync(file,'utf8');
  const ok = /Sitemap:\s*https?:\/\/redonef1\.github\.io\/sitemap\.xml/.test(content);
  return [ok?'OK':'FALLA',''];
}
function checkSitemap(){
  const file = path.join(__dirname,'sitemap.xml');
  if(!fs.existsSync(file)) return ['FALLA','missing'];
  const content = fs.readFileSync(file,'utf8');
  // simple check for <loc> with correct URL
  const ok = /<loc>https:\/\/redonef1\.github\.io\/proyectomarca\/.+<\/loc>/.test(content);
  return [ok?'OK':'FALLA',''];
}
function check404(){
  const file = path.join(__dirname,'404.html');
  if(!fs.existsSync(file)) return ['FALLA','missing'];
  const html = fs.readFileSync(file,'utf8');
  const ok = /noindex/.test(html);
  return [ok?'OK':'FALLA',''];
}
function checkHreflang(html){
  const ok = /<link\s+rel=["']alternate["']\s+hreflang=["']es-CO["']/.test(html) && /<link\s+rel=["']alternate["']\s+hreflang=["']x-default["']/.test(html);
  return [ok?'OK':'FALLA',''];
}
function checkFavicon(html){
  const ok = /<link\s+rel=["']icon["']/.test(html) && /<link\s+rel=["']apple-touch-icon["']/.test(html);
  return [ok?'OK':'FALLA',''];
}
function checkManifest(html){
  const m = html.match(/<link\s+rel=["']manifest["']\s+href=["']([^"']+)["']/i);
  if(!m) return ['FALLA','missing'];
  const file = path.join(__dirname,m[1]);
  if(!fs.existsSync(file)) return ['FALLA','manifest file missing'];
  // simple JSON validation
  try{JSON.parse(fs.readFileSync(file,'utf8')); return ['OK','']; }
  catch(e){ return ['FALLA','invalid JSON']; }
}
function checkOpenGraph(html){
  const required = ['og:title','og:description','og:type','og:url','og:site_name','og:locale','og:image'];
  const missing = required.filter(k=>!new RegExp(`<meta\\s+property=[\"']${k}[\"']`, 'i').test(html));
  return [missing.length===0?'OK':'FALLA', missing.join(', ')];
}
function checkTwitterCard(html){
  const required = ['twitter:card','twitter:title','twitter:description','twitter:image'];
  const missing = required.filter(k=>!new RegExp(`<meta\\s+name=[\"']${k}[\"']`, 'i').test(html));
  return [missing.length===0?'OK':'FALLA', missing.join(', ')];
}
function checkJSONLD(html){
  const scripts = html.match(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)||[];
  const types = [];
  for(const s of scripts){
    const json = s.replace(/<[^>]+>/g,'').trim();
    try{ const obj = JSON.parse(json); if(obj['@type']) types.push(obj['@type']); }
    catch(e){}
  }
  const needed = ['Organization','WebSite','WebPage','FAQPage'];
  const missing = needed.filter(t=>!types.includes(t));
  return [missing.length===0?'OK':'FALLA', missing.join(', ')];
}
function checkGA4(html){
  // look for gtag.js with G- ID and async
  const ok = /<script\s+async[^>]*src=["'][^"']*gtag\/js\?id=G-[A-Z0-9]+["']/.test(html);
  return [ok?'OK':'FALLA',''];
}
function checkExternalLinks(html){
  const links = html.match(/<a\s+[^>]*href=["'][^"']+["'][^>]*>/gi)||[];
  for(const a of links){
    const href = a.match(/href=["']([^"']+)["']/i)[1];
    if(href.trim()==='') return ['FALLA','empty href'];
    if(/^https?:\/\//i.test(href) && !/rel=["'][^"']*noopener[^"']*["']/i.test(a)) return ['FALLA','external link missing rel'];
  }
  return ['OK',''];
}
function checkInlineStyles(html){
  return /style=/.test(html)?['FALLA','inline style present']:['OK',''];
}

function main(){
  const indexPath = path.join(__dirname,'index.html');
  const html = read(indexPath);
  if(!html){ console.error('index.html not found'); process.exit(1); }
  const checks = {
    'Title length (50‑60)': checkTitle(html),
    'Meta description length (120‑155)': checkMetaDescription(html),
    'Single <h1>': checkSingleH1(html),
    'Heading order': checkHeadingOrder(html),
    'Images alt & size': checkImages(html),
    'Text word count >=300': checkTextLength(html),
    'Lang attribute es-CO': checkLang(html),
    'Charset utf-8': checkCharset(html),
    'Viewport meta': checkViewport(html),
    'Canonical link absolute': checkCanonical(html),
    'Meta robots': checkMetaRobots(html),
    'robots.txt': checkRobotsTxt(),
    'sitemap.xml': checkSitemap(),
    '404.html noindex': check404(),
    'hreflang tags': checkHreflang(html),
    'Favicon & apple-touch-icon': checkFavicon(html),
    'manifest.webmanifest': checkManifest(html),
    'Open Graph tags': checkOpenGraph(html),
    'Twitter Card tags': checkTwitterCard(html),
    'JSON‑LD types': checkJSONLD(html),
    'GA4 snippet': checkGA4(html),
    'External links rel': checkExternalLinks(html),
    'No inline styles': checkInlineStyles(html)
  };
  console.log('# SEO Checklist Result');
  console.log('| Ítem | Estado | Detalle |');
  console.log('|------|--------|--------|');
  for(const [k,v] of Object.entries(checks)){
    console.log(`| ${k} | ${v[0]} | ${v[1]} |`);
  }
}

main();
