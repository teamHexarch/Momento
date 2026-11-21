    // ---- Intro (once per tab): the glyph appears, the sunset "o" rises and slides along, and the letters
    // of the name appear behind it. The logo then lands in the header, the QR code settles in on its own
    // (its code blooming out from the middle), and the headline rises ----
    document.addEventListener('DOMContentLoaded', () => window.Momento.intro(async (I) => {
      const $ = (s, r = document) => r.querySelector(s);
      const lock = $('#introLock'), glyph = $('#ilGlyph'), word = $('#ilWord'), sun = $('#ilSun');
      const letters = [...word.querySelectorAll('.ltr')];
      const brand = $('.header .brand'), bGlyph = $('.glyph', brand), bWord = $('.brand-word', brand);
      const bg = $('#intro .intro-bg'), qr = $('#qrCard'), frame = $('.qr-frame', qr);
      const hero = [...$('#heroLeft').children];
      const ease = (p) => (p < .5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);
      const OUT = 'cubic-bezier(.2, .8, .2, 1)', GLIDE = 'cubic-bezier(.65, 0, .25, 1)';
      // Letter centres along the word and the sun's start, in the wordmark's own units (the sun ends at x 8424.7)
      const CX = [950, 2400, 3850, 5300, 6450, 7400], SUN_X = 8424.7, START = 7900;

      [brand, qr, ...hero].forEach(I.hold);
      // The sun starts beside the glyph; the row is shifted so what is showing sits in the middle
      const wordW = word.getBoundingClientRect().width;
      const shift = (wordW - 1164 * wordW / 9217) / 2;
      sun.setAttribute('transform', `translate(${-START} 0)`);
      lock.style.transform = `translateX(${shift}px)`;
      lock.style.opacity = 1;
      I.play(glyph, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 480, easing: OUT });
      // Sky above the horizon rises, water below it drops in, each inside its own clip
      I.play($('#ilSky'), [{ transform: 'translate(0, -640px)' }, { transform: 'none' }], { duration: 680, delay: 120, easing: 'cubic-bezier(.2, .9, .3, 1)' });
      I.play($('#ilWater'), [{ transform: 'translate(0, 640px)' }, { transform: 'none' }], { duration: 680, delay: 120, easing: 'cubic-bezier(.2, .9, .3, 1)' });
      await I.wait(520);

      // The "o" slides to the end of the word; each letter appears as it passes
      const shown = new Set();
      await I.tween(920, (p) => {
        const e = ease(p), x = SUN_X - START * (1 - e);
        sun.setAttribute('transform', `translate(${(-START * (1 - e)).toFixed(1)} 0)`);
        lock.style.transform = `translateX(${(shift * (1 - e)).toFixed(1)}px)`;
        letters.forEach((l, i) => {
          if (shown.has(i) || x < CX[i]) return;
          shown.add(i);
          I.play(l, [{ opacity: 0, transform: 'translate(0, -260px)' }, { opacity: 1, transform: 'none' }], { duration: 520, easing: OUT });
        });
      });
      letters.forEach((l, i) => { if (!shown.has(i)) I.play(l, [{ opacity: 1 }, { opacity: 1 }], { duration: 1 }); });
      sun.setAttribute('transform', 'translate(0 0)');
      lock.style.transform = 'none';
      await I.wait(160);

      // The logo lands on the header's
      const gFrom = glyph.getBoundingClientRect(), gTo = bGlyph.getBoundingClientRect(), wTo = bWord.getBoundingClientRect();
      const flights = [
        I.play(bg, [{ opacity: 1 }, { opacity: 0 }], { duration: 700, delay: 160, easing: 'ease' }),
        I.play(glyph, [{ transform: 'none' }, { transform: I.flip(glyph, gTo) }], { duration: 780, easing: GLIDE }),
        wTo.width
          ? I.play(word, [{ transform: 'none' }, { transform: I.flip(word, wTo) }], { duration: 780, easing: GLIDE })
          : I.play(word, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 }),   // phone width: the header shows the glyph alone
      ];
      // The QR card comes in on its own: it settles onto the page like a print being set down, the headline's soft spring
      // (transform keeps the card's tilt vars so it lands exactly where the live tilt expects it)
      const tilt = 'perspective(900px) rotateX(var(--trx)) rotateY(var(--try))';
      flights.push(I.play(qr, [{ opacity: 0, scale: .94, transform: `${tilt} translateY(26px)` }, { opacity: 1, scale: 1, transform: `${tilt} translateY(0)` }], { duration: 860, delay: 520, easing: 'cubic-bezier(.16, 1, .3, 1)' }));
      const qrSvg = $('#qrHero'), qrArt = qrSvg.querySelector('g');
      qrSvg.insertAdjacentHTML('afterbegin', '<defs><mask id="qrBloom" maskUnits="userSpaceOnUse" x="0" y="0" width="25" height="25"><circle id="qrBloomDot" cx="12.5" cy="12.5" r="18" fill="#fff"/></mask></defs>');
      qrArt.setAttribute('mask', 'url(#qrBloom)');
      I.undo(() => { qrArt.removeAttribute('mask'); qrSvg.querySelector('defs')?.remove(); qr.classList.remove('is-scanning'); });
      const dot = $('#qrBloomDot');
      dot.style.transformBox = 'fill-box'; dot.style.transformOrigin = 'center';
      flights.push(I.play(dot, [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: 900, delay: 960, easing: 'cubic-bezier(.3, .7, .2, 1)' }));
      // ...and the headline rises as the veil clears
      hero.forEach((el, i) => flights.push(I.play(el, [{ opacity: 0, transform: 'translateY(34px)' }, { opacity: 1, transform: 'none' }], { duration: 900, delay: 440 + i * 130, easing: 'cubic-bezier(.16, 1, .3, 1)' })));

      await I.wait(780);
      I.play(brand, [{ opacity: 0 }, { opacity: 1 }], { duration: 1 });   // the real logo takes over where the copy landed
      lock.style.visibility = 'hidden';
      await I.wait(1000); qr.classList.add('is-scanning');   // once the code has drawn in, the viewfinder closes in, like a lock
      await I.wait(420); qr.classList.remove('is-scanning');
      await Promise.all(flights);
    }));
