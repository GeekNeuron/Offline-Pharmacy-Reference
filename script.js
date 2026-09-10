(function () {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* داده‌ها — دیتابیس رسمی فهرست دارویی ایران (IRC)                      */
  /* ------------------------------------------------------------------ */
  const DB = (typeof DRUG_DATABASE_IRC !== "undefined") ? DRUG_DATABASE_IRC : [];

  const ENGLISH_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  const ACCESS_LABEL = {
    otc: "بدون نسخه",
    hospital: "بیمارستانی",
    rx: "نسخه‌دار",
  };

  /* ------------------------------------------------------------------ */
  /* عناصر DOM                                                           */
  /* ------------------------------------------------------------------ */
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

  /* ------------------------------------------------------------------ */
  /* تم روشن/تاریک                                                       */
  /* ------------------------------------------------------------------ */
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

  /* ------------------------------------------------------------------ */
  /* کمکی‌ها                                                             */
  /* ------------------------------------------------------------------ */
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

  function getFiltered() {
    return DB
      .filter((d) => matchesAccessFilter(d) && matchesQuery(d, state.query))
      .sort((a, b) => a.name_en.localeCompare(b.name_en, "en"));
  }

  /* ------------------------------------------------------------------ */
  /* فیلترهای سطح دسترسی                                                 */
  /* ------------------------------------------------------------------ */
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

  /* ------------------------------------------------------------------ */
  /* نوار الفبا (انگلیسی — چون نام رسمی داروها در فهرست IRC انگلیسی است) */
  /* ------------------------------------------------------------------ */
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
    const target = document.getElementById("letter-" + letter);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  /* ------------------------------------------------------------------ */
  /* رندر فهرست                                                          */
  /* ------------------------------------------------------------------ */
  function renderList() {
    const filtered = getFiltered();
    el.drugList.innerHTML = "";
    el.resultsMeta.textContent = filtered.length
      ? `${toPersianDigits(filtered.length)} دارو یافت شد`
      : "";

    if (!filtered.length) {
      el.emptyState.hidden = false;
      el.alphaRail.querySelectorAll(".alpha-btn").forEach((b) => b.classList.remove("active"));
      return;
    }
    el.emptyState.hidden = true;

    const isSearching = !!state.query.trim();
    const availableLetters = new Set();

    if (isSearching) {
      filtered.forEach((d) => el.drugList.appendChild(renderCard(d)));
    } else {
      let currentLetter = null;
      let groupWrap = null;
      filtered.forEach((d) => {
        const groupLetter = firstLetter(d.name_en);
        availableLetters.add(groupLetter);
        if (groupLetter !== currentLetter) {
          currentLetter = groupLetter;
          const heading = document.createElement("div");
          heading.className = "letter-heading";
          heading.id = "letter-" + groupLetter;
          heading.textContent = groupLetter;
          groupWrap = document.createElement("div");
          groupWrap.className = "letter-group";
          groupWrap.appendChild(heading);
          const cardsHost = document.createElement("div");
          cardsHost.className = "drug-list";
          cardsHost.dataset.host = "true";
          groupWrap.appendChild(cardsHost);
          el.drugList.appendChild(groupWrap);
        }
        const host = groupWrap.querySelector('[data-host="true"]');
        host.appendChild(renderCard(d));
      });
    }

    renderAlphaRail(availableLetters);
  }

  function renderCard(d) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "drug-card";
    const sub = [d.form_fa, d.route_fa].filter(Boolean).join(" · ");
    const hasFa = d.fa && d.fa.name;
    const hasIntl = !hasFa && d.intl;
    const hasClassOnly = !hasFa && !hasIntl && d.pharm_class;
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
        <p class="drug-card-sub">${escapeHtml(sub)}${tag}</p>
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

  /* ------------------------------------------------------------------ */
  /* مودال جزئیات دارو                                                   */
  /* ------------------------------------------------------------------ */
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

  /* ------------------------------------------------------------------ */
  /* جستجوی آنی                                                          */
  /* ------------------------------------------------------------------ */
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

  /* ------------------------------------------------------------------ */
  /* راه‌اندازی اولیه                                                    */
  /* ------------------------------------------------------------------ */
  function init() {
    initTheme();
    el.drugCount.textContent = `${toPersianDigits(DB.length)} دارو در دیتابیس رسمی`;
    renderFilterChips();
    renderList();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
