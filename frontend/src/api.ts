import axios from 'axios';

const api = axios.create({
  baseURL: (import.meta as { env: { VITE_API_URL?: string } }).env.VITE_API_URL || ''
});

export default api;
