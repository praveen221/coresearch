import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { notFound } from 'next/navigation';
import { TargetView } from '../../../components/target-view.tsx';
import { listTargets, targetIdSchema } from '../../../lib/targets.ts';
import { workspacePath } from '../../../lib/database.ts';
import { getResearch } from '../../../lib/research.ts';
import { targetOutreach } from '../../../lib/outreach.ts';
import { getOverview } from '../../../lib/overview.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const metadata: Metadata = { title: 'Professor' };

export default async function Page({ params }: PageProps<'/targets/[id]'>): Promise<ReactElement> {
  const id = targetIdSchema.safeParse((await params).id);
  const targets = listTargets();
  if (!id.success || !targets.some((target) => target.id === id.data)) notFound();
  const workspace = workspacePath();
  return <TargetView initialTargets={targets} initialResearch={getResearch(workspace, id.data)} id={id.data}
    initialOutreach={targetOutreach(workspace, id.data)} initialOverview={getOverview(workspace)} />;
}
