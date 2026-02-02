import { redirect } from 'next/navigation'

/** Redirect app root to the standard schedule view. */
export default function HomePage() {
  redirect('/standard')
}

