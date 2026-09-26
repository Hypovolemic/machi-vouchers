import type { Metadata } from 'next';
import { IBM_Plex_Sans_JP } from 'next/font/google';
import { Nav } from '@/components/nav';
import './globals.css';

const plex = IBM_Plex_Sans_JP({
  variable: '--font-plex',
  weight: ['400', '500', '600'],
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Machi Vouchers',
  description: 'Local premium vouchers and a shopping-street stamp rally on Sui testnet.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={plex.variable}>
      <body>
        <div className="banner">
          Live on Sui testnet · demo accounts signed by this server · demo yen (dJPY), no real money
        </div>
        <Nav />
        <main>{children}</main>
        <footer className="foot">
          Machi Vouchers · built solo for ETHGlobal Tokyo 2026 · fictional shops in a demo city
        </footer>
      </body>
    </html>
  );
}
