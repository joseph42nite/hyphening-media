import React, { useState, useEffect } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { isNative, API_BASE } from './api.js';
import Login from './views/Login.jsx';
import Dashboard from './views/Dashboard.jsx';
import ClientPortal from './views/ClientPortal.jsx';
import Toast from './components/Toast.jsx';

// Lazy-load Landing page — never fetched on mobile (saves ~60KB + game canvas)
const Landing = React.lazy(() => import('./views/Landing.jsx'));
const Blog = React.lazy(() => import('./views/Blog.jsx'));

// WebViews need HashRouter — no server-side routing fallback for client-side routes
const Router = isNative ? HashRouter : BrowserRouter;

function App() {
  const [auth, setAuth] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  // Verify auth session against backend
  const verifySession = async () => {
    if (!localStorage.getItem('user')) return;
    try {
      let res = await fetch(`${API_BASE}/api/auth/me`, { credentials: 'include' });
      if (res.status === 401) {
        // Attempt token refresh
        const refreshRes = await fetch(`${API_BASE}/api/auth/refresh`, { method: 'POST', credentials: 'include' });
        if (refreshRes.ok) {
          res = await fetch(`${API_BASE}/api/auth/me`, { credentials: 'include' });
        }
      }
      if (res.ok) {
        const userData = await res.json();
        setAuth(userData);
        localStorage.setItem('user', JSON.stringify(userData));
      } else {
        localStorage.removeItem('user');
        setAuth(null);
        showToast('Session expired. Please log in again.', 'error');
      }
    } catch (err) {
      console.warn('Session verification failed:', err);
    }
  };

  // Initialize auth on boot and re-verify whenever user returns to tab
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        setAuth(JSON.parse(savedUser));
        verifySession();
      } catch (err) {
        localStorage.removeItem('user');
      }
    }

    let lastChecked = Date.now();
    const handleFocusOrVisibility = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        // Check at most once every 10s on tab focus/refocus
        if (now - lastChecked > 10000) {
          lastChecked = now;
          verifySession();
        }
      }
    };

    window.addEventListener('focus', handleFocusOrVisibility);
    document.addEventListener('visibilitychange', handleFocusOrVisibility);

    return () => {
      window.removeEventListener('focus', handleFocusOrVisibility);
      document.removeEventListener('visibilitychange', handleFocusOrVisibility);
    };
  }, []);

  return (
    <Router>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Routes>
          {/* On mobile: skip landing, go straight to login or dashboard */}
          {/* On web: show the public landing page */}
          <Route 
            path="/" 
            element={
              isNative
                ? <Navigate to={auth ? "/dashboard" : "/login"} replace />
                : <React.Suspense fallback={null}><Landing /></React.Suspense>
            } 
          />

          {/* Main Workspace Ops Login */}
          <Route 
            path="/login" 
            element={
              auth ? <Navigate to="/dashboard" replace /> : <Login setAuth={setAuth} showToast={showToast} />
            } 
          />
          
          {/* Main Ops Dashboard */}
          <Route 
            path="/dashboard" 
            element={
              auth ? <Dashboard auth={auth} setAuth={setAuth} showToast={showToast} /> : <Navigate to="/login" replace />
            } 
          />

          {/* Secure Client Portal */}
          <Route 
            path="/portal/:token" 
            element={<ClientPortal showToast={showToast} />} 
          />

          {/* Public Blog */}
          <Route 
            path="/blog" 
            element={<React.Suspense fallback={null}><Blog /></React.Suspense>}
          />
          <Route 
            path="/blog/:slug" 
            element={<React.Suspense fallback={null}><Blog /></React.Suspense>}
          />

          {/* Fallback routes */}
          <Route 
            path="*" 
            element={<Navigate to={auth ? "/dashboard" : (isNative ? "/login" : "/")} replace />} 
          />
        </Routes>

        {/* Global Toast Notification */}
        {toast && (
          <Toast 
            message={toast.message} 
            type={toast.type} 
            onClose={() => setToast(null)} 
          />
        )}
      </div>
    </Router>
  );
}

export default App;
