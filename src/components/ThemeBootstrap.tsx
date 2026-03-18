'use client';

import { useEffect } from 'react';
import { useThemeStore } from '@/lib/store/theme';

export function ThemeBootstrap() {
  const hydrate = useThemeStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return null;
}
