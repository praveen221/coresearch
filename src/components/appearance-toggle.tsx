'use client';

import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { Button, useThemeContext } from '@radix-ui/themes';

const key = 'coresearch-appearance';

function saved(): 'light' | 'dark' | null {
  try {
    const value = window.localStorage.getItem(key);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function remember(value: 'light' | 'dark'): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    return;
  }
}

export function AppearanceToggle(): ReactElement {
  const { appearance, onAppearanceChange } = useThemeContext();
  useEffect(() => {
    const value = saved();
    if (value !== null) onAppearanceChange(value);
  }, [onAppearanceChange]);
  const next = appearance === 'dark' ? 'light' : 'dark';
  return <Button type="button" variant="ghost" color="gray" size="1" aria-label={`Switch to ${next === 'dark' ? 'night' : 'day'} mode`}
    onClick={() => { onAppearanceChange(next); remember(next); }}>
    {appearance === 'dark' ? '[ day ]' : '[ night ]'}
  </Button>;
}
