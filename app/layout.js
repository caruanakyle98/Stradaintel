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

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body style={{ margin: 0, background: C.bg }} suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
