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
              background: 'rgba(10, 14, 18, 0.85)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(223, 231, 224, 0.14)',
              padding: '44px 28px',
              borderRadius: '20px',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.8), 0 0 30px rgba(224, 35, 28, 0.15)',
              textAlign: 'center',
              marginTop: '32px'
            }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                borderRadius: '999px',
                background: 'rgba(224, 35, 28, 0.15)',
                border: '1px solid rgba(224, 35, 28, 0.4)',
                color: '#ff5a3c',
                fontSize: '0.75rem',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                fontWeight: 600,
                marginBottom: '16px'
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#e0231c', boxShadow: '0 0 8px #e0231c' }} />
                Transmission Received
              </div>
              <h3 style={{ margin: '0 0 12px', fontSize: '1.8rem', fontWeight: 600, color: '#dfe7e0', letterSpacing: '-0.01em' }}>Thank You, {formData.name}</h3>
              <p style={{ margin: 0, color: '#aab4ad', fontSize: '0.95rem', lineHeight: '1.6' }}>
                We have received your details. One of our creative operations leads will reach out to you within 24 hours.
              </p>
            </div>
          ) : (
            <form onSubmit={handleFormSubmit} style={{
              textAlign: 'left',
              marginTop: '32px',
              background: 'rgba(10, 14, 18, 0.85)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(223, 231, 224, 0.14)',
              padding: '36px 32px',
              borderRadius: '20px',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.8), 0 0 35px rgba(224, 35, 28, 0.12)',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px'
            }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: '#aab4ad' }}>Name *</label>
                <input
                  type="text"
                  placeholder="Enter your name"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  required
                  style={{
                    background: 'rgba(5, 7, 10, 0.75)',
                    border: '1px solid rgba(223, 231, 224, 0.15)',
                    color: '#dfe7e0',
                    padding: '12px 16px',
                    borderRadius: '10px',
                    width: '100%',
                    fontSize: '0.95rem',
                    outline: 'none',
                    transition: 'border-color 0.2s, box-shadow 0.2s'
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = '#e0231c';
                    e.target.style.boxShadow = '0 0 12px rgba(224, 35, 28, 0.3)';
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = 'rgba(223, 231, 224, 0.15)';
                    e.target.style.boxShadow = 'none';
                  }}
                />
              </div>
              
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: '#aab4ad' }}>Email Address *</label>
                <input
                  type="email"
                  placeholder="name@company.com"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  required
                  style={{
                    background: 'rgba(5, 7, 10, 0.75)',
                    border: '1px solid rgba(223, 231, 224, 0.15)',
                    color: '#dfe7e0',
                    padding: '12px 16px',
                    borderRadius: '10px',
                    width: '100%',
                    fontSize: '0.95rem',
                    outline: 'none',
                    transition: 'border-color 0.2s, box-shadow 0.2s'
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = '#e0231c';
                    e.target.style.boxShadow = '0 0 12px rgba(224, 35, 28, 0.3)';
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = 'rgba(223, 231, 224, 0.15)';
                    e.target.style.boxShadow = 'none';
                  }}
                />
              </div>
              
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: '#aab4ad' }}>Company Name / Website</label>
                <input
                  type="text"
                  placeholder="e.g. Acme Agency"
                  value={formData.company}
                  onChange={e => setFormData({ ...formData, company: e.target.value })}
                  style={{
                    background: 'rgba(5, 7, 10, 0.75)',
                    border: '1px solid rgba(223, 231, 224, 0.15)',
                    color: '#dfe7e0',
                    padding: '12px 16px',
                    borderRadius: '10px',
                    width: '100%',
                    fontSize: '0.95rem',
                    outline: 'none',
                    transition: 'border-color 0.2s, box-shadow 0.2s'
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = '#e0231c';
                    e.target.style.boxShadow = '0 0 12px rgba(224, 35, 28, 0.3)';
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = 'rgba(223, 231, 224, 0.15)';
                    e.target.style.boxShadow = 'none';
                  }}
                />
              </div>
              
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: '#aab4ad' }}>What are your goals?</label>
                <textarea
                  placeholder="What channels are you focused on? Tell us about your creative goals..."
                  value={formData.message}
                  onChange={e => setFormData({ ...formData, message: e.target.value })}
                  rows="4"
                  style={{
                    background: 'rgba(5, 7, 10, 0.75)',
                    border: '1px solid rgba(223, 231, 224, 0.15)',
                    color: '#dfe7e0',
                    padding: '12px 16px',
                    borderRadius: '10px',
                    width: '100%',
                    fontSize: '0.95rem',
                    fontFamily: 'inherit',
                    outline: 'none',
                    resize: 'vertical',
                    transition: 'border-color 0.2s, box-shadow 0.2s'
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = '#e0231c';
                    e.target.style.boxShadow = '0 0 12px rgba(224, 35, 28, 0.3)';
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = 'rgba(223, 231, 224, 0.15)';
                    e.target.style.boxShadow = 'none';
                  }}
                />
              </div>
              
              <button
                type="submit"
                style={{
                  width: '100%',
                  padding: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  marginTop: '8px',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  background: '#e0231c',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  boxShadow: '0 0 24px rgba(224, 35, 28, 0.45)',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = '#ff382e';
                  e.currentTarget.style.boxShadow = '0 0 32px rgba(224, 35, 28, 0.65)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = '#e0231c';
                  e.currentTarget.style.boxShadow = '0 0 24px rgba(224, 35, 28, 0.45)';
                  e.currentTarget.style.transform = 'none';
                }}
              >
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
              <a href="https://www.instagram.com/hypheningmedia/" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                <InstagramIcon size={18} /> Instagram
              </a>
              <a href="https://www.linkedin.com/company/104980691/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
                <LinkedinIcon size={18} /> LinkedIn
              </a>
              <a href="mailto:deepanjan@hypheningmedia.com">
                <MailIcon size={18} /> deepanjan@hypheningmedia.com
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
