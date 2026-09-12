(function () {
  "use strict";

  const DB = (typeof DRUG_DATABASE_IRC !== "undefined") ? DRUG_DATABASE_IRC : [];
  const INTERACTIONS_DB = (typeof DRUG_INTERACTIONS !== "undefined") ? DRUG_INTERACTIONS : {};

  const ENGLISH_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  const ACCESS_LABEL = {
    otc: "بدون نسخه",
    hospital: "بیمارستانی",
    rx: "نسخه‌دار",
  };

  const el = {
    themeToggle: document.getElementById("theme-toggle"),
    searchBox: document.getElementById("search-box"),
    clearBtn: document.getElementById("clear-search"),
    filterRow: document.getElementById("filter-row"),
    alphaRail: document.getElementById("alpha-rail"),
    resultsMeta: document.getElementById("results-meta"),
    drugList: document.getElementById("drug-list"),
    emptyState: document.getElementById("empty-state"),
    drugCount: document.getElementById("drug-count"),
    modalBackdrop: document.getElementById("modal-backdrop"),
    modal: document.getElementById("drug-modal"),
    modalContent: document.getElementById("modal-content"),
    modalClose: document.getElementById("modal-close"),
  };

  let state = {
    query: "",
    accessFilter: "all", // all | otc | hospital | rx
  };

  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem("pharmacy-theme"); } catch (e) {}
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = saved || (prefersDark ? "dark" : "light");
    applyTheme(theme);
  }

  function applyTheme(theme) {
    if (theme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
      el.themeToggle.setAttribute("aria-pressed", "true");
    } else {
      document.documentElement.removeAttribute("data-theme");
      el.themeToggle.setAttribute("aria-pressed", "false");
    }
    try { localStorage.setItem("pharmacy-theme", theme); } catch (e) {}
  }

  el.themeToggle.addEventListener("click", () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    applyTheme(isDark ? "light" : "dark");
  });

  function normalize(str) {
    return (str || "")
      .toString()
      .toLowerCase()
      .replace(/[\u064B-\u0652]/g, "")   // اعراب فارسی/عربی
      .replace(/ي/g, "ی")
      .replace(/ك/g, "ک")
      .trim();
  }

  function matchesQuery(d, q) {
    if (!q) return true;
    const faParts = d.fa ? [d.fa.name, d.fa.generic, d.fa.category] : [];
    const intlParts = d.intl ? [d.intl.ingredient] : [];
    const classParts = d.pharm_class ? [d.pharm_class.fa, d.pharm_class.en] : [];
    const atcParts = d.atc_fa ? [d.atc_fa.group_fa, d.atc_fa.subgroup_fa] : [];
    const hay = [
      d.name_en, d.molecule_en, d.atc, d.form_en, d.form_fa, d.route_en, d.route_fa, String(d.index_code || ""),
      ...faParts, ...intlParts, ...classParts, ...atcParts
    ].map(normalize).join(" | ");
    return hay.includes(normalize(q));
  }

  function matchesAccessFilter(d) {
    if (state.accessFilter === "all") return true;
    if (state.accessFilter === "annotated") return !!(d.fa || d.intl || d.pharm_class || d.intl_combo);
    return d.access === state.accessFilter;
  }

  function firstLetter(name) {
    const n = (name || "").trim().toUpperCase();
    const ch = n.charAt(0);
    return /[A-Z]/.test(ch) ? ch : "#";
  }

  const SEVERITY_FA = { M: "شدید", O: "متوسط", N: "خفیف", U: "نامشخص" };
  const SEVERITY_ORDER = { M: 0, O: 1, N: 2, U: 3 };

  const INTERACTION_STOPLIST = new Set([
    "ACID","SODIUM","POTASSIUM","HYDROCHLORIDE","SULFATE","OXIDE","CHLORIDE",
    "PHOSPHATE","CALCIUM","MAGNESIUM","WATER","INJECTION","SOLUTION","TABLET","CAPSULE",
    "ACETATE","MALEATE","CITRATE","BROMIDE","NITRATE","CARBONATE","DIHYDRATE","ANHYDROUS",
    "MONOHYDRATE","TRIHYDRATE","HUMAN","COMPOUND","EXTRA","FORTE","MESYLATE","BESYLATE",
    "BESILATE","SUCCINATE","TARTRATE","FUMARATE","VALERATE","PROPIONATE","DIPROPIONATE",
    "HYDROBROMIDE","PALMITATE","STEARATE","BENZOATE","GLUCONATE","LACTATE","OIL","EXTRACT",
    "POWDER","CREAM","GEL","LOTION","SPRAY","OINTMENT","SYRUP","DROPS","IRON","ZINC","AND",
    "MESILATE","DECANOATE","ENANTHATE","HYDRATE","BASE","FREE","XR","ER","HCL","HBR","DL",
    "MG","MCG","UG","ML","G","IU","MEQ","MMOL","KG","L","DOSE","PUFF","UNIT","UNITS","W",
  ]);

  function interactionCoreName(s) {
    if (!s) return "";
    let n = s.toUpperCase().replace(/\(.*?\)/g, " ").replace(/[^A-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    let words = n.split(" ").filter((w) => w && !/^\d/.test(w) && !INTERACTION_STOPLIST.has(w));
    words = words.filter((w) => !/^\d+[A-Z]{0,3}$/.test(w));
    return words.join(" ");
  }

  function findDrugInteractions(d) {
    const mol = d.molecule_en || "";
    const parts = mol.split("/").filter((p) => p.trim());
    const keys = parts.length ? parts.map(interactionCoreName) : [interactionCoreName(mol)];
    const merged = new Map();
    let total = 0;
    keys.forEach((key) => {
      const entry = INTERACTIONS_DB[key];
      if (!entry) return;
      total += entry.total;
      entry.items.forEach((it) => {
        if (!merged.has(it.p)) merged.set(it.p, it.l);
      });
    });
    const items = Array.from(merged, ([p, l]) => ({ p, l }));
    items.sort((a, b) => (SEVERITY_ORDER[a.l] ?? 9) - (SEVERITY_ORDER[b.l] ?? 9));
    return { total, items };
  }

  function getFiltered() {
    return DB
      .filter((d) => matchesAccessFilter(d) && matchesQuery(d, state.query))
      .sort((a, b) => a.name_en.localeCompare(b.name_en, "en"));
  }

  function renderFilterChips() {
    const chips = [
      { key: "all", label: "همه" },
      { key: "otc", label: "بدون نسخه" },
      { key: "rx", label: "نسخه‌دار" },
      { key: "hospital", label: "بیمارستانی" },
      { key: "annotated", label: "دارای توضیح تکمیلی" },
    ];
    el.filterRow.innerHTML = "";
    chips.forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "filter-chip" + (state.accessFilter === c.key ? " active" : "");
      btn.textContent = c.label;
      btn.addEventListener("click", () => {
        state.accessFilter = c.key;
        renderFilterChips();
        renderList();
      });
      el.filterRow.appendChild(btn);
    });
  }

  function renderAlphaRail(availableLetters) {
    el.alphaRail.innerHTML = "";
    const allLetters = ENGLISH_ALPHABET.concat(["#"]);
    allLetters.forEach((letter) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "alpha-btn";
      btn.textContent = letter;
      const has = availableLetters.has(letter);
      if (!has) {
        btn.classList.add("disabled");
      } else {
        btn.addEventListener("click", () => jumpToLetter(letter));
      }
      el.alphaRail.appendChild(btn);
    });
  }

  function jumpToLetter(letter) {
    let guard = 0;
    while (!document.getElementById("letter-" + letter) && renderCursor < renderPlan.length && guard < 100) {
      renderNextBatch();
      guard++;
    }
    const target = document.getElementById("letter-" + letter);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const BATCH_SIZE = 150;
  let renderPlan = [];
  let renderCursor = 0;
  let sentinelEl = null;
  let io = null;

  function ensureObserver() {
    if (io) return io;
    io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) renderNextBatch();
      });
    }, { root: null, rootMargin: "600px 0px", threshold: 0 });
    return io;
  }

  function buildPlan(filtered, isSearching) {
    const plan = [];
    if (isSearching) {
      filtered.forEach((d) => plan.push({ type: "card", d }));
    } else {
      let currentLetter = null;
      filtered.forEach((d) => {
        const groupLetter = firstLetter(d.name_en);
        if (groupLetter !== currentLetter) {
          currentLetter = groupLetter;
          plan.push({ type: "heading", letter: groupLetter });
        }
        plan.push({ type: "card", d });
      });
    }
    return plan;
  }

  function renderNextBatch() {
    if (sentinelEl) { io.unobserve(sentinelEl); sentinelEl.remove(); sentinelEl = null; }
    const end = Math.min(renderCursor + BATCH_SIZE, renderPlan.length);
    let currentHost = null;
    const lastGroup = el.drugList.lastElementChild;
    if (lastGroup && lastGroup.classList && lastGroup.classList.contains("letter-group")) {
      currentHost = lastGroup.querySelector('[data-host="true"]');
    }
    const frag = document.createDocumentFragment();
    for (let i = renderCursor; i < end; i++) {
      const item = renderPlan[i];
      if (item.type === "heading") {
        const heading = document.createElement("div");
        heading.className = "letter-heading";
        heading.id = "letter-" + item.letter;
        heading.textContent = item.letter;
        const groupWrap = document.createElement("div");
        groupWrap.className = "letter-group";
        groupWrap.appendChild(heading);
        const cardsHost = document.createElement("div");
        cardsHost.className = "drug-list";
        cardsHost.dataset.host = "true";
        groupWrap.appendChild(cardsHost);
        frag.appendChild(groupWrap);
        currentHost = cardsHost;
      } else {
        const card = renderCard(item.d);
        if (currentHost) currentHost.appendChild(card);
        else frag.appendChild(card);
      }
    }
    el.drugList.appendChild(frag);
    renderCursor = end;
    if (renderCursor < renderPlan.length) {
      sentinelEl = document.createElement("div");
      sentinelEl.className = "render-sentinel";
      sentinelEl.setAttribute("aria-hidden", "true");
      el.drugList.appendChild(sentinelEl);
      ensureObserver().observe(sentinelEl);
    }
  }

  function renderList() {
    const filtered = getFiltered();
    el.drugList.innerHTML = "";
    if (sentinelEl) { sentinelEl = null; }
    if (io) io.disconnect();
    el.resultsMeta.textContent = filtered.length
      ? `${toPersianDigits(filtered.length)} دارو یافت شد`
      : "";

    if (!filtered.length) {
      el.emptyState.hidden = false;
      renderAlphaRail(new Set());
      renderPlan = [];
      renderCursor = 0;
      return;
    }
    el.emptyState.hidden = true;

    const isSearching = !!state.query.trim();
    el.drugList.classList.toggle("flat-list", isSearching);
    const availableLetters = isSearching ? new Set() : new Set(filtered.map((d) => firstLetter(d.name_en)));
    renderAlphaRail(availableLetters);

    renderPlan = buildPlan(filtered, isSearching);
    renderCursor = 0;
    renderNextBatch();
  }

  function renderCard(d) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "drug-card";
    const subParts = [d.form_fa, d.route_fa];
    if (d.atc_fa && d.atc_fa.group_fa) subParts.push(d.atc_fa.group_fa);
    const sub = subParts.filter(Boolean).join(" · ");
    const hasFa = d.fa && d.fa.name;
    const hasIntl = !hasFa && d.intl;
    const hasClassOnly = !hasFa && !hasIntl && d.pharm_class;
    const hasInteraction = findDrugInteractions(d).items.some((it) => it.l === "M");
    const titleHtml = hasFa
      ? `${escapeHtml(d.fa.name)} <span class="en">${escapeHtml(d.name_en)}</span>`
      : `<span class="en">${escapeHtml(d.name_en)}</span>`;
    const tag = hasFa
      ? ' <span class="fa-tag">شرح فارسی موجود</span>'
      : (hasIntl ? ' <span class="fa-tag" style="color:var(--text-muted)">خلاصه انگلیسی موجود</span>'
      : (hasClassOnly ? ` <span class="fa-tag" style="color:var(--text-muted)">${escapeHtml(d.pharm_class.fa || d.pharm_class.en)}</span>` : ""));
    card.innerHTML = `
      <div class="drug-card-main">
        <p class="drug-card-name">${titleHtml} ${d.strength ? `<span class="en" style="opacity:.7">${escapeHtml(d.strength)}</span>` : ""}</p>
        <p class="drug-card-sub">${escapeHtml(sub)}${tag}${hasInteraction ? ' <span class="fa-tag" style="color:var(--rx-color)">⚠️ تداخل مهم</span>' : ""}</p>
      </div>
      <span class="badge ${d.access}">${ACCESS_LABEL[d.access] || "—"}</span>
    `;
    card.addEventListener("click", () => openModal(d));
    return card;
  }

  function toPersianDigits(n) {
    const map = ["۰","۱","۲","۳","۴","۵","۶","۷","۸","۹"];
    return String(n).replace(/[0-9]/g, (d) => map[+d]);
  }

  function escapeHtml(str) {
    return (str || "").toString()
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function row(label, value, isLtr) {
    if (!value) return "";
    return `
      <div class="modal-section">
        <h3>${escapeHtml(label)}</h3>
        <p${isLtr ? ' style="direction:ltr;unicode-bidi:isolate;text-align:left"' : ""}>${escapeHtml(value)}</p>
      </div>`;
  }

  function openModal(d) {
    const accessNote = d.access === "hospital"
      ? "این دارو صرفاً در بیمارستان تجویز و مصرف می‌شود."
      : d.access === "otc"
        ? "این دارو بدون نیاز به نسخه پزشک قابل تهیه است؛ با این حال مصرف خودسرانه توصیه نمی‌شود."
        : "این دارو نیازمند نسخه پزشک است.";

    const fa = d.fa;
    const intl = d.intl;
    const faBlock = fa ? `
      <div class="modal-section" style="background:var(--surface-alt);border-radius:10px;padding:.8rem .9rem;">
        <h3>${fa.name ? escapeHtml(fa.name) : "شرح فارسی"} ${fa.generic ? `<span style="color:var(--text-muted);font-weight:500">(${escapeHtml(fa.generic)})</span>` : ""}</h3>
        ${fa.category ? `<p style="margin-bottom:.4rem"><strong>دسته:</strong> ${escapeHtml(fa.category)}</p>` : ""}
        ${fa.uses ? `<p style="margin-bottom:.4rem"><strong>موارد مصرف:</strong> ${escapeHtml(fa.uses)}</p>` : ""}
        ${fa.side_effects ? `<p style="margin-bottom:.4rem"><strong>عوارض شایع:</strong> ${escapeHtml(fa.side_effects)}</p>` : ""}
        ${fa.warnings ? `<p><strong>هشدار:</strong> ${escapeHtml(fa.warnings)}</p>` : ""}
        ${fa.partial ? `<p style="margin-top:.5rem;font-size:.74rem;color:var(--text-muted)">⚠️ این دارو ترکیبی چند جزئی است؛ شرح بالا فقط مربوط به یکی از اجزای فعال آن است، نه کل فرآورده.</p>` : ""}
      </div>` : "";

    const intlBlock = intl ? `
      <div class="modal-section" style="background:var(--surface-alt);border-radius:10px;padding:.8rem .9rem;direction:ltr;text-align:left;unicode-bidi:isolate;">
        <h3 style="direction:rtl;text-align:right">خلاصه بین‌المللی (انگلیسی) — ${escapeHtml(intl.ingredient)}</h3>
        <p style="margin-bottom:.4rem">${escapeHtml(intl.uses_en)}</p>
        ${intl.warnings_en ? `<p><strong>Warning:</strong> ${escapeHtml(intl.warnings_en)}</p>` : ""}
        <p style="margin-top:.5rem;font-size:.72rem;color:var(--text-muted);direction:rtl;text-align:right">
          منبع: دیتاست متن‌باز eg-drugs (مصر) — بر اساس ماده مؤثره، نه محصول ایرانی خاص.
          ${intl.partial ? " ⚠️ این دارو ترکیبی است؛ متن فقط مربوط به یک جزء فعال آن است." : ""}
        </p>
      </div>` : "";

    const pc = d.pharm_class;
    const pharmClassBlock = pc ? `
      <div class="modal-section">
        <h3>کلاس دارویی (FDA)</h3>
        <p>${pc.fa ? escapeHtml(pc.fa) : escapeHtml(pc.en)}${pc.fa ? ` <span style="color:var(--text-muted);font-size:.82rem">(${escapeHtml(pc.en)})</span>` : ""}${pc.partial ? ' <span style="font-size:.72rem;color:var(--text-muted)">(برای یکی از اجزای ترکیب)</span>' : ""}</p>
      </div>` : "";

    const ic = d.intl_combo;
    const comboBlock = ic ? `
      <div class="modal-section" style="background:var(--surface-alt);border-radius:10px;padding:.8rem .9rem;direction:ltr;text-align:left;unicode-bidi:isolate;">
        <h3 style="direction:rtl;text-align:right">خلاصه بین‌المللی — کل ترکیب دارویی</h3>
        <p style="margin-bottom:.4rem">${escapeHtml(ic.uses_en)}</p>
        ${ic.warnings_en ? `<p><strong>Warning:</strong> ${escapeHtml(ic.warnings_en)}</p>` : ""}
        <p style="margin-top:.5rem;font-size:.72rem;color:var(--text-muted);direction:rtl;text-align:right">
          منبع: eg-drugs — این مورد به‌صورت دستی بازبینی شده و برای کل ترکیب (همه اجزا) صادق است.
        </p>
      </div>` : "";

    const noDataNote = (!fa && !intl && !pc && !ic);

    const interactionData = findDrugInteractions(d);
    const interactionItems = interactionData.items;
    const majorCount = interactionItems.filter((it) => it.l === "M").length;
    const visibleCount = 10;
    function interactionRow(it) {
      const badgeColor = it.l === "M" ? "var(--rx-color)" : (it.l === "O" ? "var(--accent-2)" : "var(--text-muted)");
      const badgeBg = it.l === "M" ? "var(--rx-bg)" : (it.l === "O" ? "var(--accent-2-soft)" : "var(--surface-alt)");
      return `<div style="display:flex;align-items:center;justify-content:space-between;gap:.6rem;padding:.4rem 0;border-top:1px solid var(--border)">
        <span style="direction:ltr;unicode-bidi:isolate;text-align:right">${escapeHtml(it.p)}</span>
        <span style="flex:none;font-size:.7rem;font-weight:700;padding:.15rem .5rem;border-radius:100px;background:${badgeBg};color:${badgeColor}">${SEVERITY_FA[it.l] || it.l}</span>
      </div>`;
    }
    const interactionsBlock = interactionItems.length ? `
      <div class="modal-section warning">
        <h3>⚠️ تداخل دارویی (${toPersianDigits(interactionData.total)} مورد ثبت‌شده، ${toPersianDigits(majorCount)} مورد شدید)</h3>
        <div>${interactionItems.slice(0, visibleCount).map(interactionRow).join("")}</div>
        ${interactionItems.length > visibleCount ? `
          <details style="margin-top:.3rem">
            <summary style="cursor:pointer;font-size:.78rem;color:var(--rx-color)">نمایش ${toPersianDigits(interactionItems.length - visibleCount)} مورد دیگر</summary>
            <div>${interactionItems.slice(visibleCount).map(interactionRow).join("")}</div>
          </details>` : ""}
        <p style="font-size:.72rem;color:var(--text-muted);margin-top:.5rem">منبع: DDInter (دیتابیس باز و دارای داوری علمی). پیش از مصرف هم‌زمان چند دارو حتماً با پزشک یا داروساز مشورت کنید.</p>
      </div>` : "";

    el.modalContent.innerHTML = `
      <div class="modal-title-row">
        <h2 id="modal-title" style="direction:ltr;unicode-bidi:isolate;text-align:right">${escapeHtml(d.name_en)}</h2>
        ${d.strength ? `<span class="modal-en-name">${escapeHtml(d.strength)}</span>` : ""}
      </div>
      <div class="modal-badges">
        <span class="badge ${d.access}">${ACCESS_LABEL[d.access] || "—"}</span>
        ${d.form_fa ? `<span class="badge otc" style="background:var(--surface-alt);color:var(--text-muted)">${escapeHtml(d.form_fa)}</span>` : ""}
        ${d.biologic ? `<span class="badge otc" style="background:var(--accent-2-soft);color:var(--accent-2)">فرآورده بیولوژیک</span>` : ""}
      </div>

      ${faBlock}
      ${intlBlock}
      ${comboBlock}
      ${pharmClassBlock}
      ${interactionsBlock}

      ${row("ترکیب دارویی (مولکول)", d.molecule_en, true)}
      ${row("نحوه مصرف", d.route_fa)}
      ${d.atc_fa ? `<div class="modal-section"><h3>گروه درمانی (ATC)</h3><p>${d.atc_fa.group_fa ? escapeHtml(d.atc_fa.group_fa) : ""}${d.atc_fa.subgroup_fa ? " ← " + escapeHtml(d.atc_fa.subgroup_fa) : ""}</p></div>` : ""}
      ${row("کد ATC", d.atc, true)}
      ${row("کد فهرست رسمی دارویی", d.index_code != null ? String(d.index_code) : "", true)}
      ${row("تاریخ ورود به فهرست (شمسی)", d.entry_date_j, true)}

      <div class="modal-section warning">
        <h3>نکته</h3>
        <p>${accessNote} ${noDataNote ? "این رکورد از فهرست رسمی سازمان غذا و دارو (سامانه IRC) استخراج شده و شامل موارد مصرف بالینی، عوارض یا هشدارهای تفصیلی نیست؛ برای این اطلاعات به درج دارو یا داروساز مراجعه کنید." : ""}</p>
      </div>

      <div class="modal-footnote">
        منبع داده ساختاری: فهرست رسمی دارویی ایران — سامانه IRC، سازمان غذا و دارو (irc.fda.gov.ir)${fa ? " · شرح فارسی: دیتابیس تکمیلی داخلی (غیررسمی)" : ""}${(intl || ic) ? " · خلاصه انگلیسی: eg-drugs (متن‌باز)" : ""}${pc ? " · کلاس دارویی: FDA NDC (متن‌باز)" : ""}
      </div>
    `;
    el.modalBackdrop.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    el.modalBackdrop.hidden = true;
    document.body.style.overflow = "";
  }

  el.modalClose.addEventListener("click", closeModal);
  el.modalBackdrop.addEventListener("click", (e) => {
    if (e.target === el.modalBackdrop) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !el.modalBackdrop.hidden) closeModal();
  });

  let debounceTimer = null;
  el.searchBox.addEventListener("input", (e) => {
    const val = e.target.value;
    el.clearBtn.hidden = !val;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      state.query = val;
      renderList();
    }, 60);
  });

  el.clearBtn.addEventListener("click", () => {
    el.searchBox.value = "";
    el.clearBtn.hidden = true;
    state.query = "";
    el.searchBox.focus();
    renderList();
  });

  function init() {
    initTheme();
    el.drugCount.textContent = `${toPersianDigits(DB.length)} دارو در دیتابیس رسمی`;
    renderFilterChips();
    renderList();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
