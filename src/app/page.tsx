import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { HomeView } from '../components/home-view.tsx';
import { workspacePath } from '../lib/database.ts';
import { getOverview } from '../lib/overview.ts';
import { listTargets } from '../lib/targets.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const metadata: Metadata = { title: 'Home' };

export default function Page(): ReactElement {
  return <HomeView initialTargets={listTargets()} initialOverview={getOverview(workspacePath())} />;
}
