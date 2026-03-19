import { Montserrat, Poppins } from 'next/font/google';
import { C } from '../lib/theme.js';

export const metadata = {
  title: 'Strada Intelligence · Dubai Market Tracker',
  description: 'Live Dubai real estate market intelligence',
};

/** Required for mobile: without this, the page renders at ~980px and feels like a zoomed PDF. */
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: C.bg,
};

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-montserrat',
});

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-poppins',
});

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${montserrat.variable} ${poppins.variable}`}>
      <body
        style={{
          margin: 0,
          background: C.bg,
          fontFamily: 'var(--font-poppins, -apple-system, \"Segoe UI\", sans-serif)',
        }}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  )
}
