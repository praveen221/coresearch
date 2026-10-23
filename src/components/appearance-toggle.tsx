'use client';

import type { ReactElement } from 'react';
import { Button } from '@radix-ui/themes';
import { appearanceCookie } from '../lib/appearance.ts';
import styles from './ui.module.css';

function toggle(): void {
  const root = document.documentElement;
  const next = root.classList.contains('dark') ? 'light' : 'dark';
  const system = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  root.classList.toggle('dark', next === 'dark');
  root.classList.toggle('light', next === 'light');
  document.cookie = next === system ? `${appearanceCookie}=; path=/; max-age=0; samesite=lax`
    : `${appearanceCookie}=${next}; path=/; max-age=31536000; samesite=lax`;
}

export function AppearanceToggle(): ReactElement {
  return <Button type="button" variant="ghost" color="gray" size="1" aria-label="Switch between night and day" onClick={toggle}>
    <span className={styles['whenLight']}>Night</span><span className={styles['whenDark']}>Day</span>
  </Button>;
}
