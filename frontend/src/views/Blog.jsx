import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowRight, ArrowLeft, Clock, Calendar, Tag, Search, Sparkles, Share2, Check } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import SEOHead from '../components/SEOHead';
import logoImg from '../assets/logo.png';

const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * Enhanced Markdown-to-HTML renderer for dark Kyoto editorial aesthetic.
 * Handles: headings, bold, italic, links, images, code blocks, lists, blockquotes, hr.
 */
function renderMarkdown(md) {
  if (!md) return '';
  let html = md
    .replace(/\r/g, '')
    // Code blocks (fenced)
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="blog-pre"><code class="blog-code blog-lang-$1">$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="blog-inline-code">$1</code>')
    // Images
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<div class="blog-img-frame"><img src="$2" alt="$1" class="blog-content-img" loading="lazy" /><span class="blog-img-caption">$1</span></div>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="blog-link" target="_blank" rel="noopener noreferrer">$1</a>')
    // Headings
    .replace(/^#### (.+)$/gm, '<h4 class="blog-h4">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 class="blog-h3">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="blog-h2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="blog-h1">$1</h1>')
    // Bold & Italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Blockquotes
    .replace(/^> (.+)$/gm, '<blockquote class="blog-quote">$1</blockquote>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr class="blog-divider" />')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li class="blog-li">$1</li>')
    // Numbered lists
    .replace(/^\d+\. (.+)$/gm, '<li class="blog-li-num">$1</li>')
    // Wrap consecutive <li> in <ul> or <ol>
    .replace(/(<li class="blog-li">.*<\/li>\n?)+/g, '<ul class="blog-ul">$&</ul>')
    .replace(/(<li class="blog-li-num">.*<\/li>\n?)+/g, '<ol class="blog-ol">$&</ol>')
    // Paragraphs (double newline)
    .replace(/\n\n/g, '</p><p class="blog-p">')
    // Single newlines inside paragraphs
    .replace(/\n/g, '<br />');

  // Wrap in paragraph tags
  html = '<p class="blog-p">' + html + '</p>';
  // Clean up empty paragraphs
  html = html.replace(/<p class="blog-p"><\/p>/g, '').replace(/<p class="blog-p">\s*<\/p>/g, '');
  // Fix headings/blockquotes/pre inside paragraphs
  html = html.replace(/<p class="blog-p">(<h[1-4])/g, '$1').replace(/(<\/h[1-4]>)<\/p>/g, '$1');
  html = html.replace(/<p class="blog-p">(<blockquote)/g, '$1').replace(/(<\/blockquote>)<\/p>/g, '$1');
  html = html.replace(/<p class="blog-p">(<pre)/g, '$1').replace(/(<\/pre>)<\/p>/g, '$1');
  html = html.replace(/<p class="blog-p">(<ul|<ol)/g, '$1').replace(/(<\/ul>|<\/ol>)<\/p>/g, '$1');
  html = html.replace(/<p class="blog-p">(<hr \/>|<div class="blog-img-frame")/g, '$1').replace(/(<\/div>)<\/p>/g, '$1');

  return html;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// ============================================================
// BLOG LISTING PAGE
// ============================================================

function BlogListing() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPosts();
  }, [page, selectedCategory]);

  const fetchPosts = async () => {
    setLoading(true);
    try {
      let url = `${API_BASE}/api/blog?page=${page}&limit=12`;
      if (selectedCategory) url += `&category=${encodeURIComponent(selectedCategory)}`;
      const res = await fetch(url);
      const data = await res.json();
      setPosts(data.posts || []);
      setTotalPages(data.total_pages || 1);
      setCategories(data.categories || []);
    } catch (err) {
      console.error('Failed to fetch blog posts:', err);
    } finally {
      setLoading(false);
    }
  };

  // Ensure body and root take full viewport with pure black background
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

  // Filter posts client-side for immediate responsive search
  const filteredPosts = useMemo(() => {
    if (!searchQuery.trim()) return posts;
    const q = searchQuery.toLowerCase();
    return posts.filter(
      p =>
        (p.title && p.title.toLowerCase().includes(q)) ||
        (p.excerpt && p.excerpt.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q)) ||
        (p.tags && p.tags.toLowerCase().includes(q))
    );
  }, [posts, searchQuery]);

  return (
    <div className="landing-root blog-root">
      <SEOHead 
        title="Journal & Insights — Hyphening Media | Marketing & Creative Operations"
        description="Expert insights on social media marketing, content strategy, video production, and high-performance brand growth from Hyphening Media."
        canonicalUrl="https://hypheningmedia.com/blog"
      />

      {/* Atmospheric Background Lights */}
      <div className="blog-ambient-mesh" />
      <div className="blog-vignette" />

      {/* Fixed Navigation */}
      <Navbar />

      {/* Hero Section */}
      <header className="blog-hero-section">
        <div className="blog-hero-content">
          <div className="blog-eyebrow">
            <span className="blog-eyebrow-dot" />
            <span>INSIGHTS & STRATEGIES</span>
          </div>

          <h1 className="blog-display-title">
            The Hyphen—ing <span className="blog-title-accent">Journal</span>
          </h1>

          <p className="blog-hero-desc">
            Where creative craft scales into measurable performance. Deep-dives on video operations,
            content strategy, and algorithmic distribution for modern brands.
          </p>

          {/* Search & Filter Bar */}
          <div className="blog-search-bar-wrap">
            <div className="blog-search-input-box">
              <Search size={18} className="blog-search-icon" />
              <input
                type="text"
                placeholder="Search articles by topic, strategy, or keyword..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="blog-search-input"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="blog-search-clear"
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Category Pills Bar */}
      {categories.length > 0 && (
        <div className="blog-categories-wrapper">
          <div className="blog-categories-scroll">
            <button
              className={`blog-pill-btn ${selectedCategory === '' ? 'active' : ''}`}
              onClick={() => { setSelectedCategory(''); setPage(1); }}
            >
              All Topics
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                className={`blog-pill-btn ${selectedCategory === cat ? 'active' : ''}`}
                onClick={() => { setSelectedCategory(cat); setPage(1); }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Content Grid */}
      <main className="blog-main-section">
        {loading ? (
          <div className="blog-state-container">
            <div className="blog-pulse-spinner" />
            <div className="blog-loading-text">Loading insights...</div>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="blog-state-container blog-empty-state">
            <div className="blog-empty-icon">⛩️</div>
            <h3>No articles found</h3>
            <p>
              {searchQuery
                ? `No articles match "${searchQuery}". Try a different keyword or reset filters.`
                : 'Check back soon — fresh editorial strategies are on the way!'}
            </p>
            {searchQuery && (
              <button 
                className="blog-pill-btn active"
                onClick={() => setSearchQuery('')}
                style={{ marginTop: '16px' }}
              >
                Reset Search
              </button>
            )}
          </div>
        ) : (
          <div className="blog-cards-grid">
            {filteredPosts.map((post, idx) => {
              const readTime = post.read_time || Math.max(1, Math.round((post.content || '').split(/\s+/).length / 200));
              const isFirst = idx === 0 && page === 1 && !searchQuery && !selectedCategory;

              return (
                <Link 
                  to={`/blog/${post.slug}`} 
                  key={post.id} 
                  className={`blog-card-item ${isFirst ? 'blog-card-featured' : ''}`}
                >
                  <div className="blog-card-img-wrap">
                    {post.cover_image_url ? (
                      <div 
                        className="blog-card-img" 
                        style={{ backgroundImage: `url(${post.cover_image_url})` }} 
                      />
                    ) : (
                      <div className="blog-card-img blog-card-img-fallback">
                        <span className="blog-fallback-kanji">影</span>
                      </div>
                    )}
                    <div className="blog-card-img-overlay" />
                    <span className="blog-card-category-badge">{post.category}</span>
                  </div>

                  <div className="blog-card-content">
                    <div className="blog-card-meta-row">
                      <span className="blog-card-date">
                        <Calendar size={13} /> {formatDate(post.published_at)}
                      </span>
                      <span className="blog-card-readtime">
                        <Clock size={13} /> {readTime} min read
                      </span>
                    </div>

                    <h2 className="blog-card-title">{post.title}</h2>

                    <p className="blog-card-excerpt">
                      {post.excerpt || 'Discover operational frameworks and creative tactics to drive measurable brand growth.'}
                    </p>

                    <div className="blog-card-footer-row">
                      <span className="blog-card-action">
                        Read Analysis <ArrowRight size={14} className="blog-action-arrow" />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && !searchQuery && (
          <nav className="blog-pagination-nav" aria-label="Blog Pagination">
            <button
              className="blog-page-nav-btn"
              disabled={page <= 1}
              onClick={() => {
                setPage(page - 1);
                window.scrollTo({ top: 400, behavior: 'smooth' });
              }}
            >
              <ArrowLeft size={14} /> Previous
            </button>
            <span className="blog-page-indicator">
              Page {page} of {totalPages}
            </span>
            <button
              className="blog-page-nav-btn"
              disabled={page >= totalPages}
              onClick={() => {
                setPage(page + 1);
                window.scrollTo({ top: 400, behavior: 'smooth' });
              }}
            >
              Next <ArrowRight size={14} />
            </button>
          </nav>
        )}
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}

// ============================================================
// BLOG ARTICLE PAGE
// ============================================================

function BlogArticle() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [related, setRelated] = useState([]);
  const [linkedPosts, setLinkedPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchPost();
    window.scrollTo(0, 0);
  }, [slug]);

  const fetchPost = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/blog/${slug}`);
      if (!res.ok) {
        navigate('/blog');
        return;
      }
      const data = await res.json();
      setPost(data.post);
      setRelated(data.related || []);
      setLinkedPosts(data.linked_posts || []);
    } catch (err) {
      console.error('Failed to fetch blog post:', err);
      navigate('/blog');
    } finally {
      setLoading(false);
    }
  };

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Ensure body and root take full viewport with pure black background
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

  if (loading) {
    return (
      <div className="landing-root blog-root">
        <Navbar />
        <div className="blog-state-container" style={{ minHeight: '80vh' }}>
          <div className="blog-pulse-spinner" />
          <div className="blog-loading-text">Summoning article...</div>
        </div>
      </div>
    );
  }

  if (!post) return null;

  const readTime = post.read_time || Math.max(1, Math.round((post.content || '').split(/\s+/).length / 200));

  // Build structured data
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": post.meta_title || post.title,
    "description": post.meta_description || post.excerpt || '',
    "image": post.cover_image_url || '',
    "author": { "@type": "Organization", "name": post.author || 'Hyphening Media' },
    "publisher": { "@type": "Organization", "name": "Hyphening Media", "url": "https://hypheningmedia.com" },
    "datePublished": post.published_at,
    "dateModified": post.updated_at,
    "mainEntityOfPage": { "@type": "WebPage", "@id": `https://hypheningmedia.com/blog/${post.slug}` }
  };

  return (
    <div className="landing-root blog-root blog-article-root">
      {/* SEO Meta */}
      <SEOHead 
        title={`${post.meta_title || post.title} — Hyphening Media`}
        description={post.meta_description || post.excerpt || ''}
        keywords={post.meta_keywords}
        canonicalUrl={`https://hypheningmedia.com/blog/${post.slug}`}
        ogImage={post.cover_image_url}
        ogType="article"
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />

      {/* Atmospheric Background Lights */}
      <div className="blog-ambient-mesh" />
      <div className="blog-vignette" />

      {/* Navigation */}
      <Navbar />

      {/* Article Hero Banner (Cinematic Backdrop) */}
      <div className="blog-article-banner-hero">
        {post.cover_image_url && (
          <div 
            className="blog-article-backdrop-img" 
            style={{ backgroundImage: `url(${post.cover_image_url})` }} 
          />
        )}
        <div className="blog-article-hero-mask" />
      </div>

      {/* Reader Container */}
      <div className="blog-article-wrapper">
        <article className="blog-article-card">
          {/* Top Bar / Navigation */}
          <div className="blog-article-nav-row">
            <Link to="/blog" className="blog-back-pill">
              <ArrowLeft size={14} /> Back to Journal
            </Link>

            <button onClick={handleShare} className="blog-share-pill" title="Copy article link">
              {copied ? (
                <>
                  <Check size={14} color="#10b981" /> Link Copied
                </>
              ) : (
                <>
                  <Share2 size={14} /> Share Article
                </>
              )}
            </button>
          </div>

          {/* Article Header */}
          <header className="blog-article-header">
            <div className="blog-article-meta-tags">
              <span className="blog-card-category-badge">{post.category}</span>
              <span className="blog-article-meta-item">
                <Calendar size={13} /> {formatDate(post.published_at)}
              </span>
              <span className="blog-article-meta-item">
                <Clock size={13} /> {readTime} min read
              </span>
            </div>

            <h1 className="blog-article-main-title">{post.title}</h1>

            {post.excerpt && (
              <p className="blog-article-lead-excerpt">{post.excerpt}</p>
            )}

            <div className="blog-article-author-row">
              <div className="blog-author-avatar">
                <img src={logoImg} alt="Hyphening Media" />
              </div>
              <div className="blog-author-info">
                <span className="blog-author-name">{post.author || 'Hyphening Editorial'}</span>
                <span className="blog-author-role">Creative Operations Lead · Hyphening Media</span>
              </div>
            </div>
          </header>

          {/* Featured Cover Display (if available) */}
          {post.cover_image_url && (
            <div className="blog-article-featured-img-wrap">
              <img 
                src={post.cover_image_url} 
                alt={post.title} 
                className="blog-article-featured-img" 
              />
            </div>
          )}

          {/* Article Markdown Content Body */}
          <div 
            className="blog-article-prose" 
            dangerouslySetInnerHTML={{ __html: renderMarkdown(post.content) }} 
          />

          {/* Tags Section */}
          {post.tags && (
            <div className="blog-tags-container">
              <span className="blog-tags-label">Topics:</span>
              <div className="blog-tags-list">
                {post.tags.split(',').map(tag => (
                  <span key={tag.trim()} className="blog-topic-tag">
                    <Tag size={12} /> {tag.trim()}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Author Footnote Box */}
          <div className="blog-author-box">
            <div className="blog-author-box-logo">
              <img src={logoImg} alt="Hyphening Media" />
            </div>
            <div className="blog-author-box-text">
              <h4>Crafted by Hyphening Media</h4>
              <p>
                We design and scale high-performance creative engines for D2C, F&B, and healthcare brands.
                From daily content operations to custom dashboards and automated growth funnels.
              </p>
              <Link to="/#contact" className="blog-author-cta-btn">
                Work With Us <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </article>

        {/* Internal Linked Reading */}
        {linkedPosts.length > 0 && (
          <section className="blog-recs-section">
            <div className="blog-recs-header">
              <span className="blog-eyebrow-dot" />
              <h3>Recommended Reading</h3>
            </div>
            <div className="blog-recs-grid">
              {linkedPosts.map(lp => (
                <Link to={`/blog/${lp.slug}`} key={lp.id} className="blog-rec-card">
                  {lp.cover_image_url && (
                    <div 
                      className="blog-rec-img" 
                      style={{ backgroundImage: `url(${lp.cover_image_url})` }} 
                    />
                  )}
                  <div className="blog-rec-body">
                    <span className="blog-card-category-badge">{lp.category}</span>
                    <h4>{lp.title}</h4>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Related Category Posts */}
        {related.length > 0 && (
          <section className="blog-recs-section">
            <div className="blog-recs-header">
              <span className="blog-eyebrow-dot" />
              <h3>More from {post.category}</h3>
            </div>
            <div className="blog-recs-grid">
              {related.map(rp => (
                <Link to={`/blog/${rp.slug}`} key={rp.id} className="blog-rec-card">
                  {rp.cover_image_url && (
                    <div 
                      className="blog-rec-img" 
                      style={{ backgroundImage: `url(${rp.cover_image_url})` }} 
                    />
                  )}
                  <div className="blog-rec-body">
                    <span className="blog-card-category-badge">{rp.category}</span>
                    <h4>{rp.title}</h4>
                    <span className="blog-card-date">
                      <Calendar size={11} /> {formatDate(rp.published_at)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Footer */}
      <Footer />
    </div>
  );
}

// ============================================================
// MAIN BLOG COMPONENT — Routes between listing and article
// ============================================================

export default function Blog() {
  const { slug } = useParams();
  return slug ? <BlogArticle /> : <BlogListing />;
}
