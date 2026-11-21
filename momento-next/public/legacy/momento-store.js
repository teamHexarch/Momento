  // Albums you create, join or remove, kept in this browser (localStorage) so every page agrees.
  // Pages hear about changes through a `momento:albums` event on document.
  window.MomentoStore = (() => {
    const MINE = 'momento-my-albums', GONE = 'momento-removed';
    const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
    const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
    const tell = (detail) => document.dispatchEvent(new CustomEvent('momento:albums', { detail }));
    const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O or 1/I to misread
    return {
      created: () => read(MINE, []),
      removed: () => read(GONE, []),
      find: (id) => read(MINE, []).find((a) => a.id === id) || null,
      findCode: (code) => read(MINE, []).find((a) => a.code.replace('-', '') === code.replace('-', '')) || null,
      add(a) { write(MINE, [a, ...read(MINE, []).filter((x) => x.id !== a.id)]); tell({ type: 'add', album: a }); },
      // Albums made here are dropped; the sample albums are remembered as removed
      remove(id) {
        const list = read(MINE, []), hit = list.find((x) => x.id === id) || null;
        if (hit) write(MINE, list.filter((x) => x.id !== id));
        else write(GONE, [...new Set([...read(GONE, []), id])]);
        tell({ type: 'remove', id });
        return hit;
      },
      restore(id, saved) {
        if (saved) write(MINE, [saved, ...read(MINE, []).filter((x) => x.id !== id)]);
        else write(GONE, read(GONE, []).filter((x) => x !== id));
        tell({ type: 'restore', id, album: saved });
      },
      code() {
        const pick = () => CHARS[Math.floor(Math.random() * CHARS.length)];
        return `${pick()}${pick()}${pick()}-${pick()}${pick()}${pick()}${pick()}`;
      },
    };
  })();
