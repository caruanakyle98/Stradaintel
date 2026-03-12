export const metadata = {
  title: 'Strada Intelligence · Dubai Market Tracker',
  description: 'Live Dubai real estate market intelligence',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#080a08' }}>{children}</body>
    </html>
  )
}
