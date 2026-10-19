import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { notFound } from 'next/navigation';
import { TargetView } from '../../../components/target-view.tsx';
import { listTargets, targetIdSchema } from '../../../lib/targets.ts';
import { workspacePath } from '../../../lib/database.ts';
import { getResearch } from '../../../lib/research.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const metadata: Metadata = { title: 'Target' };

export default async function Page({ params }: PageProps<'/targets/[id]'>): Promise<ReactElement> {
  const id = targetIdSchema.safeParse((await params).id);
  const targets = listTargets();
  if (!id.success || !targets.some((target) => target.id === id.data)) notFound();
  return <TargetView initialTargets={targets} initialResearch={getResearch(workspacePath(), id.data)} id={id.data} />;
}
