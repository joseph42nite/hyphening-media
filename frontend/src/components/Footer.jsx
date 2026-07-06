import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
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

export default function Footer({ showCta = true }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isHomePage = location.pathname === '/';

  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', company: '', message: '' });

  const handleFormSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
  };

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
    <>
      {/* ===== Footer CTA ===== */}
      {showCta && (
        <div className="landing-footer-cta" id="contact">
          <h2>Ready to Scale Your Brand?</h2>
          <p>
            Let's build a content engine that works while you sleep. Tell us about your brand 
            and we'll draft a custom 90-day growth plan.
          </p>

          {submitted ? (
            <div style={{
              background: '#ffffff',
              border: '3px solid #000000',
              padding: '40px 24px',
              borderRadius: '16px',
              boxShadow: '6px 6px 0px #000000',
              textAlign: 'center',
              marginTop: '32px'
            }}>
              <h3 style={{ margin: '0 0 12px', fontSize: '1.8rem', fontWeight: 900, textTransform: 'uppercase' }}>Thank You, {formData.name}!</h3>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '1rem', lineHeight: '1.5' }}>
                We have received your details. One of our creative operations leads will reach out to you within 24 hours.
              </p>
            </div>
          ) : (
            <form onSubmit={handleFormSubmit} style={{
              textAlign: 'left',
              marginTop: '32px',
              background: '#ffffff',
              border: '3px solid #000000',
              padding: '32px',
              borderRadius: '16px',
              boxShadow: '6px 6px 0px #000000',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px'
            }}>
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 800, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#000000' }}>Name *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Enter your name"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  required
                  style={{ border: '3px solid #000000', padding: '12px 16px', borderRadius: '8px', width: '100%' }}
                />
              </div>
              
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 800, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#000000' }}>Email Address *</label>
                <input
                  type="email"
                  className="form-control"
                  placeholder="name@company.com"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  required
                  style={{ border: '3px solid #000000', padding: '12px 16px', borderRadius: '8px', width: '100%' }}
                />
              </div>
              
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 800, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#000000' }}>Company Name / Website</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Acme Agency"
                  value={formData.company}
                  onChange={e => setFormData({ ...formData, company: e.target.value })}
                  style={{ border: '3px solid #000000', padding: '12px 16px', borderRadius: '8px', width: '100%' }}
                />
              </div>
              
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 800, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#000000' }}>What are your goals?</label>
                <textarea
                  className="form-control"
                  placeholder="What channels are you focused on? Tell us about your creative goals..."
                  value={formData.message}
                  onChange={e => setFormData({ ...formData, message: e.target.value })}
                  rows="4"
                  style={{ border: '3px solid #000000', padding: '12px 16px', borderRadius: '8px', width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>
              
              <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '14px', justifyContent: 'center', marginTop: '8px', fontSize: '1rem', fontWeight: 800 }}>
                Submit Details <ArrowRight size={16} />
              </button>
            </form>
          )}
        </div>
      )}

      {/* ===== Detailed Footer ===== */}
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
    </>
  );
}
