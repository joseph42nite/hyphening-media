import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowRight, ArrowLeft, Clock, Calendar, Tag, ChevronRight, Menu, X } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import logoImg from '../assets/logo.png';

const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * Simple Markdown-to-HTML renderer.
 * Handles: headings, bold, italic, links, images, code blocks, lists, blockquotes, hr.
 */
function renderMarkdown(md) {
  if (!md) return '';
  let html = md
    .replace(/\r/g, '')
    // Code blocks (fenced)
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="blog-code">$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="blog-inline-code">$1</code>')
    // Images
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="blog-content-img" loading="lazy" />')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="blog-link" target="_blank" rel="noopener noreferrer">$1</a>')
    // Headings
    .replace(/^#### (.+)$/gm, '<h4><strong>$1</strong></h4>')
    .replace(/^### (.+)$/gm, '<h3><strong>$1</strong></h3>')
    .replace(/^## (.+)$/gm, '<h2><strong>$1</strong></h2>')
    .replace(/^# (.+)$/gm, '<h1><strong>$1</strong></h1>')
    // Bold & Italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Blockquotes
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr />')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // Numbered lists
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Wrap consecutive <li> in <ul>
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    // Paragraphs (double newline)
    .replace(/\n\n/g, '</p><p>')
    // Single newlines inside paragraphs
    .replace(/\n/g, '<br />');

  // Wrap in paragraph tags
  html = '<p>' + html + '</p>';
  // Clean up empty paragraphs
  html = html.replace(/<p><\/p>/g, '').replace(/<p>\s*<\/p>/g, '');
  // Fix headings/blockquotes/pre inside paragraphs
  html = html.replace(/<p>(<h[1-4]>)/g, '$1').replace(/(<\/h[1-4]>)<\/p>/g, '$1');
  html = html.replace(/<p>(<blockquote>)/g, '$1').replace(/(<\/blockquote>)<\/p>/g, '$1');
  html = html.replace(/<p>(<pre>)/g, '$1').replace(/(<\/pre>)<\/p>/g, '$1');
  html = html.replace(/<p>(<ul>)/g, '$1').replace(/(<\/ul>)<\/p>/g, '$1');
  html = html.replace(/<p>(<hr \/>)/g, '$1').replace(/(<hr \/>)<\/p>/g, '$1');
  html = html.replace(/<p>(<img )/g, '$1').replace(/(\/\>)<\/p>/g, '$1');

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
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

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

  // Remove body padding
  useEffect(() => {
    const body = document.body;
    const root = document.getElementById('root');
    const origBodyPad = body.style.padding;
    const origRootMax = root.style.maxWidth;
    body.style.padding = '0';
    root.style.maxWidth = 'none';
    return () => {
      body.style.padding = origBodyPad;
      root.style.maxWidth = origRootMax;
    };
  }, []);

  return (
    <div className="landing-root">
      {/* Navigation */}
      <Navbar />

      {/* SEO Meta */}
      <title>Blog — Hyphening Media | Social Media Marketing Insights</title>
      <meta name="description" content="Read expert insights on social media marketing, content strategy, brand growth, and creative operations from Hyphening Media." />

      {/* Blog Hero */}
      <section className="blog-hero">
        <div className="blog-hero-inner">
          <span className="blog-hero-badge">INSIGHTS & STRATEGIES</span>
          <h1>The Hyphening Blog</h1>
          <p>Expert insights on social media marketing, content strategy, brand growth, and creative operations.</p>
        </div>
      </section>

      {/* Category Filter */}
      {categories.length > 0 && (
        <div className="blog-categories">
          <button
            className={`blog-cat-btn ${selectedCategory === '' ? 'active' : ''}`}
            onClick={() => { setSelectedCategory(''); setPage(1); }}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              className={`blog-cat-btn ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => { setSelectedCategory(cat); setPage(1); }}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Blog Grid */}
      <section className="blog-listing-section">
        {loading ? (
          <div className="blog-loading">Loading articles...</div>
        ) : posts.length === 0 ? (
          <div className="blog-empty">
            <h3>No articles found</h3>
            <p>Check back soon — new content is on its way!</p>
          </div>
        ) : (
          <div className="blog-grid">
            {posts.map(post => (
              <Link to={`/blog/${post.slug}`} key={post.id} className="blog-card">
                {post.cover_image_url && (
                  <div className="blog-card-img" style={{ backgroundImage: `url(${post.cover_image_url})` }} />
                )}
                <div className="blog-card-body">
                  <div className="blog-card-meta">
                    <span className="blog-card-category">{post.category}</span>
                    <span className="blog-card-date">
                      <Calendar size={12} /> {formatDate(post.published_at)}
                    </span>
                  </div>
                  <h3 className="blog-card-title">{post.title}</h3>
                  <p className="blog-card-excerpt">{post.excerpt || ''}</p>
                  <div className="blog-card-footer">
                    <span className="blog-card-read">Read Article <ArrowRight size={14} /></span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="blog-pagination">
            <button
              className="blog-page-btn"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ArrowLeft size={14} /> Previous
            </button>
            <span className="blog-page-info">Page {page} of {totalPages}</span>
            <button
              className="blog-page-btn"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next <ArrowRight size={14} />
            </button>
          </div>
        )}
      </section>

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
  const [menuOpen, setMenuOpen] = useState(false);

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

  // Remove body padding
  useEffect(() => {
    const body = document.body;
    const root = document.getElementById('root');
    const origBodyPad = body.style.padding;
    const origRootMax = root.style.maxWidth;
    body.style.padding = '0';
    root.style.maxWidth = 'none';
    return () => {
      body.style.padding = origBodyPad;
      root.style.maxWidth = origRootMax;
    };
  }, []);

  if (loading) {
    return (
      <div className="landing-root">
        <div className="blog-loading" style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          Loading article...
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
    "publisher": { "@type": "Organization", "name": "Hyphening Media", "url": "https://hyphening.com" },
    "datePublished": post.published_at,
    "dateModified": post.updated_at,
    "mainEntityOfPage": { "@type": "WebPage", "@id": `https://hyphening.com/blog/${post.slug}` }
  };

  return (
    <div className="landing-root">
      {/* SEO Meta */}
      <title>{post.meta_title || post.title} — Hyphening Media</title>
      <meta name="description" content={post.meta_description || post.excerpt || ''} />
      {post.meta_keywords && <meta name="keywords" content={post.meta_keywords} />}
      <link rel="canonical" href={`https://hyphening.com/blog/${post.slug}`} />
      <meta property="og:title" content={post.meta_title || post.title} />
      <meta property="og:description" content={post.meta_description || post.excerpt || ''} />
      {post.cover_image_url && <meta property="og:image" content={post.cover_image_url} />}
      <meta property="og:url" content={`https://hyphening.com/blog/${post.slug}`} />
      <meta property="og:type" content="article" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />

      {/* Navigation */}
      <Navbar />

      {/* Article Hero */}
      {post.cover_image_url && (
        <div className="blog-article-hero" style={{ backgroundImage: `url(${post.cover_image_url})` }}>
          <div className="blog-article-hero-overlay" />
        </div>
      )}

      {/* Article Content */}
      <article className="blog-article">
        <div className="blog-article-header">
          <Link to="/blog" className="blog-back-link">
            <ArrowLeft size={14} /> Back to Blog
          </Link>
          <div className="blog-article-meta">
            <span className="blog-card-category">{post.category}</span>
            <span><Calendar size={13} /> {formatDate(post.published_at)}</span>
            <span><Clock size={13} /> {readTime} min read</span>
          </div>
          <h1 className="blog-article-title">{post.title}</h1>
          {post.excerpt && <p className="blog-article-excerpt">{post.excerpt}</p>}
          <div className="blog-article-author">By {post.author || 'Hyphening Media'}</div>
        </div>

        <div className="blog-article-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(post.content) }} />

        {/* Tags */}
        {post.tags && (
          <div className="blog-article-tags">
            {post.tags.split(',').map(tag => (
              <Link to={`/blog?tag=${tag.trim()}`} key={tag.trim()} className="blog-tag">
                <Tag size={12} /> {tag.trim()}
              </Link>
            ))}
          </div>
        )}

        {/* Internal Links */}
        {linkedPosts.length > 0 && (
          <div className="blog-internal-links">
            <h3>Recommended Reading</h3>
            <div className="blog-related-grid">
              {linkedPosts.map(lp => (
                <Link to={`/blog/${lp.slug}`} key={lp.id} className="blog-related-card">
                  {lp.cover_image_url && (
                    <div className="blog-related-img" style={{ backgroundImage: `url(${lp.cover_image_url})` }} />
                  )}
                  <div className="blog-related-body">
                    <span className="blog-card-category">{lp.category}</span>
                    <h4>{lp.title}</h4>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Related Posts */}
        {related.length > 0 && (
          <div className="blog-related-section">
            <h3>More from {post.category}</h3>
            <div className="blog-related-grid">
              {related.map(rp => (
                <Link to={`/blog/${rp.slug}`} key={rp.id} className="blog-related-card">
                  {rp.cover_image_url && (
                    <div className="blog-related-img" style={{ backgroundImage: `url(${rp.cover_image_url})` }} />
                  )}
                  <div className="blog-related-body">
                    <span className="blog-card-category">{rp.category}</span>
                    <h4>{rp.title}</h4>
                    <span className="blog-card-date"><Calendar size={11} /> {formatDate(rp.published_at)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </article>

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
