'use client';

import { useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Box, Flex, Text } from '@radix-ui/themes';
import { AppearanceToggle } from './appearance-toggle.tsx';
import { targetListSchema } from '../lib/target-schema.ts';
import type { Target } from '../lib/target-schema.ts';
import { useLive } from './use-live.ts';
import styles from './ui.module.css';

export function targetName(target: Target): string {
  return `${target.professor} · ${target.lab ?? target.university ?? 'Independent lab'}`;
}

export function Field({ label, children }: Readonly<{ label: string; children: ReactNode }>): ReactElement {
  return <div className={styles['field']}><dt>{label}</dt><dd>{children}</dd></div>;
}

export function Value({ value }: Readonly<{ value: string | null }>): ReactElement {
  return value === null ? <Text color="gray">Not provided</Text> : <Text>{value}</Text>;
}

export function Shell({ current, initialTargets, section, step, wide = false, children }: Readonly<{
  current: 'home' | 'profile' | 'ideas' | 'new' | 'method' | 'outreach' | 'export' | number; initialTargets: Target[]; section: string; step: string;
  wide?: boolean; children: ReactNode;
}>): ReactElement {
  const { value: targets } = useLive('/api/targets', targetListSchema, initialTargets);
  const labs = targets.filter((target) => target.pathway === 'proposal');
  const pitches = targets.filter((target) => target.pathway === 'pitch');
  const pitchOpen = pitches.some((target) => target.id === current);
  const [menu, setMenu] = useState(false);
  function link(href: string, selected: boolean, label: string, detail: string | null = null): ReactElement {
    return <a href={href} aria-current={selected ? 'page' : undefined} className={selected ? styles['selected'] : styles['navLink']}>
      <span aria-hidden="true" className={styles['navMarker']}>{selected ? '●' : ''}</span>
      <span className={styles['navLabel']}>{label}{detail === null ? null : <Text size="1" color="gray">{detail}</Text>}</span>
    </a>;
  }
  return (
    <div className={styles['shell']}>
      <a href="#content" className={styles['skip']}>Skip to content</a>
      <aside className={styles['sidebar']}>
        <div className={styles['brandRow']}>
          <Text size="5" weight="bold" className={styles['brand']}>coresearch<span aria-hidden="true">_</span></Text>
          <span className={styles['mobileTools']}>
            <AppearanceToggle />
            <button type="button" className={styles['menuButton']} aria-expanded={menu} aria-controls="main-navigation"
              onClick={() => { setMenu(!menu); }}>{menu ? 'Close' : 'Menu'}</button>
          </span>
        </div>
        <nav id="main-navigation" aria-label="Main navigation" className={menu ? styles['navigationOpen'] : styles['navigation']}>
          {link('/', current === 'home', 'Home', 'What to do next')}
          {link('/profile', current === 'profile', 'Your profile')}
          {link('/ideas', current === 'ideas', 'Your ideas')}
          <details open className={styles['workspace']}>
            <summary>Research proposals</summary>
            <ul className={styles['targets']}>
              {labs.length === 0 ? <li><Text size="1" color="gray">None yet</Text></li> : labs.map((target) => <li key={target.id}>
                {link(`/targets/${String(target.id)}`, current === target.id, target.professor, target.lab ?? target.university ?? 'Independent lab')}</li>)}
            </ul>
          </details>
          {link('/outreach', current === 'outreach' || pitchOpen, 'Professors', pitches.length === 0 ? 'ranked by fit'
            : `${String(pitches.length)} to pitch · ranked by fit`)}
          {link('/targets/new', current === 'new', 'Add a professor')}
          {link('/export', current === 'export', 'Share or export')}
          {link('/method', current === 'method', 'How it works')}
        </nav>
        <Text size="2" color="gray" className={styles['localNote']}>Local workspace<br />Stored on this computer</Text>
      </aside>
      <main id="content" className={styles['main']}>
        <header className={styles['header']}>
          <Text size="2" color="gray">{section}</Text>
          <Flex gap="4" align="center"><Text size="2" color="gray">{step}</Text><AppearanceToggle /></Flex>
        </header>
        <Box className={wide ? styles['contentWide'] : styles['content']}>{children}</Box>
      </main>
    </div>
  );
}
