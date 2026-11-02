"use strict";

(() => {
  const $ = (id) => document.getElementById(id);
  const catalog = globalThis.YTV_CATALOG;
  const api = globalThis.YTV;
  let settings;
  let customPresets = [];
  let activeCategory = "all";
  let pending = 0;
  let queue = Promise.resolve();
  const rows = new Map();
  const groups = [];

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function showError(error) {
    $("error").textContent = `Could not save or load settings. ${error instanceof Error ? error.message : String(error)}`;
    $("error").hidden = false;
    $("save-status").textContent = "Operation not completed.";
  }

  function setBusy() {
    document.querySelectorAll("[data-mutation]").forEach((control) => { control.disabled = pending > 0; });
    $("settings").setAttribute("aria-busy", String(pending > 0));
    if (pending) $("save-status").textContent = "Saving…";
  }

  function mutate(action, successMessage = "Saved in this browser.") {
    pending += 1;
    $("error").hidden = true;
    setBusy();
    queue = queue.then(async () => {
      await action();
      settings = await api.readSettings();
      syncControls();
      $("save-status").textContent = successMessage;
    }).catch((error) => {
      showError(error);
      syncControls();
    }).finally(() => {
      pending -= 1;
      setBusy();
    });
    return queue;
  }

  function markMutation(control) { control.dataset.mutation = ""; return control; }

  function buildOptions() {
    for (const category of catalog.categories) {
      const categoryOptions = catalog.options.filter((option) => option.category === category.id);
      const groupDefinitions = [...category.groups];
      for (const option of categoryOptions) {
        if (!groupDefinitions.some((group) => group.id === option.group)) {
          groupDefinitions.push({ id: option.group, label: category.label });
        }
      }
      for (const group of groupDefinitions) {
        const options = categoryOptions.filter((option) => option.group === group.id);
        if (!options.length) continue;
        const section = element("section", "option-group");
        const heading = element("h3", "", `${category.label} / ${group.label}`);
        section.append(heading);
        const groupRows = [];
        for (const option of options) {
          const row = element("div", "option-row");
          const copy = element("div", "option-copy");
          const label = element("label", "", option.label);
          const controlId = `option-${option.id}`;
          label.htmlFor = controlId;
          copy.append(label);
          if (option.description) {
            const description = element("p", "", option.description);
            description.id = `${controlId}-description`;
            copy.append(description);
          }
          let control;
          if (option.type === "enum") {
            control = element("select");
            for (const choice of option.choices) {
              const item = element("option", "", choice.label);
              item.value = choice.value;
              control.append(item);
            }
          } else {
            control = element("input");
            control.type = option.type === "boolean" ? "checkbox" : "color";
          }
          control.id = controlId;
          if (option.description) control.setAttribute("aria-describedby", `${controlId}-description`);
          markMutation(control);
          control.addEventListener("change", () => {
            const value = option.type === "boolean" ? control.checked : control.value;
            void mutate(() => api.updateSettings({ values: { [option.id]: value } }));
          });
          const reset = markMutation(element("button", "reset-option", "↺"));
          reset.type = "button";
          reset.title = `Reset: ${option.label}`;
          reset.setAttribute("aria-label", reset.title);
          reset.addEventListener("click", () => {
            void mutate(() => api.updateSettings({ values: { [option.id]: option.default } }));
          });
          let editor = control;
          let colorState;
          if (option.type === "color") {
            editor = element("div", "color-control");
            colorState = element("span", "color-state");
            colorState.id = `${controlId}-state`;
            control.setAttribute("aria-describedby", [control.getAttribute("aria-describedby"), colorState.id].filter(Boolean).join(" "));
            editor.append(control, colorState);
          }
          row.append(copy, editor, reset);
          rows.set(option.id, { row, control, colorState, option });
          groupRows.push(row);
          section.append(row);
        }
        groups.push({ section, rows: groupRows });
        $("option-groups").append(section);
      }
    }
  }

  function filterOptions() {
    const query = $("search").value.trim().toLocaleLowerCase("en");
    const changedOnly = $("changed-only").checked;
    let count = 0;
    for (const { row, option } of rows.values()) {
      const category = catalog.categories.find((item) => item.id === option.category);
      const text = `${option.label} ${option.description || ""} ${category?.label || ""} ${(option.choices || []).map((choice) => choice.label).join(" ")}`.toLocaleLowerCase("en");
      const match = (!query || text.includes(query)) &&
        (query || activeCategory === "all" || option.category === activeCategory) &&
        (!changedOnly || settings.values[option.id] !== option.default);
      row.hidden = !match;
      if (match) count += 1;
    }
    for (const group of groups) group.section.hidden = group.rows.every((row) => row.hidden);
    $("empty-state").hidden = count > 0;
    $("section-title").textContent = query ? "Search results across all sections" :
      activeCategory === "all" ? "Appearance" : catalog.categories.find((item) => item.id === activeCategory).label;
    $("result-count").textContent = `${count} of ${catalog.options.length}`;
  }

  function syncControls() {
    if (!settings) return;
    for (const { row, control, colorState, option } of rows.values()) {
      const value = settings.values[option.id];
      if (option.type === "boolean") control.checked = value;
      else if (option.type === "color") {
        control.value = value === "default" ? "#ffffff" : value;
        colorState.textContent = value === "default" ? "Default" : value;
        control.parentElement.classList.toggle("default-color", value === "default");
      } else control.value = value;
      row.classList.toggle("is-changed", value !== option.default);
    }
    // Keep the focused editor available if its reset removes it from this filter.
    const focused = document.activeElement;
    filterOptions();
    if (focused && focused.closest(".option-row")?.hidden) $("changed-only").focus();
  }

  function confirmAction(title, description, actionLabel) {
    const dialog = $("confirm-dialog");
    $("confirm-title").textContent = title;
    $("confirm-description").textContent = description;
    $("confirm-action").textContent = actionLabel;
    dialog.returnValue = "cancel";
    return new Promise((resolve) => {
      dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true });
      dialog.showModal();
    });
  }

  function renderPresets() {
    $("built-in-presets").replaceChildren();
    $("custom-presets").replaceChildren();
    for (const [presets, target, custom] of [[catalog.presets, $("built-in-presets"), false], [customPresets, $("custom-presets"), true]]) {
      if (!presets.length) target.append(element("p", "muted", "No saved presets yet."));
      for (const preset of presets) {
        const row = element("div", "preset-item");
        const actions = element("div", "preset-actions");
        const apply = markMutation(element("button", "", "Apply"));
        apply.type = "button";
        apply.setAttribute("aria-label", `Apply preset: ${preset.label}`);
        apply.addEventListener("click", () => {
          void mutate(async () => {
            await api.request('activatePreset', {id: preset.id});
          });
        });
        actions.append(apply);
        if (custom) {
          const remove = markMutation(element("button", "", "Delete…"));
          remove.type = "button";
          remove.setAttribute("aria-label", `Delete preset: ${preset.label}`);
          remove.addEventListener("click", async () => {
            if (!await confirmAction("Delete preset?", `The preset “${preset.label}” will be deleted. Your current settings will be kept.`, "Delete")) return;
            void mutate(async () => {
              const next = (await api.readPresets()).filter((item) => item.id !== preset.id);
              await api.writePresets(next);
              customPresets = next;
              renderPresets();
            });
          });
          actions.append(remove);
        }
        row.append(element("span", "", preset.label), actions);
        target.append(row);
      }
    }
    setBusy();
  }

  function wireActions() {
    $("search").addEventListener("input", filterOptions);
    $("changed-only").addEventListener("change", filterOptions);
    window.addEventListener('ytv:navigate', ({detail}) => {
      if (detail.view !== 'appearance') return;
      if (activeCategory !== detail.category) $("search").value = '';
      activeCategory = detail.category;
      filterOptions();
    });
    $("save-preset").addEventListener("submit", (event) => {
      event.preventDefault();
      const label = $("preset-name").value.trim();
      if (!label) { $("preset-name").setCustomValidity("Enter a preset name."); $("preset-name").reportValidity(); return; }
      void mutate(async () => {
        const presets = await api.readPresets();
        const fresh = await api.readSettings();
        const next = [...presets, { id: `local-${crypto.randomUUID()}`, label, values: { ...fresh.values } }];
        await api.writePresets(next);
        customPresets = next;
        $("preset-name").value = "";
        renderPresets();
      });
    });
    $("preset-name").addEventListener("input", () => $("preset-name").setCustomValidity(""));
    $("export").addEventListener("click", () => {
      void mutate(async () => {
        const data = api.exportData(await api.readSettings(), await api.readPresets(), await api.readFeatures());
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
        const anchor = element("a");
        anchor.href = url;
        anchor.download = `yfe-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, "JSON file ready.");
    });
    $("import").addEventListener("click", () => $("import-file").click());
    $("import-file").addEventListener("change", async () => {
      const file = $("import-file").files[0];
      $("import-file").value = "";
      if (!file) return;
      try {
        if (file.size > 10 * 1024 * 1024) throw new Error("The file is larger than 10 MB.");
        let parsed;
        try { parsed = JSON.parse(await file.text()); }
        catch { throw new Error("The file does not contain valid JSON."); }
        const imported = api.importData(parsed);
        const changed = catalog.options.filter((option) => imported.settings.values[option.id] !== option.default).length;
        const preview = `This file contains ${changed} appearance changes and ${imported.customPresets.length} custom presets. The extension will be ${imported.settings.enabled ? "on" : "off"}. ${imported.features ? "Usage limits, filters and player settings will also be replaced." : "Usage limits, filters and player settings will be kept."} Settings protection will be kept. Export your current data first if you need a backup.`;
        if (!await confirmAction("Import settings?", preview, "Replace and import")) return;
        void mutate(async () => {
          await api.applyImport(parsed);
          customPresets = imported.customPresets;
          renderPresets();
          window.dispatchEvent(new Event('ytv:imported'));
        });
      } catch (error) { showError(error); }
    });
    $("reset-all").addEventListener("click", async () => {
      if (!await confirmAction("Reset all appearance settings?", "All appearance changes will be reset and the extension will be turned on. Custom presets will be kept.", "Reset settings")) return;
      void mutate(() => api.request('resetAppearance'));
    });
    for (const id of ["export", "import", "reset-all"]) markMutation($(id));
    $("save-preset").querySelectorAll("input, button").forEach(markMutation);
  }

  async function init() {
    try {
      if (!globalThis.chrome?.runtime?.id || !catalog || !api) throw new Error("Open the installed extension settings in Chrome.");
      [settings, customPresets] = await Promise.all([api.readSettings(), api.readPresets()]);
      buildOptions();
      wireActions();
      renderPresets();
      syncControls();
      YTVUI.refresh();
      $("search").disabled = false;
      $("changed-only").disabled = false;
      $("save-status").textContent = "Settings loaded.";
      api.subscribe((next) => { settings = next; syncControls(); });
      // Reload personal presets after another settings tab changes them.
      globalThis.chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        void api.readPresets().then((next) => {
          if (JSON.stringify(next) !== JSON.stringify(customPresets)) { customPresets = next; renderPresets(); }
        }).catch(showError);
      });
    } catch (error) { showError(error); }
  }

  void init();
})();
