import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('audire_token'));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (token) {
      localStorage.setItem('audire_token', token);
      fetchUser(token);
    } else {
      localStorage.removeItem('audire_token');
      setUser(null);
      setIsLoading(false);
    }
  }, [token]);

  const fetchUser = async (authToken) => {
    try {
      const BASE = import.meta.env.VITE_API_URL || '';
      const url = `${BASE.replace(/\/$/, '')}/api/auth/me`;
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
      } else {
        setToken(null);
      }
    } catch (err) {
      console.error('Failed to fetch user:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const login = (newToken, userData) => {
    setToken(newToken);
    setUser(userData);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
