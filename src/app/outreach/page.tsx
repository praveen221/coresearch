import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { OutreachView } from '../../components/outreach-view.tsx';
import { workspacePath } from '../../lib/database.ts';
import { listFitKinds } from '../../lib/fit.ts';
import { listOutreach } from '../../lib/outreach.ts';
import { listTargets } from '../../lib/targets.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const metadata: Metadata = { title: 'Professors' };

export default function Page(): ReactElement {
  const workspace = workspacePath();
  return <OutreachView initialTargets={listTargets()} initialRows={listOutreach(workspace)} initialKinds={listFitKinds(workspace)} />;
}
