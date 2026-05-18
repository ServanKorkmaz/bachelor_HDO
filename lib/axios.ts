import axios, { AxiosError } from 'axios'

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

/**
 * Pull the server-side error message out of an Axios error, falling back to
 * the provided default. Every route handler in this app returns an
 * `{ error: string }` payload on failure, so the same extraction works
 * everywhere. Use this in mutation `onError` and `catch` blocks instead of
 * casting to `any` and reaching into `response.data.error` by hand.
 */
export function apiErrorMessage(err: unknown, fallback: string = 'Nettverksfeil'): string {
  if (axios.isAxiosError(err)) {
    const data = (err as AxiosError<{ error?: string }>).response?.data
    if (data && typeof data.error === 'string' && data.error.length > 0) {
      return data.error
    }
    if (err.message) return err.message
  } else if (err instanceof Error && err.message) {
    return err.message
  }
  return fallback
}
