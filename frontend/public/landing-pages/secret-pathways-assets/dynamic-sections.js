(function () {
  // Portfolio & Case Studies cards (chapter 02) — fills the 6 hand-built
  // card slots with real published case studies from /api/case-studies, in
  // place, so the three.js cloth-fabric effect (which reads each card's
  // background-image once, early in the page's staged scene boot) still
  // picks up real cover photos instead of the shipped demo stills. A slot
  // with no matching case study is hidden. If the fetch fails or nothing is
  // published yet, every slot is left exactly as shipped (today's demo
  // copy) so the section never renders broken or empty.
  function esc(s) { return String(s == null ? '' : s); }

  fetch('/api/case-studies')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var studies = (data && data.case_studies) || [];
      if (!studies.length) return;

      var slots = document.querySelectorAll('#cards > .card');
      studies.slice(0, slots.length).forEach(function (cs, i) {
        var slot = slots[i];
        var fr = slot.querySelector('.card-fr');
        var glow = slot.querySelector('.glow');
        var lab = slot.querySelector('.card-lab');
        var labB = lab && lab.querySelector('b');
        var labJp = lab && lab.querySelector('.jp');
        var meta = slot.querySelector('.card-meta');
        var metaLeft = meta && meta.children[0];
        var metaRight = meta && meta.children[1];

        slot.href = '/case-studies/' + cs.slug;
        fr.style.background = cs.cover_image_url
          ? ('linear-gradient(180deg,rgba(3,6,9,.05) 36%,rgba(3,6,9,.74) 100%), url(\'' + cs.cover_image_url + '\') center / cover no-repeat')
          : 'linear-gradient(150deg,#101a1d,#0a0d10 62%,#1a0c0b)';
        if (glow) glow.remove();
        if (labB) labB.textContent = esc(cs.client_name || cs.title);
        if (labJp) labJp.remove();
        if (metaLeft) metaLeft.textContent = cs.written_by ? ('By ' + esc(cs.written_by)) : esc(cs.client_name || '');
        if (metaRight) metaRight.textContent = String(i + 1).padStart(2, '0') + ' / ' + String(studies.length).padStart(2, '0');
      });

      for (var j = studies.length; j < slots.length; j++) {
        slots[j].style.display = 'none';
      }

      // The three.js boot sequence builds the cloth-fabric effect on each
      // card early (reading its background-image once); this fetch usually
      // loses that race, so re-run it now that real images are in place.
      // buildCardCloth is re-entrant-safe — it skips frames already wrapped.
      if (window.__rebuildCardCloth) window.__rebuildCardCloth();
    })
    .catch(function (err) { console.warn('[case-study-cards] skipped:', err); });
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
