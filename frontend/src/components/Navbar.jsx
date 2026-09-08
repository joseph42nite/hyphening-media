import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, ArrowRight } from 'lucide-react';
import logoImg from '../assets/logo.png';

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isHomePage = location.pathname === '/';
  const isBlogPage = location.pathname.startsWith('/blog');

  const navigateIframeSection = (sectionId) => {
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
    const target = idMap[sectionId] || sectionId;

    const iframe = document.querySelector('.landing-page-frame iframe') || document.querySelector('iframe');
    if (iframe && iframe.contentWindow) {
      try {
        if (typeof iframe.contentWindow.navigateToSection === 'function') {
          iframe.contentWindow.navigateToSection(target);
          return;
        }
      } catch (err) {}

      iframe.contentWindow.postMessage({ type: 'NAVIGATE_TO_SECTION', targetId: target }, '*');

      try {
        const el = iframe.contentDocument?.getElementById(target);
        if (el) {
          iframe.contentWindow.scrollTo({
            top: target === 'top' ? 0 : Math.max(0, el.offsetTop - 50),
            behavior: 'smooth'
          });
        }
      } catch (err) {}
    }
  };

  const handleNavClick = (sectionId) => {
    setMenuOpen(false);
    if (isHomePage) {
      navigateIframeSection(sectionId);
    } else {
      navigate(`/#${sectionId}`);
      setTimeout(() => {
        navigateIframeSection(sectionId);
      }, 350);
    }
  };

  return (
    <>
      {/* ===== Fixed Navigation ===== */}
      <nav className="landing-nav">
        <Link 
          to="/" 
          className="landing-nav-logo" 
          style={{ display: 'flex', alignItems: 'center', height: '40px', cursor: 'pointer' }}
          onClick={(e) => {
            if (isHomePage) {
              e.preventDefault();
              navigateIframeSection('top');
            }
          }}
        >
          <img src={logoImg} alt="Hyphening Media" style={{ height: '80px', width: 'auto' }} />
        </Link>

        {/* Middle Links (Visible on desktop) */}
        <div className="landing-nav-links">
          <a href="/#our-story" onClick={(e) => { e.preventDefault(); handleNavClick('our-story'); }}>Our story</a>
          <a href="/#capabilities" onClick={(e) => { e.preventDefault(); handleNavClick('capabilities'); }}>Services</a>
          <a href="/#portfolio" onClick={(e) => { e.preventDefault(); handleNavClick('portfolio'); }}>Portfolio</a>
          <a href="/#faq" onClick={(e) => { e.preventDefault(); handleNavClick('faq'); }}>FAQ</a>
          <a href="/#contact" onClick={(e) => { e.preventDefault(); handleNavClick('contact'); }}>Contact</a>
          <Link 
            to="/blog" 
            style={isBlogPage ? { color: '#000', borderBottom: '2px solid #000' } : {}}
          >
            Blog
          </Link>
        </div>

        {/* Hamburger button on the right */}
        <button 
          className="landing-nav-hamburger" 
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          {menuOpen ? <X size={20} strokeWidth={3} /> : <Menu size={20} strokeWidth={3} />}
        </button>
      </nav>

      {/* ===== Mobile/Drawer Dropdown Menu ===== */}
      <div className={`landing-drawer ${menuOpen ? 'open' : ''}`}>
        <div className="landing-drawer-overlay" onClick={() => setMenuOpen(false)} />
        <div className="landing-drawer-content">
          <div className="landing-drawer-header">
            <Link 
              to="/" 
              className="landing-nav-logo" 
              style={{ display: 'flex', alignItems: 'center', height: '40px' }}
              onClick={() => setMenuOpen(false)}
            >
              <img src={logoImg} alt="Hyphening Media" style={{ height: '70px', width: 'auto' }} />
            </Link>
            <button className="landing-nav-hamburger close-btn" onClick={() => setMenuOpen(false)}>
              <X size={20} strokeWidth={3} />
            </button>
          </div>
          <div className="landing-drawer-links">
            <a href="/#our-story" onClick={(e) => { e.preventDefault(); handleNavClick('our-story'); }}>Our story</a>
            <a href="/#capabilities" onClick={(e) => { e.preventDefault(); handleNavClick('capabilities'); }}>Services</a>
            <a href="/#portfolio" onClick={(e) => { e.preventDefault(); handleNavClick('portfolio'); }}>Portfolio</a>
            <a href="/#faq" onClick={(e) => { e.preventDefault(); handleNavClick('faq'); }}>FAQ</a>
            <a href="/#contact" onClick={(e) => { e.preventDefault(); handleNavClick('contact'); }}>Contact</a>
            <Link 
              to="/blog" 
              onClick={() => setMenuOpen(false)}
              style={isBlogPage ? { fontWeight: 800, textDecoration: 'underline' } : {}}
            >
              Blog
            </Link>

            <div className="landing-drawer-divider" />

            <button 
              className="btn btn-primary" 
              onClick={() => { setMenuOpen(false); navigate('/login'); }} 
              style={{ width: '100%', justifyContent: 'center', marginTop: '10px' }}
            >
              Sign In <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
