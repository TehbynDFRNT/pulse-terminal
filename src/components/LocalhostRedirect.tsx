'use client';

import { useEffect } from 'react';

export function LocalhostRedirect() {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.hostname !== '127.0.0.1') return;

    // Keep the app and gateway on the same host label so browser auth behaves
    // consistently with the CP Gateway's localhost session.
    url.hostname = 'localhost';
    window.location.replace(url.toString());
  }, []);

  return null;
}
