(function () {
  // Portfolio & Case Studies cards (chapter 02) — fills the 6 hand-built
  // card slots with real published case studies from /api/case-studies, in
  // place, so the three.js cloth-fabric effect (which reads each card's
  // background-image once, early in the page's staged scene boot) still
  // picks up real cover photos instead of the shipped demo stills. A slot
  // with no matching case study is hidden. If the fetch fails or nothing is
  // published yet, every slot is left pointing to /case-studies so clicking
  // any card or case study flag takes the visitor to the case studies view.
  function esc(s) { return String(s == null ? '' : s); }

  function toEmbedUrl(url) {
    if (!url) return null;
    var str = String(url).trim();
    if (!str) return null;
    var iframeMatch = str.match(/src=["']([^"']+)["']/i);
    if (iframeMatch) str = iframeMatch[1].trim();
    if (!/^https?:\/\//i.test(str)) str = 'https://' + str;
    try {
      var u = new URL(str);
      var host = u.hostname.toLowerCase();
      if (host.indexOf('youtube.com') !== -1 || host.indexOf('youtu.be') !== -1) {
        var videoId = null;
        if (host.indexOf('youtu.be') !== -1) {
          videoId = u.pathname.replace(/^\/+/, '').split('/')[0];
        } else if (u.pathname.indexOf('/shorts/') !== -1) {
          var m = u.pathname.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
          if (m) videoId = m[1];
        } else if (u.pathname.indexOf('/live/') !== -1) {
          var m = u.pathname.match(/\/live\/([a-zA-Z0-9_-]+)/);
          if (m) videoId = m[1];
        } else if (u.pathname.indexOf('/embed/') !== -1) {
          var m = u.pathname.match(/\/embed\/([a-zA-Z0-9_-]+)/);
          if (m) videoId = m[1];
        } else {
          videoId = u.searchParams.get('v');
        }
        if (videoId) {
          videoId = videoId.replace(/[^a-zA-Z0-9_-]/g, '');
          return 'https://www.youtube-nocookie.com/embed/' + videoId;
        }
      }
      if (host.indexOf('vimeo.com') !== -1) {
        var vm = u.pathname.match(/\/(\d+)/);
        if (vm) return 'https://player.vimeo.com/video/' + vm[1];
      }
      return str;
    } catch (e) {
      return str;
    }
  }

  function wireCardClicks() {
    var cards = document.querySelectorAll('#cards > .card');
    cards.forEach(function (card) {
      if (card.__wiredClick) return;
      card.__wiredClick = true;
      card.addEventListener('click', function (e) {
        var href = this.getAttribute('href');
        if (href && href !== '#' && !href.startsWith('#')) {
          if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'NAVIGATE_ROUTE', url: href }, '*');
          }
        }
      });
    });
  }

  // Wire click navigation on static cards immediately
  wireCardClicks();

  fetch('/api/case-studies')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var studies = (data && data.case_studies) || [];
      var slots = document.querySelectorAll('#cards > .card');

      if (studies.length) {
        studies.slice(0, slots.length).forEach(function (cs, i) {
          var slot = slots[i];
          var fr = slot.querySelector('.card-fr');
          var glow = slot.querySelector('.glow');
          var lab = slot.querySelector('.card-lab');
          var labTag = lab && lab.querySelector('.card-tag');
          var labB = lab && lab.querySelector('b');
          var labClient = lab && lab.querySelector('.card-client');
          var labJp = lab && lab.querySelector('.jp');
          var meta = slot.querySelector('.card-meta');
          var metaLeft = meta && meta.children[0];
          var metaRight = meta && meta.children[1];

          slot.href = '/case-studies/' + cs.slug;
          slot.target = '_top';
          fr.style.background = cs.cover_image_url
            ? ('linear-gradient(180deg,rgba(3,6,9,.05) 36%,rgba(3,6,9,.74) 100%), url(\'' + cs.cover_image_url + '\') center / cover no-repeat')
            : 'linear-gradient(150deg,#101a1d,#0a0d10 62%,#1a0c0b)';
          if (glow) glow.remove();
          if (labTag) labTag.textContent = 'Case Study ' + String(i + 1).padStart(2, '0');
          if (labB) labB.textContent = esc(cs.title);
          var clientText = cs.client_name || (cs.written_by ? ('By ' + esc(cs.written_by)) : '');
          if (labClient) labClient.textContent = clientText;
          if (labJp) labJp.remove();
          if (metaLeft) metaLeft.textContent = '';
          if (metaRight) metaRight.textContent = String(i + 1).padStart(2, '0') + ' / ' + String(studies.length).padStart(2, '0');
        });

        for (var j = studies.length; j < slots.length; j++) {
          slots[j].style.display = 'none';
        }

        // If any case study has a video embed, unhide the portfolio reel
        var reel = document.querySelector('.port-video');
        var reelFrame = reel && reel.querySelector('iframe');
        if (reel && reelFrame) {
          var videoUrl = null;
          for (var k = 0; k < studies.length; k++) {
            try {
              var vList = JSON.parse(studies[k].video_embed_urls || '[]');
              if (vList && vList.length && vList[0]) {
                videoUrl = vList[0];
                break;
              }
            } catch (e) {}
          }
          if (videoUrl) {
            var embed = toEmbedUrl(videoUrl);
            if (embed) {
              reelFrame.src = embed;
              reel.style.display = 'block';
            }
          }
        }
      } else {
        // Fallback: ensure all default demo cards link to /case-studies
        slots.forEach(function (slot) {
          slot.href = '/case-studies';
          slot.target = '_top';
        });
      }

      wireCardClicks();

      // The three.js boot sequence builds the cloth-fabric effect on each
      // card early (reading its background-image once); this fetch usually
      // loses that race, so re-run it now that real images are in place.
      // buildCardCloth is re-entrant-safe — it skips frames already wrapped.
      if (window.__rebuildCardCloth) window.__rebuildCardCloth();
    })
    .catch(function (err) {
      console.warn('[case-study-cards] skipped:', err);
      wireCardClicks();
    });
})();
(function () {
  // Blog preview section — hidden unless Hyphening Media's own blog_enabled
  // flag (crm_clients row, same on/off switch used for client blogs) is on.
  function esc(s) { return String(s == null ? '' : s); }

  function renderCards(posts) {
    var wrap = document.getElementById('blogCards');
    posts.forEach(function (p) {
      var a = document.createElement('a');
      a.className = 'blog-card';
      a.href = '/blog/' + p.slug;
      a.target = '_top';

      var fr = document.createElement('div');
      fr.className = 'blog-card-fr';
      if (p.cover_image_url) {
        var img = document.createElement('img');
        img.src = p.cover_image_url;
        img.alt = '';
        img.loading = 'lazy';
        fr.appendChild(img);
      }
      var lab = document.createElement('div');
      lab.className = 'blog-card-lab';
      lab.textContent = esc(p.title);
      fr.appendChild(lab);

      var meta = document.createElement('div');
      meta.className = 'blog-card-meta';
      var left = document.createElement('span');
      left.textContent = esc(p.category || 'Blog');
      var right = document.createElement('span');
      right.textContent = p.read_time ? (p.read_time + ' min read') : '';
      meta.appendChild(left);
      meta.appendChild(right);

      a.appendChild(fr);
      a.appendChild(meta);
      wrap.appendChild(a);
    });
  }

  fetch('/api/blog/landing-flag')
    .then(function (r) { return r.json(); })
    .then(function (flag) {
      if (!flag || !flag.blog_enabled) return;
      return fetch('/api/blog?limit=3')
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var posts = (data && data.posts) || [];
          if (!posts.length) return;
          renderCards(posts);
          document.getElementById('blogPreview').style.display = '';
        });
    })
    .catch(function (err) { console.warn('[blog-preview] skipped:', err); });
})();
