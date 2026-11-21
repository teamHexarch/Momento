              (() => {
                const i18n = window.Momento?.i18n, btn = document.getElementById('langBtn');
                if (!i18n) { btn.closest('.s-group').hidden = true; return; }
                const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
                const cur = i18n.langs.find((l) => l.code === i18n.get()) || i18n.langs[0];
                document.getElementById('langBtnText').textContent = cur.name;
                const tick = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
                // Each language in its own words, with the English name under it for anyone who can't read it
                const menu = document.createElement('div');
                menu.className = 's-lang-menu'; menu.id = 'langMenu'; menu.hidden = true;
                menu.setAttribute('role', 'listbox'); menu.setAttribute('aria-labelledby', 'langLabel'); menu.dataset.noI18n = '';
                const opts = i18n.langs.map((l) => {
                  const o = document.createElement('button');
                  o.type = 'button'; o.className = 's-lang-opt'; o.dataset.code = l.code; o.tabIndex = -1;
                  o.setAttribute('role', 'option'); o.setAttribute('aria-selected', l === cur); o.lang = l.html;
                  o.innerHTML = `<b dir="auto"></b>${tick}${l.code === 'en' ? '' : '<small lang="en"></small>'}`;
                  o.querySelector('b').textContent = l.name;
                  if (l.code !== 'en') o.querySelector('small').textContent = l.en;
                  o.addEventListener('click', () => choose(l.code));
                  return o;
                });
                menu.append(...opts);
                btn.setAttribute('aria-controls', menu.id);
                document.body.append(menu);

                let active = 0;
                const focusOpt = (i) => { active = (i + opts.length) % opts.length; opts.forEach((o, k) => o.classList.toggle('is-active', k === active)); opts[active].focus({ preventScroll: true }); opts[active].scrollIntoView({ block: 'nearest' }); };
                // Always drops down from the button, never over the header. Without room for a good part of the
                // list, the page first scrolls the button up; whatever doesn't fit scrolls inside the list
                const GAP = 8, EDGE = 16, WANT = 340;
                const roomBelow = () => innerHeight - btn.getBoundingClientRect().bottom - GAP - EDGE;
                function place() {
                  const r = btn.getBoundingClientRect();
                  menu.style.width = innerWidth <= 520 ? r.width + 'px' : '';   // phones: as wide as the full-width button
                  const w = menu.offsetWidth;
                  menu.style.left = Math.max(EDGE, Math.min(r.right - w, innerWidth - w - EDGE)) + 'px';
                  menu.style.top = (r.bottom + GAP) + 'px';
                  menu.style.maxHeight = Math.max(160, roomBelow()) + 'px';
                }
                function open() {
                  if (!menu.hidden) return;
                  const need = Math.min(WANT, innerHeight * .6) - roomBelow();
                  if (need > 0) scrollBy({ top: need, behavior: 'instant' });
                  menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); place();
                  if (!still) menu.animate([{ opacity: 0, transform: 'translateY(-6px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.22, 1, .36, 1)' });
                  focusOpt(opts.findIndex((o) => o.dataset.code === cur.code));
                  addEventListener('scroll', place, true); addEventListener('resize', place);
                }
                function close(refocus = true) {
                  if (menu.hidden) return;
                  menu.hidden = true; btn.setAttribute('aria-expanded', 'false');
                  removeEventListener('scroll', place, true); removeEventListener('resize', place);
                  if (refocus) btn.focus({ preventScroll: true });
                }
                function choose(code) { close(); if (code !== cur.code) i18n.set(code); }
                btn.addEventListener('click', () => (menu.hidden ? open() : close()));
                btn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); } });
                menu.addEventListener('keydown', (e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); focusOpt(active + 1); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); focusOpt(active - 1); }
                  else if (e.key === 'Home') { e.preventDefault(); focusOpt(0); }
                  else if (e.key === 'End') { e.preventDefault(); focusOpt(opts.length - 1); }
                  else if (e.key === 'Escape') { e.preventDefault(); close(); }
                  else if (e.key === 'Tab') close(false);
                });
                menu.addEventListener('pointermove', (e) => { const o = e.target.closest('.s-lang-opt'); if (o) { active = opts.indexOf(o); opts.forEach((x) => x.classList.toggle('is-active', x === o)); } });
                document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) close(false); });
              })();
