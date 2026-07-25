(() => {
  "use strict";
  const cfg = window.APK_STORE_CONFIG;
  const els = {
    status: document.getElementById("status"),
    grid: document.getElementById("appsGrid"),
    search: document.getElementById("searchInput"),
    refresh: document.getElementById("refreshBtn"),
    categories: document.getElementById("categories"),
    count: document.getElementById("resultCount")
  };
  let allApps = [];
  let selectedCategory = "الكل";

  document.getElementById("year").textContent = new Date().getFullYear();

  const escapeHtml = (value = "") =>
    String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));

  const humanSize = bytes => {
    if (!Number.isFinite(bytes)) return "—";
    const units = ["B","KB","MB","GB"];
    let size = bytes, i = 0;
    while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
    return `${size.toFixed(i > 1 ? 2 : 1)} ${units[i]}`;
  };

  function extractMeta(body = "") {
    const match = body.match(/<!--AHMED_APK_META:(\{[\s\S]*?\})-->/);
    if (!match) return {};
    try { return JSON.parse(match[1]); } catch { return {}; }
  }

  function cleanDescription(body = "") {
    const clean = body.replace(/<!--AHMED_APK_META:[\s\S]*?-->/g, "").trim();
    // نعرض أول فقرة فقط داخل البطاقة، وتبقى بقية التفاصيل في صفحة Release.
    return clean.split(/\n\s*\n/)[0].trim();
  }

  async function loadApps() {
    els.status.hidden = false;
    els.status.className = "status loading";
    els.status.textContent = "جاري جلب التطبيقات من GitHub…";
    els.grid.hidden = true;

    try {
      const response = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/releases?per_page=100`, {
        headers: {
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": cfg.apiVersion
        },
        cache: "no-store"
      });
      if (!response.ok) throw new Error(`GitHub API: ${response.status}`);
      const releases = await response.json();

      allApps = releases
        .filter(r => !r.draft)
        .flatMap(release => {
          const meta = extractMeta(release.body || "");
          const description = cleanDescription(release.body || "");
          return (release.assets || [])
            .filter(asset => asset.name.toLowerCase().endsWith(".apk") && asset.state === "uploaded")
            .map(asset => ({
              id: asset.id,
              name: release.name || release.tag_name,
              version: meta.version || release.tag_name,
              category: meta.category || "أخرى",
              icon: meta.icon || "",
              description: description || "ملف APK متاح للتحميل المباشر.",
              size: asset.size,
              downloads: asset.download_count,
              url: asset.browser_download_url,
              published: release.published_at || release.created_at,
              filename: asset.name
            }));
        })
        .sort((a,b) => new Date(b.published) - new Date(a.published));

      buildCategories();
      applyFilters();
      els.status.hidden = true;
      els.grid.hidden = false;
    } catch (error) {
      console.error(error);
      els.status.className = "status error";
      els.status.textContent = "تعذر جلب التطبيقات الآن. تأكد من أن المستودع عام وأن الاتصال بالإنترنت يعمل.";
      els.count.textContent = "تعذر التحميل";
    }
  }

  function buildCategories() {
    const cats = ["الكل", ...new Set(allApps.map(a => a.category).filter(Boolean))];
    els.categories.innerHTML = cats.map(cat =>
      `<button class="category-btn ${cat === selectedCategory ? "active" : ""}" data-category="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`
    ).join("");
    els.categories.querySelectorAll("button").forEach(btn => {
      btn.addEventListener("click", () => {
        selectedCategory = btn.dataset.category;
        buildCategories();
        applyFilters();
      });
    });
  }

  function applyFilters() {
    const q = els.search.value.trim().toLowerCase();
    const filtered = allApps.filter(app => {
      const matchesCategory = selectedCategory === "الكل" || app.category === selectedCategory;
      const haystack = `${app.name} ${app.description} ${app.category} ${app.version}`.toLowerCase();
      return matchesCategory && haystack.includes(q);
    });
    render(filtered);
  }

  function render(apps) {
    els.count.textContent = `${apps.length} تطبيق`;
    if (!apps.length) {
      els.grid.innerHTML = `<div class="status">لا توجد تطبيقات مطابقة حاليًا.</div>`;
      return;
    }
    els.grid.innerHTML = apps.map(app => {
      const first = escapeHtml((app.name || "A").trim().charAt(0).toUpperCase());
      const icon = app.icon
        ? `<img class="app-icon" src="${escapeHtml(app.icon)}" alt="" loading="lazy" onerror="this.outerHTML='<span class=&quot;app-icon fallback-icon&quot;>${first}</span>'">`
        : `<span class="app-icon fallback-icon">${first}</span>`;
      const date = app.published ? new Intl.DateTimeFormat("ar-SA", {dateStyle:"medium"}).format(new Date(app.published)) : "—";
      return `
        <article class="app-card">
          <div class="app-top">
            ${icon}
            <div>
              <h3>${escapeHtml(app.name)}</h3>
              <div class="version">الإصدار ${escapeHtml(app.version)}</div>
            </div>
          </div>
          <span class="badge">${escapeHtml(app.category)}</span>
          <p class="description">${escapeHtml(app.description)}</p>
          <div class="meta-row">
            <span>${humanSize(app.size)}</span>
            <span>${Number(app.downloads || 0).toLocaleString("ar-SA")} تنزيل</span>
          </div>
          <a class="download-btn" href="${escapeHtml(app.url)}" download>تحميل APK مباشر</a>
        </article>`;
    }).join("");
  }

  els.search.addEventListener("input", applyFilters);
  els.refresh.addEventListener("click", loadApps);
  loadApps();
})();