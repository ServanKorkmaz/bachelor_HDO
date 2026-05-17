import axios from 'axios'

/**
 * Shared axios instance for all API calls. Cookies are sent automatically
 * by the browser for same-origin requests, so no per-request interceptor
 * is needed for auth.
 */
export const axiosInstance = axios.create({
  baseURL: typeof window !== 'undefined' ? '' : process.env.NEXT_PUBLIC_API_URL || '',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

export default axiosInstance
