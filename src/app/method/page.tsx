import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { MethodView } from '../../components/method-view.tsx';
import { workspacePath } from '../../lib/database.ts';
import { getResearch } from '../../lib/research.ts';
import { listTargets } from '../../lib/targets.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const metadata: Metadata = { title: 'How it works' };

export default function Page(): ReactElement {
  const targets = listTargets();
  const first = targets[0];
  return <MethodView initialTargets={targets} research={first === undefined ? null : getResearch(workspacePath(), first.id)} />;
}
