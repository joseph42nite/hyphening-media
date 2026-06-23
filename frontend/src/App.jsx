import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './views/Login.jsx';
import Dashboard from './views/Dashboard.jsx';
import ClientPortal from './views/ClientPortal.jsx';
import Toast from './components/Toast.jsx';

function App() {
  const [auth, setAuth] = useState(null);
  const [toast, setToast] = useState(null);

  // Initialize auth from localStorage on boot
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        setAuth(JSON.parse(savedUser));
      } catch (err) {
        localStorage.removeItem('user');
      }
    }
  }, []);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  return (
    <Router>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Routes>
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

          {/* Fallback routes */}
          <Route 
            path="*" 
            element={<Navigate to={auth ? "/dashboard" : "/login"} replace />} 
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
