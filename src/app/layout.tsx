import type { Metadata } from 'next';
import type { ReactNode, ReactElement } from 'react';
import { IBM_Plex_Mono, Instrument_Sans, Newsreader } from 'next/font/google';
import { cookies } from 'next/headers';
import { Theme } from '@radix-ui/themes';
import { appearanceCookie, parseAppearance, systemAppearance } from '../lib/appearance.ts';
import '@radix-ui/themes/styles.css';
import './globals.css';

const serif = Newsreader({ subsets: ['latin'], variable: '--font-serif', display: 'swap', style: ['normal', 'italic'] });
const sans = Instrument_Sans({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Coresearch', template: '%s · Coresearch' }, description: 'Your local research workspace.',
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>): Promise<ReactElement> {
  const appearance = parseAppearance((await cookies()).get(appearanceCookie)?.value);
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}${appearance === null ? '' : ` ${appearance}`}`}
      suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: systemAppearance }} /></head>
      <body>
        <Theme accentColor="indigo" grayColor="sand" radius="small" panelBackground="solid">
          {children}
        </Theme>
      </body>
    </html>
  );
}
