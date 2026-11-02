/* Confirmation happens in extension UI; no credentials enter a YouTube page. */
(() => {
  'use strict';
  const dialog = document.createElement('dialog');
  dialog.className = 'protection-dialog';
  const form = document.createElement('form'); form.method = 'dialog';
  const title = document.createElement('h2'); title.textContent = 'Settings are protected'; title.id = 'protection-title';
  dialog.setAttribute('aria-labelledby', title.id);
  const message = document.createElement('p');
  const label = document.createElement('label'); label.textContent = 'Password or phrase'; label.htmlFor = 'protection-credential';
  const input = document.createElement('input'); input.id = 'protection-credential'; input.autocomplete = 'off'; input.maxLength = 200;
  const buttons = document.createElement('div'); buttons.className = 'dialog-actions';
  const cancel = document.createElement('button'); cancel.value = 'cancel'; cancel.textContent = 'Cancel';
  const submit = document.createElement('button'); submit.value = 'confirm'; submit.textContent = 'Confirm';
  buttons.append(cancel, submit); form.append(title, message, label, input, buttons); dialog.append(form); document.body.append(dialog);
  YTV.setAuthorizationHandler(async () => {
    const protection = await YTV.request('protectionInfo');
    message.textContent = protection.method === 'phrase' ? `Enter the phrase: ${protection.phrase}` : 'Enter your password to apply this change.';
    input.type = protection.method === 'phrase' ? 'text' : 'password'; input.value = '';
    dialog.returnValue = 'cancel'; dialog.showModal(); input.focus();
    return new Promise(resolve => dialog.addEventListener('close', () => { const result = dialog.returnValue === 'confirm' ? input.value : null; input.value = ''; resolve(result); }, {once: true}));
  });
})();
