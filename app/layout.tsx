import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { QueryProvider } from '@/components/providers/QueryProvider'
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

/** Global app metadata for the Next.js document head. */
export const metadata: Metadata = {
  title: "HDO Turnusplan",
  description: "Shift scheduling system for HDO",
}

/** Root HTML layout wrapper for the entire app. */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="no" className="dark">
      <body className={inter.className}>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  )
}

