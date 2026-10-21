import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { OutreachView } from '../../components/outreach-view.tsx';
import { workspacePath } from '../../lib/database.ts';
import { listOutreach } from '../../lib/outreach.ts';
import { listTargets } from '../../lib/targets.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const metadata: Metadata = { title: 'Outreach' };

export default function Page(): ReactElement {
  return <OutreachView initialTargets={listTargets()} initialRows={listOutreach(workspacePath())} />;
}
