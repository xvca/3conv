import localFont from 'next/font/local'
import AppReveal from './components/AppReveal'
import './globals.css'

const sourceSerif = localFont({
  src: '../node_modules/@fontsource-variable/source-serif-4/files/source-serif-4-latin-opsz-normal.woff2',
  weight: '200 900',
  style: 'normal',
  display: 'swap',
  preload: true,
  variable: '--font-serif',
  fallback: ['Georgia', 'serif'],
})

export const metadata = {
  title: '3conv',
  description: 'Convert media with natural language',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={sourceSerif.variable} style={{ backgroundColor: '#faf8f5' }}>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body>
        <AppReveal>{children}</AppReveal>
        <noscript><p className="noscript-note">Please enable JavaScript to use the media converter.</p></noscript>
      </body>
    </html>
  )
}
