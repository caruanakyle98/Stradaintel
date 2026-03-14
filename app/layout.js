export const metadata = {
  title: 'Strada Intelligence · Dubai Market Tracker',
  description: 'Live Dubai real estate market intelligence',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body style={{ margin: 0, background: '#080a08' }} suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
