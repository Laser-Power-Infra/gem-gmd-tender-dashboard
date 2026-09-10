import './globals.css';

export const metadata = {
  title: 'G.M. DALUI — GeM Bid & Reverse Auction (RA) Dashboard',
  description: 'G.M. DALUI Automated Bid Intelligence & GeM Scraper Portal',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
