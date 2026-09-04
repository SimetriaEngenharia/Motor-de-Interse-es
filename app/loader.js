/* Runtime loader: compiles the Vite/React/TS app in the browser (no build step). */
(function () {
  const ENTRY = 'app/src/main.tsx';
  const REACT = '19.1.0';
  const THREE = '0.184.0';
  const EXT = ['', '.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts', '/index.js'];

  function cdn(spec) {
    if (spec === 'react') return `https://esm.sh/react@${REACT}`;
    if (spec.startsWith('react/')) return `https://esm.sh/react@${REACT}/${spec.slice(6)}`;
    if (spec === 'react-dom') return `https://esm.sh/react-dom@${REACT}?deps=react@${REACT}`;
    if (spec.startsWith('react-dom/')) return `https://esm.sh/react-dom@${REACT}/${spec.slice(10)}?deps=react@${REACT}`;
    if (spec === 'three') return `https://esm.sh/three@${THREE}`;
    if (spec.startsWith('three/')) return `https://esm.sh/three@${THREE}/${spec.slice(6)}`;
    return `https://esm.sh/${spec}?deps=react@${REACT},react-dom@${REACT},three@${THREE}`;
  }

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = () => rej(new Error('failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  let manifest = new Set();

  const files = new Map();   // url -> { code, deps:Set }
  const bare = new Map();    // spec -> namespace
  const mods = new Map();    // url -> module record

  async function fetchFirst(base, spec) {
    const cands = EXT.map((ext) => new URL(spec + ext, base).href);
    for (const u of cands) if (files.has(u)) return u;
    const conhecido = cands.find((u) => manifest.has(u));
    /* Manifesto em dia: uma requisição. Manifesto velho — quem editou no AI Studio e
     * esqueceu `npm run sync` — sondamos a rede em vez de falhar. */
    for (const url of (conhecido ? [conhecido] : cands)) {
      /* SEGUNDA CHANCE. Um soluço de rede num arquivo do manifesto derrubava o
       * app inteiro com "cannot resolve": o candidato conhecido é tentado uma
       * vez só, e um 5xx transitório bastava. Uma repetição curta resolve. */
      let r = await fetch(url).catch(() => null);
      if (!r || !r.ok) {
        await new Promise((res) => setTimeout(res, 250));
        r = await fetch(url).catch(() => null);
      }
      if (!r || !r.ok) continue;
      if (!manifest.has(url)) console.warn('[loader] fora do manifesto:', url, '— rode: npm run sync');
      return { url, text: await r.text() };
    }
    throw new Error('cannot resolve ' + spec + ' from ' + base);
  }

  function compile(code, filename) {
    const src = code.replace(/(^|[^.\w$'"`])import\s*\(/g, '$1__dynImport(');
    return Babel.transform(src, {
      filename,
      sourceMaps: false,
      presets: [
        ['typescript', { isTSX: true, allExtensions: true, allowDeclareFields: true, onlyRemoveTypeImports: false }],
        ['react', { runtime: 'automatic' }],
      ],
      plugins: [['transform-modules-commonjs', { strictNamespace: false }]],
    }).code;
  }

  const cssChunks = [];
  const pending = new Map();

  function load(spec, fromUrl) {
    const key = fromUrl + '|' + spec;
    if (!pending.has(key)) pending.set(key, loadOne(spec, fromUrl));
    return pending.get(key);
  }

  async function loadOne(spec, fromUrl) {
    const found = await fetchFirst(fromUrl, spec);
    if (typeof found === 'string') return found;
    const { url, text } = found;
    if (files.has(url)) return url;
    if (url.endsWith('.css')) {
      cssChunks.push(text.replace(/@import\s+["']tailwindcss["']\s*;?/g, ''));
      files.set(url, { code: 'module.exports = {};', deps: [] });
      return url;
    }
    const code = compile(text, url);
    const deps = [];
    const re = /(?:require|__dynImport)\(\s*["']([^"']+)["']\s*\)/g;
    let m;
    while ((m = re.exec(code))) deps.push(m[1]);
    files.set(url, { code, deps: [] });
    const resolved = {};
    const rel = [];
    for (const d of deps) {
      if (d.startsWith('.') || d.startsWith('/')) rel.push(d);
      else if (!bare.has(d)) bare.set(d, null);
    }
    await Promise.all([...new Set(rel)].map(async (d) => { resolved[d] = await load(d, url); }));
    files.get(url).deps = resolved;
    return url;
  }

  function interop(ns) {
    if (ns && ns.__esModule) return ns;
    const out = { __esModule: true };
    for (const k in ns) out[k] = ns[k];
    if (!('default' in out)) out.default = ns && ns.default !== undefined ? ns.default : ns;
    else if (out.default === undefined) out.default = ns;
    return out;
  }

  function exec(url) {
    if (mods.has(url)) return mods.get(url).exports;
    const file = files.get(url);
    const module = { exports: {} };
    mods.set(url, module);
    const require = (spec) => {
      const target = file.deps[spec];
      if (target) return exec(target);
      const ns = bare.get(spec);
      if (!ns) throw new Error('module not loaded: ' + spec);
      return ns;
    };
    const dyn = (spec) => Promise.resolve().then(() => require(spec));
    try {
      new Function('require', 'module', 'exports', '__dynImport', file.code)(require, module, module.exports, dyn);
    } catch (e) {
      mods.delete(url);
      throw new Error('error in ' + url.split('/').pop() + ': ' + e.message);
    }
    return module.exports;
  }

  async function boot(status) {
    const say = status || (() => {});
    say('Carregando compilador…');
    const appBase = new URL('app/', location.href).href;
    const [, list] = await Promise.all([
      window.Babel ? null : loadScript('https://unpkg.com/@babel/standalone@7.26.4/babel.min.js'),
      fetch(new URL('manifest.json', appBase).href).then((r) => r.json()),
    ]);
    manifest = new Set(list.map((p) => new URL(p, appBase).href));
    say('Lendo o código-fonte…');
    const entry = await load('./' + ENTRY.replace(/^app\//, ''), appBase);
    say('Baixando dependências…');
    const specs = [...bare.keys()];
    await Promise.all(specs.map(async (spec) => {
      const ns = await import(/* @vite-ignore */ cdn(spec));
      bare.set(spec, interop(ns));
    }));
    say('Aplicando estilos…');
    const style = document.createElement('style');
    style.type = 'text/tailwindcss';
    style.textContent = cssChunks.join('\n');
    document.head.appendChild(style);
    if (!window.__twLoaded) {
      window.__twLoaded = true;
      await loadScript('https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.1.14/dist/index.global.js');
    }
    say('Iniciando aplicativo…');
    // The app requests /logo.png from the server root; point it at the copied asset.
    const logo = new URL('public/logo.png', new URL('app/', location.href).href).href.replace('/app/public/', '/public/');
    const fixLogos = () => document.querySelectorAll('img[src="/logo.png"]').forEach((img) => { img.src = logo; });
    new MutationObserver(fixLogos).observe(document.documentElement, { childList: true, subtree: true });
    fixLogos();
    exec(entry);
  }

  window.SimetriaApp = { boot };
})();
