import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowRight, ArrowLeft, Share2, Check, Sparkles, Layers, Cpu, TrendingUp, Compass, Award, ExternalLink, ShieldCheck } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import SEOHead from '../components/SEOHead';
import CapabilityCard from '../components/CapabilityCard';
import { PILLARS_LIST, PILLARS_BY_SLUG } from '../data/pillarsData';

export { PILLARS_LIST, PILLARS_BY_SLUG };

// ============================================================
// CAPABILITY DETAIL VIEW (/capabilities/:slug)
// ============================================================
function CapabilityDetail({ slug }) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const pillar = PILLARS_BY_SLUG[slug];

  useEffect(() => {
    if (!pillar) {
      navigate('/capabilities', { replace: true });
    }
    window.scrollTo(0, 0);
  }, [slug, pillar, navigate]);

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

  if (!pillar) return null;

  const currentIndex = PILLARS_LIST.findIndex(p => p.slug === slug);
  const prevPillar = currentIndex > 0 ? PILLARS_LIST[currentIndex - 1] : PILLARS_LIST[PILLARS_LIST.length - 1];
  const nextPillar = currentIndex < PILLARS_LIST.length - 1 ? PILLARS_LIST[currentIndex + 1] : PILLARS_LIST[0];

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="landing-root blog-root blog-article-root capability-page-root">
      <SEOHead
        title={`${pillar.title} — Hyphening Media Capabilities`}
        description={pillar.summary}
        canonicalUrl={`https://hypheningmedia.com/capabilities/${pillar.slug}`}
        ogImage={pillar.image}
        ogType="article"
      />

      <div className="blog-ambient-mesh" />
      <div className="blog-vignette" />
      <Navbar />

      {/* Hero Banner Backdrop */}
      <div className="blog-article-banner-hero">
        <div
          className="blog-article-backdrop-img"
          style={{ backgroundImage: `url(${pillar.image})` }}
        />
        <div className="blog-article-hero-mask" />
      </div>

      <div className="blog-article-wrapper">
        <article className="blog-article-card capability-detail-card">
          {/* Top navigation row */}
          <div className="blog-article-nav-row">
            <Link to="/capabilities" className="blog-back-pill">
              <ArrowLeft size={14} /> All Nine Pillars
            </Link>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleShare} className="blog-share-pill" title="Copy link">
                {copied ? (<><Check size={14} color="#10b981" /> Link Copied</>) : (<><Share2 size={14} /> Share</>)}
              </button>
            </div>
          </div>

          {/* Header */}
          <header className="blog-article-header">
            <div className="blog-article-meta-tags">
              <span className="blog-card-category-badge" style={{ borderColor: 'rgba(224, 35, 28, 0.4)', color: '#ff6b64' }}>
                PILLAR {pillar.number} · {pillar.kanji}
              </span>
              <span className="blog-article-meta-item" style={{ letterSpacing: '0.2em', textTransform: 'uppercase', color: '#909b95' }}>
                {pillar.kanjiRomaji}
              </span>
            </div>

            <h1 className="blog-article-main-title">{pillar.title}</h1>
            <p className="capability-tagline-text">{pillar.tagline}</p>
            <p className="blog-article-lead-excerpt">{pillar.summary}</p>
          </header>

          {/* Featured Visual Frame */}
          <div className="blog-article-featured-img-wrap capability-hero-frame">
            <img src={pillar.image} alt={pillar.title} className="blog-article-featured-img" />
            <div className="capability-frame-overlay">
              <span className="capability-frame-badge">Pillar {pillar.number}</span>
              <span className="capability-frame-kanji">{pillar.kanji}</span>
            </div>
          </div>

          {/* Performance Targets Grid */}
          <div className="capability-stats-strip">
            {pillar.metrics.map((m, idx) => (
              <div key={idx} className="capability-stat-card">
                <div className="capability-stat-val">{m.value}</div>
                <div className="capability-stat-lbl">{m.label}</div>
              </div>
            ))}
          </div>

          {/* Key Deliverables Section */}
          <section className="capability-section">
            <div className="capability-sec-heading">
              <span className="capability-sec-k">
                <Layers size={15} style={{ verticalAlign: 'middle', marginRight: '6px', color: '#e0231c' }} />
                CORE DELIVERABLES
              </span>
              <h2 className="capability-sec-title">What We Engineer & Deliver</h2>
            </div>

            <div className="capability-deliverables-grid">
              {pillar.deliverables.map((item, idx) => (
                <div key={idx} className="capability-deliverable-item">
                  <div className="capability-item-check">
                    <Check size={14} color="#e0231c" />
                  </div>
                  <div className="capability-item-body">
                    <h4 className="capability-item-title">{item.title}</h4>
                    <p className="capability-item-desc">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Execution Methodology */}
          <section className="capability-section">
            <div className="capability-sec-heading">
              <span className="capability-sec-k">
                <Compass size={15} style={{ verticalAlign: 'middle', marginRight: '6px', color: '#e0231c' }} />
                METHODOLOGY & WORKFLOW
              </span>
              <h2 className="capability-sec-title">Systematic Execution Flow</h2>
            </div>

            <div className="capability-methodology-timeline">
              {pillar.methodology.map((step, idx) => (
                <div key={idx} className="capability-methodology-step">
                  <div className="capability-step-num">{step.step}</div>
                  <div className="capability-step-content">
                    <h4 className="capability-step-title">{step.title}</h4>
                    <p className="capability-step-desc">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Tech Stack & Tooling */}
          <section className="capability-section">
            <div className="capability-sec-heading">
              <span className="capability-sec-k">
                <Cpu size={15} style={{ verticalAlign: 'middle', marginRight: '6px', color: '#e0231c' }} />
                TOOLING & INFRASTRUCTURE
              </span>
              <h2 className="capability-sec-title">Production Stack</h2>
            </div>

            <div className="capability-stack-pills">
              {pillar.techStack.map((tool, idx) => (
                <span key={idx} className="capability-stack-pill">
                  {tool}
                </span>
              ))}
            </div>
          </section>

          {/* Editorial Philosophy */}
          <section className="capability-section capability-editorial-section">
            <div className="capability-sec-heading">
              <span className="capability-sec-k">
                <Sparkles size={15} style={{ verticalAlign: 'middle', marginRight: '6px', color: '#e0231c' }} />
                DEEP DIVE
              </span>
              <h2 className="capability-sec-title">The Hyphening Standard</h2>
            </div>

            <div
              className="blog-article-prose"
              dangerouslySetInnerHTML={{
                __html: pillar.editorial
                  .replace(/^### (.+)$/gm, '<h3 class="blog-h3">$1</h3>')
                  .replace(/^## (.+)$/gm, '<h2 class="blog-h2">$1</h2>')
                  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                  .replace(/\*(.+?)\*/g, '<em>$1</em>')
                  .replace(/(<li class="blog-li">.*<\/li>\n?)+/g, '<ul class="blog-ul">$&</ul>')
                  .replace(/^\d+\. (.+)$/gm, '<li class="blog-li-num">$1</li>')
                  .replace(/^- (.+)$/gm, '<li class="blog-li">$1</li>')
                  .replace(/\n\n/g, '</p><p class="blog-p">')
              }}
            />
          </section>

          {/* Bottom Partnership Box */}
          <div className="capability-cta-box">
            <div className="capability-cta-content">
              <span className="capability-cta-badge">INTEGRATE THIS DISCIPLINE</span>
              <h3 className="capability-cta-title">Ready to deploy {pillar.title} into your growth engine?</h3>
              <p className="capability-cta-desc">
                Partner with Hyphening Media for full-spectrum execution with zero overhead. Let's discuss your targets.
              </p>
            </div>
            <a href="/#eternity" className="capability-cta-btn">
              <span>Initiate Partnership</span>
              <ArrowRight size={16} />
            </a>
          </div>

          {/* Next / Previous Pillar Navigation */}
          <div className="capability-prev-next-nav">
            <Link to={`/capabilities/${prevPillar.slug}`} className="capability-nav-card prev">
              <div className="capability-nav-dir">
                <ArrowLeft size={13} /> PREVIOUS PILLAR
              </div>
              <div className="capability-nav-title">
                <span className="kanji">{prevPillar.kanji}</span> {prevPillar.title}
              </div>
            </Link>

            <Link to={`/capabilities/${nextPillar.slug}`} className="capability-nav-card next">
              <div className="capability-nav-dir">
                NEXT PILLAR <ArrowRight size={13} />
              </div>
              <div className="capability-nav-title">
                {nextPillar.title} <span className="kanji">{nextPillar.kanji}</span>
              </div>
            </Link>
          </div>
        </article>
      </div>

      <Footer />
    </div>
  );
}

// ============================================================
// CAPABILITIES LISTING VIEW (/capabilities)
// ============================================================
function CapabilitiesListing() {
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
        title="Nine Pillars of Growth — Hyphening Media Capabilities"
        description="Nine core disciplines engineered for full-spectrum execution, viral distribution, and real enterprise ROI — from cinema production to custom software."
        canonicalUrl="https://hypheningmedia.com/capabilities"
      />

      <div className="blog-ambient-mesh" />
      <div className="blog-vignette" />
      <Navbar />

      <header className="blog-hero-section">
        <div className="blog-hero-content">
          <div className="blog-eyebrow">
            <span className="blog-eyebrow-dot" />
            <span>NINE PILLARS · 全方位実行</span>
          </div>
          <h1 className="blog-display-title">
            Our <span className="blog-title-accent">Capabilities</span>
          </h1>
          <p className="blog-hero-desc">
            Nine core disciplines engineered for full-spectrum execution, viral distribution, and real enterprise ROI — from cinema production to custom software.
          </p>
        </div>
      </header>

      <main className="blog-main-section">
        <div className="capabilities-listing-grid">
          {PILLARS_LIST.map((pillar) => (
            <CapabilityCard key={pillar.slug} pillar={pillar} />
          ))}
        </div>

        {/* Global CTA Section */}
        <div className="capabilities-bottom-cta">
          <div className="capabilities-bottom-cta-inner">
            <span className="capability-cta-badge">ARCHITECT YOUR ENGINE</span>
            <h2>Execute across all nine pillars seamlessly.</h2>
            <p>
              Whether you need end-to-end management or surgical execution in a single discipline, our team delivers predictable, high-impact growth.
            </p>
            <div style={{ marginTop: '24px' }}>
              <a href="/#eternity" className="capability-cta-btn">
                <span>Start a Conversation</span>
                <ArrowRight size={16} />
              </a>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

// ============================================================
// MAIN CAPABILITIES COMPONENT ROUTER
// ============================================================
export default function Capabilities() {
  const { slug } = useParams();
  return slug ? <CapabilityDetail slug={slug} /> : <CapabilitiesListing />;
}
