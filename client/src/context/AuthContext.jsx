import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api';

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('mv_user') || 'null'));
  const [loading, setLoading] = useState(Boolean(localStorage.getItem('mv_token')));

  useEffect(() => {
    if (!localStorage.getItem('mv_token')) return setLoading(false);
    api.get('/auth/me').then(({ data }) => {
      const safe = { ...data, id: data._id };
      setUser(safe); localStorage.setItem('mv_user', JSON.stringify(safe));
    }).catch(() => logout()).finally(() => setLoading(false));
  }, []);

  function saveAuth(data) {
    localStorage.setItem('mv_token', data.token);
    const safe = { ...data.user, id: data.user.id || data.user._id };
    localStorage.setItem('mv_user', JSON.stringify(safe)); setUser(safe);
  }
  async function login(email, password) { const { data } = await api.post('/auth/login', { email, password }); saveAuth(data); return data; }
  async function register(payload) { const { data } = await api.post('/auth/register', payload); saveAuth(data); return data; }
  function logout() { localStorage.removeItem('mv_token'); localStorage.removeItem('mv_user'); setUser(null); }
  const value = useMemo(() => ({ user, loading, login, register, logout, setUser }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
