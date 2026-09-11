import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Navbar from '../components/Navbar';
import SEOHead from '../components/SEOHead';
import Scene from '../components/Scene';

/* ==========================================================================
   SCENE ERROR BOUNDARY
   ========================================================================== */
class SceneErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.warn('SceneErrorBoundary caught:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="shader-frame">
          <iframe
            src="/landing-pages/kage.html?v=ing-media-17"
            title="Hyphening Media — Where craft scales into performance"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          />
        </div>
      );
    }
    return this.props.children;
  }
}

/* ==========================================================================
   LANDING PAGE — Main Component (3D Kyoto Temple World as Final Website)
   ========================================================================== */
function Landing() {
  const location = useLocation();

  // Ensure body and root take full viewport without outer window scrollbar
  useEffect(() => {
    const body = document.body;
    const root = document.getElementById('root');
    const origBodyPad = body.style.padding;
    const origBodyOverflow = body.style.overflow;
    const origRootMax = root.style.maxWidth;

    body.style.padding = '0';
    body.style.overflow = 'hidden';
    root.style.maxWidth = 'none';

    return () => {
      body.style.padding = origBodyPad;
      body.style.overflow = origBodyOverflow;
      root.style.maxWidth = origRootMax;
    };
  }, []);

  // Handle hash scrolling on mount or route change directly into the 3D experience
  useEffect(() => {
    if (location.hash) {
      const targetId = location.hash.substring(1);
      const timer = setTimeout(() => {
        const iframe = document.querySelector('.landing-page-frame iframe') || document.querySelector('iframe');
        if (iframe && iframe.contentWindow) {
          const idMap = {
            'our-story': 'gate',
            'story': 'gate',
            'gate': 'gate',
            'capabilities': 'lessons',
            'services': 'lessons',
            'lessons': 'lessons',
            'portfolio': 'pathways',
            'pathways': 'pathways',
            'faq': 'faq',
            'contact': 'eternity',
            'partners': 'eternity',
            'eternity': 'eternity',
            'top': 'top',
            'hero': 'top'
          };
          const target = idMap[targetId] || targetId;
          try {
            if (typeof iframe.contentWindow.navigateToSection === 'function') {
              iframe.contentWindow.navigateToSection(target);
              return;
            }
          } catch (e) {}

          iframe.contentWindow.postMessage({ type: 'NAVIGATE_TO_SECTION', targetId: target }, '*');

          try {
            const el = iframe.contentDocument?.getElementById(target);
            if (el) {
              iframe.contentWindow.scrollTo({
                top: target === 'top' ? 0 : Math.max(0, el.offsetTop - 50),
                behavior: 'smooth'
              });
            }
          } catch (e) {}
        }
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [location]);

  return (
    // height comes from .landing-root so the 100vh→100svh fallback applies;
    // an inline height would win over it and reintroduce the mobile wobble
    <div className="landing-root" style={{ width: '100%', overflow: 'hidden', position: 'relative' }}>
      <SEOHead 
        title="Hyphening Media | Creative Operations & Marketing Performance Agency" 
        canonicalUrl="https://hypheningmedia.com/" 
      />

      {/* ===== Fixed Navigation ===== */}
      <Navbar />

      {/* ===== 3D Kyoto Temple Interactive World (Kage — The Complete Experience) ===== */}
      <section className="kage-hero-section" id="scene" style={{ width: '100%', position: 'absolute', inset: 0 }}>
        <SceneErrorBoundary>
          <Scene />
        </SceneErrorBoundary>
      </section>

      {/* JSON-LD Structured Data Schema for SEO & AEO */}
      <script 
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "FAQPage",
                "@id": "https://hypheningmedia.com/#faq",
                "mainEntity": [
                  {
                    "@type": "Question",
                    "name": "What is Hyphening Media?",
                    "acceptedAnswer": {
                      "@type": "Answer",
                      "text": "Hyphening Media is a premium creative operations and marketing agency that scales D2C, F&B, and healthcare brands through data-driven content strategy, video production, social media operations, and full-stack web and app development."
                    }
                  },
                  {
                    "@type": "Question",
                    "name": "What services does Hyphening Media offer?",
                    "acceptedAnswer": {
                      "@type": "Answer",
                      "text": "Hyphening Media offers comprehensive services including content strategy, short and long form video production, multi-platform social media operations, custom high-performance web development, mobile app development, performance analytics, conversion-optimized campaign management, visual brand identity development, and news media PR."
                    }
                  },
                  {
                    "@type": "Question",
                    "name": "How does Hyphening Media scale D2C and F&B brands?",
                    "acceptedAnswer": {
                      "@type": "Answer",
                      "text": "Hyphening Media scales brands using a data-driven content engine, creator and influencer collaborations, and operational automation dashboards. We focus on real performance metrics like CTR, conversions, and organic views rather than vanity metrics."
                    }
                  },
                  {
                    "@type": "Question",
                    "name": "Does Hyphening Media provide custom analytics and client portals?",
                    "acceptedAnswer": {
                      "@type": "Answer",
                      "text": "Yes, Hyphening Media provides all client partners with an automated secure Client Portal where they can review marketing scripts, track active video and design tasks in real-time, view platform-specific performance analytics, and manage creative campaigns."
                    }
                  }
                ]
              },
              {
                "@type": "ProfessionalService",
                "@id": "https://hypheningmedia.com/#organization",
                "name": "Hyphening Media",
                "url": "https://hypheningmedia.com",
                "image": "https://hypheningmedia.com/favicon.png",
                "address": {
                  "@type": "PostalAddress",
                  "addressLocality": "Mumbai",
                  "addressRegion": "Maharashtra",
                  "addressCountry": "IN"
                },
                "sameAs": [
                  "https://www.instagram.com/hypheningmedia/",
                  "https://www.linkedin.com/company/104980691/"
                ]
              }
            ]
          })
        }}
      />
    </div>
  );
}

export default Landing;
