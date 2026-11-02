/* A per-document pause, with its deadline checked by the background worker. */
(() => {
  const t = text => globalThis.YFEI18n?.t(text) ?? text;
  let pending = null;
  YTV.setEntryHandler(() => pending ||= (async () => {
    const state = await YTV.request('uiEntryStatus');
    if (state.done) return;
    const dialog = document.createElement('dialog'); dialog.className = 'protection-dialog';
    const heading = document.createElement('h2'); heading.textContent = t('Pause before settings');
    const message = document.createElement('p'); message.textContent = state.message === 'Which settings would you like to change?' ? t(state.message) : state.message; message.dataset.i18nIgnore = '';
    const status = document.createElement('p'); status.setAttribute('role', 'status');
    const progress = document.createElement('progress'); progress.max = Math.max(1, state.seconds);
    const button = document.createElement('button'); button.textContent = t('Open settings'); button.disabled = true;
    const cancel = document.createElement('button'); cancel.textContent = t('Not now');
    dialog.append(heading, message, status, progress, button, cancel); document.body.append(dialog);
    const update = () => {
      const remaining = Math.max(0, Math.ceil((state.readyAt - Date.now()) / 1000));
      status.hidden = state.style !== 'detailed'; progress.hidden = state.style !== 'subtle';
      status.textContent = t(remaining ? `${remaining} s remaining` : 'Ready to continue');
      progress.value = Math.max(0, state.seconds - remaining); button.disabled = remaining > 0;
    };
    const stopTranslation = globalThis.YFEI18n?.observe(dialog);
    update(); const timer = setInterval(update, 200); dialog.showModal();
    try {
      await new Promise((resolve, reject) => {
        button.addEventListener('click', () => {
          button.disabled = true;
          void YTV.request('uiEntryComplete').then(resolve, error => { status.hidden = false; status.textContent = error.message; });
        });
        const abort = () => reject(new Error('Opening settings was canceled. Reload the page to try again.'));
        cancel.addEventListener('click', abort); dialog.addEventListener('cancel', abort);
      });
    } finally { stopTranslation?.(); clearInterval(timer); dialog.close(); dialog.remove(); }
  })().finally(() => { pending = null; }));
})();
