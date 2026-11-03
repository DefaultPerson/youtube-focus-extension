/* Persistent authority belongs to extension contexts, never to YouTube content scripts. */
(() => {
  'use strict';
  const {api, isFirefox} = YFEPlatform;
  let database;
  function open() {
    if (!database) database = new Promise((resolve, reject) => {
      const request = indexedDB.open('yfe-private', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('values');
      request.onerror = () => { database = null; reject(request.error); };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); database = null; };
        resolve(db);
      };
    });
    return database;
  }
  async function transaction(mode, run) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('values', mode);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => reject(tx.error || new Error('Could not save or load settings.'));
      try { run(tx.objectStore('values'), value => { result = value; }); }
      catch (error) { tx.abort(); reject(error); }
    });
  }
  const privateLocal = {
    get() {
      return transaction('readonly', (store, done) => {
        const result = {};
        const request = store.openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) { result[cursor.key] = cursor.value; cursor.continue(); }
          else done(result);
        };
      });
    },
    set(values) {
      return transaction('readwrite', store => {
        for (const [key, value] of Object.entries(values)) store.put(value, key);
      });
    }
  };
  globalThis.YFEStorage = Object.freeze({
    local: isFirefox ? privateLocal : api.storage.local,
    async initialize() {
      if (isFirefox) await open();
      else await api.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'});
      // Firefox session storage is restricted to trusted extension contexts by default.
      if (api.storage.session.setAccessLevel) await api.storage.session.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'});
    }
  });
})();
