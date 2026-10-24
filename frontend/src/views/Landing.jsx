import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
            src="/landing-pages/kage.html?v=ing-media-19"
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
  const navigate = useNavigate();

  // Listen for navigation requests posted from inside the 3D scene iframe
  useEffect(() => {
    const handleMessage = (e) => {
      if (e.data && e.data.type === 'NAVIGATE_ROUTE' && e.data.url) {
        navigate(e.data.url);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [navigate]);

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
        title="Hyphening Media | Creative Ops & Marketing Agency in Bengaluru"
        description="Hyphening Media is a Bengaluru-based creative operations agency scaling D2C, B2B, F&B, and healthcare brands with high-performance content, video, web apps, and automated marketing dashboards."
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

      {/* ProfessionalService JSON-LD now lives in frontend/index.html (server-rendered,
          sitewide). FAQPage JSON-LD + the crawlable content summary are injected
          server-side for "/" only in server.js's SPA-fallback handler, so non-JS
          crawlers see them in the raw HTML instead of only after this component mounts. */}
    </div>
  );
}

export default Landing;
