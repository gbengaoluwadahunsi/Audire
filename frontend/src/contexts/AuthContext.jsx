/**
 * No-auth — app runs without sign-in. useAuth() available for any future use.
 */
import React, { createContext, useContext } from 'react';

const AuthContext = createContext(null);

const NO_AUTH_VALUE = {
  user: null,
  profile: null,
  loading: false,
  premium: false,
  refreshProfile: () => {},
};

export function AuthProvider({ children }) {
  return (
    <AuthContext.Provider value={NO_AUTH_VALUE}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
