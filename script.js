/* ═══════════════════════════════════════════════════════════════
   SANVI BANSAL · VISUAL DESIGNER
   Cinematic scroll engine · vanilla JS + GSAP/ScrollTrigger/Lenis
   ───────────────────────────────────────────────────────────────
   ADDING A PROJECT
   ═══════════════════════════════════════════════════════════════
   1. Drop an image into  assets/projects/
   2. Name it  1.jpg, 2.jpg, 3.jpg …  (contiguous numbers)
   3. Refresh.

   .jpg .png .jpeg .webp all work. Discovery stops at the first
   missing number, so keep the sequence unbroken.

   Because a static site can't list a directory, discovery probes for
   the next file and stops when it 404s. That means one short burst of
   404s in the network log at the end of the sequence · expected, not
   a fault, and the cost of "drop a file in and refresh" with no build
   step. To silence it, or for gaps / custom order / custom names,
   define this before script.js loads and discovery is skipped:

       <script>
         window.SANVI_PROJECTS = [
           { id: 1, image: 'assets/projects/1.jpg' },
           { id: 2, image: 'assets/projects/hero-shot.png' }
         ];
       </script>
═══════════════════════════════════════════════════════════════ */

(function () {
'use strict';

/* ─────────────────────────── CONFIG ─────────────────────────── */
const CONFIG = {
    dir:        'assets/projects/',
    extensions: ['jpg', 'png', 'jpeg', 'webp'],
    maxIndex:   30,          // hard ceiling for discovery
    featured:   4,           // how many get a full cinematic scene
    openerKey:  'sanvi:opened'
};

/* ───────────────────────── ENVIRONMENT ──────────────────────── */
const hasGSAP  = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
const hasLenis = typeof window.Lenis !== 'undefined';
const reduce   = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePtr  = window.matchMedia('(pointer: fine)');

let MOTION = !reduce.matches && hasGSAP;

const body = document.body;
const html = document.documentElement;
const $  = (s, c) => (c || document).querySelector(s);
const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));
const pad2 = n => String(n).padStart(2, '0');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

if (hasGSAP) {
    gsap.registerPlugin(ScrollTrigger);
    gsap.config({ nullTargetWarn: false });
    ScrollTrigger.config({ ignoreMobileResize: true });
}

/* Four scenes stack their content absolutely and rely on the scroll engine to
   separate it. If GSAP never arrives, or motion is off, that stacking has to be
   undone in CSS · these two classes are the hook, so the page degrades to a
   plain readable document instead of a pile of overlapping cards.
   `no-js` ships in the markup and is dropped here; `no-motion` is added when
   the engine is present but must not run. One CSS block serves both. */
body.classList.remove('no-js');
if (!MOTION) body.classList.add('no-motion');

/* Every layout changing event funnels through here. Images, fonts and the load
   event all land at unpredictable times and each one used to call refresh()
   directly; a refresh remeasures every trigger on the page, so three arriving
   in the same frame did the work three times. */
let refreshQueued = false;
function queueRefresh() {
    if (!hasGSAP || refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => { refreshQueued = false; ScrollTrigger.refresh(); });
}

/* ═══════════════════════════════════════════════════════════════
   1 · SMOOTH SCROLL
═══════════════════════════════════════════════════════════════ */
let lenis = null;

function initScroll() {
    if (!hasLenis || !MOTION) return;

    lenis = new Lenis({
        lerp: 0.1,
        wheelMultiplier: 1,
        smoothWheel: true,
        syncTouch: false,        // native momentum on touch · stays responsive
        autoRaf: false
    });

    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
}

function scrollTo(target, offset) {
    const off = offset === undefined ? 0 : offset;
    if (lenis) { lenis.scrollTo(target, { offset: off, duration: 1.15 }); return; }

    const el = typeof target === 'string' ? $(target) : target;
    if (el === 0 || target === 0) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY + off;
    window.scrollTo({ top, behavior: reduce.matches ? 'auto' : 'smooth' });
}

function lockScroll(on) {
    body.classList.toggle('is-locked', on);
    if (lenis) { on ? lenis.stop() : lenis.start(); }
}

/* ═══════════════════════════════════════════════════════════════
   2 · PROJECT DISCOVERY
   Serially probes assets/projects/{n}.{ext} and keeps what loads.
═══════════════════════════════════════════════════════════════ */
function probe(src) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload  = () => resolve(img.naturalWidth > 0 ? { src, w: img.naturalWidth, h: img.naturalHeight } : null);
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

async function discoverProjects() {
    if (Array.isArray(window.SANVI_PROJECTS) && window.SANVI_PROJECTS.length) {
        return window.SANVI_PROJECTS.map((p, i) => ({
            id: p.id || i + 1,
            src: p.image || p.src,
            fallback: p.fallback || p.src,
            w: p.w || 0,
            h: p.h || 0,
            title: p.title || ('Project ' + pad2(p.id || i + 1)),
            category: p.category || 'Thumbnail Design',
            alt: p.alt || ('Project ' + pad2(p.id || i + 1) + ' by Sanvi Bansal')
        })).filter(p => p.src);
    }

    const found = [];
    // the probe order resorts itself: once .jpg wins, .jpg is tried first
    // for every later index, so a folder of one format costs one request each.
    const order = CONFIG.extensions.slice();

    for (let n = 1; n <= CONFIG.maxIndex; n++) {
        let hit = null;
        for (let e = 0; e < order.length; e++) {
            hit = await probe(CONFIG.dir + n + '.' + order[e]);
            if (hit) {
                if (e > 0) order.unshift(order.splice(e, 1)[0]);
                break;
            }
        }
        if (!hit) break;                        // sequence ended
        found.push({
            id: n,
            src: hit.src,
            w: hit.w,
            h: hit.h,
            title: 'Project ' + pad2(n),
            category: 'Thumbnail Design',
            alt: 'Project ' + pad2(n) + ' by Sanvi Bansal'
        });
    }
    return found;
}

/* ═══════════════════════════════════════════════════════════════
   3 · OPENING SEQUENCE
═══════════════════════════════════════════════════════════════ */
function initOpener(done) {
    const opener = $('#opener');
    const seen = (() => { try { return sessionStorage.getItem(CONFIG.openerKey); } catch (e) { return null; } })();

    let finished = false;
    let safetyTimer = null;

    const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(safetyTimer);
        if (opener) { opener.classList.add('is-done'); }
        body.classList.remove('is-booting');
        body.classList.add('is-ready');
        try { sessionStorage.setItem(CONFIG.openerKey, '1'); } catch (e) {}
        const status = $('#openerStatus');
        if (status) status.textContent = 'Portfolio loaded';
        done();
    };

    /* Resilience safety timer: never leave visitor stranded on frozen screen */
    safetyTimer = setTimeout(() => {
        if (!finished && body.classList.contains('is-booting')) finish();
    }, 3200);

    if (!MOTION || !opener || seen) { finish(); return; }

    const count = $('#openerCount');
    const fill  = $('#openerBarFill');
    const words = $$('.opener__word', opener);
    const role  = $('.opener__roleInner', opener);
    const foot  = $('.opener__foot', opener);
    const proxy = { v: 0 };

    const tl = gsap.timeline({ onComplete: finish });

    tl.to(proxy, {
        v: 100, duration: 1.15, ease: 'power2.inOut',
        onUpdate() {
            const v = Math.round(proxy.v);
            if (count) count.textContent = pad2(v);
            if (fill)  fill.style.transform = 'scaleX(' + (proxy.v / 100) + ')';
        }
    })
    .to(words, { yPercent: 0, duration: 1.05, ease: 'expo.out', stagger: 0.09 }, 0.28)
    .to(role,  { yPercent: 0, duration: 0.9,  ease: 'expo.out' }, 0.75)
    .to(foot,  { autoAlpha: 0, duration: 0.4, ease: 'power1.out' }, 1.5)
    .to(words, { yPercent: -110, duration: 0.8, ease: 'expo.inOut', stagger: 0.05 }, 1.95)
    .to(role,  { yPercent: -120, duration: 0.7, ease: 'expo.inOut' }, 1.95)
    .to(opener, { clipPath: 'inset(0 0 100% 0)', duration: 1.0, ease: 'expo.inOut' }, 2.25);

    return tl;
}

/* ═══════════════════════════════════════════════════════════════
   4 · NAVIGATION · MENU · THEME · HUD
═══════════════════════════════════════════════════════════════ */
function initNav() {
    const nav      = $('#nav');
    const toggle   = $('#navToggle');
    const menu     = $('#menu');
    const toggleTx = $('.nav__toggleTxt');
    const navH     = () => (nav ? nav.offsetHeight : 72);

    /* · anchor scrolling · */
    $$('[data-scroll]').forEach(a => {
        a.addEventListener('click', e => {
            const id = a.getAttribute('href');
            if (!id || id.charAt(0) !== '#') return;
            const el = $(id);
            if (!el) return;
            e.preventDefault();
            if (body.classList.contains('menu-open')) setMenu(false);
            scrollTo(el, id === '#hero' ? 0 : -navH() + 1);
        });
    });

    const toTop = $('#toTop');
    if (toTop) toTop.addEventListener('click', () => scrollTo(0));

    /* · mobile menu · */
    const getMenuLinks = () => menu ? $$('a, button', menu).filter(el => el.offsetParent !== null) : [];

    function setMenu(open) {
        body.classList.toggle('menu-open', open);
        body.classList.toggle('is-locked', open);
        if (lenis) { open ? lenis.stop() : lenis.start(); }
        if (toggle) toggle.setAttribute('aria-expanded', String(open));
        if (menu)   menu.setAttribute('aria-hidden', String(!open));
        if (toggleTx) toggleTx.textContent = open ? toggleTx.dataset.close : toggleTx.dataset.open;

        if (open) {
            const first = getMenuLinks()[0];
            if (first) setTimeout(() => first.focus({ preventScroll: true }), 120);
        } else if (toggle) {
            toggle.focus({ preventScroll: true });
        }
    }
    if (toggle) toggle.addEventListener('click', () => setMenu(!body.classList.contains('menu-open')));

    document.addEventListener('keydown', e => {
        if (!body.classList.contains('menu-open')) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            setMenu(false);
            return;
        }
        if (e.key === 'Tab') {
            const items = getMenuLinks();
            if (!items.length) return;
            const first = items[0], last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault(); last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault(); first.focus();
            }
        }
    });

    /* · scrolled state + auto hide (RAF throttled) · */
    let last = window.scrollY;
    let scrollTicking = false;
    const onScroll = () => {
        if (scrollTicking) return;
        scrollTicking = true;
        requestAnimationFrame(() => {
            const y = window.scrollY;
            body.classList.toggle('nav-scrolled', y > 40);
            if (!body.classList.contains('menu-open') && !body.classList.contains('is-locked')) {
                const down = y > last + 4;
                const up   = y < last - 4;
                if (down && y > 340) body.classList.add('nav-hidden');
                else if (up)         body.classList.remove('nav-hidden');
            }
            last = y;
            scrollTicking = false;
        });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    /* · surface theme + active link + HUD · */
    const scenes   = $$('.scene[data-nav]');
    const hudLabel = $('#hudLabel');
    const hudIndex = $('#hudIndex');
    const hudFill  = $('#hudFill');
    const links    = $$('.nav__links a');

    const setTheme = t => { if (html.dataset.theme !== t) html.dataset.theme = t; };
    const markLink = id => {
        links.forEach(l => l.classList.toggle('is-current', l.getAttribute('href') === '#' + id));
    };

    if (hasGSAP) {
        scenes.forEach((scene, i) => {
            ScrollTrigger.create({
                trigger: scene,
                start: 'top 10%',
                end: 'bottom 10%',
                onToggle: self => {
                    if (!self.isActive) return;
                    setTheme(scene.dataset.nav || 'ink');
                    if (hudLabel) hudLabel.textContent = scene.dataset.scene || '';
                    if (hudIndex) hudIndex.textContent = pad2(i + 1) + '/' + pad2(scenes.length);
                    markLink(scene.id);
                }
            });
        });

        /* the rail is display:none below 1025px · don't write to it there */
        const hudMM = gsap.matchMedia();
        hudMM.add('(min-width: 1025px)', () => {
            const st = ScrollTrigger.create({
                start: 0, end: 'max',
                onUpdate: self => { if (hudFill) hudFill.style.transform = 'scaleY(' + self.progress + ')'; }
            });
            return () => { st.kill(); if (hudFill) hudFill.style.transform = 'scaleY(0)'; };
        });
    } else {
        /* no GSAP fallback · IntersectionObserver theming */
        const io = new IntersectionObserver(entries => {
            entries.forEach(en => {
                if (!en.isIntersecting) return;
                const s = en.target;
                setTheme(s.dataset.nav || 'ink');
                if (hudLabel) hudLabel.textContent = s.dataset.scene || '';
                markLink(s.id);
            });
        }, { rootMargin: '-10% 0px -85% 0px' });
        scenes.forEach(s => io.observe(s));
    }
}

/* ═══════════════════════════════════════════════════════════════
   5 · CUSTOM CURSOR  (desktop only)
═══════════════════════════════════════════════════════════════ */
function initCursor() {
    if (!MOTION || !finePtr.matches) return;
    const cur  = $('#cursor');
    const dot  = $('.cursor__dot', cur);
    const ring = $('.cursor__ring', cur);
    if (!cur) return;

    body.classList.add('has-cursor');

    const dx = gsap.quickTo(dot,  'x', { duration: 0.12, ease: 'power3' });
    const dy = gsap.quickTo(dot,  'y', { duration: 0.12, ease: 'power3' });
    const rx = gsap.quickTo(ring, 'x', { duration: 0.45, ease: 'power3' });
    const ry = gsap.quickTo(ring, 'y', { duration: 0.45, ease: 'power3' });

    window.addEventListener('mousemove', e => {
        dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY);
    }, { passive: true });

    document.addEventListener('mouseleave', () => body.classList.add('cursor--hidden'));
    document.addEventListener('mouseenter', () => body.classList.remove('cursor--hidden'));

    /* delegated hover states · survives dynamically injected projects */
    document.addEventListener('mouseover', e => {
        const view = e.target.closest && e.target.closest('[data-cursor="view"]');
        const link = e.target.closest && e.target.closest('a, button');
        if (!view && !link && !body.classList.contains('cursor--view')
                 && !body.classList.contains('cursor--link')) return;
        body.classList.toggle('cursor--view', !!view);
        body.classList.toggle('cursor--link', !!link && !view);
    }, { passive: true });
    document.addEventListener('mouseout', e => {
        if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('a, button, [data-cursor="view"]')) return;
        body.classList.remove('cursor--view', 'cursor--link');
    }, { passive: true });
}

/* ═══════════════════════════════════════════════════════════════
   6 · MARQUEES
═══════════════════════════════════════════════════════════════ */
function initMarquees() {
    const build = (el, items) => {
        if (!el) return;
        const row = items.map(t => t + '<em>✳</em>').join(' ');
        el.innerHTML = '<span>' + row + '</span><span>' + row + '</span>';
    };
    const heroTrack = $('#heroMarquee');
    const footTrack = $('#footMarquee');
    build(heroTrack, ['UI/UX Design', 'Logo and Brand Identity', 'YouTube Thumbnail Art', 'Visual Design Systems']);
    build(footTrack, ['Sanvi Bansal', 'UI/UX and Visual Designer', "Let's Create Together"]);

    /* pause GPU compositing when marquees are scrolled offscreen */
    if ('IntersectionObserver' in window) {
        const obs = new IntersectionObserver(entries => {
            entries.forEach(en => {
                if (en.target) en.target.style.animationPlayState = en.isIntersecting ? 'running' : 'paused';
            });
        }, { rootMargin: '80px' });
        if (heroTrack) obs.observe(heroTrack);
        if (footTrack) obs.observe(footTrack);
    }
}

/* ═══════════════════════════════════════════════════════════════
   7 · REVEALS  (masked lines + rises)
═══════════════════════════════════════════════════════════════ */
/* the hero's rises are held back for the opener · see revealHero() */
let heroRises = [];

function initReveals() {
    if (!MOTION) return;

    /* masked headline lines */
    $$('[data-line]').forEach(el => {
        gsap.set(el, { yPercent: 108 });
        gsap.to(el, {
            yPercent: 0, duration: 1.15, ease: 'expo.out',
            scrollTrigger: { trigger: el.closest('.mask').parentElement, start: 'top 82%', once: true },
            delay: 0.05
        });
    });

    /* generic rises, staggered per container */
    const groups = new Map();
    $$('[data-rise]').forEach(el => {
        const key = el.closest('.wrap, .hero__inner') || body;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(el);
    });
    groups.forEach((items, key) => {
        gsap.set(items, { y: 26, autoAlpha: 0 });

        /* the hero group is released by the opener instead. a 'top 88%' start is
           already satisfied at scroll 0, so it would play out behind the curtain
           and be finished before the visitor ever saw the page. */
        if (key !== body && key.classList.contains('hero__inner')) {
            heroRises = items;
            return;
        }

        gsap.to(items, {
            y: 0, autoAlpha: 1, duration: 0.95, ease: 'expo.out', stagger: 0.075,
            /* trigger off the container, not items[0] · a group member can be
               removed from the DOM later (the archive tools are), which would
               otherwise leave the whole group stuck at autoAlpha 0. */
            scrollTrigger: { trigger: key === body ? items[0] : key, start: 'top 88%', once: true }
        });
    });

    /* hero exit · the film pulls away */
    const hero = $('.hero__inner');
    if (hero) {
        const heroMM = gsap.matchMedia();

        /* blur is by far the most expensive property to scrub, so the phone
           branch gets the same move without it rather than losing the move. */
        const exit = (vars, end) => () => {
            const t = gsap.to(hero, Object.assign({ autoAlpha: 0, ease: 'none',
                scrollTrigger: { trigger: '.hero', start: 'top top', end: end, scrub: true }
            }, vars));
            return () => {
                if (t.scrollTrigger) t.scrollTrigger.kill();
                t.kill();
                gsap.set(hero, { clearProps: 'all' });
            };
        };
        heroMM.add('(min-width: 721px)', exit({ yPercent: -12 }, 'bottom 30%'));
        heroMM.add('(max-width: 720px)',  exit({ yPercent: -8 },  'bottom 40%'));
    }
}

/* hero headline is released by the opener, not by scroll */
function revealHero() {
    if (!MOTION) return;
    const lines = $$('[data-hero-line]');
    if (lines.length) {
        gsap.fromTo(lines,
            { yPercent: 110 },
            { yPercent: 0, duration: 1.3, ease: 'expo.out', stagger: 0.1, delay: 0.1 }
        );
    }
    /* the eyebrow, marquee, CTAs and stats come up behind the headline */
    if (heroRises.length) {
        gsap.to(heroRises, {
            y: 0, autoAlpha: 1, duration: 0.95, ease: 'expo.out', stagger: 0.08, delay: 0.45
        });
    }
}

/* ═══════════════════════════════════════════════════════════════
   8 · MANIFESTO  (word by word scrub)
═══════════════════════════════════════════════════════════════ */
function initManifesto() {
    const el = $('#manifestoText');
    if (!el) return;

    const words = el.textContent.trim().split(/\s+/);
    el.innerHTML = words.map((w, i) =>
        '<span class="w' + (i === words.length - 1 ? ' w--accent' : '') + '">' + w + '</span>'
    ).join(' ');

    const spans = $$('.w', el);

    if (!MOTION) { spans.forEach(s => s.classList.add('is-lit')); return; }

    /* light the words as the sentence is read */
    const light = p => {
        const lit = Math.round(clamp(p, 0, 1) * spans.length);
        spans.forEach((s, i) => s.classList.toggle('is-lit', i < lit));
    };

    const sig = $('.manifesto__sig');
    const mm  = gsap.matchMedia();

    mm.add('(min-width: 721px) and (min-height: 521px)', () => {
        const st = ScrollTrigger.create({
            trigger: '.manifesto',
            start: 'top top',
            end: 'bottom bottom',
            pin: '.manifesto__pin',
            pinSpacing: false,
            anticipatePin: 0.2,
            invalidateOnRefresh: true,
            scrub: true,
            onUpdate: self => light(self.progress * 1.08)
        });

        /* the sentence tips up out of depth. this replaces a 0.94 → 1.04 scale
           that was far too small to register as movement over 1000px. */
        const plate = gsap.fromTo(el,
            { rotateX: 4, z: -100 },
            {
                rotateX: 0, z: 0, ease: 'none',
                scrollTrigger: { trigger: '.manifesto', start: 'top top', end: 'bottom bottom', scrub: true }
            }
        );

        const fade = sig ? gsap.to(sig, {
            autoAlpha: 0, ease: 'none',
            scrollTrigger: { trigger: '.manifesto', start: 'center center', end: 'bottom bottom', scrub: true }
        }) : null;

        return () => {
            st.kill();
            [plate, fade].forEach(t => {
                if (!t) return;
                if (t.scrollTrigger) t.scrollTrigger.kill();
                t.kill();
            });
            gsap.set([el, sig].filter(Boolean), { clearProps: 'all' });
            light(1);
        };
    });

    /* mobile · no pin. the section is shorter than the viewport here, so a
       'top top' → 'bottom bottom' range is zero length and the words would
       never light at all. scrub them as the block crosses the screen instead. */
    mm.add('(max-width: 720px), (max-height: 520px)', () => {
        const st = ScrollTrigger.create({
            trigger: '.manifesto__pin',
            start: 'top 85%',
            end: 'bottom 55%',
            scrub: true,
            invalidateOnRefresh: true,
            onUpdate: self => light(self.progress * 1.15)
        });
        return () => { st.kill(); light(1); };
    });
}

/* ═══════════════════════════════════════════════════════════════
   9 · STAT COUNTERS
═══════════════════════════════════════════════════════════════ */
function initStats() {
    $$('[data-count]').forEach(el => {
        const target = parseFloat(el.dataset.count);
        if (!MOTION) { el.textContent = target; return; }

        const proxy = { v: 0 };
        el.textContent = '0';
        gsap.to(proxy, {
            v: target, duration: 1.5, ease: 'power2.out',
            onUpdate() { el.textContent = Math.round(proxy.v); },
            scrollTrigger: { trigger: el.closest('.stat') || el, start: 'top 88%', once: true }
        });
    });
}

/* ═══════════════════════════════════════════════════════════════
   10 · SERVICES  (pinned takeover sequence)
═══════════════════════════════════════════════════════════════ */
function initServices() {
    const svcs  = $$('.svc');
    const count = $('#svcCount');
    const rail  = $$('.services__rail li');
    if (!svcs.length) return;

    const setActive = i => {
        svcs.forEach((s, n) => s.classList.toggle('is-active', n === i));
        rail.forEach((r, n) => r.classList.toggle('is-on', n === i));
        if (count) count.textContent = pad2(i + 1);
    };

    if (!MOTION || !hasGSAP) { setActive(0); return; }

    const mm = gsap.matchMedia();

    mm.add('(min-width: 721px) and (min-height: 521px)', () => {
        const HOLD = 1, TRANS = 0.85;
        /* each card gets exactly one HOLD · the last one's is the filler below */
        const total = HOLD + (svcs.length - 1) * (TRANS + HOLD);

        gsap.set(svcs.slice(1), { autoAlpha: 0, rotateX: 3.5, z: -70 });
        gsap.set(svcs[0], { autoAlpha: 1, rotateX: 0, z: 0 });

        const bounds = svcs.slice(1).map((_, i) => (HOLD + i * (TRANS + HOLD) + TRANS / 2) / total);

        const tl = gsap.timeline({
            scrollTrigger: {
                trigger: '.services',
                start: 'top top',
                end: '+=' + (svcs.length * 66) + '%',
                pin: '.services__pin',
                anticipatePin: 0.2,
                invalidateOnRefresh: true,
                scrub: 0.6,
                onUpdate: self => {
                    let i = 0;
                    for (let b = 0; b < bounds.length; b++) if (self.progress >= bounds[b]) i = b + 1;
                    setActive(i);
                }
            }
        });

        /* the cards are stacked plates: the outgoing one tips away into depth as
           the next rises out of it. z stays negative on both sides of every
           handover, so the near edge is never magnified past the flat box. */
        let t = HOLD;
        for (let i = 1; i < svcs.length; i++) {
            tl.to(svcs[i - 1], { autoAlpha: 0, rotateX: -3.5, z: -70, duration: TRANS, ease: 'power2.in' }, t)
              .to(svcs[i],     { autoAlpha: 1, rotateX: 0,  z: 0,    duration: TRANS, ease: 'power2.out' }, t);
            t += TRANS + HOLD;
        }
        /* the final card's reading hold. it must sit at t minus HOLD: t has already
           been advanced past the last transition, so placing it at t would add
           two empty units, not one. */
        tl.to({}, { duration: HOLD }, t - HOLD);

        return () => { gsap.set(svcs, { clearProps: 'all' }); setActive(0); };
    });

    /* mobile / short viewport · plain editorial list, each row reveals */
    mm.add('(max-width: 720px), (max-height: 520px)', () => {
        setActive(0);
        const tweens = svcs.map(s => {
            gsap.set(s, { y: 30, autoAlpha: 0 });
            return gsap.to(s, {
                y: 0, autoAlpha: 1, duration: 0.9, ease: 'expo.out',
                scrollTrigger: { trigger: s, start: 'top 86%', once: true }
            });
        });
        return () => { tweens.forEach(t => { if (t.scrollTrigger) t.scrollTrigger.kill(); t.kill(); }); gsap.set(svcs, { clearProps: 'all' }); };
    });
}

/* ═══════════════════════════════════════════════════════════════
   11 · FEATURED WORK  (cinematic pinned scenes)
═══════════════════════════════════════════════════════════════ */

/* four distinct opening geometries so no two scenes repeat. there is no
   closing geometry on purpose: a scene that wipes itself out at the end of
   its pin leaves the plate invisible for the whole release, which reads as a
   blank gap between projects. these plates turn back into depth instead. */
const REVEALS = [
    'inset(20% 24% 20% 24%)',   // frame opens outward
    'inset(0% 100% 0% 0%)',     // wipe left → right
    'inset(50% 0% 50% 0%)',     // band expands vertically
    'inset(100% 0% 0% 0%)'      // curtain lifts
];

function renderFeatured(projects) {
    const host = $('#featured');
    if (!host) return [];

    if (!projects.length) {
        host.innerHTML =
            '<div class="work__empty"><div class="work__emptyBox">' +
                '<p>Full portfolio available on request.</p>' +
                '<a href="#contact" class="btn btn--fill" data-scroll><span>Request Portfolio</span><i>→</i></a>' +
            '</div></div>';
        return [];
    }

    const picks = projects.slice(0, CONFIG.featured);
    const total = projects.length;

    host.innerHTML = picks.map((p, i) => {
        const n = pad2(p.id);
        const altText = p.alt || ('Project ' + n + ' by Sanvi Bansal');
        const titleText = p.title || ('Project ' + n);
        const catText = p.category || 'Selected Work';
        const wAttr = p.w ? ' width="' + p.w + '"' : '';
        const hAttr = p.h ? ' height="' + p.h + '"' : '';
        const isFirst = i === 0;
        const loadAttr = isFirst ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';
        const fallbackAttr = p.fallback && p.fallback !== p.src ? ' onerror="if(this.src!==\'' + p.fallback + '\'){this.src=\'' + p.fallback + '\';}"' : '';
        return '' +
        '<article class="shot" data-shot="' + i + '" data-variant="' + (i % REVEALS.length) + '">' +
          '<div class="shot__pin">' +
            '<div class="shot__frame">' +
              '<div class="shot__media">' +
                '<img class="shot__img" src="' + p.src + '" alt="' + altText + '" ' +
                     wAttr + hAttr + ' ' + loadAttr + ' decoding="async"' + fallbackAttr + '>' +
                '<span class="shot__plate" aria-hidden="true"></span>' +
              '</div>' +
            '</div>' +
            '<div class="shot__meta">' +
              '<div>' +
                '<span class="shot__label">' + catText + '</span>' +
                '<span class="shot__num">' + n + '<sup>/ ' + pad2(total) + '</sup></span>' +
                '<h3 class="shot__title">' + titleText + '</h3>' +
              '</div>' +
              '<button class="shot__open" data-open="' + i + '" data-cursor="view" aria-label="View ' + titleText + ' full size">' +
                '<span>View project</span><i aria-hidden="true">→</i>' +
              '</button>' +
            '</div>' +
          '</div>' +
        '</article>';
    }).join('');

    return $$('.shot', host);
}

function initFeaturedScenes(shots) {
    if (!shots.length || !MOTION || !hasGSAP) return;

    const mm = gsap.matchMedia();

    mm.add('(min-width: 721px) and (min-height: 521px)', () => {
        const built = shots.map((shot, i) => {
            const frame  = $('.shot__frame', shot);
            const media  = $('.shot__media', shot);
            const img    = $('.shot__img', shot);
            const meta   = $('.shot__meta', shot);
            const reveal = REVEALS[parseInt(shot.dataset.variant, 10) || 0];
            const tilt   = i % 2 ? -2.2 : 2.2;      /* alternating so the sequence breathes */

            /* the plate arrives out of depth, turned away from the viewer */
            gsap.set(frame, { rotateY: tilt, rotateX: 1, z: -90 });
            gsap.set(media, { clipPath: reveal });
            gsap.set(img,   { scale: 1.08 });
            gsap.set(meta,  { autoAlpha: 0, y: 22 });

            const tl = gsap.timeline({
                scrollTrigger: {
                    trigger: shot,
                    start: 'top top',
                    end: '+=125%',
                    pin: $('.shot__pin', shot),
                    anticipatePin: 0.2,
                    invalidateOnRefresh: true,
                    scrub: 0.5
                }
            });

            /* ENTER · the plate squares up to the viewer as the artwork opens */
            tl.to(media, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.1, ease: 'power2.inOut' }, 0)
              .to(frame, { rotateY: 0, rotateX: 0, z: 0, duration: 1.6, ease: 'power2.out' }, 0)
              .to(img,   { scale: 1, duration: 1.5, ease: 'power2.out' }, 0)
              .to(meta,  { autoAlpha: 1, y: 0, duration: 0.6, ease: 'power2.out' }, 0.55)
            /* LEAVE · it turns back into depth. deliberately no closing wipe:
               the artwork stays on screen through the pin release, so the
               handover to the next project is never a blank stretch. */
              .to(frame, { rotateY: -tilt * 0.5, z: -70, duration: 1, ease: 'power1.inOut' }, 1.45)
              .to(img,   { scale: 1.04, duration: 1, ease: 'power1.inOut' }, 1.45)
              .to(meta,  { autoAlpha: 0, y: -18, duration: 0.5, ease: 'power2.in' }, 1.95);

            return tl;
        });

        return () => {
            built.forEach(tl => { if (tl.scrollTrigger) tl.scrollTrigger.kill(); tl.kill(); });
            shots.forEach(s => {
                gsap.set([$('.shot__frame', s), $('.shot__media', s),
                          $('.shot__img', s), $('.shot__meta', s)], { clearProps: 'all' });
            });
        };
    });

    /* mobile · stacked scenes, one clean hinge each (simplified, not removed) */
    mm.add('(max-width: 720px), (max-height: 520px)', () => {
        const built = shots.map(shot => {
            const frame = $('.shot__frame', shot);
            const media = $('.shot__media', shot);
            const meta  = $('.shot__meta', shot);

            gsap.set(frame, { rotateX: 3, z: -35 });
            gsap.set(media, { clipPath: 'inset(0% 0% 12% 0%)', autoAlpha: 0 });
            gsap.set(meta,  { autoAlpha: 0, y: 18 });

            /* one trigger per scene rather than two · same beat, half the work */
            return gsap.timeline({
                scrollTrigger: { trigger: shot, start: 'top 84%', once: true }
            })
            .to(frame, { rotateX: 0, z: 0, duration: 1.1, ease: 'expo.out' }, 0)
            .to(media, { clipPath: 'inset(0% 0% 0% 0%)', autoAlpha: 1, duration: 1.1, ease: 'expo.out' }, 0)
            .to(meta,  { autoAlpha: 1, y: 0, duration: 0.8, ease: 'expo.out' }, 0.15);
        });
        return () => {
            built.forEach(tl => { if (tl.scrollTrigger) tl.scrollTrigger.kill(); tl.kill(); });
            shots.forEach(s => gsap.set(
                [$('.shot__frame', s), $('.shot__media', s), $('.shot__meta', s)], { clearProps: 'all' }));
        };
    });
}

/* ═══════════════════════════════════════════════════════════════
   12 · ARCHIVE  (composed gallery)
═══════════════════════════════════════════════════════════════ */
function renderArchive(projects) {
    const host  = $('#gallery');
    const list  = $('#index');
    const tools = $('.archive__tools');
    const tally = $('#archiveTally');
    if (!host) return;

    if (!projects.length) {
        host.classList.add('gallery--empty');
        host.innerHTML = '<p>The library is being prepared. Showcase pieces available on request.</p>';
        if (list)  list.remove();
        if (tools) tools.remove();
        if (tally) tally.textContent = '';
        return;
    }

    const total = projects.length;
    if (tally) tally.textContent = total + (total === 1 ? ' piece.' : ' pieces.');

    host.classList.remove('gallery--empty');
    host.innerHTML = projects.map((p, i) => {
        const n = pad2(p.id);
        const altText = p.alt || ('Project ' + n + ' by Sanvi Bansal');
        const titleText = p.title || ('Project ' + n);
        const wAttr = p.w ? ' width="' + p.w + '"' : '';
        const hAttr = p.h ? ' height="' + p.h + '"' : '';
        const fallbackAttr = p.fallback && p.fallback !== p.src ? ' onerror="if(this.src!==\'' + p.fallback + '\'){this.src=\'' + p.fallback + '\';}"' : '';
        return '' +
        '<button class="tile" data-p="' + (i % 6) + '" data-open="' + i + '" data-cursor="view" ' +
                'aria-label="View ' + titleText + ' full size">' +
          '<span class="tile__media">' +
            '<img class="tile__img" src="' + p.src + '" alt="' + altText + '" ' +
                 'loading="lazy" decoding="async"' + wAttr + hAttr + fallbackAttr + '>' +
            '<span class="tile__scrim" aria-hidden="true"></span>' +
            '<span class="tile__hover" aria-hidden="true">' +
              '<span class="tile__id">' + n + '</span>' +
              '<span class="tile__go">View<i>→</i></span>' +
            '</span>' +
          '</span>' +
          '<span class="tile__cap">' +
            '<span class="tile__name">' + titleText + '</span>' +
            '<span class="tile__idx">' + n + ' / ' + pad2(total) + '</span>' +
          '</span>' +
        '</button>';
    }).join('');

    /* the same set, read as a typographic contact sheet */
    if (list) {
        list.innerHTML = projects.map((p, i) => {
            const n = pad2(p.id);
            const titleText = p.title || ('Project ' + n);
            const dim = (p.w && p.h) ? p.w + ' × ' + p.h : '';
            return '' +
            '<button class="indexRow" data-open="' + i + '" data-peek="' + p.src + '" ' +
                    'aria-label="View ' + titleText + ' full size">' +
              '<span class="indexRow__n">' + n + '</span>' +
              '<span class="indexRow__name">' + titleText + '</span>' +
              '<span class="indexRow__dim">' + dim + '</span>' +
              '<span class="indexRow__go">View<i aria-hidden="true">→</i></span>' +
            '</button>';
        }).join('');
    }

    initViews(list);
    initIndexPeek(list);

    if (!MOTION || !hasGSAP) return;

    /* each plate hinges up from its own bottom edge */
    $$('.tile', host).forEach(tile => {
        const media = $('.tile__media', tile);
        gsap.set(tile, { y: 24, autoAlpha: 0 });
        gsap.set(media, { rotateX: 4.5, transformOrigin: '50% 100%' });
        gsap.timeline({ scrollTrigger: { trigger: tile, start: 'top 90%', once: true } })
            .to(tile,  { y: 0, autoAlpha: 1, duration: 1.1, ease: 'expo.out' }, 0)
            .to(media, { rotateX: 0, duration: 1.2, ease: 'expo.out' }, 0);
    });
}

/* gallery ⇄ index ══════════════════════════════════════════════════ */
function initViews(list) {
    const scene = $('#archive');
    const gBtn  = $('#viewGallery');
    const iBtn  = $('#viewIndex');
    if (!scene || !gBtn || !iBtn) return;

    let staggered = false;

    function set(view) {
        if (scene.dataset.view === view) return;
        scene.dataset.view = view;
        gBtn.setAttribute('aria-pressed', String(view === 'gallery'));
        iBtn.setAttribute('aria-pressed', String(view === 'index'));

        if (view === 'index' && !staggered && list && MOTION && hasGSAP) {
            staggered = true;
            gsap.from($$('.indexRow', list), {
                y: 24, autoAlpha: 0, duration: .7, ease: 'expo.out', stagger: .03
            });
        }
        queueRefresh();
    }

    gBtn.addEventListener('click', () => set('gallery'));
    iBtn.addEventListener('click', () => set('index'));
}

/* cursor follow preview for the index rows (desktop pointers only) */
function initIndexPeek(list) {
    if (!list || !MOTION || !hasGSAP) return;
    if (!matchMedia('(hover:hover) and (pointer:fine)').matches) return;

    const peek = document.createElement('div');
    peek.className = 'indexPeek';
    peek.setAttribute('aria-hidden', 'true');
    const img = document.createElement('img');
    img.alt = ''; img.decoding = 'async';
    peek.appendChild(img);
    body.appendChild(peek);

    const xTo = gsap.quickTo(peek, 'x', { duration: .45, ease: 'power3' });
    const yTo = gsap.quickTo(peek, 'y', { duration: .45, ease: 'power3' });
    let on = false;

    /* the peek is a fixed size plate, so its box is read once per hover in
       rather than on every pointermove · offsetWidth forces layout, and this
       handler fires at pointer rate */
    let pw = 260, ph = 146;
    const measure = () => { pw = peek.offsetWidth || pw; ph = peek.offsetHeight || ph; };

    function coords(e) {
        return {
            x: Math.max(16, Math.min(e.clientX + 26, innerWidth  - pw - 16)),
            y: Math.max(16, Math.min(e.clientY - ph / 2, innerHeight - ph - 16))
        };
    }

    list.addEventListener('pointerover', e => {
        const row = e.target.closest('.indexRow');
        if (!row) return;
        const src = row.dataset.peek;
        if (src && img.getAttribute('src') !== src) img.src = src;
        if (!on) {
            measure();
            const c = coords(e);
            gsap.set(peek, c);          // land in place before fading in
            on = true;
            peek.classList.add('is-on');
        }
    });

    list.addEventListener('pointerout', e => {
        if (e.relatedTarget && list.contains(e.relatedTarget)) return;
        on = false;
        peek.classList.remove('is-on');
    });

    list.addEventListener('pointermove', e => {
        if (!on) return;
        const c = coords(e);
        xTo(c.x); yTo(c.y);
    }, { passive: true });
}

/* ═══════════════════════════════════════════════════════════════
   13 · PROJECT VIEWER
═══════════════════════════════════════════════════════════════ */
function initViewer(projects) {
    const box   = $('#viewer');
    const img   = $('#viewerImg');
    const title = $('#viewerTitle');
    const count = $('#viewerCount');
    const prev  = $('#viewerPrev');
    const next  = $('#viewerNext');
    const close = $('#viewerClose');
    const navRow = $('.viewer__nav');
    if (!box || !img) return;

    let index = 0;
    let open  = false;
    let lastFocus = null;
    let hideTimer = null;

    if (navRow) navRow.style.display = projects.length > 1 ? '' : 'none';

    function show(i) {
        index = (i + projects.length) % projects.length;
        const p = projects[index];
        const n = pad2(p.id);

        img.classList.remove('is-in');
        const swap = () => {
            img.src = p.src;
            img.alt = (p.alt || ('Project ' + n + ' by Sanvi Bansal')) + ' · full size';
            if (img.complete) img.classList.add('is-in');
            else img.addEventListener('load', () => img.classList.add('is-in'), { once: true });
        };
        MOTION ? window.setTimeout(swap, 130) : swap();

        if (title) title.textContent = p.title || ('Project ' + n);
        if (count) count.textContent = n + ' / ' + pad2(projects.length);
    }

    function openViewer(i) {
        if (!projects.length) return;
        lastFocus = document.activeElement;
        clearTimeout(hideTimer);
        box.hidden = false;
        box.setAttribute('aria-hidden', 'false');
        /* force layout so the transition runs */
        void box.offsetWidth;
        box.classList.add('is-open');
        open = true;
        lockScroll(true);
        body.classList.add('cursor--hidden');
        show(i);
        if (close) {
            close.focus({ preventScroll: true });
            /* still settling? claim focus on the next frame instead */
            if (document.activeElement !== close) {
                requestAnimationFrame(() => { if (open) close.focus({ preventScroll: true }); });
            }
        }
    }

    function closeViewer() {
        if (!open) return;
        box.classList.remove('is-open');
        box.setAttribute('aria-hidden', 'true');
        open = false;
        lockScroll(false);
        body.classList.remove('cursor--hidden');
        hideTimer = window.setTimeout(() => {
            box.hidden = true;
            img.removeAttribute('src');
            img.classList.remove('is-in');
        }, MOTION ? 460 : 0);
        if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }

    /* delegated open · works for featured buttons and archive tiles */
    document.addEventListener('click', e => {
        const t = e.target.closest('[data-open]');
        if (!t) return;
        e.preventDefault();
        openViewer(parseInt(t.dataset.open, 10) || 0);
    });

    if (close) close.addEventListener('click', closeViewer);
    if (prev)  prev.addEventListener('click', () => show(index - 1));
    if (next)  next.addEventListener('click', () => show(index + 1));
    $$('[data-viewer-close]').forEach(el => el.addEventListener('click', closeViewer));

    document.addEventListener('keydown', e => {
        if (!open) return;
        if (e.key === 'Escape')     { e.preventDefault(); closeViewer(); }
        if (e.key === 'ArrowLeft')  { e.preventDefault(); show(index - 1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); show(index + 1); }
        if (e.key === 'Tab') {
            /* focus trap */
            const f = $$('button:not([disabled])', box).filter(b => b.offsetParent !== null);
            if (!f.length) return;
            const first = f[0], lastEl = f[f.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
            else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
        }
    });

    /* touch swipe */
    let sx = 0, sy = 0;
    box.addEventListener('touchstart', e => {
        sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, { passive: true });
    box.addEventListener('touchend', e => {
        const t = e.changedTouches[0];
        const dx = t.clientX - sx, dy = t.clientY - sy;
        if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) show(index + (dx < 0 ? 1 : -1));
    }, { passive: true });
}



/* ═══════════════════════════════════════════════════════════════
   15 · BOOT
═══════════════════════════════════════════════════════════════ */
async function boot() {
    initScroll();
    initMarquees();
    initNav();
    initCursor();
    initManifesto();
    initStats();
    initReveals();
    initServices();

    /* projects: discover → render → wire → refresh */
    let projects = [];
    try { projects = await discoverProjects(); }
    catch (e) { projects = []; }

    const shots = renderFeatured(projects);
    renderArchive(projects);
    initFeaturedScenes(shots);
    initViewer(projects);

    /* newly injected anchors need scroll handling too */
    $$('#featured [data-scroll]').forEach(a => {
        a.addEventListener('click', e => {
            const el = $(a.getAttribute('href'));
            if (!el) return;
            e.preventDefault();
            scrollTo(el, -($('#nav') ? $('#nav').offsetHeight : 72) + 1);
        });
    });

    if (hasGSAP) {
        ScrollTrigger.refresh();

        /* anything that can still change layout after this point remeasures
           through queueRefresh, which collapses a burst into one pass */
        const imgs = $$('#featured img, #gallery img').filter(i => !i.complete);
        imgs.forEach(i => {
            i.addEventListener('load',  queueRefresh, { once: true });
            i.addEventListener('error', queueRefresh, { once: true });
        });
        window.addEventListener('load', queueRefresh);

        /* fonts were the missing one: the display face lands after first paint
           and reflows every headline, which shifted each trigger's start */
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(queueRefresh).catch(() => {});
        }
    }

    /* opener last, so the first frame is already composed */
    initOpener(revealHero);
}

/* react to a motion preference change without a reload */
const onPrefChange = () => {
    const next = !reduce.matches && hasGSAP;
    if (next === MOTION) return;
    window.location.reload();
};
if (reduce.addEventListener) reduce.addEventListener('change', onPrefChange);

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

})();
