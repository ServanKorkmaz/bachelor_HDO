import axios from 'axios'
import { useAuth } from '@/lib/auth/mockAuth'

/** Shared axios instance for all API calls. */
export const axiosInstance = axios.create({
  baseURL: typeof window !== 'undefined' ? '' : process.env.NEXT_PUBLIC_API_URL || '',
  headers: {
    'Content-Type': 'application/json',
  },
})

axiosInstance.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const userId = useAuth.getState().currentUser?.id
    if (userId) {
      config.headers['x-current-user-id'] = userId
    }
  }
  return config
})

export default axiosInstance
