(() => {
  "use strict";
  const cfg = window.APK_STORE_CONFIG;
  const $ = id => document.getElementById(id);
  const els = {
    form: $("uploadForm"), token: $("token"), remember: $("rememberToken"),
    name: $("appName"), version: $("version"), category: $("category"),
    icon: $("iconUrl"), description: $("description"), file: $("apkFile"),
    fileLabel: $("fileLabel"), uploadBtn: $("uploadBtn"), msg: $("adminMessage"),
    progressBox: $("progressBox"), progressText: $("progressText"),
    progressPercent: $("progressPercent"), progressBar: $("progressBar"),
    loadReleasesBtn: $("loadReleasesBtn"), releaseList: $("releaseList")
  };

  const saved = localStorage.getItem("ahmed_apk_github_token") || sessionStorage.getItem("ahmed_apk_github_token");
  if (saved) {
    els.token.value = saved;
    els.remember.checked = Boolean(localStorage.getItem("ahmed_apk_github_token"));
  }

  const apiHeaders = (token, json = true) => ({
    "Accept": "application/vnd.github+json",
    "Authorization": `Bearer ${token}`,
    "X-GitHub-Api-Version": cfg.apiVersion,
    ...(json ? {"Content-Type":"application/json"} : {})
  });

  function showMessage(text, type = "") {
    els.msg.hidden = false;
    els.msg.className = `status ${type}`.trim();
    els.msg.textContent = text;
  }

  function setProgress(percent, text) {
    els.progressBox.hidden = false;
    els.progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    els.progressPercent.textContent = `${Math.round(percent)}%`;
    els.progressText.textContent = text;
  }

  function storeToken(token) {
    sessionStorage.setItem("ahmed_apk_github_token", token);
    if (els.remember.checked) localStorage.setItem("ahmed_apk_github_token", token);
    else localStorage.removeItem("ahmed_apk_github_token");
  }

  function slugify(text) {
    const latin = text.normalize("NFKD").replace(/[^\w\s.-]/g, "").trim().replace(/[\s_.]+/g, "-").replace(/-+/g, "-").toLowerCase();
    return latin || "apk";
  }

  async function githubFetch(path, options = {}) {
    const token = els.token.value.trim();
    if (!token) throw new Error("أدخل مفتاح GitHub أولًا.");
    const response = await fetch(`https://api.github.com${path}`, {
      ...options,
      headers: {...apiHeaders(token, options.body !== undefined), ...(options.headers || {})}
    });
    if (!response.ok) {
      let detail = "";
      try { detail = (await response.json()).message || ""; } catch {}
      if (response.status === 401) throw new Error("المفتاح غير صحيح أو انتهت صلاحيته.");
      if (response.status === 403) throw new Error("المفتاح لا يملك الصلاحية المطلوبة أو تم تجاوز حد API.");
      if (response.status === 422) throw new Error(`تعذر تنفيذ العملية: ${detail || "بيانات مكررة أو غير صالحة."}`);
      throw new Error(detail || `خطأ GitHub رقم ${response.status}`);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  function uploadAssetOnce(uploadUrl, file, token, attempt) {
    return new Promise((resolve, reject) => {
      const baseUrl = uploadUrl.replace(/\{\?name,label\}$/, "");
      const url = `${baseUrl}?name=${encodeURIComponent(file.name)}`;
      const xhr = new XMLHttpRequest();

      xhr.open("POST", url, true);
      xhr.withCredentials = false;
      xhr.timeout = 30 * 60 * 1000;

      // ترويسات الرفع الرسمية. لا نرسل X-GitHub-Api-Version هنا
      // لتجنب رفض طلب CORS التمهيدي في uploads.github.com.
      xhr.setRequestHeader("Accept", "application/vnd.github+json");
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.setRequestHeader("Content-Type", "application/octet-stream");

      xhr.upload.onprogress = event => {
        if (event.lengthComputable) {
          const pct = (event.loaded / event.total) * 100;
          const retryText = attempt > 1 ? ` — المحاولة ${attempt}` : "";
          setProgress(pct, `جاري رفع ${file.name}${retryText}`);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch { resolve({}); }
          return;
        }

        let message = `فشل رفع الملف: خطأ ${xhr.status}`;
        try {
          const data = JSON.parse(xhr.responseText);
          message = data.message || message;
        } catch {}
        reject(new Error(message));
      };

      xhr.onerror = () => reject(new Error(
        "تعذر الوصول إلى خادم رفع GitHub. قد يكون المتصفح أو مانع الإعلانات قد حظر uploads.github.com."
      ));
      xhr.ontimeout = () => reject(new Error("انتهت مهلة رفع الملف."));
      xhr.onabort = () => reject(new Error("تم إلغاء رفع الملف."));
      xhr.send(file);
    });
  }

  async function uploadAsset(uploadUrl, file, token) {
    const delays = [0, 2500, 6000];
    let lastError;

    for (let attempt = 1; attempt <= delays.length; attempt++) {
      if (delays[attempt - 1]) {
        setProgress(5, `إعادة محاولة الرفع ${attempt} من ${delays.length}…`);
        await new Promise(resolve => setTimeout(resolve, delays[attempt - 1]));
      }

      try {
        return await uploadAssetOnce(uploadUrl, file, token, attempt);
      } catch (error) {
        lastError = error;
        console.warn(`Upload attempt ${attempt} failed`, error);
      }
    }

    throw lastError || new Error("تعذر رفع الملف بعد عدة محاولات.");
  }

  els.file.addEventListener("change", () => {
    const file = els.file.files[0];
    els.fileLabel.textContent = file ? `${file.name} — ${(file.size / 1024 / 1024).toFixed(2)} MB` : "اضغط لاختيار ملف APK";
  });

  els.form.addEventListener("submit", async event => {
    event.preventDefault();
    els.msg.hidden = true;
    const token = els.token.value.trim();
    const file = els.file.files[0];

    if (!token || !file) return showMessage("أدخل المفتاح واختر ملف APK.", "error");
    if (!file.name.toLowerCase().endsWith(".apk")) return showMessage("يجب اختيار ملف ينتهي بـ .apk", "error");
    if (file.size >= 2 * 1024 * 1024 * 1024) return showMessage("حجم الملف يجب أن يكون أقل من 2 GiB.", "error");

    storeToken(token);
    els.uploadBtn.disabled = true;
    let release = null;

    try {
      setProgress(2, "التحقق من المفتاح…");
      await githubFetch("/user", {method:"GET", body: undefined});

      const appName = els.name.value.trim();
      const version = els.version.value.trim();
      const tag = `apk-${slugify(appName)}-${slugify(version)}-${Date.now()}`;
      const meta = {
        version,
        category: els.category.value,
        icon: els.icon.value.trim()
      };
      const body = `${els.description.value.trim()}\n\n<!--AHMED_APK_META:${JSON.stringify(meta)}-->`;

      setProgress(5, "إنشاء إصدار GitHub مؤقت…");
      release = await githubFetch(`/repos/${cfg.owner}/${cfg.repo}/releases`, {
        method: "POST",
        body: JSON.stringify({
          tag_name: tag,
          target_commitish: cfg.branch,
          name: appName,
          body,
          draft: true,
          prerelease: false
        })
      });

      await uploadAsset(release.upload_url, file, token);

      setProgress(97, "نشر التطبيق في الموقع…");
      await githubFetch(`/repos/${cfg.owner}/${cfg.repo}/releases/${release.id}`, {
        method: "PATCH",
        body: JSON.stringify({draft:false})
      });

      setProgress(100, "اكتمل الرفع والنشر");
      showMessage("تم رفع التطبيق ونشره بنجاح. قد يحتاج ظهوره في الصفحة الرئيسية بضع ثوانٍ.", "success");
      els.form.reset();
      els.token.value = token;
      els.remember.checked = Boolean(localStorage.getItem("ahmed_apk_github_token"));
      els.fileLabel.textContent = "اضغط لاختيار ملف APK";
      loadReleases();
    } catch (error) {
      console.error(error);
      if (release && release.id) {
        try {
          await githubFetch(`/repos/${cfg.owner}/${cfg.repo}/releases/${release.id}`, {method:"DELETE", body: undefined});
        } catch {}
      }
      showMessage(error.message || "حدث خطأ غير متوقع.", "error");
      els.progressText.textContent = "توقف الرفع";
    } finally {
      els.uploadBtn.disabled = false;
    }
  });

  async function loadReleases() {
    els.releaseList.innerHTML = `<div class="status loading">جاري تحميل القائمة…</div>`;
    try {
      storeToken(els.token.value.trim());
      const releases = await githubFetch(`/repos/${cfg.owner}/${cfg.repo}/releases?per_page=100`, {method:"GET", body: undefined});
      const published = releases.filter(r => !r.draft);
      if (!published.length) {
        els.releaseList.innerHTML = `<div class="empty">لا توجد تطبيقات منشورة بعد.</div>`;
        return;
      }
      els.releaseList.innerHTML = published.map(r => {
        const apk = (r.assets || []).find(a => a.name.toLowerCase().endsWith(".apk"));
        const size = apk ? `${(apk.size / 1024 / 1024).toFixed(2)} MB` : "بدون APK";
        return `<div class="release-item">
          <div><strong>${escapeHtml(r.name || r.tag_name)}</strong><small>${escapeHtml(size)} — ${escapeHtml(r.tag_name)}</small></div>
          <button class="danger-btn" data-id="${r.id}" type="button">حذف التطبيق</button>
        </div>`;
      }).join("");
      els.releaseList.querySelectorAll(".danger-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
          if (!confirm("هل أنت متأكد من حذف التطبيق وإصداره؟")) return;
          btn.disabled = true;
          try {
            await githubFetch(`/repos/${cfg.owner}/${cfg.repo}/releases/${btn.dataset.id}`, {method:"DELETE", body: undefined});
            await loadReleases();
          } catch (error) {
            alert(error.message);
            btn.disabled = false;
          }
        });
      });
    } catch (error) {
      els.releaseList.innerHTML = `<div class="status error">${escapeHtml(error.message)}</div>`;
    }
  }

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  }

  els.loadReleasesBtn.addEventListener("click", loadReleases);
})();