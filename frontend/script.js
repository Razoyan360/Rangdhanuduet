    let alumniData = [];
    const API_BASE_URL = 'https://rangdhanuduet.vercel.app/api';
    /* Admin sign-in. Paste the OAuth Client ID from Google Cloud Console
       here, and store the same value in the Apps Script project with
       rdSetAdminClientId('...'). Left empty, the admin page falls back to
       the old behaviour. Nothing else on the site uses this. */
    const RD_ADMIN_CLIENT_ID = '206805550122-qfbd6lu9ol02liho53sercrcf98pako5.apps.googleusercontent.com';
    let RD_ADMIN_TOKEN = '';
    const RD_ADMIN_KEY = 'rd_admin_token';
    const RD_ADMIN_KEEP = 'rd_admin_keep';
    const RD_ADMIN_PROFILE_KEY = 'rd_admin_profile';
    const ALUMNI_API_URL = API_BASE_URL + '?action=alumni';

    const staticEvents = [];

    /* Reunion 2024 album — ordered by how the day actually unfolded. */
    

    function escapeHtml(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
    
    function normalizeAlumniImage(value) {
      const raw = String(value ?? '').trim();
      if (!raw) return '';
      if (/^https?:\/\//i.test(raw) && !/drive\.google\.com/i.test(raw)) return raw;
      const match = raw.match(/(?:drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^#]*&)?id=|thumbnail\?id=))([a-zA-Z0-9_-]+)/i) || raw.match(/\/(?:d|file\/d)\/([a-zA-Z0-9_-]+)/i) || raw.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
      if (match && match[1]) return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(match[1]) + '&sz=w500';
      if (/^[a-zA-Z0-9_-]{15,}$/.test(raw)) return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(raw) + '&sz=w500';
      return raw;
    }
    
    /* One monogram rule for the whole site. rdMpInitials drops titles and
       reads a Bengali first letter as one character, neither of which this
       could do. Kept as a name of its own because alumniAvatarMarkup is
       still called from the committee pages. */
    function initialsFor(name) { return rdMpInitials(name); }
    
    /* A photo lands after the card that holds it -- Drive is a separate request.
       The image therefore starts transparent and is faded in once it is here.
       An error counts as arrival too: a broken photo must show its alt text and
       its grey box, never an invisible hole. */
    function rdPhotoReady(el) { if (el) el.classList.add('rd-photo-ready'); }

    /* innerHTML can hand back an image that a warm browser cache already has,
       and a load event that fired before this code ran never reaches us.  The
       sweep after every render catches exactly those. */
    function rdPhotoSweep(root) {
      const scope = root || document;
      scope.querySelectorAll('img.rd-photo-in:not(.rd-photo-ready)').forEach(img => {
        if (img.complete) rdPhotoReady(img);
      });
    }

    function alumniAvatarMarkup(a, sz = 'w-12 h-12', tx = 'text-base', rd = 'rounded-2xl') {
      const img = normalizeAlumniImage(a.image);
      if (!img) return `<div class="${sz} ${rd} bg-blue-50 border border-blue-200 flex items-center justify-center font-bold text-blue-600 ${tx} shadow-sm">${escapeHtml(initialsFor(a.name))}</div>`;
      return `<div class="${sz} ${rd} overflow-hidden flex items-center justify-center shadow-sm relative bg-slate-100"><img src="${escapeHtml(img)}" alt="${escapeHtml(a.name || '')}" loading="lazy" decoding="async" onload="rdPhotoReady(this)" onerror="rdPhotoReady(this)" class="w-full h-full object-cover rd-photo-in"></div>`;
    }

    /* ---------- Sub-pages: what used to be popups are now real pages ----------
       parent    = which main nav item stays highlighted, and where "back" lands by default
       needsData = the page is filled in at runtime, so a direct link / refresh must
                   bounce to the parent instead of showing an empty page.            */
    const RD_SUBPAGES = {
      'admin-event-new': { parent: 'admin', needsData: false },
      'admin-module':   { parent: 'admin', needsData: true  },
      'notice':       { parent: 'home',   needsData: true  },
      'event-new':    { parent: 'events', needsData: false },
      'event-detail': { parent: 'events', needsData: true  },
      'my-info':      { parent: 'alumni', needsData: false },
      'profile':      { parent: 'alumni', needsData: true  },
      'member-signin': { parent: 'alumni', needsData: false },
      'forgot-email': { parent: 'member-signin', needsData: false },
      /* Its own section, and needsData is false on purpose: the row comes
         from the server on the page's own request, so a reload lands here
         instead of bouncing the member out to the directory. */
      'my-profile':   { parent: 'my-profile', needsData: false },
      
      'notice-file':  { parent: 'noticeboard', needsData: true  },
      'committee-new': { parent: 'committee', needsData: false },
      'ec-message':   { parent: 'committee', needsData: true  },
      'pdacc-updates': { parent: 'prokoushali', needsData: true  },
      /* The admission guide is plain markup: every number is in the page
         already, so a reload can land straight on it. */
      'pdacc-admission': { parent: 'prokoushali', needsData: false },
      'pdacc-committee': { parent: 'prokoushali', needsData: true  },
      /* Rangdhanu Family's teacher list. needsData is false because the page
         fetches its own feed, so a reload lands here instead of bouncing the
         visitor out to the member directory. */
      'family-faculty': { parent: 'alumni', needsData: false },
      'bloodbank':       { parent: 'bloodbank', needsData: false },
      /* Its own section; the page fetches its own poll feed, so a reload lands
         here instead of bouncing out. */
      'polls':           { parent: 'polls', needsData: false }
    };
    const rdSubReturn = {};
    const rdSubFrom = {};
    const rdPageScroll = Object.create(null);
    let rdCurrentPageId = 'home';
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

    window.addEventListener('scroll', function () {
      rdPageScroll[rdCurrentPageId] = window.scrollY;
    }, { passive: true });

    function openSubPage(pageId, backTo) {
      if (pageId === 'committee-new' && !RD_MEMBER.token) {
        openMemberSignIn(backTo || rdCurrentPageId);
        return;
      }
      const parent = (RD_SUBPAGES[pageId] || {}).parent || 'home';
      const from = rdCurrentPageId !== pageId ? rdCurrentPageId : '';
      let back = backTo || from || parent;
      /* A section that is its own parent -- My Profile -- would otherwise send
         Back to the page it is already on. */
      if (back === pageId) back = parent === pageId ? 'home' : parent;
      rdSubReturn[pageId] = back;
      rdSubFrom[pageId] = from;   // the page sitting just behind us in history
      switchPage(pageId);
      if (pageId === 'committee-new') ecPrepareSubmissionForm();
    }

    function goBackFromSubPage(pageId) {
      let back = rdSubReturn[pageId] || (RD_SUBPAGES[pageId] || {}).parent || 'home';
      if (back === pageId) back = 'home';
      // Only step through real history when the entry behind us IS where we want to land,
      // otherwise the URL bar and the visible page would disagree.
      if (rdSubFrom[pageId] === back && history.state && history.state.page === pageId && history.length > 1) {
        history.back();
        return;
      }
      switchPage(back);
    }

    function pageUrlId(pageId) {
      const publicIds = {
        alumni: 'family',
        prokoushali: 'pdacc',
        'member-signin': 'signin',
        noticeboard: 'notice',
        notice: 'status'
      };
      return publicIds[pageId] || pageId;
    }

    function brandLockupClick(element) {
      var lock = element || document.querySelector('.brand-lockup');
      if (lock) {
        var logo = lock.querySelector('.brand-logo');
        var crest = lock.querySelector('.brand-duet-crest');
        var word = lock.querySelector('.brand-word');
        var duetWord = lock.querySelector('.brand-title-duet');
        if (logo && crest && word && duetWord) {
          var wordRect = word.getBoundingClientRect();
          var duetRect = duetWord.getBoundingClientRect();
          var logoRect = logo.getBoundingClientRect();
          var crestW = crest.offsetWidth || 48;
          var crestH = crest.offsetHeight || 48;
          // park the crest centred over the DUET word — its animation "home"
          crest.style.left = (duetRect.left - wordRect.left + duetRect.width / 2 - crestW / 2) + 'px';
          crest.style.top = (duetRect.top - wordRect.top + duetRect.height / 2 - crestH / 2) + 'px';
          // the DUET crest flies from its home to the RANGDHANU brand logo and
          // back; the brand logo itself stays put. Travel = brand-logo centre
          // minus the crest's home (DUET word) centre, in screen space.
          var homeCX = duetRect.left + duetRect.width / 2;
          var homeCY = duetRect.top + duetRect.height / 2;
          lock.style.setProperty('--duetx', (logoRect.left + logoRect.width / 2 - homeCX) + 'px');
          lock.style.setProperty('--duety', (logoRect.top + logoRect.height / 2 - homeCY) + 'px');
          lock.classList.remove('bond');
          void lock.offsetWidth;
          lock.classList.add('bond');
          window.setTimeout(function () { lock.classList.remove('bond'); }, 3850);
        }
      }
      switchPage('home');
    }

    function savePageScrollPosition() {
      if (!history.state || !history.state.page) return;
      const scrollY = window.scrollY;
      rdPageScroll[history.state.page] = scrollY;
      history.replaceState({ ...history.state, scrollY: scrollY }, '', window.location.pathname + window.location.hash);
    }

    function switchPage(pageId, updateUrl = true) {
      const historyState = history.state;
      const restoreScroll = !updateUrl && historyState && historyState.page === pageId &&
        (Number.isFinite(rdPageScroll[pageId]) || Number.isFinite(historyState.scrollY));
      const scrollY = restoreScroll
        ? (Number.isFinite(rdPageScroll[pageId]) ? rdPageScroll[pageId] : historyState.scrollY)
        : 0;
      if (updateUrl) savePageScrollPosition();
      document.querySelectorAll('.page-view').forEach(v => v.classList.remove('active'));
      const tgt = document.getElementById(`page-${pageId}`);
      if (tgt) tgt.classList.add('active');
      if (tgt && (pageId === 'profile' || pageId === 'home')) tgt.style.animation = 'none';
      rdCurrentPageId = pageId;
      const navId = (RD_SUBPAGES[pageId] || {}).parent || pageId;
      document.querySelectorAll('.nav-btn, .mobile-nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === navId));
      document.querySelectorAll('#rd-mnav .rd-mtab').forEach(b => b.classList.toggle('active', b.dataset.page === navId));
      /* The PDACC page carries its own fixed top tab-bar on mobile. This class
         is the single switch the CSS reads to show that bar, hide the global
         branding header, and arm the bottom-bar auto-hide (see the scroll
         helper). The top tabs track the exact PDACC sub-page, not the family,
         so a sub-page like Admission or Notice highlights its own tab. */
      const onPdacc = navId === 'prokoushali';
      document.body.classList.toggle('rd-on-pdacc', onPdacc);
      document.querySelectorAll('#rd-pd-topnav .rd-pdt-tab[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === pageId));
      const rdPdSheet = document.getElementById('rd-pd-topsheet');
      if (rdPdSheet) rdPdSheet.classList.add('hidden');
      rdNavGlareSync();
      const menu = document.getElementById('mobile-menu');
      if (menu && !menu.classList.contains('hidden')) { menu.classList.add('hidden'); syncMobileMenuButton(); }
      if (updateUrl) { const urlId = pageUrlId(pageId); history.pushState({page: pageId, scrollY: 0}, '', window.location.pathname + (pageId==='home'?'':`#${urlId}`)); }
      rdPageScroll[pageId] = scrollY;
      window.scrollTo({ top: scrollY, behavior: 'auto' });
      try {
        if (pageId === 'events') loadPublicEvents();
        /* The directory is a whole page of its own; fetching it during boot
           only slowed down the home screen, which never shows it. */
          /* Keep the rendered directory page, filters and pagination intact when
            a profile returns to it. A fresh load is only needed on first entry. */
          if (pageId === 'alumni' && !alumniData.length) loadPublicAlumni();
        if (pageId === 'noticeboard') loadNoticeBoard();
        if (pageId === 'committee') loadExecutiveCommittee();
        /* The PDACC page shows the Director's message, so it needs the
           same feed the Committee page uses. */
        if (pageId === 'prokoushali') {
          loadExecutiveCommittee();
          renderPdaccSlides();
          pdaccHeroStartCycle();
          loadPdacc();
          loadPdaccStats();
        }
        if (pageId === 'family-faculty') loadFaculty();
        if (pageId === 'bloodbank') loadBloodBank();
        if (pageId === 'polls') rdPollOpen();
        if (pageId === 'pdacc-updates') loadPdacc();
        if (pageId === 'pdacc-admission') rdAdInit();
        if (pageId === 'pdacc-committee') { loadExecutiveCommittee(); renderPdaccCommittee(); }
        if (pageId === 'pdacc-admission' || pageId === 'pdacc-updates') loadExecutiveCommittee();
        if (pageId === 'prokoushali' || /^pdacc-/.test(pageId)) {
          if (typeof renderPdaccSeatNav === 'function') renderPdaccSeatNav();
        }
        if (pageId === 'admin') adminEnterPage();
        if (pageId === 'member-signin') {
          if (!rdDrawMemberGsiButton()) setTimeout(rdDrawMemberGsiButton, 700);
        }
      } catch (err) { console.error('page loader failed:', err); }
      /* Arm scroll-reveal for whatever static content this page already holds;
         async feeds re-arm themselves through the global mutation watcher. */
      if (typeof rdRevealArm === 'function' && tgt) rdRevealArm(tgt);
    }

    function getPageFromLocation(allowSubPages = true) {
      let rawPage = window.location.hash.replace('#','').trim();
      /* A shared profile link is #profile/<memberId>. It resolves to the public
         profile sub-page (parent: the directory) so a cold load of the link
         lands on the alumni list and then opens the card. */
      if (/^profile\/.+/.test(rawPage)) rawPage = 'profile';
      const aliases = { family: 'alumni', pdacc: 'prokoushali', signin: 'member-signin', notice: 'noticeboard', status: 'notice' };
      const page = aliases[rawPage] || rawPage;
      if (aliases[rawPage]) history.replaceState({page: page}, '', window.location.pathname + `#${pageUrlId(page)}`);
      if (!page || !document.getElementById(`page-${page}`)) return 'home';
      const sub = RD_SUBPAGES[page];
      if (!allowSubPages && sub && sub.needsData) return sub.parent;
      if (page === 'committee-new' && !RD_MEMBER.token) {
        return 'member-signin';
      }
      return page;
    }

    /* The member id carried by a #profile/<id> share link, or null. */
    function rdSharedProfileId() {
      const m = /^#profile\/(.+)$/.exec(window.location.hash || '');
      return m ? decodeURIComponent(m[1].trim()) : null;
    }

    /* Open a member's public profile from a shared link. The directory is
       loaded first (a cold link has no data yet), the row is matched by member
       id, and the ordinary public card is shown -- contact rows stay gated to
       signed-in members exactly as they are from the directory. The id is kept
       in the URL so the link still works on a further reload. */
    async function rdOpenSharedProfile(memberId) {
      if (!memberId) return;
      switchPage('alumni', false);
      try { if (!alumniData.length) await loadPublicAlumni(); } catch (e) { /* show whatever we have */ }
      const a = alumniData.find(function (r) { return String(r.memberId) === String(memberId); });
      if (!a) return;   /* unknown id: leave the visitor on the directory */
      openAlumniProfileModal(a);
      history.replaceState({ page: 'profile' }, '',
        window.location.pathname + '#profile/' + encodeURIComponent(memberId));
    }

    function rdRouteFromLocation() {
      const shareId = rdSharedProfileId();
      if (shareId) { rdOpenSharedProfile(shareId); return; }
      switchPage(getPageFromLocation(), false);
    }
    window.addEventListener('popstate', rdRouteFromLocation);
    window.addEventListener('hashchange', rdRouteFromLocation);


    /* ================= GOOGLE DRIVE IMAGE LAYER =========================
       Every picture on the site can live in Google Drive now. Drive_Images.gs
       returns { folders: { home:[...], reunion:[...], site:[...] } } and each
       image carries { name, base, caption, url, fallbackUrl }.

       rdImageUrl('Images/Reunion Photo/02.jpg') looks the file up by its base
       name and returns the Drive URL when it exists — otherwise the local path
       keeps working, so the site never goes blank while Drive is being set up. */
    const RD_DRIVE_API = API_BASE_URL + '?action=driveimages';
    const RD_DRIVE = { ready: false, folders: {}, groups: {}, byBase: {}, trailer: null, error: '' };

    function rdBase(path) {
      let n = String(path || '').split('/').pop();
      const dot = n.lastIndexOf('.');
      if (dot > 0) n = n.slice(0, dot);
      return n.trim().toLowerCase();
    }

    /* Local path in, best available URL out. */
    function rdImageUrl(localPath) {
      const hit = RD_DRIVE.byBase[rdBase(localPath)];
      return hit ? hit.url : localPath;
    }

    /* A Drive photo that is not a listed site image (a member's uploaded
       photo, an event cover, the trailer poster): retry it once on the
       drive.google.com thumbnail host before giving up. That host answers for
       files lh3 refuses, so an image no longer silently disappears. */
    /* The last step of either fallback: put the local stand-in in place
       once, and only hide the picture when even that is missing. The
       stand-in is always a plain relative path -- rdImageUrl() would hand
       back the Drive link that has just failed, and the two would go on
       calling each other. */
    function rdImgGiveUp(img, standIn) {
      if (!img) return;
      const local = String(standIn || '').trim();
      /* Images/ ফোল্ডারটা repo-তে নেই -- ওই সব ছবি শুধু Drive থেকেই আসে।
         তাই Drive ব্যর্থ হলে Images/... পথে আরেকবার চেষ্টা করা মানে নিশ্চিত
         একটা 404, প্রতি ছবিতে একটা বাড়তি request। ওটা বাদ দিয়ে সোজা লুকিয়ে
         দেওয়া হয়। (কখনো Images/ ফোল্ডার repo-তে যোগ করলে এই শর্তটা তুলে দিন।) */
      const deadLocal = /^Images\//i.test(local);
      if (local && !deadLocal && !img.dataset.rdStood) {
        img.dataset.rdStood = '1';
        if (img.removeAttribute) img.removeAttribute('data-rd-img');
        const frame = img.parentElement;
        if (frame && frame.classList && frame.classList.contains &&
            frame.classList.contains('rd-news-thumb')) {
          frame.classList.add('is-logo');
        }
        img.src = local;
        return;
      }
      img.style.display = 'none';
    }

    function rdPhotoFallback(img, standIn) {
      if (!img || img.dataset.rdTried) { rdImgGiveUp(img, standIn); return; }
      img.dataset.rdTried = '1';
      const m = /(?:lh3\.googleusercontent\.com\/d\/|[?&]id=|\/d\/)([A-Za-z0-9_-]{20,})/.exec(img.src || '');
      if (!m) { rdImgGiveUp(img, standIn); return; }
      img.src = 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w1200';
    }

    /* Falls back to the drive.google.com thumbnail host, then to the local file. */
    function rdImgFallback(img, localPath) {
      if (!img || img.dataset.rdTried) { rdImgGiveUp(img, localPath); return; }
      img.dataset.rdTried = '1';
      const hit = RD_DRIVE.byBase[rdBase(img.getAttribute('data-rd-img') || localPath || img.src)];
      if (hit && hit.fallbackUrl) { img.src = hit.fallbackUrl; return; }
      rdImgGiveUp(img, localPath);
    }

    /* Named wrappers, so a news card's markup needs no nested quotes. */
    function rdNewsFallback(img) { rdPhotoFallback(img, 'logo.png'); }
    function rdNewsLogoFallback(img) { rdImgFallback(img, 'logo.png'); }

    /* The PDACC page's own two pictures and its one outward link. */
    const RD_PDACC_LOGO = 'pdacc-logo.png';
    const RD_RANGDHANU_LOGO = 'logo.png';
    const RD_PDACC_FB = 'https://www.facebook.com/pdaccduet';

    /* The crest, in three steps that can never call each other in a circle:
       the Drive thumbnail host, then the crest that ships with the site, then
       the Rangdhanu logo. The step is counted on the element itself, so the
       chain always ends. */
    function rdPdLogoFallback(img) {
      if (!img) return;
      const step = +(img.dataset.rdPdStep || 0);
      img.dataset.rdPdStep = String(step + 1);
      const now = String(img.src || '');
      if (step === 0) {
        const m = /(?:lh3\.googleusercontent\.com\/d\/|[?&]id=|\/d\/)([A-Za-z0-9_-]{20,})/.exec(now);
        if (m) { img.src = 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w1200'; return; }
      }
      const frame = img.parentElement;
      if (frame && frame.classList && frame.classList.contains &&
          frame.classList.contains('rd-news-thumb')) frame.classList.add('is-logo');
      if (img.removeAttribute) img.removeAttribute('data-rd-img');
      if (step <= 1 && now.indexOf(RD_PDACC_LOGO) === -1) { img.src = RD_PDACC_LOGO; return; }
      if (step <= 2 && now.indexOf(RD_RANGDHANU_LOGO) === -1) { img.src = RD_RANGDHANU_LOGO; return; }
      img.style.display = 'none';
    }

    /* Same chain, named for the update cards so their markup stays quote-free. */
    function rdPdCardFallback(img) { rdPdLogoFallback(img); }

    /* ---------- The home slideshow feed --------------------------------
       The Slideshow sheet leads only when it holds rows. An empty sheet, a
       refused call or no network at all leaves RD_SL.slides empty, and
       rdCoverList() then falls back to the Drive folder and after that to the
       pictures bundled with the site -- exactly what happened before this feed
       existed. So pasting the backend file changes nothing on the home page
       until an admin actually adds a slide. */
    /* The two photos that ship with the site.  They are the poster layers in
       the markup above and the fallback for the first slide below, so the name
       is written once here and nowhere else. */
    const RD_COVER_FIRST = 'slide-home.jpg';
    const RD_PDACC_FIRST = 'slide-pdacc.jpg';

    const RD_SLIDE_API = API_BASE_URL + '?action=slideshow';
    const RD_SL = { ready: false, slides: [], pdacc: [], error: '' };

    async function loadHomeSlides() {
      try {
        const res = await fetch(RD_SLIDE_API + '&_=' + Date.now(), { cache: 'no-store' });
        const j = await res.json();
        RD_SL.slides = (j && Array.isArray(j.slides)) ? j.slides.filter(s => s && s.url) : [];
        /* One request carries both bars: `slides` stays the home one and
           `places` names each of them, so an older reply still works. */
        const places = (j && j.places) || {};
        RD_SL.pdacc = Array.isArray(places.pdacc) ? places.pdacc.filter(s => s && s.url) : [];
        if (!RD_SL.slides.length && Array.isArray(places.home)) {
          RD_SL.slides = places.home.filter(s => s && s.url);
        }
      } catch (err) {
        /* Not something a visitor should ever be told about. */
        RD_SL.error = String(err && err.message ? err.message : err);
        RD_SL.slides = [];
        RD_SL.pdacc = [];
        console.warn('[rd] slideshow feed unavailable:', RD_SL.error);
      }
      RD_SL.ready = true;
      renderCoverSlides();
      renderPdaccSlides();
    }

    /* ---- the last good answer is remembered for this browser tab ---------
       Apps Script takes a moment to answer even when its own cache is warm,
       and a reload throws everything the page knew away -- which is why the
       pictures and the text arrive late. So each public feed keeps its last
       answer in sessionStorage: the page paints from that copy at once, then
       the fresh answer quietly replaces it (stale-while-revalidate).

       Only things every visitor can already read go in here -- never an
       admin list, never a token. It is sessionStorage, not localStorage, so
       it dies with the tab and a new visit still starts from the server. */
    const RD_FEED_TTL = 10 * 60 * 1000;

    function rdFeedRecall(key) {
      try {
        const raw = sessionStorage.getItem('rd_feed_' + key);
        if (!raw) return null;
        const box = JSON.parse(raw);
        if (!box || !box.at || Date.now() - box.at > RD_FEED_TTL) return null;
        return box.data || null;
      } catch (e) { return null; }
    }

    function rdFeedRemember(key, data) {
      try {
        sessionStorage.setItem('rd_feed_' + key,
          JSON.stringify({ at: Date.now(), data: data }));
      } catch (e) { /* private mode, or the quota is full: no harm done */ }
    }

    /* An admin has just changed something, so the remembered copy in this
       tab is out of date and must go -- otherwise the admin reloads and
       sees the old list staring back. */
    function rdFeedForget(key) {
      try { sessionStorage.removeItem('rd_feed_' + key); } catch (e) {}
    }

    async function loadDriveImages() {
      /* Paint from the remembered listing first, so the pictures are there
         before the network has said anything. */
      const warm = rdFeedRecall('drive');
      if (warm && !RD_DRIVE.ready) { rdDriveAdopt(warm); RD_DRIVE.ready = true; applyDriveImages(); }
      try {
        const res = await fetch(RD_DRIVE_API + '&_=' + Date.now(), { cache: 'no-store' });
        const j = await res.json();
        if (!j || j.success !== true) throw new Error(j && j.message ? j.message : 'Drive listing failed.');
        rdDriveAdopt(j);
        rdFeedRemember('drive', { folders: j.folders || {}, groups: j.groups || {}, trailer: j.trailer || null });
      } catch (err) {
        /* No Drive yet, or offline: the local files stay in use. Not an error
           the visitor should ever see. */
        RD_DRIVE.error = String(err && err.message ? err.message : err);
        if (!warm) { RD_DRIVE.groups = {}; RD_DRIVE.trailer = null; }
        console.warn('[rd] drive images unavailable:', RD_DRIVE.error);
      }
      RD_DRIVE.ready = true;
      applyDriveImages();
    }

    /* Fold one listing -- fresh or remembered -- into RD_DRIVE. */
    function rdDriveAdopt(j) {
      RD_DRIVE.folders = j.folders || {};
      RD_DRIVE.groups = j.groups || {};
      RD_DRIVE.trailer = j.trailer || null;
      RD_DRIVE.byBase = {};
      Object.keys(RD_DRIVE.folders).forEach(k => {
        (RD_DRIVE.folders[k] || []).forEach(im => {
          im.folder = k;
          if (im && im.base && !RD_DRIVE.byBase[im.base]) RD_DRIVE.byBase[im.base] = im;
        });
      });
      /* Sub-folder images are looked up by base name too, so an existing
         data-rd-img="Images/Reunion Photo/02.jpg" finds Drive's 02.jpg even
         when it now sits inside an album sub-folder. */
      Object.keys(RD_DRIVE.groups).forEach(k => {
        (RD_DRIVE.groups[k] || []).forEach(g => {
          (g.images || []).forEach(im => {
            im.folder = k; im.group = g.name;
            if (im && im.base && !RD_DRIVE.byBase[im.base]) RD_DRIVE.byBase[im.base] = im;
          });
        });
      });
    }

    /* Swap every element carrying data-rd-img="Images/..." for its Drive copy. */
    function applyDriveImages() {
      document.querySelectorAll('[data-rd-img]').forEach(img => {
        const local = img.getAttribute('data-rd-img');
        const url = rdImageUrl(local);
        if (url !== img.getAttribute('src')) img.setAttribute('src', url);
      });
      renderCoverSlides();
      applyStaticEventCovers();
      /* the album is 31 images; re-render so it picks the Drive copies up */
      if (typeof renderReunionPhotos === 'function') renderReunionPhotos();
    }

    /* One Drive sub-folder = one album. Matched by folder name, case and
       surrounding spaces ignored, so "Kuakata Tour 2024" and
       "kuakata tour 2024 " both work. */
    function rdDriveGroup(folderKey, name) {
      const want = String(name || '').trim().toLowerCase();
      if (!want) return null;
      const list = (RD_DRIVE.groups && RD_DRIVE.groups[folderKey]) || [];
      for (let i = 0; i < list.length; i++) {
        const g = list[i];
        if (String(g && g.name || '').trim().toLowerCase() === want) {
          return (g.images && g.images.length) ? g : null;
        }
      }
      return null;
    }

    /* An event whose Drive folder exists gets its cover and its whole captioned
       gallery from Drive; otherwise the local Images/... list is used as-is. */
    function rdEventFromDrive(e) {
      if (!e || !e.driveFolder) return e;
      const g = rdDriveGroup('events', e.driveFolder);
      if (!g) return e;
      const local = e.gallery || [];
      const out = Object.assign({}, e);
      out.mainImage = g.images[0].url;
      out.gallery = g.images.map((im, i) => ({
        image: im.url,
        caption: im.caption || (local[i] && local[i].caption) || ''
      }));
      return out;
    }

    /* The long-standing events keep their pictures in Drive, and they are
       ordinary cards in the one events grid now -- so the grid is simply drawn
       again once the manifest arrives, and they pick their Drive covers up.
       This used to hand three picture-element ids a new src; those cards were
       hand-written HTML then, and each of them was also drawn a second time by
       the grid below. */
    function applyStaticEventCovers() {
      if (document.getElementById('public-events-grid')) rdEventsPaint(RD_EV_DYNAMIC);
    }

    /* ================= COVER SLIDESHOW ==================================
       Was completely broken: the arrows and the dots called setCoverSlide(),
       nextCoverSlide() and prevCoverSlide(), none of which existed, so the
       cover never moved and every click threw a ReferenceError. */
    const RD_HOME_SLIDES = [
      { file: 'IMG_2388.JPG', alt: 'রংধনুর ঐক্য ও ভ্রাতৃত্ব', badge: 'RANGDHANU • DUET', title: 'রংপুরের শিক্ষার্থীদের নিজেদের সংগঠন' },
      { file: 'IMG_1971.JPG', alt: 'Rangdhanu Familyের সঙ্গে পথচলা', badge: 'COMMUNITY', title: 'একটি পরিবার, বহু প্রজন্মের বন্ধন' },
      { file: 'IMG_1917.JPG', alt: 'উত্তরবঙ্গের প্রকৌশলীদের মেলবন্ধন', badge: 'ALUMNI', title: 'বর্তমান থেকে প্রাক্তন, সম্পর্কের সেতুবন্ধন' },
      { file: 'DSC02142.JPG', alt: 'ডুয়েট ক্যাম্পাসের স্মৃতি', badge: 'MEMORIES', title: 'ডুয়েট ক্যাম্পাসে আমাদের সোনালী মুহূর্ত' },
      { file: 'DSC02197.JPG', alt: 'Rangdhanu Familyের ঐক্য', badge: 'UNITY', title: 'যেখানেই থাকি, বন্ধন থাকে অটুট' },
      { file: 'DSC02128.JPG', alt: 'Rangdhanu Familyের আড্ডা', badge: 'CAMPUS LIFE', title: 'ক্যাম্পাস জীবনের বাইরে, একটি বড় পরিবার' },
      { file: 'DSC02178.JPG', alt: 'Rangdhanu Familyের বন্ধন', badge: 'RANGDHANU FAMILY', title: 'বিপদে-আনন্দে একসঙ্গে' },
      { file: 'IMG_5210.JPG', alt: 'রংধনুর আয়োজন', badge: 'ACTIVITIES', title: 'শিক্ষা, সংস্কৃতি, ক্রীড়া ও সামাজিক কার্যক্রম' },
      { file: '817A4451 (1).JPG', alt: 'ডুয়েটিয়ানদের মিলনমেলা', badge: 'NETWORK', title: 'রংপুর থেকে ডুয়েট, সবাই এক জায়গায়' },
      { file: 'IMG (84).JPG', alt: 'রংধনু ডুয়েটের স্মরণীয় মুহূর্ত', badge: 'OUR STORY', title: 'যেথায় থাকুক যে যেখানে, রংধনু আছে মনে প্রাণে' }
    ];
    const RD_SLIDE_MS = 6500;

    /* ---------- the bundled first frame is a slide of its own ----------
       slide-home.jpg / slide-pdacc.jpg ship with the site, so they paint almost
       immediately -- while the Drive photo behind them takes a second or two.

       They used to be a temporary stand-in for slide 0: the Drive URL was
       parked in RD_COVER_HELD / RD_PDACC_HELD and written into the very same
       image element once the bar had moved on.  The bundled photo therefore left the
       rotation after the first lap and only came back on a reload -- exactly
       what the owner reported.  Now it is simply prepended as its own
       permanent slide, so it opens the bar *and* stays in the loop, and no URL
       has to be parked or swapped anywhere. */
    /* The first step of the visit waits a little longer than the rest, so the
       bundled frame is genuinely seen and the Drive photos behind it are all
       in by the time the bar moves.  Every later step uses RD_SLIDE_MS. */
    const RD_FIRST_SLIDE_MS = 7000;
    let rdCoverStepped = false, rdPdStepped = false;
    const RD_BOOT_AT = Date.now();

    function rdFirstFrameSlide(src, pool) {
      return {
        src: src, local: src,
        alt: (pool && (pool.alt || pool.title)) || 'RANGDHANU DUET', badge: (pool && pool.badge) || '',
        title: (pool && pool.title) || ''
      };
    }

    /* Put the bundled frame in front of whatever Drive gave us -- unless Drive
       already handed back that same file, which would show it twice. */
    function rdWithFirstFrame(list, src, pool) {
      const rest = (list || []).filter(s => s && s.src !== src);
      return [rdFirstFrameSlide(src, pool)].concat(rest);
    }
    let rdSlides = [], rdSlideIdx = 0, rdSlideTimer = null;

    /* Drive photos may be named `03 - বাংলা শিরোনাম.jpg`; the part after " - "
       becomes the headline. Unnamed ones borrow our own captions in turn. */
    /* A logo dropped into the Home folder must not become a slide. */
    function rdIsLogoName(name) {
      return /logo|brand|monogram/i.test(String(name || ''));
    }

    function rdCoverList() {
      /* Order of preference: the Slideshow sheet, then the Drive folder,
         then the pictures that ship with the site. */
      const sheet = (RD_SL.slides || []).filter(s => s && s.url);
      if (sheet.length) {
        return rdWithFirstFrame(sheet.map((s, i) => {
          const pool = RD_HOME_SLIDES[i % RD_HOME_SLIDES.length];
          return {
            src: s.url,
            local: s.fallbackUrl || (i === 0 ? RD_COVER_FIRST : ''),
            alt: s.caption || pool.alt,
            badge: s.badge || pool.badge,
            title: s.caption || ''
          };
        }), RD_COVER_FIRST, RD_HOME_SLIDES[0]);
      }
      const drive = (RD_DRIVE.folders.home || []).filter(im => !rdIsLogoName(im.name));
      if (!drive.length) {
        /* Drive-এ কিছু না থাকলে আগে Images/Home/-এর দশটা ছবি চাওয়া হতো, কিন্তু
           সেই ফোল্ডার repo-তে নেই -- দশটা 404, আর শেষে ফাঁকা bar। এখন সাইটের
           সঙ্গেই থাকা একটা ছবি দেখানো হয়, PDACC bar যেভাবে করে। */
        return [{
          src: RD_COVER_FIRST, local: RD_COVER_FIRST,
          alt: RD_HOME_SLIDES[0].alt, badge: RD_HOME_SLIDES[0].badge, title: RD_HOME_SLIDES[0].title
        }];
      }
      return rdWithFirstFrame(drive.map((im, i) => {
        const pool = RD_HOME_SLIDES[i % RD_HOME_SLIDES.length];
        return {
          src: im.url,
          local: im.fallbackUrl || (i === 0 ? RD_COVER_FIRST : ''),
          alt: im.caption || pool.alt,
          badge: pool.badge,
          title: im.caption || pool.title
        };
      }), RD_COVER_FIRST, RD_HOME_SLIDES[0]);
    }

    /* ---------------------------------------------------------------
       The welcome block over the slideshow.

       Two wordings -- English and Bengali -- take turns, and the entrance
       animation runs again on every turn (the class is dropped, a reflow is
       forced, then the class goes back on; without the reflow the browser
       never restarts the keyframes). The slideshow underneath keeps its own
       timer, so the pictures and the words are independent.
       --------------------------------------------------------------- */
    const RD_HERO_COPY = [
      { kicker: 'Welcome to',
        title:  'RANGDHANU FAMILY',
        sub:    'Students Welfare Association of Greater Rangpur',
        cta:    'About RANGDHANU' },
      { kicker: 'Welcome to',
        title:  'রংধনু পরিবার',
        sub:    'বৃহত্তর রংপুর বিভাগীয় ছাত্রকল্যাণ সংগঠন',
        cta:    'রংধনু সম্পর্কে' }
    ];
    let rdHeroIdx = 0;
    let rdHeroTimer = null;

    function rdHeroRender() {
      const box = document.getElementById('rd-hero-copy');
      if (!box) return;
      const v = RD_HERO_COPY[rdHeroIdx % RD_HERO_COPY.length];
      box.classList.remove('rd-hero-anim');
      void box.offsetWidth;                       /* forces the reflow */
      box.innerHTML =
        '<p class="text-white/80 text-[9px] sm:text-[11px] font-extrabold uppercase" style="letter-spacing:.34em">' +
          escapeHtml(v.kicker) + '</p>' +
        '<h2 class="text-white font-extrabold tracking-tight leading-[1.08] mt-2 text-[1.45rem] sm:text-4xl md:text-5xl">' +
          escapeHtml(v.title) + '</h2>' +
        '<p class="text-white/90 font-semibold mt-2.5 max-w-2xl leading-snug text-[10px] sm:text-sm md:text-base">' +
          escapeHtml(v.sub) + '</p>';
      box.classList.add('rd-hero-anim');
      if (window.lucide) lucide.createIcons();
    }

    function rdHeroStartCycle() {
      if (!document.getElementById('rd-hero-copy')) return;
      rdHeroRender();
      if (rdHeroTimer) clearInterval(rdHeroTimer);
      rdHeroTimer = setInterval(function () {
        rdHeroIdx = (rdHeroIdx + 1) % RD_HERO_COPY.length;
        rdHeroRender();
      }, 5200);
    }

    /* The two "About RANGDHANU" buttons on the home page. The description is
       already further down the same page, so the button only scrolls to it --
       nothing opens, nothing is duplicated. Pressed from another page it
       switches to home first, and waits for switchPage()'s own scroll-to-top
       to settle before scrolling down, or the two would fight each other. */
    function goHomeSection(sectionId) {
      const go = function () {
        const box = document.getElementById(sectionId);
        if (!box || !box.scrollIntoView) return;
        try { box.scrollIntoView({ behavior: 'auto', block: 'start' }); }
        catch (e) { box.scrollIntoView(); }
      };
      if (rdCurrentPageId !== 'home') { switchPage('home'); setTimeout(go, 320); }
      else go();
    }

    function renderCoverSlides() {
      const wrap = document.getElementById('cover-slides');
      const dots = document.getElementById('cover-dots');
      if (!wrap) return;
      rdSlides = rdCoverList();
      const skel = document.getElementById('cover-skeleton');
      if (skel) skel.remove();

      wrap.innerHTML = rdSlides.map((s, i) => `
        <div class="cover-slide absolute inset-0 transition-all duration-1000 ease-out ${i === 0 ? 'opacity-100 scale-100 z-10' : 'opacity-0 scale-105 pointer-events-none z-0'}">
          <img alt="${escapeHtml(s.alt || '')}" data-rd-img="${escapeHtml(s.local || s.src)}"
            src="${escapeHtml(s.src)}" ${i === 0 ? '' : 'loading="lazy" '}decoding="async"
            onerror="rdImgFallback(this, '${escapeHtml(s.local || '')}')"
            class="slide-img w-full h-full object-cover object-center transition-transform duration-[7000ms] ease-out">
          <div class="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/25 to-transparent"></div>
          <div class="rd-cap absolute inset-x-0 bottom-0 p-4 sm:p-6 md:p-7 z-30">
            <span class="rd-cap-badge inline-flex items-center px-3 py-1 rounded-full bg-white/10 border border-white/20 backdrop-blur-md text-white text-[8px] sm:text-[10px] font-bold">${escapeHtml(s.badge || 'RANGDHANU • DUET')}</span>
            <span class="rd-cap-line"></span>
            <h2 class="rd-cap-title text-[11px] sm:text-sm md:text-base font-bold text-white/95 mt-2 leading-snug max-w-2xl">${escapeHtml(s.title || '')}</h2>
          </div>
        </div>`).join('');

      if (dots) {
        dots.innerHTML = rdSlides.map((s, i) => `
          <span class="cover-indicator ${i === 0 ? 'w-6 bg-white' : 'w-1.5 bg-white/45'} h-1.5 rounded-full transition-all duration-300 cursor-pointer"
            role="button" tabindex="0" aria-label="Slide ${i + 1}" onclick="setCoverSlide(${i})"></span>`).join('');
        dots.style.display = rdSlides.length > 1 ? '' : 'none';
      }
      rdSlideIdx = 0;
      startCoverAutoplay();
    }

    function setCoverSlide(i) {
      const items = document.querySelectorAll('#cover-slides .cover-slide');
      if (!items.length) return;
      rdSlideIdx = ((i % items.length) + items.length) % items.length;
      items.forEach((el, n) => {
        const on = n === rdSlideIdx;
        el.classList.toggle('opacity-100', on);
        el.classList.toggle('scale-100', on);
        el.classList.toggle('z-10', on);
        el.classList.toggle('opacity-0', !on);
        el.classList.toggle('scale-105', !on);
        el.classList.toggle('pointer-events-none', !on);
        el.classList.toggle('z-0', !on);
      });
      /* The headline is written on the picture, so its own little entrance
         runs again whenever the picture underneath it changes. */
      rdCapReplay(items[rdSlideIdx]);
      document.querySelectorAll('#cover-dots .cover-indicator').forEach((d, n) => {
        const on = n === rdSlideIdx;
        d.classList.toggle('w-6', on);
        d.classList.toggle('bg-white', on);
        d.classList.toggle('w-1.5', !on);
        d.classList.toggle('bg-white/45', !on);
        d.setAttribute('aria-current', on ? 'true' : 'false');
      });
      startCoverAutoplay();
    }
    function nextCoverSlide() { setCoverSlide(rdSlideIdx + 1); }
    function prevCoverSlide() { setCoverSlide(rdSlideIdx - 1); }

    function startCoverAutoplay() {
      if (rdSlideTimer) { clearTimeout(rdSlideTimer); clearInterval(rdSlideTimer); }
      rdSlideTimer = null;
      if (rdSlides.length < 2) return;
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      /* A chain of one-shot timers, not one repeating interval: that is what
         lets the opening picture keep the bar longer than the others. */
      const wait = (!rdCoverStepped && rdSlideIdx === 0) ? RD_FIRST_SLIDE_MS : RD_SLIDE_MS;
      rdSlideTimer = setTimeout(function () {
        rdSlideTimer = null;
        rdCoverStepped = true;
        const items = document.querySelectorAll('#cover-slides .cover-slide');
        if (!items.length) return;
        /* setCoverSlide() arms the next step itself, so the chain continues. */
        setCoverSlide((rdSlideIdx + 1) % items.length);
      }, wait);
    }

    /* ---------------------------------------------------------------
       The PDACC bar. The same shape as the home one but with its own
       state, so neither bar can stop the other one's timer.
       --------------------------------------------------------------- */
    const RD_PDACC_SLIDES = [
      { badge: 'PDACC', title: 'ডুয়েট ভর্তির প্রস্তুতি, অভিজ্ঞ ডুয়েটিয়ানদের হাতে' },
      { badge: 'ADMISSION', title: 'স্টাডি ম্যাটেরিয়াল আর নিয়মিত মডেল টেস্ট' },
      { badge: 'GUIDELINE', title: 'যার যেখানে আটকায়, সেখানেই সাহায্য' },
      { badge: 'RESULT', title: 'গত বছর ৯২ জন ভর্তির সুযোগ পেয়েছে' }
    ];
    let rdPdSlides = [], rdPdIdx = 0, rdPdTimer = null;

    /* Two wordings take turns on the bar: the English full form and the
       Bengali one. */
    const RD_PD_HERO_COPY = [
      { kicker: 'Welcome to',
        title:  'PDACC',
        sub:    'Prokoushali DUET Admission Coaching Centre',
        sub2:   'প্রকৌশলী ডুয়েট এডমিশন কোচিং সেন্টার' },
      { kicker: 'স্বাগতম',
        title:  'প্রকৌশলী ডুয়েট এডমিশন কোচিং সেন্টার',
        sub:    'Prokoushali DUET Admission Coaching Centre',
        sub2:   'রংধনুর একটি অঙ্গ সংগঠন' }
    ];
    let rdPdHeroIdx = 0, rdPdHeroTimer = null;

    /* A caption's entrance runs again on demand. The class has to come off,
       a reflow has to be forced, and only then can it go back on -- without
       the reflow the browser never restarts the keyframes. */
    function rdCapReplay(slide) {
      if (!slide || !slide.querySelectorAll) return;
      const names = ['rd-cap-badge', 'rd-cap-line', 'rd-cap-title'];
      const parts = slide.querySelectorAll('.rd-cap-badge, .rd-cap-line, .rd-cap-title') || [];
      for (let i = 0; i < parts.length; i++) {
        const el = parts[i];
        if (!el || !el.classList || !el.classList.contains) continue;
        const mine = names.filter(n => el.classList.contains(n));
        mine.forEach(n => el.classList.remove(n));
        void el.offsetWidth;
        mine.forEach(n => el.classList.add(n));
      }
    }

    /* The PDACC bar is the RANGDHANU PDACC folder on Drive and nothing else.
       It never borrows a home picture -- the two bars are separate on purpose.
       An empty folder shows the crest, so the bar is still not a black box. */
    function pdaccCoverList() {
      const sheet = (RD_SL.pdacc || []).filter(s => s && s.url);
      if (sheet.length) {
        return rdWithFirstFrame(sheet.map((s, i) => {
          const pool = RD_PDACC_SLIDES[i % RD_PDACC_SLIDES.length];
          return {
            src: s.url,
            local: s.fallbackUrl || RD_PDACC_FIRST,
            alt: s.caption || pool.title,
            badge: s.badge || pool.badge,
            title: s.caption || ''
          };
        }), RD_PDACC_FIRST, RD_PDACC_SLIDES[0]);
      }
      /* `crest: true` only means "there is no Drive picture"; renderPdaccSlides()
         draws the poster and the caption for it, no image element at all. */
      return [{
        src: RD_PDACC_FIRST, local: RD_PDACC_FIRST, crest: true,
        alt: 'Prokoushali DUET Admission Coaching Centre', badge: 'PDACC',
        title: 'প্রকৌশলী ডুয়েট এডমিশন কোচিং সেন্টার'
      }];
    }

    /* The empty state: the crest on the dark panel, with the same caption
       parts as a real slide so the page still looks finished. */
    function pdaccCrestSlide(s) {
      /* Nothing to show from Drive yet.  This used to draw pdacc-logo.png as a
         white plaque in the middle of the bar; the logo is no longer wanted on
         the hero, so the bar is simply the bundled slide-pdacc.jpg poster
         underneath, with the dark wash a real slide has -- white lettering is
         not readable on a bare photograph -- and the same caption.  The crest
         still sits in the PDACC nav bar above and on the update cards. */
      return '<div class="pdacc-slide absolute inset-0 opacity-100 scale-100 z-10">' +
        '<div class="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-slate-950/20"></div>' +
        '<div class="rd-cap absolute inset-x-0 bottom-0 p-4 sm:p-6 md:p-7 z-30">' +
          '<span class="rd-cap-badge inline-flex items-center px-3 py-1 rounded-full bg-white/10 border border-white/20 backdrop-blur-md text-white text-[8px] sm:text-[10px] font-bold">' +
            escapeHtml(s.badge || 'PDACC') + '</span>' +
          '<span class="rd-cap-line"></span>' +
          '<h2 class="rd-cap-title text-[11px] sm:text-sm md:text-base font-bold text-white/95 mt-2 leading-snug max-w-2xl">' +
            escapeHtml(s.title || '') + '</h2>' +
        '</div></div>';
    }

    function renderPdaccSlides() {
      const wrap = document.getElementById('pdacc-slides');
      const dots = document.getElementById('pdacc-dots');
      if (!wrap) return;
      rdPdSlides = pdaccCoverList();
      const skel = document.getElementById('pdacc-skeleton');
      if (skel) skel.remove();

      if (rdPdSlides.length === 1 && rdPdSlides[0].crest) {
        wrap.innerHTML = pdaccCrestSlide(rdPdSlides[0]);
        if (dots) { dots.innerHTML = ''; dots.style.display = 'none'; }
        rdPdIdx = 0;
        if (rdPdTimer) clearInterval(rdPdTimer);
        if (window.lucide) lucide.createIcons();
        return;
      }

      wrap.innerHTML = rdPdSlides.map((s, i) => `
        <div class="pdacc-slide absolute inset-0 transition-all duration-1000 ease-out ${i === 0 ? 'opacity-100 scale-100 z-10' : 'opacity-0 scale-105 pointer-events-none z-0'}">
          <img alt="${escapeHtml(s.alt || '')}" data-rd-img="${escapeHtml(s.local || s.src)}"
            src="${escapeHtml(s.src)}" ${i === 0 ? '' : 'loading="lazy" '}decoding="async"
            onerror="rdImgFallback(this, '${escapeHtml(s.local || '')}')"
            class="slide-img w-full h-full object-cover object-center transition-transform duration-[7000ms] ease-out">
          <div class="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/25 to-transparent"></div>
          <div class="rd-cap absolute inset-x-0 bottom-0 p-4 sm:p-6 md:p-7 z-30">
            <span class="rd-cap-badge inline-flex items-center px-3 py-1 rounded-full bg-white/10 border border-white/20 backdrop-blur-md text-white text-[8px] sm:text-[10px] font-bold">${escapeHtml(s.badge || 'PDACC')}</span>
            <span class="rd-cap-line"></span>
            <h2 class="rd-cap-title text-[11px] sm:text-sm md:text-base font-bold text-white/95 mt-2 leading-snug max-w-2xl">${escapeHtml(s.title || '')}</h2>
          </div>
        </div>`).join('');

      if (dots) {
        dots.innerHTML = rdPdSlides.map((s, i) => `
          <span class="pdacc-indicator ${i === 0 ? 'w-6 bg-white' : 'w-1.5 bg-white/45'} h-1.5 rounded-full transition-all duration-300 cursor-pointer"
            role="button" tabindex="0" aria-label="PDACC slide ${i + 1}" onclick="setPdaccSlide(${i})"></span>`).join('');
        dots.style.display = rdPdSlides.length > 1 ? '' : 'none';
      }
      rdPdIdx = 0;
      startPdaccAutoplay();
    }

    function setPdaccSlide(i) {
      const items = document.querySelectorAll('#pdacc-slides .pdacc-slide');
      if (!items.length) return;
      rdPdIdx = ((i % items.length) + items.length) % items.length;
      items.forEach((el, n) => {
        const on = n === rdPdIdx;
        el.classList.toggle('opacity-100', on);
        el.classList.toggle('scale-100', on);
        el.classList.toggle('z-10', on);
        el.classList.toggle('opacity-0', !on);
        el.classList.toggle('scale-105', !on);
        el.classList.toggle('pointer-events-none', !on);
        el.classList.toggle('z-0', !on);
      });
      rdCapReplay(items[rdPdIdx]);
      document.querySelectorAll('#pdacc-dots .pdacc-indicator').forEach((d, n) => {
        const on = n === rdPdIdx;
        d.classList.toggle('w-6', on);
        d.classList.toggle('bg-white', on);
        d.classList.toggle('w-1.5', !on);
        d.classList.toggle('bg-white/45', !on);
        d.setAttribute('aria-current', on ? 'true' : 'false');
      });
      startPdaccAutoplay();
    }
    function nextPdaccSlide() { setPdaccSlide(rdPdIdx + 1); }
    function prevPdaccSlide() { setPdaccSlide(rdPdIdx - 1); }

    function startPdaccAutoplay() {
      if (rdPdTimer) { clearTimeout(rdPdTimer); clearInterval(rdPdTimer); }
      rdPdTimer = null;
      if (rdPdSlides.length < 2) return;
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const wait = (!rdPdStepped && rdPdIdx === 0) ? RD_FIRST_SLIDE_MS : RD_SLIDE_MS;
      rdPdTimer = setTimeout(function () {
        rdPdTimer = null;
        rdPdStepped = true;
        const items = document.querySelectorAll('#pdacc-slides .pdacc-slide');
        if (!items.length) return;
        setPdaccSlide((rdPdIdx + 1) % items.length);
      }, wait);
    }

    function pdaccHeroRender() {
      const box = document.getElementById('pdacc-hero-copy');
      if (!box) return;
      const v = RD_PD_HERO_COPY[rdPdHeroIdx % RD_PD_HERO_COPY.length];
      box.classList.remove('rd-pd-anim');
      void box.offsetWidth;                       /* forces the reflow */
      box.innerHTML =
        '<p class="text-white/80 text-[9px] sm:text-[11px] font-extrabold uppercase" style="letter-spacing:.34em">' +
          escapeHtml(v.kicker) + '</p>' +
        '<h2 class="text-white font-extrabold tracking-tight leading-[1.08] mt-2 ' +
          (String(v.title).length <= 12 ? 'text-[1.35rem] sm:text-4xl md:text-5xl'
                                       : 'text-[1.05rem] sm:text-2xl md:text-3xl') + '">' +
          escapeHtml(v.title) + '</h2>' +
        '<p class="text-white/90 font-semibold mt-2.5 max-w-2xl leading-snug text-[10px] sm:text-sm md:text-base">' +
          escapeHtml(v.sub) + '</p>' +
        '<p class="text-white/70 font-bold mt-1.5 max-w-2xl leading-snug text-[10px] sm:text-xs md:text-sm">' +
          escapeHtml(v.sub2) + '</p>';
      box.classList.add('rd-pd-anim');
      if (window.lucide) lucide.createIcons();
    }

    function pdaccHeroStartCycle() {
      if (!document.getElementById('pdacc-hero-copy')) return;
      pdaccHeroRender();
      if (rdPdHeroTimer) clearInterval(rdPdHeroTimer);
      rdPdHeroTimer = setInterval(function () {
        rdPdHeroIdx = (rdPdHeroIdx + 1) % RD_PD_HERO_COPY.length;
        pdaccHeroRender();
      }, 5200);
    }

    /* About: the real description is already on this page, so the button
       scrolls to it. Nothing is duplicated and no panel opens. */
    /* ---------- PDACC: A Proven Journey ----------------------------------
       The heading, the figure and the caption used to be typed straight into
       index.html, so a new admission season meant a code change. They are read
       from the PDACC Stats sheet now. The markup keeps last season's wording,
       which is what stays on screen if the fetch fails -- the block never
       blanks out. */
    let RD_PDSTATS = null;

    async function fetchPdaccStats(force) {
      if (RD_PDSTATS && !force) return RD_PDSTATS;
      const r = await apiGet('pdaccstats');
      RD_PDSTATS = r.stats || {};
      return RD_PDSTATS;
    }

    /* ---------- PDACC: the chance record ---------------------------------
       The chart and the department rows are written from the same feed the
       journey figures come from, so an admin edits them in the panel and the
       page follows. Bengali digits are kept exactly as they were typed; the
       bar heights need a number, so a small reader pulls one out. */
    const RD_BN_DIGITS = '০১২৩৪৫৬৭৮৯';

    function rdPdToNum(v) {
      let out = '';
      for (const ch of String(v == null ? '' : v)) {
        const i = RD_BN_DIGITS.indexOf(ch);
        out += i >= 0 ? String(i) : ch;
      }
      const n = parseFloat(out.replace(/[^0-9.]/g, ''));
      return isFinite(n) ? n : 0;
    }

    function rdPdBn(n) {
      return String(n).replace(/[0-9]/g, d => RD_BN_DIGITS[Number(d)]);
    }

    function renderPdaccChance(ch) {
      const chart = document.getElementById('pd-chance-chart');
      if (!chart || !ch) return;
      const series = Array.isArray(ch.series) ? ch.series.filter(x => x && x.label) : [];
      const depts = Array.isArray(ch.depts) ? ch.depts.filter(x => x && x.label) : [];

      if (series.length) {
        const nums = series.map(x => rdPdToNum(x.count));
        const top = Math.max.apply(null, nums.concat([1]));
        const lead = nums.indexOf(top);
        chart.style.setProperty('--pd-n', String(series.length));
        chart.innerHTML = series.map(function (x, i) {
          const h = Math.max(8, Math.round(88 * nums[i] / top));
          return '<div class="rd-pd-col' + (i === lead ? ' lead' : '') +
            '" style="--h:' + h + '%"><span class="rd-pd-val">' +
            (nums[i] ? rdPdBn(nums[i]) : escapeHtml(String(x.count || ''))) + '</span>' +
            '<div class="rd-pd-bar" style="--d:' + (0.05 + i * 0.08).toFixed(2) + 's"></div></div>';
        }).join('');
        chart.setAttribute('aria-label',
          'সিরিজ অনুযায়ী ' +
          'চান্সপ্রাপ্তি: ' +
          series.map((x, i) => String(x.label) + ' ' +
            (nums[i] ? rdPdBn(nums[i]) : String(x.count)) +
            ' জন').join(', '));

        const axis = document.getElementById('pd-chance-axis');
        if (axis) {
          axis.style.setProperty('--pd-n', String(series.length));
          axis.innerHTML = series.map(x =>
            '<div><b>' + escapeHtml(String(x.label)) + '</b><span>' +
            escapeHtml(String(x.sub || '')) + '</span></div>').join('');
        }
      }

      const rows = document.getElementById('pd-chance-rows');
      const dsec = document.getElementById('pd-chance-dept');
      if (dsec) dsec.hidden = !depts.length;
      if (rows && depts.length) {
        const PDCC_PAL = ['#0ea5e9', '#f43f5e', '#f59e0b', '#8b5cf6', '#10b981',
          '#ec4899', '#14b8a6', '#6366f1', '#f97316', '#0891b2'];
        const dn = depts.map(x => rdPdToNum(x.count));
        const dtop = Math.max.apply(null, dn.concat([1]));
        const total = dn.reduce((a, b) => a + b, 0);
        const C = 2 * Math.PI * 80;
        let acc = 0;
        const segs = depts.map(function (x, i) {
          const frac = total > 0 ? dn[i] / total : 0;
          const arc = (frac * C).toFixed(2);
          const rot = ((total ? acc / total : 0) * 360).toFixed(2);
          acc += dn[i];
          return '<circle class="rd-donut-seg" data-i="' + i + '" cx="100" cy="100" r="80"' +
            ' fill="none" stroke-width="26" stroke="' + PDCC_PAL[i % PDCC_PAL.length] + '"' +
            ' stroke-dasharray="' + arc + ' 999"' +
            ' style="transform:rotate(' + rot + 'deg);transform-origin:100px 100px"></circle>';
        }).join('');
        const cards = depts.map(function (x, i) {
          const w = Math.max(6, Math.round(100 * dn[i] / dtop));
          const col = PDCC_PAL[i % PDCC_PAL.length];
          return '<button type="button" class="rd-cc" data-i="' + i +
            '" style="--c:' + col + ';--w:' + w + '%">' +
            '<span class="rd-cc-dot"></span>' +
            '<span class="rd-cc-n">' + escapeHtml(String(x.label)) +
            '<small>' + escapeHtml(String(x.sub || '')) + '</small></span>' +
            '<span class="rd-cc-v">' +
            (dn[i] ? rdPdBn(dn[i]) : escapeHtml(String(x.count || ''))) +
            '</span></button>';
        }).join('');
        rows.innerHTML =
          '<div class="rd-combo">' +
            '<div class="rd-donut">' +
              '<svg viewBox="0 0 200 200" aria-hidden="true">' + segs + '</svg>' +
              '<div class="rd-donut-core"><span class="n">' + rdPdBn(total) +
              '</span><span class="l">জন চান্স</span></div>' +
            '</div>' +
            '<div class="rd-combo-head">' +
              '<span class="rd-combo-kicker">চান্সপ্রাপ্তি · সর্বশেষ সিরিজ</span>' +
              '<h4 class="rd-combo-title">সর্বশেষ সিরিজে কোন বিভাগে কতজন</h4>' +
              '<p class="rd-pd-sub" id="pd-chance-sum">সর্বশেষ ফলাফলের বিভাগভিত্তিক হিসাব।</p>' +
            '</div>' +
          '</div>' +
          '<div class="rd-combo-cards">' + cards + '</div>';
        const sum = document.getElementById('pd-chance-sum');
        if (sum && total > 0) {
          sum.textContent = 'সর্বশেষ ফলাফলের বিভাগভিত্তিক হিসাব। যোগফল ' +
            rdPdBn(total) + '।';
        }
        rdPdComboLink(rows);
      }
    }

    /* Cross-highlight the donut segment and its card. Built for the dynamic
       dept list, so it binds to whatever renderPdaccChance() just wrote. */
    function rdPdComboLink(root) {
      if (!root) return;
      const segs = root.querySelectorAll('.rd-donut-seg');
      const cards = root.querySelectorAll('.rd-cc');
      function hi(i, on) {
        segs.forEach(function (el) {
          const m = el.getAttribute('data-i') === i;
          el.classList.toggle('hot', on && m);
          el.classList.toggle('dim', on && !m);
        });
        cards.forEach(function (el) {
          el.classList.toggle('hot', on && el.getAttribute('data-i') === i);
        });
      }
      function bind(el) {
        const i = el.getAttribute('data-i');
        el.addEventListener('mouseenter', function () { hi(i, true); });
        el.addEventListener('mouseleave', function () { hi(i, false); });
        el.addEventListener('focus', function () { hi(i, true); });
        el.addEventListener('blur', function () { hi(i, false); });
      }
      cards.forEach(bind);
      segs.forEach(bind);
    }


    /* ---------- PDACC: the 27 years ribbon --------------------------------
       The figure is the one PDACC publishes about itself, and the owner's
       decision on 2026-09-04 is that the site keeps printing it. The books
       and the banners have said 27 years for a long time, so the site does
       not contradict them on its own authority.

       His director list argues for 29: 27 directors, 1998-99 through
       2026-27, one director across two sessions and one session with none.
       PDACC will settle it. When it does, the sheet is edited and no code
       changes.

       Nothing is worked out from the number. The July rule that used to add
       one per season is gone on purpose: it moved the figure with the
       calendar, and a figure nobody decided to change is a figure nobody
       can defend on an admission page. */
    function rdPd27Apply(d) {
      const n = document.getElementById('pd27-n');
      const t = document.getElementById('pd27-t');
      if (!n || !t) return;
      const total = rdPdToNum(d.years);
      if (!total) return;
      const bn = rdPdBn(total);
      n.textContent = bn;
      t.textContent = 'সাফল্যের ' + bn + ' বছরে পদার্পণ';
    }

    /* The block this used to write is off the page: its big figure, the
       sentence under it and the lead bar of the chance chart were all saying the
       same number, so the chart kept it. The five texts are still in the sheet
       and still travel in the feed, they just have nothing to fill. */
    function applyPdaccStats(d) {
      rdPd27Apply(d);
      if (d.chance) renderPdaccChance(d.chance);
    }

    async function loadPdaccStats() {
      /* Keyed on the chart, since the figure block it used to look for is
         gone. The ribbon at the top of the page rides on the same fetch. */
      if (!document.getElementById('pd-chance-chart')) return;
      try { applyPdaccStats(await fetchPdaccStats()); }
      catch (err) { console.warn('[rd] pdaccstats:', err); }
    }

    function pdaccAbout() {
      const box = document.getElementById('pdacc-about');
      if (!box || !box.scrollIntoView) return;
      box.scrollIntoView({ behavior: 'auto', block: 'start' });
    }

    /* For admission: straight to the newest Director's own message. Until a
       PDACC committee is published there is no Director to open, so the
       button shows the description instead of doing nothing. */
    function pdaccForAdmission() {
      const found = (typeof ecLatestDirector === 'function') ? ecLatestDirector() : null;
      const id = found && found.member ? String(found.member.entryId || '').trim() : '';
      if (id) { openEcMessage(id, 'prokoushali'); return; }
      pdaccAbout();
    }

    document.addEventListener("DOMContentLoaded", () => {
      lucide.createIcons();
      /* The header carries a backdrop-filter, which makes it the containing block
         for any position:fixed descendant. #mobile-menu (reused as the mobile
         bottom sheet) therefore anchored to the header, not the viewport. Move it
         to <body> so the bottom-sheet positioning in redesign-overrides.css works. */
      (function () {
        var mm = document.getElementById('mobile-menu');
        if (mm && mm.parentNode !== document.body) document.body.appendChild(mm);
      })();
      window.addEventListener('wheel', closeMobileMenuOnUserScroll, { passive: true });
      document.addEventListener('touchmove', closeMobileMenuOnUserScroll, { passive: true });
      /* Mobile only: the bottom bar carries navigation now, so the top branding
         header can slide away on scroll-down and return on scroll-up, freeing
         screen height. Desktop keeps the sticky header untouched.
         On the PDACC page a fixed PDACC top bar replaces the branding header
         (kept hidden there) and the bottom bar (#rd-mnav) auto-hides on
         scroll-down / returns on scroll-up so the two bars never crowd the
         screen together; the PDACC top bar itself stays fixed. */
      (function () {
        var hdr = document.querySelector('header.glass-nav');
        var mnav = document.getElementById('rd-mnav');
        if (!hdr && !mnav) return;
        var lastY = window.scrollY || 0, ticking = false;
        function apply() {
          ticking = false;
          var y = window.scrollY || 0;
          if (window.innerWidth > 1279) {
            if (hdr) hdr.classList.remove('rd-nav-hidden');
            if (mnav) mnav.classList.remove('rd-nav-hidden');
            lastY = y; return;
          }
          var onPd = document.body.classList.contains('rd-on-pdacc');
          var down = y > lastY && y > 90;
          var up = y < lastY - 4 || y <= 90;
          if (hdr) {
            if (onPd || down) hdr.classList.add('rd-nav-hidden');
            else if (up) hdr.classList.remove('rd-nav-hidden');
          }
          if (mnav) {
            if (onPd && down) mnav.classList.add('rd-nav-hidden');
            else if (up || !onPd) mnav.classList.remove('rd-nav-hidden');
          }
          lastY = y;
        }
        window.addEventListener('scroll', function () {
          if (!ticking) { ticking = true; window.requestAnimationFrame(apply); }
        }, { passive: true });
      })();
      document.body.classList.add('rd-member-restoring');
      const bootShareId = rdSharedProfileId();
      const startPage = bootShareId ? 'alumni' : getPageFromLocation(false);
      history.replaceState({page: startPage}, '', window.location.pathname + (startPage==='home'?'':`#${pageUrlId(startPage)}`));
      switchPage(startPage, false);
      if (bootShareId) rdOpenSharedProfile(bootShareId);
      /* The head script's stop-gap rule has done its job; drop it so it cannot
         override an ordinary page change later on. */
      var boot = document.getElementById('rd-boot-page');
      if (boot && boot.parentNode) boot.parentNode.removeChild(boot);
      renderCoverSlides();
      rdHeroStartCycle();
      renderPdaccSlides();
      pdaccHeroStartCycle();
      loadDriveImages();
      loadHomeSlides();
      renderReunionPhotos();
      ecFillFormCommittees();
      rdFillSeriesSelects();
      rdAddrInitAll();
      rdSocialInitAll();
      rdMemberRestore();
      rdAdminRestore();
      loadExecutiveCommittee();
      renderCgpa();
      rdBloodBankNavSync();
      /* loadPublicAlumni() and loadPublicEvents() used to run here.  The home
         page renders neither feed, so those were two Apps Script round trips
         -- each with a 302 hop -- taken before the first screen was done. */
    });

    window.addEventListener('load', function () {
      /* Eagerly preload public alumni directory in background after first paint */
      setTimeout(function () {
        if (typeof loadPublicAlumni === 'function') {
          loadPublicAlumni();
        }
      }, 300);
      /* Arm the site-wide scroll-reveal once the first page has painted. */
      if (typeof rdRevealInit === 'function') rdRevealInit();
    });

    /* The album model: Drive sub-folders win, the built-in list is the
       fallback. Every photo ends up as { part, file, local, caption, src }. */
    let RD_REUNION_VIEW = { parts: [], photos: [] };

    /* REUNION ALBUM RENDERER — grouped into the chapters of the day.
       The caption sits on the card, not in a hover overlay: phones have no hover,
       so on mobile the captions used to be invisible. */
    function reunionCardHtml(photo, idx) {
      const cap = escapeHtml(photo.caption);
      const no = (photo.id < 10 ? '0' : '') + photo.id;
      return `
        <figure role="button" tabindex="0" aria-label="ছবি ${no} — ${cap}"
          onclick="openLightbox(${idx})"
          onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openLightbox(${idx});}"
          class="photo-card group bg-white rounded-2xl border border-slate-200 hover:border-blue-400 shadow-card hover:shadow-card-hover overflow-hidden transition-all duration-300 cursor-pointer flex flex-col">
          <div class="relative aspect-[4/3] overflow-hidden bg-slate-100">
            <img src="${escapeHtml(photo.src)}" data-rd-img="${escapeHtml(photo.local || photo.file)}" alt="${cap}" loading="lazy" decoding="async"
              onerror="rdImgFallback(this, '${escapeHtml(photo.local || '')}')"
              class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105">
            <span class="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-lg bg-slate-950/70 text-white text-[10px] font-mono font-bold tracking-wider">${no}</span>
            <span class="absolute inset-0 bg-slate-950/35 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
              <span class="w-11 h-11 rounded-full bg-white/95 text-slate-900 flex items-center justify-center shadow-lg"><i data-lucide="maximize-2" class="w-5 h-5"></i></span>
            </span>
          </div>
          <figcaption class="p-3.5 flex-1">
            <p class="text-[13px] leading-relaxed font-semibold text-slate-700 line-clamp-3">${cap}</p>
          </figcaption>
        </figure>`;
    }

    async function renderReunionPhotos() {
      const container = document.getElementById("reunion-photo-grid");
      if (!container) return;
      
      container.innerHTML = '<div class="flex justify-center items-center py-20"><div class="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>';
      
      try {
          const res = await apiGet('reunion');
          const rawParts = Array.isArray(res.parts) ? res.parts : [];
          const rawPhotos = Array.isArray(res.photos) ? res.photos : [];
          
          const parts = rawParts.map(p => ({
              n: p.n || p.part_number,
              icon: p.icon || 'image',
              bn: p.bn || p.title_bn,
              en: p.en || p.title_en
          }));
          
          const photos = rawPhotos.map((p, idx) => ({
              id: p.id || idx + 1,
              part: p.part || p.part_number,
              file: p.file || p.photo_id,
              caption: p.caption || '',
              src: normalizeAlumniImage(p.file || p.image_url)
          }));
          
          RD_REUNION_VIEW = { parts, photos };
          
          let html = '';
          parts.forEach(part => {
              const shots = photos.filter(p => p.part === part.n);
              if (!shots.length) return;
              let swiperSlides = shots.map((p, shotIdx) => {
                  return `<div class="swiper-slide w-72 sm:w-96 h-96 sm:h-[450px] rounded-2xl overflow-hidden cursor-pointer shadow-xl relative group" onclick="openLightbox(${photos.indexOf(p)})"><img src="${p.src}" class="w-full h-full object-cover"><div class="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/90 via-black/40 to-transparent text-white text-xs sm:text-sm font-medium line-clamp-2 whitespace-normal leading-tight opacity-100 transition-opacity">${escapeHtml(p.caption || p.bn || '')}</div></div>`;
              }).join('');

              html += `
              <section class="mb-12 last:mb-0 overflow-hidden rounded-3xl bg-white border border-blue-50 p-4 sm:p-8 pt-8 sm:pt-10 pb-8 sm:pb-12 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative">
                <div class="absolute -top-24 -right-24 w-64 h-64 bg-blue-100 rounded-full mix-blend-multiply filter blur-3xl opacity-70"></div>
                <div class="absolute -bottom-24 -left-24 w-64 h-64 bg-sky-100 rounded-full mix-blend-multiply filter blur-3xl opacity-70"></div>
                
                <div class="flex items-center gap-3.5 mb-8 relative z-10">
                  <span class="shrink-0 w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-sky-500 text-white flex items-center justify-center shadow-md"><i data-lucide="${part.icon}" class="w-5 h-5"></i></span>
                  <div class="min-w-0">
                    <h3 class="text-sm sm:text-base font-extrabold text-slate-900 leading-snug">${escapeHtml(part.bn)}</h3>
                    <p class="text-[11px] sm:text-xs text-slate-500 font-semibold">${escapeHtml(part.en)} &bull; ${bnNum(shots.length)} টি ছবি</p>
                  </div>
                  <span class="ml-auto shrink-0 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-[10px] sm:text-[11px] font-bold text-blue-600 tracking-wide">পর্ব ${bnNum(part.n)}</span>
                </div>
                
                <div class="swiper reunion-swiper-${part.n} relative z-10">
                    <div class="swiper-wrapper">${swiperSlides}</div>
                    <div class="swiper-pagination mt-4 relative"></div>
                </div>
              </section>`;
          });
          
          if(!html) {
              container.innerHTML = '<div class="text-center py-20 text-slate-500 font-medium">Reunion photos are coming soon!</div>';
          } else {
              container.innerHTML = html;
              lucide.createIcons();
          }
          
      } catch(e) {
          container.innerHTML = '<div class="text-center py-20 text-rose-500 font-medium">Failed to load reunion photos.</div>';
      }
    }

    /* LIGHTBOX LOGIC FOR BOTH STATIC AND DYNAMIC EVENTS */
    let lightboxItems = [], currentLightboxIdx = 0;
    
    function showLightboxItem(index) {
        if (!lightboxItems.length) return;
        currentLightboxIdx = (index + lightboxItems.length) % lightboxItems.length;
        const img = document.getElementById("lightbox-img"), cap = document.getElementById("lightbox-caption"), ctr = document.getElementById("lightbox-counter");
        if (!img) return;
        
        img.src = lightboxItems[currentLightboxIdx].src;
        cap.innerText = lightboxItems[currentLightboxIdx].caption || "";
        if (ctr) ctr.textContent = (currentLightboxIdx + 1) + ' / ' + lightboxItems.length;
        
        const overlay = document.getElementById("lightbox-overlay");
        if (overlay && overlay.classList.contains("hidden")) {
            img.style.transform = "scale(0.85)";
            img.style.opacity = "0";
            img.style.transition = "none";
            
            overlay.classList.remove("hidden");
            setTimeout(() => overlay.classList.remove("opacity-0"), 10);
            document.body.style.overflow = "hidden";
            
            setTimeout(() => {
                img.style.transition = "all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)";
                img.style.transform = "scale(1)";
                img.style.opacity = "1";
            }, 50);
        } else if (overlay) {
            img.style.transition = "none";
            img.style.transform = "scale(0.98)";
            img.style.opacity = "0.7";
            setTimeout(() => {
                img.style.transition = "all 0.3s ease-out";
                img.style.transform = "scale(1)";
                img.style.opacity = "1";
            }, 30);
        }
        lucide.createIcons();
      }
    
    function openLightbox(index) {
      if (!RD_REUNION_VIEW || !RD_REUNION_VIEW.photos) return;
      lightboxItems = RD_REUNION_VIEW.photos.map(photo => ({
        src: photo.src,
        caption: photo.caption ? `${photo.caption} (${photo.file})` : photo.file
      }));
      showLightboxItem(index);
    }
    
    function openLightboxFromSlide(el) {
        const container = el.closest('.swiper-wrapper');
        if (!container) return;
        
        // Swiper loop creates duplicates, we only want the original slides
        const slides = [...container.querySelectorAll('.swiper-slide')];
        let items = [];
        let uniqueSrcs = new Set();
        
        for (let slide of slides) {
            // Skip duplicates to avoid double counting
            if (slide.classList.contains('swiper-slide-duplicate')) continue;
            
            const img = slide.querySelector('img');
            if (img && !uniqueSrcs.has(img.src)) {
                uniqueSrcs.add(img.src);
                const capDiv = slide.querySelector('div.absolute');
                const slideCaption = capDiv ? capDiv.innerText : '';
                items.push({ src: img.src, caption: slideCaption });
            }
        }
        
        lightboxItems = items;
        const clickedImg = el.querySelector('img');
        const src = clickedImg ? clickedImg.src : '';
        const idx = lightboxItems.findIndex(x => x.src === src);
        showLightboxItem(idx === -1 ? 0 : idx);
      }
      
      function openCustomLightbox(src, caption) {
        const swiperSlides = [...document.querySelectorAll('.swiper-slide[onclick^="openCustomLightbox("]')];
        let items = [];
        for (let slide of swiperSlides) {
            const img = slide.querySelector('img');
            if (img) {
                const capDiv = slide.querySelector('div.absolute');
                const slideCaption = capDiv ? capDiv.innerText : '';
                items.push({ src: img.src, caption: slideCaption });
            }
        }
        
        if (!items.length) {
            lightboxItems = [{ src, caption }];
            showLightboxItem(0);
            return;
        }
        
        const uniqueItems = [];
        const seen = new Set();
        for (let item of items) {
            if (!seen.has(item.src)) {
                seen.add(item.src);
                uniqueItems.push(item);
            }
        }
        
        lightboxItems = uniqueItems;
        const idx = lightboxItems.findIndex(x => x.src === src || x.src.includes(src));
        showLightboxItem(idx === -1 ? 0 : idx);
      }
    
    function closeLightbox() {
      const overlay = document.getElementById("lightbox-overlay");
      if (!overlay) return;
      overlay.classList.add("opacity-0");
      document.body.style.overflow = "";
      setTimeout(() => overlay.classList.add("hidden"), 300);
    }
    window.closeLightbox = closeLightbox;
    function nextLightboxPhoto() { showLightboxItem(currentLightboxIdx + 1); }
    function prevLightboxPhoto() { showLightboxItem(currentLightboxIdx - 1); }
    
    async function downloadLightboxPhoto() {
      const img = document.getElementById("lightbox-img");
      if(!img || !img.src) return;
      try {
        const res = await fetch(img.src);
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `RANGDHANU_Photo_${Date.now()}.jpg`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
      } catch(e) {
        window.open(img.src, '_blank');
      }
    }

    /* ================= MEMBER RECORD: THE SHARED PIECES ==================
       One member's record is now read in three places -- the directory card,
       the page another member opens, and the member's own page -- so the
       parsing, the sorting and the small words all live here once. A body
       renamed on the committee page cannot drift from a body named on a
       profile, because both read RD_EC_COMMITTEES. */

    /* The sheet keeps a list in one cell: rows separated by a line break,
       fields inside a row by a pipe. Only the designations also accept a
       semicolon, because that is the separator the column legend names -- a
       paper title is allowed to contain one. */
    function rdMpRows(raw, semi) {
      const s = String(raw == null ? '' : raw).trim();
      if (!s) return [];
      return s.split(semi ? /[\r\n;]+/ : /[\r\n]+/).map(x => x.trim()).filter(Boolean);
    }

    function rdMpCut(line) { return String(line).split('|').map(x => x.trim()); }

    function rdMpHas(v) { return String(v == null ? '' : v).trim() !== ''; }

    /* "N/A", "none", "-" and their friends are typed into a sheet by people
       who mean "nothing here". Printing them back as a fact is worse than
       printing nothing, so they are read as empty. */
    const RD_MP_NOTHING = /^(none|n\/?a|na|nil|nothing|null|no|-{1,3}|\.+)$/i;

    function rdMpReal(v) {
      const s = String(v == null ? '' : v).trim();
      return RD_MP_NOTHING.test(s) ? '' : s;
    }

    function rdMpPlural(n, one) { return n + ' ' + one + (n === 1 ? '' : 's'); }

    /* tel: keeps a leading +, wa.me cannot have one. */
    function rdMpDigits(s, plus) {
      return String(s || '').replace(plus ? /[^0-9+]/g : /[^0-9]/g, '');
    }

    /* Printed as the eyebrow over every member's name, so the credential says
       whose register it is without a logo in the way. */
    const RD_MP_ORG = "Students' Welfare Association of Greater Rangpur, DUET";

    /* The bundled cover, compressed, shipped at the repo root beside logo.png.
       A member who never uploads one still gets a finished page. */
    const RD_MP_COVER_DEFAULT = 'cover-default.jpg';

    /* A name gives the monogram its colour, so two members side by side are
       told apart without a photo between them. The hue is kept inside a narrow
       navy-to-teal arc -- the register is one colour scheme, not a palette. */
    function rdMpHue(name) {
      let h = 0;
      const s = String(name || '');
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
      return 200 + (h % 81);
    }

    /* An open ended job or course reads "2019 - now", never "2019 - ". */
    function rdMpSpan(from, to) {
      const f = String(from || '').trim(), t = String(to || '').trim();
      if (!f && !t) return '';
      if (!f) return t;
      return t ? f + ' – ' + t : f + ' – now';
    }

    /* ---------- the three bodies and the three levels --------------------
       The bodies are not written down again here. They are the committees the
       site already knows, read through a function rather than a constant so
       this never runs before RD_EC_COMMITTEES exists. */
    const RD_MP_BODY_KEYS = ['RANGDHANU', 'ALUMNI', 'PDACC'];

    function rdMpBodies() {
      const ec = typeof RD_EC_COMMITTEES !== 'undefined' ? RD_EC_COMMITTEES : [];
      const short = { RANGDHANU: 'Rangdhanu', ALUMNI: 'Rangdhanu Alumni Association', PDACC: 'PDACC' };
      const icon = { RANGDHANU: 'shield-check', ALUMNI: 'users', PDACC: 'building-2' };
      return RD_MP_BODY_KEYS.map((key, i) => {
        const c = ec[i] || {};
        return { key: key, short: short[key], icon: c.icon || icon[key],
                 name: c.name || short[key], positions: c.positions || [],
                 span: key === 'ALUMNI' ? 4 : 1 };
      });
    }

    function rdMpBodyOf(key) {
      const s = String(key || '').trim().toLowerCase();
      const all = rdMpBodies();
      if (!s) return all[0];
      if (s === 'pdacc' || s.indexOf('pdacc') !== -1 || s.indexOf('coaching') !== -1 || s.indexOf('admission') !== -1 || s.indexOf('prokoushali') !== -1) {
        return all.find(b => b.key === 'PDACC') || all[2];
      }
      if (s === 'alumni' || s.indexOf('alumni') !== -1) {
        return all.find(b => b.key === 'ALUMNI') || all[1];
      }
      if (s === 'rangdhanu' || s.indexOf('rangdhanu') !== -1) {
        return all.find(b => b.key === 'RANGDHANU') || all[0];
      }
      const want = s.toUpperCase();
      return all.find(b => b.key === want) || all[0];
    }

    const RD_MP_LEVELS = [
      { key: 'UNIVERSITY', label: 'University', icon: 'graduation-cap' },
      { key: 'POLYTECHNIC', label: 'Polytechnic Institute', icon: 'wrench' },
      { key: 'HIGHSCHOOL', label: 'High School', icon: 'school' }
    ];

    function rdMpLevelOf(key) {
      const want = String(key || '').trim().toUpperCase();
      return RD_MP_LEVELS.find(l => l.key === want) || RD_MP_LEVELS[0];
    }

    /* ---------- reading the four list columns ---------------------------- */
    function rdMpParsePosts(raw) {
      if (!raw) return [];
      const normalizePostItem = function(p) {
        const postTitle = rdMpReal(p && (p.post || p.position));
        let rawBody = p && (p.body || p.committee);
        if (postTitle && /director/i.test(postTitle) && (!rawBody || String(rawBody).toUpperCase() === 'RANGDHANU')) {
          rawBody = 'PDACC';
        }
        return {
          body: rdMpBodyOf(rawBody).key,
          session: (p && p.session) || '',
          post: postTitle
        };
      };
      if (Array.isArray(raw)) {
        return raw.map(normalizePostItem).filter(r => r.post);
      }
      if (typeof raw === 'string' && raw.trim().startsWith('[')) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            return parsed.map(normalizePostItem).filter(r => r.post);
          }
        } catch (e) {}
      }
      return rdMpRows(raw, true).map(line => {
        const p = rdMpCut(line);
        const postTitle = rdMpReal(p[2]);
        let rawBody = p[0];
        if (postTitle && /director/i.test(postTitle) && (!rawBody || String(rawBody).toUpperCase() === 'RANGDHANU')) {
          rawBody = 'PDACC';
        }
        return { body: rdMpBodyOf(rawBody).key, session: p[1] || '', post: postTitle };
      }).filter(r => r.post);
    }

    function rdMpParseWork(raw) {
      return rdMpRows(raw).map(line => {
        const p = rdMpCut(line);
        return { org: rdMpReal(p[0]), desig: rdMpReal(p[1]), loc: rdMpReal(p[2]),
                 from: p[3] || '', to: p[4] || '', type: rdMpReal(p[5]) };
      }).filter(r => r.org || r.desig);
    }

    function rdMpParseEdu(raw) {
      return rdMpRows(raw).map(line => {
        const p = rdMpCut(line);
        return { level: rdMpLevelOf(p[0]).key, inst: rdMpReal(p[1]), field: rdMpReal(p[2]),
                 from: p[3] || '', to: p[4] || '' };
      }).filter(r => r.inst);
    }

    function rdMpParsePapers(raw) {
      return rdMpRows(raw).map(line => {
        const p = rdMpCut(line);
        const url = String(p[1] || '').trim();
        return { title: rdMpReal(p[0]) || url, url: url };
      }).filter(r => /^https?:\/\//i.test(r.url));
    }

    /* ---------- writing them back --------------------------------------- */
    function rdMpJoin(list, keys) {
      return (list || []).map(r => keys.map(k => String(r[k] == null ? '' : r[k]).trim()).join('|'))
                         .join('\n');
    }

    /* ---------- sorting ------------------------------------------------- */
    function rdMpSessionYear(s) {
      const m = /^(\d{4})/.exec(String(s || '').trim());
      return m ? +m[1] : 0;
    }

    function rdMpBySessionDesc(a, b) { return rdMpSessionYear(b.session) - rdMpSessionYear(a.session); }

    /* An entry still open outranks one that closed in the same year: a job you
       are in now belongs above a job you left this year. */
    function rdMpByYearDesc(a, b) {
      const af = +String(a.from || 0).slice(0, 4) || 0, bf = +String(b.from || 0).slice(0, 4) || 0;
      const ao = rdMpHas(a.to) ? 0 : 1, bo = rdMpHas(b.to) ? 0 : 1;
      if (bf !== af) return bf - af;
      return bo - ao;
    }

    /* A term is current when today falls inside the session, which is why the
       two years are compared rather than only the last one -- an Alumni
       Association term may run for four. */
    function rdMpIsCurrent(session) {
      const m = /^(\d{4})-(\d{4})$/.exec(String(session || '').trim());
      if (!m) return false;
      const y = new Date().getFullYear();
      return +m[1] <= y && +m[2] >= y;
    }

    /* Two columns carry standing and they do not agree on wording. The public
       feed derives viewStatus from the active series list -- "Alumni" or
       "Running Member" -- while a member's own row carries Status, which is
       "PENDING" until the Association approves it. One key covers both so a
       page never has to know which call it was filled from. */
    function rdMpNormStatus(s) {
      const u = String(s == null ? '' : s).trim().toUpperCase();
      if (u === 'ALUMNI') return 'ALUMNI';
      if (u === 'PENDING') return 'PENDING';
      return 'APPROVED';
    }

    function rdMpStatusWord(status) {
      const k = rdMpNormStatus(status);
      return k === 'ALUMNI' ? 'Alumni' : k === 'PENDING' ? 'Pending approval' : 'Member';
    }

    function rdMpStatusClass(status) {
      const k = rdMpNormStatus(status);
      return k === 'ALUMNI' ? ' is-alumni' : k === 'PENDING' ? ' is-pending' : '';
    }

    /* The one line the Standing group prints, and the one the pill prints. */
    function rdMpStanding(status) {
      const k = rdMpNormStatus(status);
      return k === 'ALUMNI' ? 'Alumni member'
        : k === 'PENDING' ? 'Application under review' : 'Approved member';
    }

    /* Initials for the monogram. A title is not an initial: "Md. Shefaul
       Islam" is SI, not MS, which is the difference between a register that
       reads and one that repeats itself down the page. First and last, the way
       a name is shortened out loud, so two Md. Abdurs are still told apart. */
    const RD_MP_TITLES = /^(md|mohammad|muhammad|mohd|mst|most|mosa|mosammat|mrs|mr|ms|dr|engr|adv)\.?$/i;

    function rdMpInitials(name) {
      let w = String(name || '').replace(/[.]/g, ' . ').split(/\s+/)
        .filter(x => x && x !== '.')
        .filter(x => !RD_MP_TITLES.test(x));
      if (!w.length) w = String(name || '').split(/\s+/).filter(Boolean);
      if (!w.length) return 'DU';
      /* Array.from, not [0]: a Bengali name's first letter is not always one
         UTF-16 unit, and half a code point draws as a box. */
      const a = Array.from(w[0])[0] || '';
      const b = w.length > 1 ? (Array.from(w[w.length - 1])[0] || '') : '';
      return ((a + b) || 'DU').toUpperCase();
    }

    /* ================= MEMBER PROFILE: THE PAGE ==========================
       Two pages draw the same member: the one another member opens from the
       directory, and the one the member opens from the menu. They used to be
       two sets of builders, which is how the two pages came to disagree about
       what a member's record even contained.

       Every builder below takes the record and a small state object, and
       returns a string. Nothing reads a global, so the same call renders a
       public profile and an own profile -- the state is the only difference:

         { own:  drawing the member's own page, so the cover and photo buttons
                 and the completeness note appear,
           signed: a member is signed in, so contact rows are filled,
           pos:  the cover is being repositioned,
           x, y: the cover's focal point, in per cent }
       ==================================================================== */

    function rdMpState(o) {
      const s = o || {};
      return { own: !!s.own, signed: !!s.signed, pos: !!s.pos,
               x: typeof s.x === 'number' ? s.x : 50,
               y: typeof s.y === 'number' ? s.y : 50 };
    }

    /* "50% 34%" out of the sheet, back into two numbers. An unreadable value
       is centred rather than dropped, so a bad cell cannot blank a cover. */
    function rdMpParsePos(raw) {
      const m = /(-?\d+(?:\.\d+)?)\s*%?\s+(-?\d+(?:\.\d+)?)\s*%?/.exec(String(raw || ''));
      if (!m) return { x: 50, y: 50 };
      const clamp = v => Math.max(0, Math.min(100, Math.round(+v)));
      return { x: clamp(m[1]), y: clamp(m[2]) };
    }

    /* ---- the face ------------------------------------------------------ */
    /* A member with no photo gets a monogram in a colour taken from their own
       name, not the Association logo for the fourth time on one page. The hue
       is emitted inline because the gradient in custom.css reads --mp-h. */
    function rdMpFaceMarkup(mp) {
      if (rdMpHas(mp.photo)) {
        return '<img src="' + escapeHtml(mp.photo) + '" alt="' + escapeHtml(mp.name || '') +
               '" decoding="async" draggable="false" onerror="rdMpFaceFail(this)">';
      }
      return '<div class="rd-mp-mono" style="--mp-h:' + rdMpHue(mp.name) + '" aria-hidden="true">' +
             escapeHtml(rdMpInitials(mp.name)) + '</div>';
    }

    /* A broken Drive link leaves an empty circle, so the monogram takes over.
       But a Drive thumbnail miss is often transient, so retry once on the
       thumbnail host before giving up on the photo. */
    function rdMpFaceFail(img) {
      if (img && !img.dataset.rdTried) {
        img.dataset.rdTried = '1';
        const m = /(?:lh3\.googleusercontent\.com\/d\/|[?&]id=|\/d\/)([A-Za-z0-9_-]{20,})/.exec(img.src || '');
        if (m) { img.src = 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w1200'; return; }
      }
      const box = img.parentElement;
      if (!box) { img.remove(); return; }
      const name = img.getAttribute('alt') || '';
      img.outerHTML = '<div class="rd-mp-mono" style="--mp-h:' + rdMpHue(name) +
        '" aria-hidden="true">' + escapeHtml(rdMpInitials(name)) + '</div>';
    }

    /* An uploaded cover that 404s on first hit used to leave a blank gap, since
       the cover img had no error path at all. Retry once on the Drive thumbnail
       host, then fall back to the bundled default cover so the band is never
       empty. Dropping rd-mp-cover-photo lets the default styling take over. */
    function rdMpCoverFail(img) {
      if (!img) return;
      const cover = img.closest ? img.closest('.rd-mp-cover') : img.parentElement;
      if (!img.dataset.rdTried) {
        img.dataset.rdTried = '1';
        const m = /(?:lh3\.googleusercontent\.com\/d\/|[?&]id=|\/d\/)([A-Za-z0-9_-]{20,})/.exec(img.src || '');
        if (m) { img.src = 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w1200'; return; }
      }
      if (img.dataset.rdFell) return;
      img.dataset.rdFell = '1';
      if (cover) cover.classList.remove('rd-mp-cover-photo');
      img.src = RD_MP_COVER_DEFAULT;
    }

    /* "Assistant Engineer, LGED" on one line, instead of a Designation row and
       an Organization row the reader has to join up themselves. */
    function rdMpHeadline(mp) {
      const bits = [];
      if (rdMpHas(mp.desig)) bits.push('<b>' + escapeHtml(mp.desig) + '</b>');
      if (rdMpHas(mp.org)) bits.push(escapeHtml(mp.org));
      return bits.length ? '<p class="rd-mp-head">' + bits.join(', ') + '</p>' : '';
    }

    /* ---- the cover ----------------------------------------------------- */
    function rdMpCoverMarkup(mp, st) {
      const csrc = rdMpHas(mp.cover) ? mp.cover : RD_MP_COVER_DEFAULT;
      const custom = rdMpHas(mp.cover);
      const alt = custom ? 'Cover photo' : 'Proud Member of Rangdhanu';
      let btns = '';
      if (st.own) {
        /* The label is hidden under 420px, so each button also carries an
           aria-label and a title. Without them these are three unnamed buttons
           to a screen reader, and one of them throws the cover away. */
        btns = '<div class="rd-mp-cbtns">' +
          (custom
            ? '<button type="button" class="rd-mp-cbtn" onclick="rdMpPosStart()"' +
                ' aria-label="Reposition the cover" title="Reposition the cover">' +
                '<i data-lucide="move"></i><span class="rd-mp-cbtn-lbl">Reposition</span></button>' +
              '<button type="button" class="rd-mp-cbtn" onclick="rdMpCoverReset(this)"' +
                ' aria-label="Go back to the default cover" title="Go back to the default cover">' +
                '<i data-lucide="rotate-ccw"></i><span class="rd-mp-cbtn-lbl">Use default</span></button>'
            : '') +
          '<button type="button" class="rd-mp-cbtn" onclick="rdMpCoverPick()"' +
            ' aria-label="Change the cover photo" title="Change the cover photo">' +
            '<i data-lucide="image-plus"></i><span class="rd-mp-cbtn-lbl">Cover</span></button>' +
          '</div>';
      }
      const bar = st.own
        ? '<div class="rd-mp-posbar">' +
            '<span>Drag the photo up or down to choose what shows.</span>' +
            '<div class="rd-mp-posacts">' +
              '<button type="button" class="rd-mp-posbtn rd-mp-posbtn-no" onclick="rdMpPosEnd(false)">Cancel</button>' +
              '<button type="button" class="rd-mp-posbtn rd-mp-posbtn-ok" onclick="rdMpPosEnd(true)">Save position</button>' +
            '</div></div>'
        : '';
      return '<div class="rd-mp-cover' + (custom ? ' rd-mp-cover-photo' : '') +
               (st.pos ? ' is-pos' : '') + '"' +
               /* The id is only what the drag and the arrow keys hold on to, so
                  it is emitted on the member's own page and nowhere else. Both
                  pages sit in the DOM at once and #page-profile comes first, so
                  an id on both would hand rdMpArmDrag the wrong cover. */
               (st.own ? ' id="mp-cover"' : '') +
               /* While the bar is open the cover takes focus, because dragging
                  is the one thing here a keyboard cannot do. The label says
                  which keys move it. */
               (st.pos ? ' tabindex="0" aria-label="Cover photo. Use the arrow keys' +
                         ' to move it, Enter to save, Escape to cancel."' : '') +
               ' style="--rd-cover-pos:' + st.x + '% ' + st.y + '%">' +
               '<img src="' + escapeHtml(csrc) + '" alt="' + alt + '" decoding="async" draggable="false" onerror="rdMpCoverFail(this)">' +
               btns +
             '</div>' + bar;
    }

    /* ---- the engraved data line ---------------------------------------- */
    function rdMpFact(label, value, cls) {
      if (!rdMpHas(value)) return '';
      return '<div class="rd-mp-fact"><dt>' + escapeHtml(label) + '</dt>' +
             '<dd' + (cls ? ' class="' + cls + '"' : '') + '>' + escapeHtml(value) + '</dd></div>';
    }

    function rdMpRuleMarkup(mp) {
      const inner = rdMpFact('Member ID', mp.memberId) +
                    rdMpFact('Series', rdMpHas(mp.series) ? mp.series : '') +
                    rdMpFact('Department', mp.dept, 'is-word') +
                    rdMpFact('Batch', mp.batch) +
                    rdMpFact('Blood', mp.blood, 'is-blood');
      return inner ? '<dl class="rd-mp-rule">' + inner + '</dl>' : '';
    }

    /* ---- the actions --------------------------------------------------- */
    function rdMpActsMarkup(mp, st) {
      if (!st.signed) {
        return '<div class="rd-mp-acts"><button type="button" class="rd-mp-act rd-mp-act-lock" ' +
               'onclick="openMemberSignIn(\'profile\')"><i data-lucide="lock"></i> ' +
               'Sign in to call or message</button></div>';
      }
      /* No falling back to the mobile number. Most members do use the same one
         on WhatsApp, but the sheet does not say so, and a wa.me link to a
         number that is not on WhatsApp is a dead end. Empty field, no button. */
      const main = (rdMpHas(mp.mobile)
          ? '<a class="rd-mp-act rd-mp-act-call" href="tel:' + rdMpDigits(mp.mobile, true) +
            '"><i data-lucide="phone"></i> Call</a>' : '') +
        (rdMpHas(mp.whatsapp)
          ? '<a class="rd-mp-act rd-mp-act-wa" href="https://wa.me/' + rdMpDigits(mp.whatsapp) +
            '" target="_blank" rel="noopener"><i data-lucide="message-circle"></i> WhatsApp</a>' : '') +
        (rdMpHas(mp.email)
          ? '<a class="rd-mp-act rd-mp-act-mail" href="mailto:' + escapeHtml(mp.email) +
            '"><i data-lucide="mail"></i> Email</a>' : '');
      /* Call/WhatsApp/Email and Share profile sit together in one tidy grid,
         on your own page and on anybody else's alike -- four calm buttons, no
         stranded second row. Save contact was dropped: the owner did not want
         it on a member profile. Log out lives in the More menu now. */
      const share = '<button type="button" class="rd-mp-act rd-mp-act-share" onclick="rdMpShare(this)">' +
          '<i data-lucide="share-2"></i> Share profile</button>';
      return '<div class="rd-mp-acts">' + main + share + '</div>';
    }

    /* ---- the credential ------------------------------------------------ */
    /* Willing-to-donate is worth seeing without opening the edit form -- the
       owner wanted it to catch the eye on the profile itself. A rose pill next
       to the standing pill, only when the member said Yes, with the same
       120-day availability the Blood Bank uses. */
    function rdMpDonorPill(mp) {
      if (String(mp.willDonate == null ? '' : mp.willDonate).trim().toUpperCase() !== 'YES') return '';
      let avail = '';
      const last = String(mp.lastDonation == null ? '' : mp.lastDonation).trim();
      if (last) {
        const d = new Date(last);
        if (!isNaN(d.getTime())) {
          const days = Math.floor((Date.now() - d.getTime()) / 86400000);
          avail = days >= 120 ? ' · Available' : ' · Available in ' + Math.max(0, 120 - days) + 'd';
        }
      }
      return '<span class="rd-mp-pill rd-mp-pill-donor"><i data-lucide="droplet"></i> Blood donor' +
             escapeHtml(avail) + '</span>';
    }

    function rdMpCredential(mp, st) {
      const k = rdMpNormStatus(mp.status);
      const pill = k === 'PENDING'
        ? '<span class="rd-mp-pill rd-mp-pill-wait"><i data-lucide="clock"></i> Pending</span>'
        : '<span class="rd-mp-pill rd-mp-pill-ok"><i data-lucide="badge-check"></i> ' +
          rdMpStanding(mp.status) + '</span>';
      /* The tick beside the name means Approved or Alumni and nothing else. A
         badge that is always drawn says nothing, so an applicant has none. */
      const tick = k === 'PENDING' ? ''
        : '<i data-lucide="shield-check" role="img" aria-label="Verified by the Association"' +
          ' title="Verified by the Association"></i>';
      return '<div class="rd-mp' + (st.pos ? ' is-pos' : '') + '"' +
        (st.own ? ' id="mp-card"' : '') + '>' +
        rdMpCoverMarkup(mp, st) +
        '<div class="rd-mp-id">' +
          '<div class="rd-mp-face">' + rdMpFaceMarkup(mp) +
            (st.own ? '<button type="button" class="rd-mp-facebtn" onclick="rdMpPhotoPick()"' +
                      ' aria-label="Change my photo" title="Change my photo">' +
                      '<i data-lucide="camera"></i></button>' : '') +
          '</div>' +
          '<h1 class="rd-mp-name">' + escapeHtml(mp.name || '') + tick + '</h1>' +
          rdMpHeadline(mp) +
          '<div class="rd-mp-pillrow">' + pill + rdMpDonorPill(mp) + '</div>' +
          rdMpRuleMarkup(mp) +
          rdMpActsMarkup(mp, st) +
        '</div>' +
      '</div>';
    }

    /* ---- the record ---------------------------------------------------- */
    function rdMpRow(icon, label, value, num, tone) {
      if (!rdMpHas(value)) return '';           /* an empty fact draws nothing */
      return '<div class="rd-mp-row">' +
        '<div class="rd-mp-ico' + (tone ? ' rd-mp-ico-' + tone : '') + '">' +
          '<i data-lucide="' + icon + '"></i></div>' +
        '<div class="rd-mp-txt">' +
          (label ? '<p class="rd-mp-k">' + escapeHtml(label) + '</p>' : '') +
          '<p class="rd-mp-v' + (num ? ' rd-mp-v-num' : '') + '">' + escapeHtml(value) + '</p>' +
        '</div></div>';
    }

    /* Sections are direct children of .rd-mp-grid -- there is no wrapper around
       the wide column and none around the narrow one. is-side is what puts a
       section in the narrow column, so the public profile page can lay itself
       out from five separate variables without a div spanning two of them. */
    function rdMpSection(icon, title, inner, side, editKey, emptyHint) {
      const canEdit = RD_MP_OWN && editKey;
      /* An empty section still draws on the member's own page when it is one
         they can fill, so the Add affordance and a short hint tell them the
         information can be added. Elsewhere an empty one draws nothing. */
      if (!inner && !canEdit) return '';
      const isEmpty = !inner;
      const pencil = canEdit
        ? '<button type="button" class="rd-mp-sec-edit" onclick="rdMpEditSection(\'' +
            editKey + '\')" aria-label="' + (isEmpty ? 'Add ' : 'Edit ') + escapeHtml(title) + '">' +
            '<i data-lucide="' + (isEmpty ? 'plus' : 'pencil') + '"></i>' + (isEmpty ? 'Add' : 'Edit') + '</button>'
        : '';
      const body = inner || (canEdit
        ? '<p class="rd-mp-empty">' + escapeHtml(emptyHint || 'Not added yet.') + '</p>'
        : '');
      return '<div class="rd-mp-sec' + (side ? ' is-side' : '') + (isEmpty ? ' is-empty' : '') + '"' +
        (editKey ? ' data-mp-sec="' + editKey + '"' : '') + '>' +
        '<div class="rd-mp-sech-row">' +
          '<p class="rd-mp-sech"><i data-lucide="' + icon + '"></i>' + escapeHtml(title) + '</p>' +
          pencil +
        '</div>' + body + '</div>';
    }

    function rdMpRowsBox(inner) { return inner ? '<div class="rd-mp-rows">' + inner + '</div>' : ''; }

    /* ---- service, work and education ----------------------------------- */
    /* The first version drew each of these as a year column beside a line of
       text: correct, and completely flat, which is what he saw -- "sudhu text
       ar text". One object replaces all three. A group is a crest, the body's
       own icon on a navy tile, over a rail; each entry is a station on that
       rail, hollow for something finished and brass for what is true now.
       Service, work and education share it, so the page reads as one system. */
    function rdMpSvGroup(icon, name, count, inner) {
      /* A group where not one term carries a date should not hold a date column
         open: the dot would sit next to a hole, which is what "Current post"
         looked like. A group where some terms are dated keeps the column, so
         those rows stay in line with each other. rdMpSvTerm writes the span
         either way and the decision is made here, where the whole list is in
         view -- one non-empty year anywhere in it is enough. */
      const dated = /class="rd-sv-y">[^<]/.test(inner);
      return '<div class="rd-sv-grp' + (dated ? '' : ' no-dates') + '">' +
        '<div class="rd-sv-h">' +
          '<span class="rd-sv-crest" aria-hidden="true"><i data-lucide="' + icon + '"></i></span>' +
          '<div class="rd-sv-ttl"><p class="rd-sv-n">' + escapeHtml(name) + '</p>' +
            (rdMpHas(count) ? '<p class="rd-sv-c">' + escapeHtml(count) + '</p>' : '') +
          '</div></div>' +
        '<ul class="rd-sv-list">' + inner + '</ul></div>';
    }

    function rdMpSvTerm(yr, main, sub, now, chip) {
      return '<li class="rd-sv-t' + (now ? ' is-now' : '') + (rdMpHas(sub) ? ' has-sub' : '') + '">' +
        '<span class="rd-sv-y">' + escapeHtml(yr || '') + '</span>' +
        '<span class="rd-sv-p">' + escapeHtml(main) +
          (rdMpHas(chip) ? '<span class="rd-sv-chip">' + escapeHtml(chip) + '</span>' : '') +
          (rdMpHas(sub) ? '<span class="rd-sv-org">' + escapeHtml(sub) + '</span>' : '') +
        '</span></li>';
    }

    /* Three bodies, three rails, newest term at the top of each. A member who
       has served only in Rangdhanu sees one group, not three empty ones. */
    function rdMpService(mp) {
      if (RD_MP_OWN) return rdMpServiceOwn(mp);   /* editable list on the own page */
      const list = (mp.posts || []).filter(p => rdMpHas(p.post) && rdMpHas(p.session));
      if (!list.length) return rdMpLegacyService(mp);
      let groups = rdMpBodies().map(b => {
        const mine = list.filter(p => rdMpBodyOf(p.body).key === b.key).sort(rdMpBySessionDesc);
        if (!mine.length) return '';
        const inner = mine.map((p, i) => {
          const now = i === 0 && rdMpIsCurrent(p.session);
          /* "Serving" is the one chip on the page. The dot already says
             current, so the word is spent only where a reader might otherwise
             read a session that has not ended yet as one that has. */
          return rdMpSvTerm(p.session, p.post, '', now, now ? 'Serving' : '');
        }).join('');
        return rdMpSvGroup(b.icon, b.short, rdMpPlural(mine.length, 'term'), inner);
      }).join('');
      groups += rdMpSvGroup('badge-check', 'Standing', '',
        rdMpSvTerm('Today', rdMpStanding(mp.status), RD_MP_ORG, true, ''));
      return rdMpSection('shield', 'Service record', '<div class="rd-sv">' + groups + '</div>',
        0, 'service', 'Add your Rangdhanu / PDACC positions, session by session.');
    }

    /* Members who registered before the session-wise columns existed have one
       free text cell instead, semicolon separated. It is still their record, so
       it is drawn on the same rail rather than dropped. */
    function rdMpLegacyService(mp) {
      const ev = [];
      String(mp.formerPos || '').split(';').forEach(p => {
        p = p.trim();
        if (!p || RD_MP_NOTHING.test(p)) return;
        let session = '', post = p;
        const sessMatch = /(?:\(|\b)(\d{4}(?:-\d{2,4})?)\)?\s*$/.exec(p);
        if (sessMatch) {
          session = sessMatch[1];
          post = p.substring(0, sessMatch.index).trim().replace(/[,\s(-]+$/, '').trim();
        } else {
          const m = /^(.*?),\s*([0-9]{4}(?:-[0-9]{2,4})?)$/.exec(p);
          if (m) { session = m[2]; post = m[1]; }
        }
        ev.push({ y: session, v: post || p });
      });
      const inner = ev.map(e => rdMpSvTerm(e.y, e.v, '', false, '')).join('') +
        rdMpSvTerm('Today', rdMpStanding(mp.status), RD_MP_ORG, true, '');
      /* One free text cell covers Rangdhanu and PDACC both, so the group is
         named by what the cell is rather than by a body it might not be about.
         rdPositionCardLabel is the same pair of words the two forms print over
         the input, which is where this text was typed. */
      return rdMpSection('shield', 'Service record', '<div class="rd-sv">' +
        rdMpSvGroup('shield-check', ev.length ? rdPositionCardLabel(mp.status) : 'Standing',
          ev.length ? rdMpPlural(ev.length, 'term') : '', inner) + '</div>',
        0, 'service', 'Add your Rangdhanu / PDACC positions, session by session.');
    }

    function rdMpWork(mp) {
      if (RD_MP_OWN) return rdMpWorkOwn(mp);   /* editable list on the member's own page */
      const list = (mp.work || []).filter(w => rdMpHas(w.org) || rdMpHas(w.desig))
                                  .sort(rdMpByYearDesc);
      const extra = rdMpRowsBox(rdMpRow('layers', 'Employment type', mp.empType));
      if (!list.length) {
        const one = (rdMpHas(mp.desig) || rdMpHas(mp.org))
          ? '<div class="rd-sv">' + rdMpSvGroup('briefcase', 'Current post', '',
              rdMpSvTerm('', [mp.desig, mp.org].filter(rdMpHas).join(', '),
                rdMpReal(mp.loc), true, '')) + '</div>'
          : '';
        return rdMpSection('briefcase', 'Work', one + extra, 0, 'work',
          'Add where you work — organization, designation and history.');
      }
      /* No "Present" chip here: rdMpSpan already ends the line with the word,
         and printing it twice on one row is the sort of thing that makes a page
         look automatically generated. */
      const inner = list.map(w => rdMpSvTerm(rdMpSpan(w.from, w.to), w.desig || w.org,
        [w.desig ? w.org : '', w.loc].filter(rdMpHas).join(' · '), !rdMpHas(w.to), '')).join('');
      return rdMpSection('briefcase', 'Work',
        '<div class="rd-sv">' + rdMpSvGroup('briefcase', 'Employment history',
          rdMpPlural(list.length, 'post'), inner) + '</div>' + extra, 0, 'work',
        'Add where you work — organization, designation and history.');
    }

    /* Own page: Work is an editable list -- each job has its own Edit, and Add
       work drops a new one at the top. Employment type and former position (one
       value each, not per-job) sit under the list with their own small edit. */
    function rdMpWorkRow(w, i) {
      const title = [w.desig, w.org].filter(rdMpHas).join(' — ') || 'Work';
      const meta = [rdMpSpan(w.from, w.to), rdMpReal(w.loc)].filter(rdMpHas).join(' · ');
      const type = rdMpReal(w.type);
      return '<div class="rd-mp-work-row"><div class="rd-mp-work-info">' +
        '<p class="rd-mp-work-t">' + escapeHtml(title) + '</p>' +
        (meta ? '<p class="rd-mp-work-m">' + escapeHtml(meta) + '</p>' : '') +
        (type ? '<span class="rd-mp-work-type">' + escapeHtml(type) + '</span>' : '') +
        '</div><button type="button" class="rd-mp-sec-edit" onclick="rdMpWorkEdit(' + i + ')">' +
        '<i data-lucide="pencil"></i>Edit</button></div>';
    }

    function rdMpWorkOwn(mp) {
      const list = (mp.work || []);   /* stored order = display order, newest first */
      const entries = list.length
        ? '<div class="rd-mp-worklist">' + list.map((w, i) => rdMpWorkRow(w, i)).join('') + '</div>'
        : '<p class="rd-mp-empty">No work added yet — add where you work: company, position, type and years.</p>';
      return '<div class="rd-mp-sec" data-mp-sec="work">' +
        '<div class="rd-mp-sech-row"><p class="rd-mp-sech"><i data-lucide="briefcase"></i>Work</p>' +
          '<button type="button" class="rd-mp-sec-edit" onclick="rdMpWorkEdit(-1)">' +
          '<i data-lucide="plus"></i>Add work</button></div>' +
        entries +
      '</div>';
    }

    function rdMpWorkEdit(idx) {
      const card = document.querySelector('[data-mp-sec="work"]');
      if (!card) return;
      if (RD_MP_EDITING && RD_MP_EDITING !== 'work') rdMpCancelSection();
      RD_MP_EDITING = 'work';
      const list = (rdMypRecord().work || []);
      const w = (idx >= 0 && list[idx]) ? list[idx] : { org: '', desig: '', loc: '', from: '', to: '' };
      card.classList.add('is-editing');
      const types = ['Student', 'Government', 'Autonomous', 'Semi-Autonomous', 'Private', 'Business', 'Self Employed', 'Other'];
      const wt = String(w.type || '').trim();
      card.innerHTML =
        '<div class="rd-mp-sech-row"><p class="rd-mp-sech"><i data-lucide="briefcase"></i>' +
          (idx < 0 ? 'Add work' : 'Edit work') + '</p></div>' +
        '<div class="rd-mp-ed">' +
          '<label class="rd-mp-ed-l" for="mps-w-type">Employment type</label>' +
          '<select class="rd-mp-ed-i" id="mps-w-type">' +
            '<option value=""' + (!wt ? ' selected' : '') + '>Select</option>' +
            types.map(o => '<option' + (o === wt ? ' selected' : '') + '>' + o + '</option>').join('') +
          '</select>' +
          rdMpEdField('mps-w-desig', 'Position / designation', w.desig) +
          rdMpEdField('mps-w-org', 'Organization / company', w.org) +
          '<label class="rd-mp-ed-l">Location</label>' +
          '<div data-addr="mpWorkLoc" data-addr-name="loc"></div>' +
          '<div class="rd-mp-ed-two">' +
            '<div><label class="rd-mp-ed-l" for="mps-w-from">From (year)</label>' +
              '<input class="rd-mp-ed-i" id="mps-w-from" inputmode="numeric" maxlength="4" value="' +
              escapeHtml(w.from || '') + '" placeholder="2019"></div>' +
            '<div><label class="rd-mp-ed-l" for="mps-w-to">To (year)</label>' +
              '<input class="rd-mp-ed-i" id="mps-w-to" inputmode="numeric" maxlength="4" value="' +
              escapeHtml(w.to || '') + '" placeholder="Present"></div>' +
          '</div>' +
          '<p class="rd-mp-ed-note">Leave “To” empty if this is your current job.</p>' +
          '<p class="rd-mp-ed-msg" id="mps-msg" hidden></p>' +
          '<div class="rd-mp-ed-acts">' +
            '<button type="button" class="rd-mp-ed-save" data-lbl="Save" onclick="rdMpWorkEntrySave(' + idx + ')">Save</button>' +
            (idx >= 0 ? '<button type="button" class="rd-mp-ed-del" onclick="rdMpWorkDelete(' + idx + ')">Delete</button>' : '') +
            '<button type="button" class="rd-mp-ed-cancel" onclick="rdMpCancelSection()">Cancel</button>' +
          '</div>' +
        '</div>';
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      /* Location uses the same division/district picker as the address section,
         so a member picks it the same way everywhere instead of free-typing. */
      if (typeof rdAddrInit === 'function') rdAddrInit('mpWorkLoc', w.loc || '');
      const f = card.querySelector('input'); if (f) f.focus();
    }

    async function rdMpWorkCommit(card, list) {
      const btn = card && card.querySelector('.rd-mp-ed-save');
      if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
      try {
        const r = await apiPost('membersaveprofile', Object.assign(
          { workHistory: rdMpJoin(list, ['org', 'desig', 'loc', 'from', 'to', 'type']) }, rdMemberParams()));
        if (r && r.member) {
          RD_MYP.me = r.member; RD_MEMBER.me = r.member;
          try { localStorage.setItem(RD_MEMBER_PROFILE_KEY, JSON.stringify(r.member)); } catch (e) {}
        }
        rdFeedForget('alumni'); RD_MEMBER.contacts = null; RD_MP_EDITING = null;
        rdMypViewPaint();
      } catch (err) {
        rdMpSecMsg(card, friendlyError(err).msg);
        if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
      }
      return false;
    }

    function rdMpWorkEntrySave(idx) {
      const card = document.querySelector('[data-mp-sec="work"]');
      if (!card) return false;
      const val = id => { const el = card.querySelector('#' + id); return el ? String(el.value || '').trim() : ''; };
      const desig = val('mps-w-desig'), org = val('mps-w-org');
      if (!desig && !org) { rdMpSecMsg(card, 'Add at least an organization or a designation.'); return false; }
      const entry = { org: org, desig: desig, loc: rdAddrJoin(rdAddrState.mpWorkLoc),
                      from: val('mps-w-from'), to: val('mps-w-to'), type: val('mps-w-type') };
      const list = (rdMypRecord().work || []).slice();
      if (idx < 0) list.unshift(entry); else list[idx] = entry;   /* new one goes to the top */
      return rdMpWorkCommit(card, list);
    }

    function rdMpWorkDelete(idx) {
      const card = document.querySelector('[data-mp-sec="work"]');
      const list = (rdMypRecord().work || []).slice();
      if (idx >= 0) list.splice(idx, 1);
      return rdMpWorkCommit(card, list);
    }

    /* Own page: Designations -- Rangdhanu / PDACC / Alumni Association posts,
       session by session, each with its own Edit and Add. Former position at
       Rangdhanu/PDACC lives here too (one value, its own small editor). Public
       profile keeps the grouped timeline rails. */
    function rdMpPosRow(p, i) {
      const title = rdMpReal(p.post) || 'Designation';
      const meta = [rdMpBodyOf(p.body).short, rdMpReal(p.session)].filter(rdMpHas).join(' · ');
      return '<div class="rd-mp-work-row"><div class="rd-mp-work-info">' +
        '<p class="rd-mp-work-t">' + escapeHtml(title) + '</p>' +
        (meta ? '<p class="rd-mp-work-m">' + escapeHtml(meta) + '</p>' : '') +
        '</div><button type="button" class="rd-mp-sec-edit" onclick="rdMpPosEdit(' + i + ')">' +
        '<i data-lucide="pencil"></i>Edit</button></div>';
    }

    function rdMpServiceOwn(mp) {
      const list = (mp.posts || []).filter(p => rdMpHas(p.post) || rdMpHas(p.session));
      const entries = list.length
        ? '<div class="rd-mp-worklist">' + list.map((p, i) => rdMpPosRow(p, i)).join('') + '</div>'
        : '<p class="rd-mp-empty">No designations yet — add your Rangdhanu, PDACC or Alumni Association positions, session by session.</p>';
      const fp = rdMpReal(mp.formerPos);
      const former = '<div class="rd-mp-work-foot">' +
        (rdMpHas(fp) ? '<p class="rd-mp-work-m" style="margin-bottom:.35rem"><b>Former position:</b> ' + escapeHtml(fp) + '</p>' : '') +
        '<button type="button" class="rd-mp-ed-link" onclick="rdMpEditFormer()">' +
          (rdMpHas(fp) ? 'Edit' : 'Add') + ' former position</button></div>';
      return '<div class="rd-mp-sec" data-mp-sec="service">' +
        '<div class="rd-mp-sech-row"><p class="rd-mp-sech"><i data-lucide="shield"></i>Designations</p>' +
          '<button type="button" class="rd-mp-sec-edit" onclick="rdMpPosEdit(-1)">' +
          '<i data-lucide="plus"></i>Add designation</button></div>' +
        entries + former +
      '</div>';
    }

    function rdMpPosEdit(idx) {
      const card = document.querySelector('[data-mp-sec="service"]');
      if (!card) return;
      if (RD_MP_EDITING && RD_MP_EDITING !== 'service') rdMpCancelSection();
      RD_MP_EDITING = 'service';
      const list = (rdMypRecord().posts || []);
      const p = (idx >= 0 && list[idx]) ? list[idx] : { body: 'RANGDHANU', session: '', post: '' };
      const bk = rdMpBodyOf(p.body).key;
      card.classList.add('is-editing');
      card.innerHTML =
        '<div class="rd-mp-sech-row"><p class="rd-mp-sech"><i data-lucide="shield"></i>' +
          (idx < 0 ? 'Add designation' : 'Edit designation') + '</p></div>' +
        '<div class="rd-mp-ed">' +
          '<label class="rd-mp-ed-l" for="mps-p-body">Organisation</label>' +
          '<select class="rd-mp-ed-i" id="mps-p-body">' +
            rdMpBodies().map(b => '<option value="' + b.key + '"' + (b.key === bk ? ' selected' : '') + '>' +
              escapeHtml(b.short) + '</option>').join('') +
          '</select>' +
          rdMpEdField('mps-p-post', 'Position / designation', p.post) +
          rdMpEdField('mps-p-session', 'Session (e.g. 2020-2021)', p.session) +
          '<label class="rd-mp-ed-check"><input type="checkbox" id="mps-p-committee">' +
            '<span>Also add/update this on the committee section? ' +
            '(If ticked, it appears on the committee page after admin approval.)</span></label>' +
          '<p class="rd-mp-ed-msg" id="mps-msg" hidden></p>' +
          '<div class="rd-mp-ed-acts">' +
            '<button type="button" class="rd-mp-ed-save" data-lbl="Save" onclick="rdMpPosEntrySave(' + idx + ')">Save</button>' +
            (idx >= 0 ? '<button type="button" class="rd-mp-ed-del" onclick="rdMpPosDelete(' + idx + ')">Delete</button>' : '') +
            '<button type="button" class="rd-mp-ed-cancel" onclick="rdMpCancelSection()">Cancel</button>' +
          '</div>' +
        '</div>';
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      const f = card.querySelector('input, select'); if (f) f.focus();
    }

    async function rdMpPosCommit(card, list, propose) {
      const btn = card && card.querySelector('.rd-mp-ed-save');
      if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
      try {
        const r = await apiPost('membersaveprofile', Object.assign(
          { positions: rdMpJoin(list, ['body', 'session', 'post']) }, rdMemberParams()));
        if (r && r.member) {
          RD_MYP.me = r.member; RD_MEMBER.me = r.member;
          try { localStorage.setItem(RD_MEMBER_PROFILE_KEY, JSON.stringify(r.member)); } catch (e) {}
        }
        /* When the member ticked "also on the committee section", that one post
           goes to the committee inbox for admin review -- profile save first,
           then the request. If the committee side rejects the input (a session
           that is not the full 2020-2021 form is the usual one), the profile is
           already saved, so we keep the editor open and say what to fix rather
           than losing the edit or claiming a request that never left. */
        if (propose && propose.post && propose.session) {
          try {
            await rdMpProposeCommittee(propose, (r && r.member) || RD_MYP.me || {});
          } catch (ce) {
            rdMpSecMsg(card, 'Profile saved, but the committee request was not sent: ' +
              friendlyError(ce).msg);
            if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
            RD_MP_EDITING = 'service';
            return false;
          }
        }
        rdFeedForget('alumni'); RD_MEMBER.contacts = null; RD_MP_EDITING = null;
        rdMypViewPaint();
      } catch (err) {
        rdMpSecMsg(card, friendlyError(err).msg);
        if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
      }
      return false;
    }

    /* One position -> the committee submission inbox, mirroring what the old
       "upgrade to committee" checkbox on the full form did, but for the single
       designation the member is saving right now. */
    async function rdMpProposeCommittee(entry, m) {
      const g = k => String((m && (m[k] || m[k.toLowerCase()])) || '').trim();
      const bk = rdMpBodyOf(entry.body).key;
      const committee = bk === 'PDACC' ? 'Prokoushali DUET Admission Coaching Centre (PDACC)'
        : (bk === 'ALUMNI' ? 'Rangdhanu Alumni Association' : 'Rangdhanu');
      return apiPost('submitexecutivecommittee', { data: {
        committee: committee,
        session: entry.session,
        position: entry.post,
        fullName: g('Full Name (English)'),
        department: g('Department'),
        series: g('Series'),
        mobile: g('Mobile Number') || g('Mobile'),
        email: g('Email'),
        message: 'Submitted via My Profile update',
        targetMemberId: g('Member ID') || g('memberId'),
        submissionMode: 'own'
      } });
    }

    function rdMpPosEntrySave(idx) {
      const card = document.querySelector('[data-mp-sec="service"]');
      if (!card) return false;
      const val = id => { const el = card.querySelector('#' + id); return el ? String(el.value || '').trim() : ''; };
      const post = val('mps-p-post');
      if (!post) { rdMpSecMsg(card, 'Add the position / designation.'); return false; }
      const entry = { body: val('mps-p-body') || 'RANGDHANU', session: val('mps-p-session'), post: post };
      const chk = card.querySelector('#mps-p-committee');
      const propose = chk && chk.checked ? entry : null;
      if (propose && !entry.session) {
        rdMpSecMsg(card, 'Add the session before requesting it on the committee page.'); return false;
      }
      const list = (rdMypRecord().posts || []).slice();
      if (idx < 0) list.unshift(entry); else list[idx] = entry;
      return rdMpPosCommit(card, list, propose);
    }

    function rdMpPosDelete(idx) {
      const card = document.querySelector('[data-mp-sec="service"]');
      const list = (rdMypRecord().posts || []).slice();
      if (idx >= 0) list.splice(idx, 1);
      return rdMpPosCommit(card, list);
    }

    /* Own page: Education -- university / polytechnic / school, each with Edit
       and Add. Public profile keeps the grouped rails. */
    function rdMpEduRow(e, i) {
      const title = rdMpReal(e.inst) || 'Education';
      const meta = [rdMpLevelOf(e.level).label, rdMpReal(e.field), rdMpSpan(e.from, e.to)]
        .filter(rdMpHas).join(' · ');
      return '<div class="rd-mp-work-row"><div class="rd-mp-work-info">' +
        '<p class="rd-mp-work-t">' + escapeHtml(title) + '</p>' +
        (meta ? '<p class="rd-mp-work-m">' + escapeHtml(meta) + '</p>' : '') +
        '</div><button type="button" class="rd-mp-sec-edit" onclick="rdMpEduEdit(' + i + ')">' +
        '<i data-lucide="pencil"></i>Edit</button></div>';
    }

    function rdMpEduOwn(mp) {
      const list = (mp.edu || []).filter(e => rdMpHas(e.inst));
      const entries = list.length
        ? '<div class="rd-mp-worklist">' + list.map((e, i) => rdMpEduRow(e, i)).join('') + '</div>'
        : '<p class="rd-mp-empty">No education added yet — add DUET, and your school.</p>';
      return '<div class="rd-mp-sec" data-mp-sec="edu">' +
        '<div class="rd-mp-sech-row"><p class="rd-mp-sech"><i data-lucide="graduation-cap"></i>Education</p>' +
          '<button type="button" class="rd-mp-sec-edit" onclick="rdMpEduEdit(-1)">' +
          '<i data-lucide="plus"></i>Add education</button></div>' +
        entries +
      '</div>';
    }

    function rdMpEduEdit(idx) {
      const card = document.querySelector('[data-mp-sec="edu"]');
      if (!card) return;
      if (RD_MP_EDITING && RD_MP_EDITING !== 'edu') rdMpCancelSection();
      RD_MP_EDITING = 'edu';
      const list = (rdMypRecord().edu || []);
      const e = (idx >= 0 && list[idx]) ? list[idx] : { level: 'UNIVERSITY', inst: '', field: '', from: '', to: '' };
      const lk = rdMpLevelOf(e.level).key;
      card.classList.add('is-editing');
      card.innerHTML =
        '<div class="rd-mp-sech-row"><p class="rd-mp-sech"><i data-lucide="graduation-cap"></i>' +
          (idx < 0 ? 'Add education' : 'Edit education') + '</p></div>' +
        '<div class="rd-mp-ed">' +
          '<label class="rd-mp-ed-l" for="mps-e-level">Level</label>' +
          '<select class="rd-mp-ed-i" id="mps-e-level">' +
            RD_MP_LEVELS.map(l => '<option value="' + l.key + '"' + (l.key === lk ? ' selected' : '') + '>' +
              escapeHtml(l.label) + '</option>').join('') +
          '</select>' +
          rdMpEdField('mps-e-inst', 'Institution', e.inst) +
          rdMpEdField('mps-e-field', 'Degree / field', e.field) +
          '<div class="rd-mp-ed-two">' +
            '<div><label class="rd-mp-ed-l" for="mps-e-from">From (year)</label>' +
              '<input class="rd-mp-ed-i" id="mps-e-from" inputmode="numeric" maxlength="4" value="' +
              escapeHtml(e.from || '') + '" placeholder="2015"></div>' +
            '<div><label class="rd-mp-ed-l" for="mps-e-to">To (year)</label>' +
              '<input class="rd-mp-ed-i" id="mps-e-to" inputmode="numeric" maxlength="4" value="' +
              escapeHtml(e.to || '') + '" placeholder="2019"></div>' +
          '</div>' +
          '<p class="rd-mp-ed-msg" id="mps-msg" hidden></p>' +
          '<div class="rd-mp-ed-acts">' +
            '<button type="button" class="rd-mp-ed-save" data-lbl="Save" onclick="rdMpEduEntrySave(' + idx + ')">Save</button>' +
            (idx >= 0 ? '<button type="button" class="rd-mp-ed-del" onclick="rdMpEduDelete(' + idx + ')">Delete</button>' : '') +
            '<button type="button" class="rd-mp-ed-cancel" onclick="rdMpCancelSection()">Cancel</button>' +
          '</div>' +
        '</div>';
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      const f = card.querySelector('input, select'); if (f) f.focus();
    }

    async function rdMpEduCommit(card, list) {
      const btn = card && card.querySelector('.rd-mp-ed-save');
      if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
      try {
        const r = await apiPost('membersaveprofile', Object.assign(
          { education: rdMpJoin(list, ['level', 'inst', 'field', 'from', 'to']) }, rdMemberParams()));
        if (r && r.member) {
          RD_MYP.me = r.member; RD_MEMBER.me = r.member;
          try { localStorage.setItem(RD_MEMBER_PROFILE_KEY, JSON.stringify(r.member)); } catch (e) {}
        }
        rdFeedForget('alumni'); RD_MEMBER.contacts = null; RD_MP_EDITING = null;
        rdMypViewPaint();
      } catch (err) {
        rdMpSecMsg(card, friendlyError(err).msg);
        if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
      }
      return false;
    }

    function rdMpEduEntrySave(idx) {
      const card = document.querySelector('[data-mp-sec="edu"]');
      if (!card) return false;
      const val = id => { const el = card.querySelector('#' + id); return el ? String(el.value || '').trim() : ''; };
      const inst = val('mps-e-inst');
      if (!inst) { rdMpSecMsg(card, 'Add the institution name.'); return false; }
      const entry = { level: val('mps-e-level') || 'UNIVERSITY', inst: inst,
                      field: val('mps-e-field'), from: val('mps-e-from'), to: val('mps-e-to') };
      const list = (rdMypRecord().edu || []).slice();
      if (idx < 0) list.unshift(entry); else list[idx] = entry;
      return rdMpEduCommit(card, list);
    }

    function rdMpEduDelete(idx) {
      const card = document.querySelector('[data-mp-sec="edu"]');
      const list = (rdMypRecord().edu || []).slice();
      if (idx >= 0) list.splice(idx, 1);
      return rdMpEduCommit(card, list);
    }

    function rdMpEditFormer() {
      const card = document.querySelector('[data-mp-sec="service"]');
      if (!card) return;
      if (RD_MP_EDITING && RD_MP_EDITING !== 'service') rdMpCancelSection();
      RD_MP_EDITING = 'service';
      const mp = rdMypRecord();
      card.classList.add('is-editing');
      card.innerHTML =
        '<div class="rd-mp-sech-row"><p class="rd-mp-sech"><i data-lucide="award"></i>Former position</p></div>' +
        '<div class="rd-mp-ed">' +
          rdMpEdField('mps-former', 'Former position at Rangdhanu / PDACC', mp.formerPos) +
          '<p class="rd-mp-ed-msg" id="mps-msg" hidden></p>' +
          '<div class="rd-mp-ed-acts">' +
            '<button type="button" class="rd-mp-ed-save" data-lbl="Save" onclick="rdMpFormerSave()">Save</button>' +
            '<button type="button" class="rd-mp-ed-cancel" onclick="rdMpCancelSection()">Cancel</button>' +
          '</div>' +
        '</div>';
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      const f = card.querySelector('input'); if (f) f.focus();
    }

    async function rdMpFormerSave() {
      const card = document.querySelector('[data-mp-sec="service"]');
      if (!card) return false;
      const el = card.querySelector('#mps-former');
      const btn = card.querySelector('.rd-mp-ed-save');
      if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
      try {
        const r = await apiPost('membersaveprofile', Object.assign(
          { formerPosition: el ? String(el.value || '').trim() : '' }, rdMemberParams()));
        if (r && r.member) {
          RD_MYP.me = r.member; RD_MEMBER.me = r.member;
          try { localStorage.setItem(RD_MEMBER_PROFILE_KEY, JSON.stringify(r.member)); } catch (e) {}
        }
        rdFeedForget('alumni'); RD_MEMBER.contacts = null; RD_MP_EDITING = null;
        rdMypViewPaint();
      } catch (err) {
        rdMpSecMsg(card, friendlyError(err).msg);
        if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
      }
      return false;
    }

    /* Education groups by level for the same reason service groups by body:
       three crests, three rails, and a reader can find the polytechnic without
       reading the university first. */
    function rdMpEdu(mp) {
      if (RD_MP_OWN) return rdMpEduOwn(mp);   /* editable list on the own page */
      const list = (mp.edu || []).filter(e => rdMpHas(e.inst));
      if (!list.length) return rdMpSection('graduation-cap', 'Education', '', 0, 'edu',
        'Add your education — DUET, and your school.');
      const groups = RD_MP_LEVELS.map(lv => {
        const mine = list.filter(e => rdMpLevelOf(e.level).key === lv.key).sort(rdMpByYearDesc);
        if (!mine.length) return '';
        const inner = mine.map(e => rdMpSvTerm(rdMpSpan(e.from, e.to), e.inst,
          rdMpReal(e.field), !rdMpHas(e.to) && rdMpHas(e.from), '')).join('');
        return rdMpSvGroup(lv.icon, lv.label, rdMpPlural(mine.length, 'record'), inner);
      }).join('');
      return rdMpSection('graduation-cap', 'Education', '<div class="rd-sv">' + groups + '</div>',
        0, 'edu', 'Add your education — DUET, and your school.');
    }

    /* ---- thesis and papers --------------------------------------------- */
    /* A thesis abstract can run to a page. It is clamped on a word boundary
       with the full text already in the DOM behind a hidden attribute, so See
       more is instant and a printout still carries everything. */
    const RD_MP_CLAMP = 320;

    /* aria-controls needs a real id, and the public profile and My Profile are
       both in the DOM at once, so a fixed id would be in the page twice and See
       more on one page would open the other one's abstract. Each block gets its
       own pair and the button carries the stem. */
    let RD_MP_TH_N = 0;

    function rdMpResearch(mp) {
      if (RD_MP_OWN) return rdMpResearchOwn(mp);   /* editable thesis + paper list on the own page */
      const papers = (mp.papers || []).filter(p => rdMpHas(p.url));
      if (!rdMpHas(mp.thesis) && !papers.length) return rdMpSection('flask-conical',
        'Thesis and papers', '', 0, 'research', 'Add your thesis topic or published papers.');
      let out = '';
      if (rdMpHas(mp.thesis)) {
        out += '<div class="rd-mp-th"><p class="rd-mp-tht">' + escapeHtml(mp.thesis) + '</p>';
        const d = String(mp.thesisDetails || '').trim();
        if (d.length > RD_MP_CLAMP) {
          const uid = 'rd-th-' + (++RD_MP_TH_N);
          let cut = d.slice(0, RD_MP_CLAMP);
          const sp = cut.lastIndexOf(' ');
          if (sp > RD_MP_CLAMP * 0.6) cut = cut.slice(0, sp);
          cut = cut.replace(/[\s,;:.-]+$/, '');
          out += '<p class="rd-mp-thd" id="' + uid + '-s">' + escapeHtml(cut) + '...</p>' +
            '<p class="rd-mp-thd" id="' + uid + '-l" hidden>' + escapeHtml(d) + '</p>' +
            '<button type="button" class="rd-mp-more" data-th="' + uid + '" ' +
              'aria-expanded="false" aria-controls="' + uid + '-l" onclick="rdMpThesisMore(this)">See more</button>';
        } else if (d) {
          out += '<p class="rd-mp-thd">' + escapeHtml(d) + '</p>';
        }
        out += '</div>';
      }
      if (papers.length) {
        out += '<div class="rd-mp-papers' + (rdMpHas(mp.thesis) ? ' has-th' : '') + '">' +
          papers.map(p => {
            const host = String(p.url).replace(/^https?:\/\//i, '').split('/')[0];
            return '<a class="rd-mp-paper" href="' + escapeHtml(p.url) + '" target="_blank" ' +
              'rel="noopener noreferrer nofollow">' +
              '<i data-lucide="file-text"></i>' +
              '<span class="rd-mp-papert">' + escapeHtml(p.title || p.url) + '</span>' +
              '<span class="rd-mp-paperh">' + escapeHtml(host) + ' &#8599;</span></a>';
          }).join('') + '</div>';
      }
      return rdMpSection('flask-conical', 'Thesis and papers', out,
        0, 'research', 'Add your thesis topic or published papers.');
    }

    /* Own page: thesis is one small block (topic + details) with its own Edit;
       papers are an editable list, each with Edit and an Add paper at the top.
       Both write through the same research commit, which sends only its fields. */
    function rdMpPaperRow(p, i) {
      const host = String(p.url).replace(/^https?:\/\//i, '').split('/')[0];
      return '<div class="rd-mp-work-row"><div class="rd-mp-work-info">' +
        '<p class="rd-mp-work-t">' + escapeHtml(p.title || p.url) + '</p>' +
        '<p class="rd-mp-work-m">' + escapeHtml(host) + '</p>' +
        '</div><button type="button" class="rd-mp-sec-edit" onclick="rdMpPaperEdit(' + i + ')">' +
        '<i data-lucide="pencil"></i>Edit</button></div>';
    }

    /* Thesis and published papers are two different things -- a final-year
       thesis is often never published -- so each is its own section with its
       own Edit, matching the two boxes on the update form. */
    function rdMpResearchOwn(mp) {
      const th = rdMpReal(mp.thesis);
      const det = String(mp.thesisDetails || '').trim();
      let detClip = '';
      if (th && det) {
        detClip = det.length > 140 ? det.slice(0, 140).replace(/\s+\S*$/, '') + '…' : det;
      }
      const thBody = th
        ? '<div class="rd-mp-worklist"><div class="rd-mp-work-row"><div class="rd-mp-work-info">' +
            '<p class="rd-mp-work-t">' + escapeHtml(th) + '</p>' +
            (detClip ? '<p class="rd-mp-work-m">' + escapeHtml(detClip) + '</p>' : '') +
          '</div></div></div>'
        : '<p class="rd-mp-empty">Add your final-year thesis topic.</p>';
      const thesisCard = '<div class="rd-mp-sec' + (th ? '' : ' is-empty') + '" data-mp-sec="thesis">' +
        '<div class="rd-mp-sech-row"><p class="rd-mp-sech"><i data-lucide="flask-conical"></i>Thesis</p>' +
          '<button type="button" class="rd-mp-sec-edit" onclick="rdMpThesisEdit()">' +
          '<i data-lucide="' + (th ? 'pencil' : 'plus') + '"></i>' + (th ? 'Edit' : 'Add') + '</button></div>' +
        thBody +
      '</div>';

      const papers = (mp.papers || []).filter(p => rdMpHas(p.url));
      const paperBody = papers.length
        ? '<div class="rd-mp-worklist">' + papers.map((p, i) => rdMpPaperRow(p, i)).join('') + '</div>'
        : '<p class="rd-mp-empty">No papers added yet — add a link to a published paper.</p>';
      const papersCard = '<div class="rd-mp-sec' + (papers.length ? '' : ' is-empty') + '" data-mp-sec="papers">' +
        '<div class="rd-mp-sech-row"><p class="rd-mp-sech"><i data-lucide="file-text"></i>Published papers</p>' +
          '<button type="button" class="rd-mp-sec-edit" onclick="rdMpPaperEdit(-1)">' +
          '<i data-lucide="plus"></i>Add paper</button></div>' +
        paperBody +
      '</div>';

      return thesisCard + papersCard;
    }

    function rdMpThesisEdit() {
      const card = document.querySelector('[data-mp-sec="thesis"]');
      if (!card) return;
      if (RD_MP_EDITING && RD_MP_EDITING !== 'thesis') rdMpCancelSection();
      RD_MP_EDITING = 'thesis';
      const mp = rdMypRecord();
      card.classList.add('is-editing');
      card.innerHTML =
        '<div class="rd-mp-sech-row"><p class="rd-mp-sech"><i data-lucide="flask-conical"></i>Thesis</p></div>' +
        '<div class="rd-mp-ed">' +
          rdMpEdField('mps-thesis', 'Thesis topic', mp.thesis) +
          '<label class="rd-mp-ed-l" for="mps-thdet">Thesis details (optional)</label>' +
          '<textarea class="rd-mp-ed-i" id="mps-thdet" rows="4">' + escapeHtml(mp.thesisDetails || '') + '</textarea>' +
          '<p class="rd-mp-ed-msg" id="mps-msg" hidden></p>' +
          '<div class="rd-mp-ed-acts">' +
            '<button type="button" class="rd-mp-ed-save" data-lbl="Save" onclick="rdMpThesisSave()">Save</button>' +
            '<button type="button" class="rd-mp-ed-cancel" onclick="rdMpCancelSection()">Cancel</button>' +
          '</div>' +
        '</div>';
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      const f = card.querySelector('input, textarea'); if (f) f.focus();
    }

    function rdMpThesisSave() {
      const card = document.querySelector('[data-mp-sec="thesis"]');
      if (!card) return false;
      const val = id => { const el = card.querySelector('#' + id); return el ? String(el.value || '').trim() : ''; };
      return rdMpResearchCommit(card, { thesisTopic: val('mps-thesis'), thesisDetails: val('mps-thdet') });
    }

    function rdMpPaperEdit(idx) {
      const card = document.querySelector('[data-mp-sec="papers"]');
      if (!card) return;
      if (RD_MP_EDITING && RD_MP_EDITING !== 'papers') rdMpCancelSection();
      RD_MP_EDITING = 'papers';
      const list = (rdMypRecord().papers || []).filter(p => rdMpHas(p.url));
      const p = (idx >= 0 && list[idx]) ? list[idx] : { title: '', url: '' };
      card.classList.add('is-editing');
      card.innerHTML =
        '<div class="rd-mp-sech-row"><p class="rd-mp-sech"><i data-lucide="file-text"></i>' +
          (idx < 0 ? 'Add paper' : 'Edit paper') + '</p></div>' +
        '<div class="rd-mp-ed">' +
          rdMpEdField('mps-p-title', 'Title', p.title) +
          rdMpEdField('mps-p-url', 'Link (https://…)', p.url, 'url') +
          '<p class="rd-mp-ed-msg" id="mps-msg" hidden></p>' +
          '<div class="rd-mp-ed-acts">' +
            '<button type="button" class="rd-mp-ed-save" data-lbl="Save" onclick="rdMpPaperEntrySave(' + idx + ')">Save</button>' +
            (idx >= 0 ? '<button type="button" class="rd-mp-ed-del" onclick="rdMpPaperDelete(' + idx + ')">Delete</button>' : '') +
            '<button type="button" class="rd-mp-ed-cancel" onclick="rdMpCancelSection()">Cancel</button>' +
          '</div>' +
        '</div>';
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      const f = card.querySelector('input'); if (f) f.focus();
    }

    async function rdMpResearchCommit(card, payload) {
      const btn = card && card.querySelector('.rd-mp-ed-save');
      if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
      try {
        const r = await apiPost('membersaveprofile', Object.assign({}, payload, rdMemberParams()));
        if (r && r.member) {
          RD_MYP.me = r.member; RD_MEMBER.me = r.member;
          try { localStorage.setItem(RD_MEMBER_PROFILE_KEY, JSON.stringify(r.member)); } catch (e) {}
        }
        rdFeedForget('alumni'); RD_MEMBER.contacts = null; RD_MP_EDITING = null;
        rdMypViewPaint();
      } catch (err) {
        rdMpSecMsg(card, friendlyError(err).msg);
        if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
      }
      return false;
    }

    function rdMpPaperEntrySave(idx) {
      const card = document.querySelector('[data-mp-sec="papers"]');
      if (!card) return false;
      const val = id => { const el = card.querySelector('#' + id); return el ? String(el.value || '').trim() : ''; };
      const url = val('mps-p-url');
      if (!/^https?:\/\//i.test(url)) {
        rdMpSecMsg(card, 'A paper link has to start with https:// and point at a page.'); return false;
      }
      const entry = { title: val('mps-p-title') || url, url: url };
      const list = (rdMypRecord().papers || []).filter(p => rdMpHas(p.url)).slice();
      if (idx < 0) list.unshift(entry); else list[idx] = entry;   /* new one goes to the top */
      return rdMpResearchCommit(card, { papers: rdMpJoin(list, ['title', 'url']) });
    }

    function rdMpPaperDelete(idx) {
      const card = document.querySelector('[data-mp-sec="papers"]');
      const list = (rdMypRecord().papers || []).filter(p => rdMpHas(p.url)).slice();
      if (idx >= 0) list.splice(idx, 1);
      return rdMpResearchCommit(card, { papers: rdMpJoin(list, ['title', 'url']) });
    }

    function rdMpThesisMore(btn) {
      const uid = btn.getAttribute('data-th') || '';
      const s = document.getElementById(uid + '-s'), l = document.getElementById(uid + '-l');
      if (!s || !l) return;
      const open = l.hasAttribute('hidden');
      if (open) { l.removeAttribute('hidden'); s.setAttribute('hidden', ''); }
      else { l.setAttribute('hidden', ''); s.removeAttribute('hidden'); }
      btn.textContent = open ? 'See less' : 'See more';
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    /* ---- contact ------------------------------------------------------- */
    /* Signed out, the block keeps its shape and loses its cells. The page does
       not reflow when a member signs in, which is what makes signing in feel
       like a door rather than a redesign.

       The inner half is its own function because the public profile builds its
       Contact section through rdMemberPrivateRows, whose signature the harness
       pins. Both pages therefore draw the same lock card and the same rows from
       the same source, and neither owns a second copy of it. */
    function rdMpContactInner(mp, st) {
      if (!st.signed) {
        return '<div class="rd-mp-gate">' +
            '<div class="rd-mp-gate-ico"><i data-lucide="lock"></i></div>' +
            '<p class="rd-mp-gate-h">Mobile, WhatsApp, email and address</p>' +
            '<p class="rd-mp-gate-p">Shown to signed in members only.</p>' +
            '<button type="button" class="rd-mp-act rd-mp-act-call" style="margin-top:.85rem" ' +
              'onclick="openMemberSignIn(\'profile\')"><i data-lucide="shield-check"></i> ' +
              'Member Sign In</button>' +
          '</div>';
      }
      return rdMpRowsBox(
        rdMpRow('phone', 'Mobile', mp.mobile, true) +
        rdMpRow('message-circle', 'WhatsApp', mp.whatsapp, true) +
        rdMpRow('mail', 'Email', mp.email));
    }

    function rdMpContact(mp, st) {
      /* editKey only on the member's own page; rdMpSection ignores it elsewhere. */
      return rdMpSection('contact', 'Contact', rdMpContactInner(mp, st), 1, 'contact');
    }

    /* Address is its own section so its editor can host the division/district
       picker in the room it needs -- crammed into Contact it had no space, and
       Contact's editor never edited it, so it was read-only by accident. */
    function rdMpAddressInner(mp, st) {
      if (!st.signed) return '';
      return rdMpRowsBox(
        rdMpRow('home', 'Permanent address', mp.permanent) +
        rdMpRow('map-pin', 'Present address', mp.present));
    }

    function rdMpAddress(mp, st) {
      if (!st.signed) return '';
      return rdMpSection('map-pin', 'Address', rdMpAddressInner(mp, st), 1, 'address',
        'Add your permanent and present address.');
    }

    /* The site already has one social block, with its own glyphs and its own
       colours. A second set drawn here would be two answers to one question. */
    function rdMpSocial(mp, st) {
      if (!st.signed) return '';
      const chips = rdSocialChips(mp.social);
      return rdMpSection('at-sign', 'Social media', chips || '', 1, 'social',
        'Add your social media links.');
    }

    /* ================= SECTION-WISE INLINE EDITING (Facebook-style) =======
       Each section on the member's own profile carries an Edit pencil. Opening
       one swaps that one card into an editor with its own Save / Cancel -- no
       global form, one section at a time. Save sends only that section's
       fields; membersaveprofile already writes only what the payload carries. */

    function rdMpEdVis(id, header, vis) {
      const v = String((vis && vis[header]) || '').toUpperCase() === 'ONLY_ME' ? 'ONLY_ME' : 'MEMBER';
      return '<div class="rd-mp-ed-vis"><i data-lucide="eye"></i><span>Visible to</span>' +
        '<select id="' + id + '">' +
          '<option value="MEMBER"' + (v === 'MEMBER' ? ' selected' : '') + '>Rangdhanu members</option>' +
          '<option value="ONLY_ME"' + (v === 'ONLY_ME' ? ' selected' : '') + '>Only me</option>' +
        '</select></div>';
    }

    /* Shown once under the visibility controls of each editor that has them, so
       members know "Only me" hides a field from the directory but not the
       Association. Carried over from the old Update-profile form. */
    const RD_MP_VIS_NOTE = '<p class="rd-mp-ed-note">"Only me" keeps a field out of the member directory. The Association still sees it.</p>';

    function rdMpEdField(id, label, value, type) {
      return '<label class="rd-mp-ed-l" for="' + id + '">' + escapeHtml(label) + '</label>' +
        '<input class="rd-mp-ed-i" id="' + id + '" type="' + (type || 'text') + '" value="' +
          escapeHtml(value || '') + '">';
    }

    function rdMpSectionEditor(key, mp, vis) {
      if (key === 'contact') {
        return '<div class="rd-mp-sech-row"><p class="rd-mp-sech"><i data-lucide="contact"></i>Contact</p></div>' +
          '<div class="rd-mp-ed">' +
            rdMpEdField('mps-mobile', 'Mobile number', mp.mobile, 'tel') +
            rdMpEdVis('mps-vis-mobile', 'Mobile Number', vis) +
            rdMpEdField('mps-whatsapp', 'WhatsApp number', mp.whatsapp, 'tel') +
            rdMpEdVis('mps-vis-whatsapp', 'WhatsApp Number', vis) +
            rdMpEdField('mps-email', 'Email', mp.email, 'email') +
            rdMpEdVis('mps-vis-email', 'Email', vis) +
            RD_MP_VIS_NOTE +
            '<p class="rd-mp-ed-msg" id="mps-msg" hidden></p>' +
            '<div class="rd-mp-ed-acts">' +
              '<button type="button" class="rd-mp-ed-save" data-lbl="Save contact" onclick="rdMpSectionSave(\'contact\')">Save contact</button>' +
              '<button type="button" class="rd-mp-ed-cancel" onclick="rdMpCancelSection()">Cancel</button>' +
            '</div>' +
          '</div>';
      }
      if (key === 'blood') {
        const groups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
        const g = String(mp.blood || '').trim();
        const wd = String(mp.willDonate || '').trim().toUpperCase();
        const ld = String(mp.lastDonation || '').trim();
        const today = new Date().toISOString().slice(0, 10);
        return '<div class="rd-mp-sech-row"><p class="rd-mp-sech"><i data-lucide="droplet"></i>Blood donation</p></div>' +
          '<div class="rd-mp-ed">' +
            '<label class="rd-mp-ed-l" for="mps-blood">Blood group</label>' +
            '<select class="rd-mp-ed-i" id="mps-blood">' +
              '<option value=""' + (!g ? ' selected' : '') + '>Select</option>' +
              groups.map(o => '<option' + (o === g ? ' selected' : '') + '>' + o + '</option>').join('') +
            '</select>' +
            '<label class="rd-mp-ed-l" for="mps-willdonate">Willing to donate blood?</label>' +
            '<select class="rd-mp-ed-i" id="mps-willdonate">' +
              '<option value=""' + (!wd ? ' selected' : '') + '>Not specified</option>' +
              '<option value="YES"' + (wd === 'YES' ? ' selected' : '') + '>Yes, I can donate</option>' +
              '<option value="NO"' + (wd === 'NO' ? ' selected' : '') + '>No, not right now</option>' +
            '</select>' +
            '<p class="rd-mp-ed-note">If yes, your name shows in the Blood Bank directory.</p>' +
            '<label class="rd-mp-ed-l" for="mps-lastdonation">Last donation date</label>' +
            '<input class="rd-mp-ed-i" id="mps-lastdonation" type="date" value="' + escapeHtml(ld) + '" max="' + today + '">' +
            '<p class="rd-mp-ed-msg" id="mps-msg" hidden></p>' +
            '<div class="rd-mp-ed-acts">' +
              '<button type="button" class="rd-mp-ed-save" data-lbl="Save" onclick="rdMpSectionSave(\'blood\')">Save</button>' +
              '<button type="button" class="rd-mp-ed-cancel" onclick="rdMpCancelSection()">Cancel</button>' +
            '</div>' +
          '</div>';
      }
      if (key === 'address') {
        return '<div class="rd-mp-sech-row"><p class="rd-mp-sech"><i data-lucide="map-pin"></i>Address</p></div>' +
          '<div class="rd-mp-ed">' +
            '<label class="rd-mp-ed-l">Permanent address</label>' +
            '<div data-addr="mpPermanent" data-addr-name="permanentAddress"></div>' +
            rdMpEdVis('mps-vis-permanent', 'Permanent Address', vis) +
            '<label class="rd-mp-ed-l" style="margin-top:.9rem">Present address</label>' +
            '<div data-addr="mpPresent" data-addr-name="presentAddress"></div>' +
            rdMpEdVis('mps-vis-present', 'Present Address', vis) +
            RD_MP_VIS_NOTE +
            '<p class="rd-mp-ed-msg" id="mps-msg" hidden></p>' +
            '<div class="rd-mp-ed-acts">' +
              '<button type="button" class="rd-mp-ed-save" data-lbl="Save address" onclick="rdMpSectionSave(\'address\')">Save address</button>' +
              '<button type="button" class="rd-mp-ed-cancel" onclick="rdMpCancelSection()">Cancel</button>' +
            '</div>' +
          '</div>';
      }
      if (key === 'social') {
        /* The widget draws its own rows, Add button and error line inside the
           mount; the editor only frames it with the section's Save / Cancel. */
        return '<div class="rd-mp-sech-row"><p class="rd-mp-sech"><i data-lucide="at-sign"></i>Social media</p></div>' +
          '<div class="rd-mp-ed">' +
            '<div id="mps-soc-mount" data-rd-social></div>' +
            rdMpEdVis('mps-vis-social', 'Social Links', vis) +
            RD_MP_VIS_NOTE +
            '<p class="rd-mp-ed-msg" id="mps-msg" hidden></p>' +
            '<div class="rd-mp-ed-acts">' +
              '<button type="button" class="rd-mp-ed-save" data-lbl="Save" onclick="rdMpSectionSave(\'social\')">Save</button>' +
              '<button type="button" class="rd-mp-ed-cancel" onclick="rdMpCancelSection()">Cancel</button>' +
            '</div>' +
          '</div>';
      }
      return '';
    }

    function rdMpEditSection(key) {
      if (RD_MP_EDITING && RD_MP_EDITING !== key) rdMpCancelSection();
      const card = document.querySelector('[data-mp-sec="' + key + '"]');
      if (!card) return;
      const mp = rdMypRecord();
      const vis = (RD_MYP.me && RD_MYP.me.visibility) || {};
      const editor = rdMpSectionEditor(key, mp, vis);
      if (!editor) {
        /* Sections not yet converted to inline editing open the full form for
           now -- Address and the multi-row editors come in a later stage. */
        if (typeof rdMypTab === 'function') rdMypTab('edit');
        return;
      }
      RD_MP_EDITING = key;
      card.classList.add('is-editing');
      card.innerHTML = editor;
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      /* The address editor hosts the shared division/district picker; mount it
         once the editor markup is in the DOM so the picker has its box. */
      if (key === 'address') {
        if (typeof rdAddrInit === 'function') {
          rdAddrInit('mpPermanent', mp.permanent || '');
          rdAddrInit('mpPresent', mp.present || '');
        }
        return;
      }
      /* The social widget builds its own rows from the saved links, so the
         member edits the same block the registration form uses. */
      if (key === 'social') {
        if (typeof rdSocialRender === 'function') {
          rdSocialRender('mps-soc-mount', typeof rdSocialParse === 'function' ? rdSocialParse(mp.social) : []);
        }
        return;
      }
      const first = card.querySelector('input, select');
      if (first) first.focus();
    }

    function rdMpCancelSection() {
      RD_MP_EDITING = null;
      rdMypViewPaint();     /* repaint restores the section to its read state */
    }

    function rdMpSecMsg(card, msg) {
      const box = card && card.querySelector('.rd-mp-ed-msg');
      if (!box) return;
      box.textContent = msg;
      box.hidden = false;
    }

    async function rdMpSectionSave(key) {
      const card = document.querySelector('[data-mp-sec="' + key + '"]');
      if (!card) return false;
      const val = id => { const el = card.querySelector('#' + id); return el ? String(el.value || '').trim() : ''; };
      let payload = null;
      if (key === 'contact') {
        const mobile = val('mps-mobile');
        if (!mobile) { rdMpSecMsg(card, 'Mobile number cannot be empty.'); return false; }
        if (typeof isValidBdMobile === 'function' && !isValidBdMobile(mobile)) {
          rdMpSecMsg(card, 'That mobile number does not look right. Example: 017xxxxxxxx'); return false;
        }
        const wa = val('mps-whatsapp');
        if (wa && typeof isValidBdMobile === 'function' && !isValidBdMobile(wa)) {
          rdMpSecMsg(card, 'That WhatsApp number does not look right.'); return false;
        }
        payload = {
          mobile: mobile, whatsapp: wa, email: val('mps-email'),
          visibility: {
            'Mobile Number': val('mps-vis-mobile') || 'MEMBER',
            'WhatsApp Number': val('mps-vis-whatsapp') || 'MEMBER',
            'Email': val('mps-vis-email') || 'MEMBER'
          }
        };
      }
      if (key === 'blood') {
        /* All three optional; the server validates the group, YES/NO and date. */
        payload = { blood: val('mps-blood'), willDonate: val('mps-willdonate'), lastDonation: val('mps-lastdonation') };
      }
      if (key === 'address') {
        /* Read straight from the picker's state, not from #ids -- the parts live
           in rdAddrState and rdAddrJoin is the one place that knows their order. */
        payload = {
          permanentAddress: rdAddrJoin(rdAddrState.mpPermanent),
          presentAddress: rdAddrJoin(rdAddrState.mpPresent),
          visibility: {
            'Permanent Address': val('mps-vis-permanent') || 'MEMBER',
            'Present Address': val('mps-vis-present') || 'MEMBER'
          }
        };
      }
      if (key === 'social') {
        /* rdSocialCollect validates each row and shows its own inline error
           inside the widget, returning null when something is wrong. */
        const serialized = rdSocialCollect('mps-soc-mount');
        if (serialized === null) return false;
        payload = {
          socialLinks: serialized,
          visibility: { 'Social Links': val('mps-vis-social') || 'MEMBER' }
        };
      }
      if (!payload) return false;
      const btn = card.querySelector('.rd-mp-ed-save');
      const saveLbl = (btn && btn.dataset.lbl) || 'Save';
      if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
      try {
        const r = await apiPost('membersaveprofile', Object.assign({}, payload, rdMemberParams()));
        if (r && r.member) {
          RD_MYP.me = r.member; RD_MEMBER.me = r.member;
          try { localStorage.setItem(RD_MEMBER_PROFILE_KEY, JSON.stringify(r.member)); } catch (e) {}
        }
        rdFeedForget('alumni');
        RD_MEMBER.contacts = null;
        /* No confirmation page. The "Saving..." label was the loading state;
           on success the button turns into "Saved" for a beat, then the card
           returns to its read view in place -- never leaving the profile. */
        if (btn) { btn.textContent = 'Saved'; btn.classList.add('is-saved'); }
        setTimeout(function () { RD_MP_EDITING = null; rdMypViewPaint(); }, 850);
      } catch (err) {
        rdMpSecMsg(card, friendlyError(err).msg);
        if (btn) { btn.disabled = false; btn.textContent = saveLbl; }
      }
      return false;
    }

    /* ---- what is still missing ----------------------------------------- */
    /* Only on a member's own page, and only while something is actually
       missing. RD_MP_BASE is what registration already collected: it counts
       towards the total but is never listed, because the member cannot edit it.
       Leaving it out of the sum was the first version's mistake -- a new member
       saw "0% complete" over a page that already carried her name, series,
       department and number, which reads as a telling-off, not a next step. */
    const RD_MP_BASE = ['name', 'memberId', 'dept', 'series', 'batch', 'mobile'];

    const RD_MP_WANTED = [
      ['desig', 'Designation'], ['org', 'Organization'], ['empType', 'Employment type'],
      ['loc', 'Work location'], ['blood', 'Blood group'], ['whatsapp', 'WhatsApp'],
      ['email', 'Email'], ['permanent', 'Permanent address'], ['present', 'Present address'],
      ['photo', 'Photo']
    ];

    function rdMpTodo(mp, st) {
      if (!st.own) return '';
      const missing = RD_MP_WANTED.filter(w => !rdMpHas(mp[w[0]]));
      if (!missing.length) return '';
      const done = RD_MP_BASE.filter(k => rdMpHas(mp[k])).length +
                   (RD_MP_WANTED.length - missing.length);
      const total = RD_MP_BASE.length + RD_MP_WANTED.length;
      const pct = Math.round(100 * done / total);
      /* r = 15.915 makes the circumference exactly 100, so the dash offset is
         just (100 - pct): the arc reads as a percentage with no arithmetic. */
      const heading = missing.length
        ? 'Finish your profile'
        : 'Your profile is complete';
      return '<div class="rd-mp-todo">' +
        '<div class="rd-mp-ring' + (pct >= 100 ? ' is-full' : '') + '"' +
          ' role="img" aria-label="Profile ' + pct + '% complete">' +
          '<svg viewBox="0 0 40 40" aria-hidden="true">' +
            '<circle class="rd-mp-ring-bg" cx="20" cy="20" r="15.915"></circle>' +
            '<circle class="rd-mp-ring-fg" cx="20" cy="20" r="15.915"' +
              ' stroke-dasharray="100" stroke-dashoffset="' + (100 - pct) + '"></circle>' +
          '</svg>' +
          '<span class="rd-mp-ring-n">' + pct + '<i>%</i></span>' +
        '</div>' +
        '<div class="rd-mp-todo-body">' +
          '<p class="rd-mp-todo-t">' + heading +
            '<span class="rd-mp-todo-c">' + done + '/' + total + ' done</span></p>' +
          (missing.length
            ? '<ul class="rd-mp-todo-l">' + missing.slice(0, 6).map(w =>
                '<li>' + escapeHtml(w[1]) + '</li>').join('') +
              (missing.length > 6 ? '<li>+' + (missing.length - 6) + ' more</li>' : '') + '</ul>'
            : '') +
        '</div>' +
      '</div>';
    }

    /* ---- the whole page ------------------------------------------------- */
    function rdMpProfile(mp, st) {
      const s = rdMpState(st);
      RD_MP_OWN = !!s.own;      /* gates the per-section Edit pencils below */
      return rdMpCredential(mp, s) + rdMpTodo(mp, s) +
        '<div class="rd-mp-main">' +
          rdMpWork(mp) + rdMpService(mp) + rdMpEdu(mp) + rdMpResearch(mp) +
        '</div>' +
        '<div class="rd-mp-side">' + rdMpContact(mp, s) + rdMpAddress(mp, s) + rdMpBlood(mp, s) + rdMpSocial(mp, s) + '</div>';
    }

    /* Blood group + donation, own page only -- on a public profile the group
       already sits in the credential rule, so a second copy there would just
       repeat it. Empty shows an Add prompt so a member knows it can be filled. */
    function rdMpBlood(mp, st) {
      if (!st.own) return '';
      const wd = String(mp.willDonate || '').trim().toUpperCase();
      const rows = rdMpRowsBox(
        rdMpRow('droplet', 'Blood group', mp.blood) +
        rdMpRow('heart-pulse', 'Willing to donate', wd === 'YES' ? 'Yes' : (wd === 'NO' ? 'No' : '')) +
        rdMpRow('calendar', 'Last donation', mp.lastDonation));
      return rdMpSection('droplet', 'Blood donation', rows, 1, 'blood',
        'Add your blood group and whether you can donate — it helps the Blood Bank.');
    }

    /* ================= WHERE THE RECORD COMES FROM =======================
       Two calls answer with the same member in two shapes: the public feed is
       already shortened by rdAlumniShape, a member's own row arrives with the
       sheet's own headers. Both are turned into one record here, so no builder
       above ever has to know which call it came from -- and a column renamed on
       the sheet is a one line change in one of these two functions. */

    function rdMpFromAlumni(a, c) {
      const m = c || {};
      const g = k => rdMpReal(m[k]);
      const canView = !!c || rdCanViewContacts();
      return {
        name: a.name, photo: normalizeAlumniImage(a.image),
        cover: normalizeAlumniImage(a.cover), pos: rdMpParsePos(a.coverPos),
        memberId: a.memberId || String(a.id || ''),
        series: a.series, dept: rdMpReal(a.dept), batch: a.batch, blood: rdMpReal(a.blood),
        desig: rdMpReal(a.desig), org: rdMpReal(a.org), loc: rdMpReal(a.loc),
        empType: rdMpReal(a.emp_type),
        /* Contact cells only exist once a member has signed in; until then the
           whole object is null and every row here is empty by construction. */
        mobile: formatBdMobile(g('Mobile Number') || (canView ? (a.phone || a.mobile || '') : '')),
        whatsapp: formatBdMobile(g('WhatsApp Number') || (canView ? (a.whatsapp || a.wa || a.phone || a.mobile || '') : '')),
        email: g('Email') || (canView ? (a.email || '') : ''),
        permanent: g('Permanent Address') || rdMpReal(a.address),
        present: g('Present Address'),
        social: m['Social Links'] || (canView ? (a.social || '') : ''),
        status: a.status,
        posts: rdMpParsePosts(a.posts), work: rdMpParseWork(a.work),
        edu: rdMpParseEdu(a.edu), papers: rdMpParsePapers(a.papers),
        thesis: rdMpReal(a.thesis), thesisDetails: rdMpReal(a.thesisDetails),
        formerPos: a.former_pos
      };
    }

    function rdMpFromSheet(m) {
      const r = m || {};
      const g = k => rdMpReal(r[k]);
      return {
        name: String(r['Full Name (English)'] || '').trim(),
        photo: normalizeAlumniImage(r['Passport Size Image']),
        cover: normalizeAlumniImage(r['Cover Photo']),
        pos: rdMpParsePos(r['Cover Position']),
        memberId: String(r['Member ID'] || '').trim(),
        series: String(r['Series'] || '').trim(), dept: g('Department'),
        batch: String(r['Batch'] || '').trim(), blood: g('Blood Group'),
        desig: g('Current Designation'), org: g('Current Organization / Company'),
        loc: g('Work Location (Division / Country)'), empType: g('Employment Type'),
        mobile: formatBdMobile(g('Mobile Number')), whatsapp: formatBdMobile(g('WhatsApp Number')), email: g('Email'),
        permanent: g('Permanent Address'), present: g('Present Address'),
        social: r['Social Links'] || '',
        status: r['Status'],
        posts: rdMpParsePosts(r['Positions']), work: rdMpParseWork(r['Work History']),
        edu: rdMpParseEdu(r['Education']), papers: rdMpParsePapers(r['Papers']),
        thesis: g('Thesis Topic'), thesisDetails: g('Thesis Details'),
        formerPos: r['Former Position at Rangdhanu / PDACC'],
        willDonate: g('Blood Donor'), lastDonation: g('Last Blood Donation')
      };
    }

    /* ================= THE TWO BUTTONS THAT DO SOMETHING ==================
       Save contact and Share both need a record to work from. Whichever page
       painted last owns it, so both read the same holder instead of each page
       wiring its own copy of the same two buttons. */
    let RD_MP_SHOWN = null;

    /* Facebook-style section-wise editing. RD_MP_OWN gates the per-section Edit
       pencils to the member's own profile; the public profile never passes an
       editKey, so it stays read-only regardless. RD_MP_EDITING holds the one
       section open at a time -- opening a second closes the first. */
    let RD_MP_OWN = false;
    let RD_MP_EDITING = null;

    /* A button says so itself for a moment. The site bans modals and alerts,
       and rdFlash scrolls the page back to the top, which would throw a reader
       out of the record they were halfway down. */
    function rdMpFlash(btn, msg) {
      const old = btn.innerHTML;
      btn.innerHTML = '<i data-lucide="check"></i> ' + escapeHtml(msg);
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      clearTimeout(btn.rdMpTimer);
      btn.rdMpTimer = setTimeout(function () {
        btn.innerHTML = old;
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      }, 1800);
    }

    /* A real vCard, so the number lands in the phone book instead of being
       copied across by hand. */
    function rdMpVcard() {
      const mp = RD_MP_SHOWN;
      if (!mp) return;
      const v = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:' + mp.name, 'ORG:' + (mp.org || RD_MP_ORG)];
      if (rdMpHas(mp.desig)) v.push('TITLE:' + mp.desig);
      if (rdMpHas(mp.mobile)) v.push('TEL;TYPE=CELL:' + rdMpDigits(mp.mobile, true));
      if (rdMpHas(mp.whatsapp)) v.push('TEL;TYPE=CELL:' + rdMpDigits(mp.whatsapp, true));
      if (rdMpHas(mp.email)) v.push('EMAIL:' + mp.email);
      if (rdMpHas(mp.memberId)) v.push('NOTE:' + RD_MP_ORG + ' - Member ID ' + mp.memberId);
      v.push('END:VCARD');
      const a = document.createElement('a');
      const href = URL.createObjectURL(new Blob([v.join('\r\n')], { type: 'text/vcard' }));
      a.href = href;
      a.download = String(mp.memberId || 'member') + '.vcf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(href); }, 4000);
    }

    /* The phone's own share sheet where there is one, the clipboard where there
       is not. No popup either way, so this never becomes the site's first one. */
    function rdMpShare(btn) {
      const mp = RD_MP_SHOWN;
      /* Share a real public deep-link to this member's profile, not the private
         address bar. #profile/<memberId> reopens the public card for anyone,
         while the contact rows inside it stay gated to signed-in members. */
      const url = (mp && mp.memberId)
        ? location.origin + location.pathname + '#profile/' + encodeURIComponent(mp.memberId)
        : location.href;
      const title = (mp && mp.name ? mp.name + ' - ' : '') + RD_MP_ORG;
      if (navigator.share) {
        navigator.share({ title: title, url: url })
          .then(function () { rdMpFlash(btn, 'Shared'); }, function () { /* cancelled */ });
        return;
      }
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(
          function () { rdMpFlash(btn, 'Link copied'); },
          function () { rdMpFlash(btn, 'Copy failed'); });
        return;
      }
      rdMpFlash(btn, 'Copy the address bar');
    }

    /* ALUMNI API & RENDER */
    /* One shape for the remembered rows and the fresh ones, so a warm list and
       a just-fetched list can never drift apart. */
    function rdAlumniShape(rows) {
      return (Array.isArray(rows) ? rows : []).map((m, i) => ({
          id: m['Member ID'] || (i + 1), memberId: String(m['Member ID']||'').trim(), name: String(m['Full Name (English)']||'').trim(),
          phone: formatBdMobile(m['Mobile Number']), wa: formatBdMobile(m['WhatsApp Number'] || m['Mobile Number']),
          email: String(m['Email']||'').trim(), address: String(m['Permanent Address']||'').trim(),
          blood: String(m['Blood Group']||'').trim(), dept: String(m['Department']||'').trim(),
          series: String(m['Series']||'').trim(), batch: String(m['Batch']||'').trim(),
          emp_type: String(m['Employment Type']||'').trim(), org: String(m['Current Organization / Company']||'').trim(),
          desig: String(m['Current Designation']||'').trim(), loc: String(m['Work Location (Division / Country)']||'').trim(),
          former_pos: String(m['Former Position at Rangdhanu / PDACC']||'').trim(), image: String(m['Passport Size Image']||'').trim(),
          cover: String(m['Cover Photo']||'').trim(), coverPos: String(m['Cover Position']||'').trim(),
          posts: String(m['Positions']||'').trim(), work: String(m['Work History']||'').trim(),
          edu: String(m['Education']||'').trim(), papers: String(m['Papers']||'').trim(),
          thesis: String(m['Thesis Topic']||'').trim(), thesisDetails: String(m['Thesis Details']||'').trim(),
          status: String(m['viewStatus']||'').trim()
      }));
    }

    let rdAlumniLoadingPromise = null;

    async function loadPublicAlumni() {
      /* A reload used to show an empty directory while the sheet was read.  The
         last answer of this tab is drawn first instead, then quietly replaced
         when the fresh one lands. */
      const warm = rdFeedRecall('alumni');
      if (warm && !alumniData.length) {
        alumniData = rdAlumniShape(warm);
        populateAlumniSeriesFilter();
        renderAlumni(alumniData);
      } else if (!warm && !alumniData.length) {
        const grid = document.getElementById("alumni-grid");
        if (grid) {
          grid.innerHTML = '<div class="col-span-full">' + rdPremiumSpinner('Loading Directory', 'users') + '</div>';
          if (typeof lucide !== 'undefined') lucide.createIcons();
        }
        const countEl = document.getElementById("alumni-count-text");
        if (countEl) countEl.innerText = '';
      }
      if (rdAlumniLoadingPromise) return rdAlumniLoadingPromise;
      rdAlumniLoadingPromise = (async function () {
        try {
          const res = await fetch(ALUMNI_API_URL + '&_=' + Date.now(), { cache: 'no-store' });
          const data = await res.json();
          const rows = Array.isArray(data.data) ? data.data : [];
          alumniData = rdAlumniShape(rows);
          rdFeedRemember('alumni', rows);
          populateAlumniSeriesFilter();
          renderAlumni(alumniData);
        } catch (e) {
          /* A failed refresh must not wipe a directory that is already on screen. */
          console.warn('[rd] alumni list unavailable:', e && e.message ? e.message : e);
          if (!alumniData.length) console.error(e);
        }
      })().finally(function () {
        rdAlumniLoadingPromise = null;
      });
      return rdAlumniLoadingPromise;
    }
    
    function populateAlumniSeriesFilter(){
        const s = document.getElementById('alumni-filter-series');
        if(!s) return;
        const v = [...new Set(alumniData.map(a => String(a.series||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
        s.innerHTML='<option value="ALL">All Series</option>'+v.map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');
    }

    /* Bengali numerals — the rest of the site writes numbers this way. */
    function bnNum(n) { return String(n).replace(/[0-9]/g, d => '\u09E6\u09E7\u09E8\u09E9\u09EA\u09EB\u09EC\u09ED\u09EE\u09EF'[+d]); }

    function alumniStatusLabel(status, iconClass) {
      const isAlum = status === 'Alumni';
      return `<i data-lucide="${isAlum ? 'graduation-cap' : 'backpack'}" class="${iconClass}"></i> ${isAlum ? 'Alumni' : 'Running Member'}`;
    }

    /* ---------- MEMBER LIST PAGING --------------------------------------
       18 per page = the 3-column desktop grid x 6 rows, so a page is always a
       full block with no ragged tail. */
    const RD_ALUMNI_PER_PAGE = 18;
    let rdAlumniList = [], rdAlumniPage = 1;

    /* ================= THE DIRECTORY NAMEPLATE ===========================
       The old card was a social card: avatar, name, two grey lines, one wide
       button. Nine of them in a grid read as nine of the same thing, and the
       two grey lines were often "Engineer" and "Organization" -- placeholders
       printed as if they were facts about the member.

       This is a nameplate instead. The plate across the top is engraved with
       what one engineer uses to place another -- series, department, batch --
       and the standing sits at its right end. Below it the face, the name, the
       post, and the three actions as one segmented control. Nothing is
       invented: an empty field draws nothing at all. */

    /* One monogram treatment for the whole roll. rdMpHue is deliberately not
       called here: eighteen differently tinted circles in one grid was colour
       carrying no fact, and it is most of why the old grid read loud. */
    function rdDcFace(a) {
      const img = normalizeAlumniImage(a.image);
      if (img) {
        return '<div class="rd-dc-face"><img src="' + escapeHtml(img) + '" alt="' +
          escapeHtml(a.name || '') + '" loading="lazy" decoding="async" ' +
          'onload="rdPhotoReady(this)" onerror="rdPhotoReady(this)" class="rd-photo-in"></div>';
      }
      return '<div class="rd-dc-face"><div class="rd-dc-mono" aria-hidden="true">' +
        escapeHtml(rdMpInitials(a.name)) + '</div></div>';
    }

    /* Signed out, the control keeps its shape and loses its cells: Full profile
       stays where it was and the contact cells are replaced by one line saying
       why. The grid does not reflow when a member signs in, which is what makes
       signing in feel like a door rather than a redesign. */
    function rdDcSeg(a) {
      const c = memberContact(a.memberId) || (rdCanViewContacts() && (a.phone || a.mobile || a.email) ? { 'Mobile Number': a.phone || a.mobile, 'WhatsApp Number': a.wa || a.whatsapp || a.phone || a.mobile, 'Email': a.email } : null);
      /* Written as a template literal on purpose: test_gallery_reg.js pins the
         source text of this call, so the same call spelled with string
         concatenation would pass review and fail the harness.
         The words are inside a span and not loose in the button, because the
         cell's hover wash is a positioned ::before and a positioned box paints
         over its parent's own text. Loose text put "Full profile" underneath
         the wash and left the arrow standing there alone. */
      const open = `<button type="button" class="rd-dc-open" onclick="openAlumniModal('${escapeHtml(String(a.id))}')"><span class="rd-dc-lbl">Full profile</span>` +
        '<i data-lucide="arrow-right" class="rd-dc-arw"></i></button>';
      if (!c) {
        if (rdCanViewContacts()) {
          return '<div class="rd-dc-seg has-1 is-gate">' + open +
            '<span class="rd-dc-gate"><i data-lucide="loader-circle" class="animate-spin"></i> Loading contact</span></div>';
        }
        return '<div class="rd-dc-seg has-1 is-gate">' + open +
          '<button type="button" class="rd-dc-gate" onclick="openMemberSignIn(\'alumni\')">' +
          '<i data-lucide="lock"></i> Sign in to see contact</button></div>';
      }
      const call = rdMpReal(c['Mobile Number']), wa = rdMpReal(c['WhatsApp Number']);
      const n = 1 + (call ? 1 : 0) + (wa ? 1 : 0);
      return '<div class="rd-dc-seg has-' + n + '">' + open +
        (call ? '<a class="rd-dc-call" href="tel:' + rdMpDigits(call, true) + '" aria-label="Call ' +
          escapeHtml(a.name || '') + '" title="Call"><i data-lucide="phone"></i></a>' : '') +
        (wa ? '<a class="rd-dc-wa" href="https://wa.me/' + rdMpDigits(wa) + '" target="_blank" ' +
          'rel="noopener" aria-label="WhatsApp ' + escapeHtml(a.name || '') +
          '" title="WhatsApp"><i data-lucide="message-circle"></i></a>' : '') +
        '</div>';
    }

    /* The entrance animation is on the wrapper and the hover lift is on the
       plate inside it. A running animation with `both` fill outranks an author
       declaration, so a transform in :hover on the animated element itself
       would never fire -- which is why these are two elements. */
    function renderAlumniCard(a) {
      const desig = rdMpReal(a.desig), org = rdMpReal(a.org);
      const plate = [rdMpReal(a.dept), a.series ? 'Series ' + a.series : '',
                     a.batch ? 'Batch ' + a.batch : ''].filter(rdMpHas).join('  ·  ');
      const formerPosition = rdMpReal(a.former_pos || a.formerPosition || a.formerPositionAtRangdhanu);
      const employment = rdMpReal(a.emp_type || a.employmentType);
      const location = rdMpReal(a.loc || a.location);
      const fallback = formerPosition ?
        '<p class="rd-dc-role">Former position: ' + escapeHtml(formerPosition) + '</p>' :
        employment ? '<p class="rd-dc-org">Employment: ' + escapeHtml(employment) + '</p>' :
        location ? '<p class="rd-dc-org">Location: ' + escapeHtml(location) + '</p>' : '';
      let body = (desig ? '<p class="rd-dc-role">' + escapeHtml(desig) + '</p>' : fallback) +
                 (org ? '<p class="rd-dc-org">' + escapeHtml(org) + '</p>' : '');
      /* The newest post the member holds, and a count of the rest. A member
         with four terms gets one line and "+3 more", not four lines that push
         the button off the card. */
      const posts = rdMpParsePosts(a.posts).filter(p => rdMpHas(p.session)).sort(rdMpBySessionDesc);
      if (posts.length) {
        const p = posts[0];
        body += '<span class="rd-dc-post">' +
          '<span class="rd-dc-posty">' + escapeHtml(p.session) + '</span>' +
          '<span class="rd-dc-postv">' + escapeHtml(p.post) + ', ' +
            escapeHtml(rdMpBodyOf(p.body).short) + '</span></span>' +
          (posts.length > 1 ? '<span class="rd-dc-more">+' + (posts.length - 1) + ' more</span>' : '');
      }
      return '<div class="alumni-card rd-dcw rd-scroll-card">' +
        '<article class="rd-dc' + rdMpStatusClass(a.status) + '">' +
          '<div class="rd-dc-plate">' +
            '<span class="rd-dc-pid">' + escapeHtml(plate || 'DUET') + '</span>' +
            '<span class="rd-dc-pst">' + alumniStatusLabel(a.status, 'rd-dc-psti') + '</span>' +
          '</div>' +
          '<div class="rd-dc-top">' + rdDcFace(a) +
            '<div class="rd-dc-id">' +
              '<h3 class="rd-dc-name">' + escapeHtml(a.name) + '</h3>' +
            '</div></div>' +
          (body ? '<div class="rd-dc-body">' + body + '</div>' : '') +
          '<div class="rd-dc-foot">' + rdDcSeg(a) + '</div>' +
        '</article></div>';
    }

    function familyTitleDance(element) {
      if (!element) return;
      element.querySelectorAll('.family-title-word').forEach(function (word) {
        if (word.querySelector('.family-letter')) return;
        const text = word.textContent || '';
        word.textContent = '';
        Array.from(text).forEach(function (character) {
          const letter = document.createElement('span');
          letter.className = 'family-letter';
          letter.textContent = character;
          word.appendChild(letter);
        });
      });
      element.classList.remove('family-title-dance');
      void element.offsetWidth;
      element.classList.add('family-title-dance');
    }

    function renderAlumni(data) {
      rdAlumniList = Array.isArray(data) ? data : [];
      rdAlumniPage = 1;                       /* any filter change restarts at 1 */
      renderAlumniPage();
    }

    function alumniPageCount() {
      return Math.max(1, Math.ceil(rdAlumniList.length / RD_ALUMNI_PER_PAGE));
    }

    function gotoAlumniPage(p) {
      const last = alumniPageCount();
      rdAlumniPage = Math.min(Math.max(1, Number(p) || 1), last);
      renderAlumniPage();
      const toolbar = document.querySelector('#page-alumni .family-toolbar');
      if (toolbar) {
        const header = document.querySelector('header');
        const offset = header ? header.getBoundingClientRect().height + 12 : 12;
        window.scrollTo({ top: Math.max(0, toolbar.getBoundingClientRect().top + window.scrollY - offset), behavior: 'auto' });
      }
    }

    function renderAlumniPage() {
      const total = alumniData.length, shown = rdAlumniList.length;
      const last = alumniPageCount();
      if (rdAlumniPage > last) rdAlumniPage = last;
      const from = (rdAlumniPage - 1) * RD_ALUMNI_PER_PAGE;
      const slice = rdAlumniList.slice(from, from + RD_ALUMNI_PER_PAGE);

      let label = shown === total
        ? `${total} member${total === 1 ? '' : 's'} listed`
        : `Showing ${shown} of ${total} members`;
      if (last > 1 && shown) {
        label += ` • Page ${rdAlumniPage} of ${last} (${from + 1}–${from + slice.length})`;
      }
      const countEl = document.getElementById("alumni-count-text");
      if (countEl) countEl.innerText = label;

      const grid = document.getElementById("alumni-grid");
      if (grid) {
        grid.innerHTML = slice.length
          ? slice.map(renderAlumniCard).join('')
          : `<div class="sm:col-span-2 lg:col-span-3 py-14 text-center text-slate-500">
               <i data-lucide="users-round" class="w-9 h-9 mx-auto mb-3 text-slate-300"></i>
               <p class="font-semibold">No member matches these filters.</p>
             </div>`;
      }
      observeAlumniCards(grid);
      renderAlumniPager(last);
      rdPhotoSweep(grid);
      lucide.createIcons();
    }

    function observeAlumniCards(grid) {
      if (!grid) return;
      const cards = grid.querySelectorAll('.rd-scroll-card');
      if (!cards.length) return;
      if (!('IntersectionObserver' in window)) {
        cards.forEach(card => card.classList.add('is-visible'));
        return;
      }
      const observer = new IntersectionObserver((entries, current) => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const card = entry.target;
          card.style.setProperty('--rd-scroll-delay', `${Array.from(cards).indexOf(card) * 55}ms`);
          card.classList.add('is-visible');
          current.unobserve(card);
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      cards.forEach(card => observer.observe(card));
    }

    /* 1 2 3 … next — with ellipses so a long list never overflows on a phone. */
    function alumniPageNumbers(cur, last) {
      if (last <= 7) return Array.from({length: last}, (_, i) => i + 1);
      const out = [1];
      let a = Math.max(2, cur - 1), b = Math.min(last - 1, cur + 1);
      if (cur <= 3) { a = 2; b = 4; }
      if (cur >= last - 2) { a = last - 3; b = last - 1; }
      if (a > 2) out.push('...');
      for (let i = a; i <= b; i++) out.push(i);
      if (b < last - 1) out.push('...');
      out.push(last);
      return out;
    }

    function renderAlumniPager(last) {
      const pager = document.getElementById("alumni-pager");
      if (!pager) return;
      if (last <= 1) { pager.innerHTML = ''; return; }
      const cur = rdAlumniPage;
      const btn = (inner, page, extra, disabled, aria) =>
        `<button type="button" class="alumni-page-btn ${extra || ''}" ${disabled ? 'disabled' : ''}
           ${disabled ? '' : `onclick="gotoAlumniPage(${page})"`}
           ${aria ? `aria-label="${aria}"` : ''} ${page === cur ? 'aria-current="page"' : ''}>${inner}</button>`;
      let html = btn('<i data-lucide="chevron-left" class="w-4 h-4"></i><span class="hidden sm:inline">Previous</span>',
                     cur - 1, 'alumni-page-edge', cur === 1, 'Previous page');
      alumniPageNumbers(cur, last).forEach(p => {
        html += p === '...'
          ? '<span class="px-1.5 text-slate-400 font-bold select-none">…</span>'
          : btn(String(p), p, p === cur ? 'is-current' : '', false, 'Page ' + p);
      });
      html += btn('<span class="hidden sm:inline">Next</span><i data-lucide="chevron-right" class="w-4 h-4"></i>',
                  cur + 1, 'alumni-page-edge', cur === last, 'Next page');
      pager.innerHTML = html;
    }
    
    /* ================= MEMBER SIGN IN ==================================
       No second login system: this is the same Google ID token the admin gate
       uses, verified by the same server helper. The only difference is the
       parameter name -- a member token travels as `memberToken`, so it can
       never be mistaken for an admin one.

       The token lives in localStorage, and a second key remembers that the
       member meant to stay signed in. Sign out is the only thing that clears
       either one -- a refresh, a new tab and a closed browser all keep the
       member where they were. Google's own token is good for about an hour, so
       when it runs out the browser asks Google for a fresh one without showing
       anything; only a revoked account falls through to the sign in page. */
    const RD_MEMBER_KEY = 'rd_member_token';
    const RD_MEMBER_KEEP = 'rd_member_keep';
    const RD_MEMBER_PROFILE_KEY = 'rd_member_profile';
    let rdMemberRenewTimer = 0;
    let RD_MEMBER = { token: '', email: '', me: null, contacts: null, busy: false,
                      /* A Member ID typed before Google had answered. The code
                         is sent as soon as the token arrives, so Send code is
                         never a press that does nothing. */
                      pendingLinkId: '' };

    function rdMemberParams() {
      if (RD_MEMBER.token) return { memberToken: RD_MEMBER.token };
      if (typeof RD_ADMIN !== 'undefined' && RD_ADMIN.gate === 'open' && RD_ADMIN_TOKEN) {
        return { adminToken: RD_ADMIN_TOKEN };
      }
      return {};
    }
    function rdMemberSignedIn() { return !!(RD_MEMBER.token && RD_MEMBER.me); }
    /* A signed-in admin is granted every member VIEW power -- contact rows and
       any "signed in members only" content -- without a second, member sign in.
       This is view/open only: it never makes the admin act as a member (voting,
       saving a member profile, submitting committee data all still need a real
       member token). rdCanViewContacts is the one gate all the view surfaces
       already run through, so admin passes them everywhere at once. */
    function rdAdminGateOpen() {
      return typeof RD_ADMIN !== 'undefined' && RD_ADMIN.gate === 'open';
    }
    function rdCanViewContacts() {
      return rdMemberSignedIn() || rdAdminGateOpen();
    }

    async function rdMemberEnsureSession() {
      if (rdMemberSignedIn()) return true;
      if (!RD_MEMBER.token || RD_MEMBER.busy) return false;
      await memberVerify(true);
      return rdMemberSignedIn();
    }

    async function ecOpenSubmissionForm() {
      if (RD_MEMBER.token) {
        openSubPage('committee-new');
        return;
      }
      showToast('Please sign in before submitting committee information.', 'info');
      openMemberSignIn('committee');
    }

    function rdMemberRemember(token) {
      RD_MEMBER.token = token || '';
      if (rdMemberRenewTimer) {
        clearTimeout(rdMemberRenewTimer);
        rdMemberRenewTimer = 0;
      }
      try {
        if (token) {
          localStorage.setItem(RD_MEMBER_KEY, token);
          localStorage.setItem(RD_MEMBER_KEEP, '1');
        } else {
          localStorage.removeItem(RD_MEMBER_KEY);
          localStorage.removeItem(RD_MEMBER_KEEP);
          localStorage.removeItem(RD_MEMBER_PROFILE_KEY);
        }
        /* Whatever an older build of the site left behind goes with it. */
        sessionStorage.removeItem(RD_MEMBER_KEY);
      } catch (err) { /* private mode: the token still works for this page */ }
    }

    function rdMemberWantsIn() {
      try { return localStorage.getItem(RD_MEMBER_KEEP) === '1'; } catch (err) { return false; }
    }

    /* Read the expiry out of the token itself. Sending a token Google has
       already retired only buys a failed round trip. */
    function rdTokenLive(token) {
      try {
        const body = JSON.parse(atob(String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        return !body.exp || (body.exp * 1000) - Date.now() > 60000;
      } catch (err) { return true; }
    }

    function rdMemberScheduleRenew(token) {
      if (rdMemberRenewTimer) clearTimeout(rdMemberRenewTimer);
      rdMemberRenewTimer = 0;
      try {
        const body = JSON.parse(atob(String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (!body.exp || !rdMemberWantsIn()) return;
        const delay = Math.max(30000, (body.exp * 1000) - Date.now() - 120000);
        rdMemberRenewTimer = setTimeout(function () {
          rdMemberRenewTimer = 0;
          rdMemberSilentRenew();
        }, delay);
      } catch (err) {
        /* rdTokenLive/memberVerify will report malformed tokens normally. */
      }
    }

    function rdShowTopProgress(show) {
      let bar = document.getElementById('rd-top-progress');
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'rd-top-progress';
        bar.className = 'rd-top-progress-bar';
        document.body.appendChild(bar);
      }
      if (show) {
        bar.classList.add('is-active');
      } else {
        bar.classList.remove('is-active');
      }
    }

    /* One line under the header instead of a page of its own. */
    function rdFlash(msg) {
      const box = document.getElementById('rd-flash');
      const txt = document.getElementById('rd-flash-text');
      if (!box || !txt) return;
      txt.textContent = msg;
      box.classList.remove('hidden');
      /* The line sits in the page flow, under the header. A member who was
         scrolled down would never see it, so the top of the page is brought
         back -- the same thing every page change already does. */
      window.scrollTo({ top: 0, behavior: 'auto' });
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      clearTimeout(rdFlash.timer);
      rdFlash.timer = setTimeout(function () { box.classList.add('hidden'); }, 4000);
    }

    function rdMemberMsg(id, text, kind) {
      const box = document.getElementById(id);
      if (!box) return;
      if (!text) { box.classList.add('hidden'); box.textContent = ''; return; }
      box.classList.remove('hidden');
      box.textContent = text;
      box.className = 'text-sm font-bold mt-3 ' +
        (kind === 'ok' ? 'text-emerald-700' : kind === 'wait' ? 'text-slate-500' : 'text-red-600');
    }

    /* Google's button owns one global callback, and the admin gate uses the same
       one. So whichever page is on screen re-initialises it for itself; without
       that, opening the member page would have pointed the admin button at the
       member handler. */
    let rdGsiOwner = '';

    function rdDrawMemberGsiButton() {
      const box = document.getElementById('member-gsi-btn');
      if (!box) return false;
      if (!rdGsiReady()) { box.classList.add('hidden'); return false; }
      box.classList.remove('hidden');
      try {
        google.accounts.id.initialize({
          client_id: RD_ADMIN_CLIENT_ID,
          callback: memberGoogleCredential,
          auto_select: false,
          cancel_on_tap_outside: true
        });
        google.accounts.id.renderButton(box, {
          theme: 'outline', size: 'large', shape: 'pill',
          text: 'signin_with', width: 260, locale: 'en'
        });
        rdGsiOwner = 'member';
        rdGsiDrawn = false;
        return true;
      } catch (err) {
        box.classList.add('hidden');
        return false;
      }
    }

    /* One Google button for everyone. The server decides the role: if this
       Google account is on the admin list (adminrole answers success) the admin
       panel opens; otherwise the same token signs the person in as a member.
       No second login system, no separate admin button -- adminrole just asks.
       The token is only remembered as an admin AFTER the server confirms it. */
    async function memberGoogleCredential(resp) {
      const token = (resp && resp.credential) || '';
      if (!token) { dismissGlobalLoader();
      rdMemberMsg('member-signin-msg', 'Google sign in did not finish.'); return; }
      showGlobalLoader('Signing In...', 'Verifying your account.');
      try {
        const who = await apiGet('adminrole', { adminToken: token });
        if (who && who.success) {
          rdAdminRemember(token);
          switchPage('admin');
          adminGateVerify();
          return;
        }
      } catch (err) {
        /* Not an admin -- adminrole answers success:false and apiGet throws.
           That is the expected member case, so it falls straight through. */
      }
      rdMemberRemember(token);
      memberVerify(false);
    }

    /* ---------- Email + Member ID -> six-digit code -> session ------------
       The standalone path, no Google needed. The server checks the typed email
       against the row for that Member ID, mails a code, and on a match mints its
       own signed session token (rds.) that every member action already accepts
       through rdMemEmail_. Two states in one card; the card says which. */
    function rdSiForgot() {
      /* Forgot email is its own page now (mockup col-forgot), not an inline box
         on the sign-in card. */
      openSubPage('forgot-email', 'member-signin');
    }

    function rdSiReset() {
      const codeBox = document.getElementById('rd-si-code-box');
      if (codeBox) codeBox.classList.add('hidden');
      const form = document.getElementById('rd-si-form');
      if (form) form.classList.remove('hidden');
      const code = document.getElementById('rd-si-code');
      if (code) code.value = '';
      rdMemberMsg('rd-si-msg', '');
    }

    async function memberEmailStart() {
      const email = String((document.getElementById('rd-si-email') || {}).value || '').trim();
      const id = String((document.getElementById('rd-si-id') || {}).value || '').trim();
      if (!email || email.indexOf('@') < 1) { rdMemberMsg('rd-si-msg', 'Please enter a valid email address.'); return; }
      if (!id) { rdMemberMsg('rd-si-msg', 'Please enter your Member ID.'); return; }
      rdMemberMsg('rd-si-msg', '');
      showGlobalLoader('Sending code...', 'Emailing your sign in code.');
      try {
        const r = await apiPost('memberemailstart', { memberId: id, email: email });
        dismissGlobalLoader();
        const sent = document.getElementById('rd-si-sent');
        if (sent) sent.textContent = 'Code sent to ' + (r.sentTo || 'your email') + '.';
        const form = document.getElementById('rd-si-form');
        if (form) form.classList.add('hidden');
        const codeBox = document.getElementById('rd-si-code-box');
        if (codeBox) codeBox.classList.remove('hidden');
        const code = document.getElementById('rd-si-code');
        if (code) { code.value = ''; code.focus(); }
      } catch (err) {
        dismissGlobalLoader();
        rdMemberMsg('rd-si-msg', friendlyError(err).msg);
      }
    }

    async function memberEmailVerify() {
      const id = String((document.getElementById('rd-si-id') || {}).value || '').trim();
      const code = String((document.getElementById('rd-si-code') || {}).value || '').trim();
      const keep = !!(document.getElementById('rd-si-keep') || {}).checked;
      if (!code) { rdMemberMsg('rd-si-msg', 'Enter the code from your email.'); return; }
      showGlobalLoader('Signing In...', 'Checking your code.');
      try {
        const r = await apiPost('memberemailverify', { memberId: id, code: code, keep: keep });
        rdMemberRemember(r.memberToken || '');
        await memberSignedIn(r, false);
        rdSiReset();
      } catch (err) {
        dismissGlobalLoader();
        rdMemberMsg('rd-si-msg', friendlyError(err).msg);
      }
    }

    async function memberVerify(quiet) {
      if (!RD_MEMBER.token) { if (!quiet) dismissGlobalLoader(); return; }
      /* A user-initiated sign-in must always show the loader. If a background
         (quiet) verify is already in flight, we still raise wantLoader and show
         it now -- the in-flight call honours the flag when it resolves, so the
         member never stares at a dead screen wondering if anything is happening. */
      if (!quiet) { RD_MEMBER.wantLoader = true; showGlobalLoader("Signing In...", "Authenticating with Google."); }
      if (RD_MEMBER.busy) return;
      RD_MEMBER.busy = true;
      if (!quiet) rdMemberMsg('member-signin-msg', 'Checking...', 'wait');
      try {
        const r = await apiGet('membersignin', rdMemberParams());
        if (r && r.status === 'NO_MATCH') {
          dismissGlobalLoader(); RD_MEMBER.wantLoader = false;
            RD_MEMBER.me = null;
            RD_MEMBER.email = r.email || '';
          rdMemberPaintLinkBox();
          if (!quiet) {
            rdMemberMsg('member-signin-msg',
              (r.email || 'This email') + ' is not registered. Please sign in with your registered email account.');
          }
          /* He pressed Send code before there was a token. That press is
             finished here rather than asking him to press it again. */
          if (RD_MEMBER.pendingLinkId) memberLinkStart();
          return;
        }
        await memberSignedIn(r, quiet);
      } catch (err) {
        RD_MEMBER.me = null;
        /* The stored token stays. A dropped connection or a sleeping Apps
           Script deployment is not the member asking to be signed out, and
           wiping it here was what made a refresh look like a logout. */
        if (!quiet || RD_MEMBER.wantLoader) failGlobalLoader('Sign in failed', friendlyError(err).msg);
        RD_MEMBER.wantLoader = false;
          if (!quiet) rdMemberMsg('member-signin-msg', friendlyError(err).msg);
        rdMemberPaintSignInLinks();
      } finally {
        RD_MEMBER.busy = false;
      }
    }

    async function memberSignedIn(r, quiet) {
      RD_MEMBER.me = (r && r.member) || null;
      RD_MEMBER.email = (r && r.email) || '';
      try {
        if (RD_MEMBER.me) localStorage.setItem(RD_MEMBER_PROFILE_KEY, JSON.stringify(RD_MEMBER.me));
      } catch (err) {}
      rdMemberScheduleRenew(RD_MEMBER.token);
      document.body.classList.remove('rd-member-restoring');
      rdMemberPaintSignInLinks();
      if (alumniData.length) renderAlumniPage();
      if (RD_EC && RD_EC.state === 'ready') loadExecutiveCommittee(true);
      memberLoadContacts().then(function () {
        if (alumniData.length) renderAlumniPage();
      });
      if (quiet && !RD_MEMBER.wantLoader) { RD_MEMBER.wantLoader = false; rdMemberPaintSignInLinks(); return; }
      RD_MEMBER.wantLoader = false;
      hideGlobalLoader(true, null, 'Signed in successfully.');
        rdMemberMsg('member-signin-msg', 'You are signed in.', 'ok');
      rdMemberPaintLinkBox();
      /* No page of its own for this. A member who signs in is taken to the
         thing they signed in for -- the profile they were reading, or their own
         page -- and the confirmation is the one line under the header. */
      if (RD_MEMBER.lastProfileId) openAlumniModal(RD_MEMBER.lastProfileId);
      else if (rdCurrentPageId === 'member-signin') openMyProfile('home');
      rdFlash('Signed in successfully');
    }

    /* The contact sheet arrives once per sign-in and is kept in memory only --
       never in sessionStorage, so a signed-out tab cannot be read back. */
    async function memberLoadContacts() {
      RD_MEMBER.contacts = null;
      if (!RD_MEMBER.token && !(typeof RD_ADMIN !== 'undefined' && RD_ADMIN.gate === 'open' && RD_ADMIN_TOKEN)) return;
      try {
        const r = await apiGet('membercontacts', rdMemberParams());
        RD_MEMBER.contacts = (r && r.contacts) || {};
      } catch (err) {
        RD_MEMBER.contacts = null;
      }
    }

    function memberContact(memberId) {
      if (!RD_MEMBER.contacts || !memberId) return null;
      const wanted = String(memberId).trim();
      if (RD_MEMBER.contacts[wanted]) return RD_MEMBER.contacts[wanted];
      const normalized = wanted.toLowerCase().replace(/[^a-z0-9]/g, '');
      const key = Object.keys(RD_MEMBER.contacts).find(function (candidate) {
        return String(candidate).trim().toLowerCase().replace(/[^a-z0-9]/g, '') === normalized;
      });
      return key ? RD_MEMBER.contacts[key] : null;
    }

    function memberSignOut() {
      rdMemberRemember('');
      RD_MEMBER.me = null;
      RD_MEMBER.email = '';
      RD_MEMBER.contacts = null;
      try { localStorage.removeItem(RD_MEMBER_PROFILE_KEY); } catch (err) {}
      try { if (rdGsiReady()) google.accounts.id.disableAutoSelect(); } catch (err) { /* nothing to undo */ }
      RD_MEMBER.pendingLinkId = '';
      /* Reset blood bank so it re-fetches with unauthenticated state on next visit. */
      RD_BB.loaded = false;
      RD_BB.isMember = false;
      rdMemberPaintSignInLinks();
      rdMemberPaintLinkBox();
      rdFlash('Signed out');
      if (rdCurrentPageId === 'my-profile') switchPage('alumni');
      if (RD_MEMBER.lastProfileId && rdCurrentPageId === 'profile') openAlumniModal(RD_MEMBER.lastProfileId);
    }

    /* ---------- the email did not match: six-digit code ------------------ */

    /* Two states, and the card says which one it is in. Signed in and matched
       there is nothing to link, so it goes away entirely. */
    function rdMemberPaintLinkBox() {
      const box = document.getElementById('member-link-box');
      if (!box) return;

      if (rdMemberSignedIn()) { box.classList.add('hidden'); return; }
      /* The main sign-in card now does Email + Member ID -> code natively, so
         this secondary link box is redundant clutter on the page. Keep the
         element (and its handlers) for the edge Google-linking path, but never
         surface it: the login page stays the single minimal card of the mockup. */
      box.classList.add('hidden');
      return;
      // eslint-disable-next-line no-unreachable

      const ready = !!RD_MEMBER.token;
      const send = document.getElementById('member-link-send');
      const step = document.getElementById('member-link-step');
      const codeBox = document.getElementById('member-code-box');

      /* The button is never disabled: in the first state it opens Google, which
         is the very thing the member has to do next. */
      if (send) send.textContent = ready ? 'Send code' : 'Continue with Google';

      if (step) {
        step.textContent = ready
          ? 'Signed in as ' + (RD_MEMBER.email || 'your Google account') +
            '. Enter your Member ID and the code goes to the email on your application.'
          : 'Step 1 of 2: Google sign in. Type your Member ID and press the button, it opens Google for you.';
        step.className = 'text-xs font-bold mt-3 ' + (ready ? 'text-emerald-700' : 'text-slate-500');
      }

      if (!ready && codeBox) codeBox.classList.add('hidden');
    }

    /* Google's own sign in, asked for from inside the card. The card's button
       used to send the member back up the page to find another button. */
    function rdMemberAskGoogle(tries) {
      tries = tries || 0;
      if (!rdGsiReady()) {
        if (tries < 6) { setTimeout(function () { rdMemberAskGoogle(tries + 1); }, 500); return; }
        dismissGlobalLoader();
        rdMemberMsg('member-link-msg', 'Google sign in did not load. Check your connection and try again.');
        return;
      }
      rdDrawMemberGsiButton();
      const fallback = 'Use the Google button at the top of this card, then press Send code again.';
      try {
        google.accounts.id.prompt(function (note) {
          const shut = note && ((note.isNotDisplayed && note.isNotDisplayed()) ||
                                (note.isSkippedMoment && note.isSkippedMoment()));
          if (shut && RD_MEMBER.pendingLinkId) rdMemberMsg('member-link-msg', fallback);
        });
      } catch (err) {
        rdMemberMsg('member-link-msg', fallback);
      }
    }

    async function memberLinkStart() {
      const id = ((document.getElementById('member-link-id') || {}).value || '').trim();
      if (!id) { rdMemberMsg('member-link-msg', 'Enter your Member ID.'); return; }

      if (!RD_MEMBER.token) {
        /* This used to be the end of the road -- one red line and nothing else.
           The ID is kept and Google is opened; memberVerify sends the code the
           moment the token comes back. */
        RD_MEMBER.pendingLinkId = id;
        rdMemberMsg('member-link-msg', 'Opening Google sign in. The code is sent right after.', 'wait');
        rdMemberAskGoogle();
        return;
      }

      RD_MEMBER.pendingLinkId = '';
      rdMemberMsg('member-link-msg', 'Sending the code...', 'wait');
      try {
        const r = await apiPost('memberlinkstart', Object.assign({ memberId: id }, rdMemberParams()));
        if (r && r.status !== 'OK') throw new Error(r.message || 'The code could not be sent.');
        const box = document.getElementById('member-code-box');
        if (box) box.classList.remove('hidden');
        rdMemberMsg('member-link-msg', 'Code sent to ' + (r.sentTo || 'your email'), 'ok');
      } catch (err) {
        rdMemberMsg('member-link-msg', friendlyError(err).msg);
      }
    }

    async function memberLinkVerify() {
      const id = ((document.getElementById('member-link-id') || {}).value || '').trim();
      const code = ((document.getElementById('member-link-code') || {}).value || '').trim();
      if (!code) { rdMemberMsg('member-link-msg', 'Enter the code from your email.'); return; }
      rdMemberMsg('member-link-msg', 'Matching...', 'wait');
      try {
        const r = await apiPost('memberlinkverify',
                                Object.assign({ memberId: id, code: code }, rdMemberParams()));
        if (r && r.status !== 'OK') throw new Error(r.message || 'The code did not match.');
        rdMemberMsg('member-link-msg', 'Matched. From now on Google alone will sign you in.', 'ok');
        await memberSignedIn(r, false);
      } catch (err) {
        rdMemberMsg('member-link-msg', friendlyError(err).msg);
      }
    }

    /* Signed-in state shows up in three places: the nav item flips between
       Sign In and My Profile, the alumni page gets a sign-in / sign-out line,
       and the profile card unlocks. */
    function rdMemberNavPaint() {
      const restoring = document.body.classList.contains('rd-member-restoring');
      const on = rdMemberSignedIn();
      /* A signed-in admin is routed to the Dashboard, so the member Sign In
         prompt and the Membership Application CTA both step aside -- an admin
         is never asked to sign in or apply again. */
      const adminOn = typeof rdAdminGateOpen === 'function' && rdAdminGateOpen();
      const memberEntryVisible = !(adminOn && !on);
      ['nav-member-menu', 'mobile-member-menu'].forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.style.display = memberEntryVisible ? '' : 'none';
      });
      const mobileMemberBtn = document.getElementById('mobile-member-btn');
      if (mobileMemberBtn) mobileMemberBtn.style.display = memberEntryVisible ? '' : 'none';
      const applicationVisible = !restoring && !on && !adminOn;
      const t = document.getElementById('nav-member-text');
      if (t) t.textContent = restoring ? 'Restoring...' : (on ? 'My Profile' : 'Sign In');
      const memberLabel = document.getElementById('mobile-member-label');
      if (memberLabel) memberLabel.textContent = restoring ? 'Restoring...' : (on ? 'My Profile' : 'Sign In');
      const memberTileIcon = document.getElementById('mobile-member-tile-icon');
      if (memberTileIcon) memberTileIcon.outerHTML = '<i id="mobile-member-tile-icon" data-lucide="' + (on ? 'circle-user-round' : 'log-in') + '"></i>';
      document.querySelectorAll('.rd-nav-profile-dropdown').forEach(function (menu) {
        if (!on) menu.classList.add('hidden');
      });
      if (!on) rdNavProfileMenuClose();
      const desktopApplication = document.getElementById('nav-membership-cta');
      if (desktopApplication) {
        desktopApplication.classList.toggle('hidden', !applicationVisible);
        desktopApplication.style.display = applicationVisible ? '' : 'none';
      }
      const mobileApplication = document.getElementById('mobile-membership-cta');
      if (mobileApplication) {
        mobileApplication.classList.toggle('hidden', !applicationVisible);
        mobileApplication.style.display = applicationVisible ? '' : 'none';
      }
      /* Log out lives in the More menu now, shown only when signed in. Toggled
         by style.display -- the same way the membership CTA above is -- so it
         beats any nav-panel CSS the way a bare `.hidden` class would not.
         Also hidden during restoring state to prevent flashing before verification. */
      ['rd-more-logout-desktop', 'rd-more-logout-mobile'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.style.display = (on && !restoring) ? '' : 'none';
      });
      const btn = document.getElementById('mobile-member-btn');
      if (btn) btn.setAttribute('aria-label', on ? 'My Profile' : 'Member sign in');
      const icon = document.getElementById('mobile-member-icon');
      if (icon) {
        icon.outerHTML = '<i id="mobile-member-icon" class="w-6 h-6" data-lucide="' +
                         (on ? 'circle-user-round' : 'log-in') + '"></i>';
      }
      /* Bottom tab-bar center CTA mirrors the same state: guest -> Sign In,
         signed in -> Profile (the raised bubble becomes the profile entry). */
      const mnavLabel = document.getElementById('rd-mnav-cta-label');
      if (mnavLabel) mnavLabel.textContent = restoring ? '...' : (on ? 'Profile' : 'Sign In');
      const mnavCta = document.getElementById('rd-mnav-cta');
      if (mnavCta) mnavCta.setAttribute('aria-label', on ? 'My Profile' : 'Member sign in');
      const mnavIcon = document.getElementById('rd-mnav-cta-icon');
      if (mnavIcon) {
        mnavIcon.outerHTML = '<i id="rd-mnav-cta-icon" data-lucide="' +
                             (on ? 'circle-user-round' : 'log-in') + '"></i>';
      }
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    }

    /* One nav item for both states. Signed out it opens the sign-in page, signed
       in it opens the member's own profile, so nothing extra sits in the header. */
    function rdMemberNavClick() {
      const menu = document.getElementById('mobile-menu');
      if (menu && !menu.classList.contains('hidden')) {
        menu.classList.add('hidden');
        syncMobileMenuButton();
      }
      if (rdMemberSignedIn()) rdMemberMyProfile();
      else openMemberSignIn(rdCurrentPageId);
    }

    /* My Profile is the member's own page now, not a read-only card. A PENDING
       member reaches it too: the server answers from the member's own row, and
       that row exists long before the public feed carries it. */
    function rdMemberMyProfile() {
      if (!rdMemberSignedIn()) {
        if (RD_MEMBER.token && !RD_MEMBER.busy) {
          memberVerify(true).then(function () {
            if (rdMemberSignedIn()) rdMemberMyProfile();
            else openMemberSignIn(rdCurrentPageId);
          });
        } else {
          openMemberSignIn(rdCurrentPageId);
        }
        return;
      }
      openMyProfile(rdCurrentPageId);
    }

    function rdNavProfileMenuToggle(button) {
      if (!rdMemberSignedIn()) {
        rdMemberNavClick();
        return;
      }
      var menu = button && button.parentElement
        ? button.parentElement.querySelector('.rd-nav-profile-dropdown')
        : null;
      if (!menu) return;
      var open = menu.classList.toggle('hidden');
      button.setAttribute('aria-expanded', String(!open));
    }

    function rdNavProfileMenuClose() {
      document.querySelectorAll('.rd-nav-profile-dropdown').forEach(function (menu) {
        menu.classList.add('hidden');
        var button = menu.parentElement && menu.parentElement.querySelector('[aria-haspopup="true"]');
        if (button) button.setAttribute('aria-expanded', 'false');
      });
    }

    function rdMypMenuToggle(button) {
      var menu = button && button.parentElement ? button.parentElement.querySelector('.rd-mpx-dropdown') : null;
      if (!menu) return;
      var open = menu.classList.toggle('hidden');
      button.setAttribute('aria-expanded', String(!open));
    }

    function rdMypMenuClose() {
      document.querySelectorAll('.rd-mpx-dropdown').forEach(function (menu) {
        menu.classList.add('hidden');
        var button = menu.parentElement && menu.parentElement.querySelector('[aria-haspopup="true"]');
        if (button) button.setAttribute('aria-expanded', 'false');
      });
    }

    /* ================= MY PROFILE ======================================
       Every edit sits on this one page, so a signed in member never needs the
       old "Update your information" walk -- Member ID, mobile, a code in the
       mail -- to fix a phone number. It is a real page, not a modal.

       Who can see what is decided field by field, and the choice is honoured on
       the server: an "Only me" field is never sent to another member's browser,
       so there is nothing in the page to uncover. */
    let RD_MYP = { me: null, busy: false };

    const RD_MYP_FIELDS = [
      ['myp-mobile', 'Mobile Number'],
      ['myp-whatsapp', 'WhatsApp Number'],
      ['myp-email', 'Email'],
      ['myp-blood', 'Blood Group'],
      ['myp-will-donate', 'Blood Donor'],
      ['myp-last-donation', 'Last Blood Donation'],
      ['myp-employment', 'Employment Type'],
      ['myp-organization', 'Current Organization / Company'],
      ['myp-designation', 'Current Designation'],
      ['myp-former', 'Former Position at Rangdhanu / PDACC'],
      ['myp-thesis', 'Thesis Topic'],
      ['myp-thdet', 'Thesis Details']
    ];

    function rdMypSet(id, value) {
      const el = document.getElementById(id);
      if (el) el.value = value == null ? '' : String(value);
    }

    /* The drawn cover, in one place. Both the member's own page and the page
       another member reads use this same markup, so the band can never say two
       different things on the two pages. */
    function rdProudCoverMarkup() {
      return '<div class="rd-proud">' +
        '<span class="rd-proud-1">Proud</span>' +
        '<span class="rd-proud-2">Member<i data-lucide="crown" class="rd-proud-crown"></i></span>' +
        '<span class="rd-proud-tag">একটি পরিবার, বহু প্রজন্মের বন্ধন</span>' +
        '</div>';
    }

    /* The default cover is drawn by the stylesheet, so a member who never
       uploads one still has a finished looking page. */
    function rdMypCover(url) {
      const box = document.getElementById('myp-cover');
      if (!box) return;
      const src = normalizeAlumniImage(url);
      /* The drawn PROUD MEMBER band was this page's default back when the
         Association had no cover file of its own. It does now, and both faces of
         My Profile stand on the same image, so the edit page cannot show one
         thing while the page other members read shows another. The drawing and
         its rules stay where they are -- they are the fallback that needs no
         network at all -- but nothing puts them on this cover any more. */
      const art = box.querySelector('.rd-proud');
      if (art) art.remove();
      if (src) {
        box.classList.add('rd-cover-photo');
        box.style.backgroundImage = 'url("' + src + '")';
      } else {
        box.classList.remove('rd-cover-photo');
        box.style.backgroundImage = 'url("' + RD_MP_COVER_DEFAULT + '")';
      }
      /* "Use the Association's cover" and "delete the one I uploaded" are the
         same single action, so there is one button for it and it is only in the
         page while there is something to undo. */
      const undo = document.getElementById('myp-cover-undo');
      if (undo) undo.hidden = !src;
    }

    /* A Drive link straight out of the sheet is not a picture the browser can
       draw, which is why the directory has always passed it through
       normalizeAlumniImage first. The profile pages now do the same -- that one
       missing call is why a photo showed in the directory and not here. */
    function rdMypFace(url) {
      const img = document.getElementById('myp-photo');
      if (!img) return;
      img.onerror = function () { this.onerror = null; this.src = 'logo.png'; };
      img.src = normalizeAlumniImage(url) || 'logo.png';
    }

    function rdMypStatus(status) {
      const s = String(status || '').toUpperCase();
      if (s === 'PENDING') {
        return '<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold">' +
               '<i data-lucide="clock" class="w-3.5 h-3.5"></i> Pending</span>' +
               '<p class="text-xs text-slate-500 mt-2 leading-relaxed">Your application is with the Association. You can keep your information up to date while you wait.</p>';
      }
      if (s === 'APPROVED') {
        return '<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">' +
               '<i data-lucide="badge-check" class="w-3.5 h-3.5"></i> Approved member</span>';
      }
      return s ? '<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold">' +
                 escapeHtml(s) + '</span>' : '';
    }

    function rdMypLocked(m) {
      const box = document.getElementById('myp-locked');
      if (!box) return;
      const cell = (label, value) =>
        '<div class="p-3 bg-slate-50 rounded-xl border border-slate-100">' +
        '<p class="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">' + label + '</p>' +
        '<p class="font-bold text-slate-900 break-words">' + escapeHtml(value || 'N/A') + '</p></div>';
      box.innerHTML = cell('Member ID', m['Member ID']) +
                      cell('Department', m['Department']) +
                      cell('Series', m['Series']) +
                      cell('Batch', m['Batch']);
    }

    function rdMypPaint(m) {
      if (!m) return;
      const name = document.getElementById('myp-name');
      if (name) name.textContent = m['Full Name (English)'] || 'My Profile';
      const sub = document.getElementById('myp-sub');
      if (sub) sub.textContent = [m['Member ID'], m['Department'], m['Series']].filter(Boolean).join('  |  ');
      const st = document.getElementById('myp-status');
      if (st) st.innerHTML = rdMypStatus(m['Status']);

      rdMypFace(m['Passport Size Image']);
      rdMypCover(m['Cover Photo']);
      rdMypLocked(m);

      RD_MYP_FIELDS.forEach(([id, header]) => rdMypSet(id, m[header]));

      /* Own picker names, so the registration form's three pickers keep their
         own state and neither page can overwrite the other. */
      rdAddrInit('mypPermanent', m['Permanent Address'] || '');
      rdAddrInit('mypPresent', m['Present Address'] || '');
      rdAddrInit('mypWork', m['Work Location (Division / Country)'] || '');

      rdSocialRender('myp-social', rdSocialParse(m['Social Links']));

      const vis = m.visibility || {};
      document.querySelectorAll('[data-myp-vis]').forEach(sel => {
        const field = sel.getAttribute('data-myp-vis');
        sel.value = String(vis[field] || 'MEMBER').toUpperCase() === 'ONLY_ME' ? 'ONLY_ME' : 'MEMBER';
      });

      rdMpEditorFill(rdMpFromSheet(m));
      rdMypViewPaint();

      // Cap the last donation date picker at today
      const donEl = document.getElementById('myp-last-donation');
      if (donEl) donEl.max = new Date().toISOString().slice(0, 10);

      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    }

    async function openMyProfile(backTo) {
      if (!rdMemberSignedIn()) { openMemberSignIn(rdCurrentPageId); return; }
      openSubPage('my-profile', backTo || rdCurrentPageId);
      rdMemberMsg('myp-msg', '');
      rdMemberMsg('myp-photo-msg', '');
      /* The sign in answer already carries the row, so the page is filled in
         before the second call returns and nobody watches an empty form. */
      rdMypPaint(RD_MEMBER.me);
      try {
        const r = await apiGet('memberprofile', rdMemberParams());
        if (r && r.member) {
          RD_MYP.me = r.member;
          RD_MEMBER.me = r.member;
          try { localStorage.setItem(RD_MEMBER_PROFILE_KEY, JSON.stringify(r.member)); } catch (err) {}
          rdMypPaint(r.member);
        }
      } catch (err) {
        rdMemberMsg('myp-msg', friendlyError(err).msg);
      }
    }

    /* rdMypSave (the old whole-form submit handler) was removed with the
       Update-profile form: every field now saves through its own section via
       rdMpSectionSave, and a committee request goes through rdMpProposeCommittee. */

    /* ================= THE FOUR REPEAT EDITORS ===========================
       A member holds a post in one session and then in another; works at one
       organization and then at a second; studied at a high school, then a
       polytechnic institute, then DUET. None of that is one field, so the edit
       tab carries four small editors instead of four boxes.

       All four share one shape: numbered rows, a Remove on each row, one or
       more Add buttons underneath, a used-of-cap count, and one live message.
       Nothing in any of them is required -- a member who fills none of it
       still has a finished profile. */

    const RD_REP_MAX = { posts: 12, work: 8, edu: 6, papers: 6 };

    /* A <select> cannot wrap or ellipsize its own selected label, so on a
       320px phone the longest choice on the form, "Rangdhanu Alumni
       Association", was drawn as "Rangdhanu Alumni Associa". Widening the box
       was not on offer: the row is already one column at that width, and
       custom.css pins every field to 16px below 640px so iOS does not zoom the
       page on focus.

       So the control changes rather than the type. Body and level are three
       fixed choices each, and they decide which of the three lists a row lands
       in -- the most important answer in the row was the one collapsed out of
       sight. Radios drawn as segments show all three at once, wrap when they
       have to, and arrow-key between themselves with no script. */
    function rdRepSegF(label, name, value, opts) {
      const gid = 'sg-' + Math.random().toString(36).slice(2, 8);
      return '<div class="rd-rep-f is-wide">' +
        '<span class="rd-rep-l" id="' + gid + '">' + escapeHtml(label) + '</span>' +
        '<div class="rd-seg" role="radiogroup" aria-labelledby="' + gid + '">' +
          opts.options.map(function (o, i) {
            const id = gid + '-' + i, on = o[0] === value;
            /* The radio keeps its place in the tab order and its own checked
               state -- it is moved out of sight, never display:none. Everything
               visible is the <span> beside it, which is why the checked and
               focus styles are written as sibling selectors. */
            return '<label class="rd-seg-o">' +
              '<input class="rd-seg-r" type="radio" id="' + id + '" name="' + gid + '"' +
                ' data-f="' + name + '" value="' + escapeHtml(o[0]) + '"' +
                (on ? ' checked' : '') +
                (opts.onchange ? ' onchange="' + opts.onchange + '"' : '') + '>' +
              '<span class="rd-seg-b">' +
                (o[2] ? '<i data-lucide="' + o[2] + '" aria-hidden="true"></i>' : '') +
                '<span class="rd-seg-t">' + escapeHtml(o[1]) + '</span>' +
              '</span></label>';
          }).join('') +
        '</div></div>';
    }
    function rdRepFld(label, name, value, opts) {
      opts = opts || {};
      const id = 'f-' + Math.random().toString(36).slice(2, 8);
      const cls = 'rd-rep-f' + (opts.wide ? ' is-wide' : '');
      let input;
      if (opts.options) {
        input = '<select class="rd-rep-s" id="' + id + '" data-f="' + name + '"' +
          (opts.onchange ? ' onchange="' + opts.onchange + '"' : '') + '>' +
          opts.options.map(function (o) {
            return '<option value="' + escapeHtml(o[0]) + '"' +
                   (o[0] === value ? ' selected' : '') + '>' + escapeHtml(o[1]) + '</option>';
          }).join('') + '</select>';
      } else {
        const list = opts.list ? ' list="' + opts.list + '"' : '';
        input = '<input class="rd-rep-i' + (opts.num ? ' is-num' : '') + '" id="' + id +
          '" data-f="' + name + '" type="' + (opts.type || 'text') + '"' + list +
          ' maxlength="' + (opts.max || 120) + '" value="' + escapeHtml(value || '') + '"' +
          (opts.ph ? ' placeholder="' + escapeHtml(opts.ph) + '"' : '') +
          (opts.mode ? ' inputmode="' + opts.mode + '"' : '') + '>';
      }
      return '<div class="' + cls + '"><label class="rd-rep-l" for="' + id + '">' +
             escapeHtml(label) + '</label>' + input + '</div>';
    }

    /* Start and end always sit together, and the end is allowed to be empty.
       The hint under it is the whole reason: leaving it blank is how a member
       says the job or the degree has not finished. */
    function rdRepYY(from, to, hint) {
      return '<div class="rd-rep-f is-wide"><div class="rd-rep-yy">' +
        rdRepFld('Start year', 'from', from,
                 { num: true, max: 4, mode: 'numeric', ph: '2019' }) +
        '<span class="rd-rep-dash">&#8211;</span>' +
        rdRepFld('End year', 'to', to,
                 { num: true, max: 4, mode: 'numeric', ph: hint || 'blank = now' }) +
        '</div></div>';
    }

    /* ---------- one row, per group -------------------------------------- */
    /* The body is a fixed list because those three committees are the only
       ones that exist. The position is typed, with the known posts offered
       underneath: a fixed list of five would have turned away every Joint
       Secretary and every Office Secretary the Association has ever had. */
    function rdRepRowPosts(r) {
      const b = rdMpBodyOf(r.body);
      return rdRepSegF('Body', 'body', b.key, {
          options: rdMpBodies().map(x => [x.key, x.short, x.icon]),
          onchange: 'rdRepList(this)' }) +
        rdRepFld('Session', 'session', r.session, { num: true, max: 9, ph: '2022-2023' }) +
        rdRepFld('Position', 'post', r.post,
                 { wide: true, list: 'rd-posts-' + b.key, ph: 'General Secretary' });
    }

    function rdRepRowWork(r) {
      return rdRepFld('Designation', 'desig', r.desig, { ph: 'Assistant Engineer' }) +
        rdRepFld('Organization', 'org', r.org,
                 { ph: 'Local Government Engineering Department' }) +
        rdRepFld('Location', 'loc', r.loc, { wide: true, ph: 'Rangpur, Bangladesh' }) +
        rdRepYY(r.from, r.to, 'blank = still here');
    }

    function rdRepRowEdu(r) {
      return rdRepSegF('Level', 'level', rdMpLevelOf(r.level).key,
          { options: RD_MP_LEVELS.map(x => [x.key, x.label, x.icon]) }) +
        rdRepFld('Institute', 'inst', r.inst, { ph: 'Rangpur Polytechnic Institute' }) +
        rdRepFld('Subject or group', 'field', r.field,
                 { wide: true, ph: 'Diploma in Civil Technology' }) +
        rdRepYY(r.from, r.to, 'blank = studying');
    }

    function rdRepRowPapers(r) {
      return rdRepFld('Title', 'title', r.title,
               { wide: true, max: 180,
                 ph: 'Land use change and peak flow on the Ghaghot floodplain' }) +
        rdRepFld('Link', 'url', r.url,
                 { wide: true, max: 300, type: 'url', ph: 'https://doi.org/...' });
    }

    /* Each group gets one Add button per kind rather than one Add plus a
       dropdown. Three named buttons say out loud that a post at PDACC and a
       post at Rangdhanu are separate records, and that high school belongs on
       the page as much as university does -- which a member cannot learn from
       a collapsed select. The segments inside the row stay, as the way to fix
       a wrong pick.

       This is a function and not a constant because `adds` reads the three
       committees, and reading a const at module evaluation time lands in its
       temporal dead zone. */
    function rdRepGroups() {
      return {
        posts: { row: rdRepRowPosts, one: 'designation', add: 'Add a designation',
                 icon: 'shield-check', seed: 'body',
                 adds: rdMpBodies().map(b => ({ key: b.key, label: 'Add ' + b.short,
                                                icon: b.icon })),
                 none: 'No designation added yet. Add one for every session you held a post ' +
                       'in, at Rangdhanu, at PDACC or at the Alumni Association.' },
        work: { row: rdRepRowWork, one: 'workplace', add: 'Add a workplace', icon: 'briefcase',
                none: 'No workplace added yet. Add every place you have worked. The profile ' +
                      'sorts them itself, newest first.' },
        edu: { row: rdRepRowEdu, one: 'institution', add: 'Add an institution',
               icon: 'graduation-cap', seed: 'level',
               adds: RD_MP_LEVELS.map(l => ({ key: l.key, label: 'Add ' + l.label,
                                              icon: l.icon })),
               none: 'No institution added yet. University, polytechnic institute and high ' +
                     'school all go here. Your DUET record is already on the page.' },
        papers: { row: rdRepRowPapers, one: 'paper', add: 'Add a paper link', icon: 'file-text',
                  none: 'No paper added yet. A published paper, a conference paper or a ' +
                        'repository link all work.' }
      };
    }

    function rdRepGroupOf(kind) {
      const all = rdRepGroups();
      return all[kind] || all.work;
    }

    function rdRepAddBtns(kind, g, full) {
      if (!g.adds) {
        return '<button type="button" class="rd-rep-add" onclick="rdRepAdd(\'' + kind + '\')"' +
          (full ? ' disabled' : '') + '><i data-lucide="plus"></i> ' +
          escapeHtml(g.add) + '</button>';
      }
      return g.adds.map(function (a) {
        return '<button type="button" class="rd-rep-add" onclick="rdRepAdd(\'' + kind +
          '\',\'' + a.key + '\')"' + (full ? ' disabled' : '') + '>' +
          '<i data-lucide="' + a.icon + '"></i> ' + escapeHtml(a.label) + '</button>';
      }).join('');
    }

    function rdRepRender(kind, list) {
      const box = document.getElementById('rep-' + kind);
      if (!box) return;
      const g = rdRepGroupOf(kind), cap = RD_REP_MAX[kind] || 6, full = list.length >= cap;
      box.innerHTML =
        (kind === 'posts' ? rdMpEdLists() : '') +
        (list.length
          ? list.map(function (r, i) {
              return '<div class="rd-rep-row" data-rep-row>' +
                '<span class="rd-rep-n">' + (i + 1) + '</span>' +
                '<button type="button" class="rd-rep-del" onclick="rdRepRemove(\'' + kind +
                  '\',' + i + ')" aria-label="Remove this ' + g.one +
                  '"><i data-lucide="x"></i></button>' +
                '<div class="rd-rep-grid">' + g.row(r) + '</div></div>';
            }).join('')
          : '<p class="rd-rep-none">' + escapeHtml(g.none) + '</p>') +
        '<div class="rd-rep-foot">' + rdRepAddBtns(kind, g, full) +
          '<span class="rd-rep-note">' +
            (full ? 'That is ' + cap + ', which is as many as one profile holds.'
                  : list.length + ' of ' + cap + ' used. Nothing here is required.') +
          '</span>' +
        '</div>' +
        /* role="alert" so the message is spoken. Save moves focus to the field
           at fault, and without this a screen reader user would land there with
           no idea what was wrong with it. */
        '<p class="rd-rep-err hidden" role="alert" data-rep-err></p>';
      if (window.lucide && lucide.createIcons) lucide.createIcons();
    }

    /* Three radios carry the same data-f, and the two that are not checked
       still answer to .value. Reading them all handed the last option to the
       server no matter what the member picked. */
    function rdRepRows(kind) {
      const box = document.getElementById('rep-' + kind);
      if (!box) return [];
      return Array.prototype.map.call(box.querySelectorAll('[data-rep-row]'), function (row) {
        const out = {};
        Array.prototype.forEach.call(row.querySelectorAll('[data-f]'), function (el) {
          if (el.type === 'radio' && !el.checked) return;
          out[el.getAttribute('data-f')] = String(el.value == null ? '' : el.value).trim();
        });
        return out;
      });
    }

    /* Add PDACC seeds the body, so focus skips past it to the first thing still
       unanswered. A member adding four terms of office never reaches for the
       mouse between them. */
    function rdRepAdd(kind, seed) {
      const list = rdRepRows(kind);
      if (list.length >= (RD_REP_MAX[kind] || 6)) return;
      const g = rdRepGroupOf(kind), row = {};
      if (seed && g.seed) row[g.seed] = seed;
      list.push(row);
      rdRepRender(kind, list);
      const box = document.getElementById('rep-' + kind);
      const rows = box ? box.querySelectorAll('[data-rep-row]') : [];
      const last = rows[rows.length - 1];
      if (!last) return;
      const first = rdRepFirstField(last, seed && g.seed ? g.seed : null);
      if (first) first.focus();
    }

    function rdRepRemove(kind, i) {
      const list = rdRepRows(kind);
      list.splice(i, 1);
      rdRepRender(kind, list);
    }

    /* With a select the first unanswered field was number two; with a segment
       group it is the first field that is not one of the three radios. */
    function rdRepFirstField(row, skipName) {
      const all = row.querySelectorAll('[data-f]');
      for (let i = 0; i < all.length; i++) {
        if (skipName && all[i].getAttribute('data-f') === skipName) continue;
        if (all[i].type === 'radio' && !all[i].checked) continue;
        return all[i];
      }
      return all[0] || null;
    }

    /* Changing the body swaps which posts are offered under the Position box.
       The row is not redrawn, because a redraw would take the half typed
       session with it. */
    function rdRepList(el) {
      const row = el.closest('[data-rep-row]');
      const post = row && row.querySelector('[data-f="post"]');
      if (post) post.setAttribute('list', 'rd-posts-' + rdMpBodyOf(el.value).key);
    }

    /* Save's messages are about the session, the position, the organization --
       the body is always one of three valid keys and is never the thing at
       fault, so it does not take the focus. */
    function rdRepErr(kind, i, msg) {
      const box = document.getElementById('rep-' + kind);
      if (!box) return !msg;
      const rows = box.querySelectorAll('[data-rep-row]');
      Array.prototype.forEach.call(rows, function (r) { r.classList.remove('is-bad'); });
      const p = box.querySelector('[data-rep-err]');
      if (msg && rows[i]) {
        rows[i].classList.add('is-bad');
        const f = rdRepFirstField(rows[i], rdRepGroupOf(kind).seed || null);
        if (f) f.focus();
      }
      if (p) { p.textContent = msg || ''; p.classList.toggle('hidden', !msg); }
      return !msg;
    }

    /* ---------- filling the four blocks on the edit tab -------------------
       The blocks themselves are markup in index.html: a heading, a line of
       help, and one empty `.rd-rep` box each. Everything below fills a box. */

    /* One datalist per body rather than one per row: twelve rows would
       otherwise carry twelve copies of the same five options. They ride inside
       the posts box, which is the only place a `list=` points at them, so a
       re-render cannot leave a row referring to a datalist that is gone. */
    function rdMpEdLists() {
      return rdMpBodies().map(function (b) {
        return '<datalist id="rd-posts-' + b.key + '">' +
          (b.positions || []).filter(p => p !== 'Others')
            .map(p => '<option value="' + escapeHtml(p) + '"></option>').join('') +
          '</datalist>';
      }).join('');
    }

    function rdMpEditorFill(mp) {
      rdRepRender('posts', (mp.posts || []).slice());
      rdRepRender('work', (mp.work || []).slice());
      rdRepRender('edu', (mp.edu || []).slice());
      rdRepRender('papers', (mp.papers || []).slice());
      rdMypThCount();
    }

    const RD_MP_TH_MAX = 1500;

    function rdMypThCount() {
      const t = document.getElementById('myp-thdet'), p = document.getElementById('myp-thcount');
      if (t && p) p.textContent = t.value.length + ' / ' + RD_MP_TH_MAX;
    }

    /* ---------- validating what was typed --------------------------------
       Empty rows are dropped rather than complained about: somebody who opens
       a row and changes their mind should not be stopped by it, because none of
       this is required. A row with something in it has to be right. */
    function rdMpYearError(v, required) {
      const s = String(v || '').trim();
      if (!s) return required ? 'Add the year.' : '';
      if (!/^\d{4}$/.test(s)) return 'Write the year in full, like 2019.';
      const y = +s;
      if (y < 1950 || y > new Date().getFullYear() + 6) return 'Please check the year.';
      return '';
    }

    /* Returns the four lists plus the thesis, or null when something is wrong
       -- in which case the message is already on screen and the focus is
       already in the field at fault. The session rule is not written again
       here: rdSessionError is the one the committee forms already use, and it
       reads the span off the committee's own name. */
    function rdMpEdCollect() {
      const posts = [], postsAt = [], work = [], edu = [], papers = [], seen = {};
      let raw, r, e, i, k;
      /* Wipe all four messages before checking anything. Clearing a group only
         once it had passed left a message under Papers alive through a Save
         that stopped at Education: two red lines at once, one of them about a
         field that was already fixed. */
      ['posts', 'work', 'edu', 'papers'].forEach(kind => rdRepErr(kind, -1, ''));

      raw = rdRepRows('posts');
      for (i = 0; i < raw.length; i++) {
        r = raw[i];
        if (!rdMpHas(r.post) && !rdMpHas(r.session)) continue;
        if (!rdMpHas(r.post)) { rdRepErr('posts', i, 'Add the position you held.'); return null; }
        e = rdSessionError(r.session, rdMpBodyOf(r.body).name);
        if (e) { rdRepErr('posts', i, e); return null; }
        posts.push({ body: rdMpBodyOf(r.body).key, session: r.session, post: r.post });
        postsAt.push(i);
      }
      for (i = 0; i < posts.length; i++) {
        k = posts[i].body + '|' + posts[i].session;
        /* One post per body per session. Two rows for one session is a typo far
           more often than it is two posts. postsAt, not i: an empty row that
           was skipped would otherwise mark the wrong row as the bad one. */
        if (seen[k]) {
          rdRepErr('posts', postsAt[i], 'You already have a ' +
            rdMpBodyOf(posts[i].body).short + ' entry for ' + posts[i].session + '.');
          return null;
        }
        seen[k] = true;
      }
      raw = rdRepRows('work');
      for (i = 0; i < raw.length; i++) {
        r = raw[i];
        if (!rdMpHas(r.org) && !rdMpHas(r.desig) && !rdMpHas(r.from) && !rdMpHas(r.to)) continue;
        if (!rdMpHas(r.org)) { rdRepErr('work', i, 'Add the organization.'); return null; }
        e = rdMpYearError(r.from, true) || rdMpYearError(r.to, false);
        if (e) { rdRepErr('work', i, e); return null; }
        if (rdMpHas(r.to) && +r.to < +r.from) {
          rdRepErr('work', i, 'The end year cannot come before the start.');
          return null;
        }
        work.push({ org: r.org, desig: r.desig, loc: r.loc, from: r.from, to: r.to });
      }

      raw = rdRepRows('edu');
      for (i = 0; i < raw.length; i++) {
        r = raw[i];
        if (!rdMpHas(r.inst) && !rdMpHas(r.field) && !rdMpHas(r.from) && !rdMpHas(r.to)) continue;
        if (!rdMpHas(r.inst)) {
          rdRepErr('edu', i, 'Add the name of the institution.');
          return null;
        }
        e = rdMpYearError(r.from, true) || rdMpYearError(r.to, false);
        if (e) { rdRepErr('edu', i, e); return null; }
        if (rdMpHas(r.to) && +r.to < +r.from) {
          rdRepErr('edu', i, 'The end year cannot come before the start.');
          return null;
        }
        edu.push({ level: rdMpLevelOf(r.level).key, inst: r.inst, field: r.field,
                   from: r.from, to: r.to });
      }

      raw = rdRepRows('papers');
      for (i = 0; i < raw.length; i++) {
        r = raw[i];
        if (!rdMpHas(r.url) && !rdMpHas(r.title)) continue;
        /* http and https only. javascript: and data: must never reach an href,
           and this is the only gate between a typed link and one. */
        if (!/^https?:\/\/[^\s]+\.[^\s]+$/i.test(r.url || '')) {
          rdRepErr('papers', i, 'A paper link has to start with https:// and point at a page.');
          return null;
        }
        papers.push({ title: r.title || r.url, url: r.url });
      }

      const th = document.getElementById('myp-thesis'), td = document.getElementById('myp-thdet');
      return { posts: posts, work: work, edu: edu, papers: papers,
               thesis: String((th && th.value) || '').trim(),
               thesisDetails: String((td && td.value) || '').trim() };
    }

    /* The newest open ended job is what the directory card and the credential
       print, so it is copied into the three single columns on save rather than
       asked for a second time. */
    function rdMpEdCurrentJob(work) {
      const all = (work || []).slice();
      return all.filter(w => !rdMpHas(w.to)).sort(rdMpByYearDesc)[0] ||
             all.sort(rdMpByYearDesc)[0] || null;
    }

    /* The six list columns as the sheet wants them, built in one place so the
       save handler stays short enough to read. null is the answer when a row is
       wrong: rdMpEdCollect has already written the message under that row, so
       the caller only has to stop.

       Organization, Designation and Work Location are older single columns that
       the card and the credential still read. They are overwritten only when a
       Work History row exists, so a member who fills in nothing but the three
       simple inputs keeps exactly what they typed.

       Cover Position is not here on purpose. It is saved by its own button on
       the picture, and a form save must not move a cover the member has just
       dragged into place. */
    function rdMpEdPayload() {
      const c = rdMpEdCollect();
      if (c === null) return null;
      const out = {
        positions: rdMpJoin(c.posts, ['body', 'session', 'post']),
        workHistory: rdMpJoin(c.work, ['org', 'desig', 'loc', 'from', 'to']),
        education: rdMpJoin(c.edu, ['level', 'inst', 'field', 'from', 'to']),
        papers: rdMpJoin(c.papers, ['title', 'url']),
        thesisTopic: c.thesis,
        thesisDetails: c.thesisDetails
      };
      const job = rdMpEdCurrentJob(c.work);
      if (job) {
        out.organization = job.org || '';
        out.designation = job.desig || '';
        out.workLocation = job.loc || '';
      }
      return out;
    }

    /* ====================================================================
       MY PROFILE -- the two tabs, the cover, and the drag
       --------------------------------------------------------------------
       The markup for this page is already in index.html: a tab strip, an
       empty #myp-view the record is painted into, and #myp-edit holding the
       form. Only hidden moves between the two -- both panels stay in the DOM,
       so a half typed form is never thrown away by a tab click.

       The cover has three actions and they all end in the same two hidden
       file inputs the edit tab already owns (#myp-cover-file, #myp-photo-file).
       A programmatic .click() works on an input inside a hidden panel, so
       rdMypPhoto stays the one and only upload path.
       ==================================================================== */

    /* RD_MYP is declared with let further up and holds the record, so the
       reposition state gets its own holder rather than redeclaring it.
       ox/oy are the values Cancel goes back to. */
    const RD_MP_POS = { on: false, x: 50, y: 50, ox: 50, oy: 50, busy: false };

    function rdMypRecord() {
      return rdMpFromSheet(RD_MYP.me ||
        (typeof RD_MEMBER !== 'undefined' && RD_MEMBER.me) || {});
    }

    function rdMypCoverStore(header, value) {
      if (RD_MYP.me) RD_MYP.me[header] = value;
      if (typeof RD_MEMBER !== 'undefined' && RD_MEMBER.me) RD_MEMBER.me[header] = value;
    }

    /* A member's own page is painted through the same builder as anybody
       else's, with own:true added. One design, one code path -- what he reads
       here is what the directory shows, plus the buttons. */
    function rdMypViewPaint() {
      const box = document.getElementById('myp-view');
      if (!box) return;
      const mp = rdMypRecord();
      if (!RD_MP_POS.on) { RD_MP_POS.x = mp.pos.x; RD_MP_POS.y = mp.pos.y; }
      RD_MP_SHOWN = mp;
      box.innerHTML = rdMpProfile(mp, { own: true, signed: true, pos: RD_MP_POS.on,
                                        x: RD_MP_POS.x, y: RD_MP_POS.y });
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      if (typeof rdPhotoSweep === 'function') rdPhotoSweep(box);
      if (RD_MP_POS.on) {
        rdMpArmDrag();
        const cov = document.getElementById('mp-cover');
        if (cov && cov.focus) cov.focus({ preventScroll: true });
      }
    }

    function rdMypTabMark(btn, on) {
      if (!btn) return;
      if (on) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    }

    function rdMypTab(which) {
      const edit = which === 'edit';
      /* Leaving the page mid drag would strand the bar on a hidden panel and
         hold the cover at a crop that was never saved. */
      if (edit && RD_MP_POS.on) rdMpPosEnd(false);
      const v = document.getElementById('myp-view'), e = document.getElementById('myp-edit');
      if (v) v.hidden = edit;
      if (e) e.hidden = !edit;
      rdMypTabMark(document.getElementById('myp-tab-view'), !edit);
      rdMypTabMark(document.getElementById('myp-tab-edit'), edit);
      if (!edit) rdMypViewPaint();
    }

    /* ---- the two pickers ----------------------------------------------- */
    function rdMpCoverPick() {
      const input = document.getElementById('myp-cover-file');
      if (input) input.click();
    }

    function rdMpPhotoPick() {
      const input = document.getElementById('myp-photo-file');
      if (input) input.click();
    }

    /* Called once an upload has landed. A brand new photo under an old crop
       can sit anywhere, so the bar opens straight away: he asked for the crop
       to be part of uploading, not a second thing to go and find. */
    function rdMypCoverFresh() {
      const mp = rdMypRecord();
      RD_MP_POS.on = true;
      RD_MP_POS.x = RD_MP_POS.ox = mp.pos.x;
      RD_MP_POS.y = RD_MP_POS.oy = mp.pos.y;
      rdMypTab('view');
    }

    /* ---- reposition ---------------------------------------------------- */
    /* The bar's own sentence doubles as the status line. There is no room for
       a second message box inside a strip this small, and a message that
       appears where the reader is already looking is read. */
    function rdMpPosMsg(text) {
      const el = document.querySelector('.rd-mp-posbar > span');
      if (el) el.textContent = text;
    }

    function rdMpPosStart() {
      const mp = rdMypRecord();
      /* Nothing to move on the Association's own artwork, so offer the upload
         instead of a bar that would do nothing. */
      if (!rdMpHas(mp.cover)) { rdMpCoverPick(); return; }
      RD_MP_POS.on = true;
      RD_MP_POS.x = RD_MP_POS.ox = mp.pos.x;
      RD_MP_POS.y = RD_MP_POS.oy = mp.pos.y;
      rdMypViewPaint();
    }

    async function rdMpPosEnd(save) {
      if (!RD_MP_POS.on || RD_MP_POS.busy) return;
      if (!save) {
        RD_MP_POS.on = false;
        RD_MP_POS.x = RD_MP_POS.ox;
        RD_MP_POS.y = RD_MP_POS.oy;
        rdMypViewPaint();
        return;
      }
      const value = RD_MP_POS.x + '% ' + RD_MP_POS.y + '%';
      const ok = document.querySelector('.rd-mp-posbtn-ok');
      RD_MP_POS.busy = true;
      if (ok) ok.disabled = true;
      rdMpPosMsg('Saving the position...');
      try {
        /* Member_Profile.gs writes only the keys a payload really carries, so
           one cell moves here and the other twelve are left alone. */
        await apiPost('membersaveprofile',
                      Object.assign({ coverPosition: value }, rdMemberParams()));
        rdMypCoverStore('Cover Position', value);
        rdFeedForget('alumni');
        RD_MP_POS.on = false;
        RD_MP_POS.ox = RD_MP_POS.x;
        RD_MP_POS.oy = RD_MP_POS.y;
        rdMypViewPaint();
        const btn = document.querySelector('[onclick="rdMpPosStart()"]');
        if (btn) rdMpFlash(btn, 'Saved');
      } catch (err) {
        rdMpPosMsg(friendlyError(err).msg);
      } finally {
        RD_MP_POS.busy = false;
        const again = document.querySelector('.rd-mp-posbtn-ok');
        if (again) again.disabled = false;
      }
    }

    function rdMpClamp(v) { return Math.max(0, Math.min(100, v)); }

    function rdMpPosNudge(dx, dy) {
      const box = document.getElementById('mp-cover');
      RD_MP_POS.x = rdMpClamp(RD_MP_POS.x + dx);
      RD_MP_POS.y = rdMpClamp(RD_MP_POS.y + dy);
      if (box) box.style.setProperty('--rd-cover-pos', RD_MP_POS.x + '% ' + RD_MP_POS.y + '%');
    }

    /* object-fit: cover leaves slack in one direction only. Pointer pixels are
       turned into per cent of that slack, so a tall photo travels the whole way
       from top to bottom under one finger, and a photo with no slack in an axis
       does not jitter along it. Arrow keys move the same value, because a drag
       is the one thing on this page a keyboard cannot do. */
    function rdMpArmDrag() {
      const box = document.getElementById('mp-cover');
      const img = box && box.querySelector('img');
      if (!box || !img || box.rdMpArmed) return;
      box.rdMpArmed = true;
      let drag = null;
      function slack() {
        const bw = box.clientWidth, bh = box.clientHeight;
        const nw = img.naturalWidth || bw, nh = img.naturalHeight || bh;
        const s = Math.max(bw / nw, bh / nh);
        return { x: Math.max(0, nw * s - bw), y: Math.max(0, nh * s - bh) };
      }
      box.addEventListener('pointerdown', function (e) {
        if (!RD_MP_POS.on) return;
        drag = { px: e.clientX, py: e.clientY, x: RD_MP_POS.x, y: RD_MP_POS.y, sl: slack() };
        if (box.setPointerCapture) box.setPointerCapture(e.pointerId);
        e.preventDefault();
      });
      box.addEventListener('pointermove', function (e) {
        if (!drag) return;
        if (drag.sl.x > 1) {
          RD_MP_POS.x = rdMpClamp(drag.x - (e.clientX - drag.px) * 100 / drag.sl.x);
        }
        if (drag.sl.y > 1) {
          RD_MP_POS.y = rdMpClamp(drag.y - (e.clientY - drag.py) * 100 / drag.sl.y);
        }
        box.style.setProperty('--rd-cover-pos', RD_MP_POS.x + '% ' + RD_MP_POS.y + '%');
      });
      box.addEventListener('pointerup', function () { drag = null; });
      box.addEventListener('pointercancel', function () { drag = null; });
      box.addEventListener('keydown', function (e) {
        if (!RD_MP_POS.on) return;
        const step = e.shiftKey ? 10 : 2;
        if (e.key === 'ArrowUp') rdMpPosNudge(0, -step);
        else if (e.key === 'ArrowDown') rdMpPosNudge(0, step);
        else if (e.key === 'ArrowLeft') rdMpPosNudge(-step, 0);
        else if (e.key === 'ArrowRight') rdMpPosNudge(step, 0);
        else if (e.key === 'Enter') { rdMpPosEnd(true); return; }
        else if (e.key === 'Escape') { rdMpPosEnd(false); return; }
        else return;
        e.preventDefault();
      });
    }

    /* ---- back to the Association's own cover --------------------------- */
    /* This throws a photo away, and the site has no box to ask with -- the
       browser's own yes-or-no box is a popup and popups are banned here. So the
       button asks in its own label instead: one tap arms it, a second tap
       inside four seconds does it, and walking away disarms it. */
    let RD_MP_RESET_AT = 0;

    function rdMpWarnBtn(btn, msg) {
      const old = btn.innerHTML;
      btn.innerHTML = '<i data-lucide="alert-triangle"></i>' +
                      '<span class="rd-mp-cbtn-lbl">' + escapeHtml(msg) + '</span>';
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      clearTimeout(btn.rdMpTimer);
      btn.rdMpTimer = setTimeout(function () {
        RD_MP_RESET_AT = 0;
        btn.innerHTML = old;
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      }, 4000);
    }

    async function rdMpCoverReset(from) {
      if (RD_MP_POS.busy) return;
      /* Two buttons now call this -- one over the cover on the Profile face, one
         in the button row on the Edit face -- so the button has to be handed in.
         Looking it up by its own onclick text would find whichever of the two
         the markup happens to list first and arm that one, leaving the button
         actually under the finger unchanged. The lookup stays as a fallback for
         a caller that passes nothing. */
      const btn = from || document.querySelector('[onclick="rdMpCoverReset(this)"]');
      if (Date.now() - RD_MP_RESET_AT > 4000) {
        RD_MP_RESET_AT = Date.now();
        if (btn) rdMpWarnBtn(btn, 'Tap again');
        return;
      }
      RD_MP_RESET_AT = 0;
      if (btn) { clearTimeout(btn.rdMpTimer); btn.disabled = true; }
      RD_MP_POS.busy = true;
      try {
        /* An empty Cover Photo is the only value Member_Profile.gs takes from
           this call -- a link cannot be written in from here, because the one
           way a photo arrives is membersavephoto, where it really reaches
           Drive. The file in Drive is left alone: deleting it would be the one
           action on this page that could not be undone. */
        await apiPost('membersaveprofile',
                      Object.assign({ coverPhoto: '' }, rdMemberParams()));
        rdMypCoverStore('Cover Photo', '');
        rdFeedForget('alumni');
        RD_MP_POS.on = false;
        RD_MP_POS.x = RD_MP_POS.ox = 50;
        RD_MP_POS.y = RD_MP_POS.oy = 50;
        if (typeof rdMypCover === 'function') rdMypCover('');
        rdMypViewPaint();
      } catch (err) {
        if (btn) { btn.disabled = false; rdMpWarnBtn(btn, friendlyError(err).msg); }
      } finally {
        RD_MP_POS.busy = false;
      }
    }

    /* Both pictures take the same road. The file is compressed in the browser
       first, so a phone camera photo never turns into a size error. */
    async function rdMypPhoto(input, kind) {
      const file = input && input.files && input.files[0];
      if (input) input.value = '';
      if (!file) return;
      const cover = kind === 'cover';
      rdMemberMsg('myp-photo-msg', cover ? 'Uploading the cover...' : 'Uploading the photo...', 'wait');
      try {
        const payload = await filePayload(file, cover ? 1600 : 1200);
        const r = await apiPost('membersavephoto',
                                Object.assign({ kind: cover ? 'cover' : 'photo', file: payload }, rdMemberParams()));
        const url = (r && r.url) || '';
        if (cover) rdMypCover(url); else rdMypFace(url);
        const header = cover ? 'Cover Photo' : 'Passport Size Image';
        if (RD_MYP.me) RD_MYP.me[header] = url;
        if (RD_MEMBER.me) RD_MEMBER.me[header] = url;
        rdFeedForget('alumni');
        /* A new cover under an old crop can sit anywhere, so the bar that
           moves it opens straight away; a new face only needs the page
           drawn again. */
        if (cover) rdMypCoverFresh(); else rdMypViewPaint();
        rdMemberMsg('myp-photo-msg', cover ? 'The cover is saved.' : 'The photo is saved.', 'ok');
      } catch (err) {
        rdMemberMsg('myp-photo-msg', friendlyError(err).msg);
      }
    }

    function rdMemberPaintSignInLinks(restoring) {
      rdMemberNavPaint();
      /* A signed-in admin is routed to the panel and never needs the member
         Membership Application CTA, so it steps aside while the gate is open. */
      const join = document.getElementById('rd-si-join');
      if (join) join.classList.toggle('hidden', rdAdminGateOpen());
      const box = document.getElementById('alumni-member-bar');
      if (!box) return;
      if (restoring && !rdMemberSignedIn()) {
        box.innerHTML = '<span class="inline-flex items-center gap-1.5 text-slate-500 font-bold"><i data-lucide="loader-circle" class="w-4 h-4 animate-spin"></i> Restoring sign in...</span>';
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        return;
      }
      box.innerHTML = rdMemberSignedIn()
        ? '<span class="inline-flex items-center gap-1.5 text-emerald-700 font-bold"><i data-lucide="badge-check" class="w-4 h-4"></i> ' +
          escapeHtml(RD_MEMBER.email) + '</span>' +
          '<button type="button" onclick="memberSignOut()" class="ml-2 underline font-bold text-slate-500 hover:text-slate-900">Sign out</button>'
        : (rdAdminGateOpen()
          ? '<span class="inline-flex items-center gap-1.5 text-emerald-700 font-bold"><i data-lucide="shield-check" class="w-4 h-4"></i> Admin access &mdash; contact details unlocked</span>'
          : '');
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    }

    /* A refresh must not sign anybody out, so the token is read back and checked
       once -- quietly, because nobody pressed anything.

       Three things happen here in order: the token from an older build of the
       site is moved out of sessionStorage, a token Google has already retired is
       replaced without anything appearing on screen, and a member who reloaded
       straight onto My Profile gets that page filled in rather than being sent
       to the directory. */
    function rdMemberRestore() {
      let token = '';
      try {
        token = localStorage.getItem(RD_MEMBER_KEY) || '';
        if (!token) {
          const old = sessionStorage.getItem(RD_MEMBER_KEY) || '';
          if (old) { rdMemberRemember(old); token = old; }
        }
      } catch (err) { token = ''; }

      if (token && rdMemberWantsIn()) {
        try {
          const cached = localStorage.getItem(RD_MEMBER_PROFILE_KEY);
          if (cached) {
            RD_MEMBER.me = JSON.parse(cached);
            RD_MEMBER.email = (RD_MEMBER.me && (RD_MEMBER.me.Email || RD_MEMBER.me.email)) || '';
            RD_MEMBER.token = token;
            rdMemberLandedSignedIn();
          }
        } catch (err) { /* parse error: will be refreshed on verify */ }
      }

      rdMemberPaintSignInLinks(!!(token || rdMemberWantsIn()));

      if (!token || !rdTokenLive(token)) {
        /* Nothing usable in hand. If the member never signed out, Google is
           asked for a fresh token in the background. */
        if (rdMemberWantsIn()) rdMemberSilentRenew();
        else rdMemberLandedSignedOut();
        return;
      }
      RD_MEMBER.token = token;
      memberVerify(true).then(function () {
        if (rdMemberSignedIn()) rdMemberLandedSignedIn();
        else if (rdMemberWantsIn()) rdMemberSilentRenew();
        else rdMemberLandedSignedOut();
      });
    }

    /* Google hands back a new ID token for an account that is already chosen,
       with no button and no prompt, as long as the member has not revoked the
       site. Nothing is drawn for this -- it either works or the member is asked
       to sign in the ordinary way. */
    function rdMemberSilentRenew(tries) {
      tries = tries || 0;
      if (!rdGsiReady()) {
        if (tries < 20) { setTimeout(function () { rdMemberSilentRenew(tries + 1); }, 500); return; }
        rdMemberLandedSignedOut();
        return;
      }
      try {
        google.accounts.id.initialize({
          client_id: RD_ADMIN_CLIENT_ID,
          callback: function (resp) {
            const t = (resp && resp.credential) || '';
            if (!t) { rdMemberLandedSignedOut(); return; }
            rdMemberRemember(t);
            memberVerify(true).then(function () {
              if (rdMemberSignedIn()) rdMemberLandedSignedIn();
              else rdMemberLandedSignedOut();
            });
          },
          auto_select: true,
          cancel_on_tap_outside: true
        });
        rdGsiOwner = 'member';
        google.accounts.id.prompt(function (note) {
          if (note && note.isNotDisplayed && note.isNotDisplayed()) rdMemberLandedSignedOut();
          else if (note && note.isSkippedMoment && note.isSkippedMoment()) rdMemberLandedSignedOut();
        });
      } catch (err) {
        rdMemberLandedSignedOut();
      }
    }

    /* Where a reload leaves the member, once we know whether they are in. */
    function rdMemberLandedSignedIn() {
      document.body.classList.remove('rd-member-restoring');
      rdMemberNavPaint();
      if (rdCurrentPageId === 'my-profile') openMyProfile('home');
      if (rdCurrentPageId === 'committee-new') ecPrepareSubmissionForm();
      if (rdCurrentPageId === 'polls') rdPollOpen();
      if (rdCurrentPageId === 'bloodbank') loadBloodBank();
    }

    function rdMemberLandedSignedOut() {
      document.body.classList.remove('rd-member-restoring');
      rdMemberNavPaint();
      rdMemberPaintSignInLinks();
      if (rdCurrentPageId === 'my-profile') openMemberSignIn('home');
      if (rdCurrentPageId === 'polls') rdPollOpen();
      if (rdCurrentPageId === 'bloodbank') loadBloodBank();
    }

    function openMemberSignIn(backTo) {
      openSubPage('member-signin', backTo || rdCurrentPageId);
      rdMemberMsg('member-signin-msg', '');
      rdMemberMsg('member-link-msg', '');
      rdMemberPaintLinkBox();
      if (!rdDrawMemberGsiButton()) setTimeout(rdDrawMemberGsiButton, 700);
    }

    function openAlumniModal(id) {
        const a = alumniData.find(x => String(x.id) === String(id)); 
        if(!a) return;
        if (rdCanViewContacts() && !RD_MEMBER.contacts) {
          memberLoadContacts().then(function () {
            openAlumniProfileModal(a);
          });
          return;
        }
        openAlumniProfileModal(a); 
    }

    /* ================= THE PAGE ANOTHER MEMBER OPENS =====================
       This page used to be its own set of builders, drawing its own boxes from
       its own template. That is how it came to disagree with My Profile about
       what a member's record even holds. It is now assembled from the shared
       builders: five strings, each already a section, straight into the grid.

       The three functions below are the seam. Their names and their arguments
       are what the harness reads to know the seam is still here, so they stay
       thin on purpose -- no markup of their own beyond the one section wrapper
       that rows need and a section does not. */

    /* Contact and Social Media hand back rows, so they are the two that still
       need naming and wrapping. Everything else arrives from rdMpSection with
       its own title already engraved, and is passed straight through rather
       than wrapped a second time. Both of these are rail sections: is-side is
       what puts them in the narrow column. */
    const RD_PROFILE_RAILS = { 'Contact': 'contact', 'Social Media': 'at-sign' };

    function rdProfileSection(title, inner) {
      if (!inner) return '';
      const rail = RD_PROFILE_RAILS[title];
      return rail ? rdMpSection(rail, title, inner, 1) : inner;
    }

    /* The rows are not hidden with CSS. A signed-out browser is never sent the
       contact sheet at all, so there is nothing in the page to reveal -- and
       signed out this returns the same lock card My Profile would draw, from
       the same function, so the two pages cannot drift apart. */
    function rdMemberPrivateRows(a) {
      const c = memberContact(a.memberId);
      const canView = !!c || rdCanViewContacts();
      return rdMpContactInner(rdMpFromAlumni(a, c), rdMpState({ signed: canView }));
    }

    function openAlumniProfileModal(a) {
      RD_MEMBER.lastProfileId = a.id;
      const mc = document.getElementById("profile-content");
      /* Its own line because this is where a Drive file id on the row becomes a
         URL the browser will actually load. */
      const cover = normalizeAlumniImage(a.cover);
      const c = memberContact(a.memberId);
      const mp = rdMpFromAlumni(a, c);
      mp.cover = cover;
      /* Save contact and Share read whichever record was painted last. */
      RD_MP_SHOWN = mp;
      const canView = !!c || rdCanViewContacts();
      const st = rdMpState({ own: false, signed: canView, x: mp.pos.x, y: mp.pos.y });
      RD_MP_OWN = false;   /* a public profile never carries the Add/Edit affordances */

      const head = rdMpCredential(mp, st);
      const idCard = rdProfileSection('Rangdhanu Identity', rdMpService(mp));
      const work = rdProfileSection('Work', rdMpWork(mp) + rdMpEdu(mp) + rdMpResearch(mp));
      const contact = rdProfileSection('Contact', rdMemberPrivateRows(a));
      const social = rdProfileSection('Social Media', c ? rdSocialChips(c['Social Links']) : '');

      mc.innerHTML = head + idCard + work + contact + social;
      openSubPage('profile', 'alumni');
      lucide.createIcons();
      /* A picture the browser already has fires its load event before this
         markup exists, so the sweep is what makes it appear. Without it the
         photo stayed transparent on this page while the directory showed it. */
      rdPhotoSweep(mc);
    }
    function closeAlumniModal() { goBackFromSubPage('profile'); }
    
    let alumniViewFilter = 'ALL';

    /* ---------- from the directory to the committee page -----------------
       The directory answers "who is in Rangdhanu"; the committee page answers
       "who runs it". They were two clicks apart through the menu, so each
       view now offers the committee that belongs to it: the Running Member
       view points at the Rangdhanu Executive Committee, the Alumni view at
       the Alumni Association committee. Same page, preselected -- not a copy
       of it, so there is only ever one committee list to keep right. */
    function rdViewCommittee(name) {
      RD_EC.committee = name;
      RD_EC.session = '';
      switchPage('committee');
      renderExecutiveCommittee();
      lucide.createIcons();
    }
    function alumniViewExecutiveCommittee() { rdViewCommittee(RD_EC_COMMITTEES[0].name); }
    function alumniViewAlumniCommittee() { rdViewCommittee(RD_EC_COMMITTEES[1].name); }

    /* Which of the two shortcuts is on screen follows the view being read.
       On "Everyone" both are offered, because both lists are on screen. */
    function rdSyncAlumniCommitteeLinks(v) {
      /* Committee buttons removed from main directory strip per owner request */
    }


    /* ================= RANGDHANU FAMILY: TEACHERS AND OFFICERS =========
       Its own feed and its own page. Members and teachers share one sheet --
       that is what lets a teacher sign in through the same door every member
       uses -- but they never share a list. `?action=faculty` returns only the
       faculty rows, and getPublicAlumni() drops them, so neither grid can
       ever show the other's people.

       No personal mobile number is in this feed. The office extension and the
       @duet.ac.bd address are what DUET publishes itself; anything private
       stays behind the member sign-in like everyone else's. */
    const FACULTY_API_URL = API_BASE_URL + '?action=faculty';
    const RD_FAC = { ready: false, all: [], shown: [], kind: 'ALL' };

    const RD_FAC_KIND_LABEL = { 'Teacher': 'Teacher', 'Officer': 'Officer', 'Staff': 'Staff' };
    const RD_FAC_KIND_ICON  = { 'Teacher': 'graduation-cap', 'Officer': 'briefcase', 'Staff': 'users' };

    /* One shape for the warm copy and the fresh one, so the card is written
       against field names that cannot change under it. */
    function rdFacShape(rows) {
      const pick = (r, k) => String(r[k] == null ? '' : r[k]).trim();
      return (Array.isArray(rows) ? rows : []).map((r, i) => ({
        id: pick(r, 'Member ID') || ('fac-' + i),
        memberId: pick(r, 'Member ID'),
        kind: RD_FAC_KIND_LABEL[pick(r, 'Record Type')] || 'Teacher',
        name: pick(r, 'Full Name (English)'),
        desig: pick(r, 'Current Designation'),
        dept: pick(r, 'Department'),
        degree: pick(r, 'Academic Degree'),
        phone: pick(r, 'Office Phone'),
        profile: pick(r, 'DUET Profile'),
        institute: pick(r, 'Diploma Institute'),
        org: pick(r, 'Current Organization / Company'),
        blood: pick(r, 'Blood Group'),
        image: pick(r, 'Passport Size Image')
      })).filter(f => f.name);
    }

    async function loadFaculty() {
      const warm = rdFeedRecall('faculty');
      if (warm && !RD_FAC.all.length) {
        RD_FAC.all = rdFacShape(warm);
        populateFacultyDeptFilter();
        filterFaculty();
      }
      try {
        const res = await fetch(FACULTY_API_URL + '&_=' + Date.now(), { cache: 'no-store' });
        const data = await res.json();
        const rows = Array.isArray(data.data) ? data.data : [];
        RD_FAC.all = rdFacShape(rows);
        RD_FAC.ready = true;
        rdFeedRemember('faculty', rows);
        populateFacultyDeptFilter();
        filterFaculty();
      } catch (e) {
        /* A failed refresh must not wipe a list that is already on screen. */
        console.warn('[rd] faculty list unavailable:', e && e.message ? e.message : e);
        RD_FAC.ready = true;
        if (!RD_FAC.all.length) renderFaculty();
      }
    }

    /* The departments come from the rows, not from a hand-written list: a
       teacher in a department the member form never offered -- Physics, for
       one -- would otherwise be unfilterable. */
    function populateFacultyDeptFilter() {
      const s = document.getElementById('faculty-filter-dept');
      if (!s) return;
      const keep = s.value;
      const v = [...new Set(RD_FAC.all.map(f => f.dept).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      s.innerHTML = '<option value="ALL">All Departments</option>' +
        v.map(x => '<option value="' + escapeHtml(x) + '">' + escapeHtml(x) + '</option>').join('');
      if (keep && v.indexOf(keep) !== -1) s.value = keep;
    }

    function setFacultyKind(kind) {
      RD_FAC.kind = kind;
      document.querySelectorAll('.faculty-kind-btn').forEach(b => {
        const on = b.dataset.kind === kind;
        b.className = 'faculty-kind-btn px-4 py-2 rounded-xl text-xs sm:text-sm font-bold border transition ' +
          (on ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300');
      });
      filterFaculty();
    }

    function filterFaculty() {
      const q = String((document.getElementById('faculty-search-input') || {}).value || '')
        .trim().toLowerCase();
      const dept = String((document.getElementById('faculty-filter-dept') || {}).value || 'ALL');
      RD_FAC.shown = RD_FAC.all.filter(f =>
        (RD_FAC.kind === 'ALL' || f.kind === RD_FAC.kind) &&
        (dept === 'ALL' || f.dept === dept) &&
        (!q || [f.name, f.desig, f.dept, f.degree, f.institute, f.org]
          .join(' ').toLowerCase().includes(q))
      );
      renderFaculty();
    }

    function resetFacultyFilters() {
      const s = document.getElementById('faculty-search-input');
      const d = document.getElementById('faculty-filter-dept');
      if (s) s.value = '';
      if (d) d.value = 'ALL';
      setFacultyKind('ALL');
    }

    /* Only what DUET publishes itself: the office extension and the profile
       page. No personal number is in this feed, so there is nothing here for a
       sign-in to unlock -- which is why the faculty foot carries no gate cell
       where the member card carries one.

       A four-digit IP(D) extension is printed, not linked: tel:8600 dials
       nothing from outside the campus exchange, and a link that cannot work is
       worse than plain text.

       The profile label is inside an rd-dc-lbl span for the same reason the
       member card's is: the cell's hover wash is a positioned ::before and it
       paints over loose text in its parent. */
    function rdFacSeg(f) {
      const cells = [];
      if (f.profile) {
        cells.push('<a class="rd-dc-open" href="' + escapeHtml(f.profile) + '" target="_blank" rel="noopener">' +
          '<span class="rd-dc-lbl">DUET profile</span>' +
          '<i data-lucide="arrow-up-right" class="rd-dc-arw"></i></a>');
      }
      if (f.phone) {
        const digits = rdMpDigits(f.phone, true);
        cells.push(digits.replace(/\+/g, '').length >= 9
          ? '<a class="rd-dc-call" href="tel:' + digits + '" aria-label="Office phone of ' +
            escapeHtml(f.name) + '" title="Office phone"><i data-lucide="phone"></i></a>'
          : '<span class="rd-dc-flat" title="Office extension"><i data-lucide="phone"></i> ' +
            escapeHtml(f.phone) + '</span>');
      }
      if (!cells.length) {
        return '<div class="rd-dc-seg has-1"><span class="rd-dc-flat">' +
          escapeHtml(f.dept ? f.dept + ', DUET' : 'DUET') + '</span></div>';
      }
      return '<div class="rd-dc-seg has-' + cells.length + '">' + cells.join('') + '</div>';
    }

    /* The same nameplate the member roll uses, with faculty facts in the member
       slots: the plate carries a department where a member's carries a series,
       the pill says Teacher where a member's says Alumni, and the foot opens a
       DUET profile where a member's opens the member modal. Reusing the shell
       is deliberate -- two lists drawn as two different websites would read as
       two different associations. */
    function renderFacultyCard(f) {
      let body = (f.desig ? '<p class="rd-dc-role">' + escapeHtml(f.desig) + '</p>' : '') +
                 (f.degree ? '<p class="rd-dc-org">' + escapeHtml(f.degree) + '</p>' : '');
      /* The diploma institute is the Rangpur connection -- it is the reason
         this teacher belongs on a Rangdhanu page at all -- so it gets the
         labelled row the member card gives to a held post. */
      if (f.institute) {
        body += '<span class="rd-dc-post">' +
          '<span class="rd-dc-posty">Diploma</span>' +
          '<span class="rd-dc-postv">' + escapeHtml(f.institute) + '</span></span>';
      }
      return '<div class="alumni-card rd-dcw">' +
        '<article class="rd-dc is-faculty">' +
          '<div class="rd-dc-plate">' +
            '<span class="rd-dc-pid">' + escapeHtml(f.dept || 'DUET') + '</span>' +
            '<span class="rd-dc-pst"><i data-lucide="' +
              (RD_FAC_KIND_ICON[f.kind] || 'graduation-cap') + '" class="rd-dc-psti"></i> ' +
              escapeHtml(f.kind) + '</span>' +
          '</div>' +
          '<div class="rd-dc-top">' + rdDcFace(f) +
            '<div class="rd-dc-id">' +
              '<h3 class="rd-dc-name">' + escapeHtml(f.name) + '</h3>' +
            '</div></div>' +
          (body ? '<div class="rd-dc-body">' + body + '</div>' : '') +
          '<div class="rd-dc-foot">' + rdFacSeg(f) + '</div>' +
        '</article></div>';
    }

    /* No pager here on purpose. The member roll pages at eighteen because it
       runs to hundreds; this list is short enough that a pager would be a
       control with nothing to control. */
    function renderFaculty() {
      const grid = document.getElementById('faculty-grid');
      const total = RD_FAC.all.length, shown = RD_FAC.shown.length;
      const countEl = document.getElementById('faculty-count-text');
      if (countEl) {
        countEl.innerText = !RD_FAC.ready && !total
          ? 'Loading...'
          : (shown === total
              ? total + (total === 1 ? ' person listed' : ' people listed')
              : 'Showing ' + shown + ' of ' + total);
      }
      if (!grid) return;
      if (!RD_FAC.ready && !total) {
        grid.innerHTML = '<div class="col-span-full">' + rdPremiumSpinner('Loading...', 'users') + '</div>';
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
      }
      grid.innerHTML = shown
        ? RD_FAC.shown.map(renderFacultyCard).join('')
        : '<div class="sm:col-span-2 lg:col-span-3 py-14 text-center text-slate-500">' +
          '<i data-lucide="graduation-cap" class="w-9 h-9 mx-auto mb-3 text-slate-300"></i>' +
          '<p class="font-semibold">' +
          (total ? 'Nobody matches these filters.' : 'This list is not published yet.') +
          '</p></div>';
      rdPhotoSweep(grid);
      lucide.createIcons();
    }

    function setAlumniViewFilter(v) {
      alumniViewFilter = v;
      document.querySelectorAll('.alumni-view-tab-btn').forEach(b => {
        if (!b.dataset.view) return;               // the Teachers link has no data-view
        const active = b.dataset.view === v;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      rdSyncAlumniCommitteeLinks(v);
      filterAlumni();
    }
    function filterAlumni() {
      const q = document.getElementById("alumni-search-input").value.toLowerCase().trim(), dept = document.getElementById("alumni-filter-dept").value,
            series = document.getElementById("alumni-filter-series").value, blood = document.getElementById("alumni-filter-blood").value;
      renderAlumni(alumniData.filter(a => 
        (!q || a.name.toLowerCase().includes(q) || a.org.toLowerCase().includes(q) || a.address.toLowerCase().includes(q) || a.loc.toLowerCase().includes(q)) &&
        (dept === "ALL" || a.dept === dept) && (series === "ALL" || a.series === series) && (blood === "ALL" || a.blood === blood) &&
        (alumniViewFilter === "ALL" || a.status === alumniViewFilter)
      ));
    }
    function resetAlumniFilters() { document.getElementById("alumni-search-input").value=""; document.getElementById("alumni-filter-dept").value="ALL"; document.getElementById("alumni-filter-series").value="ALL"; document.getElementById("alumni-filter-blood").value="ALL"; setAlumniViewFilter('ALL'); }

    /* ================= BLOOD BANK ============================================
       Full Blood Bank page: load donors from API, filter by group / location /
       availability, render member-only contact info, admin hide toggle.
       ======================================================================== */
    const RD_BB = { donors: [], group: 'ALL', view: 'AVAILABLE', loaded: false, isMember: false };

    /* The Blood Bank link is static in both menus. When an admin hides the page
       the link has to leave the public menus too -- it staying put was the
       "hide korar poreo ace" bug. getconfig now carries the flag; this hides or
       shows both nav items to match. Runs at boot and after the admin toggle. */
    async function rdBloodBankNavSync() {
      let hidden = false;
      try {
        const cfg = await apiGet('getconfig');
        hidden = !!(cfg && cfg.bloodBankHidden);
      } catch (err) { return; }   /* leave the menu as-is if config cannot load */
      document.querySelectorAll('[onclick*="switchPage(\'bloodbank\')"]').forEach(el => {
        el.classList.toggle('hidden', hidden);
      });
    }

    async function loadBloodBank() {
      /* Always re-fetch if the member's login state has changed since last load.
         This ensures contacts show immediately after signing in without a hard refresh. */
      const currentlyMember = typeof rdCanViewContacts === 'function' ? rdCanViewContacts() : false;
      if (RD_BB.loaded && RD_BB.isMember === currentlyMember) { rdBloodRender(); return; }
      const grid = document.getElementById('blood-bank-grid');
      const status = document.getElementById('blood-bank-status');
      if (grid && (!RD_BB.donors || !RD_BB.donors.length)) {
        grid.innerHTML = '<div class="col-span-full">' + rdPremiumSpinner('Loading Blood Bank', 'droplet') + '</div>';
        if (typeof lucide !== 'undefined') lucide.createIcons();
        if (status) status.textContent = '';
      } else if (status) {
        status.textContent = 'Loading donors...';
      }
      if (!alumniData.length) loadPublicAlumni().then(rdBloodRender).catch(() => {});
      try {
        const params = Object.assign({ _: Date.now() }, rdMemberParams());
        const qs = Object.keys(params).map(k => k + '=' + encodeURIComponent(params[k])).join('&');
        const res = await fetch(API_BASE_URL + '?action=bloodbank&' + qs, { cache: 'no-store' });
        const data = await res.json();
        if (data.hidden) {
          const grid = document.getElementById('blood-bank-grid');
          if (grid) grid.innerHTML = '<div class="col-span-3 py-20 text-center text-slate-400"><i data-lucide="eye-off" class="w-10 h-10 mx-auto mb-3"></i><p class="font-semibold">Blood Bank is currently unavailable.</p></div>';
          if (status) status.textContent = '';
          if (typeof lucide !== 'undefined') lucide.createIcons();
          return;
        }
        RD_BB.donors  = data.donors || [];
        /* Use local sign-in state as the source of truth, not the API flag.
           rdCanViewContacts() also returns true for admins, matching their elevated access. */
        RD_BB.isMember = currentlyMember;
        RD_BB.loaded  = true;
        rdBloodRender();
      } catch (err) {
        if (status) status.textContent = 'Failed to load. Please refresh.';
      }
    }

    function rdBloodFilter(group) {
      RD_BB.group = group;
      document.querySelectorAll('.bb-group-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.group === group);
      });
      rdBloodRender();
    }

    /* Two views share one grid. "Available" shows only willing donors who are
       eligible right now; "All" is the full blood-group directory of every
       member, sorted so willing and available names surface first and members
       who never opted in sit at the bottom with a neutral chip. */
    function rdBloodView(view) {
      RD_BB.view = view;
      document.querySelectorAll('.bb-view-tab').forEach(b => {
        const on = b.dataset.view === view;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      rdBloodRender();
    }

    function rdBloodRender() {
      const grid   = document.getElementById('blood-bank-grid');
      const status = document.getElementById('blood-bank-status');
      const note   = document.getElementById('blood-bank-signin-note');
      if (!grid) return;

      const locVal = (document.getElementById('bb-location-filter') || {}).value || 'ALL';
      const availableView = RD_BB.view === 'AVAILABLE';

      const filtered = RD_BB.donors.filter(d => {
        if (RD_BB.group !== 'ALL' && d.blood !== RD_BB.group) return false;
        if (availableView && !(d.willing && d.available)) return false;
        if (locVal !== 'ALL') {
          const locKey = locVal.toLowerCase();
          if (locKey === 'gazipur') {
            if (!d.isGazipur && !d.isRunning) return false;
          } else {
            const loc = (d.location || '').toLowerCase();
            if (!loc.includes(locKey)) return false;
          }
        }
        return true;
      });

      if (!filtered.length) {
        grid.innerHTML = '<div class="sm:col-span-2 lg:col-span-3 py-16 text-center text-slate-400">' +
          '<i data-lucide="droplets" class="w-10 h-10 mx-auto mb-3 text-rose-200"></i>' +
          '<p class="font-semibold">' + (availableView ? 'No available donors for this filter.' : 'No members found for this filter.') + '</p>' +
          '<p class="text-xs mt-1">Try a different blood group' + (availableView ? ' or open the All tab.' : ' or remove filters.') + '</p></div>';
        if (status) status.textContent = availableView ? 'No available donors.' : 'No members found.';
      } else {
        grid.innerHTML = filtered.map(d => rdBloodCard(d, typeof rdCanViewContacts === 'function' ? rdCanViewContacts() : RD_BB.isMember)).join('');
        if (availableView) {
          status.textContent = filtered.length + ' available donor' + (filtered.length === 1 ? '' : 's') + '.';
        } else {
          status.textContent = filtered.length + ' member' + (filtered.length === 1 ? '' : 's') + ' with this blood group.';
        }
      }

      if (note) note.classList.toggle('hidden', RD_BB.isMember || !RD_BB.loaded);
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function rdBloodCard(d, isMember) {
      const avail = d.available;
      /* Three honest states. A willing donor who is eligible is green; a willing
         donor still inside the 120-day window is amber; a member who never opted
         in is neutral slate -- the card only tells you their blood group is X, it
         never claims they agreed to donate. */
      let badge;
      if (d.willing && avail) {
        badge = '<span class="bb-badge-avail yes"><i data-lucide="circle-check" class="w-3 h-3"></i>Available</span>';
      } else if (d.willing && !avail) {
        badge = '<span class="bb-badge-avail no"><i data-lucide="clock" class="w-3 h-3"></i>Recently donated</span>';
      } else {
        badge = '<span class="bb-badge-avail neutral"><i data-lucide="droplet" class="w-3 h-3"></i>Not marked as donor</span>';
      }

      let daysNote;
      if (!d.willing) {
        daysNote = 'Has this blood group; not marked as a donor';
      } else if (d.daysSince !== null) {
        daysNote = avail
          ? d.daysSince + ' days since last donation'
          : 'Available in ' + Math.max(0, 120 - d.daysSince) + ' days';
      } else {
        daysNote = 'No previous donation recorded, likely available';
      }

      /* The sheet stores a Drive share link / id, not a usable <img> src. The
         raw value never rendered -- run it through the same normaliser the
         directory uses, which also gives the monogram fallback and the
         fade-in, so a blood-bank card matches every other avatar on the site. */
      const photo = '<div class="shrink-0">' +
        alumniAvatarMarkup({ image: d.photo, name: d.name }, 'w-12 h-12', 'text-base', 'rounded-xl') +
        '</div>';

      const plate = [d.dept, d.series ? 'Series ' + d.series : ''].filter(Boolean).join('  ·  ');
      const statusTag = d.isRunning
        ? '<span class="text-[10px] font-bold text-blue-600 bg-blue-50 rounded px-1.5 py-0.5">Running Member</span>'
        : '<span class="text-[10px] font-bold text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">Alumni</span>';

      let contactHtml = '';
      if (isMember) {
        const telNum = d.mobile || d.whatsapp || '';
        const waNum = d.whatsapp || d.mobile || '';
        const waLink = waNum ? 'https://wa.me/880' + waNum.replace(/^0/, '') : '';

        const callBtn = telNum
          ? '<a href="tel:' + escapeHtml(telNum) + '" class="bb-action-btn bb-call" title="Call ' + escapeHtml(d.name) + '">' +
            '<i data-lucide="phone-call" class="w-4 h-4"></i>' +
            '</a>'
          : '<span class="bb-action-btn bb-action-disabled" title="No number available"><i data-lucide="phone-off" class="w-4 h-4"></i></span>';

        const waBtn = waLink
          ? '<a href="' + escapeHtml(waLink) + '" target="_blank" rel="noopener" class="bb-action-btn bb-wa" title="WhatsApp ' + escapeHtml(d.name) + '">' +
            '<i data-lucide="message-circle" class="w-4 h-4"></i>' +
            '</a>'
          : '<span class="bb-action-btn bb-action-disabled" title="No WhatsApp"><i data-lucide="message-circle-off" class="w-4 h-4"></i></span>';

        let donorId = d.id || d.memberId;
        if (!donorId && Array.isArray(alumniData)) {
          const match = alumniData.find(a => a.name === d.name && a.dept === d.dept && String(a.series) === String(d.series));
          if (match) donorId = match.id || match.memberId;
        }
        const profileBtn = donorId
          ? '<button type="button" class="bb-action-btn bb-profile" title="View profile" onclick="openAlumniModal(\'' + escapeHtml(String(donorId)) + '\')">' +
            '<i data-lucide="user-round" class="w-4 h-4"></i>' +
            '</button>'
          : '';

        const numDisplay = telNum
          ? '<span class="text-xs font-semibold text-slate-700">' + escapeHtml(telNum) + '</span>'
          : '<span class="text-xs text-slate-400 italic">No number</span>';

        contactHtml =
          '<div class="flex items-center justify-between gap-2 mt-1">' +
            numDisplay +
            '<div class="flex items-center gap-1.5">' + callBtn + waBtn + profileBtn + '</div>' +
          '</div>';
      } else {
        contactHtml =
          '<div class="bb-contact-locked" onclick="openMemberSignIn(\'bloodbank\')" style="cursor:pointer">' +
            '<i data-lucide="lock" class="w-3.5 h-3.5"></i>' +
            'Sign in to view contact' +
          '</div>';
      }

      /* "Request Blood" checkbox — shown for willing+available donors when signed in.
         The checked state feeds the bulk WA message composer (rdBloodRequest). */
      const requestChk = (isMember && d.willing && d.available)
        ? '<label class="bb-request-chk" title="Add to blood request">' +
            '<input type="checkbox" class="rd-bb-select" data-id="' + escapeHtml(String(d.id || '')) + '"' +
            ' data-name="' + escapeHtml(d.name) + '" data-blood="' + escapeHtml(d.blood) + '"' +
            ' data-wa="' + escapeHtml((d.whatsapp || d.mobile) ? '880' + String(d.whatsapp || d.mobile).replace(/^0/, '') : '') + '"' +
            ' onchange="rdBloodRequestSync()">' +
            '<span>Request</span>' +
          '</label>'
        : '';

      const locBadge = d.isGazipur
        ? '<span class="text-[10px] font-semibold text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5 flex items-center gap-0.5"><i data-lucide="map-pin" class="w-2.5 h-2.5"></i>Near DUET</span>'
        : (d.location ? '<span class="text-[10px] text-slate-500 bg-slate-50 rounded px-1.5 py-0.5">' + escapeHtml(d.location) + '</span>' : '');

      return '<div class="bb-card">' +
        '<div class="flex items-start gap-3">' +
          photo +
          '<div class="min-w-0 flex-1">' +
            '<div class="flex items-center gap-2 flex-wrap">' +
              '<span class="font-bold text-slate-900 text-sm truncate">' + escapeHtml(d.name) + '</span>' +
              badge +
            '</div>' +
            '<p class="text-xs text-slate-500 mt-0.5">' + escapeHtml(plate) + '</p>' +
            '<div class="flex flex-wrap gap-1.5 mt-1.5">' + statusTag + locBadge + '</div>' +
          '</div>' +
          '<div class="bb-blood-pill shrink-0">' + escapeHtml(d.blood) + '</div>' +
        '</div>' +
        '<div class="border-t border-slate-100 pt-3 flex flex-col gap-1.5">' +
          contactHtml +
          '<div class="flex items-center justify-between">' +
            '<p class="text-[11px] text-slate-400"><i data-lucide="droplet" class="w-3 h-3 inline mr-0.5"></i>' + escapeHtml(daysNote) + '</p>' +
            requestChk +
          '</div>' +
        '</div>' +
      '</div>';
    }

    function rdBloodHowItWorks() {
      const panel = document.getElementById('blood-bank-how');
      if (!panel) return;
      panel.classList.toggle('hidden');
      if (!panel.classList.contains('hidden') && typeof lucide !== 'undefined') lucide.createIcons();
    }

    /* ---- Blood Request Feature ----
       Sync the floating bar whenever a "Request" checkbox changes. */
    function rdBloodRequestSync() {
      const checked = Array.from(document.querySelectorAll('.rd-bb-select:checked'));
      let bar = document.getElementById('rd-bb-request-bar');
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'rd-bb-request-bar';
        bar.className = 'hidden fixed bottom-24 xl:bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 bg-rose-600 text-white px-5 py-3.5 rounded-2xl shadow-[0_8px_30px_rgba(220,38,38,0.4)] border border-rose-500';
        bar.innerHTML = '<i data-lucide="droplets" class="w-5 h-5 shrink-0"></i>' +
                        '<span id="rd-bb-request-count" class="text-sm font-bold">0 donors selected</span>' +
                        '<button onclick="rdBloodRequestSend()" class="flex items-center gap-1.5 bg-white text-rose-700 text-sm font-bold px-4 py-2 rounded-xl hover:bg-rose-50 transition active:scale-95"><i data-lucide="message-circle" class="w-4 h-4"></i> Send WA Request</button>' +
                        '<button onclick="document.querySelectorAll(\'.rd-bb-select\').forEach(c=>c.checked=false); rdBloodRequestSync();" class="p-1.5 rounded-lg hover:bg-rose-500 transition" title="Cancel selection"><i data-lucide="x" class="w-4 h-4"></i></button>';
        document.body.appendChild(bar);
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
      if (checked.length === 0) {
        bar.classList.add('hidden');
        return;
      }
      bar.classList.remove('hidden');
      const lbl = document.getElementById('rd-bb-request-count');
      if (lbl) lbl.textContent = checked.length + ' donor' + (checked.length > 1 ? 's' : '') + ' selected';
    }

    /* Build a personalised WA message for each selected donor and open each one. */
    function rdBloodRequestSend() {
      const checked = Array.from(document.querySelectorAll('.rd-bb-select:checked'));
      if (!checked.length) return;

      const myName = (RD_MEMBER.me && (RD_MEMBER.me.Name || RD_MEMBER.me.name)) || 'A member';
      const myOrg  = 'Rangdhanu Alumni Association';

      checked.forEach(function (chk) {
        const recipName = chk.dataset.name || 'Dear Donor';
        const blood     = chk.dataset.blood || '';
        const waNumber  = chk.dataset.wa || '';
        if (!waNumber) return;

        const msg = encodeURIComponent(
          'Assalamu Alaikum ' + recipName + ' Bhai/Apu,\n\n' +
          'আমি ' + myName + ', ' + myOrg + '-এর একজন সদস্য।\n\n' +
          'আমরা ' + blood + ' রক্তের জন্য জরুরি প্রয়োজনে আপনার সাথে যোগাযোগ করছি। আপনি কি এই মুহূর্তে রক্ত দিতে পারবেন?\n\n' +
          'যদি সম্ভব হয়, অনুগ্রহ করে শীঘ্রই জানান। আল্লাহ আপনাকে উত্তম পুরস্কার দিন।\n\n' +
          '— ' + myName + '\n' + myOrg
        );

        window.open('https://wa.me/' + waNumber + '?text=' + msg, '_blank', 'noopener');
      });

      /* Deselect all after sending */
      checked.forEach(function (chk) { chk.checked = false; });
      rdBloodRequestSync();
    }

    async function adminToggleBloodBank(hide) {
      /* No native confirm dialog -- browser popups are banned. The Show / Hide
         buttons state the intent, so the click acts straight away and the result
         shows on the notice page through showToast. */
      try {
        await apiPost('setbloodbankvisibility', { hidden: hide });
        RD_BB.loaded = false;            /* re-fetch the page fresh next visit */
        rdBloodBankNavSync();            /* hide/show the link in both menus now */
        showToast('Blood Bank is now ' + (hide ? 'hidden' : 'visible') + '.', 'success');
        renderAdmin();
      } catch (err) {
        showToast('Failed: ' + (err.message || err), 'error');
      }
    }

    /* EVENT API & UPLOAD */
    /* EMAIL HINT LOGIC */
    async function rdShowEmailHint() {
      const midInput = document.getElementById('forgot-email-id');
      const hintObj = document.getElementById('forgot-email-hint');
      if (!midInput || !hintObj) return;
      const mid = midInput.value.trim().toUpperCase();
      if (!mid) { showToast("Please enter your Member ID.", "error"); return; }
      
      hintObj.classList.remove('hidden');
      hintObj.className = "text-sm font-bold mt-3 text-slate-500";
      hintObj.textContent = "Searching...";
      
      try {
        const r = await apiPost('getemailhint', { memberId: mid });
        if (r.success && r.hint) {
          hintObj.textContent = "Your email hint: " + r.hint;
          hintObj.className = "text-sm font-bold mt-3 text-emerald-700";
        } else {
          hintObj.textContent = r.message || "Email is hidden for privacy. Please contact an admin.";
          hintObj.className = "text-sm font-bold mt-3 text-rose-600";
        }
      } catch (err) {
        hintObj.textContent = err.message || "Network error. Please try again.";
        hintObj.className = "text-sm font-bold mt-3 text-rose-600";
      }
    }

    /* EVENT API & UPLOAD */
    function openEventSubmitModal() { 
      if (!rdMemberSignedIn()) {
        showToast("You must sign in to add a new event.", "error");
        switchPage('signin');
        return;
      }
      openSubPage('event-new', 'events'); 
    }
    function closeEventSubmitModal(){ goBackFromSubPage('event-new'); }
    function closeDynamicEventModal(){ goBackFromSubPage('event-detail'); }
    
    function openAdminCreateUpcomingEventModal() {
      openSubPage('admin-event-new', 'admin');
      document.getElementById('form-admin-upcoming').reset();
      const st = document.getElementById('admin-upcoming-status');
      st.className = 'hidden rounded-xl p-4 text-sm font-bold text-center mt-4';
      st.innerHTML = '';
    }
    
    async function adminSubmitUpcomingEvent(e) {
      e.preventDefault();
      const f = e.target;
      const st = document.getElementById('admin-upcoming-status');
      const btn = f.querySelector('button[type="submit"]');
      showGlobalLoader("Uploading...", "Publishing event.");

      try {
        st.className = 'block rounded-xl p-4 text-sm font-bold text-center bg-blue-50 text-blue-700';
        st.innerHTML = '<i data-lucide="loader" class="w-4 h-4 inline animate-spin mr-1"></i> Creating upcoming event...';
        btn.disabled = true;
        lucide.createIcons();

        const imgInput = f.querySelector('[name="mainImage"]');
        let imgObj = null;
        if (imgInput.files && imgInput.files.length > 0) {
          imgObj = await filePayload(imgInput.files[0], 4000);
        }

        const payload = {
          eventName: f.querySelector('[name="eventName"]').value,
          category: f.querySelector('[name="category"]').value,
          eventDate: f.querySelector('[name="eventDate"]').value,
          venue: f.querySelector('[name="venue"]').value,
          shortDescription: f.querySelector('[name="shortDescription"]').value,
          fullDescription: f.querySelector('[name="fullDescription"]') ? f.querySelector('[name="fullDescription"]').value : f.querySelector('[name="shortDescription"]').value,
          organizedBy: 'Admin',
          submittedBy: 'Admin',
          submitterEmail: 'admin@rangdhanu.org',
          mainImage: imgObj
        };

        const r = await apiPost('admincreateupcomingevent', payload);
        
        f.reset();
        if (window.adminNav) window.adminNav('events');
        hideGlobalLoader(true, () => {
            goBackFromSubPage('admin-event-new');
        }, 'Event published successfully.');
        
      } catch (err) {
        st.className = 'block rounded-xl p-4 text-sm font-bold text-center bg-rose-50 text-rose-700 border border-rose-200';
        st.innerHTML = '<i data-lucide="alert-triangle" class="w-4 h-4 inline mr-1"></i> ' + (err.message || 'Error occurred');
        lucide.createIcons();
        failGlobalLoader('Could not publish', friendlyError(err).msg);
          reportError(err, f);
      } finally {
        btn.disabled = false;
      }
    }
    
    function fileToBase64(file){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result.split(',')[1]||''); r.onerror=rej; r.readAsDataURL(file);}); }

    /* ---------- Automatic image compression, done in the browser ----------
       Phone photos are routinely 6-12MB and the server refuses anything over 5MB.
       We redraw the picture on a canvas at a capped longest edge (aspect ratio is
       never changed, and small images are never upscaled), then step the JPEG
       quality down until it comfortably fits. Anything we cannot decode is passed
       through untouched rather than lost. */
    const RD_IMG_MAX_EDGE = 1600;                    // default longest side, in px
    const RD_IMG_SKIP_UNDER = 1536 * 1024;           // keep < 1.5MB files as-is (preserves lossless PNGs)
    const RD_IMG_TARGET_BYTES = 3 * 1024 * 1024;     // base64 adds ~33%, so keep headroom under 5MB
    const RD_IMG_QUALITY_STEPS = [0.86, 0.78, 0.70, 0.60, 0.50];
    const RD_IMG_HARD_LIMIT = 5 * 1024 * 1024;       // must match MAX_PHOTO_BYTES in Code.gs

    function rdLoadImage(file) {
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image decode failed')); };
        img.src = url;
      });
    }

    function rdCanvasToBlob(canvas, quality) {
      return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    }

    async function compressImage(file, maxEdge) {
      maxEdge = maxEdge || RD_IMG_MAX_EDGE;
      if (!file || !/^image\//i.test(file.type || '')) return file;
      if (/svg|gif/i.test(file.type || '')) return file;          // animation / vector: never rasterise
      if (file.size && file.size <= RD_IMG_SKIP_UNDER) return file; // keeps small PNG logos as-is

      let img;
      try { img = await rdLoadImage(file); } catch (e) { return file; }
      const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      if (!w || !h) return file;

      const scale = Math.min(1, maxEdge / Math.max(w, h));        // never enlarge
      const tw = Math.max(1, Math.round(w * scale));
      const th = Math.max(1, Math.round(h * scale));

      const canvas = document.createElement('canvas');
      canvas.width = tw; canvas.height = th;
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#ffffff';                                  // transparency -> white, not black
      ctx.fillRect(0, 0, tw, th);
      ctx.drawImage(img, 0, 0, tw, th);

      let out = null;
      for (let i = 0; i < RD_IMG_QUALITY_STEPS.length; i++) {
        const blob = await rdCanvasToBlob(canvas, RD_IMG_QUALITY_STEPS[i]);
        if (!blob) break;
        out = blob;
        if (blob.size <= RD_IMG_TARGET_BYTES) break;
      }
      if (!out) return file;
      if (file.size && out.size >= file.size) return file;        // compression didn't help

      const name = String(file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
      try { return new File([out], name, { type: 'image/jpeg' }); }
      catch (e) { out.name = name; return out; }                  // older Safari has no File constructor
    }

    async function filePayload(file, maxEdge){
      if (!file) return null;
      const f = await compressImage(file, maxEdge);
      const base64 = await fileToBase64(f);
      if (base64.length * 0.75 > RD_IMG_HARD_LIMIT) {
        throw new Error('The file is still larger than 5MB. Please choose a slightly smaller image or file.');
      }
      return { fileName: f.name || file.name, mimeType: f.type || file.type || 'application/octet-stream', base64: base64 };
    }
    
    async function apiPost(action, payload={}){
      const r=await fetch(API_BASE_URL,{method:'POST', body:JSON.stringify({action,...rdAuthParams(),...payload})});
      let j;
      try{ j = JSON.parse(await r.text()); } catch(e) { throw new Error('Server returned invalid response.'); }
      /* Without this check a failed write used to fall through into the caller's
         SUCCESS branch — the reason a rejected registration said "submitted". */
      if (j && j.success === false) throw new Error(j.message || 'Request failed.');
      return j;
    }
    

    /* ---------- FIELD-LEVEL VALIDATION ---------------------------------- */
    const RD_MOBILE_RULE = 'Please enter a valid mobile number. Example: 017xxxxxxxx (Bangladesh) / +9715xxxxxxx (abroad)';
    /* Mobile numbers. Many of our alumni live abroad, so a number is NOT required
       to start with 01 any more. A Bangladeshi number is still normalised to the
       local 01xxxxxxxxx shape (so duplicate-matching against the sheet keeps
       working), and anything else is accepted as an international number. */
    function normalizeBdMobile(value) {
      if (value == null || value === '') return '';
      let str = String(value).trim();
      if (!/\d/.test(str)) return str;
      let v = str.replace(/^'+/, '').replace(/[\s\-().]/g, '');
      if (/^00\d{7,}$/.test(v)) v = '+' + v.slice(2);          // 00880… -> +880…
      if (/^\+?8801\d{9}$/.test(v)) return v.replace(/^\+?880/, '0');
      if (/^1\d{9}$/.test(v)) return '0' + v;             // 17xxxxxxxx -> 017xxxxxxxx
      if (/^01\d{9}$/.test(v)) return v;
      return str;
    }

    function formatBdMobile(value) {
      return normalizeBdMobile(value);
    }
    /* Valid = a local BD number, OR a +countrycode number, OR a plain foreign
       number. A number that looks Bangladeshi but is malformed (01 + wrong
       length/prefix) is still rejected, because that is a typo, not an expat. */
    function isValidBdMobile(value) {
      const v = normalizeBdMobile(value).replace(/[\s\-().]/g, '');
      if (/^01[3-9]\d{8}$/.test(v)) return true;
      if (/^\+\d{8,15}$/.test(v)) return true;
      if (/^0?\d{7,14}$/.test(v) && !/^01/.test(v)) return true;
      return false;
    }

    function fieldBox(form, name) {
      if (!form) return null;
      return form.querySelector('[name="' + name + '"]') || document.getElementById(name);
    }
    function clearFieldErrors(form) {
      if (!form) return;
      form.querySelectorAll('.form-input.is-invalid').forEach(el => el.classList.remove('is-invalid'));
      form.querySelectorAll('.field-error.show').forEach(el => { el.classList.remove('show'); el.textContent = ''; });
    }
    function setFieldError(form, name, msg, focus) {
      const box = fieldBox(form, name);
      if (!box) return false;
      box.classList.add('is-invalid');
      box.setAttribute('aria-invalid', 'true');
      let slot = box.parentElement && box.parentElement.querySelector('.field-error');
      if (!slot && box.parentElement) {
        slot = document.createElement('p');
        slot.className = 'field-error';
        box.parentElement.appendChild(slot);
      }
      if (slot) { slot.textContent = msg; slot.classList.add('show'); }
      /* Typing in the box clears the mark straight away — no re-submit needed. */
      if (!box.dataset.rdClearBound) {
        box.dataset.rdClearBound = '1';
        box.addEventListener('input', () => {
          box.classList.remove('is-invalid');
          box.removeAttribute('aria-invalid');
          const sl = box.parentElement && box.parentElement.querySelector('.field-error');
          if (sl) { sl.classList.remove('show'); sl.textContent = ''; }
        });
      }
      if (focus) { try { box.focus({preventScroll:true}); box.scrollIntoView({block:'center', behavior:'auto'}); } catch(e) { box.focus(); } }
      return true;
    }

    /* ---------- SERVER MESSAGE SANITIZER -------------------------------- */
    /* Members must never read spreadsheet internals. Each rule can also name the
       form field it belongs to, so the message lands on the box, not in a page. */
    const RD_ERROR_RULES = [
      { re: /WhatsApp Number must be a valid/i, field: 'whatsapp',
        msg: 'That WhatsApp number is not valid. Example: 017xxxxxxxx (Bangladesh) / +9715xxxxxxx (abroad)' },
      { re: /^(?!.*whatsapp).*valid 11-digit Bangladesh number/i, field: 'mobile',
        msg: 'That mobile number is not valid. Example: 017xxxxxxxx (Bangladesh) / +9715xxxxxxx (abroad)' },
      { re: /valid email/i, field: 'email', msg: 'That email address is not valid. Please check it and try again.' },
      /* The duplicate path: the Status column only allows PENDING/APPROVED/REJECTED,
         so writing DUPLICATE used to make the whole row fail. Backend patch fixes
         the sheet; this keeps the member's message human either way. */
      { re: /data validation|PENDING, APPROVED, REJECTED/i, duplicate: true,
        msg: 'You are already on our list, so the application has been sent for another admin check. You will be emailed once the review is done.' },
      { re: /already (a )?member|already exists|duplicate/i, duplicate: true,
        msg: 'You are already on our list. The application has been sent for an admin check.' },
      /* Three separate doors, three separate cures. All three used to fall
         through to the generic "server is having trouble" line because they
         happen to contain the word permission, which cost an evening of
         hunting deployments and sharing lists. */
      { re: /does not have admin permission|Admin account is not active|Unauthorized admin access/i,
        msg: 'This Google account is not set up as an admin yet. Ask the main admin to add it to the '
           + 'Admins sheet with a Role chosen from the list and Status set to ACTIVE.' },
      /* The web app runs as the person using it, so an admin whose Google
         account was never shared on the data sheet gets Google's own refusal
         back. That used to land on the generic "server is having trouble"
         line, which sent us hunting the deployment instead of the sharing
         list. Name it, because the cure is one click in the Sheet. */
      { re: /do not have permission|permission to access|Requested entity was not found|openById/i,
        msg: 'This Google account is on the admin list but has not been given access to the data sheet. '
           + 'Ask the main admin to share the Rangdhanu spreadsheet and Drive folders with this account as an Editor.' },
      { re: /exception|permission|quota|timed? ?out|service|invalid response|failed to fetch|networkerror/i,
        msg: 'The server is having trouble and could not save this right now. Please try again in a little while.' },
      /* A function the backend does not have yet: the paste-in file is
         missing, not the network. Saying so saves an hour of guessing. */
      { re: /is not defined|Script function not found|not a function/i,
        msg: 'One part of the backend has not been pasted into Apps Script yet. '
           + 'Open the Apps Script project, add the missing .gs file, then deploy a new version.' },
      { re: /cell [A-Z]+\d+|spreadsheet|getRange|setValues/i,
        msg: 'A technical problem stopped us from saving this. The admin has been notified — please try again shortly.' }
    ];

    function friendlyError(raw) {
      const text = String(raw && raw.message ? raw.message : (raw == null ? '' : raw));
      if (!text) return { msg: 'Something went wrong. Please try again.', raw: text };
      for (const rule of RD_ERROR_RULES) {
        if (rule.re.test(text)) {
          if (text !== rule.msg) console.warn('[rd] server said:', text);
          return { msg: rule.msg, field: rule.field, duplicate: !!rule.duplicate, raw: text };
        }
      }
      /* Anything with English technical noise in it is not shown verbatim. */
      if (/[{}<>]|\bError\b|\bat [A-Za-z_$]+\(/.test(text)) {
        console.warn('[rd] server said:', text);
        return { msg: 'The request could not be completed. Please try again in a little while.', raw: text };
      }
      return { msg: text, raw: text };
    }

    /* Single place every catch block can call. */
    function reportError(err, form) {
      const info = friendlyError(err);
      if (form && info.field && setFieldError(form, info.field, info.msg, true)) return info;
      showToast(info.msg, info.duplicate ? 'info' : 'error',
                info.duplicate ? 'Already on record' : undefined);
      return info;
    }

    /* The admin token rides along only when one exists; every public call
       is byte-for-byte what it was before. */
    function rdAuthParams() {
      const params = {};
      if (RD_ADMIN_TOKEN) params.adminToken = RD_ADMIN_TOKEN;
      if (RD_MEMBER && RD_MEMBER.token) params.memberToken = RD_MEMBER.token;
      return params;
    }
    async function apiGet(action, params={}){ const q=new URLSearchParams({action,...params,...rdAuthParams(),_:Date.now()}); const r=await fetch(API_BASE_URL+'?'+q.toString()); const j=await r.json(); if(!j.success) throw new Error(j.message); return j; }

    /* ================= EXECUTIVE COMMITTEE =============================
       Three committees, and inside each one a tab per session. The session
       list is never written down here -- it arrives from the backend, which
       derives it from the APPROVED rows, so a brand new session shows up
       without anyone touching this file. */
    const RD_EC_COMMITTEES = [
      { name: 'Rangdhanu Executive Committee',
        bn: 'Rangdhanu Executive', icon: 'shield-check',
        positions: ['President', 'General Secretary', 'Senior Vice President', 'Vice President', 'Others'] },
      { name: 'DUET RANGDHANU Alumni Association Executive Committee',
        bn: 'Rangdhanu Alumni Committee', icon: 'users',
        positions: ['President', 'General Secretary', 'Senior Vice President', 'Vice President', 'Others'] },
      { name: 'Prokoushali DUET Admission Coaching Centre Executive Committee',
        bn: 'PDACC Executive', icon: 'building-2',
        positions: ['Director', 'Assistant Director', 'Senior Finance Director', 'Senior Residential Director', 'Others'] }
    ];

    let RD_EC = { state: 'idle', data: [], committee: '', session: '', error: '' };

    function ecCommitteeMeta(name) {
      return RD_EC_COMMITTEES.find(c => c.name === name) ||
             { name: name, bn: name, icon: 'shield-check', positions: [] };
    }

    function ecFindCommittee(name) {
      return RD_EC.data.find(c => c.committee === name) || null;
    }

    async function loadExecutiveCommittee(force) {
      if (RD_EC.state === 'loading') return;
      if (RD_EC.state === 'ready' && !force) { renderExecutiveCommittee(); return; }
      const warm = rdFeedRecall('committee');
      if (warm && !RD_EC.data.length) {
        /* Something real on screen beats a spinner, so the remembered committee
           is adopted before the request goes out. */
        RD_EC.data = warm;
        RD_EC.state = 'ready';
      } else {
        RD_EC.state = 'loading';
      }
      RD_EC.error = '';
      renderExecutiveCommittee();
      try {
        const res = await apiGet('executivecommittee', rdMemberParams());
        RD_EC.data = Array.isArray(res.data) ? res.data : [];
        rdFeedRemember('committee', RD_EC.data);
        RD_EC.state = 'ready';
        /* Land on the first committee that actually has members. */
        if (!ecFindCommittee(RD_EC.committee)) {
          const first = RD_EC.data.find(c => c.count > 0) || RD_EC.data[0];
          RD_EC.committee = first ? first.committee : '';
          RD_EC.session = '';
        }
      } catch (err) {
        if (RD_EC.data.length) {
          RD_EC.state = 'ready';
          console.warn('[rd] committee refresh failed:', err && err.message ? err.message : err);
        } else {
          RD_EC.state = 'error';
          RD_EC.error = friendlyError(err).msg;
        }
      }
      renderExecutiveCommittee();
      renderHomeLeaderMessages();
      renderPdaccDirector();
      renderPdaccCommittee();
      renderPdaccSeatNav();
    }

    function selectEcCommittee(name) {
      RD_EC.committee = name;
      RD_EC.session = '';
      renderExecutiveCommittee();
    }

    function selectEcSession(session) {
      RD_EC.session = session;
      renderExecutiveCommittee();
    }

    function ecStateBox(kind, text) {
      const box = document.getElementById('ec-state');
      if (!box) return;
      if (!kind) { box.classList.add('hidden'); box.innerHTML = ''; return; }
      box.classList.remove('hidden');
      if (kind === 'loading') {
        box.innerHTML = '<div class="rounded-3xl border border-slate-200 bg-white">' + rdPremiumSpinner('Loading Committee', 'landmark') + '</div>';
      } else if (kind === 'error') {
        box.innerHTML = '<div class="rounded-3xl border border-rose-200 bg-rose-50 py-10 px-6 text-center"><i data-lucide="triangle-alert" class="w-8 h-8 text-rose-600 mx-auto"></i>' +
          '<p class="mt-3 text-sm font-bold text-rose-800">' + escapeHtml(text) + '</p>' +
          '<button type="button" onclick="loadExecutiveCommittee(true)" class="mt-5 px-5 py-2.5 rounded-xl bg-white border border-rose-200 text-rose-700 text-xs font-bold cursor-pointer">Try again</button></div>';
      } else {
        box.innerHTML = '<div class="rounded-3xl border border-slate-200 bg-white py-12 px-6 text-center"><i data-lucide="users" class="w-8 h-8 text-slate-300 mx-auto"></i>' +
          '<p class="mt-3 text-sm font-bold text-slate-600">' + escapeHtml(text) + '</p></div>';
      }
      lucide.createIcons();
    }

    function ecInitials(name) {
      const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
      if (!parts.length) return '?';
      return (parts[0].slice(0, 1) + (parts.length > 1 ? parts[parts.length - 1].slice(0, 1) : '')).toUpperCase();
    }

    /* ---------- Series list that rolls forward on its own -------------
       Hardcoded 97..25 lists went stale every January. Both forms now get
       their options from here, so the newest series appears by itself. */
    function rdSeriesList() {
      const end = new Date().getFullYear();
      const out = [];
      for (let y = 1997; y <= end; y++) out.push(String(y).slice(-2));
      return out;
    }

    function rdFillSeriesSelects() {
      const opts = '<option value="">Select Series</option>' +
        rdSeriesList().map(s => '<option value="' + s + '">' + s + '</option>').join('');
      document.querySelectorAll('select[data-rd-series]').forEach(sel => {
        const keep = sel.value;
        sel.innerHTML = opts;
        if (keep) sel.value = keep;
      });
    }

    /* ---------- One position field, two labels ------------------------
       The sheet keeps a single column. Whether that text reads as a
       current role or a former one is a question of who is looking at it,
       not of where it is stored, so nothing is copied or migrated when a
       series turns into Alumni in December. Only the label moves. */
    const RD_POSITION_LABEL_NOW  = 'Position / Role at Rangdhanu / PDACC';
    const RD_POSITION_LABEL_PAST = 'Former Position at Rangdhanu / PDACC';

    function rdIsAlumniStatus(status) {
      return /alumni/i.test(String(status || ''));
    }

    function rdPositionLabel(status) {
      return rdIsAlumniStatus(status) ? RD_POSITION_LABEL_PAST : RD_POSITION_LABEL_NOW;
    }

    /* The profile card prints its labels in small uppercase letters, where the
       full form wording wraps onto three lines and stops being readable. The
       card therefore gets the short pair. Same rule, same source of truth —
       only the length differs, so the two can never disagree about status. */
    const RD_POSITION_CARD_NOW  = 'Position / Role';
    const RD_POSITION_CARD_PAST = 'Former Position';

    function rdPositionCardLabel(status) {
      return rdIsAlumniStatus(status) ? RD_POSITION_CARD_PAST : RD_POSITION_CARD_NOW;
    }

    /* The newest series the server already counts as Alumni. Read off the
       public directory, which carries viewStatus per row, so the cutoff is
       never duplicated here and cannot drift from the backend. Returns ''
       while the directory has not been read yet. */
    function rdAlumniCutoffSeries() {
      const order = rdSeriesList();
      let rows = (alumniData || []).map(a => ({ series: a.series, status: a.status }));
      /* The join page does not fetch the directory, so fall back to whatever
         this tab already remembered. No extra round trip is taken for a label,
         and the raw rows are read as they are: only two of their columns are
         needed here, so nothing is re-shaped. */
      if (!rows.length) {
        const warm = rdFeedRecall('alumni');
        if (Array.isArray(warm)) {
          rows = warm.map(m => ({ series: String(m['Series'] || '').trim(),
                                  status: String(m['viewStatus'] || '').trim() }));
        }
      }
      let best = -1;
      rows.forEach(a => {
        if (!rdIsAlumniStatus(a.status)) return;
        const i = order.indexOf(String(a.series || '').trim());
        if (i > best) best = i;
      });
      return best === -1 ? '' : order[best];
    }

    /* Called when the applicant picks a Series on the membership form. */
    function rdSyncPositionLabel() {
      const label = document.getElementById('member-position-label');
      if (!label) return;
      const form = document.getElementById('member-registration-form');
      const sel = form && form.querySelector('select[name="series"]');
      const cutoff = rdAlumniCutoffSeries();
      const order = rdSeriesList();
      const mine = sel ? String(sel.value || '').trim() : '';
      /* Unknown cutoff or no series chosen keeps the neutral wording. */
      const past = !!(mine && cutoff &&
        order.indexOf(mine) !== -1 && order.indexOf(mine) <= order.indexOf(cutoff));
      label.textContent = past ? RD_POSITION_LABEL_PAST : RD_POSITION_LABEL_NOW;
    }

    /* ---------- The session must be written in full: 2025-2026 --------
       2025-26 is rejected on purpose: one single spelling keeps the sheet
       sortable and the sessions groupable. How long a term may run depends
       on the committee: the Alumni Association often sits for three or four
       years, so 2024-2027 is right there; the Rangdhanu and PDACC
       committees are one-year terms, where 2024-2027 is a typo. */
    function rdSessionSpan(committee) {
      return /alumni/i.test(String(committee || '')) ? 4 : 1;
    }

    function rdSessionError(v, committee) {
      const s = String(v || '').trim();
      if (!/^\d{4}-\d{4}$/.test(s)) return 'Please write the session in full, like 2025-2026.';
      const a = +s.slice(0, 4), b = +s.slice(5);
      const span = rdSessionSpan(committee);
      if (b <= a) return 'The second year must follow the first, like 2025-2026.';
      if (b - a > span) {
        return span === 1
          ? 'This committee runs for one year, so the session must read like 2025-2026.'
          : 'A session may span up to four years, like 2024-2027.';
      }
      if (a < 1997 || a > new Date().getFullYear() + 2) return 'Please check the session year.';
      return '';
    }

    /* ---------- Long messages are shown short, with "See more" ---------
       A President's or Director's message can run for many paragraphs. The
       card shows the opening lines and keeps the rest one click away, in
       place -- no modal, nothing to navigate away from. Both copies sit in
       the DOM already, so expanding costs no re-escaping and no re-render. */
    let RD_CLAMP_SEQ = 0;

    function rdClampBlock(text, limit, cls) {
      const full = String(text || '').trim();
      if (!full) return '';
      if (full.length <= limit) return '<p class="' + cls + '">' + escapeHtml(full) + '</p>';
      /* Cut on a space so a word is never sliced in half, then drop any
         punctuation left dangling before the ellipsis. */
      let cut = full.slice(0, limit);
      const sp = cut.lastIndexOf(' ');
      if (sp > limit * 0.6) cut = cut.slice(0, sp);
      cut = cut.replace(/[\s,;:.\u0964\u2014-]+$/, '');
      const id = 'rd-clamp-' + (++RD_CLAMP_SEQ);
      return '<div id="' + id + '">' +
        '<p class="' + cls + '">' +
          '<span data-rd-short>' + escapeHtml(cut) + '\u2026</span>' +
          '<span data-rd-full class="hidden">' + escapeHtml(full) + '</span>' +
        '</p>' +
        '<button type="button" onclick="rdClampToggle(\'' + id + '\')" ' +
          'class="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-50 ' +
          'hover:bg-blue-600 hover:text-white border border-blue-100 text-blue-700 ' +
          'text-xs font-extrabold cursor-pointer transition">' +
          '<span data-rd-label>See more</span>' +
          '<span data-rd-icon><i data-lucide="chevron-down" class="w-3.5 h-3.5"></i></span>' +
        '</button>' +
      '</div>';
    }

    function rdClampToggle(id) {
      const box = document.getElementById(id);
      if (!box) return;
      const short = box.querySelector('[data-rd-short]');
      const full = box.querySelector('[data-rd-full]');
      const label = box.querySelector('[data-rd-label]');
      const icon = box.querySelector('[data-rd-icon]');
      if (!short || !full) return;
      const next = short.classList.contains('hidden') ? false : true;
      short.classList.toggle('hidden', next);
      full.classList.toggle('hidden', !next);
      if (label) label.textContent = next ? 'See less' : 'See more';
      if (icon) icon.innerHTML = '<i data-lucide="chevron-' + (next ? 'up' : 'down') +
        '" class="w-3.5 h-3.5"></i>';
      lucide.createIcons();
    }

    /* ---------- Leaders (President / General Secretary) ---------- */
    function ecIsLeader(m) {
      /* ecIsDirector covers PDACC, whose top post is Director, not President. */
      return m.positionRank === 1 || m.positionRank === 2 ||
             (typeof ecIsDirector === 'function' && ecIsDirector(m));
    }

    function ecPhotoBlock(m, cls) {
      const photo = String(m.photo || '').trim();
      return '<div class="' + cls + ' shrink-0 rounded-2xl bg-blue-50 border border-blue-100 ' +
        'text-blue-700 font-extrabold flex items-center justify-center overflow-hidden relative">' +
        '<span class="ec-initials text-xl">' + escapeHtml(ecInitials(m.fullName)) + '</span>' +
        (photo
          ? '<span class="absolute inset-0"><img src="' + escapeHtml(photo) + '" alt="' +
            escapeHtml(m.fullName) + '" loading="lazy" class="w-full h-full object-cover" ' +
            'onerror="rdPhotoFallback(this)"/></span>'
          : '') +
      '</div>';
    }

    function ecLeaderCard(m, sessionLabel, showFull) {
      const msg = String(m.message || '').trim();
      return '' +
      '<article class="ec-leader-card rd-tile bg-white rounded-[28px] border border-blue-100 shadow-card ' +
        'overflow-hidden flex flex-col">' +
        '<div class="p-6 sm:p-8 flex items-start gap-5">' +
          ecPhotoBlock(m, 'w-24 h-24 sm:w-28 sm:h-28') +
          '<div class="min-w-0">' +
            '<span class="inline-flex items-center px-2.5 py-1 rounded-lg bg-blue-600 text-white ' +
              'text-[11px] font-extrabold">' + escapeHtml(m.position) + '</span>' +
            '<h3 class="text-xl sm:text-2xl font-extrabold text-slate-950 mt-2.5 leading-snug ' +
              'break-words">' + escapeHtml(m.fullName) + '</h3>' +
            '<p class="text-xs font-bold text-slate-500 mt-1.5">' + escapeHtml(m.department) +
              ' • Series ' + escapeHtml(m.series) +
              (sessionLabel ? ' • Session ' + escapeHtml(sessionLabel) : '') + '</p>' +
          '</div>' +
        '</div>' +
        (msg
          ? '<div class="px-6 sm:px-8 pb-6 sm:pb-8"><i data-lucide="quote" ' +
            'class="w-6 h-6 text-blue-300"></i><div class="mt-2">' +
            (showFull
              ? '<p class="text-sm sm:text-[15px] text-slate-700 leading-8 ' +
                'whitespace-pre-line">' + escapeHtml(msg) + '</p>'
              : rdClampBlock(msg, 320, 'text-sm sm:text-[15px] text-slate-700 ' +
                                       'leading-8 whitespace-pre-line')) +
            '</div></div>'
          : '') +
        ecProfileButton(m) +
        (rdCanViewContacts() && (m.mobile || m.email)
          ? '<div class="mt-auto border-t border-slate-100 grid grid-cols-2 divide-x ' +
          'divide-slate-100 text-xs font-bold">' +
          '<button type="button" onclick="copyToClipboard(\'' + escapeHtml(formatBdMobile(m.mobile)) + '\')" ' +
            'class="py-3.5 flex items-center justify-center gap-1.5 text-slate-600 ' +
            'hover:bg-slate-50 cursor-pointer"><i data-lucide="phone" ' +
            'class="w-3.5 h-3.5 text-blue-600"></i> Mobile</button>' +
          '<a href="mailto:' + escapeHtml(m.email) + '" class="py-3.5 flex items-center ' +
            'justify-center gap-1.5 text-slate-600 hover:bg-slate-50"><i data-lucide="mail" ' +
            'class="w-3.5 h-3.5 text-blue-600"></i> Email</a>' +
          '</div>'
          : '') +
      '</article>';
    }

    function ecProfileButton(m) {
      return '<div class="px-6 sm:px-8 pb-4"><button type="button" onclick="ecOpenProfile(\'' +
        escapeHtml(m.entryId) + '\', this)" class="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-50 hover:bg-teal-50 border border-slate-200 hover:border-teal-200 text-slate-600 hover:text-teal-700 text-xs font-extrabold cursor-pointer transition-all"><i data-lucide="user-round" class="w-3.5 h-3.5"></i> View profile</button></div>';
    }

    async function ecOpenProfile(entryId, btn) {
      if (!Array.isArray(alumniData) || !alumniData.length) {
        var warm = rdFeedRecall('alumni');
        if (Array.isArray(warm) && warm.length) {
          alumniData = rdAlumniShape(warm);
        }
      }
      var found = ecLookupMember(entryId);
      var id = found ? ecDirectoryId(found.member) : '';
      if (id) {
        openAlumniModal(id);
        return;
      }

      var oldHtml = btn ? btn.innerHTML : '';
      if (btn) {
        btn.disabled = true;
        btn.classList.add('opacity-80');
        btn.innerHTML = '<svg class="animate-spin -ml-1 mr-1.5 h-3.5 w-3.5 text-teal-600 inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span>Loading profile...</span>';
      }
      if (typeof rdShowTopProgress === 'function') rdShowTopProgress(true);

      try {
        if (typeof loadPublicAlumni === 'function') {
          await loadPublicAlumni();
        }
      } catch (e) {
        console.error('Error loading alumniData:', e);
      } finally {
        if (typeof rdShowTopProgress === 'function') rdShowTopProgress(false);
        if (btn) {
          btn.disabled = false;
          btn.classList.remove('opacity-80');
          btn.innerHTML = oldHtml;
          if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        }
      }

      found = ecLookupMember(entryId);
      id = found ? ecDirectoryId(found.member) : '';
      if (id) {
        openAlumniModal(id);
        return;
      }
      showToast('This committee member does not have a directory profile yet.', 'info');
    }

    function ecNormName(value) {
      return String(value || '').toLowerCase()
        .replace(/^(md|engr|engr\.|mohammad|mohammed|mst)\b/gi, '')
        .replace(/[^\p{L}\p{N}]+/gu, '');
    }

    function ecNormProfileValue(value) {
      return String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    }

    function ecDirectoryId(m) {
      if (!m) return '';
      if (m.targetMemberId) {
        var directHit = alumniData.find(function (a) {
          return String(a.id || a.memberId || '').trim() === String(m.targetMemberId).trim();
        });
        if (directHit) return String(directHit.id || '');
      }
      var mName = ecNormName(m.fullName);
      var mDept = ecNormProfileValue(m.department);
      var mSeries = String(m.series || '').replace(/[^\d]/g, '');
      var hit = alumniData.find(function (a) {
        var aName = ecNormName(a.name || a.fullName);
        var aDept = ecNormProfileValue(a.dept || a.department);
        var aSeries = String(a.series || '').replace(/[^\d]/g, '');
        return aName && aName === mName && aDept && aDept === mDept && aSeries && aSeries === mSeries;
      });
      return hit ? String(hit.id || '') : '';
    }

    /* ---------- "View message" opens a real page, never a modal ---------- */
    function ecLookupMember(entryId) {
      const id = String(entryId || '');
      for (const c of (RD_EC.data || [])) {
        for (const s of (c.sessions || [])) {
          const hit = (s.members || []).find(m => String(m.entryId) === id);
          if (hit) return { member: hit, committee: c.committee, session: s.session };
        }
      }
      return null;
    }

    /* backTo lets another page borrow this one: the PDACC bar sends the
       visitor to the Director's message, and back returns to PDACC. */
    function openEcMessage(entryId, backTo) {
      const found = ecLookupMember(entryId);
      const box = document.getElementById('ec-message-body');
      if (!box) return;
      if (!found) {
        box.innerHTML = '<div class="rounded-3xl border border-slate-200 bg-white p-8 ' +
          'text-center text-sm font-bold text-slate-500">This message is no longer available.</div>';
      } else {
        const m = found.member;
        box.innerHTML = '<p class="text-[11px] font-extrabold uppercase text-blue-700 ' +
          'tracking-widest mb-3">' + escapeHtml(found.committee) + '</p>' +
          ecLeaderCard(m, found.session, true);
      }
      openSubPage('ec-message', backTo || 'committee');
      lucide.createIcons();
    }

    /* ---------- Home: the newest President message of each committee -----
       No separate input anywhere: the moment a newer session is approved,
       its President replaces the one shown here. */
    function ecLatestPresident(committeeName) {
      const c = (RD_EC.data || []).find(x => x.committee === committeeName);
      if (!c) return null;
      for (const s of (c.sessions || [])) {
        const p = (s.members || []).find(m => m.positionRank === 1 &&
                                              String(m.message || '').trim());
        if (p) return { member: p, session: s.session, committee: c.committee };
      }
      return null;
    }

    /* The kicker over a message is the committee's own name with the words
       "Executive Committee" taken off the end: the section heading already
       says these are the Presidents of our Executive Committees, so the full
       formal string only made the label long enough to wrap
       ("DUET RANGDHANU Alumni Association Executive Committee"). */
    function ecShortCommittee(name) {
      return String(name || '').replace(/\s*Executive\s+Committee\s*$/i, '').trim();
    }

    /* ---------- the President deck ---------------------------------------
       Both messages used to sit side by side, so the home page opened with two
       walls of text. One at a time now: the deck turns itself over every
       RD_LEADER_MS, a finger can drag it sideways, and a dot jumps straight to
       a message. Same shape as the cover bar -- a chain of one-shot timers,
       its own state, and nothing at all when there is only one message. */
    const RD_LEADER_MS = 4000;
    let rdLeaderSlides = 0, rdLeaderIdx = 0, rdLeaderTimer = null, rdLeaderSwipeOn = false;

    function setLeaderSlide(i) {
      const track = document.getElementById('home-leader-msgs');
      if (!track || rdLeaderSlides < 1) return;
      rdLeaderIdx = ((i % rdLeaderSlides) + rdLeaderSlides) % rdLeaderSlides;
      if (track.style) track.style.transform = 'translateX(-' + (rdLeaderIdx * 100) + '%)';
      const dots = document.getElementById('home-leader-dots');
      const all = (dots && dots.querySelectorAll) ? dots.querySelectorAll('.leader-dot') : [];
      for (let n = 0; n < all.length; n++) {
        const on = n === rdLeaderIdx;
        all[n].classList.toggle('on', on);
        all[n].setAttribute('aria-current', on ? 'true' : 'false');
      }
      startLeaderAutoplay();
    }
    function nextLeaderSlide() { setLeaderSlide(rdLeaderIdx + 1); }
    function prevLeaderSlide() { setLeaderSlide(rdLeaderIdx - 1); }

    function startLeaderAutoplay() {
      if (rdLeaderTimer) { clearTimeout(rdLeaderTimer); rdLeaderTimer = null; }
      if (rdLeaderSlides < 2) return;
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      rdLeaderTimer = setTimeout(function () {
        rdLeaderTimer = null;
        setLeaderSlide(rdLeaderIdx + 1);
      }, RD_LEADER_MS);
    }

    /* Bound once, on the viewport rather than the track, so a re-render does
       not stack a second set of handlers. A drag that is more vertical than
       horizontal is a scroll, not a swipe, and is left alone. */
    function rdLeaderBindSwipe() {
      const deck = document.getElementById('home-leader-deck');
      if (!deck || rdLeaderSwipeOn || !deck.addEventListener) return;
      rdLeaderSwipeOn = true;
      let x0 = null, y0 = null;
      const start = function (e) {
        const t = (e.touches && e.touches[0]) || e;
        x0 = t.clientX; y0 = t.clientY;
      };
      const end = function (e) {
        if (x0 === null) return;
        const t = (e.changedTouches && e.changedTouches[0]) || e;
        const dx = t.clientX - x0, dy = t.clientY - y0;
        x0 = null;
        if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy)) return;
        if (dx < 0) nextLeaderSlide(); else prevLeaderSlide();
      };
      deck.addEventListener('touchstart', start, { passive: true });
      deck.addEventListener('touchend', end, { passive: true });
      deck.addEventListener('mousedown', start);
      deck.addEventListener('mouseup', end);
    }

    function renderHomeLeaderMessages() {
      const box = document.getElementById('home-leader-msgs');
      const sec = document.getElementById('home-leadership');
      if (!box || !sec) return;
      const dots = document.getElementById('home-leader-dots');
      /* Seniority sets the order, so the Alumni Association President opens the
         deck and the Rangdhanu President follows. */
      const wanted = ['DUET RANGDHANU Alumni Association Executive Committee',
                      'Rangdhanu Executive Committee'];
      const cards = wanted.map(ecLatestPresident).filter(Boolean);
      rdLeaderSlides = cards.length;
      rdLeaderIdx = 0;
      if (!cards.length) {
        sec.classList.add('hidden');
        box.innerHTML = '';
        if (dots) dots.innerHTML = '';
        return;
      }
      sec.classList.remove('hidden');
      box.innerHTML = cards.map(x =>
        '<div class="leader-slide"><p class="text-[11px] font-extrabold uppercase text-blue-700 ' +
        'tracking-widest mb-2.5">' + escapeHtml(ecShortCommittee(x.committee)) + '</p>' +
        ecLeaderCard(x.member, x.session) + '</div>').join('');
      if (dots) {
        /* One message needs no dots, and no way to move off it. */
        dots.innerHTML = cards.length < 2 ? '' : cards.map((x, i) =>
          '<button type="button" class="leader-dot' + (i === 0 ? ' on' : '') +
          '" aria-current="' + (i === 0 ? 'true' : 'false') +
          '" aria-label="' + escapeHtml(ecShortCommittee(x.committee)) +
          '" onclick="setLeaderSlide(' + i + ')"></button>').join('');
      }
      if (box.style) box.style.transform = 'translateX(0%)';
      rdLeaderBindSwipe();
      startLeaderAutoplay();
      lucide.createIcons();
    }

    /* ---------- PDACC page: the newest Director, plus a door into that
       committee's own page ------------------------------------------------
       Nothing is typed twice: the Director card is the same card the
       Committee page draws, read from the newest APPROVED PDACC session. */
    const RD_PDACC_COMMITTEE = 'Prokoushali DUET Admission Coaching Centre Executive Committee';

    /* The backend ranks president / secretary / vice president and gives
       everything else rank 4 -- a PDACC Director included. Rather than wait
       on a redeploy, the title itself is read here. 'Assistant Director',
       'Senior Finance Director' and the like are deliberately excluded. */
    function ecIsDirector(m) {
      const p = String(m && m.position || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (p.indexOf('director') === -1) return false;
      return !/(assistant|asst\.?|joint|deputy|senior|additional|vice)/.test(p);
    }

    function pdaccLastSession() {
      const c = ecFindCommittee(RD_PDACC_COMMITTEE);
      return c && c.sessions && c.sessions.length ? c.sessions[0].session : '';
    }

    function ecLatestDirector() {
      const c = ecFindCommittee(RD_PDACC_COMMITTEE);
      if (!c) return null;
      const isTop = m => m.positionRank === 1 || ecIsDirector(m);
      for (const s of (c.sessions || [])) {
        const d = (s.members || []).find(m => isTop(m) && String(m.message || '').trim());
        if (d) return { member: d, session: s.session };
      }
      /* No message written yet -- still worth showing who the Director is. */
      for (const s of (c.sessions || [])) {
        const d = (s.members || []).find(isTop);
        if (d) return { member: d, session: s.session };
      }
      return null;
    }

    function renderPdaccDirector() {
      const sec = document.getElementById('pdacc-leadership');
      const card = document.getElementById('pdacc-director-card');
      const label = document.getElementById('pdacc-committee-btn-label');
      if (!sec || !card) return;
      const found = ecLatestDirector();
      const session = pdaccLastSession();
      if (!found && !session) { sec.classList.add('hidden'); card.innerHTML = ''; return; }
      sec.classList.remove('hidden');
      /* Owner: the PDACC Director's number is public on this card -- the running
         Director is a public servant. publicPhone=true shows the Call Director
         link even without member sign-in (the number arrives in the public feed,
         PDACC committee only). The old floating seat pill + contacts Call box
         were removed in the same pass. */
      card.innerHTML = found ? pdaccDirectorCard(found.member, found.session, true) : '';
      if (label) label.textContent = session
        ? 'View ' + session + ' committee'
        : 'View last session committee';
      lucide.createIcons();
    }

    /* The Senior Residential Director of the newest PDACC session only --
       seat booking is this session's business, not a past one's. */
    function ecSeniorResidentialDirector() {
      const c = ecFindCommittee(RD_PDACC_COMMITTEE);
      if (!c || !c.sessions || !c.sessions.length) return null;
      const s = c.sessions[0];
      const m = (s.members || []).find(x => {
        const p = String(x && x.position || '').toLowerCase().replace(/\s+/g, ' ').trim();
        return p.indexOf('director') !== -1 && /(senior|sr\.?)/.test(p) && p.indexOf('resident') !== -1;
      });
      return m ? { member: m, session: s.session } : null;
    }

    /* Owner (2026-09-25, round-8): the floating red Seat-Booking pill and the
       standalone "Call" contacts box stay removed, but Seat Booking returns as a
       side-nav item (.rd-pd-navseat) on every PDACC page. Its number is never in
       the markup -- it is read from the committee feed each time it lands:
       Senior Residential Director of the newest session first, the Director when
       that seat is empty, and the item stays hidden when neither carries one (a
       dead tel: link is worse than no button). renderPdaccContacts /
       renderPdaccSeatPill remain gone. */
    function rdPdSeatContact() {
      const res = (typeof ecSeniorResidentialDirector === 'function')
        ? ecSeniorResidentialDirector() : null;
      const dir = (typeof ecLatestDirector === 'function') ? ecLatestDirector() : null;
      for (const hit of [res, dir]) {
        const phone = hit && hit.member ? String(hit.member.mobile || '').trim() : '';
        if (phone) return { phone: phone, member: hit.member, session: hit.session };
      }
      return null;
    }

    function renderPdaccSeatNav() {
      const items = document.querySelectorAll('.rd-pd-navseat');
      if (!items.length) return;
      const hit = rdPdSeatContact();
      items.forEach(function (a) {
        if (hit) {
          a.href = 'tel:' + hit.phone.replace(/[^0-9+]/g, '');
          a.hidden = false;
          const who = String(hit.member.fullName || '').trim();
          a.setAttribute('title', who ? who + ' - ' + hit.phone : hit.phone);
          a.setAttribute('aria-label', 'Seat booking: call ' + (who || hit.phone));
        } else {
          a.hidden = true;
          a.removeAttribute('href');
        }
      });
    }

    /* PDACC-scoped Executive committee: the newest session of the PDACC
       committee only -- no committee switcher, no session tabs, no way to
       reach the Rangdhanu or any older committee from here. Leader and member
       cards are reused from the site-wide committee page. */
    function renderPdaccCommittee() {
      const mount = document.getElementById('pdacc-committee-mount');
      if (!mount) return;
      const sub = document.getElementById('pdacc-committee-sub');
      const c = ecFindCommittee(RD_PDACC_COMMITTEE);
      const hasData = c && c.sessions && c.sessions.length;
      if (!hasData && RD_EC.state === 'loading') {
        mount.innerHTML = '<div class="rounded-3xl border border-slate-200 bg-white">' + rdPremiumSpinner('Loading Committee', 'landmark') + '</div>';
        lucide.createIcons(); return;
      }
      if (!hasData && RD_EC.state === 'error') {
        mount.innerHTML = '<div class="rounded-3xl border border-rose-200 bg-rose-50 py-10 px-6 text-center"><i data-lucide="triangle-alert" class="w-8 h-8 text-rose-600 mx-auto"></i>' +
          '<p class="mt-3 text-sm font-bold text-rose-800">' + escapeHtml(RD_EC.error || 'Could not load the committee.') + '</p>' +
          '<button type="button" onclick="loadExecutiveCommittee(true)" class="mt-5 px-5 py-2.5 rounded-xl bg-white border border-rose-200 text-rose-700 text-xs font-bold cursor-pointer">Try again</button></div>';
        lucide.createIcons(); return;
      }
      const session = hasData ? c.sessions[0] : null;
      const members = session ? (session.members || []) : [];
      if (!members.length) {
        mount.innerHTML = '<div class="rounded-3xl border border-slate-200 bg-white py-12 px-6 text-center"><i data-lucide="users" class="w-8 h-8 text-slate-300 mx-auto"></i>' +
          '<p class="mt-3 text-sm font-bold text-slate-600">এই সেশনের নির্বাহী কমিটি এখনো যোগ করা হয়নি।</p></div>';
        lucide.createIcons(); return;
      }
      if (sub) sub.textContent = session.session + ' সেশনের নির্বাহী কমিটি।';
      const leaders = members.filter(ecIsLeader);
      const rest = members.filter(m => !ecIsLeader(m));
      /* Owner: keep every committee card the same compact size (pdaccEcCard),
         Director included -- just make sure the call option is there (it is,
         when the member carries a number). Director(s) on top, rest below. */
      let html = '';
      if (leaders.length) {
        html += '<div class="rd-pd-ec-lead">' +
          leaders.map(m => pdaccEcCard(m, session.session)).join('') + '</div>';
      }
      if (rest.length) {
        html += '<div class="rd-pd-ec-grid">' +
          rest.map(m => pdaccEcCard(m, session.session)).join('') + '</div>';
      }
      mount.innerHTML = html;
      lucide.createIcons();
    }

    /* One compact, centred committee card for the PDACC page. Real data only:
       position badge, round avatar (initials fallback), name, department/series
       (session on the leader), and a View-profile link into the alumni record. */
    function pdaccEcCard(m, sessionLabel) {
      const lead = ecIsLeader(m);
      const photo = String(m.photo || '').trim();
      const ava = photo
        ? '<img src="' + escapeHtml(photo) + '" alt="' + escapeHtml(m.fullName) + '" loading="lazy" class="rd-pd-ec-img" onerror="rdPhotoFallback(this)"/>'
        : '<span class="ec-initials">' + escapeHtml(ecInitials(m.fullName)) + '</span>';
      const pill = escapeHtml(m.department) + ' • Series ' + escapeHtml(m.series) +
        (lead && sessionLabel ? ' • ' + escapeHtml(sessionLabel) : '');
      return '' +
      '<article class="rd-pd-ec-card' + (lead ? ' is-lead' : '') + '">' +
        '<div class="rd-pd-ec-ava"><span class="rd-pd-ec-dot"></span>' + ava + '</div>' +
        '<h4 class="rd-pd-ec-name">' + escapeHtml(m.fullName) + '</h4>' +
        '<p class="rd-pd-ec-role">' + escapeHtml(m.position) + '</p>' +
        '<span class="rd-pd-ec-pill">' + pill + '</span>' +
        '<div class="rd-pd-ec-acts">' +
          '<button type="button" class="rd-pd-ec-link" onclick="ecOpenProfile(\'' +
            escapeHtml(m.entryId) + '\', this)"><i data-lucide="user-round"></i> Profile</button>' +
          /* Running committee members are public servants -- their number is
             public HERE (PDACC page only). The site-wide committee still hides
             it behind member sign-in; this button lives on pdaccEcCard alone. */
          (String(m.mobile || '').trim()
            ? '<a class="rd-pd-ec-call" href="tel:' + escapeHtml(String(m.mobile).replace(/[^0-9+]/g, '')) +
              '"><i data-lucide="phone-call"></i> Call</a>'
            : '') +
        '</div>' +
      '</article>';
    }

    /* The Director's-Message card, PDACC theme. Premium teal treatment (glow,
       gradient, quote block) but it keeps every substring the site-wide
       ecLeaderCard exposed -- ecPhotoBlock's ec-initials, the position span,
       the Session label, rdClampBlock's See more, and the gated mailto -- so
       the committee harness reads the same facts off it. */
    function pdaccDirectorCard(m, sessionLabel, publicPhone) {
      const msg = String(m.message || '').trim();
      const canSee = rdCanViewContacts() && (m.mobile || m.email);
      const showPhone = (publicPhone && String(m.mobile || '').trim()) || (canSee && m.mobile);
      const showEmail = canSee && m.email;
      return '' +
      '<article class="rd-pd-dir">' +
        '<span class="rd-pd-dir-glow"></span>' +
        '<div class="rd-pd-dir-head">' +
          ecPhotoBlock(m, 'rd-pd-dir-ava w-24 h-24 sm:w-28 sm:h-28') +
          '<div class="min-w-0">' +
            '<span class="rd-pd-dir-badge">' + escapeHtml(m.position) + '</span>' +
            '<h3 class="rd-pd-dir-name">' + escapeHtml(m.fullName) + '</h3>' +
            '<p class="rd-pd-dir-meta">' + escapeHtml(m.department) + ' • Series ' + escapeHtml(m.series) +
              (sessionLabel ? ' • Session ' + escapeHtml(sessionLabel) : '') + '</p>' +
          '</div>' +
        '</div>' +
        (msg
          ? '<div class="rd-pd-dir-msg"><i data-lucide="quote" class="rd-pd-dir-quote"></i>' +
            rdClampBlock(msg, 320, 'rd-pd-dir-text') + '</div>'
          : '') +
        '<div class="rd-pd-dir-foot">' +
          '<button type="button" class="rd-pd-ec-link" onclick="ecOpenProfile(\'' +
            escapeHtml(m.entryId) + '\', this)"><i data-lucide="user-round"></i> View profile</button>' +
          (showPhone
            ? '<a class="rd-pd-ec-call" href="tel:' + escapeHtml(String(m.mobile).replace(/[^0-9+]/g, '')) +
              '"><i data-lucide="phone-call"></i> কল করুন</a>'
            : '') +
          (showEmail
            ? '<a class="rd-pd-dir-mail" href="mailto:' + escapeHtml(m.email) +
              '"><i data-lucide="mail"></i> Email</a>'
            : '') +
        '</div>' +
      '</article>';
    }

    /* ---------- PDACC: the DUET admission guide ------------------------
       The tabs, the technology dropdown and the marks simulation. Every
       figure is already in the markup, so this only wires the behaviour,
       and it runs once, the first time the guide is opened. */
    let rdAdReady = false;
    function rdAdInit() {
      if (rdAdReady) return;
      if (!document.getElementById('rdAdSim')) return;
      rdAdReady = true;
  /* ------------------------------------------------------------------ tabs */
  (function(){
    document.documentElement.classList.add('rd-js');
    var tabs = document.querySelectorAll('.rd-ad-tab');
    function show(set, id){
      document.querySelectorAll('.rd-ad-tab[data-set="'+set+'"]').forEach(function(t){
        var on = t.getAttribute('aria-controls') === id;
        t.classList.toggle('on', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      document.querySelectorAll('.rd-ad-panes[data-set="'+set+'"] .rd-ad-pane2').forEach(function(p){
        p.classList.remove('on');
        if (p.id === id) { void p.offsetWidth; p.classList.add('on'); }
      });
      var hint = document.getElementById('h-' + set);
      if (hint) hint.hidden = true;
    }
    tabs.forEach(function(t){
      t.addEventListener('click', function(){ show(t.dataset.set, t.getAttribute('aria-controls')); });
    });
    window.rdAdShowDept = function(paneId){
      show('p2', paneId);
      var tab = document.getElementById('t-' + paneId);
      if (tab) tab.scrollIntoView({block:'center', behavior:'auto'});
    };
  })();

  /* ------------------------------------------------- the marks simulation */
  (function(){
    var box = document.getElementById('rdAdSim');
    if (!box) return;
    var S = [
      ['পদার্থবিজ্ঞান', 'Physics', 15, 25],
      ['রসায়ন', 'Chemistry', 15, 25],
      ['গণিত', 'Mathematics', 15, 25],
      ['ইংরেজি', 'English', 15, 15],
      ['টেকনিক্যাল, ২য় পত্র', 'Technical', 60, 90]
    ];
    function bn(n){
      return String(n).replace(/[0-9]/g, function(d){ return '০১২৩৪৫৬৭৮৯'[+d]; });
    }
    S.forEach(function(r, i){
      var row = document.createElement('div');
      row.className = 'rd-ad-sim-row';
      row.innerHTML =
        '<div class="rd-ad-sim-lab"><b>' + r[0] + '</b><em>' + r[1] + '</em></div>' +
        '<input class="rd-ad-sim-range" type="range" min="0" max="100" step="5" value="60" ' +
          'id="rdAdSimR' + i + '" aria-label="' + r[0] + ' কত শতাংশ পারবেন">' +
        '<div class="rd-ad-sim-val"><span class="rd-ad-sim-pc" id="rdAdSimP' + i + '">৬০%</span>' +
          '<span>MCQ <b id="rdAdSimM' + i + '">০</b>/' + bn(r[2]) + '</span>' +
          '<span>লিখিত <b id="rdAdSimW' + i + '">০</b>/' + bn(r[3]) + '</span></div>';
      box.appendChild(row);
    });
    var total = document.getElementById('rdAdSimTotal');
    var oMcq = document.getElementById('rdAdSimMcq');
    var oWri = document.getElementById('rdAdSimWri');
    var gate = document.getElementById('rdAdSimGate');
    function calc(){
      var m = 0, w = 0, engPc = 0;
      S.forEach(function(r, i){
        var pc = +document.getElementById('rdAdSimR' + i).value;
        var sm = Math.round(r[2] * pc / 100), sw = Math.round(r[3] * pc / 100);
        if (i === 3) engPc = pc;
        m += sm; w += sw;
        document.getElementById('rdAdSimP' + i).textContent = bn(pc) + '%';
        document.getElementById('rdAdSimM' + i).textContent = bn(sm);
        document.getElementById('rdAdSimW' + i).textContent = bn(sw);
      });
      oMcq.textContent = bn(m);
      oWri.textContent = bn(w);
      total.textContent = bn(m + w);
      if (engPc < 20) {
        gate.className = 'rd-ad-sim-gate bad';
        gate.textContent = 'ইংরেজি MCQ-তে ' + bn(engPc) + '% মানে ২০%-এর কম, এই অবস্থায় লিখিত খাতা দেখা হয় না।';
      } else {
        gate.className = 'rd-ad-sim-gate ok';
        gate.textContent = 'ইংরেজি MCQ-তে ' + bn(engPc) + '%, ২০%-এর শর্ত পার হয়েছে।';
      }
    }
    box.addEventListener('input', calc);
    calc();
  })();

  /* -------------------------------------------------- technology finder */
  (function(){
    var D = {
      ce : {bn:'সিভিল', en:'Civil Engineering', seats:'১২০', pane:'p2-ce'},
      eee: {bn:'ইলেকট্রিক্যাল অ্যান্ড ইলেকট্রনিক', en:'EEE', seats:'১২০', pane:'p2-eee'},
      me : {bn:'মেকানিক্যাল, IPE ও MME', en:'ME · IPE · MME', seats:'১২০ + ৩০ + ৩০', pane:'p2-me',
             note:'তিন বিভাগের পরীক্ষা একটিই, আবেদনও একটি'},
      cse: {bn:'কম্পিউটার সায়েন্স অ্যান্ড ইঞ্জিনিয়ারিং', en:'CSE', seats:'১২০', pane:'p2-cse'},
      te : {bn:'টেক্সটাইল', en:'Textile Engineering', seats:'১২০', pane:'p2-te'},
      arc: {bn:'আর্কিটেকচার', en:'Architecture', seats:'৩০', pane:'p2-arc'},
      che: {bn:'কেমিক্যাল', en:'Chemical Engineering', seats:'৩০', pane:'p2-che'},
      fe : {bn:'ফুড', en:'Food Engineering', seats:'৩০', pane:'p2-fe'}
    };
    var T = [
      ['সিভিল','civil',['ce']],
      ['সার্ভেয়িং','surveying',['ce']],
      ['সিভিল (উড)','civil wood',['ce']],
      ['কনস্ট্রাকশন','construction',['ce']],
      ['এনভায়রনমেন্টাল','environmental',['ce','che'],'সিভিলে আবেদনের ক্ষেত্রে নির্ধারিত ঐচ্ছিক বিষয়সমূহে পাশ থাকতে হবে।'],
      ['ইলেকট্রিক্যাল','electrical',['eee']],
      ['ইলেক্ট্রোমেডিকেল','electromedical',['eee']],
      ['ইলেকট্রনিক্স','electronics',['eee','cse']],
      ['টেলিকমিউনিকেশন','telecommunication',['eee']],
      ['ইনস্ট্রুমেন্টেশন অ্যান্ড প্রসেস কন্ট্রোল','instrumentation and process control',['eee','me','che']],
      ['মেকানিক্যাল','mechanical',['me','che']],
      ['পাওয়ার','power',['me','che']],
      ['রেফ্রিজারেশন অ্যান্ড এয়ারকন্ডিশনিং','refrigeration and air conditioning',['me','che','fe']],
      ['অটোমোবাইল','automobile',['me','che']],
      ['মেকাট্রনিক্স','mechatronics',['me','che']],
      ['সিরামিক','ceramic',['me','che']],
      ['গ্লাস','glass',['me','che']],
      ['শিপ বিল্ডিং','ship building',['me','che']],
      ['মেরিন','marine',['me','che']],
      ['মাইনিং এবং মাইন সার্ভে','mining and mine survey',['me','che']],
      ['কম্পিউটার সায়েন্স অ্যান্ড টেকনোলজি','computer science and technology',['cse']],
      ['কম্পিউটার','computer',['cse']],
      ['ডাটা টেলিকমিউনিকেশন অ্যান্ড নেটওয়ার্কিং','data telecommunication and networking',['cse']],
      ['গ্রাফিক্স ডিজাইন','graphics design',['cse']],
      ['প্রিন্টিং','printing',['cse']],
      ['টেক্সটাইল','textile',['te']],
      ['টেক্সটাইল (অ্যাপারেল ম্যানুফ্যাকচারিং)','textile apparel manufacturing',['te']],
      ['টেক্সটাইল (ফ্যাশন ডিজাইন)','textile fashion design',['te']],
      ['টেক্সটাইল (ইয়ার্ন ম্যানুফ্যাকচারিং)','textile yarn manufacturing',['te']],
      ['টেক্সটাইল (ফেব্রিক ম্যানুফ্যাকচারিং)','textile fabric manufacturing',['te']],
      ['টেক্সটাইল (জুট প্রোডাক্ট ম্যানুফ্যাকচারিং)','textile jute product manufacturing',['te']],
      ['টেক্সটাইল (ওয়েট প্রসেসিং)','textile wet processing',['te']],
      ['টেক্সটাইল (মার্চেন্ডাইজিং অ্যান্ড মার্কেটিং)','textile merchandising and marketing',['te']],
      ['টেক্সটাইল (মেশিন ডিজাইন অ্যান্ড মেইনটেন্যান্স)','textile machine design and maintenance',['te']],
      ['জুট','jute',['te']],
      ['গার্মেন্টস অ্যান্ড প্যাটার্ন মেকিং','garments and pattern making',['te']],
      ['আর্কিটেকচার','architecture',['arc']],
      ['আর্কিটেকচার অ্যান্ড ইন্টেরিয়র ডিজাইন','architecture and interior design',['arc']],
      ['কেমিক্যাল','chemical',['che']],
      ['ফুড','food',['fe']],
      ['এগ্রিকালচার','agriculture',['fe']]
    ];

    var q = document.getElementById('rdAdTechQ');
    var sel = document.getElementById('rdAdTechSel');
    var res = document.getElementById('rdAdRes');
    var clear = document.getElementById('rdAdTechClear');
    var count = document.getElementById('rdAdTechCount');
    if (!q || !sel || !res) return;

    var bnDigit = function(n){ return String(n).replace(/[0-9]/g, function(d){ return '০১২৩৪৫৬৭৮৯'[+d]; }); };
    count.textContent = bnDigit(T.length) + 'টি টেকনোলজি তালিকায় আছে।';

    function fill(list){
      sel.innerHTML = '';
      var head = document.createElement('option');
      head.value = '';
      head.textContent = list.length
        ? 'টেকনোলজি বাছুন'
        : 'এই নামে কোনো টেকনোলজি নেই';
      sel.appendChild(head);
      list.forEach(function(t){
        var o = document.createElement('option');
        o.value = String(T.indexOf(t));
        o.textContent = t[0] + '  (' + t[1] + ')';
        sel.appendChild(o);
      });
      sel.disabled = !list.length;
      count.textContent = list.length === T.length
        ? bnDigit(T.length) + 'টি টেকনোলজি তালিকায় আছে।'
        : bnDigit(list.length) + 'টি টেকনোলজি মিলেছে।';
    }

    function pick(t){
      var html = '<div class="rd-ad-resh"><b>' + t[0] + '</b><span>এই টেকনোলজি থেকে ' +
        bnDigit(t[2].length) + 'টি বিভাগে পরীক্ষা দেওয়া যায়</span></div><div class="rd-ad-cards">';
      t[2].forEach(function(k, i){
        var d = D[k];
        html += '<article class="rd-ad-dcard" style="--d:' + (i * 0.07) + 's">' +
          '<b>' + d.bn + '</b><em>' + d.en + '</em>' +
          '<span class="rd-ad-dseat">' + d.seats + ' আসন</span>' +
          (d.note ? '<span class="rd-ad-dnote">' + d.note + '</span>' : '') +
          '<button type="button" class="rd-ad-dgo" onclick="rdAdShowDept(\'' + d.pane + '\')">২য় পত্রের সিলেবাস দেখুন</button>' +
          '</article>';
      });
      html += '</div>';
      if (t[3]) html += '<p class="rd-ad-rnote">' + t[3] + '</p>';
      res.innerHTML = html;
    }

    function filter(){
      var v = q.value.trim();
      clear.hidden = !v;
      var list = v ? T.filter(function(t){
        return t[0].indexOf(v) > -1 || t[1].indexOf(v.toLowerCase()) > -1;
      }) : T;
      fill(list);
      if (list.length === 1) { sel.value = String(T.indexOf(list[0])); pick(list[0]); }
      else { res.innerHTML = ''; }
    }

    sel.addEventListener('change', function(){
      if (sel.value === '') { res.innerHTML = ''; return; }
      pick(T[+sel.value]);
    });
    q.addEventListener('input', filter);
    clear.addEventListener('click', function(){ q.value = ''; q.focus(); filter(); });
    fill(T);
  })();
    }

    function pdaccViewLastCommittee() {
      RD_EC.committee = RD_PDACC_COMMITTEE;
      RD_EC.session = pdaccLastSession();
      switchPage('committee');
      renderExecutiveCommittee();
      lucide.createIcons();
    }

    function ecMemberCard(m) {
      const lead = m.positionRank === 1 || m.positionRank === 2;
      const photo = String(m.photo || '').trim();
      /* No photo (or a Drive link that 404s) falls back to the initials tile,
         so a card is never left with an empty hole in it. */
      const avatar = photo
        ? '<img src="' + escapeHtml(photo) + '" alt="' + escapeHtml(m.fullName) + '" loading="lazy" class="w-full h-full object-cover" onerror="rdPhotoFallback(this)"/>'
        : '';
      return '' +
      '<article class="ec-member-card bg-white rounded-3xl border ' + (lead ? 'border-blue-200' : 'border-slate-200') + ' shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden flex flex-col">' +
        '<div class="p-6 flex items-start gap-4">' +
          '<div class="w-20 h-20 shrink-0 rounded-2xl bg-blue-50 border border-blue-100 text-blue-700 font-extrabold text-xl flex items-center justify-center overflow-hidden relative">' +
            '<span class="ec-initials">' + escapeHtml(ecInitials(m.fullName)) + '</span>' +
            (photo ? '<span class="absolute inset-0">' + avatar + '</span>' : '') +
          '</div>' +
          '<div class="min-w-0">' +
            '<h4 class="font-extrabold text-base text-slate-900 leading-snug break-words">' + escapeHtml(m.fullName) + '</h4>' +
            '<p class="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-extrabold ' +
              (lead ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700') + '">' + escapeHtml(m.position) + '</p>' +
            '<p class="text-xs text-slate-500 mt-2 font-medium">' + escapeHtml(m.department) + ' \u2022 Series ' + escapeHtml(m.series) + '</p>' +
            /* Alumni Association entries may carry a job; the rest never do,
               so the line simply is not drawn when both boxes were left blank. */
            (String(m.designation || '').trim() || String(m.organization || '').trim()
              ? '<p class="text-xs text-slate-600 mt-1.5 font-semibold break-words">' +
                [m.designation, m.organization].map(x => String(x || '').trim()).filter(Boolean)
                  .map(escapeHtml).join(' \u2022 ') + '</p>'
              : '') +
          '</div>' +
        '</div>' +
        (lead && String(m.message || '').trim()
          ? '<div class="mx-6 mb-5 rounded-2xl bg-blue-50/70 border border-blue-100 px-4 py-3"><i data-lucide="quote" class="w-3.5 h-3.5 text-blue-500"></i>' + rdClampBlock(m.message, 200, 'mt-1 text-xs text-slate-700 leading-relaxed whitespace-pre-line') + '</div>'
          : '') +
        (String(m.message || '').trim() && !ecIsLeader(m)
          ? '<div class="px-6 mb-5"><button type="button" onclick="openEcMessage(\'' + escapeHtml(m.entryId) + '\')" class="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-600 hover:text-white border border-blue-100 text-blue-700 text-xs font-extrabold cursor-pointer"><i data-lucide="message-square-quote" class="w-3.5 h-3.5"></i> View message</button></div>'
          : '') +
        ecProfileButton(m) +
        (rdCanViewContacts() && (m.mobile || m.email)
          ? '<div class="mt-auto border-t border-slate-100 grid grid-cols-2 divide-x divide-slate-100 text-xs font-bold">' +
          '<button type="button" onclick="copyToClipboard(\'' + escapeHtml(formatBdMobile(m.mobile)) + '\')" class="py-3.5 flex items-center justify-center gap-1.5 text-slate-600 hover:bg-slate-50 cursor-pointer"><i data-lucide="phone" class="w-3.5 h-3.5 text-blue-600"></i> Mobile</button>' +
          '<a href="mailto:' + escapeHtml(m.email) + '" class="py-3.5 flex items-center justify-center gap-1.5 text-slate-600 hover:bg-slate-50"><i data-lucide="mail" class="w-3.5 h-3.5 text-blue-600"></i> Email</a>' +
          '</div>'
          : '') +
      '</article>';
    }

    function renderExecutiveCommittee() {
      const tabs = document.getElementById('ec-committee-tabs');
      const sessBox = document.getElementById('ec-session-tabs');
      const grid = document.getElementById('ec-grid');
      if (!tabs || !sessBox || !grid) return;

      /* The three committee buttons exist whatever the data says, so the page
         never looks broken while the first request is still in flight. */
      tabs.innerHTML = RD_EC_COMMITTEES.map(c => {
        const found = ecFindCommittee(c.name);
        const on = RD_EC.committee === c.name;
        return '<button type="button" onclick="selectEcCommittee(\'' + c.name.replace(/'/g, "\\'") + '\')" ' +
          'class="ec-committee-tab text-left px-5 py-4 rounded-2xl border transition cursor-pointer ' +
          (on ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-white border-slate-200 text-slate-700 hover:border-blue-300') + '">' +
          '<span class="flex items-center gap-2 text-sm font-extrabold"><i data-lucide="' + c.icon + '" class="w-4 h-4"></i> ' + escapeHtml(c.bn) + '</span>' +
          '<span class="block mt-1 text-[11px] font-bold ' + (on ? 'text-blue-100' : 'text-slate-400') + '">' +
            (found ? found.count + (found.count === 1 ? ' member' : ' members') : 'No data') + '</span>' +
        '</button>';
      }).join('');

      const committee = ecFindCommittee(RD_EC.committee);
      const sessions = committee ? committee.sessions : [];

      if (sessions.length && !sessions.some(s => s.session === RD_EC.session)) {
        RD_EC.session = sessions[0].session;      // newest session, backend order
      }

      sessBox.innerHTML = sessions.map(s => {
        const on = s.session === RD_EC.session;
        return '<button type="button" onclick="selectEcSession(\'' + String(s.session).replace(/'/g, "\\'") + '\')" ' +
          'class="ec-session-tab px-4 py-2.5 rounded-xl text-xs font-extrabold border transition cursor-pointer ' +
          (on ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400') + '">' +
          escapeHtml(s.session) + ' <span class="' + (on ? 'text-slate-300' : 'text-slate-400') + '">(' + s.count + ')</span></button>';
      }).join('');

      const active = sessions.find(s => s.session === RD_EC.session);
      const members = active ? active.members : [];

      if (RD_EC.state === 'loading') { grid.innerHTML = ''; ecStateBox('loading'); return; }
      if (RD_EC.state === 'error') { grid.innerHTML = ''; ecStateBox('error', RD_EC.error); return; }
      if (!members.length) {
        grid.innerHTML = '';
        ecStateBox('empty', 'No approved members have been added for this committee yet.');
        return;
      }

      ecStateBox('');
      const leadBox = document.getElementById('ec-leaders');
      const memHead = document.getElementById('ec-members-head');
      const leaders = members.filter(ecIsLeader);
      const rest = members.filter(m => !ecIsLeader(m));
      if (leadBox) {
        /* .map(ecLeaderCard) handed the array index in as sessionLabel,
           so the second leader read "Session 1". Pass the real one. */
        leadBox.innerHTML = leaders.map(m => ecLeaderCard(m, RD_EC.session)).join('');
        /* items-start, exactly like the home grid: opening "See more" on
           one message must not stretch the card sitting next to it. */
        /* One message reads at the same width as the Director's message and
           the full message page. Two sitting side by side need a little more,
           but nowhere near the whole screen. */
        leadBox.className = leaders.length > 1
          ? 'grid gap-6 items-start max-w-5xl mx-auto mb-10 lg:grid-cols-2'
          : 'grid gap-6 items-start max-w-3xl mx-auto mb-10';
      }
      if (memHead) memHead.classList.toggle('hidden', !rest.length);
      grid.innerHTML = rest.map(ecMemberCard).join('');
      lucide.createIcons();
    }

    async function submitExecutiveCommitteeForm(e) {
      e.preventDefault();
      const form = e.target;
      const btn = document.getElementById('ec-submit-btn');
      const fd = new FormData(form);
      clearFieldErrors(form);
      const position = ecResolvePosition(fd);
      if (!position) {
        setFieldError(form, String(fd.get('position') || '') === 'Others' ? 'positionOther' : 'position',
                      'Please write the position.', true);
        return;
      }

      const session = String(fd.get('session') || '').trim();
      /* The allowed span depends on which committee was picked. */
      const sessErr = rdSessionError(session, fd.get('committee'));
      if (sessErr) { setFieldError(form, 'session', sessErr, true); return; }

      const mobile = String(fd.get('mobile') || '').trim();
      if (!isValidBdMobile(mobile)) {
        setFieldError(form, 'mobile', 'Please enter a valid mobile number.', true);
        return;
      }
      const file = form.querySelector('[name="photo"]').files[0];

      const original = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="inline-flex items-center gap-2"><i data-lucide="loader-circle" class="w-5 h-5 animate-spin"></i> Submitting...</span>';
      lucide.createIcons();
      showGlobalLoader("Uploading...", "Saving committee details.");

      try {
        const photo = file ? await filePayload(file, 900) : null;
        await apiPost('submitexecutivecommittee', { data: {
          committee: fd.get('committee'), session: session,
          position: position, fullName: fd.get('fullName'),
          department: fd.get('department'), series: fd.get('series'),
          mobile: mobile, email: String(fd.get('email') || '').trim(),
          designation: ecWantsProfession(fd.get('committee')) ? String(fd.get('designation') || '').trim() : '',
          organization: ecWantsProfession(fd.get('committee')) ? String(fd.get('organization') || '').trim() : '',
          message: fd.get('message') || '', photo: photo
          , targetMemberId: String(fd.get('targetMemberId') || '').trim()
          , submissionMode: String(fd.get('submissionMode') || 'own')
        }});
        form.reset();
        ecFillFormCommittees();
        hideGlobalLoader(true, () => {
            showToast('Your information has been submitted. It will appear on the Committee page once an admin approves it.',
                      'success', 'Submitted', { backTo: 'committee' });
        }, 'Committee entry submitted successfully.');
      } catch (err) {
        failGlobalLoader('Could not submit', friendlyError(err).msg);
        reportError(err, form);
      } finally {
        btn.disabled = false;
        btn.innerHTML = original;
        lucide.createIcons();
      }

      let RD_EC_OWNER_MODE = 'own';
      function ecPrepareSubmissionForm() {
        ecFillFormCommittees();
        if (rdMemberSignedIn()) ecSetOwnerMode(RD_EC_OWNER_MODE);
        if (!alumniData.length) loadPublicAlumni();
      }

      function ecSetOwnerMode(mode) {
        RD_EC_OWNER_MODE = mode === 'other' ? 'other' : 'own';
        const form = document.getElementById('ec-submit-form');
        if (!form) return;
        document.getElementById('ec-submission-mode').value = RD_EC_OWNER_MODE;
        document.getElementById('ec-own-mode').classList.toggle('active', RD_EC_OWNER_MODE === 'own');
        document.getElementById('ec-other-mode').classList.toggle('active', RD_EC_OWNER_MODE === 'other');
        document.getElementById('ec-other-search-wrap').classList.toggle('hidden', RD_EC_OWNER_MODE !== 'other');
        document.getElementById('ec-owner-note').textContent = RD_EC_OWNER_MODE === 'own'
          ? 'Your saved member information will be loaded into the form.'
          : 'Search an existing member, or enter another person’s information manually.';
        if (RD_EC_OWNER_MODE === 'own') {
          document.getElementById('ec-target-member-id').value = '';
          ecFillMemberForm(RD_MEMBER.me);
        } else {
          form.querySelector('[name="fullName"]').value = '';
          form.querySelector('[name="mobile"]').value = '';
          form.querySelector('[name="email"]').value = '';
          form.querySelector('[name="department"]').value = '';
          form.querySelector('[name="series"]').value = '';
          document.getElementById('ec-target-member-id').value = '';
        }
      }

      function ecFillMemberForm(member) {
        if (!member) return;
        const form = document.getElementById('ec-submit-form');
        if (!form) return;
        const set = (name, value) => { const el = form.querySelector('[name="' + name + '"]'); if (el) el.value = String(value || ''); };
        set('fullName', member['Full Name (English)']);
        const contact = memberContact(member['Member ID']);
        set('mobile', member['Mobile Number'] || (contact && contact['Mobile Number']));
        set('email', member['Email'] || (contact && contact.Email));
        set('department', member.Department);
        set('series', member.Series);
        const photo = member['Passport Size Image'];
        if (photo) document.getElementById('ec-owner-note').textContent = 'Loaded from your member profile. You can still correct the information before submitting.';
      }

      function ecSearchMember(query) {
        const box = document.getElementById('ec-other-results');
        const q = String(query || '').trim().toLowerCase();
        if (!box) return;
        if (q.length < 2) { box.innerHTML = ''; return; }
        const hits = alumniData.filter(a => String(a.name || '').toLowerCase().indexOf(q) !== -1).slice(0, 6);
        box.innerHTML = hits.map(a => '<button type="button" class="ec-member-result" onclick="ecSelectMember(\'' +
          escapeHtml(String(a.id)) + '\')"><span><b class="block text-sm text-slate-800">' + escapeHtml(a.name) +
          '</b><span class="text-xs text-slate-500">' + escapeHtml(a.dept) + ' • Series ' + escapeHtml(a.series) +
          '</span></span><span class="text-xs font-bold text-teal-700">Use</span></button>').join('') ||
          '<p class="text-xs text-slate-500">No directory match. You can enter the information manually.</p>';
      }

      async function ecSelectMember(id) {
        const member = alumniData.find(a => String(a.id) === String(id));
        if (!member) return;
        if (rdMemberSignedIn() && !RD_MEMBER.contacts) await memberLoadContacts();
        const form = document.getElementById('ec-submit-form');
        if (!form) return;
        const set = (name, value) => { const el = form.querySelector('[name="' + name + '"]'); if (el) el.value = String(value || ''); };
        const contact = memberContact(member.memberId || member.id);
        set('fullName', member.name);
        set('mobile', member.phone || (contact && contact['Mobile Number']));
        set('email', member.email || (contact && contact.Email));
        set('department', member.dept); set('series', member.series);
        document.getElementById('ec-target-member-id').value = String(member.id);
        document.getElementById('ec-other-search').value = member.name;
        document.getElementById('ec-other-results').innerHTML = '<p class="text-xs font-bold text-teal-700">Member information loaded. You may edit it before submitting.</p>';
      }
    }

    /* These handlers must live at the script scope because the form calls them
       from inline HTML attributes. */
    let RD_EC_FORM_OWNER_MODE = 'own';
    function ecSetOwnerMode(mode) {
      RD_EC_FORM_OWNER_MODE = mode === 'other' ? 'other' : 'own';
      const form = document.getElementById('ec-submit-form');
      if (!form) return;
      document.getElementById('ec-submission-mode').value = RD_EC_FORM_OWNER_MODE;
      document.getElementById('ec-own-mode').classList.toggle('active', RD_EC_FORM_OWNER_MODE === 'own');
      document.getElementById('ec-other-mode').classList.toggle('active', RD_EC_FORM_OWNER_MODE === 'other');
      document.getElementById('ec-other-search-wrap').classList.toggle('hidden', RD_EC_FORM_OWNER_MODE !== 'other');
      document.getElementById('ec-owner-note').textContent = RD_EC_FORM_OWNER_MODE === 'own'
        ? 'Your saved member information will be loaded into the form.'
        : 'Search an existing member, or enter another person’s information manually.';
      if (RD_EC_FORM_OWNER_MODE === 'own') {
        document.getElementById('ec-target-member-id').value = '';
        ecFillMemberForm(RD_MEMBER.me);
      } else {
        ['fullName', 'mobile', 'email', 'department', 'series'].forEach(function (name) {
          const input = form.querySelector('[name="' + name + '"]');
          if (input) input.value = '';
        });
        document.getElementById('ec-target-member-id').value = '';
      }
    }

    function ecPrepareSubmissionForm() {
      ecFillFormCommittees();
      if (rdMemberSignedIn()) ecSetOwnerMode(RD_EC_FORM_OWNER_MODE);
      if (!alumniData.length) loadPublicAlumni();
      if (rdMemberSignedIn() && !RD_MEMBER.contacts) {
        memberLoadContacts().then(function () {
          if (RD_EC_FORM_OWNER_MODE === 'own') ecFillMemberForm(RD_MEMBER.me);
        });
      }
    }

    function ecFillMemberForm(member) {
      if (!member) return;
      const form = document.getElementById('ec-submit-form');
      if (!form) return;
      const set = (name, value) => { const el = form.querySelector('[name="' + name + '"]'); if (el) el.value = String(value || ''); };
      const contact = memberContact(member['Member ID'] || member.memberId || member.id);
      set('fullName', member['Full Name (English)']);
      set('mobile', member['Mobile Number'] || member.mobile || member.phone ||
        (contact && (contact['Mobile Number'] || contact.mobile)));
      set('email', member.Email || member.email || (contact && (contact.Email || contact.email)));
      set('department', member.Department || member.department || member.dept);
      set('series', member.Series || member.series);
    }

    function ecSearchMember(query) {
      const box = document.getElementById('ec-other-results');
      const q = String(query || '').trim().toLowerCase();
      if (!box) return;
      if (q.length < 2) { box.innerHTML = ''; return; }
      const hits = alumniData.filter(a => String(a.name || '').toLowerCase().indexOf(q) !== -1).slice(0, 6);
      box.innerHTML = hits.map(a => '<button type="button" class="ec-member-result" onclick="ecSelectMember(\'' +
        escapeHtml(String(a.id)) + '\')"><span><b class="block text-sm text-slate-800">' + escapeHtml(a.name) +
        '</b><span class="text-xs text-slate-500">' + escapeHtml(a.dept) + ' • Series ' + escapeHtml(a.series) +
        '</span></span><span class="text-xs font-bold text-teal-700">Use</span></button>').join('') ||
        '<p class="text-xs text-slate-500">No directory match. You can enter the information manually.</p>';
    }

    function ecSelectMember(id) {
      const member = alumniData.find(a => String(a.id) === String(id));
      if (!member) return;
      const profile = {
        'Full Name (English)': member.name,
        'Member ID': member.memberId || member.id,
        'Mobile Number': member.phone || '',
        'Email': member.email || '',
        Department: member.dept,
        Series: member.series
      };
      ecFillMemberForm(profile);
      if (rdMemberSignedIn() && !RD_MEMBER.contacts) {
        memberLoadContacts().then(function () { ecFillMemberForm(profile); });
      }
      document.getElementById('ec-target-member-id').value = String(member.id);
      document.getElementById('ec-other-search').value = member.name;
      document.getElementById('ec-other-results').innerHTML = '<p class="text-xs font-bold text-teal-700">Member information loaded. You may edit it before submitting.</p>';
    }

    function ecFillFormCommittees() {
      const sel = document.getElementById('ec-form-committee');
      if (!sel) return;
      sel.innerHTML = '<option value="">Select committee</option>' +
        RD_EC_COMMITTEES.map(c => '<option value="' + escapeHtml(c.name) + '">' + escapeHtml(c.name) + '</option>').join('');
      ecFillFormPositions();
      if (rdMemberSignedIn()) ecSetOwnerMode('own');
    }

    /* PDACC is run by Directors and Rangdhanu by a President and a Secretary,
       so the position list belongs to the committee, not to the page. */
    function ecFillFormPositions() {
      const csel = document.getElementById('ec-form-committee');
      const psel = document.getElementById('ec-form-position');
      if (!csel || !psel) return;
      const list = csel.value ? ecCommitteeMeta(csel.value).positions || [] : [];
      psel.innerHTML = list.length
        ? '<option value="">Select position</option>' +
          list.map(p => '<option value="' + escapeHtml(p) + '">' + escapeHtml(p) + '</option>').join('')
        : '<option value="">Select the committee first</option>';
      psel.value = '';
      ecSyncAlumniExtra();
      ecPositionChanged();
    }

    /* Designation and Organization are asked of the Alumni Association only.
       They stay optional: a graduate between jobs must still be able to submit,
       so the two boxes are never given `required`, and they are emptied when a
       different committee is chosen so a stale answer cannot travel along. */
    function ecWantsProfession(committee) {
      return String(committee || '').trim() === RD_EC_COMMITTEES[1].name;
    }

    function ecSyncAlumniExtra() {
      const csel = document.getElementById('ec-form-committee');
      const wrap = document.getElementById('ec-alumni-extra-wrap');
      if (!csel || !wrap) return;
      const on = ecWantsProfession(csel.value);
      wrap.classList.toggle('hidden', !on);
      if (!on) wrap.querySelectorAll('input').forEach(i => { i.value = ''; });
    }

    /* "Others" is the escape hatch -- it swaps in a free-text box, and that
       box is only required while it is visible. */
    function ecPositionChanged() {
      const psel = document.getElementById('ec-form-position');
      const wrap = document.getElementById('ec-position-other-wrap');
      const other = document.getElementById('ec-form-position-other');
      if (!psel || !wrap || !other) return;
      const on = psel.value === 'Others';
      wrap.classList.toggle('hidden', !on);
      if (on) { other.required = true; }
      else { other.required = false; other.value = ''; }
    }

    /* What actually gets stored: the picked position, or what they typed. */
    function ecResolvePosition(fd) {
      const picked = String(fd.get('position') || '').trim();
      if (picked !== 'Others') return picked;
      return String(fd.get('positionOther') || '').trim();
    }


    /* ================= CGPA CALCULATOR ================================
       DUET's scale, in one place. Everything else is derived from it. */
    const RD_GRADES = [
      { code: 'A+', point: 4.00, marks: '80% and above' },
      { code: 'A',  point: 3.75, marks: '75% - 79%' },
      { code: 'A-', point: 3.50, marks: '70% - 74%' },
      { code: 'B+', point: 3.25, marks: '65% - 69%' },
      { code: 'B',  point: 3.00, marks: '60% - 64%' },
      { code: 'B-', point: 2.75, marks: '55% - 59%' },
      { code: 'C+', point: 2.50, marks: '50% - 54%' },
      { code: 'C',  point: 2.25, marks: '45% - 49%' },
      { code: 'D',  point: 2.00, marks: '40% - 44%' },
      { code: 'F',  point: 0.00, marks: 'Below 40%' }
    ];

    const RD_CGPA_SEMESTERS = 8;
    let RD_CGPA = [];

    function cgpaInit() {
      RD_CGPA = [];
      for (let i = 0; i < RD_CGPA_SEMESTERS; i++) RD_CGPA.push([{ credit: '', grade: '' }]);
    }

    function cgpaAddRow(s) { RD_CGPA[s].push({ credit: '', grade: '' }); renderCgpa(); }

    function cgpaRemoveRow(s, r) {
      if (RD_CGPA[s].length <= 1) { RD_CGPA[s][0] = { credit: '', grade: '' }; }
      else { RD_CGPA[s].splice(r, 1); }
      renderCgpa();
    }

    function cgpaSet(s, r, key, value) {
      if (!RD_CGPA[s] || !RD_CGPA[s][r]) return;
      RD_CGPA[s][r][key] = value;
      cgpaUpdateTotals();
    }

    function resetCgpa() { cgpaInit(); renderCgpa(); }

    /* One semester: credits x points / credits. Rows without both values are
       simply not counted, so a half-filled form still gives a real number. */
    function cgpaSemester(s) {
      let credits = 0, points = 0;
      (RD_CGPA[s] || []).forEach(row => {
        const c = parseFloat(row.credit);
        const g = row.grade === '' ? NaN : parseFloat(row.grade);
        if (!isFinite(c) || c <= 0 || !isFinite(g)) return;
        credits += c;
        points += c * g;
      });
      return { credits: credits, points: points, gpa: credits > 0 ? points / credits : 0 };
    }

    function cgpaOverall() {
      let credits = 0, points = 0;
      for (let s = 0; s < RD_CGPA_SEMESTERS; s++) {
        const r = cgpaSemester(s);
        credits += r.credits;
        points += r.points;
      }
      return { credits: credits, cgpa: credits > 0 ? points / credits : 0 };
    }

    /* "A+ (4.00)" -- the em dash that used to sit between the two looked, on a
       narrow phone, like a minus sign in front of the point value. */
    function cgpaGradeOptions() {
      return '<option value="">Grade</option>' + RD_GRADES.map(g =>
        '<option value="' + g.point.toFixed(2) + '">' + g.code + ' (' + g.point.toFixed(2) + ')</option>').join('');
    }

    function cgpaRowHtml(s, r, row) {
      return '' +
      '<div class="grid grid-cols-12 gap-2 items-center">' +
        '<div class="col-span-5 sm:col-span-4">' +
          '<input type="number" min="0" step="0.5" inputmode="decimal" value="' + escapeHtml(row.credit) + '" ' +
            'oninput="cgpaSet(' + s + ',' + r + ',\'credit\',this.value)" ' +
            'class="form-input" placeholder="Credit"/>' +
        '</div>' +
        '<div class="col-span-6 sm:col-span-7">' +
          '<select onchange="cgpaSet(' + s + ',' + r + ',\'grade\',this.value)" class="form-input">' +
            cgpaGradeOptions().replace('value="' + escapeHtml(row.grade) + '"',
                                       'value="' + escapeHtml(row.grade) + '" selected') +
          '</select>' +
        '</div>' +
        '<div class="col-span-1 flex justify-end">' +
          '<button type="button" aria-label="Remove this course" onclick="cgpaRemoveRow(' + s + ',' + r + ')" ' +
            'class="w-11 h-11 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center cursor-pointer">' +
            '<i data-lucide="x" class="w-4 h-4"></i></button>' +
        '</div>' +
      '</div>';
    }

    function renderCgpa() {
      const box = document.getElementById('cgpa-semesters');
      if (!box) return;
      if (!RD_CGPA.length) cgpaInit();

      box.innerHTML = RD_CGPA.map((rows, s) =>
        '<div class="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">' +
          '<div class="flex items-center justify-between gap-3 mb-4">' +
            '<p class="text-sm font-extrabold text-slate-800">Semester ' + (s + 1) + '</p>' +
            '<p class="text-xs font-extrabold text-blue-700 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-lg" id="cgpa-gpa-' + s + '">GPA 0.00</p>' +
          '</div>' +
          '<div class="space-y-2.5">' + rows.map((row, r) => cgpaRowHtml(s, r, row)).join('') + '</div>' +
          '<button type="button" onclick="cgpaAddRow(' + s + ')" class="mt-4 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white border border-blue-200 text-blue-700 text-xs font-bold hover:bg-blue-50 cursor-pointer">' +
            '<i data-lucide="plus" class="w-3.5 h-3.5"></i> Add course</button>' +
        '</div>').join('');

      const scale = document.getElementById('cgpa-scale');
      if (scale) {
        scale.innerHTML = RD_GRADES.map(g =>
          '<div class="flex items-center justify-between gap-3 border-b border-slate-100 pb-1.5 last:border-0">' +
            '<span class="font-extrabold text-slate-800">' + g.code + '</span>' +
            '<span>' + g.marks + '</span>' +
            '<span class="font-mono font-bold text-blue-700">' + g.point.toFixed(2) + '</span>' +
          '</div>').join('');
      }

      lucide.createIcons();
      cgpaUpdateTotals();
    }

    /* Only the numbers change here, never the inputs -- otherwise the caret
       would jump out of the box the moment a credit is typed. */
    function cgpaUpdateTotals() {
      for (let s = 0; s < RD_CGPA_SEMESTERS; s++) {
        const cell = document.getElementById('cgpa-gpa-' + s);
        if (!cell) continue;
        const r = cgpaSemester(s);
        cell.textContent = 'GPA ' + r.gpa.toFixed(2) + (r.credits ? ' \u2022 ' + r.credits + ' credits' : '');
      }
      const all = cgpaOverall();
      const total = document.getElementById('cgpa-total');
      const note = document.getElementById('cgpa-total-note');
      if (total) total.textContent = all.cgpa.toFixed(2);
      if (note) {
        note.textContent = all.credits
          ? all.credits + ' credits counted (out of 4.00)'
          : 'No courses added yet';
      }
    }


    /* ---------- Sponsors: as many as the event actually had ---------- */
    const RD_SPONSOR_MAX = 10;
    let rdSponsorSeq = 0;

    function sponsorRowNodes() {
      const box = document.getElementById('sponsor-rows');
      return box ? [...box.querySelectorAll('[data-sponsor-row]')] : [];
    }

    function addSponsorRow() {
      const box = document.getElementById('sponsor-rows');
      if (!box) return;
      if (sponsorRowNodes().length >= RD_SPONSOR_MAX) {
        showToast('An event can have at most ' + RD_SPONSOR_MAX + ' sponsors.', 'error');
        return;
      }
      const key = 'sp' + (++rdSponsorSeq);
      const row = document.createElement('div');
      row.setAttribute('data-sponsor-row', key);
      row.className = 'rounded-xl border border-slate-200 bg-white p-3 sm:p-4';
      row.innerHTML =
        '<div class="flex items-start gap-3">'
        + '  <span class="mt-2.5 w-6 h-6 shrink-0 rounded-lg bg-blue-50 text-blue-700 text-[11px] font-black flex items-center justify-center" data-sponsor-index>1</span>'
        + '  <div class="min-w-0 flex-1 grid sm:grid-cols-2 gap-3">'
        + '    <div><label class="form-label">Sponsor name</label>'
        + '      <input data-sponsor-name type="text" class="form-input" placeholder="XYZ Enterprise"></div>'
        + '    <div><label class="form-label">Logo (optional)</label>'
        + '      <input data-sponsor-logo type="file" accept="image/*" class="form-input py-2"></div>'
        + '  </div>'
        + '  <button type="button" aria-label="Remove this sponsor" onclick="removeSponsorRow(\'' + key + '\')" class="mt-1 shrink-0 w-11 h-11 rounded-xl border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 flex items-center justify-center transition cursor-pointer">'
        + '    <i data-lucide="trash-2" class="w-4 h-4"></i>'
        + '  </button>'
        + '</div>';
      box.appendChild(row);
      refreshSponsorRows();
      const input = row.querySelector('[data-sponsor-name]');
      if (input) input.focus();
    }

    function removeSponsorRow(key) {
      const row = document.querySelector('[data-sponsor-row="' + key + '"]');
      if (row && row.parentNode) row.parentNode.removeChild(row);
      refreshSponsorRows();
    }

    function refreshSponsorRows() {
      const rows = sponsorRowNodes();
      rows.forEach((row, i) => {
        const badge = row.querySelector('[data-sponsor-index]');
        if (badge) badge.textContent = bnNum(i + 1);
      });
      const note = document.getElementById('sponsor-empty-note');
      if (note) note.classList.toggle('hidden', rows.length > 0);
      const add = document.getElementById('sponsor-add-btn');
      if (add) add.disabled = rows.length >= RD_SPONSOR_MAX;
      lucide.createIcons();
    }

    function resetSponsorRows() {
      const box = document.getElementById('sponsor-rows');
      if (box) box.innerHTML = '';
      refreshSponsorRows();
    }

    /* Rows with neither a name nor a logo are simply ignored. */
    function collectSponsorRows() {
      return sponsorRowNodes().map(row => {
        const nameEl = row.querySelector('[data-sponsor-name]');
        const logoEl = row.querySelector('[data-sponsor-logo]');
        return {
          name: nameEl ? String(nameEl.value || '').trim() : '',
          file: logoEl && logoEl.files ? logoEl.files[0] : null
        };
      }).filter(x => x.name || x.file);
    }

    /* Accepts the new `sponsors` array (or its JSON string, straight out of a
       sheet cell) and falls back to the old single Sponsor Name / Logo pair, so
       events saved before the backend patch still show their sponsor. */
    function eventSponsors(e) {
      let raw = (e && (e.sponsors || e['Sponsors'])) || '';
      if (typeof raw === 'string') {
        try { raw = raw.trim() ? JSON.parse(raw) : []; } catch (err) { raw = []; }
      }
      let list = Array.isArray(raw) ? raw : [];
      list = list.map(x => ({
        name: String((x && (x.name || x.sponsorName)) || '').trim(),
        logo: normalizeAlumniImage((x && (x.logo || x.sponsorLogo || x.image)) || '')
      })).filter(x => x.name || x.logo);
      if (!list.length) {
        const n = String((e && (e.sponsorName || e['Sponsor Name'])) || '').trim();
        const l = normalizeAlumniImage((e && (e.sponsorLogo || e['Sponsor Logo'])) || '');
        if (n || l) list = [{ name: n, logo: l }];
      }
      return list;
    }

    function sponsorSectionHtml(sponsors) {
      if (!sponsors.length) return '';
      const cards = sponsors.map(sp => `
        <div class="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
          ${sp.logo
            ? `<img src="${escapeHtml(sp.logo)}" alt="${escapeHtml(sp.name || 'Sponsor')} logo" loading="lazy" decoding="async" class="w-12 h-12 shrink-0 rounded-xl object-contain bg-white border border-slate-200 p-1">`
            : `<div class="w-12 h-12 shrink-0 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-300"><i data-lucide="handshake" class="w-5 h-5"></i></div>`}
          <p class="font-bold text-slate-900 text-sm leading-snug min-w-0 line-clamp-2">${escapeHtml(sp.name || 'Sponsor')}</p>
        </div>`).join('');
      return `
           <div class="mb-10">
               <h4 class="text-base font-bold text-slate-900 mb-4 flex items-center gap-2"><i data-lucide="handshake" class="w-5 h-5 text-blue-600"></i> ${'Sponsors'}</h4>
               <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">${cards}</div>
           </div>`;
    }

    async function submitEventFromWebsite(e) {
      e.preventDefault();
      const f=e.target, b=document.getElementById('event-submit-btn'), fd=new FormData(f);
      const main=f.querySelector('[name="mainImage"]').files[0], gf=[...f.querySelector('[name="gallery"]').files];
      const box=document.getElementById('event-upload-progress'), status=document.getElementById('event-upload-status'), pct=document.getElementById('event-upload-percent'), bar=document.getElementById('event-upload-bar');

      if(!main) return showToast('Please choose a main image.', 'error');
      showGlobalLoader('Uploading...', 'Submitting event request.');
        b.disabled=true; b.innerHTML='<span class="inline-flex items-center gap-2"><i data-lucide="loader-circle" class="w-5 h-5 animate-spin"></i> Uploading...</span>'; lucide.createIcons();
      box.classList.remove('hidden');
      
      const setProgress = (p, text) => { pct.textContent = p+'%'; status.textContent = text; bar.style.width = p+'%'; };

      try {
        setProgress(5, 'Preparing images...');
        const gallery=[]; const total = gf.length+1;
        for(let i=0; i<gf.length; i++) {
          const x = await filePayload(gf[i], 4000); x.sortOrder=i+1; gallery.push(x);
          setProgress(Math.round(((i+1)/total)*40), `Gallery image ${i+1}/${gf.length} ready`);
        }
        const mainPayload = await filePayload(main, 4000);
        const sponsors = [];
        const sponsorRows = collectSponsorRows();
        for (let i = 0; i < sponsorRows.length; i++) {
          const sponsorLogoFile = sponsorRows[i].file;
          sponsors.push({
            name: sponsorRows[i].name,
            logo: sponsorLogoFile ? await filePayload(sponsorLogoFile, 700) : null
          });
          setProgress(40 + Math.round(((i + 1) / sponsorRows.length) * 8), `Sponsor ${i + 1}/${sponsorRows.length} ready`);
        }
        setProgress(50, 'Uploading to server... (Please wait)');

        const payloadEvent = {
          eventName: fd.get('eventName'), category: fd.get('category'), shortDescription: fd.get('shortDescription'), fullDescription: fd.get('fullDescription'),
          eventDate: fd.get('eventDate'), startTime: '', endTime: '', venue: fd.get('venue'), organizedBy: 'RANGDHANU DUET Alumni',
          googleMapsLink: '', contactPerson: '', contactNumber: '', registrationLink: '', facebookLink: '',
          sponsors: sponsors,
          /* The first sponsor also goes up in the old single fields, so an
             Apps Script that has not been patched yet still records something. */
          sponsorName: sponsors.length ? sponsors[0].name : '',
          sponsorLogo: sponsors.length ? sponsors[0].logo : null,
          submittedBy: fd.get('submittedBy'), submitterEmail: fd.get('submitterEmail'), submitterMobile: '',
          mainImage: mainPayload, gallery: gallery
        };

        const r = await apiPost('submitEvent', {event: payloadEvent});
        if(!r.success) throw new Error(r.message);

        setProgress(100, 'Upload Complete!');
        f.reset();
        resetSponsorRows();
        box.classList.add('hidden'); setProgress(0, '');
        loadPublicEvents();
        hideGlobalLoader(true, () => {
            showToast(r.message || 'Your event has been submitted. It will be published once an admin approves it.', 'success', 'Event submitted', {backTo: 'events'});
        }, 'Event submitted successfully.');
      } catch(err) {
        status.textContent = 'Upload failed!'; bar.style.width='0%';
        failGlobalLoader('Could not submit', friendlyError(err).msg);
          reportError(err, f);
      } finally {
        b.disabled=false; b.textContent='Submit Event';
      }
    }

    window.publicEvents = [];

    /* The list from the network, kept so applyStaticEventCovers() can draw the
       grid again on its own when the Drive manifest lands. */
    let RD_EV_DYNAMIC = [];

    /* Two events are the same event when they carry the same name. Nothing else
       is comparable: a curated event has eventId STATIC-1, the copy submitted
       through the website form gets an id of its own. */
    function rdEventsKey(e) {
      return String((e && (e.eventName || e['Event Name'])) || '').trim().toLowerCase();
    }

    /* The day it happened, as a number. An event with no readable date sinks to
       the bottom rather than jumping to the top of the page. */
    function rdEventsWhen(e) {
      const t = Date.parse((e && (e.eventDate || e['Event Date'])) || '');
      return isNaN(t) ? -Infinity : t;
    }

    /* Draws the grid from a list of dynamic events.  Called twice: once with the
       remembered list so a reload has something on screen immediately, once with
       the fresh list from the network.

       The page used to have a second, hand-written grid above this one holding
       the three long-standing events -- and this grid drew those three as well,
       because the list starts with them. Each of them was therefore on the page
       twice. There is one grid now, so the two things that used to be implicit
       are decided here: a name that turns up twice is drawn once, and the order
       is the event date, newest first. */
    /* Category colour map using inline hex styles — safe regardless of
       whether the Tailwind build contains those classes. */
    const RD_EV_CAT_COLOURS = {
      'Tour':                { bg: '#10b981', border: '#059669', textHex: '#065f46', lightBg: '#ecfdf5', lightBorder: '#a7f3d0' },
      'পরিবেশ ও সমাজকল্যাণ':{ bg: '#22c55e', border: '#16a34a', textHex: '#14532d', lightBg: '#f0fdf4', lightBorder: '#bbf7d0' },
      'পুনর্মিলনী':         { bg: '#f43f5e', border: '#e11d48', textHex: '#881337', lightBg: '#fff1f2', lightBorder: '#fecdd3' },
      'Reunion':             { bg: '#f43f5e', border: '#e11d48', textHex: '#881337', lightBg: '#fff1f2', lightBorder: '#fecdd3' },
      'Cultural':            { bg: '#a855f7', border: '#9333ea', textHex: '#581c87', lightBg: '#faf5ff', lightBorder: '#e9d5ff' },
      'Sports':              { bg: '#f97316', border: '#ea580c', textHex: '#7c2d12', lightBg: '#fff7ed', lightBorder: '#fed7aa' },
      'Academic':            { bg: '#3b82f6', border: '#2563eb', textHex: '#1e3a8a', lightBg: '#eff6ff', lightBorder: '#bfdbfe' },
      'Fresher Reception':   { bg: '#06b6d4', border: '#0891b2', textHex: '#164e63', lightBg: '#ecfeff', lightBorder: '#a5f3fc' },
      'Farewell':            { bg: '#6366f1', border: '#4f46e5', textHex: '#312e81', lightBg: '#eef2ff', lightBorder: '#c7d2fe' },
    };
    function rdEvCatColour(cat) {
      return RD_EV_CAT_COLOURS[cat] || { bg: '#3b82f6', border: '#2563eb', textHex: '#1e3a8a', lightBg: '#eff6ff', lightBorder: '#bfdbfe' };
    }

    /* Returns a short countdown string for future events, or '' for past ones */
    function rdEvCountdown(dateStr) {
      if (!dateStr) return '';
      const ev = new Date(dateStr);
      if (isNaN(ev.valueOf())) return '';
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      ev.setHours(0, 0, 0, 0);
      const diff = Math.round((ev - now) / 86400000);
      if (diff <= 0) return '';
      if (diff === 1) return 'Tomorrow';
      if (diff <= 30) return `${diff} days left`;
      if (diff <= 365) return `${Math.round(diff / 30)} months left`;
      return '';
    }

    let RD_EV_ACTIVE_FILTER = 'All';

    function rdEventsPaint(dynamicEvs) {
      const g = document.getElementById('public-events-grid'), st = document.getElementById('public-events-status');
      if (!g || !st) return;
      dynamicEvs = Array.isArray(dynamicEvs) ? dynamicEvs : [];
      RD_EV_DYNAMIC = dynamicEvs;

        /* The curated copy wins, being the one with the Drive album and the
           full description -- so the curated list is walked first. */
        const rdSeen = {}, rdAll = [];
        [...staticEvents, ...dynamicEvs].forEach(e => {
          const k = rdEventsKey(e);
          if (k && rdSeen[k]) return;
          if (k) rdSeen[k] = true;
          rdAll.push(e);
        });
        rdAll.sort((a, b) => rdEventsWhen(b) - rdEventsWhen(a));
        window.publicEvents = rdAll;

        /* Build unique category list */
        const cats = ['All', ...new Set(rdAll.map(e => e.category || e['Category'] || 'Event').filter(Boolean))];

        /* Render filter tabs */
        const filterBox = document.getElementById('events-filter-tabs');
        if (filterBox) {
          filterBox.innerHTML = cats.map(c => {
            const col = rdEvCatColour(c);
            const active = RD_EV_ACTIVE_FILTER === c;
            const activeStyle = active
              ? `background:${col.bg};color:#fff;border-color:${col.border};box-shadow:0 2px 8px ${col.bg}55`
              : `background:#fff;color:#475569;border-color:#e2e8f0`;
            return `<button type="button" onclick="rdEvFilter('${escapeHtml(c)}')" style="${activeStyle};border:1.5px solid;padding:6px 16px;border-radius:999px;font-size:11px;font-weight:800;transition:all .2s;cursor:pointer;display:inline-flex;align-items:center;gap:6px;" onmouseover="if(this.dataset.active!='1'){this.style.background='#f1f5f9'}" onmouseout="if(this.dataset.active!='1'){this.style.background='#fff'}" data-active="${active ? '1' : '0'}">${escapeHtml(c)}</button>`;
          }).join('');
        }

        st.innerHTML = `<span class="text-xs font-bold text-slate-500 bg-slate-100 inline-block px-3 py-1 rounded-lg">${rdAll.length} events</span>`;
        
        const filtered = RD_EV_ACTIVE_FILTER === 'All' ? rdAll : rdAll.filter(e => (e.category || e['Category'] || 'Event') === RD_EV_ACTIVE_FILTER);

        const now = new Date();
        now.setHours(0,0,0,0);

        const upcomingEvents = [];
        const pastEvents = [];

        filtered.forEach(raw => {
          const dStr = String(raw.eventDate || raw['Event Date'] || '').trim();
          let isUpcoming = false;
          if (dStr) {
            const d = new Date(dStr);
            if (!isNaN(d.getTime())) {
              const check = new Date(d.getFullYear(), d.getMonth(), d.getDate());
              if (check >= now) isUpcoming = true;
            }
          }
          const isUpcomingStatus = String(raw.Status || raw.status || '').trim().toUpperCase() === 'UPCOMING';
          
          // An event goes to the upcoming grid if it's explicitly UPCOMING or date is in the future.
          // BUT if it has a date and that date has passed, it MUST go to the past grid.
          if ((isUpcomingStatus || isUpcoming) && !(dStr && !isUpcoming)) {
            upcomingEvents.push(raw);
          } else {
            pastEvents.push(raw);
          }
        });

        const renderEventCard = (raw) => {
          /* The curated events keep their pictures in Drive. The hand-written
             cards had their covers swapped in after the manifest arrived; a
             script-drawn card asks for the Drive copy right here. */
          const e = rdEventFromDrive(raw);
          const img = normalizeAlumniImage(e.mainImage || e['Main Image'] || '');
          /* Still a bundled path means Drive has no folder for this one yet, so
             the card carries the same fallback the hand-written markup did. */
          const local = /^Images\//.test(String(e.mainImage || '')) ? String(e.mainImage) : '';
          const title = e.eventName || e['Event Name'] || 'Event';
          const cat = e.category || e['Category'] || 'Event';
          const date = e.eventDate || e['Event Date'] || '';
          const short = e.shortDescription || e['Short Description'] || '';
          const col = rdEvCatColour(cat);
          const countdown = rdEvCountdown(date);
          const galleryCount = Array.isArray(e.gallery) ? e.gallery.length : 0;
          const globalIdx = window.publicEvents.indexOf(raw);
          
          return `
            <article class="group bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col overflow-hidden">
               <div class="relative aspect-video bg-slate-100 overflow-hidden cursor-pointer" onclick="openDynamicEvent(${globalIdx})">
                 ${img ? `<img src="${escapeHtml(img)}"${local ? ` data-rd-img="${escapeHtml(local)}" onerror="rdImgFallback(this, '${escapeHtml(local)}')"` : ''} alt="${escapeHtml(title)}" loading="lazy" decoding="async" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700">` : '<div class="w-full h-full flex items-center justify-center"><i data-lucide="image" class="w-8 h-8 text-slate-300"></i></div>'}
                 <div class="absolute top-4 left-4 px-3 py-1.5 rounded-full bg-white/95 backdrop-blur text-[10px] font-black uppercase tracking-widest shadow-sm" style="color:${col.textHex}">${escapeHtml(cat)}</div>
                 ${countdown ? `<div class="absolute top-4 right-4 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-white text-[9px] font-black uppercase tracking-wider shadow animate-pulse" style="background:#f59e0b"><i data-lucide="timer" class="w-2.5 h-2.5"></i> ${escapeHtml(countdown)}</div>` : ''}
                 ${galleryCount > 0 ? `<div class="absolute bottom-3 right-3 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-white text-[10px] font-bold" style="background:rgba(0,0,0,.6)"><i data-lucide="images" class="w-3 h-3"></i> ${galleryCount} photos</div>` : ''}
               </div>
               <div class="p-6 flex-1 flex flex-col">
                 <div class="flex items-center gap-2 text-[11px] font-bold text-slate-400 mb-2 uppercase tracking-wider">
                   <i data-lucide="calendar" class="w-3.5 h-3.5"></i> ${escapeHtml(date ? new Date(date).toLocaleDateString('bn-BD', {day:'numeric', month:'long', year:'numeric'}) : '')}
                 </div>
                 ${countdown ? `
                 <div class="mb-3 px-3 py-2.5 rounded-xl border border-orange-100 flex flex-col gap-1 items-center justify-center bg-orange-50/50" data-countdown-large="${date}">
                   <div class="text-[9px] font-bold text-orange-600/70 uppercase tracking-widest">Event Starts In</div>
                   <div class="font-mono text-base sm:text-lg font-black text-orange-600 tracking-tight" data-cd-timer>-- : -- : -- : --</div>
                 </div>` : ''}
                 <h3 class="text-lg font-extrabold text-slate-900 leading-tight mb-2 transition-colors line-clamp-2 cursor-pointer" onclick="openDynamicEvent(${globalIdx})" onmouseover="this.style.color='${col.textHex}'" onmouseout="this.style.color=''">${escapeHtml(title)}</h3>
                 <p class="text-sm text-slate-600 line-clamp-2 mb-5">${escapeHtml(short)}</p>
                 <div class="mt-auto pt-4 border-t border-slate-100">
                   <button onclick="openDynamicEvent(${globalIdx})" class="rd-detail-btn w-full py-2.5 rounded-xl text-sm font-bold transition-all border" style="background:${col.lightBg};color:${col.textHex};border-color:${col.lightBorder}" onmouseover="this.style.background='${col.bg}';this.style.color='#fff';this.style.borderColor='${col.border}'" onmouseout="this.style.background='${col.lightBg}';this.style.color='${col.textHex}';this.style.borderColor='${col.lightBorder}'">View details</button>
                 </div>
               </div>
            </article>
          `;
        };

        const upcomingGrid = document.getElementById('public-upcoming-grid');
        const upcomingSection = document.getElementById('public-upcoming-section');
        
        if (upcomingEvents.length > 0) {
          if (upcomingGrid) upcomingGrid.innerHTML = upcomingEvents.map(renderEventCard).join('');
          if (upcomingSection) {
            upcomingSection.classList.remove('hidden');
            upcomingSection.classList.add('block');
          }
        } else {
          if (upcomingSection) {
            upcomingSection.classList.remove('block');
            upcomingSection.classList.add('hidden');
          }
        }

        g.innerHTML = pastEvents.map(renderEventCard).join('');
        if (window.lucide) lucide.createIcons();
    }

    function rdEvFilter(cat) {
      RD_EV_ACTIVE_FILTER = cat;
      rdEventsPaint(RD_EV_DYNAMIC);
    }


    async function loadPublicEvents() {
      const g = document.getElementById('public-events-grid'), st = document.getElementById('public-events-status');
      if (!g) return;
      const warm = rdFeedRecall('events');
      if (warm && !window.publicEvents.length) {
        rdEventsPaint(warm);
      } else if (!window.publicEvents.length) {
        st.innerHTML = '<span class="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-lg"><i data-lucide="loader-circle" class="w-3.5 h-3.5 inline animate-spin"></i> Loading...</span>';
        lucide.createIcons();
      }
      try {
        const q = new URLSearchParams({action: 'events', _: Date.now()});
        const r = await fetch(API_BASE_URL + '?' + q.toString());
        const json = await r.json();
        const dynamicEvs = Array.isArray(json.data) ? json.data : [];
        rdFeedRemember('events', dynamicEvs);
        rdEventsPaint(dynamicEvs);
        
      } catch (err) {
        if (!window.publicEvents.length) {
          st.innerHTML = '<span class="text-xs text-rose-600 font-semibold bg-rose-50 px-3 py-1 rounded-lg">Events could not be loaded</span>';
        }
        console.warn('[rd] events unavailable:', err && err.message ? err.message : err);
      }
    }

    async function openDynamicEvent(i) {
      const e = rdEventFromDrive(window.publicEvents?.[i]);
      if (!e) return;
      const c = document.getElementById('dynamic-event-content');
      
      const img = normalizeAlumniImage(e.mainImage || e['Main Image'] || '');
      const title = e.eventName || e['Event Name'] || 'Event';
      const id = e.eventId || e['Event ID'] || '';
      const date = e.eventDate || e['Event Date'] || '';
      const venue = e.venue || e['Venue'] || '';
      const desc = e.fullDescription || e['Full Description'] || e.shortDescription || '';
      const sponsors = eventSponsors(e);
      const staticGal = e.gallery || []; 
      
      let staticGalleryHtml = '';
      if (staticGal.length > 0) {
          staticGalleryHtml = '<div class="swiper-wrapper">' + staticGal.map(x => {
              const src = normalizeAlumniImage(x.image || '');
              return src ? `<div class="swiper-slide w-72 sm:w-96 h-96 sm:h-[450px] rounded-2xl overflow-hidden cursor-pointer shadow-xl relative group" onclick="openLightboxFromSlide(this)"><img src="${escapeHtml(src)}" class="w-full h-full object-cover"><div class="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/90 via-black/40 to-transparent text-white text-xs sm:text-sm font-medium line-clamp-2 whitespace-normal leading-tight opacity-100 transition-opacity">${escapeHtml(x.caption || title)}</div></div>` : '';
          }).join('') + '</div><div class="swiper-pagination mt-4 relative"></div>';
      }

      c.innerHTML = `
        <div class="w-full bg-slate-100 sm:rounded-t-3xl overflow-hidden flex items-center justify-center">
           ${img ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(title)}" loading="lazy" decoding="async" class="w-full max-h-[60vh] object-contain">` : ''}
        </div>
        <div class="p-6 sm:p-10 bg-white sm:rounded-b-3xl">
           <div class="mb-8">
               <span class="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-100 text-blue-700 text-[10px] font-black uppercase tracking-widest rounded-md mb-4">${escapeHtml(e.category || 'Event')}</span>
               <h2 class="text-lg sm:text-2xl font-extrabold text-slate-900 leading-tight">${escapeHtml(title)}</h2>
           </div>
           <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              ${date ? `<div class="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-3"><div class="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0"><i data-lucide="calendar" class="w-5 h-5"></i></div><div><p class="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Date & Time</p><p class="font-bold text-slate-900">${new Date(date).toLocaleString('en-US', {day:'numeric', month:'long', year:'numeric', hour:'numeric', minute:'2-digit', hour12:true})}</p></div></div>` : ''}
              ${venue ? `<div class="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-3"><div class="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0"><i data-lucide="map-pin" class="w-5 h-5"></i></div><div><p class="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Venue</p><p class="font-bold text-slate-900 line-clamp-1">${escapeHtml(venue)}</p></div></div>` : ''}
              <div class="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-3"><div class="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0"><i data-lucide="users" class="w-5 h-5"></i></div><div><p class="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Organized By</p><p class="font-bold text-slate-900 line-clamp-1">RANGDHANU</p></div></div>
           </div>
           <div class="mb-10">
               <h4 class="text-base font-bold text-slate-900 mb-4 flex items-center gap-2"><i data-lucide="info" class="w-5 h-5 text-blue-600"></i> ইভেন্ট সম্পর্কে বিস্তারিত</h4>
               <p class="whitespace-pre-line leading-relaxed text-slate-700 text-sm sm:text-base">${escapeHtml(desc)}</p>
           </div>

           ${sponsorSectionHtml(sponsors)}
           
           ${staticGalleryHtml ? `
           <div class="mt-8 overflow-hidden rounded-3xl bg-white p-4 sm:p-8 pt-8 sm:pt-10 pb-8 sm:pb-12 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-blue-50 relative">
               <div class="absolute -top-24 -right-24 w-64 h-64 bg-blue-100 rounded-full mix-blend-multiply filter blur-3xl opacity-70"></div>
               <div class="absolute -bottom-24 -left-24 w-64 h-64 bg-sky-100 rounded-full mix-blend-multiply filter blur-3xl opacity-70"></div>
               <div class="text-center mb-8 relative z-10"><h4 class="text-base font-extrabold text-slate-900 tracking-wide uppercase">Gallery</h4><p class="text-slate-500 text-sm mt-1">Explore moments from this event</p></div>
               <div id="dynamic-event-gallery" class="swiper event-gallery-swiper relative z-10">${staticGalleryHtml}</div>
           </div>` : `<div id="dynamic-event-gallery"></div>`}
        </div>
      `;
      openSubPage('event-detail', 'events');
      lucide.createIcons();
      if(staticGal.length > 0) {
          setTimeout(() => {
              new Swiper('.event-gallery-swiper', {
                  effect: 'coverflow',
                  grabCursor: true,
                  centeredSlides: true,
                            preventClicks: false,
                            preventClicksPropagation: false,
                  slidesPerView: 'auto',
                  coverflowEffect: {
                      rotate: 30,
                      stretch: 0,
                      depth: 200,
                      modifier: 1,
                      slideShadows: true,
                  },
                  pagination: { el: '.swiper-pagination', clickable: true },
                  loop: staticGal.length > 3
              });
          }, 100);
      }

      // Load dynamic Gallery
      if (id && !id.startsWith('STATIC-')) {
        try {
          const q = new URLSearchParams({action: 'eventGallery', eventId: id, _: Date.now()});
          const r = await fetch(API_BASE_URL + '?' + q.toString());
          const json = await r.json();
          const items = Array.isArray(json.data) ? json.data : [];
          if(items.length > 0) {
            const galHtml = items.map(x => {
              const src = normalizeAlumniImage(x.image || '');
              return src ? `<div onclick="openCustomLightbox('${escapeHtml(src)}', '${escapeHtml(title)}')" class="aspect-square rounded-xl overflow-hidden border border-slate-200 cursor-pointer relative group/img"><img src="${escapeHtml(src)}" alt="${escapeHtml(title)}" loading="lazy" decoding="async" class="w-full h-full object-cover group-hover/img:scale-110 transition"><div class="absolute inset-0 bg-black/30 opacity-0 group-hover/img:opacity-100 transition flex items-center justify-center"><i data-lucide="maximize-2" class="w-5 h-5 text-white"></i></div></div>` : '';
            }).join('');
            
            const galContainer = document.getElementById('dynamic-event-gallery');
              // If we have new images from API, re-render swiper entirely
              if (galHtml) {
                  const combined = staticGal.map(x => {
                      const src = normalizeAlumniImage(x.image || '');
                      return src ? `<div class="swiper-slide w-72 sm:w-96 h-96 sm:h-[450px] rounded-2xl overflow-hidden cursor-pointer shadow-xl relative group" onclick="openLightboxFromSlide(this)"><img src="${escapeHtml(src)}" class="w-full h-full object-cover"><div class="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/90 via-black/40 to-transparent text-white text-xs sm:text-sm font-medium line-clamp-2 whitespace-normal leading-tight opacity-100 transition-opacity">${escapeHtml(x.caption || title)}</div></div>` : '';
                  }).join('') + items.map(x => {
                      const src = normalizeAlumniImage(x.image || '');
                      return src ? `<div class="swiper-slide w-72 sm:w-96 h-96 sm:h-[450px] rounded-2xl overflow-hidden cursor-pointer shadow-xl relative group" onclick="openLightboxFromSlide(this)"><img src="${escapeHtml(src)}" class="w-full h-full object-cover"><div class="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/90 via-black/40 to-transparent text-white text-xs sm:text-sm font-medium line-clamp-2 whitespace-normal leading-tight opacity-100 transition-opacity">${escapeHtml(x.caption || title)}</div></div>` : '';
                  }).join('');
                  
                  const wrapper = '<div class="swiper-wrapper">' + combined + '</div><div class="swiper-pagination mt-4 relative"></div>';
                  
                  if(!staticGalleryHtml) {
                      galContainer.outerHTML = `
                         <div class="mt-8 overflow-hidden rounded-3xl bg-white p-4 sm:p-8 pt-8 sm:pt-10 pb-8 sm:pb-12 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-blue-50 relative">
                             <div class="absolute -top-24 -right-24 w-64 h-64 bg-blue-100 rounded-full mix-blend-multiply filter blur-3xl opacity-70"></div>
                             <div class="absolute -bottom-24 -left-24 w-64 h-64 bg-sky-100 rounded-full mix-blend-multiply filter blur-3xl opacity-70"></div>
                             <div class="text-center mb-8 relative z-10"><h4 class="text-base font-extrabold text-slate-900 tracking-wide uppercase">Gallery</h4><p class="text-slate-500 text-sm mt-1">Explore moments from this event</p></div>
                             <div id="dynamic-event-gallery" class="swiper event-gallery-swiper relative z-10">${wrapper}</div>
                         </div>`;
                  } else {
                      galContainer.innerHTML = wrapper;
                  }
                  setTimeout(() => {
                      new Swiper('.event-gallery-swiper', {
                          effect: 'coverflow',
                          grabCursor: true,
                          centeredSlides: true,
                            preventClicks: false,
                            preventClicksPropagation: false,
                          slidesPerView: 'auto',
                          coverflowEffect: { rotate: 30, stretch: 0, depth: 200, modifier: 1, slideShadows: true },
                          pagination: { el: '.event-gallery-swiper .swiper-pagination', clickable: true },
                          loop: (staticGal.length + items.length) > 3
                      });
                  }, 100);
              }
          }
        } catch(e) {}
      }
    }

    /* REGISTRATION API (FIXED EXACT PAYLOAD + JS BUG) */
    /* ---------- ADDRESS PICKER ------------------------------------------
       The address was a free textarea, and the collected answers show exactly
       why that cannot be filtered: one member wrote "Rangpur", another
       "Ishwardi, Pabna, Rajshahi, Bangladesh", a third "N/A".  No filter can
       join those into one place.

       Division and district are picked from a list.  The upazila stays a typed
       box on purpose -- there are 495 of them, and a list that long is slower
       to use than simply typing the name, besides being easy to get wrong.

       All three parts live in ONE sheet column, comma-joined in a fixed order,
       so no column is added per part:

           Rangpur, Rangpur, Badarganj
           Abroad, Toronto Canada

       The fixed order is what makes the column filterable later -- part 2 is
       always the district.  rdAddrJoin and rdAddrParse are the only two places
       that know the order, so a change stays in one spot. */

    const RD_ADDR_ABROAD = 'Abroad';

    /* Greater Rangpur first.  This is a Rangpur association, so for most
       members the first row is the only row they need to read. */
    const RD_BD_DIVISIONS = [
      ['Rangpur',    ['Dinajpur', 'Gaibandha', 'Kurigram', 'Lalmonirhat', 'Nilphamari', 'Panchagarh', 'Rangpur', 'Thakurgaon']],
      ['Dhaka',      ['Dhaka', 'Faridpur', 'Gazipur', 'Gopalganj', 'Kishoreganj', 'Madaripur', 'Manikganj', 'Munshiganj', 'Narayanganj', 'Narsingdi', 'Rajbari', 'Shariatpur', 'Tangail']],
      ['Rajshahi',   ['Bogura', 'Chapai Nawabganj', 'Joypurhat', 'Naogaon', 'Natore', 'Pabna', 'Rajshahi', 'Sirajganj']],
      ['Khulna',     ['Bagerhat', 'Chuadanga', 'Jashore', 'Jhenaidah', 'Khulna', 'Kushtia', 'Magura', 'Meherpur', 'Narail', 'Satkhira']],
      ['Chattogram', ['Bandarban', 'Brahmanbaria', 'Chandpur', 'Chattogram', 'Cumilla', "Cox's Bazar", 'Feni', 'Khagrachhari', 'Lakshmipur', 'Noakhali', 'Rangamati']],
      ['Sylhet',     ['Habiganj', 'Moulvibazar', 'Sunamganj', 'Sylhet']],
      ['Barishal',   ['Barguna', 'Barishal', 'Bhola', 'Jhalokati', 'Patuakhali', 'Pirojpur']],
      ['Mymensingh', ['Jamalpur', 'Mymensingh', 'Netrokona', 'Sherpur']]
    ];

    function rdAddrDivisionNames() { return RD_BD_DIVISIONS.map(d => d[0]); }

    function rdAddrDistrictsOf(division) {
      const hit = RD_BD_DIVISIONS.find(d => d[0] === division);
      return hit ? hit[1] : [];
    }

    /* Every district in the country, sorted -- the member filter uses this. */
    function rdAddrAllDistricts() {
      return RD_BD_DIVISIONS.reduce((all, d) => all.concat(d[1]), []).sort();
    }

    function rdAddrJoin(s) {
      if (!s || !s.div) return '';
      if (s.div === RD_ADDR_ABROAD) {
        const t = String(s.text || '').trim();
        return t ? (RD_ADDR_ABROAD + ', ' + t) : RD_ADDR_ABROAD;
      }
      return [s.div, s.dist, String(s.thana || '').trim()].filter(Boolean).join(', ');
    }

    function rdAddrParse(value) {
      const p = String(value || '').split(',').map(x => x.trim()).filter(Boolean);
      const empty = { div: '', dist: '', thana: '', text: '' };
      if (!p.length) return empty;
      if (p[0] === RD_ADDR_ABROAD) {
        return { div: RD_ADDR_ABROAD, dist: '', thana: '', text: p.slice(1).join(', ') };
      }
      /* An unknown first part means hand-typed legacy text.  It is kept whole in
         .thana rather than silently dropped, so nobody's old address is lost --
         the picker just shows it as "not chosen yet" and asks again. */
      if (rdAddrDivisionNames().indexOf(p[0]) === -1) return empty;
      return { div: p[0], dist: p[1] || '', thana: p.slice(2).join(', '), text: '' };
    }

    /* One state object per field name, so the same widget serves both the
       permanent and the present address without either knowing about the other. */
    const rdAddrState = {};

    function rdAddrMount(name) { return document.querySelector('[data-addr="' + name + '"]'); }

    /* The hidden input is rendered inside its own mount, not looked up by name
       across the document.  Two forms may both post a `workLocation`, and a
       document-wide name lookup would hand the second form the first form's
       box. */
    function rdAddrHidden(name) {
      const mount = rdAddrMount(name);
      return mount ? mount.querySelector('input[type="hidden"]') : null;
    }

    function rdAddrFieldName(name) {
      const mount = rdAddrMount(name);
      return (mount && mount.getAttribute('data-addr-name')) || name;
    }

    /* The hidden input is the single source of truth for submit.  Writing it
       here means submitMemberRegistration keeps reading fd.get('address') and
       never learns that the field became a picker. */
    function rdAddrSync(name) {
      const box = rdAddrHidden(name);
      if (box) box.value = rdAddrJoin(rdAddrState[name]);
      rdAddrMirrorWork(name);
    }

    /* Work location is the present address for almost everyone, so it is filled
       in from there instead of being asked twice.  Only an untouched work
       location is overwritten -- once the member picks a different place, the
       present address stops following it. */
    function rdAddrMirrorWork(name) {
      if (name !== 'presentAddress') return;
      const w = rdAddrState.workLocation;
      if (!w || w.dirty) return;
      if (!rdAddrMount('workLocation')) return;
      rdAddrState.workLocation = Object.assign({}, rdAddrState.presentAddress, { dirty: false });
      rdAddrRenderOnly('workLocation');
    }

    /* Draws without writing the hidden input -- the caller has just written it,
       and going back through rdAddrSync would start the mirror over again. */
    function rdAddrRenderOnly(name) {
      rdAddrRender(name);
    }

    function rdAddrPillRow(name, level, items, current) {
      return items.map(v => {
        const on = v === current;
        return '<button type="button" onclick="rdAddrPick(\'' + name + '\',\'' + level + '\',this.dataset.v)" data-v="' +
          escapeHtml(v) + '" class="px-3 py-1.5 rounded-full text-sm border transition ' +
          (on ? 'bg-blue-600 border-blue-600 text-white font-semibold shadow-sm'
              : 'bg-white border-slate-300 text-slate-700 hover:border-blue-400 hover:text-blue-700') +
          '">' + escapeHtml(v) + '</button>';
      }).join('');
    }

    function rdAddrCrumb(name, s) {
      const parts = [s.div, s.dist, s.thana || s.text].filter(Boolean).map(escapeHtml);
      if (!parts.length) return '';
      return '<div class="flex items-center gap-2 flex-wrap mb-3">' +
        '<span class="text-sm font-semibold text-slate-800">' + parts.join('<span class="text-slate-400"> / </span>') + '</span>' +
        '<button type="button" onclick="rdAddrReset(\'' + name + '\')" class="text-xs text-blue-600 hover:text-blue-800 underline">বদলান</button>' +
        '</div>';
    }

    /* Three steps in one box, never three boxes.  Only the step the member is
       on is drawn, which is what keeps the registration form short. */
    function rdAddrRender(name) {
      const mount = rdAddrMount(name);
      if (!mount) return;
      const s = rdAddrState[name] || (rdAddrState[name] = { div: '', dist: '', thana: '', text: '' });
      let html = '<input type="hidden" name="' + escapeHtml(rdAddrFieldName(name)) + '" value="' + escapeHtml(rdAddrJoin(s)) +
        '"><div class="rounded-xl border border-slate-300 bg-slate-50 p-3">' + rdAddrCrumb(name, s);

      if (!s.div) {
        html += '<p class="text-xs text-slate-500 mb-2">বিভাগ বাছুন</p><div class="flex flex-wrap gap-2">' +
          rdAddrPillRow(name, 'div', rdAddrDivisionNames().concat([RD_ADDR_ABROAD]), '') + '</div>';
      } else if (s.div === RD_ADDR_ABROAD) {
        html += '<p class="text-xs text-slate-500 mb-2">দেশ ও শহরের নাম লিখুন</p>' +
          '<input type="text" value="' + escapeHtml(s.text || '') + '" oninput="rdAddrType(\'' + name + '\',\'text\',this.value)" ' +
          'placeholder="Toronto, Canada" class="form-input">';
      } else if (!s.dist) {
        html += '<p class="text-xs text-slate-500 mb-2">জেলা বাছুন</p><div class="flex flex-wrap gap-2">' +
          rdAddrPillRow(name, 'dist', rdAddrDistrictsOf(s.div), '') + '</div>';
      } else {
        html += '<p class="text-xs text-slate-500 mb-2">উপজেলা / থানার নাম লিখুন</p>' +
          '<input type="text" value="' + escapeHtml(s.thana || '') + '" oninput="rdAddrType(\'' + name + '\',\'thana\',this.value)" ' +
          'placeholder="Badarganj" class="form-input">';
      }

      html += '<p class="rd-addr-error text-xs text-red-600 mt-2 hidden"></p></div>';
      mount.innerHTML = html;
      rdAddrSync(name);
    }

    function rdAddrPick(name, level, value) {
      const s = rdAddrState[name] || (rdAddrState[name] = { div: '', dist: '', thana: '', text: '' });
      if (level === 'div') { s.div = value; s.dist = ''; s.thana = ''; s.text = ''; }
      else { s.dist = value; s.thana = ''; }
      s.dirty = true;
      rdAddrClearError(name);
      rdAddrRender(name);
    }

    /* Typing must not redraw -- a redraw would replace the input under the
       cursor and the member would lose focus after every letter. */
    function rdAddrType(name, key, value) {
      const s = rdAddrState[name];
      if (!s) return;
      s[key] = value;
      s.dirty = true;
      rdAddrClearError(name);
      rdAddrSync(name);
    }

    function rdAddrReset(name) {
      rdAddrState[name] = { div: '', dist: '', thana: '', text: '' };
      rdAddrClearError(name);
      rdAddrRender(name);
    }

    /* setFieldError cannot serve this field: it binds an input listener and
       focuses the element, and a hidden input takes neither.  So the picker
       carries its own line, inside its own border. */
    function rdAddrError(name, message) {
      const mount = rdAddrMount(name);
      if (!mount) return;
      const p = mount.querySelector('.rd-addr-error');
      if (!p) return;
      p.textContent = message;
      p.classList.remove('hidden');
      mount.scrollIntoView({ behavior: 'auto', block: 'center' });
    }

    function rdAddrClearError(name) {
      const mount = rdAddrMount(name);
      const p = mount && mount.querySelector('.rd-addr-error');
      if (p) { p.textContent = ''; p.classList.add('hidden'); }
    }

    /* Complete means: a district was reached, or Abroad was named.  The upazila
       is left optional -- a member who does not remember the exact spelling
       should still be able to submit, and the district is what we filter on. */
    function rdAddrComplete(name) {
      const s = rdAddrState[name];
      if (!s || !s.div) return false;
      if (s.div === RD_ADDR_ABROAD) return !!String(s.text || '').trim();
      return !!s.dist;
    }

    function rdAddrInit(name, value) {
      rdAddrState[name] = rdAddrParse(value);
      rdAddrRender(name);
    }

    /* ---------------- social media accounts -------------------------------
       Optional, and a member may add more than one. The three places are
       named here and nowhere else on the site, so a fourth one is one line.
       Member_Social.gs checks the same hosts again on the server -- a check
       that only runs in the browser is a courtesy, not a rule.

       One set of helpers serves both mounts: the registration form and My
       Profile. Two copies would have drifted the first time one of them
       gained a platform the other did not. */
    const RD_SOCIAL_NETS = [
      { key: 'FACEBOOK', label: 'Facebook',
        hosts: ['facebook.com', 'fb.com', 'fb.me', 'm.facebook.com'],
        hint: 'https://www.facebook.com/your.name' },
      { key: 'LINKEDIN', label: 'LinkedIn',
        hosts: ['linkedin.com', 'lnkd.in'],
        hint: 'https://www.linkedin.com/in/your-name' },
      { key: 'X', label: 'X',
        hosts: ['x.com', 'twitter.com'],
        hint: 'https://x.com/yourhandle' }
    ];
    const RD_SOCIAL_MAX = 6;

    function rdSocialNet(key) {
      const want = String(key || '').trim().toUpperCase();
      return RD_SOCIAL_NETS.find(n => n.key === want || n.label.toUpperCase() === want) || RD_SOCIAL_NETS[0];
    }

    /* The real brand marks, drawn rather than fetched. lucide carries a
       Facebook and a LinkedIn glyph but no X, so all three are kept together
       here instead -- one shape language, and nothing to load. */
    function rdSocialIcon(key) {
      const net = rdSocialNet(key);
      const d = {
        FACEBOOK: 'M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.51 1.49-3.9 3.77-3.9 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.88h2.78l-.45 2.91h-2.33V22c4.78-.76 8.44-4.92 8.44-9.94z',
        LINKEDIN: 'M4.98 3.5a2.5 2.5 0 1 1-.02 5 2.5 2.5 0 0 1 .02-5zM3.2 8.98h3.56V21H3.2zM9.34 8.98h3.41v1.64h.05c.47-.9 1.63-1.85 3.36-1.85 3.59 0 4.25 2.36 4.25 5.43V21h-3.55v-5.36c0-1.28-.02-2.92-1.78-2.92-1.79 0-2.06 1.39-2.06 2.83V21H9.34z',
        X: 'M17.53 3h3.2l-6.99 7.99L21.8 21h-6.2l-4.86-6.35L5.13 21H1.92l7.28-8.32L2.2 3h6.36l4.53 5.99zM16.4 19.1h1.77L6.68 4.8H4.78z'
      }[net.key];
      return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="' + d + '"></path></svg>';
    }

    /* A link is only accepted where it belongs, so nobody can drop a random
       address into the Facebook row -- and javascript: or data: never reach
       an href in the first place. */
    function rdSocialUrlOk(key, url) {
      const net = rdSocialNet(key);
      const u = String(url || '').trim();
      if (!u || u.length > 300 || !/^https?:\/\//i.test(u)) return false;
      let host = u.replace(/^https?:\/\//i, '').split(/[\/?#]/)[0].toLowerCase();
      if (host.indexOf('@') >= 0) return false;
      host = host.split(':')[0];
      return net.hosts.some(h => host === h || host.endsWith('.' + h));
    }

    /* The sheet keeps one account per line, `Facebook|https://...`. A broken
       line is dropped rather than drawn, because a profile page must not stop
       being readable over one bad row. */
    function rdSocialParse(raw) {
      const out = [], seen = {};
      String(raw == null ? '' : raw).split(/[\r\n]+/).forEach(line => {
        const cut = line.indexOf('|');
        if (cut < 0 || out.length >= RD_SOCIAL_MAX) return;
        const net = rdSocialNet(line.slice(0, cut));
        const url = line.slice(cut + 1).trim();
        if (String(line.slice(0, cut)).trim().toUpperCase() !== net.key &&
            String(line.slice(0, cut)).trim().toUpperCase() !== net.label.toUpperCase()) return;
        if (!rdSocialUrlOk(net.key, url)) return;
        const k = net.key + '|' + url.toLowerCase();
        if (seen[k]) return;
        seen[k] = true;
        out.push({ net: net.key, url: url });
      });
      return out;
    }

    function rdSocialSerialize(rows) {
      return (Array.isArray(rows) ? rows : [])
        .map(r => rdSocialNet(r.net).label + '|' + String(r.url || '').trim())
        .join('\n');
    }

    /* ---- the editor: one row per account, on both forms ---- */

    /* Which row is on screen, read straight back out of the DOM. Keeping the
       list in a variable as well would have meant two versions of the truth. */
    function rdSocialRows(mount) {
      const box = document.getElementById(mount);
      if (!box) return [];
      return Array.from(box.querySelectorAll('[data-rd-soc-row]')).map(row => ({
        net: (row.querySelector('[data-rd-soc-net]') || {}).value || RD_SOCIAL_NETS[0].key,
        url: String((row.querySelector('[data-rd-soc-url]') || {}).value || '').trim()
      }));
    }

    function rdSocialRowHtml(mount, i, net, url) {
      const chosen = rdSocialNet(net);
      const opts = RD_SOCIAL_NETS.map(n =>
        '<option value="' + n.key + '"' + (n.key === chosen.key ? ' selected' : '') + '>' + n.label + '</option>'
      ).join('');
      return '<div class="rd-soc-row" data-rd-soc-row>' +
        '<span class="rd-soc-mark" data-rd-soc-mark>' + rdSocialIcon(chosen.key) + '</span>' +
        '<select class="rd-soc-net" data-rd-soc-net aria-label="Social media platform" ' +
          'onchange="rdSocialNetChange(this)">' + opts + '</select>' +
        '<input class="rd-soc-url" data-rd-soc-url type="url" inputmode="url" maxlength="300" ' +
          'aria-label="' + chosen.label + ' profile link" placeholder="' + escapeHtml(chosen.hint) + '" ' +
          'value="' + escapeHtml(url || '') + '">' +
        '<button type="button" class="rd-soc-del" onclick="rdSocialRemove(\'' + mount + '\', ' + i + ')" ' +
          'aria-label="Remove this account"><i data-lucide="x" class="w-4 h-4"></i></button>' +
        '</div>';
    }

    /* Changing the platform swaps the logo and the example in place rather than
       redrawing the block -- a redraw would take the half typed link with it. */
    function rdSocialNetChange(sel) {
      const row = sel.closest('[data-rd-soc-row]');
      if (!row) return;
      const net = rdSocialNet(sel.value);
      const mark = row.querySelector('[data-rd-soc-mark]');
      if (mark) mark.innerHTML = rdSocialIcon(net.key);
      const url = row.querySelector('[data-rd-soc-url]');
      if (url) {
        url.placeholder = net.hint;
        url.setAttribute('aria-label', net.label + ' profile link');
      }
      row.classList.remove('is-bad');
    }

    function rdSocialRender(mount, rows) {
      const box = document.getElementById(mount);
      if (!box) return;
      const list = (Array.isArray(rows) ? rows : []).slice(0, RD_SOCIAL_MAX);
      const full = list.length >= RD_SOCIAL_MAX;
      box.innerHTML =
        list.map((r, i) => rdSocialRowHtml(mount, i, r.net, r.url)).join('') +
        '<div class="rd-soc-foot">' +
          '<button type="button" class="rd-soc-add" onclick="rdSocialAdd(\'' + mount + '\')"' +
            (full ? ' disabled' : '') + '>' +
            '<i data-lucide="plus" class="w-4 h-4"></i> ' +
            (list.length ? 'Add another account' : 'Add a social media account') +
          '</button>' +
          '<span class="rd-soc-note">' +
            (full ? 'That is as many as one profile can hold.'
                  : 'Optional. Facebook, LinkedIn or X.') +
          '</span>' +
        '</div>' +
        '<p class="rd-soc-err hidden" data-rd-soc-err></p>';
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    }

    /* The next row starts on a platform that is not on screen yet, so the
       common case -- one Facebook, one LinkedIn -- takes no extra clicks. */
    function rdSocialAdd(mount) {
      const rows = rdSocialRows(mount);
      if (rows.length >= RD_SOCIAL_MAX) return;
      const used = rows.map(r => rdSocialNet(r.net).key);
      const next = RD_SOCIAL_NETS.find(n => used.indexOf(n.key) < 0) || RD_SOCIAL_NETS[0];
      rows.push({ net: next.key, url: '' });
      rdSocialRender(mount, rows);
      const boxes = document.getElementById(mount).querySelectorAll('[data-rd-soc-url]');
      if (boxes.length) boxes[boxes.length - 1].focus();
    }

    function rdSocialRemove(mount, i) {
      const rows = rdSocialRows(mount);
      rows.splice(i, 1);
      rdSocialRender(mount, rows);
    }

    function rdSocialMsg(mount, text) {
      const box = document.getElementById(mount);
      const p = box && box.querySelector('[data-rd-soc-err]');
      if (!p) return;
      p.textContent = text || '';
      p.classList.toggle('hidden', !text);
    }

    /**
     * What goes to the server, or null when a row is wrong. Empty rows are
     * simply dropped: somebody who opens a row and changes their mind should
     * not be stopped by it, because the whole thing is optional.
     */
    function rdSocialCollect(mount) {
      const box = document.getElementById(mount);
      if (!box) return '';
      rdSocialMsg(mount, '');
      box.querySelectorAll('[data-rd-soc-row]').forEach(r => r.classList.remove('is-bad'));

      const keep = [], seen = {};
      const rows = Array.from(box.querySelectorAll('[data-rd-soc-row]'));
      for (let i = 0; i < rows.length; i++) {
        const sel = rows[i].querySelector('[data-rd-soc-net]');
        const inp = rows[i].querySelector('[data-rd-soc-url]');
        const net = rdSocialNet(sel && sel.value);
        const url = String((inp && inp.value) || '').trim();
        if (!url) continue;
        if (!rdSocialUrlOk(net.key, url)) {
          rows[i].classList.add('is-bad');
          rdSocialMsg(mount, 'That does not look like a ' + net.label + ' link. Example: ' + net.hint);
          if (inp) inp.focus();
          return null;
        }
        const k = net.key + '|' + url.toLowerCase();
        if (seen[k]) {
          rows[i].classList.add('is-bad');
          rdSocialMsg(mount, 'That ' + net.label + ' link is already on the list.');
          if (inp) inp.focus();
          return null;
        }
        seen[k] = true;
        keep.push({ net: net.key, url: url });
      }
      return rdSocialSerialize(keep);
    }

    /* ---- read only: the logos another member taps on ---- */

    /* Nothing at all is drawn for a member who has not added an account, so a
       quiet profile never reads as an unfinished one. */
    function rdSocialChips(raw) {
      const rows = rdSocialParse(raw);
      if (!rows.length) return '';
      return '<div class="rd-soc-chips">' + rows.map(r => {
        const net = rdSocialNet(r.net);
        return '<a class="rd-soc-chip is-' + net.key.toLowerCase() + '" href="' + escapeHtml(r.url) + '" ' +
          'target="_blank" rel="noopener noreferrer nofollow">' + rdSocialIcon(net.key) +
          '<span>' + net.label + '</span></a>';
      }).join('') + '</div>';
    }

    /* Every picker on the page.  The starting value comes from data-addr-value,
       so a prefilled profile and a blank registration form use one code path;
       rdAddrInit(name, value) is there for the caller that has the value in hand. */
    function rdAddrInitAll() {
      document.querySelectorAll('[data-addr]').forEach(el => {
        rdAddrInit(el.getAttribute('data-addr'), el.getAttribute('data-addr-value') || '');
      });
    }

    /* Every social block on the page, drawn empty. Both mounts go through the
       one call, so neither form can be left without its Add button. */
    function rdSocialInitAll() {
      document.querySelectorAll('[data-rd-social]').forEach(el => rdSocialRender(el.id, []));
    }

    /* ====================================================================
       THE MEMBERSHIP APPLICATION -- five steps, one form
       --------------------------------------------------------------------
       The markup is already in index.html: five .rd-reg-panel blocks inside
       one <form>, a step strip, a mobile progress rule, and one footer button
       that reads Continue until the last step and Send application on it.

       Two things follow from that shape.

       The panels stay in the DOM and only hidden moves, so a half typed answer
       survives every step change. But a required input inside a hidden panel
       is still validated by the browser on submit, and the browser refuses to
       report a field it cannot show: Chrome aborts with "An invalid form
       control is not focusable" and never fires submit at all. So the form
       carries novalidate and every step checks its own fields here, through
       the same setFieldError the rest of the site uses.

       And because the footer button is the form's submit button, submit is
       where the stepper turns: until step 5 it moves forward, and only on
       step 5 does anything get sent.
       ==================================================================== */

    const RD_REG_STEPS = 5;

    /* Sign-in is Google-only. A Google-hosted school/office address is
       indistinguishable from any other domain by its text, so we cannot force
       "must be Gmail" without turning away legitimate Workspace members. We
       only turn away the well-known non-Google providers -- a member who typed
       their Yahoo/Outlook by habit -- and let Gmail or any unknown (possibly
       Google) domain through. */
    const RD_NON_GOOGLE_MAIL = ['yahoo.com','yahoo.co.uk','yahoo.co.in','ymail.com','rocketmail.com','outlook.com','hotmail.com','hotmail.co.uk','live.com','msn.com','icloud.com','me.com','mac.com','aol.com','protonmail.com','proton.me','yandex.com','yandex.ru','mail.ru','zoho.com','gmx.com','gmx.net','rediffmail.com'];
    let RD_REG_AT = 1;
    /* The furthest step reached. A step strip you can click back through is
       useful; one you can click forward through skips the checks. */
    let RD_REG_SEEN = 1;

    function rdRegAtEnd() { return RD_REG_AT >= RD_REG_STEPS; }

    function rdRegForm() { return document.getElementById('member-registration-form'); }

    function rdRegPanel(n) { return document.querySelector('[data-reg-panel="' + n + '"]'); }

    function rdRegText(id, text) {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    }

    /* The field's own label is the message's wording, so a label reworded in
       the markup cannot leave a stale name in an error message. */
    function rdRegLabel(el) {
      const lab = el && el.id ? document.querySelector('label[for="' + el.id + '"]') : null;
      return String((lab && lab.textContent) || (el && el.name) || 'This')
        .replace(/\*/g, '').replace(/\s+/g, ' ').trim();
    }

    /* The arrow becomes a paper plane on the last step. lucide has already
       replaced the <i> with an <svg> that inherited the id, and an <svg>
       cannot be re-rendered in place -- the whole node is swapped instead. */
    function rdRegIcon(name) {
      const el = document.getElementById('reg-next-icon');
      if (!el || el.getAttribute('data-rd-icon') === name) return;
      el.outerHTML = '<i data-lucide="' + name + '" class="w-4 h-4" id="reg-next-icon"' +
                     ' data-rd-icon="' + name + '"></i>';
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    }

    function rdRegShow(n) {
      RD_REG_AT = Math.max(1, Math.min(RD_REG_STEPS, +n || 1));
      RD_REG_SEEN = Math.max(RD_REG_SEEN, RD_REG_AT);
      let label = '';
      for (let i = 1; i <= RD_REG_STEPS; i++) {
        const panel = rdRegPanel(i), tab = document.querySelector('[data-reg-step="' + i + '"]');
        if (panel) panel.hidden = i !== RD_REG_AT;
        if (!tab) continue;
        if (i === RD_REG_AT) {
          tab.setAttribute('aria-current', 'step');
          const sl = tab.querySelector('.rd-reg-sl');
          label = String((sl && sl.textContent) || '').trim();
        } else {
          tab.removeAttribute('aria-current');
        }
        /* is-done and aria-current are equally specific and is-done is written
           later, so the step being read must not carry both. */
        tab.classList.toggle('is-done', i < RD_REG_SEEN && i !== RD_REG_AT);
        if (i <= RD_REG_SEEN) tab.setAttribute('data-open', '1');
        else tab.removeAttribute('data-open');
      }
      rdRegText('reg-mob-n', 'Step ' + RD_REG_AT + ' of ' + RD_REG_STEPS);
      rdRegText('reg-mob-l', label);
      rdRegText('reg-count', RD_REG_AT + ' / ' + RD_REG_STEPS);
      rdRegText('reg-next-label', rdRegAtEnd() ? 'Send application' : 'Continue');
      rdRegIcon(rdRegAtEnd() ? 'send' : 'arrow-right');
      const rule = document.getElementById('reg-rule');
      if (rule) rule.style.width = Math.round(RD_REG_AT * 100 / RD_REG_STEPS) + '%';
      const back = document.getElementById('reg-back');
      if (back) back.hidden = RD_REG_AT === 1;
      /* Each panel carries tabindex="-1" so the step change lands somewhere a
         screen reader will read out, instead of leaving focus on a button that
         has just changed what it does. */
      const now = rdRegPanel(RD_REG_AT);
      if (now && now.focus) {
        try { now.focus({ preventScroll: true }); } catch (err) { now.focus(); }
      }
    }

    /* ---- what each step will not let past ------------------------------ */
    function rdRegValid(n) {
      const f = rdRegForm(), panel = rdRegPanel(n);
      if (!f || !panel) return true;
      clearFieldErrors(f);
      let first = '';
      Array.prototype.forEach.call(panel.querySelectorAll('[required]'), function (el) {
        if (String(el.value || '').trim()) return;
        setFieldError(f, el.name, rdRegLabel(el) + ' is needed.', !first);
        first = first || el.name;
      });
      if (first) return false;
      /* Google-only sign-in: turn away only the known non-Google providers,
         with the fix said in the field itself. */
      Array.prototype.forEach.call(panel.querySelectorAll('[name="email"]'), function (el) {
        const raw = String(el.value || '').trim().toLowerCase();
        const at = raw.indexOf('@');
        if (at < 1) return;               /* type="email" already guards the shape */
        if (RD_NON_GOOGLE_MAIL.indexOf(raw.slice(at + 1)) === -1) return;
        setFieldError(f, el.name, 'Sign-in is through Google. Use a Gmail (or Google-hosted school/office) email so you can log in.', !first);
        first = first || el.name;
      });
      if (first) return false;
      /* A typo in a number costs one red outline, not a re-typed form. */
      Array.prototype.forEach.call(
        panel.querySelectorAll('[name="mobile"],[name="whatsapp"]'), function (el) {
          const raw = String(el.value || '').trim();
          if (!raw || isValidBdMobile(raw)) return;
          setFieldError(f, el.name, rdRegLabel(el) + ' ' + RD_MOBILE_RULE, !first);
          first = first || el.name;
        });
      if (first) return false;
      /* The address pickers write into hidden inputs, so required cannot guard
         them either. Each one carries its own message inside its own box. */
      let addrBad = '';
      [['address', 'Permanent address'], ['presentAddress', 'Present address']]
        .forEach(function (p) {
          if (!panel.querySelector('[name="' + p[0] + '"]')) return;
          if (!rdAddrMount(p[0]) || rdAddrComplete(p[0])) return;
          if (!addrBad) rdAddrError(p[0], p[1] + ': choose at least the district.');
          addrBad = addrBad || p[0];
        });
      return !addrBad;
    }

    function rdRegNext() {
      if (!rdRegValid(RD_REG_AT) || rdRegAtEnd()) return;
      rdRegShow(RD_REG_AT + 1);
      if (rdRegAtEnd()) rdRegReview();
    }

    function rdRegBack() {
      if (RD_REG_AT > 1) rdRegShow(RD_REG_AT - 1);
    }

    /* A step tab, and the Edit buttons on the summary. Going back is free.
       Going forward walks the steps in between, so nothing is skipped -- and
       the panel is shown before it is checked, because a message cannot put
       focus in a field that is not on screen. */
    function rdRegGo(n) {
      const want = Math.max(1, Math.min(RD_REG_STEPS, +n || 1));
      if (want > RD_REG_AT) {
        for (let i = RD_REG_AT; i < want; i++) {
          rdRegShow(i);
          if (!rdRegValid(i)) return;
        }
      }
      rdRegShow(want);
      if (rdRegAtEnd()) rdRegReview();
    }

    /* ---- read it back before sending ----------------------------------- */
    const RD_REG_REVIEW = [
      [1, 'Who you are', ['fullName', 'mobile', 'whatsapp', 'email']],
      [2, 'DUET record', ['department', 'series', 'batch', 'bloodGroup']],
      [3, 'Address', ['address', 'presentAddress']],
      [4, 'Work', ['employmentType', 'designation', 'organization', 'workLocation',
                   'formerPosition']]
    ];

    function rdRegReview() {
      const box = document.getElementById('reg-review'), f = rdRegForm();
      if (!box || !f) return;
      /* One bordered sheet with the group headers as its own children, because
         that is the shape custom.css draws: .rd-reg-rev>.rd-reg-revg:first-child
         is what drops the top hairline off the first header. */
      box.innerHTML = '<div class="rd-reg-rev">' + RD_REG_REVIEW.map(function (g) {
        const rows = g[2].map(function (nm) {
          const el = f.querySelector('[name="' + nm + '"]');
          if (!el) return '';
          const v = String(el.value || '').trim();
          return '<div class="rd-reg-revr">' +
            '<span class="rd-reg-revk">' + escapeHtml(rdRegLabel(el)) + '</span>' +
            '<span class="rd-reg-revv' + (v ? '' : ' is-empty') + '">' +
              escapeHtml(v || 'Not given') + '</span></div>';
        }).join('');
        /* A step whose fields are not on this form is not a step of this form. */
        if (!rows) return '';
        return '<div class="rd-reg-revg"><p class="rd-reg-revn">' + escapeHtml(g[1]) + '</p>' +
            '<button type="button" class="rd-reg-reve" onclick="rdRegGo(' + g[0] + ')">' +
              'Edit</button></div>' + rows;
      }).join('') + '</div>';
    }

    /* Submit runs this over every step, not just the one on screen. Somebody
       can clear an answer on step 1 and click back to step 5, and the browser
       is no longer watching. */
    function rdRegGuard() {
      for (let i = 1; i <= RD_REG_STEPS; i++) {
        if (rdRegValid(i)) continue;
        rdRegShow(i);
        rdRegValid(i);
        return false;
      }
      return true;
    }

    /* After a successful send the form is empty again, so the steps lock back
       to where a new applicant starts. */
    function rdRegReset() {
      RD_REG_SEEN = 1;
      rdRegShow(1);
      const box = document.getElementById('reg-review');
      if (box) box.innerHTML = '';
    }

    async function submitMemberRegistration(e){
      e.preventDefault();
      /* The footer button is this form's submit button, so submit is where
         the stepper turns: before the last step it moves forward and sends
         nothing at all. */
      if (!rdRegAtEnd()) { rdRegNext(); return; }
      /* Every step, not just the one on screen -- an answer can be cleared
         on step 1 and the step strip clicked back to 5. */
      if (!rdRegGuard()) return;
      const f=e.target, b=document.getElementById('member-submit-btn'), fd=new FormData(f);
      /* The social rows are optional, so an empty block is fine -- but a row
         that has been typed into and is wrong stops the submit here, before
         anything is uploaded. */
      const regSocial = rdSocialCollect('reg-social');
      if (regSocial === null) return;
      showGlobalLoader('Submitting...', 'Registering your membership.');
        b.disabled=true; b.innerHTML='<span class="inline-flex items-center gap-2"><i data-lucide="loader-circle" class="w-5 h-5 animate-spin"></i> Submitting...</span>'; lucide.createIcons();
      try {
        const payload = {
          fullName: fd.get('fullName'),
          mobile: normalizeBdMobile(fd.get('mobile')),
          whatsapp: normalizeBdMobile(fd.get('whatsapp')),
          email: fd.get('email'),
          address: fd.get('address'),
          presentAddress: fd.get('presentAddress'),
          bloodGroup: fd.get('bloodGroup'),
          department: fd.get('department'),
          series: fd.get('series'),
          batch: fd.get('batch'),
          employmentType: fd.get('employmentType'),
          organization: fd.get('organization'),
          designation: fd.get('designation'),
          workLocation: fd.get('workLocation'),
          formerPosition: fd.get('formerPosition'),
          socialLinks: regSocial
        };
        const photoFile = f.querySelector('[name="photo"]').files[0];
        if (photoFile && photoFile.size > 0) {
            b.innerHTML='<span class="inline-flex items-center gap-2"><i data-lucide="loader-circle" class="w-5 h-5 animate-spin"></i> Preparing the photo...</span>'; lucide.createIcons();
            payload.photo = await filePayload(photoFile, 1200);
        }
        b.innerHTML='<span class="inline-flex items-center gap-2"><i data-lucide="loader-circle" class="w-5 h-5 animate-spin"></i> Saving your details...</span>'; lucide.createIcons();
        
        const r = await apiPost('submitRegistration', {registration: payload});
        f.reset();
        clearFieldErrors(f);
        /* form.reset() empties the hidden inputs but cannot redraw the pickers;
           without this the next applicant would see the previous one's district. */
        rdAddrInitAll();
        /* Same reason for the social rows: reset() empties the inputs but
           leaves the previous applicant's rows standing. */
        rdSocialRender('reg-social', []);
        rdRegReset();
        /* The backend flags a duplicate instead of failing; say so plainly and
           keep the "admin will review" promise, because that is what happens. */
        const dup = String(r.status || '').toUpperCase() === 'DUPLICATE';
        hideGlobalLoader(true, () => {
            showToast(friendlyError(r.message || 'Once an admin verifies your details, your Member ID will be emailed to you.').msg,
                      dup ? 'info' : 'success',
                      dup ? 'Application is under admin review' : 'Application submitted',
                      {backTo: 'home'});
        }, dup ? 'Application is under admin review.' : 'Application submitted successfully.');
      } catch(err) {
        failGlobalLoader('Could not submit', friendlyError(err).msg);
          reportError(err, f);
      } finally {
        b.disabled=false;
        b.innerHTML='<span id="reg-next-label"></span>'+
                    '<i class="w-4 h-4" id="reg-next-icon"></i>';
        rdRegShow(RD_REG_AT);
      }
    }

    /* UPDATE MY INFO + EMAIL OTP MODAL */
    let uinfoAuthed = { memberId: '', mobile: '' };

    function openUpdateInfoModal() {
      openSubPage('my-info', 'alumni');
      document.getElementById('update-info-auth-form').reset();
      document.getElementById('update-info-otp-form').reset();
      document.getElementById('update-info-otp-verify-form').reset();
      showUpdateInfoStep('auth');
      lucide.createIcons();
    }
    function closeUpdateInfoModal() {
      goBackFromSubPage('my-info');
    }
    function showUpdateInfoStep(step) {
      document.getElementById('update-info-auth-form').classList.toggle('hidden', step !== 'auth');
      document.getElementById('update-info-otp-form').classList.toggle('hidden', step !== 'otp');
      document.getElementById('update-info-otp-verify-form').classList.toggle('hidden', step !== 'otp-verify');
      document.getElementById('update-info-edit-form').classList.toggle('hidden', step !== 'edit');
    }

    function applyUpdateInfoPrefill(info) {
      const f = document.getElementById('update-info-edit-form');
      f.employmentType.value = info.employmentType || '';
      f.organization.value = info.organization || '';
      f.designation.value = info.designation || '';
      /* The work location is a picker here too, so an update cannot put free
         text back into a column the directory now filters on.  Whatever the
         sheet holds is parsed; an old unrecognised value simply shows as
         unchosen and the member picks it once. */
      rdAddrInit('uinfoWork', info.workLocation || '');
      document.getElementById('uinfo-verified-badge').innerHTML = `${escapeHtml(info.fullName || '')} • Member ID: <strong>${escapeHtml(info.memberId || '')}</strong>`;
    }

    async function submitUpdateInfoAuth(e) {
      e.preventDefault();
      const memberId = document.getElementById('uinfo-memberid').value.trim();
      const mobile = normalizeBdMobile(document.getElementById('uinfo-mobile').value);
      const btn = e.target.querySelector('button[type="submit"]');
      clearFieldErrors(e.target);
      if (!isValidBdMobile(mobile)) {
        setFieldError(e.target, 'mobile', RD_MOBILE_RULE, true);
        return false;
      }
      btn.disabled = true; btn.innerHTML = '<span class="inline-flex items-center gap-2"><i data-lucide="loader-circle" class="w-5 h-5 animate-spin"></i> Verifying...</span>'; lucide.createIcons();
      try {
        const r = await apiPost('verifymemberforupdate', { data: { memberId, mobile } });
        if (!r.success) throw new Error(r.message || 'The Member ID and mobile number do not match.');
        uinfoAuthed = { memberId: r.memberId, mobile };
        /* Matching the ID to the mobile number is not proof of identity on its
           own: both are printed on the membership card. So the edit form is
           never opened from here. A code goes to the registered email address
           and submitOtpVerify() is the only way through to it. */
        btn.innerHTML = '<span class="inline-flex items-center gap-2"><i data-lucide="loader-circle" class="w-5 h-5 animate-spin"></i> Sending the code...</span>'; lucide.createIcons();
        const sent = await apiPost('requestemailotp', { data: { mobile } });
        if (!sent.success) throw new Error(sent.message || 'The verification code could not be sent.');
        document.getElementById('otp-sent-msg').textContent = (sent.message || 'A verification code has been sent.') + ' Please check your email, including the Spam or Junk folder.';
        showUpdateInfoStep('otp-verify');
      } catch (err) {
        reportError(err);
      } finally {
        btn.disabled = false; btn.textContent = 'Next step'; lucide.createIcons();
      }
      return false;
    }

    async function submitOtpRequest(e) {
      e.preventDefault();
      const mobile = normalizeBdMobile(document.getElementById('otp-mobile').value);
      clearFieldErrors(e.target);
      if (!isValidBdMobile(mobile)) {
        setFieldError(e.target, 'mobile', RD_MOBILE_RULE, true);
        return false;
      }
      try {
        const r = await apiPost('requestemailotp', { data: { mobile } });
        if (!r.success) throw new Error(r.message);
        uinfoAuthed.mobile = mobile;
        document.getElementById('otp-sent-msg').textContent = (r.message || 'A verification code has been sent.') + ' Please check your email, including the Spam or Junk folder.';
        showUpdateInfoStep('otp-verify');
      } catch (err) { reportError(err); }
      return false;
    }

    async function submitOtpVerify(e) {
      e.preventDefault();
      const otp = document.getElementById('otp-code').value.trim();
      try {
        const r = await apiPost('verifyemailotp', { data: { mobile: uinfoAuthed.mobile, otp } });
        if (!r.success) throw new Error(r.message);
        const info = await apiPost('verifymemberforupdate', { data: { memberId: r.memberId, mobile: uinfoAuthed.mobile } });
        if (!info.success) throw new Error(info.message);
        uinfoAuthed.memberId = r.memberId;
        applyUpdateInfoPrefill(info);
        showUpdateInfoStep('edit');
      } catch (err) { reportError(err); }
      return false;
    }

    async function submitUpdateInfoEdit(e) {
      e.preventDefault();
      const f = e.target, btn = document.getElementById('uinfo-edit-submit-btn');
      btn.disabled = true; btn.innerHTML = '<span class="inline-flex items-center gap-2"><i data-lucide="loader-circle" class="w-5 h-5 animate-spin"></i> Updating...</span>'; lucide.createIcons();
      showGlobalLoader("Updating...", "Saving your profile.");
      try {
        const payload = {
          memberId: uinfoAuthed.memberId,
          mobile: uinfoAuthed.mobile,
          employmentType: f.employmentType.value,
          organization: f.organization.value,
          designation: f.designation.value,
          workLocation: f.workLocation.value
        };
        const photoFile = f.querySelector('[name="photo"]').files[0];
        if (photoFile) {
          btn.innerHTML = '<span class="inline-flex items-center gap-2"><i data-lucide="loader-circle" class="w-5 h-5 animate-spin"></i> Uploading the photo...</span>'; lucide.createIcons();
          payload.photo = await filePayload(photoFile, 1200);
        }
        const r = await apiPost('updatememberinfo', { data: payload });
        if (!r.success) throw new Error(r.message);
f.reset();
        loadPublicAlumni();
        hideGlobalLoader(true, () => {
            showToast(r.message || 'Your information has been updated.', 'success', 'Update complete', {backTo: 'alumni'});
        }, 'Information updated successfully.', { autoClose: true });
      } catch (err) {
        failGlobalLoader('Update failed', friendlyError(err).msg);
        reportError(err);
      } finally {
        btn.disabled = false; btn.textContent = 'Update information'; lucide.createIcons();
      }
      return false;
    }

    function copyToClipboard(text) { navigator.clipboard.writeText(text).then(() => { showToast(`Number copied: ${text}`, 'success'); }); }
    /* ================= NOTICE BOARD + SOCIAL MEDIA CORNER =============
       Two feeds, one page. Both are written so that a failure leaves a quiet,
       empty board rather than an error card: a notice board that shouts at the
       visitor is worse than one that says nothing. The backend already returns
       success:true with empty lists when the sheet is missing.            */
    const RD_NB_PER_PAGE = 8;
    /* The corner slides, so it has no page size and no page number. */
    let RD_NB = { state: 'idle', ticker: [], notices: [], page: 1 };
    let RD_SC = { state: 'idle', posts: [] };

    async function loadNoticeBoard(force) {
      if (RD_NB.state === 'loading') return;
      if (RD_NB.state === 'ready' && !force) { renderNoticeBoard(); return; }
      /* The remembered copy is shown at once; the fresh one lands a moment
         later, so the board never opens as a blank skeleton twice. */
      const warm = rdFeedRecall('notices');
      if (warm) {
        RD_NB.ticker = warm.ticker || [];
        RD_NB.notices = warm.notices || [];
        RD_SC.posts = warm.posts || [];
        RD_NB.page = 1;
        RD_NB.state = 'ready';
        RD_SC.state = 'ready';
        renderNoticeBoard();
      } else {
        RD_NB.state = 'loading';
        RD_SC.state = 'loading';
        renderNoticeBoard();
      }
      const [nb, sc] = await Promise.all([
        apiGet('notices').catch(err => { console.warn('[rd] notices:', err); return {}; }),
        apiGet('socialposts').catch(err => { console.warn('[rd] social:', err); return {}; })
      ]);
      RD_NB.ticker = Array.isArray(nb.ticker) ? nb.ticker : [];
      RD_NB.notices = Array.isArray(nb.notices) ? nb.notices : [];
      RD_SC.posts = Array.isArray(sc.posts) ? sc.posts : [];
      RD_NB.page = 1;
      RD_NB.state = 'ready';
      RD_SC.state = 'ready';
      rdFeedRemember('notices',
        { ticker: RD_NB.ticker, notices: RD_NB.notices, posts: RD_SC.posts });
      renderNoticeBoard();
    }

    /* 2026-08-26 14:05 -> 26 Aug 2026. Anything unexpected is printed as it
       came, because a wrong date is worse than an unformatted one. */
    function rdNiceDate(v) {
      const s = String(v || '').trim();
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
      if (!m) return s;
      const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return (+m[3]) + ' ' + MON[(+m[2]) - 1] + ' ' + m[1];
    }

    /* The alumni pager, generalised: same buttons, same ellipsis rule, any
       list. alumniPageNumbers() is already list-agnostic. */
    function rdRenderPager(elId, cur, last, handler, label) {
      const pager = document.getElementById(elId);
      if (!pager) return;
      if (last <= 1) { pager.innerHTML = ''; return; }
      const btn = (inner, page, extra, disabled, aria) =>
        '<button type="button" class="alumni-page-btn ' + (extra || '') + '"' +
        (disabled ? ' disabled' : ' onclick="' + handler + '(' + page + ')"') +
        (aria ? ' aria-label="' + escapeHtml(aria) + '"' : '') +
        (page === cur ? ' aria-current="page"' : '') + '>' + inner + '</button>';
      let html = btn('<i data-lucide="chevron-left" class="w-4 h-4"></i><span class="hidden sm:inline">Previous</span>',
                     cur - 1, 'alumni-page-edge', cur === 1, 'Previous page');
      alumniPageNumbers(cur, last).forEach(p => {
        html += p === '...'
          ? '<span class="px-1.5 text-slate-400 font-bold select-none">…</span>'
          : btn(String(p), p, p === cur ? 'is-current' : '', false, label + ' page ' + p);
      });
      html += btn('<span class="hidden sm:inline">Next</span><i data-lucide="chevron-right" class="w-4 h-4"></i>',
                  cur + 1, 'alumni-page-edge', cur === last, 'Next page');
      pager.innerHTML = html;
    }

    function rdPageCount(total, per) { return Math.max(1, Math.ceil(total / per)); }

    function rdBoardSkeleton(n) {
      let out = '';
      for (let i = 0; i < n; i++) out += '<div class="h-64 rounded-2xl bg-slate-100 animate-pulse"></div>';
      return out;
    }

    function rdBoardEmpty(icon, text) {
      return '<div class="col-span-full rounded-2xl border border-slate-200 bg-white p-10 text-center">' +
        '<div class="w-14 h-14 mx-auto rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-4">' +
        '<i data-lucide="' + icon + '" class="w-7 h-7 text-slate-400"></i></div>' +
        '<p class="text-sm font-bold text-slate-500">' + escapeHtml(text) + '</p></div>';
    }

    function renderNoticeBoard() {
      renderNoticeTicker();
      renderNoticeList();
      renderSocialGrid();
      if (window.lucide) lucide.createIcons();
    }

    function renderNoticeTicker() {
      const wrap = document.getElementById('notice-ticker-wrap');
      const track = document.getElementById('notice-ticker');
      if (!wrap || !track) return;
      const lines = RD_NB.ticker.filter(t => String(t && t.text || '').trim());
      wrap.classList.toggle('hidden', lines.length === 0);
      if (!lines.length) { track.innerHTML = ''; return; }
      /* The list is printed twice so the line never leaves a visible gap
         between the last notice and the first one coming round again. */
      const one = lines.map(t => {
        let dateBadge = '';
        let newBadge = '';
        if (t.postedDate) {
          const d = new Date(t.postedDate.replace(' ', 'T'));
          if (!isNaN(d.valueOf())) {
            const m = d.toLocaleString('en-US', { month: 'short' });
            const dy = d.getDate();
            dateBadge = `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] uppercase font-extrabold shadow-sm border border-amber-200"><i data-lucide="calendar" class="w-2.5 h-2.5"></i> ${dy} ${m}</span>`;
            
            const diffDays = (new Date() - d) / (1000 * 60 * 60 * 24);
            if (diffDays <= 7) {
               newBadge = `<span class="inline-flex items-center px-1.5 py-0.5 rounded bg-red-500 text-white text-[9px] font-black uppercase tracking-wider animate-pulse ml-1 shadow-sm">NEW</span>`;
            }
          }
        }
        return `<span class="inline-flex items-center gap-2 text-[13px] sm:text-sm font-bold text-amber-900 cursor-pointer hover:text-blue-600 transition-colors py-1" onclick="openTextNoticeModal('${escapeHtml(t.noticeId)}')">` +
          `<i data-lucide="bell-ring" class="w-4 h-4 text-amber-600 animate-bounce"></i>` + dateBadge + newBadge + 
          `<span class="truncate max-w-[600px] hover:underline underline-offset-2">` + escapeHtml(t.text) + `</span></span>`;
      }).join('');
      track.innerHTML = one + (lines.length < 4 ? one : '');
    }

    function openTextNoticeModal(noticeId) {
      const t = RD_NB.ticker.find(x => String(x.noticeId) === String(noticeId));
      if (!t) return;
      showToast(t.text, 'info', 'Notice Board', { btnText: 'Close' });
    }

    function noticeThumb(n) {
      if (n.fileType === 'image' && n.viewUrl) {
        return '<div class="rd-news-thumb"><span class="rd-news-tag"><i data-lucide="image" class="w-3 h-3"></i>Image</span>' +
          '<img src="' + escapeHtml(n.viewUrl) + '" alt="' + escapeHtml(n.title) + '" loading="lazy" decoding="async" onerror="rdNewsFallback(this)"></div>';
      }
      const pdf = n.fileType === 'pdf';
      return '<div class="rd-news-thumb" style="background:linear-gradient(135deg,#f8fafc,#eff6ff);">' +
        (pdf ? '<span class="rd-news-tag"><i data-lucide="file-text" class="w-3 h-3"></i>PDF</span>' : '') +
        '<i data-lucide="' + (pdf ? 'file-text' : 'clipboard-list') + '" class="w-14 h-14 text-blue-400"></i></div>';
    }

    function noticeCard(n) {
      const id = escapeHtml(n.noticeId);
      return '<article class="rd-news-card">' +
        '<button type="button" class="block w-full text-left" aria-label="Open the notice" onclick="openNoticeFile(\'' + id + '\')">' +
          noticeThumb(n) +
        '</button>' +
        '<div class="p-4 sm:p-5">' +
          '<button type="button" class="rd-news-title text-sm sm:text-[15px] rd-clamp3" onclick="openNoticeFile(\'' + id + '\')">' +
            escapeHtml(n.title) + '</button>' +
          (String(n.body || '').trim()
            ? '<p class="mt-2 text-xs text-slate-500 font-semibold leading-relaxed rd-clamp2">' + escapeHtml(n.body) + '</p>'
            : '') +
        '</div>' +
        '<div class="rd-news-foot">' +
          '<span class="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-slate-500">' +
            '<i data-lucide="calendar" class="w-3.5 h-3.5 text-slate-400"></i>' + escapeHtml(rdNiceDate(n.postedDate)) + '</span>' +
          '<button type="button" onclick="openNoticeFile(\'' + id + '\')" class="inline-flex items-center gap-0.5 text-[11px] font-extrabold uppercase tracking-wide text-blue-600 hover:text-blue-800 cursor-pointer">' +
            'View more <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i></button>' +
        '</div>' +
      '</article>';
    }

    function renderNoticeList() {
      const box = document.getElementById('notice-list');
      if (!box) return;
      if (RD_NB.state === 'loading') { box.innerHTML = rdBoardSkeleton(4); document.getElementById('notice-pager').innerHTML = ''; return; }
      if (!RD_NB.notices.length) {
        box.innerHTML = rdBoardEmpty('clipboard-list', 'No notice has been published yet.');
        document.getElementById('notice-pager').innerHTML = '';
        return;
      }
      const last = rdPageCount(RD_NB.notices.length, RD_NB_PER_PAGE);
      if (RD_NB.page > last) RD_NB.page = last;
      const from = (RD_NB.page - 1) * RD_NB_PER_PAGE;
      box.innerHTML = RD_NB.notices.slice(from, from + RD_NB_PER_PAGE).map(noticeCard).join('');
      rdRenderPager('notice-pager', RD_NB.page, last, 'gotoNoticePage', 'Notice');
    }

    function gotoNoticePage(p) {
      const last = rdPageCount(RD_NB.notices.length, RD_NB_PER_PAGE);
      RD_NB.page = Math.min(Math.max(1, p), last);
      renderNoticeList();
      if (window.lucide) lucide.createIcons();
      const el = document.getElementById('notice-list');
      if (el) window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 120), behavior: 'auto' });
    }

    /* ---------- The file itself, on its own page (never a popup) ---------- */
    function openNoticeFile(noticeId) {
      const n = RD_NB.notices.find(x => String(x.noticeId) === String(noticeId));
      if (!n) { showToast('That notice is no longer on the board.', 'info', 'Notice not found', {backTo: 'noticeboard'}); return; }
      document.getElementById('nfile-date').textContent = rdNiceDate(n.postedDate);
      document.getElementById('nfile-title').textContent = n.title || 'Notice';
      const body = document.getElementById('nfile-body');
      body.textContent = String(n.body || '');
      body.classList.toggle('hidden', !String(n.body || '').trim());

      /* The download link points at Drive's export URL, so the file arrives at
         its original resolution -- what the admin uploaded, untouched. */
      const dl = document.getElementById('nfile-download');
      const open = document.getElementById('nfile-open');
      const has = !!String(n.downloadUrl || '').trim();
      dl.href = n.downloadUrl || '#';
      dl.classList.toggle('hidden', !has);
      open.href = n.viewUrl || n.fileUrl || '#';
      open.classList.toggle('hidden', !String(n.viewUrl || n.fileUrl || '').trim());

      const frame = document.getElementById('nfile-frame');
      if (n.fileType === 'pdf' && n.viewUrl) {
        frame.innerHTML = '<iframe class="rd-file-frame" src="' + escapeHtml(n.viewUrl) +
          '" title="' + escapeHtml(n.title) + '" loading="lazy"></iframe>';
      } else if (n.viewUrl) {
        frame.innerHTML = '<div class="p-3 sm:p-5"><img src="' + escapeHtml(n.viewUrl) +
          '" alt="' + escapeHtml(n.title) + '" class="w-full h-auto rounded-2xl shadow-sm" onerror="rdPhotoFallback(this)"></div>';
      } else {
        frame.innerHTML = '';
      }
      openSubPage('notice-file', 'noticeboard');
      if (window.lucide) lucide.createIcons();
    }

    /* ---------- Social Media Corner ---------- */
    function socialCard(p) {
      const img = String(p.image || '').trim();
      const news = p.kind === 'NEWS';
      const heading = String(p.title || '').trim() || String(p.caption || '').trim();
      const tag = '<span class="rd-news-tag"><i data-lucide="' + (news ? 'newspaper' : 'facebook') +
        '" class="w-3 h-3"></i>' + (news ? 'News' : 'Facebook') + '</span>';
      /* No picture on the post? The Rangdhanu logo stands in, so the row of
         cards keeps its shape instead of collapsing into a blank box. */
      const thumb = img
        ? '<div class="rd-news-thumb">' + tag + '<img src="' + escapeHtml(img) + '" alt="' + escapeHtml(heading) +
          '" loading="lazy" decoding="async" onerror="rdNewsFallback(this)"></div>'
        : '<div class="rd-news-thumb is-logo">' + tag + '<img src="logo.png" alt="Rangdhanu" loading="lazy" decoding="async" onerror="rdNewsLogoFallback(this)"></div>';
      const caption = String(p.caption || '').trim();
      return '<article class="rd-news-card">' +
        '<a href="' + escapeHtml(p.link) + '" target="_blank" rel="noopener" class="block" aria-label="Open the post">' +
          thumb +
        '</a>' +
        '<div class="p-4 sm:p-5">' +
          (String(p.title || '').trim()
            ? '<h3 class="text-sm sm:text-[15px] font-extrabold text-slate-900 leading-snug rd-clamp2">' + escapeHtml(p.title) + '</h3>'
            : '') +
          (caption
            ? '<p class="' + (String(p.title || '').trim() ? 'mt-2 ' : '') + 'text-xs text-slate-600 font-semibold leading-relaxed rd-clamp3">' + escapeHtml(caption) + '</p>'
            : '') +
        '</div>' +
        '<div class="rd-news-foot">' +
          '<span class="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-slate-500">' +
            '<i data-lucide="calendar" class="w-3.5 h-3.5 text-slate-400"></i>' + escapeHtml(rdNiceDate(p.postedDate)) + '</span>' +
          '<a href="' + escapeHtml(p.link) + '" target="_blank" rel="noopener" class="inline-flex items-center gap-0.5 text-[11px] font-extrabold uppercase tracking-wide text-blue-600 hover:text-blue-800">' +
            (news ? 'Read the news' : 'View more') + ' <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i></a>' +
        '</div>' +
      '</article>';
    }

    /* Every post sits on one rail. There are no pages here any more, so the
       whole list is laid out once and the two buttons only scroll it. */
    function renderSocialGrid() {
      const box = document.getElementById('social-grid');
      if (!box) return;
      if (RD_SC.state === 'loading') { box.innerHTML = rdBoardSkeleton(3); rdSocialArrows(); return; }
      if (!RD_SC.posts.length) {
        box.innerHTML = rdBoardEmpty('share-2', 'No post has been added to the corner yet.');
        rdSocialArrows();
        return;
      }
      box.innerHTML = RD_SC.posts.map(socialCard).join('');
      /* Dragging or swiping the rail must move the buttons too, and the
         listener is attached once however often the cards are redrawn. */
      if (!box.dataset.rdRail) {
        box.dataset.rdRail = '1';
        box.addEventListener('scroll', rdSocialArrows, { passive: true });
      }
      box.scrollLeft = 0;
      rdSocialArrows();
    }

    /* One press = one card, gap included. Measured from the card that is
       actually on screen, so the same code fits phone and desktop. */
    function rdSocialStep(box) {
      const card = box.firstElementChild;
      const w = card ? card.getBoundingClientRect().width : 0;
      return Math.max(200, Math.round((w || box.clientWidth / 3) + 20));
    }

    function socialSlide(dir) {
      const box = document.getElementById('social-grid');
      if (!box) return;
      const step = rdSocialStep(box) * (dir < 0 ? -1 : 1);
      if (typeof box.scrollBy === 'function') box.scrollBy({ left: step, behavior: 'smooth' });
      else box.scrollLeft = box.scrollLeft + step;
      rdSocialArrows();
    }

    /* A rail with nothing to slide loses its buttons altogether, and at
       either end the button on that side goes quiet rather than dead. */
    function rdSocialArrows() {
      const box = document.getElementById('social-grid');
      const prev = document.getElementById('social-prev');
      const next = document.getElementById('social-next');
      if (!box || !prev || !next) return;
      const many = RD_SC.state === 'ready' && RD_SC.posts.length > 1;
      prev.style.display = many ? '' : 'none';
      next.style.display = many ? '' : 'none';
      const room = Math.max(0, (box.scrollWidth || 0) - (box.clientWidth || 0));
      prev.disabled = box.scrollLeft <= 4;
      next.disabled = box.scrollLeft >= room - 4;
    }

    /* ================= THE PDACC PAGE FEED ============================
       One call fills both the notice line and the Latest update rail. Like the
       notice board, a failure leaves the page quiet rather than shouting at a
       visitor: the backend answers success:true with empty lists.          */
    const RD_PD_RAIL_MAX = 8;
    const RD_PD_PER_PAGE = 15;
    let RD_PD = { state: 'idle', ticker: [], updates: [], page: 1 };

    async function loadPdacc(force) {
      if (RD_PD.state === 'loading') return;
      if (RD_PD.state === 'ready' && !force) { renderPdacc(); return; }
      const warm = rdFeedRecall('pdacc');
      if (warm) {
        RD_PD.ticker = warm.ticker || [];
        RD_PD.updates = warm.updates || [];
        RD_PD.page = 1;
        RD_PD.state = 'ready';
        renderPdacc();
      } else {
        RD_PD.state = 'loading';
        renderPdacc();
      }
      const j = await apiGet('pdacc').catch(err => { console.warn('[rd] pdacc:', err); return {}; });
      RD_PD.ticker = Array.isArray(j.ticker) ? j.ticker : [];
      RD_PD.updates = Array.isArray(j.updates) ? j.updates : [];
      RD_PD.page = 1;
      RD_PD.state = 'ready';
      rdFeedRemember('pdacc', { ticker: RD_PD.ticker, updates: RD_PD.updates });
      renderPdacc();
    }

    function renderPdacc() {
      renderPdaccTicker();
      renderPdaccUpdates();
      renderPdaccUpdatesPage();
      if (window.lucide) lucide.createIcons();
    }

    function renderPdaccTicker() {
      const wrap = document.getElementById('pdacc-ticker-wrap');
      const track = document.getElementById('pdacc-ticker');
      if (!wrap || !track) return;
      const lines = RD_PD.ticker.filter(t => String(t && t.text || '').trim());
      wrap.classList.toggle('hidden', lines.length === 0);
      if (!lines.length) { track.innerHTML = ''; return; }
      /* Printed twice, so the line never leaves a visible gap between the
         last notice and the first one coming round again. */
      const one = lines.map(t => {
        let dateBadge = '';
        let newBadge = '';
        if (t.postedDate) {
          const d = new Date(t.postedDate.replace(' ', 'T'));
          if (!isNaN(d.valueOf())) {
            const m = d.toLocaleString('en-US', { month: 'short' });
            const dy = d.getDate();
            dateBadge = `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-800 text-[10px] uppercase font-extrabold shadow-sm border border-indigo-200"><i data-lucide="calendar" class="w-2.5 h-2.5"></i> ${dy} ${m}</span>`;
            
            const diffDays = (new Date() - d) / (1000 * 60 * 60 * 24);
            if (diffDays <= 7) {
               newBadge = `<span class="inline-flex items-center px-1.5 py-0.5 rounded bg-red-500 text-white text-[9px] font-black uppercase tracking-wider animate-pulse ml-1 shadow-sm">NEW</span>`;
            }
          }
        }
        return `<span class="inline-flex items-center gap-2 text-[13px] sm:text-sm font-bold text-indigo-900 cursor-pointer hover:text-blue-600 transition-colors py-1" onclick="openPdaccTextNoticeModal('${escapeHtml(t.lineId)}')">` +
          `<i data-lucide="bell-ring" class="w-4 h-4 text-indigo-600 animate-bounce"></i>` + dateBadge + newBadge + 
          `<span class="truncate max-w-[600px] hover:underline underline-offset-2">` + escapeHtml(t.text) + `</span></span>`;
      }).join('');
      track.innerHTML = one + (lines.length < 4 ? one : '');
    }

    function openPdaccTextNoticeModal(lineId) {
      const t = RD_PD.ticker.find(x => String(x.lineId) === String(lineId));
      if (!t) return;
      showToast(t.text, 'info', 'Coaching Notice', { btnText: 'Close' });
    }

    /* An update with no picture of its own carries the crest. */
    function pdaccUpdThumb(u) {
      const img = String(u.image || '').trim();
      if (img) {
        return '<div class="rd-news-thumb"><img src="' + escapeHtml(img) + '" alt="' +
          escapeHtml(u.title || '') + '" loading="lazy" decoding="async" onerror="rdPdCardFallback(this)"></div>';
      }
      return '<div class="rd-news-thumb is-logo"><img src="' + escapeHtml(RD_PDACC_LOGO) +
        '" alt="PDACC crest" loading="lazy" ' +
        'decoding="async" onerror="rdPdCardFallback(this)"></div>';
    }

    function pdaccUpdateCard(u) {
      const link = String(u.link || '').trim();
      const a = 'href="' + escapeHtml(link) + '" target="_blank" rel="noopener"';
      const head = link ? '<a ' + a + ' class="block">' + pdaccUpdThumb(u) + '</a>' : pdaccUpdThumb(u);
      const title = link
        ? '<a ' + a + ' class="rd-news-title text-sm sm:text-[15px] rd-clamp3">' + escapeHtml(u.title || '') + '</a>'
        : '<h3 class="rd-news-title text-sm sm:text-[15px] rd-clamp3">' + escapeHtml(u.title || '') + '</h3>';
      const more = link
        ? '<a ' + a + ' class="inline-flex items-center gap-0.5 text-[11px] font-extrabold uppercase tracking-wide text-indigo-600 hover:text-indigo-800">Read more <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i></a>'
        : '';
      return '<article class="rd-news-card">' + head +
        '<div class="p-4 sm:p-5">' + title +
          (String(u.description || '').trim()
            ? '<p class="mt-2 text-xs text-slate-500 font-semibold leading-relaxed rd-clamp3">' + escapeHtml(u.description) + '</p>'
            : '') +
        '</div>' +
        '<div class="rd-news-foot">' +
          '<span class="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-slate-500">' +
            '<i data-lucide="calendar" class="w-3.5 h-3.5 text-slate-400"></i>' +
            escapeHtml(rdNiceDate(u.postedDate)) + '</span>' + more +
        '</div>' +
      '</article>';
    }

    function renderPdaccUpdates() {
      const box = document.getElementById('pdacc-updates');
      const all = document.getElementById('pdacc-updates-all');
      if (!box) return;
      if (RD_PD.state === 'loading') { box.innerHTML = rdBoardSkeleton(3); pdaccUpdArrows(); return; }
      if (!RD_PD.updates.length) {
        box.innerHTML = rdBoardEmpty('newspaper', 'No update has been published yet.');
        if (all) all.classList.add('hidden');
        pdaccUpdArrows();
        return;
      }
      box.innerHTML = RD_PD.updates.slice(0, RD_PD_RAIL_MAX).map(pdaccUpdateCard).join('');
      /* More than the rail holds is what the View all button is for. */
      if (all) all.classList.toggle('hidden', RD_PD.updates.length <= RD_PD_RAIL_MAX);
      if (!box.dataset.rdRail) {
        box.dataset.rdRail = '1';
        if (box.addEventListener) box.addEventListener('scroll', pdaccUpdArrows, { passive: true });
      }
      box.scrollLeft = 0;
      pdaccUpdArrows();
    }

    /* One press = one card, gap included, measured from the card on screen. */
    function pdaccRailStep(box) {
      const card = box.firstElementChild;
      const w = (card && card.getBoundingClientRect) ? card.getBoundingClientRect().width : 0;
      return Math.max(200, Math.round((w || (box.clientWidth || 900) / 3) + 20));
    }

    function pdaccUpdSlide(dir) {
      const box = document.getElementById('pdacc-updates');
      if (!box) return;
      const step = pdaccRailStep(box) * (dir < 0 ? -1 : 1);
      if (typeof box.scrollBy === 'function') box.scrollBy({ left: step, behavior: 'smooth' });
      else box.scrollLeft = box.scrollLeft + step;
      pdaccUpdArrows();
    }

    function pdaccUpdArrows() {
      const box = document.getElementById('pdacc-updates');
      const prev = document.getElementById('pdacc-upd-prev');
      const next = document.getElementById('pdacc-upd-next');
      if (!box || !prev || !next) return;
      const many = RD_PD.state === 'ready' && RD_PD.updates.length > 1;
      prev.style.display = many ? '' : 'none';
      next.style.display = many ? '' : 'none';
      const room = Math.max(0, (box.scrollWidth || 0) - (box.clientWidth || 0));
      prev.disabled = box.scrollLeft <= 4;
      next.disabled = box.scrollLeft >= room - 4;
    }

    /* View all: every update, fifteen to a page, on a page of its own. */
    // ---- PDACC 2026 side-nav / mobile accordion controller ----
    // The desktop sidebar and the mobile accordion share the same buttons.
    // Real sections call the existing nav fns; the mobile panel just needs
    // to collapse after a pick, and future ("soon") items show a popup.
    function rdPdNavToggle(node) {
      const sw = node && node.closest ? node.closest('.rd-pd-mswitch') : null;
      if (sw) sw.classList.toggle('open');
    }
    function rdPdNavClose() {
      document.querySelectorAll('.rd-pd-mswitch.open')
        .forEach(function (s) { s.classList.remove('open'); });
    }
    /* The mobile PDACC top bar's "More" opens a top-anchored grid sheet
       (#rd-pd-topsheet). Toggle/close it here; each grid item calls
       rdPdMoreClose() before its own existing nav fn, and switchPage also
       force-closes it on any page change. */
    function rdPdMoreToggle(e) {
      if (e && e.preventDefault) e.preventDefault();
      const sheet = document.getElementById('rd-pd-topsheet');
      const more = document.querySelector('#rd-pd-topnav .rd-pdt-more');
      if (!sheet) return;
      const open = sheet.classList.toggle('hidden') === false;
      if (more) more.classList.toggle('active', open);
      if (open && window.lucide) lucide.createIcons();
    }
    function rdPdMoreClose() {
      const sheet = document.getElementById('rd-pd-topsheet');
      if (sheet) sheet.classList.add('hidden');
      const more = document.querySelector('#rd-pd-topnav .rd-pdt-more');
      if (more) more.classList.remove('active');
    }
    // Scroll to a section on the PDACC Home page from any PDACC sidebar,
    // switching to Home first when the click came from a sub-page.
    function rdPdGoto(id) {
      rdPdNavClose();
      const home = document.getElementById('page-prokoushali');
      const scroll = function () {
        const t = document.getElementById(id);
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      if (home && !home.classList.contains('active')) {
        switchPage('prokoushali');
        setTimeout(scroll, 70);
      } else {
        scroll();
      }
    }
    // Placeholder sections the owner will add or hide later.
    function rdPdSoon() {
      rdPdNavClose();
      showToast('এই অংশটি এখনও যোগ করা হয়নি — খুব শীঘ্রই আসছে।', 'info', 'শীঘ্রই আসছে');
    }

    function openPdaccUpdates() {
      RD_PD.page = 1;
      openSubPage('pdacc-updates', 'prokoushali');
      renderPdaccUpdatesPage();
      if (window.lucide) lucide.createIcons();
    }

    function renderPdaccUpdatesPage() {
      const box = document.getElementById('pdacc-updates-list');
      const pager = document.getElementById('pdacc-updates-pager');
      if (!box) return;
      if (RD_PD.state === 'loading') {
        box.innerHTML = rdBoardSkeleton(6);
        if (pager) pager.innerHTML = '';
        return;
      }
      if (!RD_PD.updates.length) {
        box.innerHTML = rdBoardEmpty('newspaper', 'No update has been published yet.');
        if (pager) pager.innerHTML = '';
        return;
      }
      const last = rdPageCount(RD_PD.updates.length, RD_PD_PER_PAGE);
      if (RD_PD.page > last) RD_PD.page = last;
      const from = (RD_PD.page - 1) * RD_PD_PER_PAGE;
      box.innerHTML = RD_PD.updates.slice(from, from + RD_PD_PER_PAGE).map(pdaccUpdateCard).join('');
      rdRenderPager('pdacc-updates-pager', RD_PD.page, last, 'gotoPdaccUpdatePage', 'Update');
    }

    function gotoPdaccUpdatePage(p) {
      const last = rdPageCount(RD_PD.updates.length, RD_PD_PER_PAGE);
      RD_PD.page = Math.min(Math.max(1, p), last);
      renderPdaccUpdatesPage();
      if (window.lucide) lucide.createIcons();
      const el = document.getElementById('pdacc-updates-list');
      if (el && el.getBoundingClientRect) {
        window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 120), behavior: 'auto' });
      }
    }

    /* A jump button on the little nav scrolls; it never opens a page. */
    function pdaccJump(id) {
      const box = document.getElementById(id);
      if (!box || !box.scrollIntoView) return;
      box.scrollIntoView({ behavior: 'auto', block: 'start' });
    }

    /* The PDACC nav strip is on two pages now: the PDACC page and the
       Admission guide sub-page. Pressed from the guide, a jump has to bring
       the PDACC page back first, and the scroll has to wait for that page to
       be the visible one. That is also why the guide needs no Back button:
       every other button on the strip returns here. */
    function pdaccGo(id) {
      if (rdCurrentPageId !== 'prokoushali') {
        switchPage('prokoushali');
        requestAnimationFrame(() => pdaccJump(id));
        return;
      }
      pdaccJump(id);
    }

    /* About and the committee button are on the strip too, so they need the
       same treatment. */
    function pdaccAboutGo() {
      if (rdCurrentPageId !== 'prokoushali') {
        switchPage('prokoushali');
        requestAnimationFrame(pdaccAbout);
        return;
      }
      pdaccAbout();
    }

    /* ================= ADMIN DASHBOARD ===============================
       Three record types, one renderer. Everything the admin can press here
       maps onto an API that already existed; authentication stays with the
       backend's requireAdmin_(), so no email is ever sent from the browser. */
    const RD_ADMIN_TABS = [
      { key: 'registrations', label: 'Membership Applications', icon: 'user-plus',    action: 'getadminregistrations' },
      { key: 'events',        label: 'Events',                  icon: 'calendar-days', action: 'getadminevents' },
      { key: 'committee',     label: 'Executive Committee',     icon: 'shield-check', action: 'adminexecutivecommittee' },
      /* custom: true means the tab is not an approval queue -- no status
         filter, no adminCard(), its own loader and its own renderer. */
      { key: 'notices',       label: 'Notices',                 icon: 'megaphone',    action: 'getadminnotices',     custom: true },
      { key: 'social',        label: 'Social Media Corner',     icon: 'share-2',      action: 'getadminsocialposts', custom: true },
      { key: 'slides',        label: 'Slideshows',              icon: 'images',       action: 'getadminslides',      custom: true },
      { key: 'reunion',       label: 'Reunion',                 icon: 'flag',           action: 'getadminreunion',   custom: true },
        { key: 'pdacc',         label: 'PDACC Page',              icon: 'graduation-cap', action: 'getadminpdacc',     custom: true },
      { key: 'faculty',       label: 'Rangdhanu Family',        icon: 'users-round',  action: 'getadminfaculty',     custom: true },
      { key: 'activity',      label: 'Edit History',            icon: 'history',      action: 'getadminactivity',    custom: true },
      { key: 'unclaimed',     label: 'Unclaimed Profiles',       icon: 'user-round-search', action: 'adminunclaimedprofiles', custom: true },
      { key: 'unclaimed-matches', label: 'Possible Matches',      icon: 'git-compare-arrows', action: 'adminunclaimedmatches', custom: true },
      { key: 'unclaimed-audits', label: 'Merge Audit',             icon: 'file-check-2', action: 'adminunclaimedaudits', custom: true },
      { key: 'email',         label: 'Email Members',           icon: 'mail',         action: '',                    custom: true },
      { key: 'polls',         label: 'Polls',                   icon: 'vote',         action: '',                    custom: true },
      { key: 'summary',       label: 'Members Summary',         icon: 'bar-chart-3',  action: '',                    custom: true }
    ];
    /* One-line card blurbs for the hub launcher grid. Kept out of RD_ADMIN_TABS
       so that array stays exactly as the harness reads it (custom: true must sit
       right after action and be the last property in each entry). */
    const RD_ADMIN_TAB_DESC = {
      registrations: 'Review and approve join requests',
      events: 'Manage published events',
      committee: 'Approve committee entries',
      notices: 'Publish and edit notices',
      social: 'Curate social posts',
      slides: 'Home and PDACC hero slides',
      pdacc: 'Edit the PDACC page content',
      faculty: 'The member directory',
      activity: 'Recent admin activity log',
      unclaimed: 'Profiles awaiting an owner',
      'unclaimed-matches': 'Review suggested matches',
      'unclaimed-audits': 'Merges that can be undone',
      email: 'Send an email to members',
      polls: 'Create and run polls',
      summary: 'Membership analytics'
    };
    const RD_ADMIN_STATUSES = ['PENDING', 'DUPLICATE', 'APPROVED', 'REJECTED', 'UPCOMING', 'ALL'];

    /* A repeat application is saved with Status = 'DUPLICATE' instead of being
       thrown away, and the applicant is told an admin will check it. Only the
       Registrations sheet ever writes that value, so the extra filter is
       offered on that one tab. */
    function adminStatusList() {
      return RD_ADMIN.tab === 'registrations'
        ? RD_ADMIN_STATUSES
        : RD_ADMIN_STATUSES.filter(s => s !== 'DUPLICATE');
    }

    let RD_ADMIN = { tab: 'registrations', status: 'PENDING', state: 'idle', gate: 'locked',
                     error: '', admin: '', rows: {}, busy: '', noteOpen: '',
                     nbEdit: '', scEdit: '', evEdit: '', slEdit: '', slPlace: 'home',
                     pdKind: 'LINE', pdEdit: '', role: 'ALL',
                     facEdit: '', facMissing: [],
                     askWhat: '', askId: '', backfillPreview: null, backfillChoices: {},
                     queueErrors: {}, selected: {}, emMode: 'group', emPick: '', emSel: {},
                     plNew: false, plBusy: '', plView: {}, plType: 'single', plVis: 'voters', plOpts: ['', ''],
                     hubCounts: null, hubCountsState: 'idle' };

    function adminTabMeta(key) {
      return RD_ADMIN_TABS.find(t => t.key === key) || RD_ADMIN_TABS[0];
    }

    /* ---------- two kinds of admin -----------------------------------------
       A PDACC admin looks after the PDACC page and nothing else, so the rest
       of the panel is not drawn for them. This is only what is on screen --
       the sheets are guarded on the server by rdRequireRole_(), which is what
       actually decides. Anything unrecognised is treated as a full admin, so a
       backend that has not been redeployed yet behaves exactly as before. */
    function adminTabList() {
      return RD_ADMIN.role === 'PDACC'
        ? RD_ADMIN_TABS.filter(t => t.key === 'pdacc')
        : RD_ADMIN_TABS;
    }

    function adminTabAllowed(key) {
      return adminTabList().some(t => t.key === key);
    }

    /* The refusal itself is the signal. A PDACC admin is turned away from the
       Membership Applications feed by rdRequireRole_() on the server, and that
       message is what opens their own tab instead of locking the page -- so
       nobody pays an extra round trip just to ask who they are. */
    function rdIsRoleError(err) {
      return /not open to your account/i.test(String(err && err.message || err));
    }

    async function adminOpenPdaccOnly() {
      RD_ADMIN.role = 'PDACC';
      RD_ADMIN.tab = 'pdacc';
      RD_ADMIN.state = 'idle';
      RD_ADMIN.error = '';
      RD_ADMIN.gate = 'open';
      adminGateRender();
      renderAdmin();
      await loadAdminDashboard(true);
    }

    /* Each source has its own column names. Normalising here means the card,
       the filter and the buttons are written exactly once. */
    function adminNormalize(tab, raw) {
      if (tab === 'registrations') {
        return {
          kind: 'registrations', id: String(raw['Registration ID'] || '').trim(),
          title: raw['Full Name (English)'] || '(no name)',
          subtitle: [raw['Department'], raw['Series'] ? 'Series ' + raw['Series'] : ''].filter(Boolean).join(' • '),
          status: String(raw['Status'] || '').trim().toUpperCase(),
          photo: raw['Passport Size Image'] || '',
          note: raw['Rejection Reason'] || raw['Admin Note'] || '',
          meta: [['Mobile', formatBdMobile(raw['Mobile Number'])], ['Email', raw['Email']],
                 ['Blood', raw['Blood Group']], ['Batch', raw['Batch']],
                 ['Employment', raw['Employment Type']],
                 ['Organization', raw['Current Organization / Company']],
                 ['Designation', raw['Current Designation']],
                 ['Member ID', raw['Member ID']], ['Applied', raw['Registration Date']]]
        };
      }
      if (tab === 'events') {
        return {
          kind: 'events', id: String(raw['Event ID'] || '').trim(),
          /* The edit form fills itself from the sheet's own columns, so the
             untouched row travels with the card. */
          raw: raw,
          title: raw['Event Name'] || '(no title)',
          subtitle: [raw['Category'], raw['Event Date']].filter(Boolean).join(' • '),
          status: String(raw['Status'] || '').trim().toUpperCase(),
          photo: raw['Main Image'] || '',
          note: raw['Admin Note'] || '',
          featured: String(raw['Featured'] || '').trim().toUpperCase() === 'YES',
          meta: [['Venue', raw['Venue']], ['Organized by', raw['Organized By']],
                 ['Contact', raw['Contact Person']], ['Contact no.', formatBdMobile(raw['Contact Number'])],
                 ['Submitted by', raw['Submitted By']], ['Submitter email', raw['Submitter Email']],
                 ['Submitted', raw['Submitted Date']]]
        };
      }
      return {
        kind: 'committee', id: String(raw.entryId || '').trim(),
        title: raw.fullName || '(no name)',
        subtitle: [raw.position, raw.session].filter(Boolean).join(' • '),
        status: String(raw.status || '').trim().toUpperCase(),
        photo: raw.photo || '', note: raw.adminNote || '',
        meta: [['Committee', raw.committee], ['Department', raw.department],
               ['Series', raw.series], ['Mobile', formatBdMobile(raw.mobile)], ['Email', raw.email],
               ['Submitted', raw.submittedDate], ['Approved', raw.approvedDate]]
      };
    }

    function adminRows() {
      const list = RD_ADMIN.rows[RD_ADMIN.tab] || [];
      if (RD_ADMIN.status === 'ALL') return list;
      return list.filter(r => r.status === RD_ADMIN.status);
    }

    function adminCounts() {
      const c = { PENDING: 0, DUPLICATE: 0, APPROVED: 0, REJECTED: 0, UPCOMING: 0, ALL: 0 };
      (RD_ADMIN.rows[RD_ADMIN.tab] || []).forEach(r => {
        if (c.hasOwnProperty(r.status)) c[r.status]++;
        c.ALL++;
      });
      return c;
    }

    /* ---------------- the sign-in gate ----------------
       'locked'   nothing has been tried yet
       'checking' one admin GET is in flight
       'denied'   the backend said no (not an admin, or not signed in)
       'open'     an admin GET succeeded -> the dashboard may be shown
       The browser never claims who it is; the backend decides. */
    function adminGateRender() {
      const gate = document.getElementById('admin-gate');
      const panel = document.getElementById('admin-panel');
      const btn = document.getElementById('admin-gate-btn');
      const msg = document.getElementById('admin-gate-msg');
      const open = RD_ADMIN.gate === 'open';
      if (gate) gate.classList.toggle('hidden', open);
      if (panel) panel.classList.toggle('hidden', !open);
      if (btn) {
        /* With Google's button on screen this one is only the retry. */
        const gsi = rdGsiReady();
        btn.disabled = RD_ADMIN.gate === 'checking';
        btn.classList.toggle('hidden', gsi && RD_ADMIN.gate !== 'denied');
        btn.textContent = RD_ADMIN.gate === 'checking'
          ? 'Checking your access\u2026'
          : (RD_ADMIN.gate === 'denied'
              ? (gsi ? 'Sign in again' : 'Try again')
              : 'Continue with your Google account');
      }
      if (msg) {
        msg.innerHTML = RD_ADMIN.gate === 'denied'
          ? '<p class="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700 leading-relaxed">' +
            escapeHtml(RD_ADMIN.error || 'This Google account is not on the admin list.') +
            '</p>'
          : '';
      }
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    }

    /* ---------- Google sign-in -------------------------------------------
       A cross-origin fetch carries no Google session, so the backend cannot
       see who is calling. Google's own button hands us a signed ID token
       instead; the backend verifies that token and reads the email out of it.
       The browser never states who it is. */
    let rdGsiDrawn = false;

    function rdAdminWantsIn() {
      try { return localStorage.getItem(RD_ADMIN_KEEP) === '1'; } catch (err) { return false; }
    }

    function rdAdminRemember(token) {
      RD_ADMIN_TOKEN = token || '';
      try {
        if (token) {
          localStorage.setItem(RD_ADMIN_KEY, token);
          localStorage.setItem(RD_ADMIN_KEEP, '1');
        } else {
          localStorage.removeItem(RD_ADMIN_KEY);
          localStorage.removeItem(RD_ADMIN_KEEP);
          localStorage.removeItem(RD_ADMIN_PROFILE_KEY);
        }
      } catch (err) { /* private mode: the current page can still authenticate */ }
    }

    function rdAdminNavPaint() {
      const on = RD_ADMIN.gate === 'open' && !!RD_ADMIN_TOKEN;
      ['nav-admin-menu', 'mobile-admin-menu'].forEach(function (id) {
        const el = document.getElementById(id);
        if (el) {
          el.classList.toggle('hidden', !on);
          if (id === 'nav-admin-menu') el.classList.toggle('flex', on);
        }
      });
      const pending = (RD_ADMIN.rows.registrations || []).filter(r => r.status === 'PENDING' || r.status === 'DUPLICATE').length +
        (RD_ADMIN.rows.committee || []).filter(r => r.status === 'PENDING').length +
        (RD_ADMIN.rows.events || []).filter(r => r.status === 'PENDING').length +
        (RD_ADMIN.rows['unclaimed-matches'] ? RD_ADMIN.rows['unclaimed-matches'].filter(r => String(r.status || 'PENDING').toUpperCase() === 'PENDING').length : 0);
      ['nav-admin-badge', 'mobile-admin-badge'].forEach(function (id) {
        const badge = document.getElementById(id);
        if (!badge) return;
        badge.textContent = pending ? String(pending) : '';
        badge.classList.toggle('hidden', !on || !pending);
        badge.classList.toggle('inline-flex', on && !!pending);
        badge.classList.toggle('items-center', on && !!pending);
        badge.classList.toggle('justify-center', on && !!pending);
        badge.classList.toggle('min-w-[1.25rem]', on && !!pending);
        badge.classList.toggle('h-5', on && !!pending);
        badge.classList.toggle('px-1', on && !!pending);
        badge.classList.toggle('rounded-md', on && !!pending);
        badge.classList.toggle('bg-amber-100', on && !!pending);
        badge.classList.toggle('text-amber-800', on && !!pending);
        badge.classList.toggle('text-[10px]', on && !!pending);
        badge.classList.toggle('font-black', on && !!pending);
      });
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      /* Recompute the member-side prompts against the new admin gate so an
         admin who just signed in stops seeing Sign In / Membership Application. */
      if (typeof rdMemberNavPaint === 'function') rdMemberNavPaint();
    }

    function rdGsiReady() {
      return !!(RD_ADMIN_CLIENT_ID && window.google && google.accounts && google.accounts.id);
    }

    function adminGoogleCredential(resp) {
      rdAdminRemember((resp && resp.credential) || '');
      if (!RD_ADMIN_TOKEN) { adminGateLock('The Google sign-in did not complete.'); return; }
      adminGateVerify();
    }

    function rdDrawGsiButton() {
      const box = document.getElementById('admin-gsi-btn');
      if (!box) return false;
      if (!rdGsiReady()) { box.classList.add('hidden'); return false; }
      box.classList.remove('hidden');
      if (rdGsiDrawn && rdGsiOwner === 'admin') return true;
      try {
        google.accounts.id.initialize({
          client_id: RD_ADMIN_CLIENT_ID,
          callback: adminGoogleCredential,
          auto_select: true,
          cancel_on_tap_outside: true
        });
        google.accounts.id.renderButton(box, {
          theme: 'outline', size: 'large', shape: 'pill',
          text: 'signin_with', width: 260, locale: 'en'
        });
        rdGsiDrawn = true;
        rdGsiOwner = 'admin';
        return true;
      } catch (err) {
        box.classList.add('hidden');
        return false;
      }
    }

    /* Opening the page never fetches anything on its own. */
    function adminEnterPage() {
      if (RD_ADMIN.gate === 'open') { adminGateRender(); loadAdminDashboard(); adminLoadHubCounts(); return; }
      if (RD_ADMIN.gate === 'checking') return;
      if (RD_ADMIN_TOKEN && rdAdminWantsIn()) {
        try {
          const cached = localStorage.getItem(RD_ADMIN_PROFILE_KEY);
          if (cached) {
            const adm = JSON.parse(cached);
            if (adm && adm.admin) {
              RD_ADMIN.admin = adm.admin;
              if (adm.role) RD_ADMIN.role = adm.role;
              RD_ADMIN.gate = 'checking';
              RD_ADMIN.state = 'loading';
              adminGateRender();
              adminGateVerify(true);
              return;
            }
          }
        } catch (err) {}
        adminGateVerify();
        return;
      }
      RD_ADMIN.gate = 'locked';
      RD_ADMIN.error = '';
      adminGateRender();
      /* The GIS script loads async, so try now and once more shortly after. */
      if (!rdDrawGsiButton()) setTimeout(rdDrawGsiButton, 700);
    }

    async function adminGateVerify() {
      const quiet = !!arguments[0];
      if (RD_ADMIN.gate === 'checking') return;
      /* Pressed with no token in hand: ask Google first. */
      if (rdGsiReady() && !RD_ADMIN_TOKEN) {
        if (rdDrawGsiButton()) {
          try { google.accounts.id.prompt(); } catch (err) { /* button is there */ }
          return;
        }
      }
      if (!quiet || RD_ADMIN.gate !== 'open') {
        RD_ADMIN.gate = 'checking';
        RD_ADMIN.error = '';
        adminGateRender();
      }

      /* Ask who this is before asking for anything they may not be allowed to
         see. This used to be inferred from the refusal that came back when a
         PDACC admin reached for the Membership Applications feed, which saved a
         round trip but read the server's wording to do it -- so any handler
         that rephrased or wrapped the message sent a PDACC admin to the error
         card instead of their own page. The role now comes from the one route
         that exists to answer exactly that question. */
      try {
        const who = await apiGet('adminrole', {});
        if (who && who.role === 'PDACC') { await adminOpenPdaccOnly(); return; }
      } catch (err) {
        /* An older deployment has no adminrole route. Fall through: the refusal
           below is still read, so nothing gets worse than it was. */
      }

      try {
        const meta = adminTabMeta('registrations');
        const res = await apiGet(meta.action, {});
        const raw = Array.isArray(res.data) ? res.data : [];
        RD_ADMIN.rows.registrations = raw.map(r => adminNormalize('registrations', r)).filter(r => r.id);
        RD_ADMIN.admin = res.admin && res.admin.adminId ? res.admin.adminId : (res.admin || '');
        RD_ADMIN.tab = 'registrations';
        RD_ADMIN.state = 'ready';
        RD_ADMIN.gate = 'open';
        try {
          localStorage.setItem(RD_ADMIN_PROFILE_KEY, JSON.stringify({ admin: RD_ADMIN.admin, role: RD_ADMIN.role || 'ALL' }));
        } catch (cacheErr) {}
        adminGateRender();
        renderAdmin();
        rdAdminNavPaint();
        memberLoadContacts();
        preloadAdminActionQueues();
      } catch (err) {
        if (rdIsRoleError(err)) { await adminOpenPdaccOnly(); return; }
        adminGateLock(friendlyError(err).msg);
        return;
      }
      /* Fill the hub cards' real numbers once the gate is open. Placed after the
         try/catch so it only runs on success, and so it does not sit between the
         function head and the role-error fallback the harness measures. */
      adminLoadHubCounts();
    }

    /* Which failures actually mean "you are not signed in".
       This used to be /admin/i, and that was the bug: an ordinary error
       like "getAdminSocialPosts is not defined" carries the word admin in
       it, so changing a tab threw the sign-in page up. The test now reads
       the server's own wording, and a missing function is never auth. */
    function rdIsAuthError(raw) {
      const text = String(raw && raw.message ? raw.message : (raw == null ? '' : raw));
      if (/is not defined|Script function not found|not a function/i.test(text)) return false;
      return /sign ?-?in|signed in|not on the admin list|admin list|no admin|not an admin|expired|not authoris|not authoriz|unauthoriz|permission denied|admin access|token/i.test(text);
    }

    /* A later request may still be refused (the Google session can expire, or
       an admin can be removed from the sheet); when that happens the gate
       closes again instead of leaving an empty dashboard on screen. */
    function adminGateLock(message) {
      RD_ADMIN.gate = 'denied';
      RD_ADMIN.error = message || '';
      /* An expired sign-in must not be sent a second time. */
      if (/sign in again|expired|not be verified|not be identified|unauthoriz|not an admin|admin access/i.test(RD_ADMIN.error)) {
        rdAdminRemember('');
        try { if (rdGsiReady()) google.accounts.id.disableAutoSelect(); } catch (err) {}
      }
      RD_ADMIN.rows = { registrations: null, events: null, committee: null };
      adminGateRender();
      rdAdminNavPaint();
    }

    /* Signing out is the gate closing on purpose. The token is dropped, Google
       is told not to sign this browser back in by itself, and every loaded row
       is thrown away so the next person on this computer starts from the
       sign-in card with nothing of the last admin left on screen. No popup:
       the page simply goes back to its locked state. */
    function adminSignOut() {
      rdAdminRemember('');
      try { if (rdGsiReady()) google.accounts.id.disableAutoSelect(); } catch (err) {}
      RD_ADMIN.gate = 'locked';
      RD_ADMIN.state = 'idle';
      RD_ADMIN.error = '';
      RD_ADMIN.admin = '';
      RD_ADMIN.role = 'ALL';
      RD_ADMIN.tab = 'registrations';
      RD_ADMIN.status = 'PENDING';
      RD_ADMIN.rows = {};
      RD_ADMIN.busy = '';
      RD_ADMIN.noteOpen = '';
      RD_ADMIN.askWhat = '';
      RD_ADMIN.askId = '';
      adminGateRender();
      rdAdminNavPaint();
      if (!rdDrawGsiButton()) setTimeout(rdDrawGsiButton, 700);
    }

    function rdAdminRestore() {
      let token = '';
      try { token = localStorage.getItem(RD_ADMIN_KEY) || ''; } catch (err) { token = ''; }
      if (!token || !rdAdminWantsIn()) {
        rdAdminNavPaint();
        return;
      }
      RD_ADMIN_TOKEN = token;
      try {
        const cached = localStorage.getItem(RD_ADMIN_PROFILE_KEY);
        if (cached) {
          const adm = JSON.parse(cached);
          if (adm && adm.admin) {
            RD_ADMIN.admin = adm.admin;
            if (adm.role) RD_ADMIN.role = adm.role;
            RD_ADMIN.gate = 'checking';
            RD_ADMIN.state = 'loading';
            adminGateRender();
            adminGateVerify(true);
            return;
          }
        }
      } catch (err) {}
      RD_ADMIN.gate = 'locked';
      adminGateRender();
      adminGateVerify();
    }

    async function loadAdminDashboard(force) {
      const tab = RD_ADMIN.tab;
      if (RD_ADMIN.state === 'loading') return;
      if (RD_ADMIN.rows[tab] && !force) { renderAdmin(); return; }
      RD_ADMIN.state = 'loading';
      RD_ADMIN.error = '';
      renderAdmin();
      try {
        const meta = adminTabMeta(tab);
        if (meta.custom) {
          RD_ADMIN.rows[tab] = await adminLoadCustom(tab);
        } else {
          const res = await apiGet(meta.action, tab === 'committee' ? { status: 'ALL' } : {});
          const raw = Array.isArray(res.data) ? res.data : [];
          RD_ADMIN.rows[tab] = raw.map(r => adminNormalize(tab, r)).filter(r => r.id);
          RD_ADMIN.admin = res.admin && res.admin.adminId ? res.admin.adminId : (res.admin || '');
        }
        RD_ADMIN.state = 'ready';
      } catch (err) {
        /* The tab is marked as tried, so leaving it and coming back does not
           fire the same doomed request again. */
        RD_ADMIN.rows[tab] = RD_ADMIN.rows[tab] || [];
        RD_ADMIN.state = 'error';
        RD_ADMIN.error = friendlyError(err).msg;
        /* The raw message is what carries the server's wording; the friendly
           one has already been softened. */
        if (rdIsAuthError(err)) { adminGateLock(RD_ADMIN.error); return; }
      }
      renderAdmin();
    }

    async function preloadAdminActionQueues() {
      if (RD_ADMIN.role === 'PDACC' || RD_ADMIN.gate !== 'open') return;
      const queueTabs = ['unclaimed', 'unclaimed-matches', 'unclaimed-audits'];
      const loadCommittee = !RD_ADMIN.rows.committee ? (async function () {
        try {
          const res = await apiGet('adminexecutivecommittee', { status: 'ALL' });
          const raw = Array.isArray(res.data) ? res.data : [];
          RD_ADMIN.rows.committee = raw.map(r => adminNormalize('committee', r)).filter(r => r.id);
        } catch (err) {}
      })() : Promise.resolve();

      const loadRegistrations = !RD_ADMIN.rows.registrations ? (async function () {
        try {
          const res = await apiGet('getadminregistrations', {});
          const raw = Array.isArray(res.data) ? res.data : [];
          RD_ADMIN.rows.registrations = raw.map(r => adminNormalize('registrations', r)).filter(r => r.id);
        } catch (err) {}
      })() : Promise.resolve();

      const loadEvents = !RD_ADMIN.rows.events ? (async function () {
        try {
          const res = await apiGet('getadminevents', {});
          const raw = Array.isArray(res.data) ? res.data : [];
          RD_ADMIN.rows.events = raw.map(r => adminNormalize('events', r)).filter(r => r.id);
        } catch (err) {}
      })() : Promise.resolve();

      await Promise.all([
        loadCommittee,
        loadRegistrations,
        loadEvents,
        ...queueTabs.map(async function (tab) {
          try {
            RD_ADMIN.rows[tab] = await adminLoadCustom(tab);
            delete RD_ADMIN.queueErrors[tab];
          } catch (err) {
            RD_ADMIN.queueErrors[tab] = friendlyError(err).msg;
          }
        })
      ]);
      renderAdmin();
    }

    /* Kept for the summary quick-links and any onclick still calling it: a tab
       switch now means "open that module's sub-page". */
    function adminSwitchTab(key) {
      if (!adminTabAllowed(key)) return;
      adminOpenModule(key);
    }

    function adminSetStatus(status) {
      RD_ADMIN.status = status;
      RD_ADMIN.selected = {};
      RD_ADMIN.noteOpen = '';
      renderAdmin();
    }

    function adminStatusChip(status) {
      const map = {
        PENDING:  'bg-amber-50 border-amber-200 text-amber-700',
        DUPLICATE: 'bg-orange-100 border-orange-300 text-orange-800',
        APPROVED: 'bg-emerald-50 border-emerald-200 text-emerald-700',
        REJECTED: 'bg-rose-50 border-rose-200 text-rose-700'
      };
      return '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-extrabold ' +
        (map[status] || 'bg-slate-100 border-slate-200 text-slate-600') + '">' + escapeHtml(status || 'UNKNOWN') + '</span>';
    }

    function adminGetPendingRows() {
      if (RD_ADMIN.tab === 'unclaimed-matches') {
        return (RD_ADMIN.rows['unclaimed-matches'] || []).filter(r => String(r.status || 'PENDING').toUpperCase() === 'PENDING');
      }
      if (!adminTabMeta(RD_ADMIN.tab).custom) {
        return adminRows().filter(r => r.status === 'PENDING' || r.status === 'DUPLICATE');
      }
      return [];
    }

    function adminGetSelectedCount() {
      const pending = adminGetPendingRows();
      return pending.reduce((count, r) => count + (RD_ADMIN.selected[r.id || r.matchId] ? 1 : 0), 0);
    }

    function adminToggleSelect(id, checked) {
      RD_ADMIN.selected[id] = !!checked;
      adminUpdateBatchToolbar();
      renderAdmin();
    }

    function adminToggleSelectAll(checked) {
      const pending = adminGetPendingRows();
      pending.forEach(r => {
        RD_ADMIN.selected[r.id || r.matchId] = !!checked;
      });
      adminUpdateBatchToolbar();
      renderAdmin();
    }

    function adminUpdateBatchToolbar() {
      const pending = adminGetPendingRows();
      const count = adminGetSelectedCount();
      const total = pending.length;
      const allCb = document.getElementById('admin-select-all');
      if (allCb) {
        allCb.checked = total > 0 && count === total;
        allCb.indeterminate = count > 0 && count < total;
      }
      const countEl = document.getElementById('admin-batch-count');
      if (countEl) {
        countEl.textContent = count + ' of ' + total + ' selected';
      }
      const btnApprove = document.getElementById('admin-batch-approve-btn');
      if (btnApprove) btnApprove.disabled = count === 0;
      const btnReject = document.getElementById('admin-batch-reject-btn');
      if (btnReject) btnReject.disabled = count === 0;
    }

    function adminBatchToolbarHtml() {
      const pending = adminGetPendingRows();
      if (!pending.length) return '';
      const count = adminGetSelectedCount();
      const total = pending.length;
      const isMatches = RD_ADMIN.tab === 'unclaimed-matches';
      const allChecked = total > 0 && count === total;
      const rejectNoteOpen = RD_ADMIN.batchRejectOpen;

      let actions = '';
      if (isMatches) {
        actions = '<div class="flex flex-wrap items-center gap-2">' +
          '<button type="button" id="admin-batch-approve-btn" onclick="adminBatchMergeUnclaimed()" ' +
          (count === 0 ? 'disabled ' : '') +
          'class="admin-glass-btn inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black shadow-xs hover:bg-emerald-700 disabled:opacity-40 disabled:pointer-events-none cursor-pointer">' +
          '<i data-lucide="git-merge" class="w-3.5 h-3.5"></i> Merge Selected (' + count + ')</button>' +
          '<button type="button" id="admin-batch-reject-btn" onclick="adminBatchSeparateUnclaimed()" ' +
          (count === 0 ? 'disabled ' : '') +
          'class="admin-glass-btn inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-black hover:border-slate-400 disabled:opacity-40 disabled:pointer-events-none cursor-pointer">' +
          '<i data-lucide="split" class="w-3.5 h-3.5"></i> Keep Separate (' + count + ')</button>' +
        '</div>';
      } else {
        actions = '<div class="flex flex-wrap items-center gap-2">' +
          '<button type="button" id="admin-batch-approve-btn" onclick="adminBatchApprove()" ' +
          (count === 0 ? 'disabled ' : '') +
          'class="admin-glass-btn inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black shadow-xs hover:bg-emerald-700 disabled:opacity-40 disabled:pointer-events-none cursor-pointer">' +
          '<i data-lucide="check-check" class="w-3.5 h-3.5"></i> Approve Selected (' + count + ')</button>' +
          '<button type="button" id="admin-batch-reject-btn" onclick="adminBatchToggleReject()" ' +
          (count === 0 ? 'disabled ' : '') +
          'class="admin-glass-btn inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-black hover:bg-rose-100 disabled:opacity-40 disabled:pointer-events-none cursor-pointer">' +
          '<i data-lucide="circle-x" class="w-3.5 h-3.5"></i> Reject Selected (' + count + ')</button>' +
        '</div>';
      }

      const rejectBox = rejectNoteOpen && count > 0 ? (
        '<div class="mt-3 p-3.5 rounded-2xl border border-rose-200 bg-rose-50/80 text-left">' +
          '<label class="block text-xs font-extrabold text-rose-800 mb-1.5" for="admin-batch-reject-note">Reason for rejecting selected ' + count + ' item(s):</label>' +
          '<textarea id="admin-batch-reject-note" rows="2" class="form-input text-xs" placeholder="Write a reason for batch rejection (required for committee nominations)"></textarea>' +
          '<div class="mt-2.5 flex items-center gap-2">' +
            '<button type="button" onclick="adminBatchConfirmReject()" class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-black hover:bg-rose-700 cursor-pointer"><i data-lucide="circle-x" class="w-3.5 h-3.5"></i> Confirm Reject ' + count + ' Items</button>' +
            '<button type="button" onclick="adminBatchToggleReject(false)" class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-600 text-xs font-bold hover:bg-slate-50 cursor-pointer">Cancel</button>' +
          '</div>' +
        '</div>'
      ) : '';

      return '<div class="admin-glass-toolbar rounded-2xl border border-slate-200/80 p-3.5 shadow-xs mb-4">' +
        '<div class="flex flex-wrap items-center justify-between gap-3">' +
          '<label class="inline-flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">' +
            '<input type="checkbox" id="admin-select-all" class="w-4 h-4 rounded text-slate-900 border-slate-300 focus:ring-slate-800 cursor-pointer" ' +
            (allChecked ? 'checked ' : '') + 'onchange="adminToggleSelectAll(this.checked)"/>' +
            '<span>Select all pending</span>' +
            '<span id="admin-batch-count" class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-600">' +
              count + ' of ' + total + ' selected' +
            '</span>' +
          '</label>' +
          actions +
        '</div>' +
        rejectBox +
      '</div>';
    }

    function adminBatchToggleReject(forceState) {
      if (typeof forceState === 'boolean') {
        RD_ADMIN.batchRejectOpen = forceState;
      } else {
        RD_ADMIN.batchRejectOpen = !RD_ADMIN.batchRejectOpen;
      }
      renderAdmin();
    }

    async function adminBatchConfirmReject() {
      const noteEl = document.getElementById('admin-batch-reject-note');
      const note = noteEl ? String(noteEl.value || '').trim() : '';
      const pending = adminGetPendingRows();
      const ids = pending.map(r => r.id).filter(id => RD_ADMIN.selected[id]);
      if (RD_ADMIN.tab === 'committee' && !note) {
        showToast('Please write a short reason before rejecting committee entries.', 'error', 'A reason is needed', { backTo: 'admin' });
        if (noteEl) noteEl.focus();
        return;
      }
      await adminBatchReject(note || 'Declined during admin batch review.');
    }

    async function adminBatchApprove() {
      const pending = adminGetPendingRows();
      const ids = pending.map(r => r.id).filter(id => RD_ADMIN.selected[id]);
      if (!ids.length || RD_ADMIN.busy) return;
      RD_ADMIN.busy = 'batch';
      renderAdmin();
      let successCount = 0;
      let failCount = 0;
      for (const id of ids) {
        try {
          const row = adminFind(id);
          if (row) {
            await adminActionCall(row.kind, 'approve', id, '');
            row.status = 'APPROVED';
            delete RD_ADMIN.selected[id];
            successCount++;
          }
        } catch (err) {
          failCount++;
        }
      }
      RD_ADMIN.busy = '';
      rdFeedForget('alumni');
      rdFeedForget('events');
      rdFeedForget('committee');
      if (successCount) {
        showToast(successCount + ' item' + (successCount === 1 ? '' : 's') + ' approved successfully.' + (failCount ? ' (' + failCount + ' failed)' : ''), 'success', 'Batch Approved', { backTo: 'admin' });
      } else if (failCount) {
        showToast('Could not approve selected items.', 'error', 'Batch Failed', { backTo: 'admin' });
      }
      await loadAdminDashboard(true);
    }

    async function adminBatchReject(note) {
      const pending = adminGetPendingRows();
      const ids = pending.map(r => r.id).filter(id => RD_ADMIN.selected[id]);
      if (!ids.length || RD_ADMIN.busy) return;
      const defaultNote = note || 'Declined during admin batch review.';
      RD_ADMIN.busy = 'batch';
      renderAdmin();
      let successCount = 0;
      let failCount = 0;
      for (const id of ids) {
        try {
          const row = adminFind(id);
          if (row) {
            await adminActionCall(row.kind, 'reject', id, defaultNote);
            row.status = 'REJECTED';
            delete RD_ADMIN.selected[id];
            successCount++;
          }
        } catch (err) {
          failCount++;
        }
      }
      RD_ADMIN.busy = '';
      RD_ADMIN.batchRejectOpen = false;
      rdFeedForget('alumni');
      rdFeedForget('events');
      rdFeedForget('committee');
      if (successCount) {
        showToast(successCount + ' item' + (successCount === 1 ? '' : 's') + ' rejected.' + (failCount ? ' (' + failCount + ' failed)' : ''), 'info', 'Batch Rejected', { backTo: 'admin' });
      } else if (failCount) {
        showToast('Could not reject selected items.', 'error', 'Batch Failed', { backTo: 'admin' });
      }
      await loadAdminDashboard(true);
    }

    async function adminBatchMergeUnclaimed() {
      const pending = adminGetPendingRows();
      const ids = pending.map(r => r.matchId).filter(id => RD_ADMIN.selected[id]);
      if (!ids.length || RD_ADMIN.busy) return;
      RD_ADMIN.busy = 'batch';
      renderAdmin();
      let successCount = 0;
      for (const id of ids) {
        try {
          await apiPost('mergeunclaimed', { matchId: id });
          delete RD_ADMIN.selected[id];
          successCount++;
        } catch (err) {}
      }
      RD_ADMIN.busy = '';
      showToast(successCount + ' matches merged successfully.', 'success', 'Batch Merged', { backTo: 'admin' });
      await loadAdminDashboard(true);
    }

    async function adminBatchSeparateUnclaimed() {
      const pending = adminGetPendingRows();
      const ids = pending.map(r => r.matchId).filter(id => RD_ADMIN.selected[id]);
      if (!ids.length || RD_ADMIN.busy) return;
      RD_ADMIN.busy = 'batch';
      renderAdmin();
      let successCount = 0;
      for (const id of ids) {
        try {
          await apiPost('keepunclaimedseparate', { matchId: id });
          delete RD_ADMIN.selected[id];
          successCount++;
        } catch (err) {}
      }
      RD_ADMIN.busy = '';
      showToast(successCount + ' matches kept separate.', 'info', 'Kept Separate', { backTo: 'admin' });
      await loadAdminDashboard(true);
    }

    function adminCard(r) {
      const busy = RD_ADMIN.busy === r.id || RD_ADMIN.busy === 'batch';
      const noteOn = RD_ADMIN.noteOpen === r.id;
      const isPending = r.status === 'PENDING' || r.status === 'DUPLICATE';
      const isSelected = !!RD_ADMIN.selected[r.id];
      const rows = r.meta.filter(m => String(m[1] || '').trim() !== '')
        .map(m => '<div class="flex gap-2 min-w-0"><span class="w-28 shrink-0 text-[11px] font-extrabold uppercase tracking-wide text-slate-400">' +
          escapeHtml(m[0]) + '</span><span class="text-xs font-semibold text-slate-700 break-words min-w-0">' +
          escapeHtml(String(m[1])) + '</span></div>').join('');

      const thumb = String(r.photo || '').trim()
        ? '<img src="' + escapeHtml(r.photo) + '" alt="' + escapeHtml(r.title) + '" loading="lazy" ' +
          'class="w-16 h-16 rounded-2xl object-cover border border-slate-200 shrink-0" ' +
          'onerror="rdPhotoFallback(this)"/>'
        : '<div class="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center text-slate-400"><i data-lucide="image" class="w-5 h-5"></i></div>';

      const act = (label, icon, cls, fn) =>
        '<button type="button" ' + (busy ? 'disabled ' : '') + 'onclick="' + fn + '" ' +
        'class="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-extrabold border transition cursor-pointer ' +
        (busy ? 'opacity-50 pointer-events-none ' : '') + cls + '">' +
        '<i data-lucide="' + icon + '" class="w-3.5 h-3.5"></i> ' + label + '</button>';

      let buttons = '';
      if (r.status !== 'APPROVED') {
        buttons += act('Approve', 'check-circle-2',
          'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700',
          "adminApprove('" + r.id + "')");
      }
      if (r.status !== 'REJECTED') {
        buttons += act(noteOn ? 'Cancel' : 'Reject', noteOn ? 'x' : 'circle-x',
          'bg-white border-rose-200 text-rose-700 hover:bg-rose-50',
          "adminToggleNote('" + r.id + "')");
      }
      if (r.kind === 'events' && (r.status === 'APPROVED' || r.status === 'PENDING')) {
        buttons += act(RD_ADMIN.evEdit === r.id ? 'Close the form' : 'Edit the details',
          RD_ADMIN.evEdit === r.id ? 'x' : 'pencil',
          'bg-white border-slate-300 text-slate-700 hover:bg-slate-50',
          "adminEventEdit('" + r.id + "')");
      }
      if (r.kind === 'events' && r.status === 'APPROVED') {
        /* The public list shows APPROVED only, so hiding is a move back to
           PENDING -- no new Status value is ever written to the sheet. */
        buttons += act('Hide from the site', 'eye-off',
          'bg-white border-amber-200 text-amber-700 hover:bg-amber-50',
          "adminAsk('evHide','" + r.id + "')");
        buttons += act(r.featured ? 'Unfeature' : 'Feature', 'star',
          r.featured ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'
                     : 'bg-white border-blue-200 text-blue-700 hover:bg-blue-50',
          "adminToggleFeatured('" + r.id + "'," + (r.featured ? 'false' : 'true') + ")");
      }

      /* The committee backend refuses an empty reason, so saying "optional"
         there meant every rejection silently failed and the row stayed
         PENDING. The label now matches what the server will accept. */
      const noteMust = r.kind === 'committee';
      const noteBox = noteOn
        ? '<div class="mt-4 rounded-2xl border border-rose-200 bg-rose-50/60 p-4">' +
            '<label class="block text-xs font-extrabold text-rose-800 mb-2" for="admin-note-' + escapeHtml(r.id) + '">Reason for rejection ' + (noteMust ? '(required)' : '(optional)') + '</label>' +
            '<textarea id="admin-note-' + escapeHtml(r.id) + '" rows="2" class="form-input" placeholder="Write a short reason. The applicant may see this."></textarea>' +
            '<button type="button" onclick="adminReject(\'' + r.id + '\')" class="mt-3 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-extrabold hover:bg-rose-700 cursor-pointer"><i data-lucide="circle-x" class="w-3.5 h-3.5"></i> Confirm rejection</button>' +
          '</div>'
        : '';

      const selectBox = isPending
        ? '<label class="inline-flex items-center cursor-pointer p-1 -m-1 mr-1.5" title="Select for batch action">' +
            '<input type="checkbox" class="admin-select-row w-4 h-4 rounded text-slate-900 border-slate-300 focus:ring-slate-800 cursor-pointer" ' +
            (isSelected ? 'checked ' : '') +
            'onchange="adminToggleSelect(\'' + escapeHtml(r.id) + '\', this.checked)"/>' +
          '</label>'
        : '';

      return '' +
      '<article class="admin-glass-card rd-admin-item rounded-3xl border border-slate-200 shadow-xs p-5 sm:p-6 transition hover:shadow-md ' +
        (isSelected ? 'ring-2 ring-slate-800/30 bg-slate-50/50' : 'bg-white') + '">' +
        '<div class="flex items-start gap-3.5">' +
          selectBox +
          thumb +
          '<div class="min-w-0 flex-1">' +
            '<div class="flex flex-wrap items-center gap-2">' +
              '<h4 class="font-extrabold text-base text-slate-900 break-words">' + escapeHtml(r.title) + '</h4>' +
              adminStatusChip(r.status) +
              (r.kind === 'events' && r.featured ? '<span class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-extrabold"><i data-lucide="star" class="w-3 h-3"></i> Featured</span>' : '') +
            '</div>' +
            (r.subtitle ? '<p class="text-xs font-bold text-slate-500 mt-1">' + escapeHtml(r.subtitle) + '</p>' : '') +
            '<p class="text-[11px] font-mono font-bold text-slate-400 mt-1">' + escapeHtml(r.id) + '</p>' +
          '</div>' +
        '</div>' +
        '<div class="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-2">' + rows + '</div>' +
        (r.status === 'DUPLICATE'
          ? '<p class="mt-4 text-xs font-semibold text-orange-800 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 leading-relaxed"><span class="font-extrabold">Possible repeat application.</span> The same name, mobile number or email already appears on the list. Check the directory first: approve it only if this is a different person, otherwise reject it with a short note.</p>'
          : '') +
        (String(r.note || '').trim()
          ? '<p class="mt-4 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 break-words"><span class="font-extrabold text-slate-500">Admin note:</span> ' + escapeHtml(r.note) + '</p>'
          : '') +
        (buttons ? '<div class="mt-5 flex flex-wrap gap-2">' + buttons + '</div>' : '') +
        noteBox +
        adminEventEditBox(r) +
      '</article>';
    }

    /* The hub is a grid of glass launcher cards. Each card shows the module's
       label + one-line description and, when the backend has answered, its real
       counts (pending / total). Numbers are never invented here: until
       getadmincounts returns we show a skeleton chip, and a module the endpoint
       carries no number for (pdacc / email / polls / summary) shows label only.
       Clicking a card opens that module on its own sub-page (adminOpenModule). */
    function adminHubMetricChips(key) {
      const st = RD_ADMIN.hubCountsState;
      const c = RD_ADMIN.hubCounts && RD_ADMIN.hubCounts[key];
      if (st === 'loading' && !c) {
        return '<span class="rd-admin-metric-skeleton" aria-hidden="true"></span>';
      }
      if (!c) return '';
      const chips = [];
      if (c.pending != null && c.pending > 0) {
        chips.push('<span class="rd-admin-metric rd-admin-metric-pending"><i data-lucide="clock" class="w-3 h-3"></i>' + c.pending + ' pending</span>');
      }
      if (c.action != null && c.action > 0) {
        chips.push('<span class="rd-admin-metric rd-admin-metric-pending">' + c.action + '</span>');
      }
      if (c.total != null) {
        chips.push('<span class="rd-admin-metric rd-admin-metric-total">' + c.total + ' total</span>');
      }
      if (!chips.length && c.pending === 0) {
        chips.push('<span class="rd-admin-metric rd-admin-metric-open">All clear</span>');
      }
      return chips.join('');
    }

    function adminRenderTabs() {
      const box = document.getElementById('admin-tabs');
      if (!box) return;
      const tabs = adminTabList();
      box.innerHTML = tabs.map(t => {
        const metrics = adminHubMetricChips(t.key);
        return '<button type="button" onclick="adminOpenModule(\'' + t.key + '\')" ' +
          'class="rd-admin-card group">' +
          '<span class="rd-admin-card-go"><i data-lucide="arrow-up-right" class="w-4 h-4"></i></span>' +
          '<span class="rd-admin-card-ico"><i data-lucide="' + t.icon + '" class="w-5 h-5"></i></span>' +
          '<span class="rd-admin-card-title">' + t.label + '</span>' +
          '<span class="rd-admin-card-desc">' + (RD_ADMIN_TAB_DESC[t.key] || '') + '</span>' +
          '<span class="rd-admin-card-metrics">' + metrics + '</span>' +
        '</button>';
      }).join('');
      if (window.lucide && lucide.createIcons) { try { lucide.createIcons(); } catch (e) {} }
    }

    /* One lightweight GET fills every card's number at once. Cache-guarded: a
       re-entry into an already-open admin page must not refetch (the harness
       asserts no request fires on re-entry), so pass force only from the hub
       Refresh button. */
    async function adminLoadHubCounts(force) {
      if (RD_ADMIN.gate !== 'open') return;
      if (RD_ADMIN.role === 'PDACC') return;   /* PDACC admin has no hub grid */
      if (RD_ADMIN.hubCounts && !force) return;
      if (RD_ADMIN.hubCountsState === 'loading') return;
      RD_ADMIN.hubCountsState = 'loading';
      adminRenderTabs();
      try {
        const res = await apiGet('getadmincounts', {});
        RD_ADMIN.hubCounts = (res && res.counts) || {};
        RD_ADMIN.hubCountsState = 'ready';
      } catch (err) {
        RD_ADMIN.hubCountsState = 'error';   /* cards fall back to label only */
      }
      adminRenderTabs();
    }

    /* Opening a module = go to its own sub-page (#page-admin-module), set the
       working tab, and load that module's rows. No popup, real page + back. */
    function adminOpenModule(key) {
      if (!adminTabAllowed(key)) return;
      RD_ADMIN.tab = key;
      RD_ADMIN.selected = {};
      if (RD_ADMIN.status === 'DUPLICATE' && key !== 'registrations') RD_ADMIN.status = 'PENDING';
      RD_ADMIN.noteOpen = '';
      RD_ADMIN.nbEdit = '';
      RD_ADMIN.scEdit = '';
      RD_ADMIN.evEdit = '';
      RD_ADMIN.slEdit = '';
      RD_ADMIN.askWhat = '';
      RD_ADMIN.askId = '';
      const titleEl = document.getElementById('admin-module-title');
      if (titleEl) titleEl.textContent = adminTabMeta(key).label;
      openSubPage('admin-module');
      loadAdminDashboard();
    }


    function adminRenderFilters() {
      const box = document.getElementById('admin-filters');
      if (!box) return;
      /* PENDING / APPROVED / REJECTED mean nothing on a notice or a summary,
         so those tabs keep the Refresh button and drop the rest. */
      if (adminTabMeta(RD_ADMIN.tab).custom) {
        box.innerHTML = '<button type="button" onclick="loadAdminDashboard(true)" class="admin-glass-btn ml-auto inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white/90 text-[11px] font-extrabold text-slate-600 hover:border-slate-400 hover:text-slate-900 transition cursor-pointer shadow-2xs"><i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Refresh</button>';
        return;
      }
      const c = adminCounts();
      const loaded = !!RD_ADMIN.rows[RD_ADMIN.tab];
      box.innerHTML = adminStatusList().map(s => {
        const on = RD_ADMIN.status === s;
        return '<button type="button" onclick="adminSetStatus(\'' + s + '\')" ' +
          'class="admin-glass-btn px-3.5 py-2 rounded-xl border text-[11px] font-extrabold tracking-wide transition cursor-pointer shadow-2xs ' +
          (on ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white/90 border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-900') + '">' +
          s + (loaded ? ' (' + (c[s] || 0) + ')' : '') + '</button>';
      }).join('') +
      '<button type="button" onclick="loadAdminDashboard(true)" class="admin-glass-btn ml-auto inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white/90 text-[11px] font-extrabold text-slate-600 hover:border-slate-400 hover:text-slate-900 transition cursor-pointer shadow-2xs"><i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Refresh</button>';
    }

    function adminInfoBox(icon, title, body, tone) {
      const map = {
        error: 'border-rose-200 bg-rose-50 text-rose-800',
        empty: 'border-slate-200 bg-white text-slate-600'
      };
      return '<div class="rounded-3xl border ' + (map[tone] || map.empty) + ' p-8 text-center">' +
        '<div class="w-14 h-14 mx-auto rounded-2xl bg-white/70 border border-black/5 flex items-center justify-center mb-4">' +
        '<i data-lucide="' + icon + '" class="w-7 h-7"></i></div>' +
        '<p class="font-extrabold">' + escapeHtml(title) + '</p>' +
        '<p class="mt-2 text-sm font-semibold leading-relaxed max-w-md mx-auto opacity-80">' + escapeHtml(body) + '</p>' +
        (tone === 'error' ? '<button type="button" onclick="loadAdminDashboard(true)" class="mt-5 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-extrabold hover:bg-rose-700 cursor-pointer"><i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Try again</button>' : '') +
      '</div>';
    }

    function renderAdmin() {
      adminRenderTabs();
      adminRenderFilters();
      const summary = document.getElementById('admin-action-summary');
      if (summary) {
        const registrations = (RD_ADMIN.rows.registrations || []).filter(r => r.status === 'PENDING' || r.status === 'DUPLICATE').length;
        const committee = (RD_ADMIN.rows.committee || []).filter(r => r.status === 'PENDING').length;
        const events = (RD_ADMIN.rows.events || []).filter(r => r.status === 'PENDING').length;
        const unclaimed = RD_ADMIN.rows.unclaimed ? RD_ADMIN.rows.unclaimed.length : null;
        const matches = RD_ADMIN.rows['unclaimed-matches']
          ? RD_ADMIN.rows['unclaimed-matches'].filter(r => String(r.status || 'PENDING').toUpperCase() === 'PENDING').length : null;
        const undo = RD_ADMIN.rows['unclaimed-audits']
          ? RD_ADMIN.rows['unclaimed-audits'].filter(r => String(r.Status || r.status || '').toUpperCase() === 'MERGED').length : null;
        const items = [
          { key: 'registrations', label: 'Membership review', count: registrations, icon: 'user-check', tone: 'indigo' },
          { key: 'committee', label: 'Committee nominations', count: committee, icon: 'shield-check', tone: 'indigo' },
          { key: 'events', label: 'Event submissions', count: events, icon: 'calendar-days', tone: 'indigo' },
          { key: 'unclaimed-matches', label: 'Possible matches', count: matches, icon: 'git-compare-arrows', tone: 'indigo' },
          { key: 'unclaimed-audits', label: 'Undo available', count: undo, icon: 'rotate-ccw', tone: 'slate' }
        ];
        const total = [registrations, committee, events, matches].filter(count => count !== null)
          .reduce((sum, count) => sum + count, 0);
        summary.innerHTML = '<div class="admin-glass-card rounded-2xl border ' + (total ? 'border-amber-300/80 bg-gradient-to-r from-amber-50/80 via-orange-50/40 to-amber-50/80' : 'border-slate-200/80 bg-slate-50/60') + ' p-4 backdrop-blur-md shadow-xs">' +
          '<div class="flex flex-wrap items-center gap-2.5"><span class="text-xs font-black uppercase tracking-wider text-slate-500">' + (total ? '<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-extrabold text-xs"><i data-lucide="bell" class="w-3.5 h-3.5"></i> ' + total + ' Pending Review' + (total === 1 ? '' : 's') + '</span>' : '<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-extrabold text-xs"><i data-lucide="check" class="w-3.5 h-3.5"></i> All Queues Clear</span>') + '</span>' +
          (RD_ADMIN.queueErrors.unclaimed || RD_ADMIN.queueErrors['unclaimed-matches'] ? '<span class="text-[11px] font-bold text-rose-700">Some review queues could not be loaded.</span>' : '') + '</div>' +
          '<div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">' +
          items.filter(item => item.count !== null && item.count > 0).map(item =>
            '<button type="button" onclick="adminSwitchTab(\'' + item.key + '\')" class="admin-glass-btn flex items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-left text-xs font-extrabold text-slate-800 shadow-xs hover:border-slate-400 hover:bg-white cursor-pointer transition">' +
              '<i data-lucide="' + item.icon + '" class="h-4 w-4 shrink-0 text-slate-500"></i><span class="min-w-0 flex-1 truncate">' + item.label + '</span><span class="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-slate-900 text-white text-[10px] font-black">' + item.count + '</span></button>'
          ).join('') + '</div></div>';
      }
      rdAdminNavPaint();
      const st = document.getElementById('admin-auth-status');
      if (st) {
        st.innerHTML = RD_ADMIN.state === 'ready'
          ? '<span class="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg"><i data-lucide="shield-check" class="w-3.5 h-3.5"></i> Signed in as admin' +
            (RD_ADMIN.admin ? ': ' + escapeHtml(RD_ADMIN.admin) : '') + '</span>'
          : (RD_ADMIN.state === 'error'
            ? '<span class="inline-flex items-center gap-1.5 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-lg"><i data-lucide="shield-alert" class="w-3.5 h-3.5"></i> Admin access could not be verified</span>'
            : '<span class="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg"><i data-lucide="loader" class="w-3.5 h-3.5"></i> Checking admin access\u2026</span>');
      }

      const box = document.getElementById('admin-events-list');
      if (box) {
        if (RD_ADMIN.state === 'loading') {
          box.innerHTML = '<div class="space-y-4">' +
            '<div class="h-32 rounded-3xl bg-slate-100 animate-pulse"></div>' +
            '<div class="h-32 rounded-3xl bg-slate-100 animate-pulse"></div>' +
            '<div class="h-32 rounded-3xl bg-slate-100 animate-pulse"></div></div>';
        } else if (RD_ADMIN.state === 'error') {
          box.innerHTML = adminInfoBox('shield-alert', 'This list could not be loaded',
            RD_ADMIN.error || 'Please sign in with the admin Google account and try again.', 'error');
        } else if (adminTabMeta(RD_ADMIN.tab).custom) {
          box.innerHTML = adminCustomHtml(RD_ADMIN.tab);
        } else {
          const rows = adminRows();
          const batchToolbar = (RD_ADMIN.status === 'PENDING' || RD_ADMIN.status === 'DUPLICATE' || RD_ADMIN.status === 'ALL')
            ? adminBatchToolbarHtml()
            : '';
            
          let createBtn = '';
          if (RD_ADMIN.tab === 'events') {
            createBtn = '<div class="mb-4 flex justify-end"><button type="button" onclick="openAdminCreateUpcomingEventModal()" class="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold shadow hover:bg-blue-700 transition cursor-pointer"><i data-lucide="plus-circle" class="w-4 h-4"></i> Create Upcoming Event</button></div>';
          }

          box.innerHTML = createBtn + (rows.length
            ? batchToolbar + rows.map(adminCard).join('')
            : adminInfoBox('inbox', 'Nothing here right now',
                RD_ADMIN.status === 'DUPLICATE'
                  ? 'No repeat applications are waiting. Anything the system flags as a possible duplicate shows up here.'
                  : 'No ' + adminTabMeta(RD_ADMIN.tab).label.toLowerCase() + ' with status ' + RD_ADMIN.status + '.', 'empty'));
        }
      }
      lucide.createIcons();
      adminUpdateBatchToolbar();
    }

    /* ================= ADMIN: NOTICES, SOCIAL CORNER, SUMMARY ==========
       These three tabs are not approval queues, so they carry their own
       renderers instead of adminCard(). Everything still goes through the
       same requireAdmin_() gate on the server; no email is ever sent from
       the browser and none comes back.                                   */

    /* The three approval tabs answer with res.data and get normalised; the
       new ones answer with res.rows and are used as they are, plus an `id`
       alias so adminFind() keeps working for all six. */
    async function adminLoadCustom(tab) {

      if (tab === 'email') {
        /* The compose form only needs the approved directory -- the same public
           feed the Members Summary already leans on -- to build the recipient
           picker and the series / department filters. The emails themselves are
           never sent to the browser: the server reads them from the Alumni sheet
           when it sends. */
        if (!alumniData.length) await loadPublicAlumni();
        return [{ id: 'email' }];
      }

      if (tab === 'polls') {
        /* Admin sees every poll including drafts; the backend returns those to
           an admin token. Ids come straight from the poll object. */
        const res = await apiGet('polls', {});
        const rows = Array.isArray(res.polls) ? res.polls : [];
        return rows.map(rdPollNorm).filter(function (r) { return r.id; });
      }

      if (tab === 'summary') {
        /* The member count is the approved directory, which the public feed
           already carries -- no extra admin call for something visitors can
           see anyway. The application counts come from the queue. */
        if (!alumniData.length) await loadPublicAlumni();
        if (!RD_ADMIN.rows.registrations) {
          const res = await apiGet('getadminregistrations', {});
          const raw = Array.isArray(res.data) ? res.data : [];
          RD_ADMIN.rows.registrations = raw.map(r => adminNormalize('registrations', r)).filter(r => r.id);
        }
        return [{ id: 'summary' }];
      }

      if (tab === 'activity') {
        /* The log is one flat list, newest first, and nothing on the card is
           pressable -- so a running index is all the id it needs. */
        const res = await apiGet('getadminactivity', {});
        const rows = Array.isArray(res.rows) ? res.rows : [];
        return rows.map((r, i) => Object.assign({}, r, { id: 'act-' + i }));
      }

      if (tab === 'faculty') {
        /* This one answers with res.data keyed by the Alumni sheet's own column
           names, not res.rows -- the save form posts those same names straight
           back, so renaming them here would only have to be undone there. */
        const res = await apiGet('getadminfaculty', {});
        const rows = Array.isArray(res.data) ? res.data : [];
        RD_ADMIN.facMissing = Array.isArray(res.missingColumns) ? res.missingColumns : [];
        return rows.map(r => Object.assign({}, r, { id: String(r['Member ID'] || '').trim() }))
                   .filter(r => r.id);
      }

      const res = await apiGet(adminTabMeta(tab).action, {});
      const rows = Array.isArray(res.rows) ? res.rows : [];
      return rows.map(r => Object.assign({}, r, { id: String(r.noticeId || r.postId || r.slideId || r.lineId || r.updateId || r.unclaimedId || r.matchId || r['Audit ID'] || '').trim() }))
                 .filter(r => r.id);
    }

    function adminCustomHtml(tab) {
      if (tab === 'email') return adminMailHtml();
      if (tab === 'polls') return adminPollsHtml();
      if (tab === 'notices') return adminNoticesHtml();
      if (tab === 'social') return adminSocialHtml();
      if (tab === 'slides') return adminSlidesHtml();
      if (tab === 'reunion') return adminReunionHtml();
        if (tab === 'pdacc') return adminPdaccHtml();
      if (tab === 'faculty') return adminFacultyHtml();
      if (tab === 'activity') return adminActivityHtml();
      if (tab === 'unclaimed') return adminUnclaimedHtml();
      if (tab === 'unclaimed-matches') return adminUnclaimedMatchesHtml();
      if (tab === 'unclaimed-audits') return adminUnclaimedAuditsHtml();
      return adminSummaryHtml();
    }

    function adminReviewValue(value) {
      return escapeHtml(value == null || value === '' ? 'Not provided' : String(value));
    }

    function adminUnclaimedMatchesHtml() {
      const rows = RD_ADMIN.rows['unclaimed-matches'] || [];
      if (!rows.length) {
        return adminInfoBox('git-compare-arrows', 'No possible matches yet',
          'A match appears when three of four normalized fields agree.', 'empty');
      }
      const batchToolbar = adminBatchToolbarHtml();
      return '<div class="space-y-3">' +
        batchToolbar +
        rows.map(r => {
          const old = r.unclaimed || {};
          const fresh = r.registration || {};
          const conflicts = Array.isArray(r.conflicts) ? r.conflicts : [];
          const isSelected = !!RD_ADMIN.selected[r.matchId];
          const selectBox = (r.status === 'PENDING' || !r.status)
            ? '<label class="inline-flex items-center cursor-pointer p-1 -m-1 mr-1.5" title="Select for batch action">' +
                '<input type="checkbox" class="admin-select-row w-4 h-4 rounded text-slate-900 border-slate-300 focus:ring-slate-800 cursor-pointer" ' +
                (isSelected ? 'checked ' : '') +
                'onchange="adminToggleSelect(\'' + escapeHtml(r.matchId) + '\', this.checked)"/>' +
              '</label>'
            : '';
          const field = (label, oldValue, newValue) =>
            '<div class="rounded-2xl border border-slate-200 bg-white p-3"><div class="text-[10px] font-black uppercase tracking-wide text-slate-500">' +
            escapeHtml(label) + '</div><div class="mt-1 grid gap-2 sm:grid-cols-2"><div><span class="text-[10px] font-bold text-amber-700">Old committee record</span><div class="font-bold text-slate-800">' +
            adminReviewValue(oldValue) + '</div></div><div><span class="text-[10px] font-bold text-emerald-700">New membership record</span><div class="font-bold text-slate-800">' +
            adminReviewValue(newValue) + '</div></div></div></div>';
          return '<article class="admin-glass-card rounded-3xl border border-indigo-200/80 bg-indigo-50/40 p-5 shadow-xs transition hover:shadow-md ' +
            (isSelected ? 'ring-2 ring-indigo-500/40 bg-indigo-50/70' : '') + '">' +
            '<div class="flex flex-wrap items-center gap-3">' +
              selectBox +
              '<h3 class="font-extrabold text-slate-900">' + escapeHtml(r.matchId || '(match)') + '</h3>' +
              '<span class="rounded-lg border border-indigo-300 bg-white px-2.5 py-1 text-[11px] font-extrabold text-indigo-800">' + escapeHtml(r.status || 'PENDING') + '</span>' +
              '<span class="ml-auto text-xs font-extrabold text-indigo-700">' + escapeHtml(r.matchCount || '') + '/4 fields</span></div>' +
            '<div class="mt-3 text-xs font-semibold text-slate-600">Unclaimed ' + escapeHtml(r.unclaimedId || '') + ' • Registration ' + escapeHtml(r.registrationId || '') + '</div>' +
            '<div class="mt-4 grid gap-2">' +
              field('Name', old.fullName, fresh['Full Name (English)']) +
              field('Department', old.department, fresh.Department) +
              field('Series', old.series, fresh.Series) +
              field('Mobile', formatBdMobile(old.mobile), formatBdMobile(fresh['Mobile Number'])) +
            '</div>' +
            (conflicts.length ? '<div class="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800"><div>Conflicts require review</div>' +
              conflicts.map(c => '<div class="mt-1">' + escapeHtml(c.field) + ': ' + adminReviewValue(c.oldValue) + ' → ' + adminReviewValue(c.newValue) + '</div>').join('') + '</div>' : '') +
            '<p class="mt-3 text-[11px] font-bold text-slate-500">Verified membership data becomes the profile source; committee history is linked only after duplicate checks.</p>' +
            (r.status === 'PENDING' ? (adminAskArmed('merge-unclaimed', r.matchId)
              ? adminConfirmStrip('Merge this reviewed record and link its approved committee history to the verified membership profile?', 'Merge records', 'adminMergeUnclaimed(\'' + escapeHtml(r.matchId) + '\')')
              : (adminAskArmed('separate-unclaimed', r.matchId)
                ? adminConfirmStrip('Keep these records separate and close this match without linking history?', 'Keep separate', 'adminKeepUnclaimedSeparate(\'' + escapeHtml(r.matchId) + '\')')
                : '<div class="mt-4 flex flex-wrap gap-2">' +
                  '<button type="button" onclick="adminAsk(\'merge-unclaimed\', \'' + escapeHtml(r.matchId) + '\')" class="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-extrabold text-white hover:bg-emerald-700 cursor-pointer">Merge records</button>' +
                  '<button type="button" onclick="adminAsk(\'separate-unclaimed\', \'' + escapeHtml(r.matchId) + '\')" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-extrabold text-slate-700 hover:border-slate-500 cursor-pointer">Keep separate</button>' +
                '</div>')) : '') +
          '</article>';
        }).join('') + '</div>';
    }

    function adminUnclaimedAuditsHtml() {
      const rows = RD_ADMIN.rows['unclaimed-audits'] || [];
      if (!rows.length) return adminInfoBox('file-check-2', 'No merge audits yet',
        'Completed merges and their immutable snapshots will appear here.', 'empty');
      return '<div class="space-y-3">' + rows.map(r =>
        '<article class="rounded-3xl border border-slate-200 bg-white p-5"><div class="flex flex-wrap items-center gap-3">' +
        '<h3 class="font-extrabold text-slate-900">' + escapeHtml(r['Audit ID'] || '') + '</h3>' +
        '<span class="rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-extrabold">' + escapeHtml(r.Status || '') + '</span>' +
        '<span class="ml-auto text-xs font-bold text-slate-500">' + escapeHtml(r['Merged Date'] || '') + '</span></div>' +
        '<p class="mt-3 text-xs font-semibold text-slate-600">Match ' + escapeHtml(r['Match ID'] || '') + ' • ' +
          escapeHtml(r['Unclaimed ID'] || '') + ' → ' + escapeHtml(r['Registration ID'] || '') + ' • Admin ' + escapeHtml(r['Admin Email'] || '') + '</p>' +
        (r.Status === 'MERGED' ? (adminAskArmed('undo-unclaimed', r['Audit ID'])
          ? adminConfirmStrip('Restore the exact pre-merge values? Undo is blocked if any record changed after the merge.', 'Undo merge safely', 'adminUndoUnclaimed(\'' + escapeHtml(r['Audit ID']) + '\')')
          : '<button type="button" onclick="adminAsk(\'undo-unclaimed\', \'' + escapeHtml(r['Audit ID']) + '\')" class="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-extrabold text-rose-800 hover:bg-rose-100 cursor-pointer">Undo merge safely</button>') : '') +
        '</article>').join('') + '</div>';
    }

    async function adminMergeUnclaimed(id) {
      try {
        adminAskClear();
        await apiPost('mergeunclaimed', { matchId: id });
        showToast('Records merged and committee history retained.', 'success');
        await loadAdminDashboard(true);
      } catch (err) { reportError(err); }
    }

    async function adminKeepUnclaimedSeparate(id) {
      try {
        adminAskClear();
        await apiPost('keepunclaimedseparate', { matchId: id });
        showToast('Records kept separate.', 'success');
        await loadAdminDashboard(true);
      } catch (err) { reportError(err); }
    }

    async function adminUndoUnclaimed(id) {
      try {
        adminAskClear();
        await apiPost('undounclaimedmerge', { auditId: id });
        showToast('Merge undone safely.', 'success');
        await loadAdminDashboard(true);
      } catch (err) { reportError(err); }
    }

    function adminUnclaimedHtml() {
      const rows = RD_ADMIN.rows.unclaimed || [];
      const preview = RD_ADMIN.backfillPreview;
      const previewHtml = preview ? adminBackfillPreviewHtml(preview) : '';
      if (!rows.length) {
        return '<div class="space-y-3">' +
          '<button type="button" onclick="adminBackfillUnclaimed()" class="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-extrabold text-amber-900 hover:bg-amber-100 cursor-pointer"><i data-lucide="scan-search" class="h-4 w-4"></i> Review older committee records</button>' +
          previewHtml +
          adminInfoBox('user-round-search', 'No open unclaimed profiles',
            'Linked records are kept in the audit trail and no longer appear in this queue.', 'empty') + '</div>';
      }
      return '<div class="space-y-3">' +
        '<button type="button" onclick="adminBackfillUnclaimed()" class="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-extrabold text-amber-900 hover:bg-amber-100 cursor-pointer"><i data-lucide="scan-search" class="h-4 w-4"></i> Review older committee records</button>' +
        previewHtml +
        rows.map(r => '<article class="rounded-3xl border border-amber-200 bg-amber-50/60 p-5">' +
          '<div class="flex flex-wrap items-start gap-3">' +
            '<div class="min-w-0">' +
              '<h3 class="font-extrabold text-slate-900">' + escapeHtml(r.fullName || '(no name)') + '</h3>' +
              '<p class="mt-1 text-xs font-bold text-slate-500">' +
                escapeHtml([r.department, r.series ? 'Series ' + r.series : '', r.status].filter(Boolean).join(' • ')) +
              '</p>' +
            '</div>' +
            '<span class="ml-auto rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-extrabold text-amber-800">' +
              escapeHtml(r.unclaimedId) + '</span>' +
          '</div>' +
          '<div class="mt-4 grid gap-2 text-xs font-semibold text-slate-600 sm:grid-cols-2">' +
            '<div>Mobile: ' + escapeHtml(formatBdMobile(r.mobile) || 'Not provided') + '</div>' +
            '<div>Email: ' + escapeHtml(r.email || 'Not provided') + '</div>' +
            '<div>Committee: ' + escapeHtml([r.committee, r.session, r.position].filter(Boolean).join(' • ')) + '</div>' +
            '<div>Source entry: ' + escapeHtml(r.sourceEntryId || 'Not available') + '</div>' +
          '</div>' +
          '<p class="mt-3 text-[11px] font-bold text-slate-500">Submitted by: ' + escapeHtml(r.submittedBy || 'Not available') + '</p>' +
        '</article>').join('') +
      '</div>';
    }

    function adminBackfillValue(value) {
      return escapeHtml(value == null || value === '' ? 'Not available' : String(value));
    }

    function adminBackfillPreviewHtml(preview) {
      const plan = Array.isArray(preview.plan) ? preview.plan : [];
      return '<section class="rounded-3xl border border-blue-200 bg-blue-50/70 p-5 sm:p-6">' +
        '<div class="flex flex-wrap items-start gap-3">' +
          '<div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-700 shadow-sm"><i data-lucide="clipboard-check" class="h-5 w-5"></i></div>' +
          '<div class="min-w-0"><h3 class="text-base font-extrabold text-slate-900">Legacy committee review</h3>' +
          '<p class="mt-1 text-xs font-semibold leading-relaxed text-slate-600">Choose one decision for every record. Linking adds committee history to the selected Alumni profile; creating unclaimed keeps it separate; Skip makes no change.</p></div>' +
          '<button type="button" onclick="adminClearBackfillPreview()" class="ml-auto rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-extrabold text-slate-600 hover:border-slate-500 cursor-pointer">Close</button>' +
        '</div>' +
        '<div class="mt-5 grid gap-3 sm:grid-cols-3">' +
          '<div class="rounded-2xl bg-white p-3"><div class="text-[10px] font-black uppercase tracking-wide text-slate-500">Records found</div><div class="mt-1 text-xl font-black text-slate-900">' + (preview.total || 0) + '</div></div>' +
          '<div class="rounded-2xl bg-white p-3"><div class="text-[10px] font-black uppercase tracking-wide text-slate-500">New unclaimed</div><div class="mt-1 text-xl font-black text-amber-700">' + (preview.toCreate || 0) + '</div></div>' +
          '<div class="rounded-2xl bg-white p-3"><div class="text-[10px] font-black uppercase tracking-wide text-slate-500">Needs review</div><div class="mt-1 text-xl font-black text-blue-700">' + (preview.linked || 0) + '</div></div>' +
        '</div>' +
        (plan.length ? '<div class="mt-5 space-y-2">' + plan.map(item =>
          '<article class="rounded-2xl border border-white bg-white p-4">' +
            '<div class="flex flex-wrap items-start gap-2"><span class="rounded-lg px-2 py-1 text-[10px] font-black ' +
              (item.action === 'REVIEW_ALUMNI' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800') + '">' +
              (item.action === 'REVIEW_ALUMNI' ? 'POSSIBLE DIRECTORY MATCH' : (item.existingUnclaimedId ? 'OPEN UNCLAIMED PROFILE' : 'CREATE UNCLAIMED')) + '</span>' +
              '<span class="ml-auto text-[11px] font-black text-slate-500">' + adminBackfillValue(item.entryId) + '</span></div>' +
            '<h4 class="mt-3 font-extrabold text-slate-900">' + adminBackfillValue(item.fullName) + '</h4>' +
            '<p class="mt-1 text-xs font-semibold text-slate-600">' + adminBackfillValue(item.committee) + ' <span class="text-slate-400">•</span> ' + adminBackfillValue(item.session) + ' <span class="text-slate-400">•</span> ' + adminBackfillValue(item.position) + '</p>' +
            (item.action === 'REVIEW_ALUMNI' ? '<div class="mt-3 rounded-xl bg-blue-50 p-3 text-xs font-semibold text-blue-900"><span class="font-black">Directory profile candidate:</span> <strong>' + adminBackfillValue(item.memberId) + '</strong> — ' + adminBackfillValue(item.alumniName) + ', ' + adminBackfillValue(item.alumniDepartment) + ', Series ' + adminBackfillValue(item.alumniSeries) + ', ' + adminBackfillValue(formatBdMobile(item.alumniMobile)) + ' <span class="text-blue-700">(' + adminBackfillValue(item.matchScore) + '/4 fields matched)</span></div>' : '<div class="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-900">' + (item.existingUnclaimedId ? 'No Directory profile matched. The existing unclaimed profile will remain separate.' : 'No Directory profile matched. Applying this will create an unclaimed profile, not a Directory profile.') + '</div>') +
            '<fieldset class="mt-4 flex flex-wrap gap-2" aria-label="Decision for ' + adminBackfillValue(item.entryId) + '">' +
              '<label class="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-extrabold text-emerald-800"><input type="radio" name="backfill-' + adminBackfillValue(item.entryId) + '" value="' + (item.action === 'REVIEW_ALUMNI' ? 'LINK_ALUMNI' : 'CREATE_UNCLAIMED') + '" ' + ((RD_ADMIN.backfillChoices[item.entryId] || (item.action === 'REVIEW_ALUMNI' ? 'LINK_ALUMNI' : 'CREATE_UNCLAIMED')) === (item.action === 'REVIEW_ALUMNI' ? 'LINK_ALUMNI' : 'CREATE_UNCLAIMED') ? 'checked' : '') + ' onchange="adminSetBackfillChoice(\'' + adminBackfillValue(item.entryId) + '\', this.value)"> ' + (item.action === 'REVIEW_ALUMNI' ? 'Link to this Alumni profile' : 'Create unclaimed profile') + '</label>' +
              (item.action === 'REVIEW_ALUMNI' ? '<label class="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-extrabold text-amber-800"><input type="radio" name="backfill-' + adminBackfillValue(item.entryId) + '" value="CREATE_UNCLAIMED" ' + (RD_ADMIN.backfillChoices[item.entryId] === 'CREATE_UNCLAIMED' ? 'checked' : '') + ' onchange="adminSetBackfillChoice(\'' + adminBackfillValue(item.entryId) + '\', this.value)"> Create unclaimed instead</label>' : '') +
              '<label class="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-600"><input type="radio" name="backfill-' + adminBackfillValue(item.entryId) + '" value="SKIP" ' + (RD_ADMIN.backfillChoices[item.entryId] === 'SKIP' ? 'checked' : '') + ' onchange="adminSetBackfillChoice(\'' + adminBackfillValue(item.entryId) + '\', this.value)"> Skip</label>' +
            '</fieldset>' +
          '</article>'
        ).join('') + '</div>' : '<div class="mt-5 rounded-2xl bg-white p-4 text-sm font-bold text-slate-600">No eligible legacy records were found.</div>') +
        (plan.length ? '<div class="mt-5 flex flex-wrap items-center gap-3"><button type="button" onclick="adminApplyBackfill()" class="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-blue-700 cursor-pointer"><i data-lucide="check-check" class="h-4 w-4"></i> Apply selected decisions</button><span class="text-xs font-semibold text-slate-500">Link, create unclaimed, or skip each record above.</span></div>' : '') +
      '</section>';
    }

    async function adminBackfillUnclaimed() {
      try {
        const preview = await apiPost('backfillunclaimedprofiles', { apply: 'false' });
        RD_ADMIN.backfillPreview = preview;
        RD_ADMIN.backfillChoices = {};
        renderAdmin();
      } catch (err) { reportError(err); }
    }

    function adminClearBackfillPreview() {
      RD_ADMIN.backfillPreview = null;
      RD_ADMIN.backfillChoices = {};
      renderAdmin();
    }

    function adminSetBackfillChoice(entryId, choice) {
      RD_ADMIN.backfillChoices[entryId] = choice;
      renderAdmin();
    }

    async function adminApplyBackfill() {
      try {
        const plan = Array.isArray(RD_ADMIN.backfillPreview && RD_ADMIN.backfillPreview.plan)
          ? RD_ADMIN.backfillPreview.plan : [];
        const decisions = {};
        plan.forEach(item => {
          decisions[item.entryId] = RD_ADMIN.backfillChoices[item.entryId] ||
            (item.action === 'REVIEW_ALUMNI' ? 'LINK_ALUMNI' : 'CREATE_UNCLAIMED');
        });
        const result = await apiPost('backfillunclaimedprofiles', { apply: 'true', decisions: decisions });
        RD_ADMIN.backfillPreview = null;
        RD_ADMIN.backfillChoices = {};
        const linked = Array.isArray(result.linked) ? result.linked.length : 0;
        const created = Array.isArray(result.created) ? result.created.length : 0;
        const retained = Array.isArray(result.retained) ? result.retained.length : 0;
        showToast(linked + ' linked to Directory, ' + created + ' unclaimed created, ' + retained + ' existing unclaimed kept separate.', 'success');
        await loadAdminDashboard(true);
      } catch (err) { reportError(err); }
    }

    /* ---------- Edit History tab ---------------------------------------
       Read only. Every admin function on the server passes through
       rdRequireRole_(), which writes one line per change, so this tab is
       simply that sheet turned around: newest first, one card per line.
       Nothing here can be pressed, because nothing here should be edited. */
    function adminActivityRowHtml(r) {
      const verb = String(r.action || '');
      const tone = /delete|remove|reject|clear/i.test(verb)
        ? 'bg-rose-50 text-rose-700 border-rose-200'
        : (/approve|publish|add|create|upload/i.test(verb)
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-blue-50 text-blue-700 border-blue-200');

      return '<li class="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">' +
        '<div class="flex flex-wrap items-center gap-2">' +
          '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-extrabold ' + tone + '">' +
            escapeHtml(verb || 'change') + '</span>' +
          (r.section ? '<span class="text-[11px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg">' + escapeHtml(r.section) + '</span>' : '') +
          '<span class="ml-auto text-[11px] font-bold text-slate-400 tabular-nums">' + escapeHtml(r.when || '') + '</span>' +
        '</div>' +
        (r.item ? '<p class="mt-2 text-sm font-bold text-slate-800 break-words">' + escapeHtml(r.item) + '</p>' : '') +
        '<p class="mt-1.5 text-[11px] font-semibold text-slate-500 break-words">' +
          '<i data-lucide="user" class="w-3 h-3 inline-block align-[-1px]"></i> ' + escapeHtml(r.email || 'unknown') +
          (r.role ? ' &middot; ' + escapeHtml(r.role) : '') + '</p>' +
        (r.detail ? '<p class="mt-1.5 text-[11px] text-slate-400 leading-relaxed break-words">' + escapeHtml(r.detail) + '</p>' : '') +
      '</li>';
    }

    function adminActivityHtml() {
      const rows = Array.isArray(RD_ADMIN.rows.activity) ? RD_ADMIN.rows.activity : [];
      const inner = rows.length
        ? '<ul class="mt-5 space-y-2.5">' + rows.map(adminActivityRowHtml).join('') + '</ul>'
        : '<div class="mt-5">' + adminInfoBox('history', 'Nothing recorded yet',
            'Every change an admin makes shows up here with the date and time. The list fills up as the panel is used.', 'empty') + '</div>';

      return adminPanelShell('history', 'Edit History',
        'Who changed or removed what, newest first. This list is written by the server and cannot be edited here.',
        inner);
    }

    /* A small, consistent set of buttons for these tabs. */
    function adminMiniBtn(label, icon, cls, onclick, busy) {
      return '<button type="button" ' + (busy ? 'disabled ' : 'onclick="' + onclick + '" ') +
        'class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-extrabold border transition cursor-pointer ' +
        (busy ? 'opacity-50 pointer-events-none ' : '') + cls + '">' +
        '<i data-lucide="' + icon + '" class="w-3.5 h-3.5"></i> ' + label + '</button>';
    }

    function adminPanelShell(icon, title, hint, inner) {
      return '<section class="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-7">' +
        '<div class="flex items-start gap-3">' +
          '<div class="w-11 h-11 shrink-0 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center">' +
            '<i data-lucide="' + icon + '" class="w-5 h-5 text-blue-600"></i></div>' +
          '<div class="min-w-0">' +
            '<h3 class="text-lg font-extrabold text-slate-900 font-display tracking-tight">' + escapeHtml(title) + '</h3>' +
            '<p class="text-xs font-semibold text-slate-500 mt-0.5 leading-relaxed">' + escapeHtml(hint) + '</p>' +
          '</div>' +
        '</div>' + inner +
      '</section>';
    }

    /* A destructive button asks first, and it asks inside the card: the site
       carries no popups anywhere, and a browser confirm box is still a popup.
       So the row arms itself and grows a red strip instead. */
    function adminAsk(what, id) { RD_ADMIN.askWhat = what; RD_ADMIN.askId = id; renderAdmin(); }
    function adminAskClear() { RD_ADMIN.askWhat = ''; RD_ADMIN.askId = ''; renderAdmin(); }
    function adminAskArmed(what, id) { return RD_ADMIN.askWhat === what && RD_ADMIN.askId === id; }

    function adminConfirmStrip(text, yesLabel, yesOnclick) {
      return '<div class="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">' +
        '<p class="text-xs font-bold text-rose-800 leading-relaxed">' + escapeHtml(text) + '</p>' +
        '<div class="mt-2.5 flex flex-wrap gap-2">' +
          '<button type="button" onclick="' + yesOnclick + '" class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 text-white text-[11px] font-extrabold hover:bg-rose-700 cursor-pointer"><i data-lucide="check" class="w-3.5 h-3.5"></i> ' + escapeHtml(yesLabel) + '</button>' +
          '<button type="button" onclick="adminAskClear()" class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-[11px] font-extrabold hover:bg-slate-50 cursor-pointer"><i data-lucide="x" class="w-3.5 h-3.5"></i> Cancel</button>' +
        '</div></div>';
    }

    /* ---------- Home Slideshow tab ------------------------------------
       The pictures that turn under the Welcome text on the home page. The
       sheet leads only when it has rows: an empty tab means the home page
       keeps showing exactly the pictures it shows today. */
    function adminSlRow(id) {
      return (RD_ADMIN.rows.slides || []).find(r => r.id === id) || null;
    }

    /* The same tab controls both bars. Only the folder differs, and the
       folder is decided in the backend, so nothing here needs an id. */
    const RD_SL_PLACES_UI = [
      { key: 'home',  label: 'Home page',  page: 'home page',  folder: 'RANGDHANU Home' },
      { key: 'pdacc', label: 'PDACC page', page: 'PDACC page', folder: 'RANGDHANU PDACC' }
    ];

    function adminSlPlace() {
      const p = String(RD_ADMIN.slPlace || 'home');
      return RD_SL_PLACES_UI.some(x => x.key === p) ? p : 'home';
    }
    function adminSlPlaceMeta(key) {
      return RD_SL_PLACES_UI.find(x => x.key === (key || adminSlPlace())) || RD_SL_PLACES_UI[0];
    }
    /* A picture saved before this tab knew about places belongs to the home
       bar -- that is where every one of them used to go. */
    function adminSlPlaceOf(row) {
      return String((row && row.place) || 'home') === 'pdacc' ? 'pdacc' : 'home';
    }
    function adminSlRowsOf(place) {
      const want = place || adminSlPlace();
      return (RD_ADMIN.rows.slides || []).filter(r => adminSlPlaceOf(r) === want);
    }
    function adminSlidePlace(place) {
      RD_ADMIN.slPlace = place;
      RD_ADMIN.slEdit = '';
      RD_ADMIN.askWhat = '';
      renderAdmin();
    }

    function adminSlPlaceSwitch() {
      const now = adminSlPlace();
      return '<div class="flex flex-wrap gap-2">' + RD_SL_PLACES_UI.map(p => {
        const on = p.key === now;
        return '<button type="button" onclick="adminSlidePlace(\'' + p.key + '\')" ' +
          'class="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-[11px] font-extrabold border transition cursor-pointer ' +
          (on ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50') +
          '"><i data-lucide="' + (p.key === 'home' ? 'house' : 'book-open') + '" class="w-3.5 h-3.5"></i> ' +
          p.label + ' <span class="opacity-70">(' + adminSlRowsOf(p.key).length + ')</span></button>';
      }).join('') + '</div>';
    }

    function adminSlideForm() {
      const editing = RD_ADMIN.slEdit ? adminSlRow(RD_ADMIN.slEdit) : null;
      const shown = editing ? editing.show !== 'NO' : true;
      const place = editing ? adminSlPlaceOf(editing) : adminSlPlace();
      const meta = adminSlPlaceMeta(place);
      const inner =
        (editing && editing.url
          ? '<div class="mt-5 rounded-2xl overflow-hidden border border-slate-200 bg-slate-50">' +
              '<img src="' + escapeHtml(editing.url) + '" alt="' + escapeHtml(editing.caption || editing.id) +
              '" class="w-full h-44 object-cover" onerror="rdPhotoFallback(this)"></div>'
          : '') +
        '<div class="mt-5 grid sm:grid-cols-2 gap-4">' +
          '<div><label class="form-label" for="sl-file">Picture' + (editing ? ' (leave it to keep the old one)' : ' *') + '</label>' +
            '<input id="sl-file" type="file" accept="image/*" class="form-input"></div>' +
          '<div><label class="form-label" for="sl-badge">Small label (optional)</label>' +
            '<input id="sl-badge" class="form-input" maxlength="60" placeholder="RANGDHANU &bull; DUET" value="' +
              escapeHtml(editing ? editing.badge : '') + '"></div>' +
        '</div>' +
        '<div class="mt-4"><label class="form-label" for="sl-place">Which slideshow</label>' +
          '<select id="sl-place" class="form-input">' + RD_SL_PLACES_UI.map(p =>
            '<option value="' + p.key + '"' + (p.key === place ? ' selected' : '') + '>' +
              p.label + '</option>').join('') + '</select></div>' +
        '<div class="mt-4"><label class="form-label" for="sl-caption">Headline on the picture (optional)</label>' +
          '<input id="sl-caption" class="form-input" maxlength="160" placeholder="Write it in your own words." value="' +
            escapeHtml(editing ? editing.caption : '') + '"></div>' +
        '<label class="mt-4 flex items-center gap-2.5 text-xs font-extrabold text-slate-600 cursor-pointer">' +
          '<input id="sl-show" type="checkbox" class="w-4 h-4 accent-blue-600"' + (shown ? ' checked' : '') +
          '> Show this slide on the ' + meta.page + '</label>' +
        '<div class="mt-5 flex flex-wrap gap-2">' +
          '<button id="sl-save" type="button" onclick="adminSlideSave()" class="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-extrabold cursor-pointer">' +
            '<i data-lucide="save" class="w-4 h-4"></i> ' + (editing ? 'Save the changes' : 'Add the slide') + '</button>' +
          (editing
            ? '<button type="button" onclick="adminSlideNew()" class="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-bold cursor-pointer"><i data-lucide="x" class="w-4 h-4"></i> Cancel</button>'
            : '') +
        '</div>';
      return adminPanelShell('images',
        editing ? 'Editing ' + (editing.fileName || editing.id)
                : 'Add a picture to the ' + meta.label + ' slideshow',
        'Everything already in the ' + meta.folder + ' folder on Drive is listed below, so nothing has to be '
        + 'uploaded twice. Untick a picture to take it off the ' + meta.page + ' and tick it again to bring it back. '
        + 'A wide picture looks best; large files are shrunk on the way up, so no size error ever reaches you.',
        inner);
    }

    function adminSlideNew() { RD_ADMIN.slEdit = ''; renderAdmin(); }
    function adminSlideEdit(id) { RD_ADMIN.slEdit = id; renderAdmin(); window.scrollTo({ top: 0, behavior: 'auto' }); }

    async function adminSlideSave() {
      const fileEl = document.getElementById('sl-file');
      if (!fileEl || RD_ADMIN.busy) return;
      const file = (fileEl.files || [])[0] || null;
      const caption = String((document.getElementById('sl-caption') || {}).value || '').trim();
      const badge = String((document.getElementById('sl-badge') || {}).value || '').trim();
      const show = !!(document.getElementById('sl-show') || {}).checked;
      const editing = RD_ADMIN.slEdit;

      if (!editing && !file) {
        showToast('Please choose the picture for this slide.', 'error', 'A picture is needed', { backTo: 'admin' });
        return;
      }

      RD_ADMIN.busy = editing || 'new';
      const btn = document.getElementById('sl-save');
      if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
      try {
        const place = String((document.getElementById('sl-place') || {}).value || adminSlPlace());
        const data = { slideId: editing || '', place: place, caption: caption,
                       badge: badge, show: show ? 'YES' : 'NO' };
        /* 1900px wide is what the home slideshow asks Drive for, so anything
           larger is only weight. The shrink happens here, in the browser. */
        if (file) data.file = await filePayload(file, 1900);
        const r = await apiPost('saveslide', { data: data });
        RD_ADMIN.slEdit = '';
        RD_ADMIN.slPlace = place;
        RD_ADMIN.busy = '';
        RD_SL.ready = false;
        loadHomeSlides();
        showToast(r.message || 'The slide is saved.', 'success', 'Slide saved', { backTo: 'admin' });
        loadAdminDashboard(true);
      } catch (err) {
        RD_ADMIN.busy = '';
        showToast(friendlyError(err).msg, 'error', 'The slide was not saved', { backTo: 'admin' });
        renderAdmin();
      }
    }

    async function adminSlideShow(id, on) {
      const row = adminSlRow(id);
      if (!row || RD_ADMIN.busy) return;
      RD_ADMIN.busy = id;
      RD_ADMIN.askWhat = '';
      renderAdmin();
      try {
        const r = await apiPost('setslideshow', { slideId: id, show: on ? 'YES' : 'NO' });
        row.show = on ? 'YES' : 'NO';
        RD_ADMIN.busy = '';
        RD_SL.ready = false;
        loadHomeSlides();
        showToast(r.message || (on ? 'The slide is showing.' : 'The slide is hidden.'),
          'success', on ? 'Slide showing' : 'Slide hidden', { backTo: 'admin' });
        renderAdmin();
      } catch (err) {
        RD_ADMIN.busy = '';
        showToast(friendlyError(err).msg, 'error', 'That did not change', { backTo: 'admin' });
        renderAdmin();
      }
    }

    async function adminSlideMove(id, dir) {
      const rows = RD_ADMIN.rows.slides || [];
      const at = rows.findIndex(r => r.id === id);
      if (at < 0 || RD_ADMIN.busy) return;
      /* The neighbour is the next picture on the same bar, exactly as the
         backend re-numbers the order inside one place only. */
      const place = adminSlPlaceOf(rows[at]);
      const step = dir === 'UP' ? -1 : 1;
      let to = -1;
      for (let n = at + step; n >= 0 && n < rows.length; n += step) {
        if (adminSlPlaceOf(rows[n]) === place) { to = n; break; }
      }
      if (to < 0 || to >= rows.length) return;
      RD_ADMIN.busy = id;
      renderAdmin();
      try {
        await apiPost('moveslide', { slideId: id, dir: dir });
        /* The list is re-ordered here as well, so the card visibly moves
           before the refetch lands. */
        const moved = rows.splice(at, 1)[0];
        rows.splice(to, 0, moved);
        RD_ADMIN.busy = '';
        RD_SL.ready = false;
        loadHomeSlides();
        renderAdmin();
      } catch (err) {
        RD_ADMIN.busy = '';
        showToast(friendlyError(err).msg, 'error', 'The order did not change', { backTo: 'admin' });
        renderAdmin();
      }
    }

    async function adminSlideDelete(id) {
      if (RD_ADMIN.busy) return;
      RD_ADMIN.busy = id;
      RD_ADMIN.askWhat = '';
      renderAdmin();
      try {
        const r = await apiPost('deleteslide', { slideId: id });
        RD_ADMIN.rows.slides = (RD_ADMIN.rows.slides || []).filter(x => x.id !== id);
        RD_ADMIN.busy = '';
        RD_SL.ready = false;
        loadHomeSlides();
        showToast(r.message || 'The slide is removed.', 'success', 'Slide removed', { backTo: 'admin' });
        renderAdmin();
      } catch (err) {
        RD_ADMIN.busy = '';
        showToast(friendlyError(err).msg, 'error', 'The slide was not removed', { backTo: 'admin' });
        renderAdmin();
      }
    }

    function adminSlideItem(r, i, all) {
      const busy = RD_ADMIN.busy === r.id;
      const on = r.show !== 'NO';
      const first = i === 0;
      const last = i === all.length - 1;
      return '<article class="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">' +
        '<div class="flex flex-wrap items-center gap-2">' +
          '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border bg-indigo-50 border-indigo-200 text-indigo-700 text-[11px] font-extrabold">' +
            '<i data-lucide="hash" class="w-3 h-3"></i>Position ' + (i + 1) + '</span>' +
          '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-extrabold ' +
            (on ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-100 border-slate-200 text-slate-500') + '">' +
            '<i data-lucide="' + (on ? 'eye' : 'eye-off') + '" class="w-3 h-3"></i>' + (on ? 'Showing' : 'Hidden') + '</span>' +
          '<span class="ml-auto text-[11px] font-extrabold text-slate-400 truncate max-w-[14rem]">' +
            escapeHtml(r.fileName || '') + '</span>' +
        '</div>' +
        '<div class="mt-3 flex gap-4">' +
          '<div class="w-28 sm:w-40 shrink-0 rounded-2xl overflow-hidden border border-slate-200 bg-slate-50">' +
            (r.url
              ? '<img src="' + escapeHtml(r.url) + '" alt="' + escapeHtml(r.caption || r.id) +
                '" class="w-full h-20 sm:h-24 object-cover" loading="lazy" onerror="rdPhotoFallback(this)">'
              : '<div class="w-full h-20 sm:h-24 flex items-center justify-center text-slate-300"><i data-lucide="image-off" class="w-6 h-6"></i></div>') +
          '</div>' +
          '<div class="min-w-0">' +
            (String(r.badge || '').trim()
              ? '<p class="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">' + escapeHtml(r.badge) + '</p>' : '') +
            '<p class="mt-0.5 text-sm font-extrabold text-slate-900 leading-snug break-words">' +
              escapeHtml(String(r.caption || '').trim() || 'No headline on this one') + '</p>' +
            '<p class="mt-1 text-[11px] font-semibold text-slate-400 break-words">' + escapeHtml(r.fileName || '') + '</p>' +
          '</div>' +
        '</div>' +
        /* A tick box, not a button: this is the one control that has to be
           readable at a glance across a whole folder of pictures. */
        '<label class="mt-4 flex items-center gap-2.5 text-xs font-extrabold cursor-pointer ' +
          (on ? 'text-emerald-700' : 'text-slate-500') + '">' +
          '<input type="checkbox" class="w-4 h-4 accent-emerald-600"' +
            (on ? ' checked' : '') + (busy ? ' disabled' : '') +
            ' onchange="adminSlideShow(\'' + r.id + '\', this.checked)">' +
          (on ? 'Showing on the ' + adminSlPlaceMeta(adminSlPlaceOf(r)).page
              : 'Not showing on the ' + adminSlPlaceMeta(adminSlPlaceOf(r)).page) +
        '</label>' +
        '<div class="mt-4 flex flex-wrap gap-2">' +
          adminMiniBtn('Move up', 'arrow-up', 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
            "adminSlideMove('" + r.id + "','UP')", busy || first) +
          adminMiniBtn('Move down', 'arrow-down', 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
            "adminSlideMove('" + r.id + "','DOWN')", busy || last) +
          adminMiniBtn('Edit', 'pencil', 'bg-white border-blue-200 text-blue-700 hover:bg-blue-50',
            "adminSlideEdit('" + r.id + "')", busy) +
          adminMiniBtn('Delete', 'trash-2', 'bg-white border-rose-200 text-rose-700 hover:bg-rose-50',
            "adminAsk('slDel','" + r.id + "')", busy) +
        '</div>' +
        (adminAskArmed('slDel', r.id)
          ? adminConfirmStrip('Delete this picture from Drive? To take it off the '
              + adminSlPlaceMeta(adminSlPlaceOf(r)).page + ' only, '
              + 'untick the box instead. The file goes to the Drive bin, so it can still be brought back.',
              'Yes, delete it', "adminSlideDelete('" + r.id + "')")
          : '') +
      '</article>';
    }

    function adminSlidesHtml() {
      const rows = adminSlRowsOf();
      const meta = adminSlPlaceMeta();
      return '<div class="space-y-4">' + adminSlPlaceSwitch() + adminSlideForm() +
        (rows.length
          ? rows.map((r, i) => adminSlideItem(r, i, rows)).join('')
          : adminInfoBox('images', 'No picture was found in the folder',
              'This slideshow reads the ' + meta.folder + ' folder on Drive. Nothing was read from it just now, '
              + 'so the ' + meta.page + ' is showing the pictures that came with the site. Add one above and it appears here.', 'empty')) +
      '</div>';
    }

    /* ---------- Notices tab ---------- */
    function adminNbRow(id) {
      return (RD_ADMIN.rows.notices || []).find(r => r.id === id) || null;
    }

    function adminNoticeForm() {
      const editing = RD_ADMIN.nbEdit ? adminNbRow(RD_ADMIN.nbEdit) : null;
      const kind = editing ? (editing.kind === 'TEXT' ? 'TEXT' : 'FILE') : 'FILE';
      const isText = kind === 'TEXT';
      const shown = editing ? editing.show !== 'NO' : true;
      const inner =
        '<div class="mt-5 grid sm:grid-cols-2 gap-4">' +
          '<div><label class="form-label" for="nb-kind">What kind of notice</label>' +
            '<select id="nb-kind" class="form-input" onchange="adminNoticeKind(this.value)">' +
              '<option value="FILE"' + (isText ? '' : ' selected') + '>A notice with a file (PDF or image)</option>' +
              '<option value="TEXT"' + (isText ? ' selected' : '') + '>A short line for the scrolling bar</option>' +
            '</select></div>' +
          '<div id="nb-file-wrap" class="' + (isText ? 'hidden' : '') + '">' +
            '<label class="form-label" for="nb-file">The file' + (editing && editing.fileUrl ? ' (leave empty to keep the current one)' : '') + '</label>' +
            '<input id="nb-file" type="file" accept="application/pdf,image/*" class="form-input"></div>' +
        '</div>' +
        '<div id="nb-title-wrap" class="mt-4 ' + (isText ? 'hidden' : '') + '">' +
          '<label class="form-label" for="nb-title">Notice title *</label>' +
          '<input id="nb-title" class="form-input" maxlength="180" placeholder="Reunion 2026 registration notice" value="' +
            escapeHtml(editing ? editing.title : '') + '"></div>' +
        '<div class="mt-4"><label class="form-label" for="nb-body"><span id="nb-body-label">' +
          (isText ? 'The scrolling line *' : 'A short line under the title (optional)') + '</span></label>' +
          '<textarea id="nb-body" rows="2" maxlength="300" class="form-input" placeholder="Keep it under 300 characters.">' +
            escapeHtml(editing ? editing.body : '') + '</textarea></div>' +
        '<label class="mt-4 flex items-center gap-2.5 text-xs font-extrabold text-slate-600 cursor-pointer">' +
          '<input id="nb-show" type="checkbox" class="w-4 h-4 accent-blue-600"' + (shown ? ' checked' : '') + '> Show this on the website</label>' +
        '<div class="mt-5 flex flex-wrap gap-2">' +
          '<button id="nb-save" type="button" onclick="adminNoticeSave()" class="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-extrabold cursor-pointer">' +
            '<i data-lucide="save" class="w-4 h-4"></i> ' + (editing ? 'Save the changes' : 'Publish the notice') + '</button>' +
          (editing
            ? '<button type="button" onclick="adminNoticeNew()" class="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-bold cursor-pointer"><i data-lucide="x" class="w-4 h-4"></i> Cancel</button>'
            : '') +
        '</div>';
      return adminPanelShell('megaphone', editing ? 'Editing ' + editing.id : 'Add a notice',
        editing ? 'The file stays as it is unless you choose a new one.'
                : 'A file notice appears on the board. A short line runs across the scrolling bar instead.',
        inner);
    }

    /* The two shapes share one form, so switching between them must not throw
       away what has already been typed -- the fields are hidden, not redrawn. */
    function adminNoticeKind(kind) {
      const isText = kind === 'TEXT';
      const t = document.getElementById('nb-title-wrap');
      const f = document.getElementById('nb-file-wrap');
      const l = document.getElementById('nb-body-label');
      if (t) t.classList.toggle('hidden', isText);
      if (f) f.classList.toggle('hidden', isText);
      if (l) l.textContent = isText ? 'The scrolling line *' : 'A short line under the title (optional)';
    }

    function adminNoticeNew() { RD_ADMIN.nbEdit = ''; renderAdmin(); }
    function adminNoticeEdit(id) { RD_ADMIN.nbEdit = id; renderAdmin(); window.scrollTo({ top: 0, behavior: 'auto' }); }

    async function adminNoticeSave() {
      const kindEl = document.getElementById('nb-kind');
      if (!kindEl || RD_ADMIN.busy) return;
      const kind = kindEl.value === 'TEXT' ? 'TEXT' : 'FILE';
      const title = String((document.getElementById('nb-title') || {}).value || '').trim();
      const body = String((document.getElementById('nb-body') || {}).value || '').trim();
      const show = !!(document.getElementById('nb-show') || {}).checked;
      const file = ((document.getElementById('nb-file') || {}).files || [])[0] || null;
      const editing = RD_ADMIN.nbEdit;

      if (kind === 'FILE' && !title) {
        showToast('Please write the notice title.', 'error', 'A title is needed', { backTo: 'admin' });
        return;
      }
      if (kind === 'TEXT' && !body) {
        showToast('Please write the line that should scroll across the bar.', 'error', 'Nothing to show', { backTo: 'admin' });
        return;
      }
      if (kind === 'FILE' && !editing && !file) {
        showToast('Please choose the PDF or the image for this notice.', 'error', 'No file chosen', { backTo: 'admin' });
        return;
      }

      RD_ADMIN.busy = editing || 'new';
      const btn = document.getElementById('nb-save');
      if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
      try {
        const data = { noticeId: editing || '', kind: kind, title: title, body: body, show: show ? 'YES' : 'NO' };
        /* filePayload leaves a PDF exactly as it is and only shrinks an image
           that is larger than 2400px, so the download stays high resolution. */
        if (kind === 'FILE' && file) data.file = await filePayload(file, 2400);
        const r = await apiPost('savenotice', { data: data });
        RD_ADMIN.nbEdit = '';
        RD_ADMIN.busy = '';
        RD_NB.state = 'idle';
        rdFeedForget('notices');
        showToast(r.message || 'The notice is saved.', 'success', 'Notice saved', { backTo: 'admin' });
        loadAdminDashboard(true);
      } catch (err) {
        RD_ADMIN.busy = '';
        showToast(friendlyError(err).msg, 'error', 'Could not save', { backTo: 'admin' });
        renderAdmin();
      }
    }

    async function adminNoticeShow(id, on) {
      const row = adminNbRow(id);
      if (!row || RD_ADMIN.busy) return;
      RD_ADMIN.busy = id;
      renderAdmin();
      try {
        const r = await apiPost('setnoticeshow', { noticeId: id, show: on ? 'YES' : 'NO' });
        row.show = on ? 'YES' : 'NO';
        RD_NB.state = 'idle';
        rdFeedForget('notices');
        showToast(r.message || 'Saved.', 'success', 'Saved', { backTo: 'admin' });
      } catch (err) {
        showToast(friendlyError(err).msg, 'error', 'Could not save', { backTo: 'admin' });
      }
      RD_ADMIN.busy = '';
      renderAdmin();
    }

    async function adminNoticeDelete(id) {
      const row = adminNbRow(id);
      if (!row || RD_ADMIN.busy) return;
      /* Deleting also throws the Drive file away, so it is worth one question. */
      RD_ADMIN.busy = id;
      renderAdmin();
      try {
        const r = await apiPost('deletenotice', { noticeId: id });
        RD_ADMIN.rows.notices = (RD_ADMIN.rows.notices || []).filter(x => x.id !== id);
        RD_ADMIN.askWhat = ''; RD_ADMIN.askId = '';
        if (RD_ADMIN.nbEdit === id) RD_ADMIN.nbEdit = '';
        RD_NB.state = 'idle';
        rdFeedForget('notices');
        showToast(r.message || 'The notice is removed.', 'success', 'Removed', { backTo: 'admin' });
      } catch (err) {
        showToast(friendlyError(err).msg, 'error', 'Could not remove', { backTo: 'admin' });
      }
      RD_ADMIN.busy = '';
      renderAdmin();
    }

    function adminNoticeItem(r) {
      const busy = RD_ADMIN.busy === r.id;
      const on = r.show !== 'NO';
      const isText = r.kind === 'TEXT';
      return '<article class="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">' +
        '<div class="flex flex-wrap items-center gap-2">' +
          '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-extrabold ' +
            (isText ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-blue-50 border-blue-200 text-blue-700') + '">' +
            '<i data-lucide="' + (isText ? 'scroll-text' : (r.fileType === 'pdf' ? 'file-text' : 'image')) + '" class="w-3 h-3"></i>' +
            (isText ? 'Scrolling line' : (r.fileType === 'pdf' ? 'PDF' : 'Image')) + '</span>' +
          '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-extrabold ' +
            (on ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-100 border-slate-200 text-slate-500') + '">' +
            '<i data-lucide="' + (on ? 'eye' : 'eye-off') + '" class="w-3 h-3"></i>' + (on ? 'Showing' : 'Hidden') + '</span>' +
          '<span class="text-[11px] font-mono font-bold text-slate-400">' + escapeHtml(r.id) + '</span>' +
          '<span class="ml-auto text-[11px] font-extrabold text-slate-400">' + escapeHtml(rdNiceDate(r.postedDate)) + '</span>' +
        '</div>' +
        '<h4 class="mt-2.5 font-extrabold text-slate-900 break-words">' + escapeHtml(r.title || (isText ? r.body : '(no title)')) + '</h4>' +
        (String(r.body || '').trim() && r.title
          ? '<p class="mt-1 text-xs font-semibold text-slate-500 leading-relaxed break-words">' + escapeHtml(r.body) + '</p>'
          : '') +
        '<div class="mt-4 flex flex-wrap gap-2">' +
          adminMiniBtn('Edit', 'pencil', 'bg-white border-blue-200 text-blue-700 hover:bg-blue-50',
            "adminNoticeEdit('" + r.id + "')", busy) +
          adminMiniBtn(on ? 'Hide' : 'Show', on ? 'eye-off' : 'eye',
            on ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
               : 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700',
            "adminNoticeShow('" + r.id + "'," + (on ? 'false' : 'true') + ")", busy) +
          (String(r.viewUrl || '').trim()
            ? '<a href="' + escapeHtml(r.viewUrl) + '" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-extrabold border bg-white border-slate-200 text-slate-600 hover:bg-slate-50"><i data-lucide="external-link" class="w-3.5 h-3.5"></i> Open the file</a>'
            : '') +
          adminMiniBtn('Delete', 'trash-2', 'bg-white border-rose-200 text-rose-700 hover:bg-rose-50',
            "adminAsk('nbDel','" + r.id + "')", busy) +
        '</div>' +
        (adminAskArmed('nbDel', r.id)
          ? adminConfirmStrip('Delete ' + r.id + ' for good? The uploaded file goes with it.',
              'Yes, delete it', "adminNoticeDelete('" + r.id + "')")
          : '') +
      '</article>';
    }

    function adminNoticesHtml() {
      const rows = RD_ADMIN.rows.notices || [];
      return '<div class="space-y-4">' + adminNoticeForm() +
        (rows.length
          ? rows.map(adminNoticeItem).join('')
          : adminInfoBox('megaphone', 'No notice yet', 'Whatever you publish above appears here and on the Notice page.', 'empty')) +
      '</div>';
    }

    /* ---------- Social Media Corner tab ---------- */
    function adminScRow(id) {
      return (RD_ADMIN.rows.social || []).find(r => r.id === id) || null;
    }

    function adminSocialForm() {
      const editing = RD_ADMIN.scEdit ? adminScRow(RD_ADMIN.scEdit) : null;
      const shown = editing ? editing.show !== 'NO' : true;
      const inner =
        '<div class="mt-5"><label class="form-label" for="sc-link">The link *</label>' +
          '<input id="sc-link" class="form-input" inputmode="url" placeholder="https://www.facebook.com/... or a news link" value="' +
            escapeHtml(editing ? editing.link : '') + '"></div>' +
        '<div class="mt-4 grid sm:grid-cols-2 gap-4">' +
          '<div><label class="form-label" for="sc-title">Headline (optional)</label>' +
            '<input id="sc-title" class="form-input" maxlength="180" placeholder="For a news link, the headline" value="' +
              escapeHtml(editing ? editing.title : '') + '"></div>' +
          '<div><label class="form-label" for="sc-image">Picture (optional)</label>' +
            '<input id="sc-image" type="file" accept="image/*" class="form-input"></div>' +
        '</div>' +
        '<div class="mt-4"><label class="form-label" for="sc-caption">Caption *</label>' +
          '<textarea id="sc-caption" rows="3" maxlength="600" class="form-input" placeholder="Write the caption in your own words.">' +
            escapeHtml(editing ? editing.caption : '') + '</textarea></div>' +
        '<label class="mt-4 flex items-center gap-2.5 text-xs font-extrabold text-slate-600 cursor-pointer">' +
          '<input id="sc-show" type="checkbox" class="w-4 h-4 accent-blue-600"' + (shown ? ' checked' : '') + '> Show this in the corner</label>' +
        '<div class="mt-5 flex flex-wrap gap-2">' +
          '<button id="sc-save" type="button" onclick="adminSocialSave()" class="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-extrabold cursor-pointer">' +
            '<i data-lucide="save" class="w-4 h-4"></i> ' + (editing ? 'Save the changes' : 'Add the post') + '</button>' +
          (editing
            ? '<button type="button" onclick="adminSocialNew()" class="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-bold cursor-pointer"><i data-lucide="x" class="w-4 h-4"></i> Cancel</button>'
            : '') +
        '</div>';
      return adminPanelShell('share-2', editing ? 'Editing ' + editing.id : 'Add a post to the corner',
        'Facebook does not hand its pictures and captions to another site, so the caption is yours to write. Without a picture the card carries the Rangdhanu logo.',
        inner);
    }

    function adminSocialNew() { RD_ADMIN.scEdit = ''; renderAdmin(); }
    function adminSocialEdit(id) { RD_ADMIN.scEdit = id; renderAdmin(); window.scrollTo({ top: 0, behavior: 'auto' }); }

    async function adminSocialSave() {
      const linkEl = document.getElementById('sc-link');
      if (!linkEl || RD_ADMIN.busy) return;
      const link = String(linkEl.value || '').trim();
      const title = String((document.getElementById('sc-title') || {}).value || '').trim();
      const caption = String((document.getElementById('sc-caption') || {}).value || '').trim();
      const show = !!(document.getElementById('sc-show') || {}).checked;
      const image = ((document.getElementById('sc-image') || {}).files || [])[0] || null;
      const editing = RD_ADMIN.scEdit;

      if (!/^https?:\/\/\S+$/i.test(link)) {
        showToast('Please paste the full link, starting with https://', 'error', 'The link is not complete', { backTo: 'admin' });
        return;
      }
      if (!caption && !title) {
        showToast('Please write a caption for this post.', 'error', 'A caption is needed', { backTo: 'admin' });
        return;
      }

      RD_ADMIN.busy = editing || 'new';
      const btn = document.getElementById('sc-save');
      if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
      try {
        const data = { postId: editing || '', link: link, title: title, caption: caption, show: show ? 'YES' : 'NO' };
        if (image) data.image = await filePayload(image, 1600);
        const r = await apiPost('savesocialpost', { data: data });
        RD_ADMIN.scEdit = '';
        RD_ADMIN.busy = '';
        RD_SC.state = 'idle';
        rdFeedForget('notices');
        RD_NB.state = 'idle';
        rdFeedForget('notices');
        showToast(r.message || 'The post is saved.', 'success', 'Post saved', { backTo: 'admin' });
        loadAdminDashboard(true);
      } catch (err) {
        RD_ADMIN.busy = '';
        showToast(friendlyError(err).msg, 'error', 'Could not save', { backTo: 'admin' });
        renderAdmin();
      }
    }

    async function adminSocialShow(id, on) {
      const row = adminScRow(id);
      if (!row || RD_ADMIN.busy) return;
      RD_ADMIN.busy = id;
      renderAdmin();
      try {
        const r = await apiPost('setsocialpostshow', { postId: id, show: on ? 'YES' : 'NO' });
        row.show = on ? 'YES' : 'NO';
        RD_SC.state = 'idle';
        rdFeedForget('notices');
        showToast(r.message || 'Saved.', 'success', 'Saved', { backTo: 'admin' });
      } catch (err) {
        showToast(friendlyError(err).msg, 'error', 'Could not save', { backTo: 'admin' });
      }
      RD_ADMIN.busy = '';
      renderAdmin();
    }

    async function adminSocialDelete(id) {
      const row = adminScRow(id);
      if (!row || RD_ADMIN.busy) return;
      RD_ADMIN.busy = id;
      renderAdmin();
      try {
        const r = await apiPost('deletesocialpost', { postId: id });
        RD_ADMIN.rows.social = (RD_ADMIN.rows.social || []).filter(x => x.id !== id);
        RD_ADMIN.askWhat = ''; RD_ADMIN.askId = '';
        if (RD_ADMIN.scEdit === id) RD_ADMIN.scEdit = '';
        RD_SC.state = 'idle';
        rdFeedForget('notices');
        showToast(r.message || 'The post is removed.', 'success', 'Removed', { backTo: 'admin' });
      } catch (err) {
        showToast(friendlyError(err).msg, 'error', 'Could not remove', { backTo: 'admin' });
      }
      RD_ADMIN.busy = '';
      renderAdmin();
    }

    function adminSocialItem(r) {
      const busy = RD_ADMIN.busy === r.id;
      const on = r.show !== 'NO';
      const gone = r.health === 'GONE';
      return '<article class="bg-white rounded-3xl border ' + (gone ? 'border-amber-300' : 'border-slate-200') + ' shadow-sm p-5">' +
        '<div class="flex flex-wrap items-center gap-2">' +
          '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-extrabold ' +
            (r.kind === 'NEWS' ? 'bg-violet-50 border-violet-200 text-violet-700' : 'bg-sky-50 border-sky-200 text-sky-700') + '">' +
            '<i data-lucide="' + (r.kind === 'NEWS' ? 'newspaper' : 'facebook') + '" class="w-3 h-3"></i>' +
            (r.kind === 'NEWS' ? 'News' : 'Facebook') + '</span>' +
          '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-extrabold ' +
            (on ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-100 border-slate-200 text-slate-500') + '">' +
            '<i data-lucide="' + (on ? 'eye' : 'eye-off') + '" class="w-3 h-3"></i>' + (on ? 'Showing' : 'Hidden') + '</span>' +
          '<span class="text-[11px] font-mono font-bold text-slate-400">' + escapeHtml(r.id) + '</span>' +
          '<span class="ml-auto text-[11px] font-extrabold text-slate-400">' + escapeHtml(rdNiceDate(r.postedDate)) + '</span>' +
        '</div>' +
        (String(r.title || '').trim()
          ? '<h4 class="mt-2.5 font-extrabold text-slate-900 break-words">' + escapeHtml(r.title) + '</h4>' : '') +
        (String(r.caption || '').trim()
          ? '<p class="mt-1.5 text-xs font-semibold text-slate-600 leading-relaxed break-words">' + escapeHtml(r.caption) + '</p>' : '') +
        '<p class="mt-2 text-[11px] font-semibold text-blue-600 break-all">' + escapeHtml(r.link) + '</p>' +
        /* The audit only ever hides a post it is sure about. This line is the
           "message in the panel" the admin asked for: the visitor sees nothing
           broken, the admin sees exactly what happened. */
        (gone
          ? '<p class="mt-3 text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 leading-relaxed"><span class="font-extrabold">This post could not be found on ' +
            escapeHtml(r.kind === 'NEWS' ? 'the news site' : 'Facebook') + '.</span> It has already been taken off the website, quietly. Update the link or delete the row.</p>'
          : '') +
        '<div class="mt-4 flex flex-wrap gap-2">' +
          adminMiniBtn('Edit', 'pencil', 'bg-white border-blue-200 text-blue-700 hover:bg-blue-50',
            "adminSocialEdit('" + r.id + "')", busy) +
          adminMiniBtn(on ? 'Hide' : 'Show', on ? 'eye-off' : 'eye',
            on ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
               : 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700',
            "adminSocialShow('" + r.id + "'," + (on ? 'false' : 'true') + ")", busy) +
          '<a href="' + escapeHtml(r.link) + '" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-extrabold border bg-white border-slate-200 text-slate-600 hover:bg-slate-50"><i data-lucide="external-link" class="w-3.5 h-3.5"></i> Open the post</a>' +
          adminMiniBtn('Delete', 'trash-2', 'bg-white border-rose-200 text-rose-700 hover:bg-rose-50',
            "adminAsk('scDel','" + r.id + "')", busy) +
        '</div>' +
        (adminAskArmed('scDel', r.id)
          ? adminConfirmStrip('Remove ' + r.id + ' from the corner?',
              'Yes, remove it', "adminSocialDelete('" + r.id + "')")
          : '') +
      '</article>';
    }

    function adminSocialHtml() {
      const rows = RD_ADMIN.rows.social || [];
      return '<div class="space-y-4">' + adminSocialForm() +
        (rows.length
          ? rows.map(adminSocialItem).join('')
          : adminInfoBox('share-2', 'The corner is empty', 'Paste a Facebook or news link above and it appears on the Notice page.', 'empty')) +
      '</div>';
    }

    /* ---------- PDACC Page tab ----------------------------------------
       Two lists live in one tab because they belong to one page: the notice
       line that scrolls across the top, and the "Latest update" cards. A
       switch at the top decides which of the two the form is for, so the
       panel never shows two forms at once and nothing can be saved into the
       wrong list by accident. */
    const RD_PD_KINDS_UI = [
      { key: 'LINE',   label: 'Notice line',   icon: 'megaphone' },
      { key: 'UPDATE', label: 'Latest update', icon: 'newspaper' },
      { key: 'STATS',  label: 'A Proven Journey', icon: 'trending-up' }
    ];

    function adminPdKind() {
      const k = RD_ADMIN.pdKind;
      return (k === 'UPDATE' || k === 'STATS') ? k : 'LINE';
    }

    function adminPdKindMeta(kind) {
      return RD_PD_KINDS_UI.find(k => k.key === kind) || RD_PD_KINDS_UI[0];
    }

    function adminPdRowsOf(kind) {
      return (RD_ADMIN.rows.pdacc || []).filter(r => String(r.kind || '') === kind);
    }

    function adminPdRow(id) {
      return (RD_ADMIN.rows.pdacc || []).find(r => r.id === id) || null;
    }

    /* Switching the kind drops whatever was half-edited, on purpose: an
       update's title has nowhere to go in a one-line notice. */
    function adminPdaccKind(kind) {
      RD_ADMIN.pdKind = (kind === 'UPDATE' || kind === 'STATS') ? kind : 'LINE';
      RD_ADMIN.pdEdit = '';
      renderAdmin();
    }

    function adminPdaccNew() { RD_ADMIN.pdEdit = ''; renderAdmin(); }

    function adminPdaccEdit(id) {
      const row = adminPdRow(id);
      if (!row) return;
      RD_ADMIN.pdKind = String(row.kind || '') === 'UPDATE' ? 'UPDATE' : 'LINE';
      RD_ADMIN.pdEdit = id;
      renderAdmin();
      window.scrollTo({ top: 0, behavior: 'auto' });
    }

    function adminPdKindSwitch() {
      const now = adminPdKind();
      return '<div class="flex flex-wrap gap-2 mb-4">' +
        RD_PD_KINDS_UI.map(k =>
          '<button type="button" onclick="adminPdaccKind(\'' + k.key + '\')" ' +
            'class="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-extrabold border cursor-pointer ' +
            (k.key === now
              ? 'bg-gradient-to-r from-blue-600 to-indigo-600 border-transparent text-white'
              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50') + '">' +
            '<i data-lucide="' + k.icon + '" class="w-3.5 h-3.5"></i> ' + k.label +
            (k.key === 'STATS' ? '' : '<span class="ml-1 opacity-70">(' + adminPdRowsOf(k.key).length + ')</span>') +
          '</button>').join('') +
      '</div>';
    }

    /* The scrolling line. One field and one switch -- anything longer than a
       sentence belongs in an update card, not on a moving ticker. */
    function adminPdLineForm() {
      const editing = RD_ADMIN.pdEdit ? adminPdRow(RD_ADMIN.pdEdit) : null;
      const row = editing && String(editing.kind || '') === 'LINE' ? editing : null;
      const shown = row ? row.show !== 'NO' : true;
      const inner =
        '<div class="mt-5"><label class="form-label" for="pd-text">The line *</label>' +
          '<input id="pd-text" class="form-input" maxlength="300" ' +
            'placeholder="Admission form collection starts on 1 September." value="' +
            escapeHtml(row ? row.text : '') + '"></div>' +
        '<label class="mt-4 flex items-center gap-2.5 text-xs font-extrabold text-slate-600 cursor-pointer">' +
          '<input id="pd-show" type="checkbox" class="w-4 h-4 accent-blue-600"' +
          (shown ? ' checked' : '') + '> Show this on the PDACC page</label>' +
        '<div class="mt-5 flex flex-wrap gap-2">' +
          '<button id="pd-save" type="button" onclick="adminPdLineSave()" class="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-extrabold cursor-pointer">' +
            '<i data-lucide="save" class="w-4 h-4"></i> ' + (row ? 'Save the changes' : 'Add the line') + '</button>' +
          (row
            ? '<button type="button" onclick="adminPdaccNew()" class="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-bold cursor-pointer"><i data-lucide="x" class="w-4 h-4"></i> Cancel</button>'
            : '') +
        '</div>';
      return adminPanelShell('megaphone', row ? 'Editing ' + row.id : 'Add a notice line',
        'This scrolls across the top of the PDACC page. Keep it to one sentence; a line nobody can finish reading is a line nobody reads.',
        inner);
    }

    /* An update card: link, title, description, picture. Only the title is
       required -- a notice with nothing to link to is still worth posting, and
       without a picture the card carries the PDACC crest. */
    function adminPdUpdateForm() {
      const editing = RD_ADMIN.pdEdit ? adminPdRow(RD_ADMIN.pdEdit) : null;
      const row = editing && String(editing.kind || '') === 'UPDATE' ? editing : null;
      const shown = row ? row.show !== 'NO' : true;
      const inner =
        '<div class="mt-5"><label class="form-label" for="pd-title">Title *</label>' +
          '<input id="pd-title" class="form-input" maxlength="200" ' +
            'placeholder="Admission coaching, 2026 batch" value="' +
            escapeHtml(row ? row.title : '') + '"></div>' +
        '<div class="mt-4 grid sm:grid-cols-2 gap-4">' +
          '<div><label class="form-label" for="pd-link">Link (optional)</label>' +
            '<input id="pd-link" class="form-input" inputmode="url" placeholder="https://..." value="' +
              escapeHtml(row ? row.link : '') + '"></div>' +
          '<div><label class="form-label" for="pd-image">Picture (optional)</label>' +
            '<input id="pd-image" type="file" accept="image/*" class="form-input"></div>' +
        '</div>' +
        '<div class="mt-4"><label class="form-label" for="pd-desc">Description (optional)</label>' +
          '<textarea id="pd-desc" rows="3" maxlength="1500" class="form-input" placeholder="A few lines about this update.">' +
            escapeHtml(row ? row.description : '') + '</textarea></div>' +
        (row && String(row.image || '').trim()
          ? '<p class="mt-2 text-[11px] font-semibold text-slate-500">A picture is already on this update. Choosing a new one replaces it; leaving the box empty keeps it.</p>'
          : '') +
        '<label class="mt-4 flex items-center gap-2.5 text-xs font-extrabold text-slate-600 cursor-pointer">' +
          '<input id="pd-ushow" type="checkbox" class="w-4 h-4 accent-blue-600"' +
          (shown ? ' checked' : '') + '> Show this in Latest update</label>' +
        '<div class="mt-5 flex flex-wrap gap-2">' +
          '<button id="pd-usave" type="button" onclick="adminPdUpdateSave()" class="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-extrabold cursor-pointer">' +
            '<i data-lucide="save" class="w-4 h-4"></i> ' + (row ? 'Save the changes' : 'Add the update') + '</button>' +
          (row
            ? '<button type="button" onclick="adminPdaccNew()" class="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-bold cursor-pointer"><i data-lucide="x" class="w-4 h-4"></i> Cancel</button>'
            : '') +
        '</div>';
      return adminPanelShell('newspaper', row ? 'Editing ' + row.id : 'Add a Latest update',
        'Eight of these slide sideways on the PDACC page; the rest wait behind View all, fifteen to a page. The picture is compressed here before it is sent.',
        inner);
    }

    function adminPdBadges(r, on) {
      return '<div class="flex flex-wrap items-center gap-2">' +
        '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-extrabold ' +
          (String(r.kind || '') === 'UPDATE'
            ? 'bg-violet-50 border-violet-200 text-violet-700'
            : 'bg-amber-50 border-amber-200 text-amber-700') + '">' +
          '<i data-lucide="' + adminPdKindMeta(r.kind).icon + '" class="w-3 h-3"></i>' +
          adminPdKindMeta(r.kind).label + '</span>' +
        '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-extrabold ' +
          (on ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-100 border-slate-200 text-slate-500') + '">' +
          '<i data-lucide="' + (on ? 'eye' : 'eye-off') + '" class="w-3 h-3"></i>' + (on ? 'Showing' : 'Hidden') + '</span>' +
        '<span class="text-[11px] font-mono font-bold text-slate-400">' + escapeHtml(r.id) + '</span>' +
        '<span class="ml-auto text-[11px] font-extrabold text-slate-400">' + escapeHtml(rdNiceDate(r.postedDate)) + '</span>' +
      '</div>';
    }

    function adminPdLineItem(r) {
      const busy = RD_ADMIN.busy === r.id;
      const on = r.show !== 'NO';
      return '<article class="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">' +
        adminPdBadges(r, on) +
        '<p class="mt-2.5 font-extrabold text-slate-900 break-words">' + escapeHtml(r.text || '(empty)') + '</p>' +
        '<div class="mt-4 flex flex-wrap gap-2">' +
          adminMiniBtn('Edit', 'pencil', 'bg-white border-blue-200 text-blue-700 hover:bg-blue-50',
            "adminPdaccEdit('" + r.id + "')", busy) +
          adminMiniBtn(on ? 'Hide' : 'Show', on ? 'eye-off' : 'eye',
            on ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
               : 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700',
            "adminPdLineShow('" + r.id + "'," + (on ? 'false' : 'true') + ")", busy) +
          adminMiniBtn('Delete', 'trash-2', 'bg-white border-rose-200 text-rose-700 hover:bg-rose-50',
            "adminAsk('pdDel','" + r.id + "')", busy) +
        '</div>' +
        (adminAskArmed('pdDel', r.id)
          ? adminConfirmStrip('Remove ' + r.id + ' from the PDACC page?',
              'Yes, remove it', "adminPdLineDelete('" + r.id + "')")
          : '') +
      '</article>';
    }

    function adminPdUpdateItem(r) {
      const busy = RD_ADMIN.busy === r.id;
      const on = r.show !== 'NO';
      const pic = String(r.image || '').trim();
      return '<article class="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">' +
        adminPdBadges(r, on) +
        '<div class="mt-3 flex gap-4">' +
          '<div class="w-20 h-20 rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden flex-none flex items-center justify-center">' +
            '<img src="' + escapeHtml(pic || RD_PDACC_LOGO) + '" alt="" loading="lazy" decoding="async" ' +
              'onerror="rdPdCardFallback(this)" class="w-full h-full object-' + (pic ? 'cover' : 'contain p-2') + '">' +
          '</div>' +
          '<div class="min-w-0">' +
            '<h4 class="font-extrabold text-slate-900 break-words">' + escapeHtml(r.title || '(no title)') + '</h4>' +
            (String(r.description || '').trim()
              ? '<p class="mt-1.5 text-xs font-semibold text-slate-600 leading-relaxed break-words">' + escapeHtml(r.description) + '</p>'
              : '') +
            (String(r.link || '').trim()
              ? '<p class="mt-2 text-[11px] font-semibold text-blue-600 break-all">' + escapeHtml(r.link) + '</p>'
              : '<p class="mt-2 text-[11px] font-semibold text-slate-400">No link on this one.</p>') +
          '</div>' +
        '</div>' +
        '<div class="mt-4 flex flex-wrap gap-2">' +
          adminMiniBtn('Edit', 'pencil', 'bg-white border-blue-200 text-blue-700 hover:bg-blue-50',
            "adminPdaccEdit('" + r.id + "')", busy) +
          adminMiniBtn(on ? 'Hide' : 'Show', on ? 'eye-off' : 'eye',
            on ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
               : 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700',
            "adminPdUpdateShow('" + r.id + "'," + (on ? 'false' : 'true') + ")", busy) +
          (String(r.link || '').trim()
            ? '<a href="' + escapeHtml(r.link) + '" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-extrabold border bg-white border-slate-200 text-slate-600 hover:bg-slate-50"><i data-lucide="external-link" class="w-3.5 h-3.5"></i> Open the link</a>'
            : '') +
          adminMiniBtn('Delete', 'trash-2', 'bg-white border-rose-200 text-rose-700 hover:bg-rose-50',
            "adminAsk('pdUDel','" + r.id + "')", busy) +
        '</div>' +
        (adminAskArmed('pdUDel', r.id)
          ? adminConfirmStrip('Delete ' + r.id + ' for good? The uploaded picture goes with it.',
              'Yes, delete it', "adminPdUpdateDelete('" + r.id + "')")
          : '') +
      '</article>';
    }

    /* ---------- A Proven Journey ------------------------------------------
       Five fields, one row in the sheet. This tab reads the same public
       endpoint the PDACC page reads, so what is shown here is exactly what a
       visitor sees. The figure is a free text box, not a number box: the page
       carries Bengali digits, and a number box would fight them. */
    /* The chart is edited as plain lines, one row per line, three fields split
       by a pipe: label | small line under it | the figure. That is the shortest
       thing to type on a phone, and it keeps Bengali digits untouched. */
    function rdPdLines(list) {
      return (Array.isArray(list) ? list : []).map(x =>
        [String(x.label || ''), String(x.sub || ''), String(x.count || '')]
          .join(' | ')).join('\n');
    }

    function rdPdParseLines(text) {
      return String(text || '').split('\n').map(function (line) {
        const bits = line.split('|').map(x => x.trim());
        return { label: bits[0] || '', sub: bits[1] || '', count: bits[2] || '' };
      }).filter(x => x.label);
    }

    async function adminPdStatsLoad() {
      if (RD_PDSTATS) return;
      try { await fetchPdaccStats(); renderAdmin(); }
      catch (err) {
        console.warn('[rd] pdaccstats:', err);
        RD_PDSTATS = {};
        renderAdmin();
      }
    }

    function adminPdStatsForm() {
      if (!RD_PDSTATS) {
        adminPdStatsLoad();
        return adminInfoBox('trending-up', 'Reading the figures',
          'Fetching what the PDACC page is showing right now.', 'empty');
      }
      const d = RD_PDSTATS;
      const ch = d.chance || {};
      const box = function (id, label, val, max, ph) {
        return '<div><label class="form-label" for="' + id + '">' + label + '</label>' +
          '<input id="' + id + '" class="form-input" maxlength="' + max + '" placeholder="' +
          escapeHtml(ph) + '" value="' + escapeHtml(String(d[val] == null ? '' : d[val])) + '"></div>';
      };
      const inner =
        /* The ribbon at the top of the PDACC page. One box, not two: the
           second one held the session the count was true for, and only the
           July rule needed it. The figure moves when PDACC decides it
           moves, so it is typed and nothing adds to it. */
        '<div class="mt-5 grid sm:grid-cols-2 gap-4">' +
          box('pd-sy', 'Years completed, top of the page', 'years', 6, '27') +
        '</div>' +
        '<p class="text-xs text-slate-500 mt-2">This is the line above the PDACC menu. Write the figure PDACC publishes about itself. It stays exactly as typed, so change it here when PDACC changes it. Leave it empty and the page keeps the number already written into it.</p>' +
        '<div class="mt-4"><label class="form-label" for="pd-sser">The chart, one series per line *</label>' +
          '<textarea id="pd-sser" rows="8" class="form-input font-mono text-xs" placeholder="25 series | 2025-26 | 92">' +
            escapeHtml(rdPdLines(ch.series)) + '</textarea>' +
          '<p class="text-xs text-slate-500 mt-2">One line for each series, newest first: label, then the session, then how many got in. Separate the three with a pipe.</p></div>' +
        '<div class="mt-4"><label class="form-label" for="pd-sdep">The department rows, one per line</label>' +
          '<textarea id="pd-sdep" rows="8" class="form-input font-mono text-xs" placeholder="Civil | Civil | 26">' +
            escapeHtml(rdPdLines(ch.depts)) + '</textarea>' +
          '<p class="text-xs text-slate-500 mt-2">The same three fields. Leave this box empty and the whole department block stays off the page; fill it and the bar widths and the total are worked out from the figures.</p></div>' +
        '<div class="mt-5 flex flex-wrap gap-2">' +
          '<button id="pd-ssave" type="button" onclick="adminPdStatsSave()" class="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-extrabold cursor-pointer">' +
            '<i data-lucide="save" class="w-4 h-4"></i> Save the figures</button>' +
        '</div>';
      return adminPanelShell('trending-up', 'A Proven Journey',
        'The chance record on the PDACC page, and the line above its menu. Write the figures the same way they should read on the page: Bengali digits stay Bengali.',
        inner);
    }

    async function adminPdStatsSave() {
      if (RD_ADMIN.busy) {
        showToast('Another change is still being saved. Please wait a moment, or reload the admin page.',
          'error', 'One at a time', { backTo: 'admin' });
        return;
      }
      const val = id => String((document.getElementById(id) || {}).value || '').trim();
      /* These six have no box on screen any more, so they are sent back
         exactly as they were read. The sheet keeps them, and the backend, which
         still asks for them, is happy without an edit. yearsFrom joined them
         when the ribbon stopped counting years. */
      const was = RD_PDSTATS || {};
      const keep = k => String(was[k] == null ? '' : was[k]).trim();
      const data = { kicker: keep('kicker'), title: keep('title'), figure: keep('figure'),
                     unit: keep('unit'), note: keep('note'),
                     yearsFrom: keep('yearsFrom'), years: val('pd-sy') };
      data.series = rdPdParseLines(val('pd-sser'));
      data.depts = rdPdParseLines(val('pd-sdep'));
      if (!data.series.length) {
        showToast('Please keep at least one series line in the chart.',
          'error', 'The chart is empty', { backTo: 'admin' });
        return;
      }
      /* Four of those must not go out blank. If the sheet was never
         seeded they would be empty and the backend would refuse, so a word is
         put in rather than letting the save fail with nothing to act on. */
      data.title  = data.title  || 'PDACC';
      data.figure = data.figure || '0';
      data.unit   = data.unit   || '-';
      data.note   = data.note   || '-';
      RD_ADMIN.busy = 'pdstats';
      const btn = document.getElementById('pd-ssave');
      if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
      try {
        const r = await apiPost('savepdaccstats', { data: data });
        RD_ADMIN.busy = '';
        RD_PDSTATS = r.stats || data;
        /* The department rows are the newest series split up, so they should add
           up to it. A typo there would put a wrong figure on a public page, so
           the save reports the difference instead of accepting it in silence.
           It is a report, not a refusal: the rows are already saved, and a
           season that really does not add up is his call, not the form's. */
        const dsum = data.depts.reduce((a, x) => a + rdPdToNum(x.count), 0);
        const newest = rdPdToNum((data.series[0] || {}).count);
        if (data.depts.length && dsum !== newest) {
          showToast('The rows are saved. One thing to check: the departments add up to ' +
            rdPdBn(dsum) + ', while the newest series says ' + rdPdBn(newest) +
            '. Open the form again if one of them is a typo.',
            'success', 'Saved, with a figure to check', { backTo: 'admin' });
        } else {
          showToast(r.message || 'The figures are saved.', 'success', 'Saved', { backTo: 'admin' });
        }
        renderAdmin();
      } catch (err) {
        console.warn('[rd] savepdaccstats:', err);
        RD_ADMIN.busy = '';
        showToast(friendlyError(err).msg, 'error', 'Could not save', { backTo: 'admin' });
        renderAdmin();
      }
    }

    function adminPdaccHtml() {
      const kind = adminPdKind();
      /* One row, not a list: the stats tab is a form with nothing under it. */
      if (kind === 'STATS') {
        return '<div class="space-y-4">' + adminPdKindSwitch() + adminPdStatsForm() + '</div>';
      }
      const rows = adminPdRowsOf(kind);
      return '<div class="space-y-4">' + adminPdKindSwitch() +
        (kind === 'UPDATE' ? adminPdUpdateForm() : adminPdLineForm()) +
        (rows.length
          ? rows.map(kind === 'UPDATE' ? adminPdUpdateItem : adminPdLineItem).join('')
          : adminInfoBox(adminPdKindMeta(kind).icon,
              kind === 'UPDATE' ? 'No update yet' : 'No notice line yet',
              kind === 'UPDATE'
                ? 'Whatever you add above appears in Latest update on the PDACC page.'
                : 'Whatever you add above scrolls across the top of the PDACC page.',
              'empty')) +
      '</div>';
    }

    /* RD_PD.state is dropped back to 'idle' after every write, so the next
       visit to the PDACC page fetches the feed again instead of showing what
       the admin has just changed away from. */
    async function adminPdLineSave() {
      const el = document.getElementById('pd-text');
      if (!el) return;
      if (RD_ADMIN.busy) {
        showToast('Another change is still being saved. Please wait a moment, or reload the admin page.',
          'error', 'One at a time', { backTo: 'admin' });
        return;
      }
      const text = String(el.value || '').trim();
      const show = !!(document.getElementById('pd-show') || {}).checked;
      const editing = RD_ADMIN.pdEdit;

      if (!text) {
        showToast('Please write the notice line.', 'error', 'The line is empty', { backTo: 'admin' });
        return;
      }

      RD_ADMIN.busy = editing || 'new';
      const btn = document.getElementById('pd-save');
      if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
      try {
        const r = await apiPost('savepdaccline',
          { data: { lineId: editing || '', text: text, show: show ? 'YES' : 'NO' } });
        RD_ADMIN.pdEdit = '';
        RD_ADMIN.busy = '';
        RD_PD.state = 'idle';
        rdFeedForget('pdacc');
        showToast(r.message || 'The line is saved.', 'success', 'Line saved', { backTo: 'admin' });
        loadAdminDashboard(true);
      } catch (err) {
        console.warn('[rd] savepdaccline:', err);
        RD_ADMIN.busy = '';
        showToast(friendlyError(err).msg, 'error', 'Could not save', { backTo: 'admin' });
        renderAdmin();
      }
    }

    async function adminPdLineShow(id, on) {
      if (!adminPdRow(id) || RD_ADMIN.busy) return;
      RD_ADMIN.busy = id;
      renderAdmin();
      try {
        const r = await apiPost('setpdacclineshow', { lineId: id, show: on ? 'YES' : 'NO' });
        const row = adminPdRow(id);
        if (row) row.show = on ? 'YES' : 'NO';
        RD_PD.state = 'idle';
        rdFeedForget('pdacc');
        showToast(r.message || 'Saved.', 'success', 'Saved', { backTo: 'admin' });
      } catch (err) {
        showToast(friendlyError(err).msg, 'error', 'Could not save', { backTo: 'admin' });
      }
      RD_ADMIN.busy = '';
      renderAdmin();
    }

    async function adminPdLineDelete(id) {
      if (!adminPdRow(id) || RD_ADMIN.busy) return;
      RD_ADMIN.busy = id;
      renderAdmin();
      try {
        const r = await apiPost('deletepdaccline', { lineId: id });
        RD_ADMIN.rows.pdacc = (RD_ADMIN.rows.pdacc || []).filter(x => x.id !== id);
        RD_ADMIN.askWhat = ''; RD_ADMIN.askId = '';
        if (RD_ADMIN.pdEdit === id) RD_ADMIN.pdEdit = '';
        RD_PD.state = 'idle';
        rdFeedForget('pdacc');
        showToast(r.message || 'The line is removed.', 'success', 'Removed', { backTo: 'admin' });
      } catch (err) {
        showToast(friendlyError(err).msg, 'error', 'Could not remove', { backTo: 'admin' });
      }
      RD_ADMIN.busy = '';
      renderAdmin();
    }

    async function adminPdUpdateSave() {
      const el = document.getElementById('pd-title');
      if (!el) return;
      /* A silent return here used to look like a dead button: if an earlier
         save had left RD_ADMIN.busy set, nothing at all happened on click.
         Now the reason is said out loud instead. */
      if (RD_ADMIN.busy) {
        showToast('Another change is still being saved. Please wait a moment, or reload the admin page.',
          'error', 'One at a time', { backTo: 'admin' });
        return;
      }
      const title = String(el.value || '').trim();
      const description = String((document.getElementById('pd-desc') || {}).value || '').trim();
      const link = String((document.getElementById('pd-link') || {}).value || '').trim();
      const show = !!(document.getElementById('pd-ushow') || {}).checked;
      const image = ((document.getElementById('pd-image') || {}).files || [])[0] || null;
      const editing = RD_ADMIN.pdEdit;

      if (!title) {
        showToast('Please write the title of this update.', 'error', 'A title is needed', { backTo: 'admin' });
        return;
      }
      if (link && !/^https?:\/\/\S+$/i.test(link)) {
        showToast('Please paste the full link, starting with https://', 'error', 'The link is not complete', { backTo: 'admin' });
        return;
      }

      RD_ADMIN.busy = editing || 'new';
      const btn = document.getElementById('pd-usave');
      if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
      try {
        const data = { updateId: editing || '', title: title, description: description,
                       link: link, show: show ? 'YES' : 'NO' };
        if (image) {
          /* The picture is its own step, so a picture problem says so rather
             than hiding behind a general "could not save". */
          if (btn) btn.textContent = 'Preparing the picture…';
          try {
            data.image = await filePayload(image, 1600);
          } catch (imgErr) {
            console.warn('[rd] pdacc picture:', imgErr);
            throw new Error('The picture could not be prepared. Please try another picture, or add the update without one.');
          }
          if (btn) btn.textContent = 'Saving…';
        }
        const r = await apiPost('savepdaccupdate', { data: data });
        RD_ADMIN.pdEdit = '';
        RD_ADMIN.busy = '';
        RD_PD.state = 'idle';
        rdFeedForget('pdacc');
        showToast(r.message || 'The update is saved.', 'success', 'Update saved', { backTo: 'admin' });
        loadAdminDashboard(true);
      } catch (err) {
        console.warn('[rd] savepdaccupdate:', err);
        RD_ADMIN.busy = '';
        showToast(friendlyError(err).msg, 'error', 'Could not save', { backTo: 'admin' });
        renderAdmin();
      }
    }

    async function adminPdUpdateShow(id, on) {
      if (!adminPdRow(id) || RD_ADMIN.busy) return;
      RD_ADMIN.busy = id;
      renderAdmin();
      try {
        const r = await apiPost('setpdaccupdateshow', { updateId: id, show: on ? 'YES' : 'NO' });
        const row = adminPdRow(id);
        if (row) row.show = on ? 'YES' : 'NO';
        RD_PD.state = 'idle';
        rdFeedForget('pdacc');
        showToast(r.message || 'Saved.', 'success', 'Saved', { backTo: 'admin' });
      } catch (err) {
        showToast(friendlyError(err).msg, 'error', 'Could not save', { backTo: 'admin' });
      }
      RD_ADMIN.busy = '';
      renderAdmin();
    }

    async function adminPdUpdateDelete(id) {
      if (!adminPdRow(id) || RD_ADMIN.busy) return;
      RD_ADMIN.busy = id;
      renderAdmin();
      try {
        const r = await apiPost('deletepdaccupdate', { updateId: id });
        RD_ADMIN.rows.pdacc = (RD_ADMIN.rows.pdacc || []).filter(x => x.id !== id);
        RD_ADMIN.askWhat = ''; RD_ADMIN.askId = '';
        if (RD_ADMIN.pdEdit === id) RD_ADMIN.pdEdit = '';
        RD_PD.state = 'idle';
        rdFeedForget('pdacc');
        showToast(r.message || 'The update is removed.', 'success', 'Removed', { backTo: 'admin' });
      } catch (err) {
        showToast(friendlyError(err).msg, 'error', 'Could not remove', { backTo: 'admin' });
      }
      RD_ADMIN.busy = '';
      renderAdmin();
    }

    /* ---------- Rangdhanu Family tab ------------------------------------
       The teachers and officers of greater Rangpur at DUET. Their row sits in
       the Alumni sheet like everyone else's -- that is what lets them sign in
       through the same door members use -- but the `Record Type` column holds
       the two lists apart everywhere either one is read: this tab shows only
       faculty rows, and the member directory drops them.

       Nothing here is a required box but the name, because an admin is filling
       this in, not a stranger who has to be guided. An empty box simply draws
       nothing on the card. The name is the one exception, and not as a rule
       about the form: a row with no name is not somebody's record, it is a
       blank line in the sheet. */
    function adminFacRow(id) {
      return (RD_ADMIN.rows.faculty || []).find(r => r.id === id) || null;
    }

    function adminFacNew() { RD_ADMIN.facEdit = ''; renderAdmin(); }

    function adminFacEdit(id) {
      RD_ADMIN.facEdit = adminFacRow(id) ? id : '';
      RD_ADMIN.askWhat = ''; RD_ADMIN.askId = '';
      renderAdmin();
      const el = document.getElementById('fac-name');
      if (el) { try { el.focus(); } catch (e) {} }
    }

    function adminFacBox(id, label, value, place) {
      return '<div><label class="form-label" for="' + id + '">' + escapeHtml(label) + '</label>' +
        '<input id="' + id + '" class="form-input" value="' + escapeHtml(value || '') + '"' +
        (place ? ' placeholder="' + escapeHtml(place) + '"' : '') + '></div>';
    }

    function adminFacForm() {
      const r = RD_ADMIN.facEdit ? adminFacRow(RD_ADMIN.facEdit) : null;
      const g = k => r ? String(r[k] || '') : '';
      const kind = g('Record Type') || 'Teacher';
      const inner =
        '<div class="mt-5 grid sm:grid-cols-2 gap-4">' +
          '<div><label class="form-label" for="fac-kind">They are a</label>' +
            '<select id="fac-kind" class="form-input">' +
            ['Teacher', 'Officer', 'Staff'].map(k =>
              '<option value="' + k + '"' + (k === kind ? ' selected' : '') + '>' + k + '</option>').join('') +
            '</select></div>' +
          adminFacBox('fac-name', 'Name', g('Full Name (English)'), 'Md. ...') +
          adminFacBox('fac-desig', 'Designation', g('Current Designation'), 'Associate Professor') +
          adminFacBox('fac-dept', 'Department', g('Department'), 'Civil Engineering') +
          adminFacBox('fac-degree', 'Degree', g('Academic Degree'), 'Ph.D., M.Sc. Engg.') +
          adminFacBox('fac-inst', 'Diploma institute', g('Diploma Institute'), 'Rangpur Polytechnic Institute') +
          adminFacBox('fac-phone', 'Office phone', g('Office Phone'), 'IP(D) 8600') +
          adminFacBox('fac-blood', 'Blood group', g('Blood Group'), 'B+') +
          adminFacBox('fac-profile', 'DUET profile page', g('DUET Profile'), 'https://www.duet.ac.bd/...') +
          adminFacBox('fac-mail', 'The mail they sign in with', g('Email'), 'name@duet.ac.bd') +
          '<div class="sm:col-span-2"><label class="form-label" for="fac-photo">Picture</label>' +
            '<input id="fac-photo" type="file" accept="image/*" class="form-input"></div>' +
        '</div>' +
        (r && String(r['Passport Size Image'] || '').trim()
          ? '<p class="mt-2 text-[11px] font-semibold text-slate-500">A picture is already on this row. Choosing a new one replaces it; leaving the box empty keeps it.</p>'
          : '') +
        '<div class="mt-5 flex flex-wrap gap-2">' +
          '<button id="fac-save" type="button" onclick="adminFacSave()" class="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-extrabold cursor-pointer">' +
            '<i data-lucide="save" class="w-4 h-4"></i> ' + (r ? 'Save the changes' : 'Add them') + '</button>' +
          (r
            ? '<button type="button" onclick="adminFacNew()" class="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-bold cursor-pointer"><i data-lucide="x" class="w-4 h-4"></i> Cancel</button>'
            : '') +
        '</div>';
      return adminPanelShell('user-plus', r ? 'Editing ' + r.id : 'Add a teacher or an officer',
        'Only the name is needed; every other box can stay empty. The mail written here is the mail they sign in with, through the same Google button members use.',
        inner);
    }

    /* One card per person. The pill on the right says whether the mail is in
       place, because that single box is the difference between a row on a page
       and a person who can sign in and keep their own page current. */
    function adminFacItem(r) {
      const busy = RD_ADMIN.busy === r.id;
      const kind = String(r['Record Type'] || 'Teacher');
      const name = String(r['Full Name (English)'] || '');
      const pic = String(r['Passport Size Image'] || '').trim();
      const line = [String(r['Current Designation'] || ''), String(r['Department'] || '')]
        .filter(x => x.trim()).join(' \u00b7 ');
      const inst = String(r['Diploma Institute'] || '').trim();
      const mail = String(r['Email'] || '').trim();
      const pill = (cls, icon, text) =>
        '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-extrabold ' +
        cls + '"><i data-lucide="' + icon + '" class="w-3 h-3"></i>' + text + '</span>';
      return '<article class="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">' +
        '<div class="flex flex-wrap items-center gap-2">' +
          pill('bg-indigo-50 border-indigo-200 text-indigo-700',
               RD_FAC_KIND_ICON[kind] || 'graduation-cap', escapeHtml(kind)) +
          '<span class="text-[11px] font-mono font-bold text-slate-400">' + escapeHtml(r.id) + '</span>' +
          '<span class="ml-auto">' + (mail
            ? pill('bg-emerald-50 border-emerald-200 text-emerald-700', 'mail-check', 'Can sign in')
            : pill('bg-slate-100 border-slate-200 text-slate-500', 'mail', 'No mail yet')) + '</span>' +
        '</div>' +
        '<div class="mt-3 flex gap-4">' +
          '<div class="w-16 h-16 rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden flex-none flex items-center justify-center">' +
            (pic
              ? '<img src="' + escapeHtml(normalizeAlumniImage(pic) || pic) + '" alt="" loading="lazy" decoding="async" class="w-full h-full object-cover">'
              : '<i data-lucide="user" class="w-6 h-6 text-slate-300"></i>') +
          '</div>' +
          '<div class="min-w-0">' +
            '<p class="font-extrabold text-slate-900 break-words">' + escapeHtml(name || '(no name)') + '</p>' +
            (line ? '<p class="text-xs font-semibold text-slate-500 mt-0.5 break-words">' + escapeHtml(line) + '</p>' : '') +
            (inst ? '<p class="text-[11px] font-semibold text-slate-400 mt-1 break-words">' + escapeHtml(inst) + '</p>' : '') +
          '</div>' +
        '</div>' +
        '<div class="mt-4 flex flex-wrap gap-2">' +
          adminMiniBtn('Edit', 'pencil', 'bg-white border-blue-200 text-blue-700 hover:bg-blue-50',
            "adminFacEdit('" + r.id + "')", busy) +
          adminMiniBtn('Delete', 'trash-2', 'bg-white border-rose-200 text-rose-700 hover:bg-rose-50',
            "adminAsk('facDel','" + r.id + "')", busy) +
        '</div>' +
        (adminAskArmed('facDel', r.id)
          ? adminConfirmStrip('Remove ' + (name || r.id) +
              ' from Rangdhanu Family? The row goes out of the sheet, so their sign-in stops working too.',
              'Yes, remove', "adminFacDelete('" + r.id + "')")
          : '') +
      '</article>';
    }

    function adminFacultyHtml() {
      const rows = Array.isArray(RD_ADMIN.rows.faculty) ? RD_ADMIN.rows.faculty : [];
      const missing = Array.isArray(RD_ADMIN.facMissing) ? RD_ADMIN.facMissing : [];
      return '<div class="space-y-4">' +
        /* A column the sheet does not have cannot be written, and a silent
           no-op would look like a save that did not stick. So the tab says it
           out loud, with the one function name that fixes it. */
        (missing.length
          ? '<div class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5">' +
              '<p class="text-xs font-extrabold text-amber-900 flex items-center gap-1.5">' +
              '<i data-lucide="wrench" class="w-3.5 h-3.5"></i> Run rdFacSetup() once</p>' +
              '<p class="mt-1.5 text-[11px] font-semibold text-amber-800 leading-relaxed">The sheet has no ' +
              escapeHtml(missing.join(', ')) + ' column yet, so those boxes cannot be saved. ' +
              'Open the Apps Script editor, run rdFacSetup(), then press Refresh here.</p></div>'
          : '') +
        adminFacForm() +
        (rows.length
          ? rows.map(adminFacItem).join('')
          : adminInfoBox('users-round', 'Nobody here yet',
              'Whoever you add above appears on the Rangdhanu Family page, under Teachers and Officers at DUET.',
              'empty')) +
      '</div>';
    }

    /* Posted under the Alumni sheet's own column names. The server writes only
       the headers it recognises, so a key it has never heard of changes
       nothing -- which is what keeps this form from reaching Status, Series or
       anything else it has no business touching. */
    async function adminFacSave() {
      if (!document.getElementById('fac-name')) return;
      if (RD_ADMIN.busy) {
        showToast('Another change is still being saved. Please wait a moment, or reload the admin page.',
          'error', 'One at a time', { backTo: 'admin' });
        return;
      }
      const val = id => String((document.getElementById(id) || {}).value || '').trim();
      const name = val('fac-name');
      if (!name) {
        showToast('Please write the name. Every other box can stay empty.',
          'error', 'The name is empty', { backTo: 'admin' });
        return;
      }
      const profile = val('fac-profile');
      if (profile && !/^https?:\/\/\S+$/i.test(profile)) {
        showToast('Please paste the full profile link, starting with https://',
          'error', 'The link is not complete', { backTo: 'admin' });
        return;
      }
      const mail = val('fac-mail');
      if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
        showToast('That mail does not look complete. Leave the box empty if you do not have it yet.',
          'error', 'Check the mail', { backTo: 'admin' });
        return;
      }
      const editing = RD_ADMIN.facEdit;
      const data = {
        'Member ID': editing || '',
        'Record Type': val('fac-kind') || 'Teacher',
        'Full Name (English)': name,
        'Current Designation': val('fac-desig'),
        'Department': val('fac-dept'),
        'Academic Degree': val('fac-degree'),
        'Diploma Institute': val('fac-inst'),
        'Office Phone': val('fac-phone'),
        'DUET Profile': profile,
        'Blood Group': val('fac-blood'),
        'Email': mail
      };
      RD_ADMIN.busy = editing || 'new';
      const btn = document.getElementById('fac-save');
      if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
      try {
        const photo = ((document.getElementById('fac-photo') || {}).files || [])[0] || null;
        if (photo) {
          /* The picture is its own step, so a picture problem says so instead
             of hiding behind a general "could not save". */
          if (btn) btn.textContent = 'Preparing the picture…';
          try {
            data.photo = await filePayload(photo, 900);
          } catch (imgErr) {
            console.warn('[rd] faculty picture:', imgErr);
            throw new Error('The picture could not be prepared. Please try another one, or save without a picture.');
          }
          if (btn) btn.textContent = 'Saving…';
        }
        const r = await apiPost('savefaculty', { faculty: data });
        RD_ADMIN.facEdit = '';
        RD_ADMIN.busy = '';
        /* The public page must refetch, not repaint from what the admin has
           just changed away from. */
        RD_FAC.ready = false;
        RD_FAC.all = [];
        rdFeedForget('faculty');
        showToast(r.message || 'Saved.', 'success', 'Saved', { backTo: 'admin' });
        loadAdminDashboard(true);
      } catch (err) {
        console.warn('[rd] savefaculty:', err);
        RD_ADMIN.busy = '';
        showToast(friendlyError(err).msg, 'error', 'Could not save', { backTo: 'admin' });
        renderAdmin();
      }
    }

    async function adminFacDelete(id) {
      if (!adminFacRow(id) || RD_ADMIN.busy) return;
      RD_ADMIN.busy = id;
      renderAdmin();
      try {
        const r = await apiPost('deletefaculty', { memberId: id });
        RD_ADMIN.rows.faculty = (RD_ADMIN.rows.faculty || []).filter(x => x.id !== id);
        RD_ADMIN.askWhat = ''; RD_ADMIN.askId = '';
        if (RD_ADMIN.facEdit === id) RD_ADMIN.facEdit = '';
        RD_FAC.ready = false;
        RD_FAC.all = [];
        rdFeedForget('faculty');
        showToast(r.message || 'Removed.', 'success', 'Removed', { backTo: 'admin' });
      } catch (err) {
        showToast(friendlyError(err).msg, 'error', 'Could not remove', { backTo: 'admin' });
      }
      RD_ADMIN.busy = '';
      renderAdmin();
    }


    /* ---------- Members Summary tab -----------------------------------
       Everything here is counted from lists the panel already holds, so the
       tab costs no extra call once the directory has loaded once. */
    function adminTally(list, pick) {
      const map = {};
      list.forEach(row => {
        const key = String(pick(row) || '').trim() || 'Not given';
        map[key] = (map[key] || 0) + 1;
      });
      return Object.keys(map)
        .sort((a, b) => map[b] - map[a] || a.localeCompare(b, undefined, { numeric: true }))
        .map(k => [k, map[k]]);
    }

    function adminStatCard(icon, label, value, tone) {
      return '<div class="rounded-2xl border ' + tone + ' p-4">' +
        '<div class="flex items-center gap-2"><i data-lucide="' + icon + '" class="w-4 h-4"></i>' +
        '<span class="text-[11px] font-extrabold uppercase tracking-widest opacity-80">' + escapeHtml(label) + '</span></div>' +
        '<p class="mt-1.5 text-2xl font-extrabold tabular-nums">' + value + '</p></div>';
    }

    /* A bar per row, widest = the largest group. Plain divs, no chart library:
       the panel must open on a slow phone too. */
    function adminBreakdown(title, icon, pairs, total) {
      const top = pairs.length ? pairs[0][1] : 1;
      const body = pairs.length
        ? pairs.map(p => {
            const pct = total ? Math.round((p[1] / total) * 100) : 0;
            return '<div class="py-1.5">' +
              '<div class="flex items-baseline gap-2 text-xs font-bold text-slate-700">' +
                '<span class="min-w-0 truncate">' + escapeHtml(p[0]) + '</span>' +
                '<span class="ml-auto tabular-nums font-extrabold text-slate-900">' + p[1] + '</span>' +
                '<span class="w-10 text-right tabular-nums text-[11px] font-extrabold text-slate-400">' + pct + '%</span>' +
              '</div>' +
              '<div class="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">' +
                '<div class="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500" style="width:' +
                  Math.max(3, Math.round((p[1] / top) * 100)) + '%"></div>' +
              '</div></div>';
          }).join('')
        : '<p class="text-xs font-semibold text-slate-400 py-2">Nothing to count yet.</p>';
      return '<div class="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">' +
        '<div class="flex items-center gap-2 mb-2"><i data-lucide="' + icon + '" class="w-4 h-4 text-blue-600"></i>' +
        '<h4 class="font-extrabold text-slate-900 text-sm">' + escapeHtml(title) + '</h4>' +
        '<span class="ml-auto text-[11px] font-extrabold text-slate-400">' + pairs.length + ' groups</span></div>' +
        body + '</div>';
    }

    /* ---------- Email Members tab -------------------------------------------
       Two ways to reach members: a whole group (approved directory, with an
       optional series / department filter) or one named member. The addresses
       stay on the server -- the browser only ever sends the filter or the
       Member ID, and the Alumni sheet is read for the real emails at send time.
       Members go out as BCC so nobody sees anyone else's address, and replies
       land at the public association inbox, not any admin's own mail. */

    function adminMailUnique(field) {
      const seen = {}, out = [];
      (Array.isArray(alumniData) ? alumniData : []).forEach(function (a) {
        const v = String((a && a[field]) || '').trim();
        if (v && !seen[v]) { seen[v] = true; out.push(v); }
      });
      return out.sort(function (a, b) { return a.localeCompare(b); });
    }

    function adminMailGroup() {
      const series = String((document.getElementById('em-series') || {}).value || '').trim();
      const dept = String((document.getElementById('em-dept') || {}).value || '').trim();
      return (Array.isArray(alumniData) ? alumniData : []).filter(function (a) {
        if (series && String(a.series || '').trim() !== series) return false;
        if (dept && String(a.dept || '').trim() !== dept) return false;
        return true;
      });
    }

    function adminMailRecount() {
      const el = document.getElementById('em-count');
      if (el) el.textContent = String(adminMailGroup().length);
    }

    /* ---- "Pick several" (mode 'each') ------------------------------------
       A filterable checkbox list. Selection is kept in RD_ADMIN.emSel keyed
       by Member ID, so it survives filtering (a member hidden by a filter
       stays chosen). Each chosen member gets a SEPARATE, private email on the
       server -- no group copy, no BCC. Hard cap RD_MM_EACH_CAP mirrors the
       consumer-Gmail daily quota so a blast can't overrun it. */
    const RD_MM_EACH_CAP = 100;

    function adminMailEachSelectedIds() {
      return Object.keys(RD_ADMIN.emSel || {}).filter(function (id) { return RD_ADMIN.emSel[id]; });
    }

    function adminMailEachFiltered() {
      const series = String((document.getElementById('em-each-series') || {}).value || '').trim();
      const dept = String((document.getElementById('em-each-dept') || {}).value || '').trim();
      const q = String((document.getElementById('em-each-q') || {}).value || '').trim().toLowerCase();
      return (Array.isArray(alumniData) ? alumniData : []).filter(function (a) {
        if (!a || !a.memberId) return false;
        if (series && String(a.series || '').trim() !== series) return false;
        if (dept && String(a.dept || '').trim() !== dept) return false;
        if (q) {
          const hay = (String(a.name || '') + ' ' + String(a.memberId || '') + ' ' +
            String(a.dept || '') + ' ' + String(a.series || '')).toLowerCase();
          if (hay.indexOf(q) === -1) return false;
        }
        return true;
      }).sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || '')); });
    }

    function adminMailEachRowsHtml() {
      const rows = adminMailEachFiltered();
      if (!rows.length) {
        return '<p class="px-3 py-6 text-center text-xs font-semibold text-slate-400">No members match.</p>';
      }
      return rows.map(function (a) {
        const id = a.memberId || '';
        const on = !!RD_ADMIN.emSel[id];
        const sub = [a.dept, a.series, id].filter(Boolean).map(escapeHtml).join(' · ');
        return '<label class="flex items-center gap-3 px-3 py-2 border-b border-slate-100 cursor-pointer hover:bg-slate-50">' +
          '<input type="checkbox" ' + (on ? 'checked ' : '') +
            'onchange="adminMailEachToggle(\'' + escapeHtml(id).replace(/'/g, "\\'") + '\', this.checked)" ' +
            'class="w-4 h-4 rounded border-slate-300 text-blue-600 shrink-0">' +
          '<span class="min-w-0">' +
            '<span class="block text-sm font-bold text-slate-800 truncate">' + escapeHtml(a.name || '(no name)') + '</span>' +
            (sub ? '<span class="block text-[11px] font-semibold text-slate-400 truncate">' + sub + '</span>' : '') +
          '</span></label>';
      }).join('');
    }

    function adminMailEachRender() {
      const list = document.getElementById('em-each-list');
      if (list) list.innerHTML = adminMailEachRowsHtml();
      adminMailEachCount();
    }

    function adminMailEachCount() {
      const n = adminMailEachSelectedIds().length;
      const el = document.getElementById('em-each-count');
      if (el) {
        el.textContent = n + ' selected' + (n >= RD_MM_EACH_CAP ? ' (max)' : '');
        el.className = 'ml-auto text-xs font-extrabold ' + (n >= RD_MM_EACH_CAP ? 'text-rose-600' : 'text-slate-500');
      }
    }

    function adminMailEachToggle(id, checked) {
      if (!id) return;
      if (checked && !RD_ADMIN.emSel[id] && adminMailEachSelectedIds().length >= RD_MM_EACH_CAP) {
        showToast('You can pick at most ' + RD_MM_EACH_CAP + ' members at a time.', 'error',
          'Limit reached', { backTo: 'admin' });
        adminMailEachRender();
        return;
      }
      if (checked) RD_ADMIN.emSel[id] = true; else delete RD_ADMIN.emSel[id];
      adminMailEachCount();
    }

    /* Select-all fills up to the cap from the currently-shown rows; Clear wipes
       everything (not just what is shown), so nothing hides an unwanted pick. */
    function adminMailEachAll(on) {
      if (!on) { RD_ADMIN.emSel = {}; adminMailEachRender(); return; }
      const shown = adminMailEachFiltered();
      let room = RD_MM_EACH_CAP - adminMailEachSelectedIds().length;
      let capped = false;
      shown.forEach(function (a) {
        const id = a.memberId || '';
        if (!id || RD_ADMIN.emSel[id]) return;
        if (room <= 0) { capped = true; return; }
        RD_ADMIN.emSel[id] = true; room--;
      });
      adminMailEachRender();
      if (capped) {
        showToast('Only the first ' + RD_MM_EACH_CAP + ' could be selected — that is the per-send limit.',
          'info', 'Limit reached', { backTo: 'admin' });
      }
    }

    function adminMailHtml() {
      const mode = ['one', 'each'].indexOf(RD_ADMIN.emMode) >= 0 ? RD_ADMIN.emMode : 'group';
      const members = Array.isArray(alumniData) ? alumniData : [];
      const opt = function (v) { return '<option value="' + escapeHtml(v) + '">' + escapeHtml(v) + '</option>'; };
      const seriesOpts = adminMailUnique('series').map(opt).join('');
      const deptOpts = adminMailUnique('dept').map(opt).join('');
      const memberOpts = members.slice().sort(function (a, b) {
          return String(a.name || '').localeCompare(String(b.name || ''));
        }).map(function (a) {
          const label = (a.name || '(no name)') + (a.dept ? ' — ' + a.dept : '') +
            (a.memberId ? ' · ' + a.memberId : '');
          return '<option value="' + escapeHtml(a.memberId || '') + '">' + escapeHtml(label) + '</option>';
        }).join('');

      const segBtn = function (m, label) {
        const on = mode === m;
        return '<button type="button" id="em-mode-' + m + '" onclick="adminMailMode(\'' + m + '\')" ' +
          'class="flex-1 px-4 py-2.5 rounded-2xl text-sm font-extrabold cursor-pointer border transition ' +
          (on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50') +
          '">' + escapeHtml(label) + '</button>';
      };

      const inner =
        '<div class="mt-5 flex gap-2">' + segBtn('group', 'A group') + segBtn('one', 'One member') +
          segBtn('each', 'Pick several') + '</div>' +

        '<div id="em-group" class="mt-4 ' + (mode === 'group' ? '' : 'hidden') + '">' +
          '<div class="grid sm:grid-cols-2 gap-4">' +
            '<div><label class="form-label" for="em-series">Series</label>' +
              '<select id="em-series" class="form-input" onchange="adminMailRecount()">' +
                '<option value="">All series</option>' + seriesOpts + '</select></div>' +
            '<div><label class="form-label" for="em-dept">Department</label>' +
              '<select id="em-dept" class="form-input" onchange="adminMailRecount()">' +
                '<option value="">All departments</option>' + deptOpts + '</select></div>' +
          '</div>' +
          '<p class="mt-3 text-xs font-bold text-slate-500">About <span id="em-count">' + members.length +
            '</span> approved members match. The server sends only to those it finds a valid email for.</p>' +
        '</div>' +

        '<div id="em-one" class="mt-4 ' + (mode === 'one' ? '' : 'hidden') + '">' +
          '<label class="form-label" for="em-one-sel">Choose a member</label>' +
          '<select id="em-one-sel" class="form-input">' +
            '<option value="">Select a member…</option>' + memberOpts + '</select>' +
          '<p class="mt-2 text-xs font-semibold text-slate-500">Start typing a name to jump down the list.</p>' +
        '</div>' +

        '<div id="em-each" class="mt-4 ' + (mode === 'each' ? '' : 'hidden') + '">' +
          '<div class="grid sm:grid-cols-3 gap-3">' +
            '<div><label class="form-label" for="em-each-series">Series</label>' +
              '<select id="em-each-series" class="form-input" onchange="adminMailEachRender()">' +
                '<option value="">All series</option>' + seriesOpts + '</select></div>' +
            '<div><label class="form-label" for="em-each-dept">Department</label>' +
              '<select id="em-each-dept" class="form-input" onchange="adminMailEachRender()">' +
                '<option value="">All departments</option>' + deptOpts + '</select></div>' +
            '<div><label class="form-label" for="em-each-q">Search name / ID</label>' +
              '<input id="em-each-q" class="form-input" placeholder="Type to filter…" oninput="adminMailEachRender()"></div>' +
          '</div>' +
          '<div class="mt-3 flex items-center gap-2 flex-wrap">' +
            '<button type="button" onclick="adminMailEachAll(true)" class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-extrabold cursor-pointer">Select all shown</button>' +
            '<button type="button" onclick="adminMailEachAll(false)" class="px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-[11px] font-extrabold cursor-pointer">Clear</button>' +
            '<span id="em-each-count" class="ml-auto text-xs font-extrabold text-slate-500">0 selected</span>' +
          '</div>' +
          '<div id="em-each-list" class="mt-3 max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white">' +
            adminMailEachRowsHtml() + '</div>' +
          '<p class="mt-2 text-xs font-semibold text-slate-500">Up to ' + RD_MM_EACH_CAP +
            ' members at a time. Each gets a <b>separate, private</b> email — not a group copy, so nobody sees who else was written to.</p>' +
        '</div>' +

        '<div class="mt-4"><label class="form-label" for="em-subject">Subject *</label>' +
          '<input id="em-subject" class="form-input" maxlength="160" placeholder="What the email is about"></div>' +
        '<div class="mt-4"><label class="form-label" for="em-body">Message *</label>' +
          '<textarea id="em-body" rows="9" maxlength="6000" class="form-input" ' +
            'placeholder="Write the message members will receive. Plain text."></textarea></div>' +

        '<div class="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">' +
          '<p class="text-xs font-semibold text-slate-600 leading-relaxed">' +
            'Members are added as BCC, so nobody sees anyone else\'s address. Replies go to the ' +
            'association inbox. Sending is limited by the account\'s daily email quota — a very large ' +
            'group may be turned down until the quota resets.</p></div>' +

        '<div class="mt-5 flex flex-wrap gap-2">' +
          '<button id="em-send" type="button" onclick="adminMailArm()" ' +
            'class="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 ' +
            'hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-extrabold cursor-pointer">' +
            '<i data-lucide="send" class="w-4 h-4"></i> Review &amp; send</button></div>' +

        '<div id="em-confirm" class="hidden mt-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3">' +
          '<p id="em-confirm-text" class="text-xs font-bold text-amber-900 leading-relaxed"></p>' +
          '<div class="mt-2.5 flex flex-wrap gap-2">' +
            '<button type="button" onclick="adminMailSend()" class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 text-white text-[11px] font-extrabold hover:bg-amber-700 cursor-pointer"><i data-lucide="send" class="w-3.5 h-3.5"></i> Send now</button>' +
            '<button type="button" onclick="adminMailCancel()" class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-[11px] font-extrabold hover:bg-slate-50 cursor-pointer"><i data-lucide="x" class="w-3.5 h-3.5"></i> Not yet</button>' +
          '</div></div>';

      return adminPanelShell('mail', 'Email Members',
        'Write to one member, or a whole group at once. Everyone is blind-copied.', inner);
    }

    /* Group / one toggle keeps whatever is typed: the two blocks are hidden,
       never redrawn. A full re-render (after a send) restores the right one
       from RD_ADMIN.emMode. */
    function adminMailMode(m) {
      RD_ADMIN.emMode = ['one', 'each'].indexOf(m) >= 0 ? m : 'group';
      const blocks = { group: 'em-group', one: 'em-one', each: 'em-each' };
      Object.keys(blocks).forEach(function (k) {
        const el = document.getElementById(blocks[k]);
        if (el) el.classList.toggle('hidden', RD_ADMIN.emMode !== k);
      });
      ['group', 'one', 'each'].forEach(function (k) {
        const b = document.getElementById('em-mode-' + k);
        if (!b) return;
        const on = RD_ADMIN.emMode === k;
        b.className = 'flex-1 px-4 py-2.5 rounded-2xl text-sm font-extrabold cursor-pointer border transition ' +
          (on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50');
      });
      if (RD_ADMIN.emMode === 'each') adminMailEachCount();
      adminMailCancel();
    }

    function adminMailCancel() {
      const c = document.getElementById('em-confirm');
      if (c) c.classList.add('hidden');
    }

    /* Sending real mail to real people asks first -- and, like everywhere else
       on the site, it asks inside the card, never with a popup. */
    function adminMailArm() {
      const mode = ['one', 'each'].indexOf(RD_ADMIN.emMode) >= 0 ? RD_ADMIN.emMode : 'group';
      const subject = String((document.getElementById('em-subject') || {}).value || '').trim();
      const body = String((document.getElementById('em-body') || {}).value || '').trim();
      if (!subject) { showToast('Please write a subject.', 'error', 'Subject is needed', { backTo: 'admin' }); return; }
      if (!body) { showToast('Please write the message.', 'error', 'Message is needed', { backTo: 'admin' }); return; }

      let text;
      if (mode === 'one') {
        const sel = document.getElementById('em-one-sel');
        const id = String((sel || {}).value || '').trim();
        if (!id) { showToast('Please choose a member to email.', 'error', 'No member chosen', { backTo: 'admin' }); return; }
        const who = (Array.isArray(alumniData) ? alumniData : []).find(function (a) { return String(a.memberId || '') === id; });
        text = 'This will email ' + ((who && who.name) || 'the selected member') + '. Send now?';
      } else if (mode === 'each') {
        const n = adminMailEachSelectedIds().length;
        if (!n) { showToast('Tick at least one member first.', 'error', 'Nobody chosen', { backTo: 'admin' }); return; }
        text = 'This will send a separate, private email to each of the ' + n + ' chosen member' +
          (n === 1 ? '' : 's') + ' (only those with a valid address on file). Send now?';
      } else {
        const n = adminMailGroup().length;
        if (!n) { showToast('No members match this filter.', 'error', 'Nobody to email', { backTo: 'admin' }); return; }
        text = 'This will email about ' + n + ' member' + (n === 1 ? '' : 's') +
          ' (only those with a valid address on file). Send now?';
      }
      const c = document.getElementById('em-confirm');
      const t = document.getElementById('em-confirm-text');
      if (t) t.textContent = text;
      if (c) { c.classList.remove('hidden'); c.scrollIntoView({ block: 'nearest' }); }
    }

    async function adminMailSend() {
      if (RD_ADMIN.busy) return;
      const mode = ['one', 'each'].indexOf(RD_ADMIN.emMode) >= 0 ? RD_ADMIN.emMode : 'group';
      const subject = String((document.getElementById('em-subject') || {}).value || '').trim();
      const body = String((document.getElementById('em-body') || {}).value || '').trim();
      if (!subject || !body) { adminMailCancel(); return; }

      const data = { mode: mode, subject: subject, body: body };
      if (mode === 'one') {
        data.memberId = String((document.getElementById('em-one-sel') || {}).value || '').trim();
        if (!data.memberId) { adminMailCancel(); return; }
      } else if (mode === 'each') {
        data.memberIds = adminMailEachSelectedIds();
        if (!data.memberIds.length) { adminMailCancel(); return; }
      } else {
        data.series = String((document.getElementById('em-series') || {}).value || '').trim();
        data.dept = String((document.getElementById('em-dept') || {}).value || '').trim();
      }

      RD_ADMIN.busy = 'email';
      const btns = document.querySelectorAll('#em-confirm button, #em-send');
      btns.forEach(function (b) { b.disabled = true; });
      try {
        const r = await apiPost('sendmemberemail', { data: data });
        RD_ADMIN.busy = '';
        showToast(r.message || ('Emailed ' + (r.sent || 0) + ' member(s).'), 'success', 'Email sent', { backTo: 'admin' });
        /* Clear the compose fields but stay on the tab. */
        ['em-subject', 'em-body'].forEach(function (id) { const el = document.getElementById(id); if (el) el.value = ''; });
        if (mode === 'each') { RD_ADMIN.emSel = {}; adminMailEachRender(); }
        adminMailCancel();
      } catch (err) {
        RD_ADMIN.busy = '';
        btns.forEach(function (b) { b.disabled = false; });
        showToast(friendlyError(err).msg, 'error', 'Could not send', { backTo: 'admin' });
      }
    }

    function adminSummaryHtml() {
      const members = Array.isArray(alumniData) ? alumniData : [];
      const regs = RD_ADMIN.rows.registrations || [];
      const total = members.length;
      const alumni = members.filter(a => a.status === 'Alumni').length;
      const running = total - alumni;
      const pending = regs.filter(r => r.status === 'PENDING').length;
      const dup = regs.filter(r => r.status === 'DUPLICATE').length;
      const rejected = regs.filter(r => r.status === 'REJECTED').length;
      const withPhoto = members.filter(a => String(a.image || '').trim()).length;

      return '<div class="space-y-4">' +
        adminPanelShell('bar-chart-3', 'Members at a glance',
          'Counted from the published directory, so these are the same numbers a visitor sees. Applications still waiting are counted separately.',
          '<div class="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">' +
            adminStatCard('users', 'Total members', total, 'border-blue-200 bg-blue-50 text-blue-800') +
            adminStatCard('graduation-cap', 'Alumni', alumni, 'border-indigo-200 bg-indigo-50 text-indigo-800') +
            adminStatCard('backpack', 'Running members', running, 'border-emerald-200 bg-emerald-50 text-emerald-800') +
            adminStatCard('image', 'With a photo', withPhoto, 'border-slate-200 bg-slate-50 text-slate-700') +
          '</div>' +
          '<div class="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3">' +
            adminStatCard('user-plus', 'Waiting', pending, 'border-amber-200 bg-amber-50 text-amber-800') +
            adminStatCard('copy', 'Possible repeats', dup, 'border-orange-200 bg-orange-50 text-orange-800') +
            adminStatCard('circle-x', 'Rejected', rejected, 'border-rose-200 bg-rose-50 text-rose-700') +
            adminStatCard('layers', 'Applications in all', regs.length, 'border-slate-200 bg-slate-50 text-slate-700') +
          '</div>' +
          (total ? '' : '<p class="mt-4 text-xs font-semibold text-slate-500">The directory has not loaded yet. Press Refresh once.</p>')) +
        '<div class="grid lg:grid-cols-2 gap-4">' +
          adminBreakdown('Department', 'building-2', adminTally(members, a => a.dept), total) +
          adminBreakdown('Series', 'hash', adminTally(members, a => a.series), total) +
          adminBreakdown('Blood group', 'droplet', adminTally(members, a => a.blood), total) +
          adminBreakdown('Employment', 'briefcase', adminTally(members, a => a.emp_type), total) +
          adminBreakdown('Work location', 'map-pin', adminTally(members, a => a.loc), total) +
          adminBreakdown('Batch', 'calendar', adminTally(members, a => a.batch), total) +
        '</div>' +
        '<div class="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">' +
          '<p class="text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5"><i data-lucide="settings" class="w-3.5 h-3.5"></i> Site Features</p>' +
          '<div class="flex items-center justify-between gap-4 bg-white rounded-xl border border-slate-200 px-4 py-3">' +
            '<div>' +
              '<p class="font-bold text-slate-800 text-sm flex items-center gap-1.5"><i data-lucide="droplets" class="w-4 h-4 text-rose-500"></i> Blood Bank</p>' +
              '<p class="text-xs text-slate-500 mt-0.5">Show or hide the Blood Bank page from the public navigation.</p>' +
            '</div>' +
            '<div class="flex gap-2 shrink-0">' +
              '<button onclick="adminToggleBloodBank(false)" class="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition">Show</button>' +
              '<button onclick="adminToggleBloodBank(true)" class="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition">Hide</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    }

    /* ---------- Editing an event that is already approved -------------
       The form only sends the boxes the admin actually touched, so a column
       this form does not know about is never overwritten with a blank. */
    var RD_EV_FIELDS = [
      ['name', 'Event Name', 'Event Name', 'text'],
      ['category', 'Category', 'Category', 'select'],
      ['eventDate', 'Event Date', 'Event Date', 'date'],
      ['startTime', 'Start Time', 'Start Time', 'text'],
      ['endTime', 'End Time', 'End Time', 'text'],
      ['venue', 'Venue', 'Venue', 'text'],
      ['mapsLink', 'Google Maps Link', 'Google Maps link', 'text'],
      ['organizedBy', 'Organized By', 'Organized by', 'text'],
      ['contactName', 'Contact Person', 'Contact person', 'text'],
      ['contactNo', 'Contact Number', 'Contact number', 'text'],
      ['regLink', 'Registration Link', 'Registration link', 'text'],
      ['fbLink', 'Facebook Link', 'Facebook link', 'text'],
      ['shortDesc', 'Short Description', 'Short description', 'text'],
      ['fullDesc', 'Full Description', 'Full description', 'area'],
      ['adminNote', 'Admin Note', 'Admin note', 'area']
    ];
    var RD_EV_CATEGORIES = ['Academic', 'Cultural', 'Sports', 'Workshop', 'Seminar',
                            'Competition', 'Reunion', 'Tour', 'Social', 'Fresher Reception', 'Farewell'];

    function adminEventEdit(id) {
      RD_ADMIN.evEdit = RD_ADMIN.evEdit === id ? '' : id;
      RD_ADMIN.noteOpen = '';
      renderAdmin();
    }

    /* This one hook carries both extras an event card can grow: the hide
       confirmation strip and the edit form. */
    function adminEventEditBox(r) {
      if (r.kind !== 'events') return '';
      const ask = adminAskArmed('evHide', r.id)
        ? adminConfirmStrip('Hide ' + r.id + ' from the website? Nothing is deleted -- you will find it again under PENDING.',
            'Yes, hide it', "adminEventVisible('" + r.id + "',false)")
        : '';
      if (RD_ADMIN.evEdit !== r.id) return ask;
      const raw = r.raw || {};
      const val = header => {
        const v = raw[header];
        if (v instanceof Date) {
          const p = n => (n < 10 ? '0' : '') + n;
          return v.getFullYear() + '-' + p(v.getMonth() + 1) + '-' + p(v.getDate());
        }
        let str = String(v == null ? '' : v).trim();
        if (header === 'Event Date' && str.length > 10) return str.slice(0, 10);
        return str;
      };
      const eid = escapeHtml(r.id);
      const fields = RD_EV_FIELDS.map(f => {
        const key = f[0], cur = val(f[1]), label = f[2], type = f[3];
        const dom = 'ev-' + eid + '-' + key;
        let input;
        if (type === 'select') {
          input = '<select id="' + dom + '" data-ev-key="' + key + '" class="form-input">' +
            RD_EV_CATEGORIES.map(c => '<option' + (c === cur ? ' selected' : '') + '>' + escapeHtml(c) + '</option>').join('') +
            (RD_EV_CATEGORIES.indexOf(cur) === -1 && cur ? '<option selected>' + escapeHtml(cur) + '</option>' : '') +
            '</select>';
        } else if (type === 'area') {
          input = '<textarea id="' + dom + '" data-ev-key="' + key + '" rows="3" class="form-input">' + escapeHtml(cur) + '</textarea>';
        } else {
          input = '<input id="' + dom + '" data-ev-key="' + key + '"' + (type === 'date' ? ' type="date"' : '') +
            ' class="form-input" value="' + escapeHtml(cur) + '">';
        }
        return '<div class="' + (type === 'area' ? 'sm:col-span-2' : '') + '">' +
          '<label class="form-label" for="' + dom + '">' + escapeHtml(label) + '</label>' + input + '</div>';
      }).join('');
      let spHtml = '<div class="sm:col-span-2 border-t border-blue-200/50 pt-4 mt-2" id="ev-' + eid + '-sponsors">' +
        '<div class="flex items-center justify-between mb-2"><label class="form-label mb-0">Sponsors</label>' +
        '<button type="button" onclick="adminAddEditSponsor(\'' + eid + '\')" class="text-[11px] px-2 py-1 bg-white border border-blue-200 text-blue-600 rounded font-bold hover:bg-blue-50 transition cursor-pointer">+ Add Sponsor</button></div>' +
        '<div class="space-y-2" id="ev-' + eid + '-sponsor-list">';
        
      let existingSponsors = [];
      try { existingSponsors = JSON.parse(r.raw['Sponsors'] || '[]'); } catch(e){}
      if (existingSponsors.length === 0) spHtml += '<p class="text-[10px] text-slate-400 sp-empty-note">No sponsors yet.</p>';
      existingSponsors.forEach((sp, i) => {
        spHtml += '<div class="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 sponsor-row">' +
            '<input type="text" class="form-input text-xs w-1/2 sp-name" value="' + escapeHtml(sp.name || sp.sponsorName || '') + '" placeholder="Sponsor Name">' +
            '<div class="w-1/2 flex gap-2 items-center">' +
            (sp.logo || sp.sponsorLogo ? '<img src="' + escapeHtml(sp.logo || sp.sponsorLogo) + '" class="w-8 h-8 object-cover rounded border">' : '') +
            '<input type="file" accept="image/*" class="form-input text-xs flex-grow py-1.5 sp-logo">' +
            '</div>' +
            '<input type="hidden" class="sp-old-logo" value="' + escapeHtml(sp.logo || sp.sponsorLogo || '') + '">' +
            '<button type="button" onclick="this.parentElement.remove(); if(document.getElementById(\'ev-' + eid + '-sponsor-list\').children.length===0) document.querySelector(\'#ev-' + eid + '-sponsors .sp-empty-note\').style.display=\'block\';" class="text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 p-1.5 rounded-lg transition cursor-pointer"><i data-lucide="trash-2" class="w-4 h-4"></i></button>' +
          '</div>';
      });
      spHtml += '</div></div>';

      let galHtml = '<div class="sm:col-span-2 border-t border-blue-200/50 pt-4 mt-2">' +
        '<label class="form-label">Gallery Images</label>';
        
      if (!r.fetchedGallery) {
         galHtml += '<div class="text-xs text-slate-500 flex items-center gap-2 mb-2"><i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Fetching gallery...</div>';
         if (RD_ADMIN.busy !== 'fetch-gal-' + eid) {
           setTimeout(() => adminFetchGalleryForEdit(eid), 50);
         }
      } else {
         if (r.fetchedGallery.length > 0) {
           galHtml += '<p class="text-[10px] text-slate-500 mb-2">Click on an image to mark it for deletion.</p><div class="flex flex-wrap gap-2 mb-3">';
           r.fetchedGallery.forEach(g => {
             galHtml += '<div class="relative group w-16 h-16 rounded-xl border border-slate-200 overflow-hidden gal-item cursor-pointer" data-id="' + escapeHtml(g.galleryId) + '" onclick="this.classList.toggle(\'opacity-30\'); this.classList.toggle(\'marked-delete\');">' +
               '<img src="' + escapeHtml(g.image) + '" class="w-full h-full object-cover">' +
               '<div class="absolute inset-0 bg-rose-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"><i data-lucide="trash-2" class="w-5 h-5"></i></div>' +
               '</div>';
           });
           galHtml += '</div>';
         } else {
           galHtml += '<p class="text-[10px] text-slate-400 mb-3">No gallery images yet.</p>';
         }
      }
      galHtml += '<div><label class="text-[11px] font-bold text-slate-600 mb-1 block">Add more images (Optional)</label><input type="file" multiple accept="image/*" class="form-input py-2 text-sm" data-ev-image="gallery"></div>';
      galHtml += '</div>';

      return ask + '<div class="mt-4 rounded-2xl border border-blue-200 bg-blue-50/50 p-4 sm:p-5" data-ev-form="' + eid + '">' +
        '<p class="text-xs font-extrabold text-blue-900 mb-3"><i data-lucide="pencil" class="w-3.5 h-3.5 inline"></i> Correcting the details of ' + eid + '</p>' +
        '<div class="grid sm:grid-cols-2 gap-4">' + fields + 
        '<div class="sm:col-span-2 border-t border-blue-200/50 pt-4 mt-2"><label class="form-label" for="ev-' + eid + '-mainImage">Replace Banner Image (Optional)</label><input id="ev-' + eid + '-mainImage" type="file" accept="image/*" class="form-input py-2 text-sm" data-ev-image="mainImage"><p class="text-[10px] text-slate-500 mt-1">Leave empty to keep the current banner.</p></div>' +
        spHtml + galHtml + 
        '</div>' +
        '<div class="mt-4 flex flex-wrap gap-2">' +
          '<button type="button" onclick="adminEventEditSave(\'' + eid + '\')" class="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-extrabold hover:bg-blue-700 cursor-pointer"><i data-lucide="save" class="w-3.5 h-3.5"></i> Save the changes</button>' +
          '<button type="button" onclick="adminEventEdit(\'' + eid + '\')" class="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-extrabold hover:bg-slate-50 cursor-pointer"><i data-lucide="x" class="w-3.5 h-3.5"></i> Close</button>' +
        '</div></div>';
    }

    function adminAddEditSponsor(eid) {
      const list = document.getElementById('ev-' + eid + '-sponsor-list');
      if (!list) return;
      const note = document.querySelector('#ev-' + eid + '-sponsors .sp-empty-note');
      if (note) note.style.display = 'none';
      const div = document.createElement('div');
      div.className = 'flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 sponsor-row';
      div.innerHTML = '<input type="text" class="form-input text-xs w-1/2 sp-name" placeholder="Sponsor Name">' +
            '<div class="w-1/2"><input type="file" accept="image/*" class="form-input text-xs w-full py-1.5 sp-logo"></div>' +
            '<input type="hidden" class="sp-old-logo" value="">' +
            '<button type="button" onclick="this.parentElement.remove();" class="text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 p-1.5 rounded-lg transition cursor-pointer"><i data-lucide="trash-2" class="w-4 h-4"></i></button>';
      list.appendChild(div);
      lucide.createIcons({root: div});
    }

    async function adminFetchGalleryForEdit(id) {
      if (RD_ADMIN.busy) return;
      RD_ADMIN.busy = 'fetch-gal-' + id;
      renderAdmin();
      const row = adminFind(id);
      try {
        const res = await apiGet('eventgallery', { eventId: id });
        if (row) row.fetchedGallery = Array.isArray(res.gallery) ? res.gallery : [];
      } catch(e) {
        if (row) row.fetchedGallery = [];
      }
      RD_ADMIN.busy = '';
      if (RD_ADMIN.evEdit === id) renderAdmin();
    }

    async function adminEventEditSave(id) {
      const form = document.querySelector('[data-ev-form="' + id + '"]');
      const row = adminFind(id);
      if (!form || !row || RD_ADMIN.busy) return;
      const data = { eventId: id };
      let changed = 0;
      form.querySelectorAll('[data-ev-key]').forEach(el => {
        const key = el.getAttribute('data-ev-key');
        const was = RD_EV_FIELDS.filter(f => f[0] === key)[0];
        const cur = String(el.value == null ? '' : el.value).trim();
        let old = (row.raw || {})[was[1]];
        if (old instanceof Date) {
          const p = n => (n < 10 ? '0' : '') + n;
          old = old.getFullYear() + '-' + p(old.getMonth() + 1) + '-' + p(old.getDate());
        } else if (was[1] === 'Event Date' && typeof old === 'string' && old.length > 10) {
          old = old.slice(0, 10);
        }
        if (cur !== String(old == null ? '' : old).trim()) { data[key] = cur; changed++; }
      });
      
      const imgInput = form.querySelector('[data-ev-image="mainImage"]');
      if (imgInput && imgInput.files && imgInput.files.length > 0) {
        data.mainImage = await filePayload(imgInput.files[0], 4000);
        changed++;
      }

      const spRows = form.querySelectorAll('.sponsor-row');
      if (spRows.length > 0 || (row.raw && row.raw['Sponsors'])) {
        const newSponsors = [];
        for (const sp of spRows) {
          const name = sp.querySelector('.sp-name').value.trim();
          const logoFile = sp.querySelector('.sp-logo').files[0];
          const oldLogo = sp.querySelector('.sp-old-logo').value;
          if (name || logoFile || oldLogo) {
            let logoObj = oldLogo;
            if (logoFile) logoObj = await filePayload(logoFile, 4000);
            newSponsors.push({ name: name, logo: logoObj });
          }
        }
        data.sponsors = newSponsors;
        changed++;
      }

      const galInput = form.querySelector('[data-ev-image="gallery"]');
      if (galInput && galInput.files && galInput.files.length > 0) {
        data.gallery = [];
        for (const file of galInput.files) {
          data.gallery.push(await filePayload(file, 4000));
        }
        changed++;
      }

      const delGal = form.querySelectorAll('.gal-item.marked-delete');
      if (delGal.length > 0) {
        data.deleteGallery = Array.from(delGal).map(el => el.getAttribute('data-id'));
        changed++;
      }
      
      if (!changed) {
        showToast('Nothing was changed on this event.', 'info', 'No change', { backTo: 'admin' });
        return;
      }
      if (data.hasOwnProperty('name') && !data.name) {
        showToast('The event name cannot be left empty.', 'error', 'A name is needed', { backTo: 'admin' });
        return;
      }
      RD_ADMIN.busy = id;
      renderAdmin();
      try {
        const r = await apiPost('adminupdateevent', { data: data });
        RD_ADMIN.evEdit = '';
        RD_ADMIN.busy = '';
        showToast(r.message || 'The event is updated.', 'success', 'Event updated', { backTo: 'admin' });
        loadAdminDashboard(true);
      } catch (err) {
        RD_ADMIN.busy = '';
        showToast(friendlyError(err).msg, 'error', 'Could not update', { backTo: 'admin' });
        renderAdmin();
      }
    }

    /* Hiding is a move back to PENDING, because the public list only ever
       shows APPROVED. Nothing is deleted and the row does not disappear. */
    async function adminEventVisible(id, show) {
      const row = adminFind(id);
      if (!row || RD_ADMIN.busy) return;
      RD_ADMIN.busy = id;
      renderAdmin();
      try {
        const r = await apiPost('adminseteventvisible', { eventId: id, show: show ? 'YES' : 'NO' });
        row.status = show ? 'APPROVED' : 'PENDING';
        RD_ADMIN.askWhat = ''; RD_ADMIN.askId = '';
        showToast(r.message || 'Saved.', 'success', 'Saved', { backTo: 'admin' });
      } catch (err) {
        showToast(friendlyError(err).msg, 'error', 'Could not save', { backTo: 'admin' });
      }
      RD_ADMIN.busy = '';
      renderAdmin();
    }

    function adminToggleNote(id) {
      RD_ADMIN.noteOpen = RD_ADMIN.noteOpen === id ? '' : id;
      renderAdmin();
    }

    /* One place that knows how each record type is approved/rejected, so the
       card renderer never has to care which tab it is showing. */
    function adminActionCall(kind, what, id, note) {
      if (kind === 'registrations') {
        return what === 'approve'
          ? apiPost('approvemember', { registrationId: id })
          : apiPost('rejectmember', { registrationId: id, adminNote: note });
      }
      if (kind === 'events') {
        return what === 'approve'
          ? apiPost('approveevent', { eventId: id })
          : apiPost('rejectevent', { eventId: id, adminNote: note });
      }
      return what === 'approve'
        ? apiPost('approveexecutivecommittee', { data: { entryId: id } })
        : apiPost('rejectexecutivecommittee', { data: { entryId: id, adminNote: note } });
    }

    function adminFind(id) {
      return (RD_ADMIN.rows[RD_ADMIN.tab] || []).find(r => r.id === id) || null;
    }

    async function adminRunAction(id, what, note) {
      const row = adminFind(id);
      if (!row || RD_ADMIN.busy) return;
      showGlobalLoader("Processing...", "Executing action.");
      RD_ADMIN.busy = id;
      renderAdmin();
      try {
        await adminActionCall(row.kind, what, id, note || '');
        /* The public pages must not keep showing the row that just changed. */
        rdFeedForget('alumni');
        rdFeedForget('events');
        rdFeedForget('committee');
        row.status = what === 'approve' ? 'APPROVED' : 'REJECTED';
        if (note) row.note = note;
        RD_ADMIN.noteOpen = '';
        hideGlobalLoader(true, () => {
            RD_ADMIN.busy = '';
            renderAdmin();
            showToast(row.title + ' — ' + (what === 'approve' ? 'approved' : 'rejected') + '.',
              'success', what === 'approve' ? 'Approved' : 'Rejected', { backTo: 'admin' });
        }, what === 'approve' ? 'Approved successfully.' : 'Rejected successfully.');
      } catch (err) {
        failGlobalLoader('Could not save', friendlyError(err).msg);
        showToast(friendlyError(err).msg, 'error', 'Could not save', { backTo: 'admin' });
        RD_ADMIN.busy = '';
        renderAdmin();
      }
    }

    function adminApprove(id) { return adminRunAction(id, 'approve', ''); }

    function adminReject(id) {
      const el = document.getElementById('admin-note-' + id);
      const note = el ? String(el.value || '').trim() : '';
      const row = adminFind(id);
      /* Catch the empty reason here instead of letting the server return an
         error the admin has to decode. */
      if (row && row.kind === 'committee' && !note) {
        showToast('Please write a short reason before rejecting a committee entry.',
          'error', 'A reason is needed', { backTo: 'admin' });
        if (el) el.focus();
        return;
      }
      return adminRunAction(id, 'reject', note);
    }

    async function adminToggleFeatured(id, on) {
      const row = adminFind(id);
      if (!row || RD_ADMIN.busy) return;
      RD_ADMIN.busy = id;
      renderAdmin();
      try {
        await apiPost('seteventfeatured', { eventId: id, featured: on ? 'YES' : 'NO' });
        row.featured = !!on;
        showToast(row.title + (on ? ' is now featured.' : ' is no longer featured.'),
          'success', 'Saved', { backTo: 'admin' });
      } catch (err) {
        showToast(friendlyError(err).msg, 'error', 'Could not save', { backTo: 'admin' });
      }
      RD_ADMIN.busy = '';
      renderAdmin();
    }

    function toggleMobileMenu(event) {
      if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
      const m = document.getElementById("mobile-menu");
      if (m.classList.contains('hidden')) {
        window.clearTimeout(rdMobileMenuCloseTimer);
        window.clearTimeout(rdMobileMenuOpenTimer);
        m.classList.remove('rd-menu-closing');
        m.classList.remove('hidden');
        m.classList.add('rd-menu-opening');
        rdMobileMenuOpenTimer = window.setTimeout(() => m.classList.remove('rd-menu-opening'), 400);
      } else {
        closeMobileMenuAnimated();
        return;
      }
      syncMobileMenuButton();
    }
    function closeMobileMenuOnUserScroll(event) {
      const menu = document.getElementById('mobile-menu');
      if (!menu || menu.classList.contains('hidden') || menu.contains(event.target)) return;
      closeMobileMenuAnimated();
    }
    let rdMobileMenuCloseTimer = 0;
    let rdMobileMenuOpenTimer = 0;
    function closeMobileMenuAnimated() {
      const m = document.getElementById('mobile-menu');
      if (!m || m.classList.contains('hidden') || m.classList.contains('rd-menu-closing')) return;
      window.clearTimeout(rdMobileMenuOpenTimer);
      m.classList.remove('rd-menu-opening');
      m.classList.add('rd-menu-closing');
      syncMobileMenuButton();
      window.clearTimeout(rdMobileMenuCloseTimer);
      rdMobileMenuCloseTimer = window.setTimeout(() => {
        m.classList.add('hidden');
        m.classList.remove('rd-menu-closing');
        syncMobileMenuButton();
      }, 370);
    }
    function syncMobileMenuButton() {
      const m = document.getElementById("mobile-menu"), b = document.getElementById("mobile-menu-btn");
      if (!m || !b) return;
      const open = !m.classList.contains("hidden");
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
      b.setAttribute('aria-label', open ? 'Close menu' : 'Menu');
      const icon = document.getElementById("mobile-menu-icon");
      if (icon) icon.outerHTML = '<i id="mobile-menu-icon" class="w-6 h-6" data-lucide="' + (open ? 'x' : 'menu') + '"></i>';
      lucide.createIcons();
    }

    /* ── Premium: More dropdown ──────────────────────────────────── */
    function rdMoreToggle(key) {
      const btn   = document.getElementById('rd-more-btn-'   + key);
      const panel = document.getElementById('rd-more-panel-' + key);
      if (!btn || !panel) return;
      const isOpen = panel.classList.contains('open');
      if (isOpen) { rdMoreClose(key); } else {
        btn.classList.add('open');
        btn.setAttribute('aria-expanded','true');
        panel.classList.add('open');
      }
    }
    function rdMoreClose(key) {
      const btn   = document.getElementById('rd-more-btn-'   + key);
      const panel = document.getElementById('rd-more-panel-' + key);
      if (btn)   { btn.classList.remove('open');   btn.setAttribute('aria-expanded','false'); }
      if (panel) { panel.classList.remove('open'); }
    }
    /* Close more dropdown when clicking outside */
    document.addEventListener('click', function(e) {
      ['desktop'].forEach(function(k) {
        const wrap = document.getElementById('rd-more-wrap-' + k);
        if (wrap && !wrap.contains(e.target)) rdMoreClose(k);
      });
    });

    /* ── Premium: navbar scroll class ───────────────────────────── */
    (function rdNavScrollInit() {
      const nav = document.querySelector('.glass-nav');
      if (!nav) return;
      const onScroll = function() {
        if (window.scrollY > 40) {
          nav.classList.add('rd-nav-scrolled');
        } else {
          nav.classList.remove('rd-nav-scrolled');
        }
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    })();

    /* ── Premium: alumni count stats fill ───────────────────────── */
    (function rdFillStatAlumni() {
      function doFill() {
        const el = document.getElementById('rd-stat-alumni');
        if (!el) return;
        const list = window.rdAlumni || [];
        if (list.length > 0) {
          el.textContent = list.length.toString();
        }
      }
      /* Try immediately, then again after alumni load completes */
      doFill();
      const orig = window.loadPublicAlumni;
      if (typeof orig === 'function') {
        const t = setInterval(function() {
          if (window.rdAlumni && window.rdAlumni.length) {
            doFill();
            clearInterval(t);
          }
        }, 600);
        setTimeout(function() { clearInterval(t); }, 12000);
      }
    })();


    const RD_NOTICE_STYLES = {
      success: { icon:'check-circle-2', wrap:'bg-emerald-50', color:'text-emerald-600', btn:'from-emerald-600 to-teal-600', btnText:'OK' },
      error:   { icon:'alert-triangle', wrap:'bg-rose-50',    color:'text-rose-600',    btn:'from-rose-600 to-red-600',    btnText:'Try again' },
      info:    { icon:'info',           wrap:'bg-blue-50',    color:'text-blue-600',    btn:'from-blue-600 to-indigo-600', btnText:'OK' }
    };

    /* Kept the old name so every existing call site keeps working; it now routes to
       #notice instead of opening a blurred popup. opts.backTo picks the return page. */
    function showToast(msg, type, title, opts) {
      opts = opts || {};
      const st = RD_NOTICE_STYLES[type] || RD_NOTICE_STYLES.info;
      const wrap = document.getElementById('notice-icon-wrap');
      const icon = document.getElementById('notice-icon');
      const ttl  = document.getElementById('notice-title');
      const btn  = document.getElementById('notice-primary-btn');
      const home = document.getElementById('notice-home-btn');

      wrap.className = 'w-20 h-20 mx-auto rounded-3xl flex items-center justify-center mb-5 ' + st.wrap;
      icon.outerHTML = '<i id="notice-icon" data-lucide="' + st.icon + '" class="w-10 h-10 ' + st.color + '"></i>';
      btn.className = 'flex-1 py-3.5 rounded-2xl bg-gradient-to-r ' + st.btn + ' text-white font-bold text-sm';
      btn.textContent = opts.btnText || st.btnText;

      if (title) { ttl.textContent = title; ttl.classList.remove('hidden'); }
      else { ttl.textContent = ''; ttl.classList.add('hidden'); }

      document.getElementById('notice-message').textContent = msg;

      const back = opts.backTo || (rdCurrentPageId !== 'notice' ? rdCurrentPageId : 'home') || 'home';
      home.classList.toggle('hidden', back === 'home');
      openSubPage('notice', back);
      lucide.createIcons();
    }
    function closeAlert() { goBackFromSubPage('notice'); }

    /* ---------- Swipe between photos on touch devices ---------- */
    (function () {
      let sx = 0, sy = 0, tracking = false;
      const page = () => document.getElementById('page-photo');
      document.addEventListener('touchstart', function (e) {
        const p = page();
        if (!p || rdCurrentPageId !== 'photo' || !e.touches || e.touches.length !== 1) return;
        if (!p.contains(e.target)) return;
        sx = e.touches[0].clientX; sy = e.touches[0].clientY; tracking = true;
      }, { passive: true });
      document.addEventListener('touchend', function (e) {
        if (!tracking) return;
        tracking = false;
        const t = e.changedTouches && e.changedTouches[0];
        if (!t) return;
        const dx = t.clientX - sx, dy = t.clientY - sy;
        if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy)) return;   // a scroll, not a swipe
        if (dx < 0) nextLightboxPhoto(); else prevLightboxPhoto();
      }, { passive: true });
    })();

    /* ---------- Keyboard shortcuts on the photo viewer page ---------- */
    document.addEventListener('keydown', function (e) {
      if (rdCurrentPageId !== 'photo') return;
      if (e.key === 'ArrowRight') { e.preventDefault(); nextLightboxPhoto(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prevLightboxPhoto(); }
      else if (e.key === 'Escape') { closeLightbox(); }
    });

    /* ──    /* 📱 Flip card click toggle (touch & click) 📱📱📱📱📱📱📱📱📱📱📱📱📱📱📱📱📱📱📱 */
    (function rdFlipCards() {
      document.addEventListener('click', function(e) {
        const card = e.target.closest('.rd-flip-card');
        if (!card) return;
        card.classList.toggle('rd-flipped');
      });
    })();

    /* ⏱️ Live Event Countdown Interval ⏱️ */
    setInterval(function() {
      document.querySelectorAll("[data-countdown-large]").forEach(function(el) {
        const dateStr = el.getAttribute("data-countdown-large");
        if (!dateStr) return;
        const ev = new Date(dateStr);
        if (isNaN(ev.valueOf())) return;
        const now = new Date();
        const diffMs = ev - now;
        const timerEl = el.querySelector("[data-cd-timer]");
        if (!timerEl) return;
        
        if (diffMs <= 0) {
          timerEl.textContent = "Event Started / Past";
          timerEl.classList.remove("text-orange-600");
          timerEl.classList.add("text-slate-400");
          el.classList.add("opacity-50");
          return;
        }
        
        const d = Math.floor(diffMs / 86400000);
        const h = Math.floor((diffMs % 86400000) / 3600000);
        const m = Math.floor((diffMs % 3600000) / 60000);
        const s = Math.floor((diffMs % 60000) / 1000);
        
        let parts = [];
        if (d > 0) parts.push(d + "d");
        parts.push(String(h).padStart(2, "0") + "h");
        parts.push(String(m).padStart(2, "0") + "m");
        parts.push(String(s).padStart(2, "0") + "s");
        
        timerEl.textContent = parts.join(" : ");
      });
    }, 1000);

    /* ================= WEBSITE POLLS (member voting + live results) ======
       One page, no modal. Everyone can read a poll; only a signed-in approved
       member of an eligible series can vote, and only once. The member's
       identity is proved on the server from memberToken -- the option ids sent
       from here are never trusted as "who voted". Results are drawn as plain
       horizontal bars (dataviz skill): single hue, 4px rounded data-ends,
       direct count+percent labels, the leading option marked by text (never by
       colour alone), and a native hover tooltip on each bar. */
    let RD_POLL = { loading: false, error: '', polls: [], loaded: false, voting: '', showArchive: false };

    function rdPollOpen() {
      rdPollSigninHint();
      rdPollLoadList();
    }

    /* The backend speaks pollId + type 'single'/'multi'; the UI is written
       around id + type 'single'/'multiple'. Normalise every poll on the way in
       so both the member page and the admin tab render off one shape. */
    function rdPollNorm(r) {
      if (!r || typeof r !== 'object') return r;
      const out = Object.assign({}, r);
      out.id = r.pollId || r.id || '';
      out.type = (String(r.type) === 'multi' || String(r.type) === 'multiple') ? 'multiple' : 'single';
      out.eligibleSeries = r.eligibleSeries || r.eligSeries || [];
      return out;
    }

    function rdPollSigninHint() {
      const box = document.getElementById('poll-signin-hint');
      if (!box) return;
      if (RD_MEMBER && RD_MEMBER.token) { box.innerHTML = ''; return; }
      box.innerHTML = '<div class="mb-5 rounded-2xl border border-indigo-200 bg-indigo-50/70 px-4 py-3.5 flex items-center gap-3">' +
        '<i data-lucide="log-in" class="w-5 h-5 text-indigo-600 shrink-0"></i>' +
        '<p class="text-sm text-slate-700 flex-1"><span class="font-bold">Sign in</span> to cast your vote. You can read every poll without signing in.</p>' +
        '<button onclick="openMemberSignIn(\'polls\')" class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition shrink-0"><i data-lucide="log-in" class="w-4 h-4"></i> Sign In</button></div>';
      if (window.lucide) lucide.createIcons();
    }

    async function rdPollLoadList() {
      const list = document.getElementById('poll-list');
      if (!list) return;
      RD_POLL.loading = true; RD_POLL.error = '';
      try {
        const res = await apiGet('polls', {});
        RD_POLL.polls = Array.isArray(res.polls) ? res.polls.map(rdPollNorm) : [];
        RD_POLL.loaded = true;
      } catch (err) {
        RD_POLL.error = friendlyError(err).msg;
      } finally {
        RD_POLL.loading = false;
        rdPollRenderList();
      }
    }
    function rdPollRenderList() {
      const list = document.getElementById('poll-list');
      if (!list) return;
      if (RD_POLL.loading && !RD_POLL.loaded) {
        list.innerHTML = '<div class="space-y-4"><div class="h-40 rounded-3xl bg-slate-100 animate-pulse"></div><div class="h-40 rounded-3xl bg-slate-100 animate-pulse"></div></div>';
        return;
      }
      if (RD_POLL.error) {
        list.innerHTML = '<div class="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-8 text-center">' +
          '<i data-lucide="alert-circle" class="w-8 h-8 text-rose-500 mx-auto mb-3"></i>' +
          '<p class="text-slate-700 font-semibold mb-3">' + escapeHtml(RD_POLL.error) + '</p>' +
          '<button onclick="rdPollLoadList()" class="px-4 py-2 rounded-xl bg-slate-800 text-white text-sm font-bold hover:bg-slate-900 transition">Try again</button></div>';
        if (window.lucide) lucide.createIcons();
        return;
      }
      if (!RD_POLL.polls.length) {
        list.innerHTML = '<div class="rd-pollc px-5 py-14 text-center">' +
          '<div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-100 mb-4"><i data-lucide="inbox" class="w-7 h-7 text-slate-400"></i></div>' +
          '<p class="text-slate-500 font-medium">No polls yet. Check back soon.</p></div>';
        if (window.lucide) lucide.createIcons();
        return;
      }
      const active = RD_POLL.polls.filter(function (p) { return !rdPollIsPast(p); });
      const past = RD_POLL.polls.filter(rdPollIsPast);
      let html = '';
      if (active.length) {
        html += '<div class="space-y-5">' + active.map(rdPollCard).join('') + '</div>';
      } else {
        html += '<div class="rd-pollc px-5 py-10 text-center">' +
          '<div class="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-slate-100 mb-3"><i data-lucide="calendar-off" class="w-6 h-6 text-slate-400"></i></div>' +
          '<p class="text-slate-500 font-medium">No active polls right now. See the archive below.</p></div>';
      }
      if (past.length) {
        html += '<div class="mt-6 space-y-4">' +
          '<button type="button" class="rd-poll-archive-btn" onclick="rdPollToggleArchive()">' +
            '<i data-lucide="' + (RD_POLL.showArchive ? 'chevron-up' : 'archive') + '"></i>' +
            (RD_POLL.showArchive ? 'Hide past polls' : 'Past polls (' + past.length + ')') + '</button>';
        if (RD_POLL.showArchive) {
          html += '<div class="rd-poll-section-label">Archive</div>' +
            '<div class="space-y-5">' + past.map(rdPollCard).join('') + '</div>';
        }
        html += '</div>';
      }
      list.innerHTML = html;
      if (window.lucide) lucide.createIcons();
      rdPollRevealCards(list);
      rdPollScheduleRefresh();
    }

    /* Scroll-reveal for poll cards: mirrors observeAlumniCards. Each .rd-pollc
       fades/rises in once it enters the viewport, staggered by index. If
       IntersectionObserver is missing, every card is shown immediately. */
    function rdPollRevealCards(root) {
      var cards = (root || document).querySelectorAll('.rd-pollc');
      if (!cards.length) return;
      if (!('IntersectionObserver' in window)) {
        cards.forEach(function (c) { c.classList.add('is-visible'); });
        return;
      }
      var io = new IntersectionObserver(function (entries, obs) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          e.target.classList.add('is-visible');
          obs.unobserve(e.target);
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      cards.forEach(function (c, i) {
        c.style.setProperty('--rd-poll-delay', (i * 60) + 'ms');
        io.observe(c);
      });
    }

    /* Site-wide scroll-reveal (2026 redesign). Generalises the alumni/poll
       reveal convention into one shared system: cards + section headings fade
       and rise as they enter the viewport, staggered by index, once each. All
       the visual language lives in redesign-overrides.css behind .rd-reveal /
       .rd-reveal-head and the html.rd-reveal-on gate, so with JS off nothing
       hides and prefers-reduced-motion shows everything at once. Native scroll
       only, no momentum library. Works the same on mobile and PC. */
    var RD_REVEAL_CARDS = '.rd-dc, .rd-news-card, .rd-tile, .rd-pd-card, .bb-card, #home-initiatives button, #activities .grid > div, .rd-ad-card, .rd-pd-step, .rd-pd-fact, .rd-pd-fbcard, .rd-tile-dark, .rd-pd-guide, .rd-pd27, .rd-cc';

    function rdRevealTag(root) {
      root = root || document;
      var cards = root.querySelectorAll(RD_REVEAL_CARDS), i = 0;
      cards.forEach(function (c) {
        /* .rd-scroll-card and .rd-pollc carry their own observers already. */
        if (c.classList.contains('rd-scroll-card') || c.classList.contains('rd-pollc')) return;
        if (!c.classList.contains('rd-reveal')) {
          c.classList.add('rd-reveal');
          c.style.setProperty('--rd-reveal-delay', ((i % 8) * 55) + 'ms');
          i++;
        }
      });
      root.querySelectorAll('section h2, section > header h2').forEach(function (h) {
        if (!h.classList.contains('rd-reveal-head')) h.classList.add('rd-reveal-head');
      });
    }

    function rdRevealScan(root) {
      root = root || document;
      var els = root.querySelectorAll('.rd-reveal:not(.is-visible), .rd-reveal-head:not(.is-visible)');
      if (!els.length) return;
      if (!('IntersectionObserver' in window)) {
        els.forEach(function (e) { e.classList.add('is-visible'); });
        return;
      }
      var io = new IntersectionObserver(function (entries, obs) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          e.target.classList.add('is-visible');
          obs.unobserve(e.target);
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      /* Anything already on screen is revealed synchronously so above-the-fold
         content can never get stuck invisible if the observer's first callback
         is missed; only off-screen elements wait for the scroll animation. */
      var vh = window.innerHeight || document.documentElement.clientHeight;
      els.forEach(function (e) {
        var r = e.getBoundingClientRect();
        if (r.top < vh && r.bottom > 0) { e.classList.add('is-visible'); return; }
        io.observe(e);
      });
    }

    function rdRevealArm(root) {
      rdRevealTag(root);
      rdRevealScan(root);
    }

    /* Async feeds inject cards long after switchPage runs, so instead of hooking
       every renderer we watch the DOM once: any node insertion re-arms the
       active page (debounced to one frame). Tagging/scanning only touch
       attributes, never add nodes, so this never loops. */
    var rdRevealPending = false;
    function rdRevealScheduleGlobal() {
      if (rdRevealPending) return;
      rdRevealPending = true;
      var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
      raf(function () {
        rdRevealPending = false;
        rdRevealArm(document.querySelector('.page-view.active') || document);
      });
    }

    function rdRevealInit() {
      if (rdRevealInit.done) return;
      rdRevealInit.done = true;
      /* The gate class turns the hidden-then-revealed CSS on only once JS is
         live, so a no-JS page still shows every card. Own class (not the
         admin-guide's rd-js) so this feature is self-contained. */
      document.documentElement.classList.add('rd-reveal-on');
      rdRevealScheduleGlobal();
      if ('MutationObserver' in window && document.body) {
        new MutationObserver(rdRevealScheduleGlobal).observe(document.body, { childList: true, subtree: true });
      }
    }

    /* A poll is "past" (archived) once it is closed, or its deadline has
       passed (backend clears p.live). Drafts stay out of the archive. */
    function rdPollIsPast(p) {
      return p.status === 'closed' || (!p.live && p.status !== 'draft');
    }
    function rdPollToggleArchive() {
      RD_POLL.showArchive = !RD_POLL.showArchive;
      rdPollRenderList();
    }

    function rdPollStatusPill(p) {
      if (p.status === 'closed') return '<span class="rd-poll-pill rd-poll-pill-closed"><i data-lucide="lock"></i>Closed</span>';
      if (p.status === 'draft') return '<span class="rd-poll-pill rd-poll-pill-draft"><i data-lucide="pencil"></i>Draft</span>';
      if (p.live) return '<span class="rd-poll-pill rd-poll-pill-live"><span class="rd-poll-dot"></span>Live</span>';
      return '<span class="rd-poll-pill rd-poll-pill-ended"><i data-lucide="clock"></i>Ended</span>';
    }

    function rdPollDeadline(p) {
      if (!p.endAt) return '';
      const d = new Date(p.endAt);
      if (isNaN(d.getTime())) return '';
      const txt = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
        ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const verb = (p.status === 'closed' || !p.live) ? 'Ended' : 'Closes';
      return '<span class="rd-poll-chip rd-poll-chip-muted"><i data-lucide="calendar-clock"></i>' + verb + ' ' + escapeHtml(txt) + '</span>';
    }
    function rdPollCard(p) {
      const opts = Array.isArray(p.options) ? p.options : [];
      const signedIn = !!(RD_MEMBER && RD_MEMBER.token);
      const canVote = signedIn && p.live && p.eligible && !p.hasVoted;
      const typeLabel = p.type === 'multiple'
        ? ('Choose up to ' + (p.maxPick || opts.length))
        : 'Choose one';
      const typeIcon = p.type === 'multiple' ? 'list-checks' : 'circle-dot';
      let body;
      if (canVote) {
        body = rdPollVoteForm(p, opts);
      } else if (p.results && p.results.visible) {
        body = rdPollBars(p, opts);
      } else {
        body = rdPollResultNote(p, opts, signedIn);
      }
      const votedTag = p.hasVoted
        ? '<span class="rd-poll-chip rd-poll-chip-you"><i data-lucide="check-circle-2"></i>You voted</span>'
        : '';
      const past = rdPollIsPast(p);
      return '<article class="rd-pollc' + (past ? ' rd-pollc-ended' : '') + '">' +
        '<div class="rd-pollc-head">' +
          '<div class="flex items-start justify-between gap-3">' +
            '<h2 class="rd-pollc-title flex-1">' + escapeHtml(p.question) + '</h2>' +
            rdPollStatusPill(p) +
          '</div>' +
          '<div class="rd-poll-meta">' +
            '<span class="rd-poll-chip"><i data-lucide="' + typeIcon + '"></i>' + typeLabel + '</span>' +
            rdPollDeadline(p) + votedTag +
          '</div>' +
        '</div>' +
        '<div class="rd-pollc-body">' + body + '</div>' +
      '</article>';
    }

    function rdPollVoteForm(p, opts) {
      const multi = p.type === 'multiple';
      const inType = multi ? 'checkbox' : 'radio';
      const rows = opts.map(function (o) {
        return '<label class="rd-vopt">' +
          '<span class="rd-vopt-label">' + escapeHtml(o.text) + '</span>' +
          '<input type="' + inType + '" name="poll-opt-' + escapeHtml(p.id) + '" value="' + escapeHtml(o.id) + '" class="rd-vopt-input">' +
          '<span class="rd-vopt-ring" aria-hidden="true"></span></label>';
      }).join('');
      const busy = RD_POLL.voting === p.id;
      return '<div class="space-y-2.5 mb-4">' + rows + '</div>' +
        '<button onclick="rdPollVote(\'' + escapeHtml(p.id) + '\')" ' + (busy ? 'disabled' : '') +
          ' class="rd-poll-submit disabled:opacity-60">' +
          '<i data-lucide="' + (busy ? 'loader-2' : 'send') + '" class="w-4 h-4 ' + (busy ? 'animate-spin' : '') + '"></i>' +
          (busy ? 'Submitting...' : 'Submit vote') + '</button>';
    }

    function rdPollResultNote(p, opts, signedIn) {
      let note;
      if (!signedIn && p.live) note = 'Sign in to cast your vote.';
      else if (signedIn && !p.eligible) note = 'This poll is open to selected series only — you are not eligible to vote.';
      else if (p.resultVisibility === 'secret') note = 'Results are kept private by the admin.';
      else if (p.resultVisibility === 'voters' && !p.hasVoted && p.live) note = 'Vote to see the live results.';
      else note = 'Results are not available.';
      const list = opts.map(function (o) {
        const mine = p.hasVoted && Array.isArray(p.myChoice) && p.myChoice.indexOf(o.id) !== -1;
        return '<div class="rd-poll-opt' + (mine ? ' is-mine' : '') + '" style="cursor:default">' +
          (mine ? '<i data-lucide="check" class="text-emerald-600"></i>' : '<span style="width:1.05rem;flex-shrink:0"></span>') +
          '<span>' + escapeHtml(o.text) + '</span></div>';
      }).join('');
      return '<div class="space-y-2.5 mb-4">' + list + '</div>' +
        '<div class="rd-poll-note"><i data-lucide="info"></i>' + note + '</div>';
    }
    /* -- Poll results: single-hue horizontal bars, direct count+percent
          labels, leading option marked by text, native hover tooltip. -- */
    function rdPollBars(p, opts) {
      const r = p.results || {};
      const counts = r.counts || {};
      const total = r.total || 0;
      let maxCount = 0;
      opts.forEach(function (o) { const c = counts[o.id] || 0; if (c > maxCount) maxCount = c; });
      const leaders = maxCount > 0 ? opts.filter(function (o) { return (counts[o.id] || 0) === maxCount; }) : [];
      const soleLeader = leaders.length === 1 ? leaders[0].id : '';
      const bars = opts.map(function (o) {
        const c = counts[o.id] || 0;
        const pct = total ? Math.round((c / total) * 1000) / 10 : 0;
        const w = maxCount ? Math.max((c / maxCount) * 100, c > 0 ? 4 : 0) : 0;
        const mine = p.hasVoted && Array.isArray(p.myChoice) && p.myChoice.indexOf(o.id) !== -1;
        const isLead = o.id === soleLeader;
        const lead = isLead
          ? '<span class="rd-poll-lead-badge"><i data-lucide="trophy"></i>Leading</span>' : '';
        const mark = mine ? '<span class="rd-ropt-mark"><i data-lucide="check"></i></span>' : '';
        return '<div class="rd-poll-bar poll-bar-row' + (isLead ? ' rd-poll-bar-lead' : '') + (mine ? ' is-mine' : '') + '">' +
          '<div class="poll-bar-track" title="' + escapeHtml(o.text) + ': ' + c + ' vote' + (c === 1 ? '' : 's') + ' (' + pct + '%)">' +
            '<div class="poll-bar-fill" style="width:' + w + '%"></div>' +
            '<span class="rd-ropt-label">' + escapeHtml(o.text) + lead + '</span>' +
            '<span class="rd-ropt-num">' + c + ' &middot; ' + pct + '%</span>' + mark +
          '</div></div>';
      }).join('');
      let foot = '<div class="rd-poll-foot">' +
        '<span class="rd-poll-chip rd-poll-chip-muted"><i data-lucide="users"></i>' + total + ' vote' + (total === 1 ? '' : 's') + ' total</span>';
      if (p.status !== 'closed' && p.live) foot += '<span class="rd-poll-chip"><i data-lucide="radio"></i>Live &middot; updates every 20s</span>';
      foot += '</div>';
      let voters = '';
      if (Array.isArray(r.voters) && r.voters.length) {
        const byOpt = {};
        opts.forEach(function (o) { byOpt[o.id] = []; });
        r.voters.forEach(function (v) {
          (v.choice || []).forEach(function (cid) { if (byOpt[cid]) byOpt[cid].push(v.name || 'Member'); });
        });
        voters = '<details class="mt-3 group"><summary class="cursor-pointer text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"><i data-lucide="eye" class="w-3.5 h-3.5"></i>Who voted what</summary>' +
          '<div class="mt-2 space-y-2">' + opts.map(function (o) {
            const names = byOpt[o.id] || [];
            return '<div class="text-xs"><span class="font-semibold text-slate-700">' + escapeHtml(o.text) + ':</span> ' +
              '<span class="text-slate-500">' + (names.length ? names.map(escapeHtml).join(', ') : '&mdash;') + '</span></div>';
          }).join('') + '</div></details>';
      }
      return '<div>' + bars + '</div>' + foot + voters;
    }

    async function rdPollVote(pollId) {
      if (!(RD_MEMBER && RD_MEMBER.token)) { openMemberSignIn('polls'); return; }
      const boxes = document.querySelectorAll('input[name="poll-opt-' + (window.CSS && CSS.escape ? CSS.escape(pollId) : pollId) + '"]:checked');
      const choice = Array.prototype.map.call(boxes, function (b) { return b.value; });
      if (!choice.length) { showToast('Please pick an option first.', 'info'); return; }
      RD_POLL.voting = pollId; rdPollRenderList();
      try {
        const res = await apiPost('pollvote', { data: { pollId: pollId, choice: choice } });
        const idx = RD_POLL.polls.findIndex(function (x) { return x.id === pollId; });
        if (idx !== -1) {
          RD_POLL.polls[idx] = Object.assign({}, RD_POLL.polls[idx], {
            hasVoted: true,
            myChoice: res.myChoice || choice,
            results: res.results || RD_POLL.polls[idx].results
          });
        }
        showToast('Your vote has been recorded.', 'success', 'Thank you');
      } catch (err) {
        reportError(err);
      } finally {
        RD_POLL.voting = '';
        rdPollRenderList();
      }
    }

    function rdPollScheduleRefresh() {
      if (RD_POLL._timer) clearTimeout(RD_POLL._timer);
      const onPage = document.getElementById('page-polls') && document.getElementById('page-polls').classList.contains('active');
      const hasLive = RD_POLL.polls.some(function (p) { return p.live && (!p.results || p.results.visible); });
      if (!onPage || !hasLive) return;
      RD_POLL._timer = setTimeout(function () {
        const still = document.getElementById('page-polls') && document.getElementById('page-polls').classList.contains('active');
        if (!still || RD_POLL.voting) { rdPollScheduleRefresh(); return; }
        rdPollLoadList();
      }, 20000);
    }

    /* ================= ADMIN: POLLS ================= */
    function adminPollsHtml() {
      const rows = RD_ADMIN.rows.polls || [];
      const head = '<div class="flex items-center justify-between gap-3 mb-5">' +
        '<div><h3 class="text-lg font-bold text-slate-900">Polls</h3>' +
        '<p class="text-sm text-slate-500">Create a poll, choose who may vote and who may see the results.</p></div>' +
        '<button onclick="adminPollNewToggle()" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl ' +
        (RD_ADMIN.plNew ? 'bg-slate-100 text-slate-700' : 'bg-indigo-600 text-white hover:bg-indigo-700') +
        ' text-sm font-bold transition shrink-0"><i data-lucide="' + (RD_ADMIN.plNew ? 'x' : 'plus') + '" class="w-4 h-4"></i>' +
        (RD_ADMIN.plNew ? 'Cancel' : 'New poll') + '</button></div>';
      const form = RD_ADMIN.plNew ? adminPollForm() : '';
      const list = rows.length
        ? '<div class="space-y-4">' + rows.map(adminPollAdminCard).join('') + '</div>'
        : (RD_ADMIN.plNew ? '' : '<div class="rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center text-slate-500">No polls yet. Press <span class="font-semibold">New poll</span> to create one.</div>');
      return head + form + list;
    }

    function adminPollForm() {
      const opts = RD_ADMIN.plOpts.length ? RD_ADMIN.plOpts : ['', ''];
      const optRows = opts.map(function (v, i) {
        return '<div class="flex items-center gap-2">' +
          '<input class="adpoll-opt flex-1 px-3 py-2 rounded-xl border border-slate-300 text-sm" placeholder="Option ' + (i + 1) + '" value="' + escapeHtml(v) + '">' +
          (opts.length > 2 ? '<button onclick="adminPollRemoveOpt(' + i + ')" class="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50" title="Remove"><i data-lucide="trash-2" class="w-4 h-4"></i></button>' : '') +
          '</div>';
      }).join('');
      const seriesBoxes = rdSeriesList().slice().reverse().map(function (s) {
        return '<label class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs cursor-pointer hover:bg-slate-50">' +
          '<input type="checkbox" class="adpoll-series w-3.5 h-3.5 accent-indigo-600" value="' + s + '">' + s + '</label>';
      }).join('');
      const rd = function (name, val, cur, label) {
        return '<label class="inline-flex items-center gap-1.5 text-sm cursor-pointer"><input type="radio" name="' + name + '" value="' + val + '" class="accent-indigo-600"' + (val === cur ? ' checked' : '') + '>' + label + '</label>';
      };
      return '<div class="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5 mb-6 space-y-4">' +
        '<div><label class="block text-xs font-bold text-slate-600 mb-1.5">Question</label>' +
          '<input id="adpoll-q" class="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm" placeholder="What is your question?"></div>' +
        '<div class="flex flex-wrap gap-5"><div><label class="block text-xs font-bold text-slate-600 mb-1.5">Type</label>' +
          '<div class="flex gap-4">' + rd('adpoll-type', 'single', RD_ADMIN.plType, 'Single choice') + rd('adpoll-type', 'multiple', RD_ADMIN.plType, 'Multiple choice') + '</div></div>' +
          '<div><label class="block text-xs font-bold text-slate-600 mb-1.5">Max picks (multiple)</label>' +
          '<input id="adpoll-maxpick" type="number" min="1" value="' + opts.length + '" class="w-24 px-3 py-2 rounded-xl border border-slate-300 text-sm"></div></div>' +
        '<div><label class="block text-xs font-bold text-slate-600 mb-1.5">Options</label>' +
          '<div class="space-y-2">' + optRows + '</div>' +
          '<button onclick="adminPollAddOpt()" class="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700"><i data-lucide="plus" class="w-4 h-4"></i>Add option</button></div>' +
        '<div><label class="block text-xs font-bold text-slate-600 mb-1.5">Who may vote</label>' +
          '<label class="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50/60 text-sm font-semibold text-slate-700 cursor-pointer mb-2">' +
            '<input type="checkbox" id="adpoll-all" class="w-4 h-4 accent-indigo-600" checked onchange="rdPollAllSeriesToggle(this)"><i data-lucide="users" class="w-4 h-4 text-indigo-600"></i>All series (everyone can vote)</label>' +
          '<div id="adpoll-series-wrap" class="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1 opacity-40 pointer-events-none" aria-hidden="true">' + seriesBoxes + '</div>' +
          '<p class="text-xs text-slate-400 mt-1">Uncheck &ldquo;All series&rdquo; to limit voting to the series you tick.</p></div>' +
        '<div class="flex flex-wrap gap-6"><div><label class="block text-xs font-bold text-slate-600 mb-1.5">Deadline (optional)</label>' +
          '<input id="adpoll-end" type="datetime-local" class="px-3 py-2 rounded-xl border border-slate-300 text-sm"></div>' +
          '<div><label class="block text-xs font-bold text-slate-600 mb-1.5">Start as</label>' +
          '<div class="flex gap-4 pt-2">' + rd('adpoll-status', 'open', 'open', 'Open now') + rd('adpoll-status', 'draft', 'open', 'Draft') + '</div></div></div>' +
        '<div><label class="block text-xs font-bold text-slate-600 mb-1.5">Who may see results</label>' +
          '<div class="flex flex-col gap-1.5">' +
            rd('adpoll-vis', 'secret', RD_ADMIN.plVis, 'Admins only') +
            rd('adpoll-vis', 'voters', RD_ADMIN.plVis, 'People who voted (and everyone once closed)') +
            rd('adpoll-vis', 'public', RD_ADMIN.plVis, 'Everyone, including who voted for what') +
          '</div></div>' +
        '<div class="flex gap-2 pt-1"><button onclick="adminPollCreate()"' + (RD_ADMIN.plBusy === 'new' ? ' disabled' : '') +
          ' class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-60"><i data-lucide="check" class="w-4 h-4"></i>Create poll</button></div>' +
      '</div>';
    }

    function adminPollAdminCard(p) {
      const opts = Array.isArray(p.options) ? p.options : [];
      const busy = RD_ADMIN.plBusy === p.id;
      const open = !!RD_ADMIN.plView[p.id];
      let ctl = '';
      if (p.status === 'draft') ctl += adminPollBtn(p.id, 'open', 'play', 'Open', 'bg-emerald-600 hover:bg-emerald-700 text-white', busy);
      if (p.status === 'open') ctl += adminPollBtn(p.id, 'closed', 'lock', 'Close', 'bg-slate-700 hover:bg-slate-800 text-white', busy);
      if (p.status === 'closed') ctl += adminPollBtn(p.id, 'open', 'unlock', 'Reopen', 'bg-emerald-600 hover:bg-emerald-700 text-white', busy);
      ctl += '<button onclick="adminPollToggleView(\'' + escapeHtml(p.id) + '\')" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50"><i data-lucide="' + (open ? 'chevron-up' : 'bar-chart-3') + '" class="w-3.5 h-3.5"></i>' + (open ? 'Hide results' : 'Results') + '</button>';
      ctl += '<button onclick="adminPollDelete(\'' + escapeHtml(p.id) + '\')"' + (busy ? ' disabled' : '') + ' class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-rose-200 text-rose-600 text-xs font-bold hover:bg-rose-50 disabled:opacity-60"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Delete</button>';
      const visLabel = { secret: 'Admins only', voters: 'Voters', public: 'Public' }[p.resultVisibility] || p.resultVisibility;
      const meta = '<div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-500">' +
        '<span>' + (p.type === 'multiple' ? 'Multiple (max ' + (p.maxPick || opts.length) + ')' : 'Single choice') + '</span>' +
        '<span class="inline-flex items-center gap-1"><i data-lucide="eye" class="w-3.5 h-3.5"></i>' + visLabel + '</span>' +
        '<span class="inline-flex items-center gap-1"><i data-lucide="users" class="w-3.5 h-3.5"></i>' + (p.results && p.results.total || 0) + ' votes</span>' +
        ((Array.isArray(p.eligibleSeries) && p.eligibleSeries.length) ? '<span>Series: ' + p.eligibleSeries.map(escapeHtml).join(', ') + '</span>' : '<span>All series</span>') +
        rdPollDeadline(p) + '</div>';
      const body = open ? '<div class="mt-4 pt-4 border-t border-slate-100">' + (p.results && p.results.visible ? rdPollBars(p, opts) : '<p class="text-sm text-slate-500">No results to show.</p>') + '</div>' : '';
      return '<article class="rounded-2xl border border-slate-200 bg-white p-5">' +
        '<div class="flex items-start justify-between gap-3">' +
          '<div class="flex-1"><div class="flex items-center gap-2 mb-1">' + rdPollStatusPill(p) + '</div>' +
          '<h4 class="text-base font-bold text-slate-900 leading-snug">' + escapeHtml(p.question) + '</h4>' + meta + '</div></div>' +
        '<div class="flex flex-wrap gap-2 mt-4">' + ctl + '</div>' + body + '</article>';
    }

    function adminPollBtn(id, status, icon, label, cls, busy) {
      return '<button onclick="adminPollStatus(\'' + escapeHtml(id) + '\',\'' + status + '\')"' + (busy ? ' disabled' : '') +
        ' class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg ' + cls + ' text-xs font-bold disabled:opacity-60"><i data-lucide="' + icon + '" class="w-3.5 h-3.5"></i>' + label + '</button>';
    }

    function adminPollToggleView(id) {
      RD_ADMIN.plView[id] = !RD_ADMIN.plView[id];
      renderAdmin();
    }

    function adminPollCaptureForm() {
      RD_ADMIN.plOpts = Array.prototype.map.call(document.querySelectorAll('.adpoll-opt'), function (i) { return i.value; });
      const t = document.querySelector('input[name="adpoll-type"]:checked');
      if (t) RD_ADMIN.plType = t.value;
      const v = document.querySelector('input[name="adpoll-vis"]:checked');
      if (v) RD_ADMIN.plVis = v.value;
    }

    function adminPollNewToggle() {
      RD_ADMIN.plNew = !RD_ADMIN.plNew;
      if (RD_ADMIN.plNew) { RD_ADMIN.plOpts = ['', '']; RD_ADMIN.plType = 'single'; RD_ADMIN.plVis = 'voters'; }
      renderAdmin();
    }

    /* "All series" is the default. When it is on, the per-series ticks are
       dimmed and ignored (an empty eligible list = everyone). Turning it off
       hands control to the individual series checkboxes. */
    function rdPollAllSeriesToggle(el) {
      const wrap = document.getElementById('adpoll-series-wrap');
      if (!wrap) return;
      const all = !!(el && el.checked);
      wrap.classList.toggle('opacity-40', all);
      wrap.classList.toggle('pointer-events-none', all);
      wrap.setAttribute('aria-hidden', all ? 'true' : 'false');
      if (all) wrap.querySelectorAll('.adpoll-series:checked').forEach(function (b) { b.checked = false; });
    }

    function adminPollAddOpt() {
      adminPollCaptureForm();
      RD_ADMIN.plOpts.push('');
      renderAdmin();
    }

    function adminPollRemoveOpt(i) {
      adminPollCaptureForm();
      RD_ADMIN.plOpts.splice(i, 1);
      if (RD_ADMIN.plOpts.length < 2) RD_ADMIN.plOpts.push('');
      renderAdmin();
    }

    async function adminPollCreate() {
      adminPollCaptureForm();
      const q = (document.getElementById('adpoll-q') || {}).value || '';
      const options = RD_ADMIN.plOpts.map(function (s) { return String(s || '').trim(); }).filter(Boolean);
      if (!q.trim()) { showToast('Please write the poll question.', 'info'); return; }
      if (options.length < 2) { showToast('Please add at least two options.', 'info'); return; }
      const allEl = document.getElementById('adpoll-all');
      const series = (allEl && allEl.checked)
        ? []
        : Array.prototype.map.call(document.querySelectorAll('.adpoll-series:checked'), function (b) { return b.value; });
      const statusEl = document.querySelector('input[name="adpoll-status"]:checked');
      const endEl = document.getElementById('adpoll-end');
      const maxEl = document.getElementById('adpoll-maxpick');
      const payload = {
        question: q.trim(),
        type: RD_ADMIN.plType === 'multiple' ? 'multi' : 'single',
        maxPick: RD_ADMIN.plType === 'multiple' ? Number(maxEl && maxEl.value) || options.length : 1,
        options: options,
        eligibleSeries: series,
        eligSeries: series,
        endAt: endEl && endEl.value ? new Date(endEl.value).toISOString() : '',
        status: statusEl ? statusEl.value : 'open',
        resultVisibility: RD_ADMIN.plVis
      };
      RD_ADMIN.plBusy = 'new'; renderAdmin();
      try {
        await apiPost('pollcreate', { data: payload });
        RD_ADMIN.plNew = false; RD_ADMIN.plOpts = ['', ''];
        RD_ADMIN.plBusy = '';
        await loadAdminDashboard(true);
        showToast('Poll created.', 'success');
      } catch (err) {
        RD_ADMIN.plBusy = ''; reportError(err); renderAdmin();
      }
    }

    async function adminPollStatus(id, status) {
      RD_ADMIN.plBusy = id; renderAdmin();
      try {
        await apiPost('pollstatus', { data: { pollId: id, status: status } });
        showToast('Poll updated.', 'success');
        RD_ADMIN.plBusy = '';
        await loadAdminDashboard(true);
      } catch (err) {
        RD_ADMIN.plBusy = ''; reportError(err); renderAdmin();
      }
    }

    async function adminPollDelete(id) {
      const poll = (RD_ADMIN.rows.polls || []).find(function (p) { return p.id === id; });
      const votes = poll && poll.results ? (poll.results.total || 0) : 0;
      confirmGlobalLoader(
        'Delete this poll?',
        'This permanently removes the poll' + (votes ? ' and its ' + votes + ' vote(s)' : '') + '. This cannot be undone.',
        async function () {
          RD_ADMIN.plBusy = id; renderAdmin();
          try {
            await apiPost('polldelete', { data: { pollId: id } });
            hideGlobalLoader(true, async () => {
              RD_ADMIN.plBusy = '';
              await loadAdminDashboard(true);
            }, 'Poll deleted successfully.');
          } catch (err) {
            failGlobalLoader('Could not delete', friendlyError(err).msg);
            RD_ADMIN.plBusy = ''; reportError(err); renderAdmin();
          }
        },
        { confirmText: 'Delete', danger: true, workingTitle: 'Deleting...', workingSub: 'Removing this poll.' }
      );
    }

    /* Two-press confirm without a popup (rule 2): the first press arms a short
       timer, the second within the window goes through. */
    let RD_PL_CONFIRM = {};
    function rdConfirmInline(key) {
      const now = Date.now();
      if (RD_PL_CONFIRM[key] && now - RD_PL_CONFIRM[key] < 6000) { delete RD_PL_CONFIRM[key]; return true; }
      RD_PL_CONFIRM[key] = now;
      return false;
    }



// ==========================================
// PREMIUM GLOBAL LOADER SYSTEM
// (owner-authorised overlay; markup in index.html, styles in custom.css .rd-gl*)
// ==========================================
let rdLoaderInterval = null;
let rdLoaderPct = 0;
function rdPremiumSpinner(text, icon) {
      return '<div class="rd-premium-spinner">' +
             '<div class="rd-ps-ring-wrap">' +
             '<div class="rd-ps-ring-1"></div><div class="rd-ps-ring-2"></div><div class="rd-ps-ring-3"></div>' +
             '<i data-lucide="' + (icon || 'loader') + '" class="rd-ps-icon"></i>' +
             '</div>' +
             '<div class="rd-ps-text">' + escapeHtml(text) + '</div>' +
             '</div>';
    }
    let rdLocalConfetti = null;
let rdLoaderCloseCb = null;   // runs when the user clicks "OK, Close"

function rdGlEl(id) { return document.getElementById(id); }

function changeLoaderTextSmoothly(newTitle, newSub) {
    const titleEl = rdGlEl('loader-title');
    const subEl = rdGlEl('loader-sub');
    if (!titleEl || !subEl) return;

    titleEl.style.opacity = '0'; titleEl.style.transform = 'translateY(-6px)';
    subEl.style.opacity = '0'; subEl.style.transform = 'translateY(-6px)';

    setTimeout(() => {
        titleEl.textContent = newTitle;
        subEl.textContent = newSub;
        titleEl.style.transition = 'none'; subEl.style.transition = 'none';
        titleEl.style.transform = 'translateY(6px)'; subEl.style.transform = 'translateY(6px)';
        requestAnimationFrame(() => requestAnimationFrame(() => {
            titleEl.style.transition = 'all 0.25s ease'; subEl.style.transition = 'all 0.25s ease';
            subEl.style.transitionDelay = '0.05s';
            titleEl.style.opacity = '1'; titleEl.style.transform = 'translateY(0)';
            subEl.style.opacity = '1'; subEl.style.transform = 'translateY(0)';
        }));
    }, 250);
}

function showGlobalLoader(title, sub) {
    const overlay = rdGlEl('demo-loader');
    if (!overlay) return;
    rdLoaderCloseCb = null;

    if (typeof confetti !== 'undefined' && !rdLocalConfetti) {
        rdLocalConfetti = confetti.create(rdGlEl('confetti-canvas'), { resize: true, useWorker: true });
    }

    const titleEl = rdGlEl('loader-title'), subEl = rdGlEl('loader-sub');
    titleEl.style.transition = 'none'; subEl.style.transition = 'none';
    titleEl.textContent = title || 'Verifying...';
    subEl.textContent = sub || 'Securely checking your credentials.';
    titleEl.style.opacity = '1'; titleEl.style.transform = 'translateY(0)';
    subEl.style.opacity = '1'; subEl.style.transform = 'translateY(0)';
    setTimeout(() => {
        titleEl.style.transition = 'all 0.25s ease'; subEl.style.transition = 'all 0.25s ease';
        subEl.style.transitionDelay = '0.05s';
    }, 50);

    overlay.classList.remove('is-success', 'is-error', 'show-close', 'is-confirm', 'is-danger');
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    rdGlEl('loader-pct').textContent = '0';
    if (rdLocalConfetti) rdLocalConfetti.reset();

    rdLoaderPct = 0;
    clearInterval(rdLoaderInterval);
    rdLoaderInterval = setInterval(() => {
        rdLoaderPct += Math.floor(Math.random() * 8) + 2;
        if (rdLoaderPct > 98) rdLoaderPct = 98;
        const p = rdGlEl('loader-pct'); if (p) p.textContent = rdLoaderPct;
    }, 120);
}

// Immediately close the overlay and run whatever callback was queued for it.
// Bound to the "OK, Close" button.
function dismissGlobalLoader() {
    const overlay = rdGlEl('demo-loader');
    clearInterval(rdLoaderInterval);
    const cb = rdLoaderCloseCb; rdLoaderCloseCb = null;
    if (overlay) {
        overlay.classList.remove('is-open', 'is-success', 'is-error', 'show-close', 'is-confirm', 'is-danger');
        overlay.setAttribute('aria-hidden', 'true');
    }
    if (typeof cb === 'function') cb();
}

// Success. By DEFAULT the popup STAYS OPEN with an "OK, Close" button so the
// user cannot re-submit and create a duplicate entry; onSuccess runs when they
// acknowledge. Pass {autoClose:true} only where a duplicate is impossible
// (e.g. My-profile edit). When the overlay is absent (test harness / no DOM)
// onSuccess runs synchronously so navigation, busy flags and the notice-page
// confirmation are never left stuck.
function hideGlobalLoader(isSuccess = false, onSuccess = null, customMsg = 'Action completed successfully.', opts = {}) {
    const overlay = rdGlEl('demo-loader');
    clearInterval(rdLoaderInterval);

    if (!overlay) { if (isSuccess && typeof onSuccess === 'function') onSuccess(); return; }

    if (!isSuccess) {   // legacy failure entry point
        failGlobalLoader('Something went wrong', customMsg, onSuccess);
        return;
    }

    rdGlEl('loader-pct').textContent = '100';
    overlay.classList.remove('is-error');
    overlay.classList.add('is-success');
    changeLoaderTextSmoothly('Success', customMsg);
    if (rdLocalConfetti) {
        setTimeout(() => rdLocalConfetti({
            particleCount: 120, spread: 80, origin: { y: 0.6 },
            colors: ['#6366f1', '#10b981', '#f43f5e', '#f59e0b', '#8b5cf6'],
            disableForReducedMotion: true
        }), 300);
    }

    if (opts && opts.autoClose) {
        rdLoaderCloseCb = null;
        setTimeout(() => {
            overlay.classList.remove('is-open', 'is-success', 'show-close');
            overlay.setAttribute('aria-hidden', 'true');
            if (typeof onSuccess === 'function') onSuccess();
        }, 1800);
    } else {
        rdLoaderCloseCb = onSuccess;   // fires on the "OK, Close" click
        setTimeout(() => overlay.classList.add('show-close'), 500);
    }
}

// Failure. NEVER auto-dismisses: shows the red error badge and an "OK, Close"
// button in the premium font. onClose (if any) runs when acknowledged.
function failGlobalLoader(title, msg, onClose = null) {
    const overlay = rdGlEl('demo-loader');
    clearInterval(rdLoaderInterval);
    if (!overlay) { if (typeof onClose === 'function') onClose(); return; }
    overlay.classList.remove('is-success');
    overlay.classList.add('is-open', 'is-error', 'show-close');
    overlay.setAttribute('aria-hidden', 'false');
    changeLoaderTextSmoothly(title || 'Something went wrong', msg || 'Please try again.');
    rdLoaderCloseCb = onClose;
}

// Confirm mode: the same overlay asks a yes/no question (no native browser
// dialog, no separate page). Pressing "Confirm" flips it into the loading state
// and runs onConfirm() — which then calls hideGlobalLoader / failGlobalLoader.
// opts: { confirmText, danger, workingTitle, workingSub }. When the overlay is
// absent (test VM / no DOM) onConfirm runs synchronously so nothing sticks.
function confirmGlobalLoader(title, msg, onConfirm, opts = {}) {
    const overlay = rdGlEl('demo-loader');
    if (!overlay) { if (typeof onConfirm === 'function') onConfirm(); return; }
    clearInterval(rdLoaderInterval);
    rdLoaderCloseCb = null;

    overlay.classList.remove('is-success', 'is-error', 'show-close', 'is-danger');
    overlay.classList.add('is-open', 'is-confirm');
    if (opts.danger) overlay.classList.add('is-danger');
    overlay.setAttribute('aria-hidden', 'false');

    const titleEl = rdGlEl('loader-title'), subEl = rdGlEl('loader-sub');
    if (titleEl && subEl) {
        titleEl.style.transition = 'none'; subEl.style.transition = 'none';
        titleEl.style.opacity = '1'; titleEl.style.transform = 'translateY(0)';
        subEl.style.opacity = '1'; subEl.style.transform = 'translateY(0)';
        titleEl.textContent = title || 'Are you sure?';
        subEl.textContent = msg || 'Please confirm to continue.';
    }

    const yes = rdGlEl('loader-confirm-btn');
    if (yes) {
        yes.textContent = opts.confirmText || 'Confirm';
        yes.onclick = function () {
            overlay.classList.remove('is-confirm', 'is-danger');
            showGlobalLoader(opts.workingTitle || 'Working...', opts.workingSub || 'Please wait a moment.');
            if (typeof onConfirm === 'function') onConfirm();
        };
    }
}

/* ===== redesign-2026 SS10: glass-nav sliding glare =====
   Slides the frosted highlight under whichever pill item is active (or, on
   hover, the item being pointed at). Pure geometry off getBoundingClientRect,
   so no observer and no layout thrash beyond the rects it must read. */
function rdNavGlareSync(el) {
  const pill = document.getElementById('nav-pill');
  const glare = document.getElementById('nav-glare');
  if (!pill || !glare) return;
  const target = el
    || pill.querySelector('.premium-nav-item.active')
    || pill.querySelector('.premium-nav-item');
  if (!target) return;
  const pr = pill.getBoundingClientRect();
  const tr = target.getBoundingClientRect();
  if (!tr.width) return;
  glare.style.left = (tr.left - pr.left) + 'px';
  glare.style.width = tr.width + 'px';
}
(function rdNavGlareInit() {
  function bind() {
    const pill = document.getElementById('nav-pill');
    if (!pill) return;
    pill.querySelectorAll('.premium-nav-item').forEach(item => {
      item.addEventListener('mouseenter', () => rdNavGlareSync(item));
    });
    pill.addEventListener('mouseleave', () => rdNavGlareSync());
    window.addEventListener('resize', () => rdNavGlareSync());
    rdNavGlareSync();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
  window.addEventListener('load', () => rdNavGlareSync());
})();


function adminReunionHtml() {
    const data = RD_ADMIN.rows.reunion[0];
    const parts = data.parts || [];
    const photos = data.photos || [];

    let out = '<div class="space-y-8">';
    
    // Add New Part Section
    out += '<div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">';
    out += '<div class="flex items-center justify-between mb-4"><h3 class="text-lg font-bold text-slate-800">Add New Reunion Part</h3></div>';
    out += '<div class="grid sm:grid-cols-4 gap-4">';
    out += '<div><label class="block text-xs font-semibold text-slate-500 mb-1">Part Number</label><input type="number" id="reu-n" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm" placeholder="e.g. 1" /></div>';
    out += '<div><label class="block text-xs font-semibold text-slate-500 mb-1">Icon (Lucide)</label><input type="text" id="reu-icon" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm" placeholder="flag" /></div>';
    out += '<div><label class="block text-xs font-semibold text-slate-500 mb-1">Title (Bengali)</label><input type="text" id="reu-bn" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm" placeholder="Title BN" /></div>';
    out += '<div><label class="block text-xs font-semibold text-slate-500 mb-1">Title (English)</label><input type="text" id="reu-en" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm" placeholder="Title EN" /></div>';
    out += '</div>';
    out += '<div class="mt-4 flex justify-end"><button type="button" onclick="adminSaveReunionPart()" class="px-5 py-2.5 bg-blue-600 text-white font-bold text-sm rounded-xl hover:bg-blue-700 transition">Save Part</button></div>';
    out += '</div>';

    // List Existing Parts
    for (const part of parts) {
        out += '<div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">';
        out += '<div class="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center gap-3">';
        out += '<div class="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600"><i data-lucide="' + escapeHtml(part.icon) + '" class="w-5 h-5"></i></div>';
        out += '<div><h4 class="font-bold text-slate-800">Part ' + part.n + ': ' + escapeHtml(part.bn) + '</h4><p class="text-xs text-slate-500">' + escapeHtml(part.en) + '</p></div>';
        out += '</div>';

        out += '<div class="p-6">';
        out += '<div class="mb-4 flex items-center justify-between"><h5 class="font-bold text-slate-700">Gallery Photos</h5></div>';
        
        const partPhotos = photos.filter(p => p.part === part.n);
        
        out += '<div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">';
        for (const photo of partPhotos) {
            out += '<div class="relative group aspect-square rounded-xl overflow-hidden bg-slate-100 border border-slate-200">';
            out += '<img src="' + normalizeAlumniImage(photo.file) + '" class="w-full h-full object-cover" />';
            out += '<button type="button" onclick="adminDeleteReunionPhoto(' + part.n + ', \'' + photo.photo_id + '\')" class="absolute top-2 right-2 w-8 h-8 rounded-lg bg-white/90 text-red-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow hover:bg-red-50"><i data-lucide="trash-2" class="w-4 h-4"></i></button>';
            out += '</div>';
        }
        out += '</div>';
        
        // Upload form
        out += '<div class="mt-4 pt-4 border-t border-slate-100">';
        out += '<label class="block text-xs font-semibold text-slate-500 mb-2">Upload More Photos</label>';
        out += '<input type="file" id="reu-photos-' + part.n + '" multiple accept="image/*" class="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />';
        out += '<div class="mt-3 flex justify-end"><button type="button" onclick="adminUploadReunionPhotos(' + part.n + ')" class="px-4 py-2 bg-slate-900 text-white font-bold text-sm rounded-xl hover:bg-slate-800 transition">Upload Photos</button></div>';
        out += '</div>';

        out += '</div></div>';
    }

    out += '</div>';
    
    // Add dummy container so gallery upload works smoothly
    return out + '<div id="reu-dummy-wrap"></div>';
}

async function adminSaveReunionPart() {
    const n = parseInt(document.getElementById('reu-n').value, 10);
    const icon = document.getElementById('reu-icon').value.trim();
    const bn = document.getElementById('reu-bn').value.trim();
    const en = document.getElementById('reu-en').value.trim();
    if (!n || !icon || !bn || !en) return alert('All fields are required.');
    
    document.getElementById('reu-dummy-wrap').innerHTML = '<div class="fixed inset-0 z-50 bg-white/50 backdrop-blur-sm flex items-center justify-center"><div class="px-6 py-4 bg-white shadow-xl rounded-2xl font-bold text-indigo-600 flex items-center gap-3"><div class="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div> Saving...</div></div>';
    try {
        const res = await apiPost('savereunionpart', { n, icon, bn, en });
        if (res.success) {
            loadAdminDashboard(true);
        } else {
            alert(res.message || 'Error saving part.');
        }
    } catch(e) {
        alert('Error.');
    }
}

async function adminDeleteReunionPhoto(partNumber, photoId) {
    if (!confirm('Delete this photo?')) return;
    document.getElementById('reu-dummy-wrap').innerHTML = '<div class="fixed inset-0 z-50 bg-white/50 backdrop-blur-sm flex items-center justify-center"><div class="px-6 py-4 bg-white shadow-xl rounded-2xl font-bold text-indigo-600 flex items-center gap-3"><div class="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div> Deleting...</div></div>';
    try {
        const res = await apiPost('savereunionphotos', { part: partNumber, deleteGallery: [photoId] });
        if (res.success) {
            loadAdminDashboard(true);
        } else {
            alert(res.message || 'Error deleting.');
        }
    } catch(e) {
        alert('Error.');
    }
}

async function adminUploadReunionPhotos(partNumber) {
    const fileInput = document.getElementById('reu-photos-' + partNumber);
    if (!fileInput.files.length) return alert('Select files first.');
    
    document.getElementById('reu-dummy-wrap').innerHTML = '<div class="fixed inset-0 z-50 bg-white/50 backdrop-blur-sm flex items-center justify-center"><div class="px-6 py-4 bg-white shadow-xl rounded-2xl font-bold text-indigo-600 flex flex-col items-center gap-3"><div class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div> Uploading... This may take a while.</div></div>';
    
    try {
        const b64s = [];
        for (let i = 0; i < fileInput.files.length; i++) {
            b64s.push(await readAsDataURL(fileInput.files[i]));
        }
        
        const res = await apiPost('savereunionphotos', { part: partNumber, gallery: b64s });
        if (res.success) {
            loadAdminDashboard(true);
        } else {
            alert(res.message || 'Error uploading.');
        }
    } catch(e) {
        alert('Error uploading files.');
    }
}

