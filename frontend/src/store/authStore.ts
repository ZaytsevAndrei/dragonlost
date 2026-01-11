import { create } from 'zustand';
import { api } from '../services/api';

interface User {
  id: number;
  steamid: string;
  username: string;
  avatar: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  fetchUser: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  fetchUser: async () => {
    try {
      const response = await api.get('/auth/me');
      set({ user: response.data.user, loading: false });
    } catch (error) {
      set({ user: null, loading: false });
    }
  },
  logout: async () => {
    try {
      await api.post('/auth/logout');
      set({ user: null });
    } catch (error) {
      console.error('Logout failed:', error);
    }
  },
}));
