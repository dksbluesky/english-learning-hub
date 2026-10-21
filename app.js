(() => {
  "use strict";
  const STORAGE_KEY = "english-learning-hub-state-v1";
  const defaults = () => ({ section: "word", favorites: [], resume: { word: "", sentence: "" }, showChinese: false, customEntries: [] });
  const $ = selector => document.querySelector(selector);
  const el = {
    tabs: [...document.querySelectorAll(".section-tab")], search: $("#search-input"),
    category: $("#category-filter"), level: $("#level-filter"), favorites: $("#favorites-toggle"),
    grid: $("#entry-grid"), empty: $("#empty-state"), summary: $("#result-summary"),
    wordCount: $("#word-count"), sentenceCount: $("#sentence-count"), resume: $("#resume-label"),
    translations: $("#translation-toggle"), dialog: $("#entry-dialog"), form: $("#entry-form"),
    kind: $("#entry-kind"), error: $("#form-error"), status: $("#live-status"), backupFile: $("#backup-file"),
    termLabel: $("#entry-term-label"), autofillButton: $("#autofill-button"), autofillHelp: $("#autofill-help"),
    entryModes: [...document.querySelectorAll('input[name="entry-mode"]')]
  };
  let content = [];
  let state = readState();
  let favoritesOnly = false;
  let scrollTimer;

  function validEntry(item) {
    return item && typeof item === "object" && typeof item.id === "string" &&
      (item.kind === "word" || item.kind === "sentence") &&
      ["term","original","category","level","meaning","usage","example","translation","context","source","sourceRepository","sourceId"].every(key => item[key] === undefined || typeof item[key] === "string");
  }
  function readState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || typeof saved !== "object") return defaults();
      return {
        section: saved.section === "sentence" ? "sentence" : "word",
        favorites: Array.isArray(saved.favorites) ? saved.favorites.filter(value => typeof value === "string") : [],
        resume: { word: typeof saved.resume?.word === "string" ? saved.resume.word : "", sentence: typeof saved.resume?.sentence === "string" ? saved.resume.sentence : "" },
        showChinese: Boolean(saved.showChinese),
        customEntries: Array.isArray(saved.customEntries) ? saved.customEntries.filter(validEntry) : []
      };
    } catch { return defaults(); }
  }
  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; }
    catch { announce("Could not save on this device. Try exporting a backup or freeing browser storage."); return false; }
  }
  function announce(message) { el.status.textContent = message; }
  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
    })[character]);
  }
  function allEntries() { return content.concat(state.customEntries); }
  function currentEntries() { return allEntries().filter(item => item.kind === state.section); }

  function setSection(section, restore) {
    state.section = section === "sentence" ? "sentence" : "word";
    favoritesOnly = false;
    el.favorites.setAttribute("aria-pressed", "false");
    el.favorites.firstChild.textContent = "☆ Favorites ";
    el.tabs.forEach(tab => {
      const active = tab.dataset.section === state.section;
      tab.classList.toggle("active", active);
      if (active) tab.setAttribute("aria-current", "page");
      else tab.removeAttribute("aria-current");
    });
    el.search.placeholder = state.section === "word"
      ? "Search words, meanings, examples…"
      : "Search expressions, sentences, situations…";
    el.search.value = "";
    rebuildFilters();
    persist();
    render();
    if (restore) restorePosition();
  }

  function rebuildFilters() {
    const oldCategory = el.category.value;
    const categories = [...new Set(currentEntries().map(item => item.category).filter(Boolean))].sort((a,b) => a.localeCompare(b));
    el.category.innerHTML = '<option value="all">All topics</option>' + categories.map(value => '<option value="' + esc(value) + '">' + esc(value) + '</option>').join("");
    if (categories.includes(oldCategory)) el.category.value = oldCategory;
    const levels = [...new Set(currentEntries().map(item => item.level).filter(Boolean))].sort();
    el.level.innerHTML = '<option value="all">All levels</option>' + levels.map(value => '<option value="' + esc(value) + '">' + esc(value) + '</option>').join("");
  }

  function matches(item, query) {
    const searchable = [item.term,item.original,item.meaning,item.usage,item.example,item.translation,item.category,item.context,item.source].join(" ").toLocaleLowerCase();
    return (!query || searchable.includes(query)) &&
      (el.category.value === "all" || item.category === el.category.value) &&
      (el.level.value === "all" || item.level === el.level.value) &&
      (!favoritesOnly || state.favorites.includes(item.id));
  }

  function render() {
    const query = el.search.value.trim().toLocaleLowerCase();
    const entries = currentEntries().filter(item => matches(item, query));
    el.grid.innerHTML = entries.map(renderCard).join("");
    el.grid.hidden = entries.length === 0;
    el.empty.hidden = entries.length > 0;
    el.summary.textContent = entries.length + (state.section === "word" ? " vocabulary entries" : " sentence entries");
    const all = allEntries();
    el.wordCount.textContent = String(all.filter(item => item.kind === "word").length);
    el.sentenceCount.textContent = String(all.filter(item => item.kind === "sentence").length);
    $("#favorite-count").textContent = String(state.favorites.length);
    updateResumeLabel();
  }

  function renderCard(item) {
    const favorite = state.favorites.includes(item.id);
    const spoken = item.example || item.term || item.original || "";
    const heading = item.original
      ? '<div class="word-pair"><span class="original">' + esc(item.original) + '</span><span class="arrow" aria-hidden="true">→</span><h2 class="card-title">' + esc(item.term) + '</h2></div>'
      : '<h2 class="card-title">' + esc(item.term || item.original || "Untitled entry") + '</h2>';
    const tag = item.category || (item.kind === "word" ? "Vocabulary" : "Sentence");
    let html = '<article class="entry-card" data-id="' + esc(item.id) + '"><div class="card-top"><div class="card-tags"><span class="tag">' + esc(tag) + '</span>';
    if (item.level) html += '<span class="tag level">' + esc(item.level) + '</span>';
    if (item.source === "My entries") html += '<span class="tag personal">MY ENTRY</span>';
    html += '</div><div class="card-actions"><button class="icon-button" type="button" data-speak="' + esc(spoken) + '" aria-label="Listen to ' + esc(item.term || "entry") + '" title="Listen">◖))</button>';
    html += '<button class="icon-button favorite-button" type="button" data-favorite="' + esc(item.id) + '" aria-pressed="' + String(favorite) + '" aria-label="' + (favorite ? "Remove from" : "Add to") + ' favorites" title="Favorite">' + (favorite ? "★" : "☆") + '</button></div></div>';
    html += heading;
    if (item.context) html += '<p class="card-context">' + esc(item.context) + '</p>';
    if (item.meaning) html += '<p class="card-meaning">' + esc(item.meaning) + '</p>';
    if (item.usage) html += '<p class="card-subtitle">' + esc(item.usage) + '</p>';
    if (item.example) html += '<p class="card-example">' + esc(item.example) + '</p>';
    if (state.showChinese && item.translation) html += '<p class="card-translation">' + esc(item.translation) + '</p>';
    html += '<div class="card-source">SOURCE · ' + esc(item.source || "Personal entry") + '</div></article>';
    return html;
  }

  function updateResumeLabel() {
    const id = state.resume[state.section];
    const entry = allEntries().find(item => item.id === id);
    el.resume.textContent = entry ? (entry.term || entry.original || "Saved place") : "Choose a section to begin";
  }
  function restorePosition() {
    const id = state.resume[state.section];
    if (!id) return;
    requestAnimationFrame(() => {
      const card = [...el.grid.querySelectorAll(".entry-card")].find(node => node.dataset.id === id);
      if (card) card.scrollIntoView({ block: "center", behavior: "auto" });
    });
  }
  function rememberVisible() {
    if (document.hidden) return;
    const candidate = [...el.grid.querySelectorAll(".entry-card")].find(card => card.getBoundingClientRect().bottom > 115);
    if (!candidate || state.resume[state.section] === candidate.dataset.id) return;
    state.resume[state.section] = candidate.dataset.id;
    persist();
    updateResumeLabel();
  }
  function toggleFavorite(id) {
    state.favorites = state.favorites.includes(id) ? state.favorites.filter(value => value !== id) : state.favorites.concat(id);
    persist();
    render();
  }
  function speak(text) {
    if (!text || !("speechSynthesis" in window)) { announce("Text-to-speech is not available in this browser."); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.88;
    window.speechSynthesis.speak(utterance);
  }
  function openDialog() {
    el.form.reset();
    el.kind.value = state.section;
    el.error.textContent = "";
    updateEntryKind();
    updateAutofillMode();
    el.dialog.showModal();
    el.form.elements.term.focus();
  }
  function updateEntryKind() {
    const isSentence = el.kind.value === "sentence";
    el.termLabel.innerHTML = isSentence
      ? 'Sentence <span class="required">*</span>'
      : 'Word or key expression <span class="required">*</span>';
    el.form.elements.term.placeholder = isSentence ? "Paste or type one sentence" : "e.g. resilient";
  }
  function updateAutofillMode() {
    const enabled = el.form.querySelector('input[name="entry-mode"]:checked')?.value === "autofill";
    el.autofillButton.hidden = !enabled;
    el.autofillHelp.hidden = !enabled;
    if (enabled && !el.autofillHelp.dataset.checked) checkAutofillAvailability();
  }
  async function checkAutofillAvailability() {
    el.autofillHelp.dataset.checked = "true";
    el.autofillButton.disabled = true;
    el.autofillHelp.textContent = "Checking local AI service…";
    try {
      const response = await fetch("./api/status", { cache: "no-store" });
      const status = await response.json();
      if (!response.ok) throw new Error("The local AI service is unavailable.");
      el.autofillButton.disabled = !status.configured;
      el.autofillHelp.textContent = status.configured
        ? "Your word or sentence is sent to OpenAI only when you press Fill details. Review suggestions before saving."
        : "AI autofill needs an API key when starting the local server. Manual entry remains available.";
    } catch {
      el.autofillButton.disabled = true;
      el.autofillHelp.textContent = "AI autofill is available when you run this app with server.py and configure an API key. Manual entry remains available.";
    }
  }
  async function autofillEntry() {
    const text = String(el.form.elements.term.value || "").trim();
    if (!text) { el.error.textContent = el.kind.value === "sentence" ? "Enter a sentence first." : "Enter a word first."; return; }
    el.error.textContent = "";
    el.autofillButton.disabled = true;
    el.autofillButton.textContent = "Generating…";
    try {
      const response = await fetch("./api/autofill", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: el.kind.value, text })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Autofill failed. Try again or use manual entry.");
      ["category","level","meaning","usage","example","translation","context"].forEach(key => {
        const field = el.form.elements[key];
        if (field && !String(field.value || "").trim() && result[key]) field.value = result[key];
      });
      announce("AI suggestions filled in. Review them before saving.");
      el.autofillHelp.textContent = "Suggestions are ready. Review and edit them before saving.";
    } catch (error) {
      el.error.textContent = error.message || "Autofill failed. Try again or use manual entry.";
    } finally {
      el.autofillButton.disabled = false;
      el.autofillButton.textContent = "Fill details with AI";
    }
  }
  function saveEntry(event) {
    event.preventDefault();
    const form = new FormData(el.form);
    const term = String(form.get("term") || "").trim();
    if (!term) { el.error.textContent = "Enter a word or key expression."; return; }
    const id = "custom-" + (globalThis.crypto?.randomUUID?.() || (Date.now() + "-" + Math.random().toString(16).slice(2)));
    const entry = {
      id, kind: form.get("kind") === "sentence" ? "sentence" : "word",
      source: "My entries", sourceRepository: "", sourceId: id,
      term, original: String(form.get("original") || "").trim(),
      category: String(form.get("category") || "").trim(), level: String(form.get("level") || "").trim(),
      meaning: String(form.get("meaning") || "").trim(), usage: String(form.get("usage") || "").trim(),
      example: String(form.get("example") || "").trim(), translation: String(form.get("translation") || "").trim(),
      context: String(form.get("context") || "").trim()
    };
    state.customEntries.push(entry);
    if (!persist()) { state.customEntries.pop(); return; }
    el.dialog.close();
    setSection(entry.kind);
    el.category.value = "all";
    el.search.value = "";
    render();
    announce("Entry saved on this device.");
  }
  function exportBackup() {
    const backup = { format: "english-learning-hub-backup", version: 1, exportedAt: new Date().toISOString(), state };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "english-learning-backup.json"; link.click();
    URL.revokeObjectURL(url);
    announce("Backup downloaded.");
  }
  async function importBackup(file) {
    try {
      const backup = JSON.parse(await file.text());
      if (backup?.format !== "english-learning-hub-backup" || backup?.version !== 1 || !backup.state ||
          !Array.isArray(backup.state.customEntries) || !Array.isArray(backup.state.favorites)) throw new Error("This is not a supported English Learning backup.");
      const incoming = backup.state.customEntries.filter(validEntry);
      const existing = new Set(state.customEntries.map(item => item.id));
      for (const item of incoming) if (!existing.has(item.id)) state.customEntries.push(item);
      const validIds = new Set(allEntries().map(item => item.id));
      state.favorites = [...new Set(state.favorites.concat(backup.state.favorites.filter(id => typeof id === "string" && validIds.has(id))))];
      if (backup.state.resume && typeof backup.state.resume === "object") {
        ["word","sentence"].forEach(section => {
          const id = backup.state.resume[section];
          if (typeof id === "string" && validIds.has(id)) state.resume[section] = id;
        });
      }
      if (!persist()) return;
      render();
      requestAnimationFrame(rememberVisible);
      announce("Restored " + incoming.length + " custom entries. Existing entries were kept.");
    } catch (error) { announce(error.message || "Could not read that backup file."); }
    finally { el.backupFile.value = ""; }
  }

  el.tabs.forEach(tab => tab.addEventListener("click", () => setSection(tab.dataset.section)));
  el.search.addEventListener("input", render);
  el.category.addEventListener("change", render);
  el.level.addEventListener("change", render);
  el.favorites.addEventListener("click", () => {
    favoritesOnly = !favoritesOnly;
    el.favorites.setAttribute("aria-pressed", String(favoritesOnly));
    el.favorites.firstChild.textContent = favoritesOnly ? "★ Favorites " : "☆ Favorites ";
    render();
  });
  el.grid.addEventListener("click", event => {
    const favorite = event.target.closest("[data-favorite]");
    if (favorite) { toggleFavorite(favorite.dataset.favorite); return; }
    const audio = event.target.closest("[data-speak]");
    if (audio) speak(audio.dataset.speak);
  });
  el.translations.addEventListener("click", () => {
    state.showChinese = !state.showChinese;
    el.translations.setAttribute("aria-pressed", String(state.showChinese));
    el.translations.textContent = state.showChinese ? "Hide Chinese" : "Show Chinese";
    persist(); render();
  });
  $("#add-entry").addEventListener("click", openDialog);
  el.kind.addEventListener("change", updateEntryKind);
  el.entryModes.forEach(mode => mode.addEventListener("change", updateAutofillMode));
  el.autofillButton.addEventListener("click", autofillEntry);
  $("#close-dialog").addEventListener("click", () => el.dialog.close());
  $("#cancel-dialog").addEventListener("click", () => el.dialog.close());
  el.form.addEventListener("submit", saveEntry);
  $("#backup-export").addEventListener("click", exportBackup);
  $("#backup-import").addEventListener("click", () => el.backupFile.click());
  el.backupFile.addEventListener("change", event => { if (event.target.files?.[0]) importBackup(event.target.files[0]); });
  window.addEventListener("scroll", () => { clearTimeout(scrollTimer); scrollTimer = setTimeout(rememberVisible, 250); }, { passive: true });
  window.addEventListener("keydown", event => {
    if (event.key === "/" && !["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName)) {
      event.preventDefault(); el.search.focus();
    }
  });

  fetch("./data/content.json")
    .then(response => { if (!response.ok) throw new Error("Content could not be loaded."); return response.json(); })
    .then(data => {
      content = Array.isArray(data.items) ? data.items.filter(validEntry) : [];
      el.translations.setAttribute("aria-pressed", String(state.showChinese));
      el.translations.textContent = state.showChinese ? "Hide Chinese" : "Show Chinese";
      setSection(state.section, true);
      render();
      requestAnimationFrame(rememberVisible);
    })
    .catch(() => {
      el.grid.hidden = true;
      el.empty.hidden = false;
      el.empty.querySelector("h2").textContent = "Learning content could not be loaded";
      el.empty.querySelector("p").textContent = "Reload the app while online, then try again.";
    });
})();

