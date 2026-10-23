import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowRight, ArrowLeft, Calendar, Share2, Check } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import SEOHead from '../components/SEOHead';
import logoImg from '../assets/logo.png';

const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * Same markdown-to-HTML treatment as the blog, reused for the case study body.
 */
function renderMarkdown(md) {
  if (!md) return '';

  // Convert standalone video URLs on their own line into responsive embed containers
  let text = md.replace(/\r/g, '');
  text = text.replace(/^(?:https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=[a-zA-Z0-9_-]+|shorts\/[a-zA-Z0-9_-]+|embed\/[a-zA-Z0-9_-]+|live\/[a-zA-Z0-9_-]+)|youtu\.be\/[a-zA-Z0-9_-]+)[^\s]*)$/gm, (match) => {
    const embed = toEmbedUrl(match.trim());
    return embed ? `\n\n<div class="cs-video-embed"><iframe src="${embed}" title="Video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen loading="lazy"></iframe></div>\n\n` : match;
  });

  let html = text
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="blog-pre"><code class="blog-code blog-lang-$1">$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="blog-inline-code">$1</code>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<div class="blog-img-frame"><img src="$2" alt="$1" class="blog-content-img" loading="lazy" /><span class="blog-img-caption">$1</span></div>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="blog-link" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/^#### (.+)$/gm, '<h4 class="blog-h4">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 class="blog-h3">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="blog-h2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="blog-h1">$1</h1>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^> (.+)$/gm, '<blockquote class="blog-quote">$1</blockquote>')
    .replace(/^---$/gm, '<hr class="blog-divider" />')
    .replace(/^- (.+)$/gm, '<li class="blog-li">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="blog-li-num">$1</li>')
    .replace(/(<li class="blog-li">.*<\/li>\n?)+/g, '<ul class="blog-ul">$&</ul>')
    .replace(/(<li class="blog-li-num">.*<\/li>\n?)+/g, '<ol class="blog-ol">$&</ol>')
    .replace(/\n\n/g, '</p><p class="blog-p">')
    .replace(/\n/g, '<br />');

  html = '<p class="blog-p">' + html + '</p>';
  html = html.replace(/<p class="blog-p"><\/p>/g, '').replace(/<p class="blog-p">\s*<\/p>/g, '');
  html = html.replace(/<p class="blog-p">(<h[1-4])/g, '$1').replace(/(<\/h[1-4]>)<\/p>/g, '$1');
  html = html.replace(/<p class="blog-p">(<blockquote)/g, '$1').replace(/(<\/blockquote>)<\/p>/g, '$1');
  html = html.replace(/<p class="blog-p">(<pre)/g, '$1').replace(/(<\/pre>)<\/p>/g, '$1');
  html = html.replace(/<p class="blog-p">(<ul|<ol)/g, '$1').replace(/(<\/ul>|<\/ol>)<\/p>/g, '$1');
  html = html.replace(/<p class="blog-p">(<hr \/>|<div class="blog-img-frame"|<div class="cs-video-embed")/g, '$1').replace(/(<\/div>)<\/p>/g, '$1');

  return html;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/**
 * Converts any YouTube/Vimeo/Loom link (watch, shorts, embed, youtu.be, live, or raw iframe)
 * into a safe, responsive embeddable iframe src using youtube-nocookie.com.
 */
export function toEmbedUrl(url) {
  if (!url) return null;
  let str = String(url).trim();
  if (!str) return null;

  // Extract from markdown link e.g. [title](url) or <url>
  const mdLinkMatch = str.match(/^\[.*?\]\((https?:\/\/[^\s)]+)\)$/i);
  if (mdLinkMatch) str = mdLinkMatch[1];
  str = str.replace(/^<|>$/g, '');

  // Extract src if an iframe tag was pasted
  const iframeMatch = str.match(/src=["']([^"']+)["']/i);
  if (iframeMatch) {
    str = iframeMatch[1].trim();
  }

  // Ensure protocol
  if (!/^https?:\/\//i.test(str)) {
    str = 'https://' + str;
  }

  try {
    const u = new URL(str);
    const host = u.hostname.toLowerCase();

    // YouTube
    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      let videoId = null;

      if (host.includes('youtu.be')) {
        // e.g. https://youtu.be/VIDEO_ID?si=...
        videoId = u.pathname.replace(/^\/+/, '').split('/')[0];
      } else if (u.pathname.includes('/shorts/')) {
        // e.g. https://www.youtube.com/shorts/VIDEO_ID
        const m = u.pathname.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
        if (m) videoId = m[1];
      } else if (u.pathname.includes('/live/')) {
        // e.g. https://www.youtube.com/live/VIDEO_ID
        const m = u.pathname.match(/\/live\/([a-zA-Z0-9_-]+)/);
        if (m) videoId = m[1];
      } else if (u.pathname.includes('/embed/')) {
        // e.g. https://www.youtube.com/embed/VIDEO_ID
        const m = u.pathname.match(/\/embed\/([a-zA-Z0-9_-]+)/);
        if (m) videoId = m[1];
      } else {
        // e.g. https://www.youtube.com/watch?v=VIDEO_ID
        videoId = u.searchParams.get('v');
      }

      if (videoId) {
        videoId = videoId.replace(/[^a-zA-Z0-9_-]/g, '');
        let embed = `https://www.youtube-nocookie.com/embed/${videoId}`;
        const timeParam = u.searchParams.get('t') || u.searchParams.get('start');
        if (timeParam) {
          let seconds = parseInt(timeParam, 10);
          if (!isNaN(seconds)) embed += `?start=${seconds}`;
        }
        return embed;
      }
    }

    // Vimeo
    if (host.includes('vimeo.com')) {
      const match = u.pathname.match(/\/(\d+)/);
      if (match) return `https://player.vimeo.com/video/${match[1]}`;
    }

    // Loom
    if (host.includes('loom.com')) {
      return str.replace('/share/', '/embed/');
    }

    return str;
  } catch (e) {
    return str;
  }
}

function parseJsonArray(val) {
  if (Array.isArray(val)) return val;
  try {
    const parsed = JSON.parse(val || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

// ============================================================
// CASE STUDIES LISTING PAGE
// ============================================================

function CaseStudiesListing() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/case-studies`)
      .then(res => res.json())
      .then(data => setPosts(data.case_studies || []))
      .catch(err => console.error('Failed to fetch case studies:', err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const body = document.body;
    const docEl = document.documentElement;
    const root = document.getElementById('root');
    const origBg = body.style.backgroundColor;
    const origDocBg = docEl.style.backgroundColor;
    const origColor = body.style.color;
    const origBodyPad = body.style.padding;
    const origRootMax = root.style.maxWidth;

    body.style.backgroundColor = '#05070a';
    docEl.style.backgroundColor = '#05070a';
    body.style.color = '#dfe7e0';
    body.style.padding = '0';
    root.style.maxWidth = 'none';
    body.classList.add('dark-theme');
    docEl.classList.add('dark-theme');

    return () => {
      body.style.backgroundColor = origBg;
      docEl.style.backgroundColor = origDocBg;
      body.style.color = origColor;
      body.style.padding = origBodyPad;
      root.style.maxWidth = origRootMax;
      body.classList.remove('dark-theme');
      docEl.classList.remove('dark-theme');
    };
  }, []);

  return (
    <div className="landing-root blog-root">
      <SEOHead
        title="Case Studies — Hyphening Media | Client Results"
        description="Real client results from Hyphening Media — brand growth, content engines, and measurable performance gains."
        canonicalUrl="https://hypheningmedia.com/case-studies"
      />

      <div className="blog-ambient-mesh" />
      <div className="blog-vignette" />
      <Navbar />

      <header className="blog-hero-section">
        <div className="blog-hero-content">
          <div className="blog-eyebrow">
            <span className="blog-eyebrow-dot" />
            <span>CLIENT RESULTS</span>
          </div>
          <h1 className="blog-display-title">
            Case <span className="blog-title-accent">Studies</span>
          </h1>
          <p className="blog-hero-desc">
            Real brands, real numbers — how we've helped clients grow their worth.
          </p>
        </div>
      </header>

      <main className="blog-main-section">
        {loading ? (
          <div className="blog-state-container">
            <div className="blog-pulse-spinner" />
            <div className="blog-loading-text">Loading case studies...</div>
          </div>
        ) : posts.length === 0 ? (
          <div className="blog-state-container blog-empty-state">
            <div className="blog-empty-icon">⛩️</div>
            <h3>No case studies yet</h3>
            <p>Check back soon — client results are on the way!</p>
          </div>
        ) : (
          <div className="blog-cards-grid">
            {posts.map((post, idx) => (
              <Link
                to={`/case-studies/${post.slug}`}
                key={post.id}
                className={`blog-card-item ${idx === 0 ? 'blog-card-featured' : ''}`}
              >
                <div className="blog-card-img-wrap">
                  {post.cover_image_url ? (
                    <div className="blog-card-img" style={{ backgroundImage: `url(${post.cover_image_url})` }} />
                  ) : (
                    <div className="blog-card-img blog-card-img-fallback">
                      <span className="blog-fallback-kanji">影</span>
                    </div>
                  )}
                  <div className="blog-card-img-overlay" />
                  {post.client_name && <span className="blog-card-category-badge">{post.client_name}</span>}
                </div>

                <div className="blog-card-content">
                  <div className="blog-card-meta-row">
                    <span className="blog-card-date">
                      <Calendar size={13} /> {formatDate(post.published_at)}
                    </span>
                    {post.written_by && (
                      <span className="blog-card-date">By {post.written_by}</span>
                    )}
                  </div>

                  <h2 className="blog-card-title">{post.title}</h2>

                  <p className="blog-card-excerpt">
                    {post.summary || 'See how we helped this client improve their results.'}
                  </p>

                  <div className="blog-card-footer-row">
                    <span className="blog-card-action">
                      Read Case Study <ArrowRight size={14} className="blog-action-arrow" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

// ============================================================
// CASE STUDY DETAIL PAGE
// ============================================================

function CaseStudyDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/api/case-studies/${slug}`)
      .then(res => {
        if (!res.ok) { navigate('/case-studies'); return null; }
        return res.json();
      })
      .then(data => { if (data) setPost(data.case_study); })
      .catch(err => { console.error('Failed to fetch case study:', err); navigate('/case-studies'); })
      .finally(() => setLoading(false));
    window.scrollTo(0, 0);
  }, [slug]);

  useEffect(() => {
    const body = document.body;
    const docEl = document.documentElement;
    const root = document.getElementById('root');
    const origBg = body.style.backgroundColor;
    const origDocBg = docEl.style.backgroundColor;
    const origColor = body.style.color;
    const origBodyPad = body.style.padding;
    const origRootMax = root.style.maxWidth;

    body.style.backgroundColor = '#05070a';
    docEl.style.backgroundColor = '#05070a';
    body.style.color = '#dfe7e0';
    body.style.padding = '0';
    root.style.maxWidth = 'none';
    body.classList.add('dark-theme');
    docEl.classList.add('dark-theme');

    return () => {
      body.style.backgroundColor = origBg;
      docEl.style.backgroundColor = origDocBg;
      body.style.color = origColor;
      body.style.padding = origBodyPad;
      root.style.maxWidth = origRootMax;
      body.classList.remove('dark-theme');
      docEl.classList.remove('dark-theme');
    };
  }, []);

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const galleryImages = useMemo(() => parseJsonArray(post?.gallery_image_urls), [post]);
  const videoEmbeds = useMemo(() => parseJsonArray(post?.video_embed_urls), [post]);

  if (loading) {
    return (
      <div className="landing-root blog-root">
        <Navbar />
        <div className="blog-state-container" style={{ minHeight: '80vh' }}>
          <div className="blog-pulse-spinner" />
          <div className="blog-loading-text">Loading case study...</div>
        </div>
      </div>
    );
  }

  if (!post) return null;

  return (
    <div className="landing-root blog-root blog-article-root">
      <SEOHead
        title={`${post.title} — Hyphening Media Case Study`}
        description={post.summary || ''}
        canonicalUrl={`https://hypheningmedia.com/case-studies/${post.slug}`}
        ogImage={post.cover_image_url}
        ogType="article"
      />

      <div className="blog-ambient-mesh" />
      <div className="blog-vignette" />
      <Navbar />

      <div className="blog-article-banner-hero">
        {post.cover_image_url && (
          <div className="blog-article-backdrop-img" style={{ backgroundImage: `url(${post.cover_image_url})` }} />
        )}
        <div className="blog-article-hero-mask" />
      </div>

      <div className="blog-article-wrapper">
        <article className="blog-article-card">
          <div className="blog-article-nav-row">
            <Link to="/case-studies" className="blog-back-pill">
              <ArrowLeft size={14} /> Back to Case Studies
            </Link>
            <button onClick={handleShare} className="blog-share-pill" title="Copy link">
              {copied ? (<><Check size={14} color="#10b981" /> Link Copied</>) : (<><Share2 size={14} /> Share</>)}
            </button>
          </div>

          <header className="blog-article-header">
            <div className="blog-article-meta-tags">
              {post.client_name && <span className="blog-card-category-badge">{post.client_name}</span>}
              <span className="blog-article-meta-item">
                <Calendar size={13} /> {formatDate(post.published_at)}
              </span>
            </div>

            <h1 className="blog-article-main-title">{post.title}</h1>

            {post.summary && (
              <p className="blog-article-lead-excerpt">{post.summary}</p>
            )}

            <div className="blog-article-author-row">
              <div className="blog-author-avatar">
                <img src={logoImg} alt="Hyphening Media" />
              </div>
              <div className="blog-author-info">
                <span className="blog-author-name">{post.written_by || 'Hyphening Media'}</span>
                <span className="blog-author-role">{post.written_by ? 'Contributor' : 'Creative Operations Lead'}</span>
              </div>
            </div>
          </header>

          {post.cover_image_url && (
            <div className="blog-article-featured-img-wrap">
              <img src={post.cover_image_url} alt={post.title} className="blog-article-featured-img" />
            </div>
          )}

          <div
            className="blog-article-prose"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(post.content) }}
          />

          {galleryImages.length > 0 && (
            <div className="cs-gallery-grid">
              {galleryImages.map((src, i) => (
                <div key={i} className="blog-img-frame">
                  <img src={src} alt={`${post.title} - image ${i + 1}`} className="blog-content-img" loading="lazy" />
                </div>
              ))}
            </div>
          )}

          {videoEmbeds.length > 0 && (
            <div className="cs-video-list">
              {videoEmbeds.map((url, i) => {
                const embed = toEmbedUrl(url);
                if (!embed) return null;
                return (
                  <div key={i} className="cs-video-embed">
                    <iframe
                      src={embed}
                      title={`${post.title} - video ${i + 1}`}
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                      loading="lazy"
                    />
                  </div>
                );
              })}
            </div>
          )}

          <div className="blog-author-box">
            <div className="blog-author-box-logo">
              <img src={logoImg} alt="Hyphening Media" />
            </div>
            <div className="blog-author-box-text">
              <h4>Want results like this for your brand?</h4>
              <p>
                Hyphening Media designs and scales high-performance creative engines for D2C, F&B, and
                healthcare brands — content, dashboards, and growth funnels, all in one system.
              </p>
              <Link to="/#contact" className="blog-author-cta-btn">
                Contact Us <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </article>
      </div>

      <Footer />
    </div>
  );
}

// ============================================================
// MAIN CASE STUDIES COMPONENT — Routes between listing and detail
// ============================================================

export default function CaseStudies() {
  const { slug } = useParams();
  return slug ? <CaseStudyDetail /> : <CaseStudiesListing />;
}
