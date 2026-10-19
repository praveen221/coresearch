import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { NewTargetView } from '../../../components/target-view.tsx';
import { listTargets } from '../../../lib/targets.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const metadata: Metadata = { title: 'Add target' };

export default function Page(): ReactElement {
  return <NewTargetView initialTargets={listTargets()} />;
}
