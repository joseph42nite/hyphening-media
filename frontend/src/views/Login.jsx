import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';
import { API_BASE, isNative } from '../api.js';
import logoImg from '../assets/logo.png';
import SEOHead from '../components/SEOHead';

export default function Login({ setAuth, showToast }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      showToast('Please fill in all fields', 'error');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      showToast('Logged in successfully', 'success');
      setAuth(data);
      localStorage.setItem('user', JSON.stringify(data));
      navigate('/dashboard');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="landing-root login-view-wrapper">
      <SEOHead 
        title="Sign In — Hyphening Media | Ops Command Center" 
        description="Authorized access for Hyphening Media operational personnel and campaign managers."
        canonicalUrl="https://hypheningmedia.com/login"
      />

      {/* Atmospheric Background Lights */}
      <div className="login-ambient-glow" />
      <div className="login-vignette" />

      {/* Floating Back Button (hidden on mobile native wrapper) */}
      {!isNative && (
        <button
          onClick={() => navigate('/')}
          className="login-back-btn"
          title="Return to Home"
          aria-label="Return to Home"
        >
          <ArrowLeft size={16} />
          <span>Return Home</span>
        </button>
      )}

      {/* Center Portal Box */}
      <div className="login-card-container">
        <div className="login-glass-card">
          {/* Eyebrow Pill */}
          <div className="login-eyebrow">
            <span className="login-eyebrow-dot" />
            <span>OPERATIONS COMMAND CENTER</span>
          </div>

          {/* Logo Header */}
          <div className="login-header">
            <Link to="/" className="login-logo-link">
              <img 
                src={logoImg} 
                alt="Hyphening Media Logo" 
                className="login-logo-img"
              />
            </Link>
            <h1 className="login-title">Sign In</h1>
            <p className="login-subtitle">
              Authorized access to internal marketing pipelines & operations
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="login-form">
            <div className="login-field-group">
              <label className="login-field-label">Email Address</label>
              <input
                type="email"
                className="login-field-input"
                placeholder="operator@hyphening.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="login-field-group">
              <div className="login-label-row">
                <label className="login-field-label">Password</label>
              </div>
              <div className="login-password-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="login-field-input login-password-input"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="login-eye-toggle"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            <button 
              type="submit" 
              className="login-submit-btn" 
              disabled={loading}
            >
              {loading ? (
                <span className="login-btn-loading">
                  <span className="login-spinner" />
                  Authenticating...
                </span>
              ) : (
                <span className="login-btn-text">
                  Authenticate <Lock size={15} />
                </span>
              )}
            </button>
          </form>

          {/* Security Footnote */}
          <div className="login-security-badge">
            <span className="login-pulse-dot" />
            <ShieldCheck size={14} className="login-shield-icon" />
            <span>256-Bit Encrypted Portal · Authorized Staff Only</span>
          </div>
        </div>
      </div>
    </div>
  );
}
