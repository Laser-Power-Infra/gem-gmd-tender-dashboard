import './globals.css';

export const metadata = {
  title: 'GeM Bid & Reverse Auction (RA) Dashboard',
  description: 'G.M. DALUI Automated Bid Intelligence & GeM Scraper Portal',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
