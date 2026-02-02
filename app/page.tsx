import { redirect } from 'next/navigation'

/** Redirect root route to the standard schedule view. */
export default function Home() {
  redirect('/standard')
}

