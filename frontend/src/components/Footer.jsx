import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import logoImg from '../assets/logo.png';

const InstagramIcon = ({ size = 18, className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

const LinkedinIcon = ({ size = 18, className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect width="4" height="12" x="2" y="9" />
    <circle cx="4" cy="4" r="2" />
  </svg>
);

const MailIcon = ({ size = 18, className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect width="20" height="16" x="2" y="4" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

export default function Footer() {
  const navigate = useNavigate();
  const location = useLocation();
  const isHomePage = location.pathname === '/';

  const handleNavClick = (sectionId) => {
    if (isHomePage) {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
    } else {
      navigate(`/#${sectionId}`);
      setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
      }, 150);
    }
  };

  return (
    <footer className="landing-footer-detailed">
      <div className="footer-grid">
        {/* Brand Column */}
        <div className="footer-col brand-col">
          <Link
            to="/"
            className="footer-logo"
            style={{ display: 'inline-block', cursor: 'pointer' }}
            onClick={(e) => {
              if (isHomePage) {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
          >
            <img 
              src={logoImg} 
              alt="Hyphening Media" 
              style={{ height: '120px', width: 'auto', marginTop: '-15px', marginBottom: '-15px', filter: 'invert(1)' }} 
            />
          </Link>
          <p className="footer-desc">
            We design and scale creative operations for forward-thinking brands. 
            From content strategy to high-performance web development.
          </p>
        </div>
        
        {/* Navigation Links Column */}
        <div className="footer-col links-col">
          <h4>Navigation</h4>
          <a href="/#our-story" onClick={(e) => { e.preventDefault(); handleNavClick('our-story'); }}>Our Story</a>
          <a href="/#capabilities" onClick={(e) => { e.preventDefault(); handleNavClick('capabilities'); }}>Services</a>
          <a href="/#portfolio" onClick={(e) => { e.preventDefault(); handleNavClick('portfolio'); }}>Portfolio</a>
          <a href="/#faq" onClick={(e) => { e.preventDefault(); handleNavClick('faq'); }}>FAQ</a>
          <a href="/#contact" onClick={(e) => { e.preventDefault(); handleNavClick('contact'); }}>Contact Us</a>
          <Link to="/blog">Blog</Link>
        </div>
        
        {/* Social & Contact Column */}
        <div className="footer-col social-col">
          <h4>Connect</h4>
          <div className="social-links">
            <a href="https://instagram.com/hyphening" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
              <InstagramIcon size={18} /> Instagram
            </a>
            <a href="https://linkedin.com/company/hyphening" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
              <LinkedinIcon size={18} /> LinkedIn
            </a>
            <a href="mailto:hello@hyphening.com">
              <MailIcon size={18} /> hello@hyphening.com
            </a>
          </div>
        </div>
      </div>
      
      {/* Bottom Bar */}
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} HYPHENING MEDIA. All rights reserved.</span>
        <span>Creative Operations Agency</span>
      </div>
    </footer>
  );
}
