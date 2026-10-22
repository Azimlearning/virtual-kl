import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Fraunces, Instrument_Sans, JetBrains_Mono } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

// Display serif for headlines and big numerals, a humanist sans for body, mono for data labels.
const fraunces = Fraunces({ variable: '--font-fraunces', subsets: ['latin'], axes: ['opsz'] })
const instrument = Instrument_Sans({ variable: '--font-instrument', subsets: ['latin'] })
const jetbrains = JetBrains_Mono({ variable: '--font-jetbrains', subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    default: 'Virtual KL — township resilience hub',
    template: '%s · Virtual KL',
  },
  applicationName: 'Virtual KL',
  description:
    'Virtual KL fuses live haze, weather and incident data for Kuala Lumpur, anticipates trouble with a proactive AI agent, and lets operators rehearse warnings on a 3D digital twin with simulated residents. Built on CISE for the Sime Darby Property University Hackathon 2026.',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f3ea' },
    { media: '(prefers-color-scheme: dark)', color: '#10201f' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fraunces.variable} ${instrument.variable} ${jetbrains.variable} bg-background`}
    >
      <body className="font-sans antialiased">
        <ThemeProvider>
          {children}
          <Toaster position="top-right" richColors />
        </ThemeProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
