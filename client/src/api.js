import axios from 'axios';

// Same-origin requests work on localhost, LAN devices, and behind the Docker proxy.
export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });
api.interceptors.request.use(config => {
  const token = localStorage.getItem('mv_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function apiError(error) {
  return error?.response?.data?.message || error.message || 'Something went wrong';
}
