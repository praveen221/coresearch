import type { Metadata } from 'next';
import type { ReactNode, ReactElement } from 'react';
import { Theme } from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Coresearch', template: '%s · Coresearch' }, description: 'Your local research workspace.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>): ReactElement {
  return (
    <html lang="en">
      <body>
        <Theme appearance="light" accentColor="gray" grayColor="gray" radius="small" panelBackground="solid">
          {children}
        </Theme>
      </body>
    </html>
  );
}
