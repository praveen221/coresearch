'use client';

import type { ReactElement, ReactNode } from 'react';
import { Box, Text } from '@radix-ui/themes';
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

export function Shell({ current, initialTargets, section, step, children }: Readonly<{
  current: 'profile' | 'new' | number; initialTargets: Target[]; section: string; step: string; children: ReactNode;
}>): ReactElement {
  const { value: targets } = useLive('/api/targets', targetListSchema, initialTargets);
  function link(href: string, selected: boolean, label: string): ReactElement {
    return <a href={href} aria-current={selected ? 'page' : undefined} className={selected ? styles['selected'] : styles['navLink']}>
      <span aria-hidden="true">{selected ? '[·]' : '[ ]'}</span> {label}
    </a>;
  }
  return (
    <div className={styles['shell']}>
      <a href="#content" className={styles['skip']}>Skip to content</a>
      <aside className={styles['sidebar']}>
        <Text size="5" weight="bold" className={styles['brand']}>coresearch<span aria-hidden="true">_</span></Text>
        <nav aria-label="Main navigation" className={styles['navigation']}>
          {link('/', current === 'profile', 'Profile')}
          <details open className={styles['workspace']}>
            <summary>Workspace</summary>
            <ul className={styles['targets']}>
              {targets.map((target) => <li key={target.id}>{link(`/targets/${String(target.id)}`, current === target.id, targetName(target))}</li>)}
              <li>{link('/targets/new', current === 'new', 'Add target')}</li>
            </ul>
          </details>
        </nav>
        <Text size="2" color="gray" className={styles['localNote']}>Local workspace<br />Stored on this computer</Text>
      </aside>
      <main id="content" className={styles['main']}>
        <header className={styles['header']}>
          <Text size="2" color="gray">{section}</Text>
          <Text size="2" color="gray">{step}</Text>
        </header>
        <Box className={styles['content']}>{children}</Box>
      </main>
    </div>
  );
}
