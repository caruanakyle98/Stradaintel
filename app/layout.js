import { C } from '../lib/theme.js';

export const metadata = {
  title: 'Strada Intelligence · Dubai Market Tracker',
  description: 'Live Dubai real estate market intelligence',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body style={{ margin: 0, background: C.bg }} suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
