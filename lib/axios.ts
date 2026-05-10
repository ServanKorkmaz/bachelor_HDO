import axios from 'axios'

/** Shared axios instance for all API calls. */
export const axiosInstance = axios.create({
  baseURL: typeof window !== 'undefined' ? '' : process.env.NEXT_PUBLIC_API_URL || '',
  headers: {
    'Content-Type': 'application/json',
  },
})

export default axiosInstance
