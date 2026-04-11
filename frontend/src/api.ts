import axios from 'axios';

const api = axios.create({
  baseURL: (import.meta as { env: { VITE_API_URL?: string } }).env.VITE_API_URL || 'https://team12.me'
});

export default api;
