'use client';

import type { ReactElement } from 'react';
import { Button, useThemeContext } from '@radix-ui/themes';
import { appearanceCookie } from '../lib/appearance.ts';

export function AppearanceToggle(): ReactElement {
  const { appearance, onAppearanceChange } = useThemeContext();
  const next = appearance === 'dark' ? 'light' : 'dark';
  return <Button type="button" variant="ghost" color="gray" size="1" aria-label={`Switch to ${next === 'dark' ? 'night' : 'day'} mode`}
    onClick={() => {
      onAppearanceChange(next);
      document.cookie = `${appearanceCookie}=${next}; path=/; max-age=31536000; samesite=lax`;
    }}>
    {appearance === 'dark' ? 'Day' : 'Night'}
  </Button>;
}
