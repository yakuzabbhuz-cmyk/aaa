/**
 * DL Chat — Download Page JavaScript
 * DEATH LEGION Team — Proprietary & Confidential
 * © 2025 DL Chat. All rights reserved.
 *
 * NOTICE: This software is proprietary and confidential.
 * Unauthorized copying, distribution, modification, or reverse engineering
 * is strictly prohibited and may result in legal action.
 */

const API_BASE = 'https://dl-chat-api.death-legion-dlchat.workers.dev';
const LINUX_ZIP_URL = 'https://dl-chat-download.pages.dev/builds/dl-chat-linux-x64-1.0.0.zip';

// ─── Download URLs (updated dynamically from API) ────────────────────────────
const DOWNLOAD_URLS = {
  android: '#',
  ios: '#',
  windows: '#',
  macos: '#',
  linux: LINUX_ZIP_URL,
  linux_zip: LINUX_ZIP_URL,
};

// ─── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initCursorGlow();
  initNavbar();
  initScrollAnimations();
  initParticles();
  initCounters();
  initTabs();
  initHamburger();
  fetchVersions();
  checkApiStatus();
  initQR();
  initCodeCycle();
});

// ─── Cursor Glow ─────────────────────────────────────────────────────────────
function initCursorGlow() {
  const glow = document.getElementById('cursorGlow');
  if (!glow) return;
  let x = 0, y = 0, tx = 0, ty = 0;

  document.addEventListener('mousemove', (e) => {
    tx = e.clientX; ty = e.clientY;
  });

  function animate() {
    x += (tx - x) * 0.12;
    y += (ty - y) * 0.12;
    glow.style.left = x + 'px';
    glow.style.top = y + 'px';
    requestAnimationFrame(animate);
  }
  animate();
}

// ─── Navbar ──────────────────────────────────────────────────────────────────
function initNavbar() {
  const navbar = document.getElementById('navbar');
  const onScroll = () => {
    navbar.classList.toggle('scrolled', window.scrollY > 60);
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  // Active link highlighting
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-links a');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        navLinks.forEach(link => {
          link.classList.remove('active-nav');
          if (link.getAttribute('href') === `#${id}`) {
            link.classList.add('active-nav');
          }
        });
      }
    });
  }, { rootMargin: '-40% 0px -40% 0px' });

  sections.forEach(s => observer.observe(s));

  // Smooth close on link click (mobile)
  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      document.getElementById('navLinks').classList.remove('open');
      document.getElementById('hamburger').classList.remove('active');
    });
  });
}

// ─── Hamburger Menu ──────────────────────────────────────────────────────────
function initHamburger() {
  const btn = document.getElementById('hamburger');
  const menu = document.getElementById('navLinks');
  if (!btn || !menu) return;

  btn.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    btn.classList.toggle('active', open);
    document.body.style.overflow = open ? 'hidden' : '';
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!btn.contains(e.target) && !menu.contains(e.target)) {
      menu.classList.remove('open');
      btn.classList.remove('active');
      document.body.style.overflow = '';
    }
  });
}

// ─── Scroll Animations ───────────────────────────────────────────────────────
function initScrollAnimations() {
  const elements = document.querySelectorAll('[data-animate]');
  if (!elements.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const delay = entry.target.dataset.delay || 0;
        setTimeout(() => {
          entry.target.classList.add('is-visible');
        }, parseInt(delay));
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });

  elements.forEach(el => observer.observe(el));
}

// ─── Particle Canvas ─────────────────────────────────────────────────────────
function initParticles() {
  const canvas = document.getElementById('particleCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let particles = [];
  let animId;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  class Particle {
    constructor() { this.reset(); }
    reset() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.size = Math.random() * 2 + 0.5;
      this.speedX = (Math.random() - 0.5) * 0.3;
      this.speedY = (Math.random() - 0.5) * 0.3;
      this.opacity = Math.random() * 0.4 + 0.1;
      this.hue = Math.random() > 0.5 ? 265 : 200; // purple or cyan
    }
    update() {
      this.x += this.speedX;
      this.y += this.speedY;
      if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
        this.reset();
      }
    }
    draw() {
      ctx.save();
      ctx.globalAlpha = this.opacity;
      ctx.fillStyle = `hsl(${this.hue}, 70%, 60%)`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function init() {
    particles = Array.from({ length: 80 }, () => new Particle());
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw connections
    particles.forEach((p, i) => {
      particles.slice(i + 1).forEach(p2 => {
        const dist = Math.hypot(p.x - p2.x, p.y - p2.y);
        if (dist < 120) {
          ctx.save();
          ctx.globalAlpha = (1 - dist / 120) * 0.08;
          ctx.strokeStyle = '#7c3aed';
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
          ctx.restore();
        }
      });
    });

    particles.forEach(p => { p.update(); p.draw(); });
    animId = requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener('resize', () => { resize(); init(); });
  init();
  draw();
}

// ─── Counter Animation ───────────────────────────────────────────────────────
function initCounters() {
  const counters = document.querySelectorAll('[data-count]');
  if (!counters.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const target = parseInt(el.dataset.count);
        let current = 0;
        const step = target / 60;
        const timer = setInterval(() => {
          current = Math.min(current + step, target);
          el.textContent = Math.floor(current);
          if (current >= target) clearInterval(timer);
        }, 16);
        observer.unobserve(el);
      }
    });
  }, { threshold: 0.5 });

  counters.forEach(c => observer.observe(c));
}

// ─── Feature Tabs ────────────────────────────────────────────────────────────
function initTabs() {
  const btns = document.querySelectorAll('.tab-btn');
  const contents = document.querySelectorAll('.tab-content');

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      btns.forEach(b => b.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const content = document.querySelector(`[data-tab-content="${tab}"]`);
      if (content) {
        content.classList.add('active');
        // Re-trigger scroll animations inside the new tab
        content.querySelectorAll('[data-animate]').forEach(el => {
          el.classList.add('is-visible');
        });
      }
    });
  });
}

// ─── QR Code Platform Switch ─────────────────────────────────────────────────
function initQR() {
  const btns = document.querySelectorAll('.qr-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

// ─── Code Cycle Animation ────────────────────────────────────────────────────
const CODE_EXAMPLES = [
  {
    lang: 'JavaScript',
    filename: 'my-bot.js',
    code: `<span class="code-comment">// DL Chat Bot — Send message on join</span>
<span class="code-keyword">const</span> <span class="code-var">bot</span> = <span class="code-keyword">new</span> <span class="code-var">DLBot</span>({ token: <span class="code-str">'BOT_TOKEN'</span> });

<span class="code-var">bot</span>.<span class="code-func">on</span>(<span class="code-str">'member_join'</span>, <span class="code-keyword">async</span> (<span class="code-var">ctx</span>) =&gt; {
  <span class="code-keyword">await</span> <span class="code-var">ctx</span>.<span class="code-func">send</span>(<span class="code-str">\`👋 Welcome <span class="code-tmpl">\${ctx.user.name}</span>!\`</span>, {
    keyboard: [[
      { text: <span class="code-str">'📜 Rules'</span>, callback: <span class="code-str">'rules'</span> },
      { text: <span class="code-str">'🎮 Intro'</span>, callback: <span class="code-str">'intro'</span> }
    ]]
  });
});
<span class="code-var">bot</span>.<span class="code-func">start</span>(); <span class="code-comment">// 🚀 Live!</span>`
  },
  {
    lang: 'Python',
    filename: 'weather_bot.py',
    code: `<span class="code-comment"># DL Chat Bot — Weather lookup</span>
<span class="code-keyword">from</span> <span class="code-var">dlchat</span> <span class="code-keyword">import</span> <span class="code-var">DLBot</span>
<span class="code-keyword">import</span> <span class="code-var">httpx</span>

<span class="code-var">bot</span> = <span class="code-var">DLBot</span>(token=<span class="code-str">"BOT_TOKEN"</span>)

<span class="code-keyword">@</span><span class="code-var">bot</span>.<span class="code-func">command</span>(<span class="code-str">"weather"</span>)
<span class="code-keyword">async def</span> <span class="code-func">weather</span>(<span class="code-var">ctx</span>, <span class="code-var">city</span>: <span class="code-var">str</span>):
    <span class="code-var">data</span> = <span class="code-keyword">await</span> <span class="code-var">httpx</span>.<span class="code-func">get</span>(
        <span class="code-str">f"https://wttr.in/<span class="code-tmpl">{city}</span>?format=3"</span>
    )
    <span class="code-keyword">await</span> <span class="code-var">ctx</span>.<span class="code-func">reply</span>(<span class="code-str">f"🌤️ <span class="code-tmpl">{data.text}</span>"</span>)

<span class="code-var">bot</span>.<span class="code-func">run</span>() <span class="code-comment"># async event loop</span>`
  },
  {
    lang: 'TypeScript',
    filename: 'webhook.ts',
    code: `<span class="code-comment">// DL Chat — Webhook receiver</span>
<span class="code-keyword">import</span> { <span class="code-var">DLWebhook</span> } <span class="code-keyword">from</span> <span class="code-str">'@dlchat/bot-sdk'</span>;
<span class="code-keyword">import</span> { <span class="code-var">createHmac</span> } <span class="code-keyword">from</span> <span class="code-str">'crypto'</span>;

<span class="code-keyword">const</span> <span class="code-var">wh</span> = <span class="code-keyword">new</span> <span class="code-var">DLWebhook</span>({
  secret: <span class="code-var">process</span>.env.<span class="code-var">WEBHOOK_SECRET</span>!
});

<span class="code-var">wh</span>.<span class="code-func">on</span>(<span class="code-str">'message.new'</span>, (<span class="code-var">event</span>) =&gt; {
  <span class="code-var">console</span>.<span class="code-func">log</span>(<span class="code-str">\`New msg: <span class="code-tmpl">\${event.content}</span>\`</span>);
  <span class="code-comment">// Forward to your system...</span>
});

<span class="code-var">app</span>.<span class="code-func">post</span>(<span class="code-str">'/webhook'</span>, <span class="code-var">wh</span>.<span class="code-func">handler</span>());</span>`
  }
];

function initCodeCycle() {
  const codeEl = document.getElementById('codeDisplay');
  const filenameEl = document.querySelector('.code-filename');
  const langEl = document.querySelector('.code-lang');
  if (!codeEl) return;

  let idx = 0;
  setInterval(() => {
    idx = (idx + 1) % CODE_EXAMPLES.length;
    const ex = CODE_EXAMPLES[idx];
    codeEl.style.opacity = '0';
    setTimeout(() => {
      codeEl.innerHTML = ex.code;
      if (filenameEl) filenameEl.textContent = ex.filename;
      if (langEl) langEl.textContent = ex.lang;
      codeEl.style.opacity = '1';
    }, 300);
    codeEl.style.transition = 'opacity 0.3s';
  }, 5000);
}

// ─── Fetch Live Versions from API ────────────────────────────────────────────
async function fetchVersions() {
  try {
    const res = await fetch(`${API_BASE}/api/v1/updates/latest`, {
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.success || !data.data) return;

    const { android, ios, windows, macos, linux } = data.data;

    // Update version badges
    updateVersion('version-android', android?.latest);
    updateVersion('version-ios', ios?.latest);
    updateVersion('version-windows', windows?.latest);
    updateVersion('version-macos', macos?.latest);
    updateVersion('version-linux', linux?.latest);
    updateVersion('heroBadgeVersion', android?.latest || windows?.latest, true);

    // Update download URLs
    if (android?.url && android.url !== '#') {
      DOWNLOAD_URLS.android = android.url;
      updateDownloadLink('dl-android', android.url, android.size_bytes);
      updateDownloadLink('dl-android-2', android.url);
      updateSize('size-android', android.size_bytes);
    }
    if (windows?.url && windows.url !== '#') {
      DOWNLOAD_URLS.windows = windows.url;
      updateDownloadLink('dl-windows', windows.url, windows.size_bytes);
      updateDownloadLink('dl-windows-2', windows.url);
      updateSize('size-windows', windows.size_bytes);
    }
    if (macos?.url && macos.url !== '#') {
      DOWNLOAD_URLS.macos = macos.url;
      updateDownloadLink('dl-macos', macos.url);
      updateDownloadLink('dl-macos-2', macos.url);
      updateSize('size-macos', macos.size_bytes);
    }
    if (linux?.url && linux.url !== '#') {
      DOWNLOAD_URLS.linux = linux.url;
    }

    // Linux ZIP always set
    updateDownloadLink('dl-linux', DOWNLOAD_URLS.linux_zip);
    updateDownloadLink('dl-linux-2', DOWNLOAD_URLS.linux_zip);
    updateDownloadLink('dl-linux-zip', DOWNLOAD_URLS.linux_zip);
    updateSize('size-linux', 107 * 1024 * 1024);

  } catch (e) {
    console.warn('[DL Chat] Failed to fetch versions:', e);
  }
}

function updateVersion(id, version, isBadge = false) {
  const el = document.getElementById(id);
  if (!el || !version) return;
  el.textContent = isBadge ? `v${version}` : `v${version}`;
}

function updateDownloadLink(id, url, bytes) {
  const el = document.getElementById(id);
  if (!el || !url || url === '#') return;
  el.href = url;
  if (bytes && el.dataset.size !== 'set') {
    el.dataset.size = 'set';
  }
}

function updateSize(id, bytes) {
  const el = document.getElementById(id);
  if (!el || !bytes) return;
  const mb = (bytes / 1024 / 1024).toFixed(0);
  el.textContent = `~${mb} MB`;
}

function formatBytes(bytes) {
  const mb = bytes / 1024 / 1024;
  return mb >= 1000 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
}

// ─── API Status Check ─────────────────────────────────────────────────────────
async function checkApiStatus() {
  const dot = document.getElementById('apiStatusDot');
  const text = document.getElementById('apiStatusText');
  if (!dot || !text) return;

  try {
    const start = Date.now();
    const res = await fetch(`${API_BASE}/health`);
    const latency = Date.now() - start;
    if (res.ok) {
      const data = await res.json();
      dot.classList.add('online');
      text.textContent = `All systems operational · ${latency}ms · DB: ${data.services?.database || 'ok'} · KV: ${data.services?.kv || 'ok'}`;
    } else {
      throw new Error('Not OK');
    }
  } catch (e) {
    dot.classList.add('offline');
    text.textContent = 'API status unavailable';
  }
}

// ─── Platform Auto-Detect Download ───────────────────────────────────────────
(function autoDetectPlatform() {
  const ua = navigator.userAgent.toLowerCase();
  const platform = navigator.platform?.toLowerCase() || '';

  let detected = '';
  if (/android/.test(ua)) detected = 'android';
  else if (/iphone|ipad|ipod/.test(ua)) detected = 'ios';
  else if (/win/.test(platform) || /windows/.test(ua)) detected = 'windows';
  else if (/mac/.test(platform) || /macintosh/.test(ua)) detected = 'macos';
  else if (/linux/.test(platform)) detected = 'linux';

  if (detected) {
    // Highlight the matching platform card
    const card = document.querySelector(`[data-platform="${detected}"]`);
    if (card) {
      card.style.borderColor = 'rgba(16,185,129,0.4)';
      const badge = document.createElement('span');
      badge.className = 'platform-badge badge-stable';
      badge.textContent = '✓ Your Platform';
      badge.style.marginLeft = 'auto';
      const header = card.querySelector('.platform-header');
      if (header) header.appendChild(badge);
    }
  }
})();

// ─── Smooth Scroll Enhancement ───────────────────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    const href = this.getAttribute('href');
    if (href === '#') return;
    const target = document.querySelector(href);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

// ─── Keyboard Shortcuts ───────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  // Cmd/Ctrl + K — focus nav
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    document.getElementById('download')?.scrollIntoView({ behavior: 'smooth' });
  }
});

// ─── Performance: Defer non-critical ─────────────────────────────────────────
if ('requestIdleCallback' in window) {
  requestIdleCallback(() => {
    // Prefetch download links
    Object.values(DOWNLOAD_URLS).forEach(url => {
      if (url && url !== '#') {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = url;
        document.head.appendChild(link);
      }
    });
  });
}

console.log('%c DL Chat ', 'background: #7c3aed; color: white; font-size: 16px; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
console.log('%c© 2025 DEATH LEGION Team — Proprietary Software ', 'color: #a78bfa; font-size: 12px;');
console.log('%cUnauthorized copying or distribution is prohibited.', 'color: #ef4444; font-size: 11px;');
