(function () {
  function withBasePath(path) {
    var base = (window.__notepubBaseURL || "").replace(/\/+$/, "");
    if (!path) return base || "/";
    if (/^https?:\/\//.test(path)) return path;
    if (path.charAt(0) !== "/") path = "/" + path;
    return (base || "") + path;
  }

  function onIdle(fn) {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(fn, { timeout: 1200 });
      return;
    }
    window.setTimeout(fn, 350);
  }

  function loadScript(src, attrs) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = src;
      script.async = true;
      if (attrs) {
        Object.keys(attrs).forEach(function (key) {
          script.setAttribute(key, attrs[key]);
        });
      }
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error("Failed to load script: " + src)); };
      document.head.appendChild(script);
    });
  }

  function initCodeHighlighting(scope) {
    var root = scope || document;
    var blocks = root.querySelectorAll(".prose pre code");
    if (!blocks.length) return;

    blocks.forEach(function (code) {
      var cls = code.className || "";
      if (!/\blanguage-/.test(cls)) {
        code.classList.add("language-none");
      }
    });

    function highlightNow() {
      if (!window.Prism || typeof window.Prism.highlightAllUnder !== "function") return;
      window.Prism.highlightAllUnder(root);
    }

    if (window.Prism) {
      highlightNow();
      return;
    }

    loadScript("https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-core.min.js")
      .then(function () {
        return loadScript(
          "https://cdn.jsdelivr.net/npm/prismjs@1.29.0/plugins/autoloader/prism-autoloader.min.js",
          { "data-autoloader-path": "https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/" }
        );
      })
      .then(highlightNow)
      .catch(function () {
        // Fallback: keep default pre/code styles without syntax highlighting.
      });
  }

  function markExternalLinks(scope) {
    var root = scope || document;
    var links = root.querySelectorAll(".prose a[href]");
    if (!links.length) return;
    links.forEach(function (link) {
      if (link.dataset.externalMarked === "1") return;
      link.dataset.externalMarked = "1";

      var href = link.getAttribute("href") || "";
      if (!href || href.indexOf("#") === 0 || href.indexOf("mailto:") === 0 || href.indexOf("tel:") === 0) {
        return;
      }
      var url;
      try {
        url = new URL(href, window.location.href);
      } catch (e) {
        return;
      }
      var isHttp = /^https?:$/i.test(url.protocol);
      if (isHttp && url.origin !== window.location.origin) {
        link.classList.add("is-external");
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      } else {
        link.classList.remove("is-external");
      }
    });
  }

  function initHeadingAnchors(scope) {
    var root = scope || document;
    var headings = root.querySelectorAll(".prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6");
    if (!headings.length) return;

    var cyrMap = {
      "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
      "ж": "zh", "з": "z", "и": "i", "й": "i", "к": "k", "л": "l", "м": "m",
      "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
      "ф": "f", "х": "h", "ц": "c", "ч": "ch", "ш": "sh", "щ": "shch",
      "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya"
    };

    function slugify(text) {
      var s = (text || "").toLowerCase().trim();
      var out = "";
      for (var i = 0; i < s.length; i++) {
        var ch = s.charAt(i);
        out += Object.prototype.hasOwnProperty.call(cyrMap, ch) ? cyrMap[ch] : ch;
      }
      out = out
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9\s-]/g, " ")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      return out;
    }

    var used = Object.create(null);
    headings.forEach(function (h) {
      if (h.id) {
        used[h.id] = true;
        return;
      }
      var base = slugify(h.textContent || "");
      if (!base) return;
      var id = base;
      var n = 2;
      while (used[id] || document.getElementById(id)) {
        id = base + "-" + n;
        n += 1;
      }
      h.id = id;
      used[id] = true;
    });
  }

  function initSearchModal() {
    var modal = document.querySelector("[data-search-modal]");
    var openBtn = document.querySelector("[data-search-open]");
    var closeBtns = document.querySelectorAll("[data-search-close]");
    var input = document.querySelector("[data-search-input]");
    var results = document.querySelector("[data-search-results]");

    if (!modal || !openBtn) return;

    var inited = false;
    var timeout;
    var staticIndexPromise = null;

    function openModal() {
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      if (!inited) {
        initSearchLogic();
        inited = true;
      }
      if (input) input.focus();
    }

    function closeModal() {
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
    }

    function renderItems(items) {
      if (!results) return;
      if (!items || items.length === 0) {
        results.innerHTML = '<p class="muted">Пока ничего не найдено.</p>';
        return;
      }
      var html = "<ul>";
      items.forEach(function (item) {
        var title = item.title || "";
        var path = withBasePath(item.path || "");
        var snippet = item.snippet || "";
        var thumb = item.image || item.thumbnail || "/assets/placeholder.svg";
        if (!/^https?:\/\//.test(thumb)) thumb = withBasePath(thumb);
        html += '<li><a class="search-item-card" href="' + path + '">';
        html += '<img class="search-item-thumb" src="' + thumb + '" alt="" loading="lazy" decoding="async">';
        html += '<span class="search-item-body"><span class="search-item-title">' + title + "</span>";
        if (snippet) html += '<span class="search-item-snippet muted">' + snippet + "</span>";
        html += "</span></a></li>";
      });
      html += "</ul>";
      results.innerHTML = html;
    }

    function getStaticIndex() {
      if (staticIndexPromise) return staticIndexPromise;
      staticIndexPromise = fetch(withBasePath("/search.json"))
        .then(function (res) { return res.json(); })
        .then(function (data) { return data.items || []; })
        .catch(function () { return []; });
      return staticIndexPromise;
    }

    function fetchStatic(query) {
      return getStaticIndex().then(function (all) {
        var q = query.toLowerCase();
        var items = all.filter(function (item) {
          return (item.title || "").toLowerCase().indexOf(q) !== -1 ||
            (item.snippet || "").toLowerCase().indexOf(q) !== -1;
        }).slice(0, 10);
        renderItems(items);
      });
    }

    function fetchServer(query) {
      return fetch(withBasePath("/v1/search") + "?q=" + encodeURIComponent(query))
        .then(function (res) { return res.json(); })
        .then(function (data) { renderItems(data.items || []); })
        .catch(function () { renderItems([]); });
    }

    function runSearch(query) {
      if (!query || query.length < 2) {
        renderItems([]);
        return;
      }
      if (window.__notepubSearchMode === "static") {
        fetchStatic(query);
      } else {
        fetchServer(query);
      }
    }

    function initSearchLogic() {
      if (!input) return;
      input.addEventListener("input", function () {
        var q = input.value.trim();
        clearTimeout(timeout);
        timeout = setTimeout(function () {
          runSearch(q);
        }, 180);
      });
    }

    openBtn.addEventListener("click", openModal);
    closeBtns.forEach(function (btn) {
      btn.addEventListener("click", closeModal);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeModal();
    });
  }

  function initHubFilters() {
    var filterWrap = document.querySelector("[data-hub-filters]");
    if (!filterWrap) return;
    var cards = Array.prototype.slice.call(document.querySelectorAll("[data-article-card]"));
    if (!cards.length) return;
    var titleEl = document.querySelector("[data-blog-title]");
    var descEl = document.querySelector("[data-blog-description]");

    function setActive(btn) {
      var buttons = filterWrap.querySelectorAll("[data-hub]");
      buttons.forEach(function (button) {
        button.classList.toggle("is-active", button === btn);
      });
    }

    function applyFilter(hub) {
      cards.forEach(function (card) {
        var hubs = (card.getAttribute("data-hubs") || "").split(/\s+/).filter(Boolean);
        var matches = hub === "all" || hubs.indexOf(hub) !== -1;
        card.classList.toggle("is-hidden", !matches);
      });
    }

    function applyHeader(btn) {
      if (!titleEl || !descEl || !btn) return;
      var title = btn.getAttribute("data-hub-title") || "Последние публикации по всем хабам";
      var desc = btn.getAttribute("data-hub-description") || "Выберите хаб, чтобы отфильтровать статьи.";
      titleEl.textContent = title;
      descEl.textContent = desc;
      descEl.style.display = "";
    }

    filterWrap.addEventListener("click", function (event) {
      var target = event.target;
      if (!target || !target.hasAttribute("data-hub")) return;
      var hub = target.getAttribute("data-hub");
      setActive(target);
      applyFilter(hub);
      applyHeader(target);
    });
  }

  function initMobileNav() {
    var navPanel = document.querySelector("[data-nav-panel]");
    var navOpen = document.querySelector("[data-nav-open]");
    var navCloseBtns = document.querySelectorAll("[data-nav-close]");
    var header = document.querySelector(".site-header");
    if (!navPanel || !navOpen || !header) return;

    function lockBodyScroll() {
      document.body.classList.add("nav-open");
    }

    function unlockBodyScroll() {
      document.body.classList.remove("nav-open");
    }

    function openNav() {
      navPanel.classList.add("is-open");
      navPanel.setAttribute("aria-hidden", "false");
      lockBodyScroll();
      navOpen.classList.add("is-open");
      navOpen.setAttribute("aria-label", "Закрыть навигацию");
    }

    function closeNav() {
      navPanel.classList.remove("is-open");
      navPanel.setAttribute("aria-hidden", "true");
      unlockBodyScroll();
      navOpen.classList.remove("is-open");
      navOpen.setAttribute("aria-label", "Открыть навигацию");
    }

    function toggleNav() {
      if (navPanel.classList.contains("is-open")) {
        closeNav();
      } else {
        openNav();
      }
    }

    navOpen.addEventListener("click", toggleNav);
    navCloseBtns.forEach(function (btn) {
      btn.addEventListener("click", closeNav);
    });

    header.addEventListener("click", function (event) {
      var target = event.target;
      if (!target) return;
      var button = target.closest("a, button");
      if (!button) return;
      if (button.hasAttribute("data-nav-open")) return;
      closeNav();
    });

    function setHeaderHeight() {
      document.documentElement.style.setProperty("--header-height", header.offsetHeight + "px");
    }

    setHeaderHeight();
    window.addEventListener("resize", setHeaderHeight);
  }

  function parseNpEmbedConfig(raw) {
    var config = {};
    if (!raw) return config;
    raw.split(/\r?\n/).forEach(function (line) {
      var trimmed = line.trim();
      if (!trimmed) return;
      var idx = trimmed.indexOf(":");
      if (idx <= 0) return;
      var key = trimmed.slice(0, idx).trim().toLowerCase();
      var value = trimmed.slice(idx + 1).trim();
      if (!value) return;
      config[key] = value;
    });
    return config;
  }

  function initMarkdownEmbeds(scope) {
    var root = scope || document;
    var blocks = root.querySelectorAll("pre > code.language-np-embed");
    if (!blocks.length) return;

    blocks.forEach(function (code) {
      var pre = code.parentElement;
      if (!pre || pre.dataset.embedInited === "1") return;
      pre.dataset.embedInited = "1";

      var cfg = parseNpEmbedConfig(code.textContent || "");
      var id = (cfg.id || "").toLowerCase();

      // Allow only simple slug-like ids to avoid path injection.
      if (!/^[a-z0-9-]+$/.test(id)) return;

      var title = cfg.title || ("Animation: " + id);
      var src = withBasePath("/assets/animations/" + id + "/index.html?motion=on");

      var wrapper = document.createElement("div");
      wrapper.className = "np-embed";

      var iframe = document.createElement("iframe");
      iframe.className = "np-embed-frame";
      iframe.src = src;
      iframe.title = title;
      iframe.loading = "lazy";
      iframe.referrerPolicy = "no-referrer";
      // Needed for fetch/XHR to same-site assets from inside the sandboxed iframe.
      iframe.sandbox = "allow-scripts allow-same-origin";
      iframe.style.width = "100%";
      iframe.style.aspectRatio = "1 / 1";
      iframe.style.border = "none";
      iframe.style.display = "block";
      iframe.style.background = "#fff";

      wrapper.appendChild(iframe);
      pre.replaceWith(wrapper);
    });
  }

  function initAgencyAnalyzer() {
    var root = document.querySelector("[data-agency-analyzer]");
    if (!root) return;

    var endpoint = root.getAttribute("data-endpoint") || "";
    var form = root.querySelector("[data-aa-form]");
    var textArea = root.querySelector("[data-aa-text]");
    var inputShell = root.querySelector("[data-aa-input-shell]");
    var counter = root.querySelector("[data-aa-char-count]");
    var submitRow = root.querySelector("[data-aa-submit-row]");
    var output = root.querySelector("[data-aa-output]");
    var loader = root.querySelector("[data-aa-loader]");
    var result = root.querySelector("[data-aa-result]");
    var sourceTextEl = root.querySelector("[data-aa-source-text]");
    var resultText = root.querySelector("[data-aa-result-text]");
    var resultAnalysis = root.querySelector("[data-aa-result-analysis]");
    var retryBtn = root.querySelector("[data-aa-retry]");
    var retryWrap = root.querySelector("[data-aa-retry-wrap]");
    var errorBox = root.querySelector("[data-aa-error]");
    var creatorLink = root.querySelector("[data-aa-creator-link]");

    var filterWrap = root.querySelector("[data-aa-filter-wrap]");
    var filterToggle = root.querySelector("[data-aa-filter-toggle]");
    var filterMenu = root.querySelector("[data-aa-filter-menu]");
    var filterOptions = Array.prototype.slice.call(root.querySelectorAll("[data-aa-filter-option]"));
    var currentFilterLabel = root.querySelector("[data-aa-current-filter-label]");

    if (!form || !textArea || !inputShell || !output || !loader || !result || !retryBtn || !filterToggle || !filterMenu) return;

    var state = {
      selectedFilter: "neutral",
      results: null,
      sourceText: "",
      loading: false
    };

    var filterToneMap = {
      neutral: { label: "нейтральный", color: "#1ea971" },
      direct: { label: "прямолинейный", color: "#6ccf5a" },
      radical: { label: "радикальный", color: "#d8a437" },
      aggressive: { label: "агрессивный", color: "#d57431" },
      toxic: { label: "токсичный", color: "#c2463b" }
    };

    function setError(message) {
      if (!errorBox) return;
      if (!message) {
        errorBox.hidden = true;
        errorBox.textContent = "";
        return;
      }
      errorBox.hidden = false;
      errorBox.textContent = message;
    }

    function updateCounter() {
      if (!counter) return;
      counter.textContent = String((textArea.value || "").length);
    }

    function updateCreatorLink(sourceText) {
      if (!creatorLink) return;
      var text = (sourceText || textArea.value || "").trim();
      var message = text ? ("Привет, Антон! " + text) : "Привет, Антон!";
      creatorLink.href = "https://t.me/cookiespooky?text=" + encodeURIComponent(message);
    }

    function autoGrowTextArea() {
      textArea.style.height = "auto";
      textArea.style.height = textArea.scrollHeight + "px";
    }

    function closeFilterMenu() {
      filterMenu.hidden = true;
      filterToggle.setAttribute("aria-expanded", "false");
    }

    function openFilterMenu() {
      filterMenu.hidden = false;
      filterToggle.setAttribute("aria-expanded", "true");
    }

    function updateFilterToggle() {
      var tone = filterToneMap[state.selectedFilter] || filterToneMap.neutral;
      if (currentFilterLabel) {
        currentFilterLabel.textContent = tone.label;
        currentFilterLabel.style.color = tone.color;
      }
    }

    function selectFilter(key) {
      state.selectedFilter = key;
      filterOptions.forEach(function (btn) {
        btn.classList.toggle("is-active", btn.getAttribute("data-filter-key") === key);
      });
      updateFilterToggle();
      closeFilterMenu();
      if (state.results) renderResult();
    }

    function renderResult() {
      if (!state.results) return;
      var data = state.results[state.selectedFilter];
      if (!data) return;
      if (sourceTextEl) sourceTextEl.textContent = state.sourceText || "";
      resultText.textContent = data.objective_text || "";
      resultAnalysis.textContent = data.agency_analysis || "";
      result.hidden = false;
    }

    function setLoading(loading) {
      state.loading = loading;
      root.classList.toggle("is-loading", loading);
      output.hidden = false;
      loader.hidden = !loading;
      if (loading) {
        retryBtn.hidden = true;
      }
      if (retryWrap) retryWrap.hidden = loading || !state.results || retryBtn.hidden;
      if (loading) {
        result.hidden = true;
      }
    }

    function showInputMode() {
      root.classList.remove("is-result-mode");
      inputShell.hidden = false;
      if (submitRow) submitRow.hidden = false;
      output.hidden = true;
      loader.hidden = true;
      result.hidden = true;
      retryBtn.hidden = true;
      if (retryWrap) retryWrap.hidden = true;
      state.results = null;
      state.sourceText = "";
      updateCreatorLink("");
      setError("");
      autoGrowTextArea();
      textArea.focus();
      updateCounter();
    }

    async function submitOnce(text) {
      var response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text })
      });

      var data = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        throw new Error((data && (data.details || data.error)) || "Что-то пошло не так. Попробуйте еще раз");
      }
      if (!data || !data.results) {
        throw new Error("Пустой ответ от сервиса");
      }
      return data.results;
    }

    filterToggle.addEventListener("click", function () {
      if (filterMenu.hidden) openFilterMenu();
      else closeFilterMenu();
    });

    filterOptions.forEach(function (option) {
      option.addEventListener("click", function () {
        var key = option.getAttribute("data-filter-key");
        if (!key) return;
        selectFilter(key);
      });
    });

    document.addEventListener("click", function (event) {
      if (!filterWrap.contains(event.target)) closeFilterMenu();
    });

    textArea.addEventListener("input", function () {
      autoGrowTextArea();
      updateCounter();
      if (!state.sourceText) updateCreatorLink("");
    });

    textArea.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      if (event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      if (state.loading) return;
      if (typeof form.requestSubmit === "function") {
        form.requestSubmit();
      } else {
        form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
      }
    });

    retryBtn.addEventListener("click", function () {
      showInputMode();
    });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (state.loading) return;

      var text = (textArea.value || "").trim();
      if (!text) {
        setError("Введите фразу для анализа.");
        return;
      }
      if (text.length > 500) {
        setError("Лимит: 500 символов.");
        return;
      }
      if (!endpoint) {
        setError("Не задан endpoint API.");
        return;
      }

      setError("");
      closeFilterMenu();
      state.sourceText = text;
      updateCreatorLink(text);
      inputShell.hidden = true;
      if (submitRow) submitRow.hidden = true;
      retryBtn.hidden = true;
      setLoading(true);

      try {
        state.results = await submitOnce(text);
        setLoading(false);
        inputShell.hidden = false;
        root.classList.add("is-result-mode");
        renderResult();
        retryBtn.hidden = false;
        if (retryWrap) retryWrap.hidden = false;
      } catch (err) {
        setLoading(false);
        output.hidden = true;
        inputShell.hidden = false;
        if (submitRow) submitRow.hidden = false;
        setError(err && err.message ? err.message : "Что-то пошло не так. Попробуйте еще раз");
      }
    });

    updateCounter();
    autoGrowTextArea();
    updateFilterToggle();
    updateCreatorLink("");
  }

  initMarkdownEmbeds(document.querySelector("main") || document);
  initAgencyAnalyzer();
  initSearchModal();
  initHubFilters();
  initMobileNav();

  if (window.location.hash) {
    window.setTimeout(function () {
      initHeadingAnchors(document.querySelector("main") || document);
      var id = decodeURIComponent(window.location.hash.slice(1));
      var target = document.getElementById(id);
      if (target) target.scrollIntoView();
    }, 0);
  } else {
    onIdle(function () {
      initHeadingAnchors(document.querySelector("main") || document);
    });
  }

  window.addEventListener("hashchange", function () {
    var hash = window.location.hash ? decodeURIComponent(window.location.hash.slice(1)) : "";
    if (!hash) return;
    var target = document.getElementById(hash);
    if (target) {
      target.scrollIntoView();
      return;
    }
    initHeadingAnchors(document.querySelector("main") || document);
    target = document.getElementById(hash);
    if (target) target.scrollIntoView();
  });

  onIdle(function () {
    markExternalLinks(document.querySelector("main") || document);
  });

  onIdle(function () {
    initCodeHighlighting(document.querySelector("main") || document);
  });
})();
