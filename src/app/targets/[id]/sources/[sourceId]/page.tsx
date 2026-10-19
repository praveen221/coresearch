import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { notFound } from 'next/navigation';
import { SourceView } from '../../../../../components/source-view.tsx';
import { workspacePath } from '../../../../../lib/database.ts';
import { getResearch } from '../../../../../lib/research.ts';
import { listTargets, targetIdSchema } from '../../../../../lib/targets.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const metadata: Metadata = { title: 'Source' };

export default async function Page({ params }: PageProps<'/targets/[id]/sources/[sourceId]'>): Promise<ReactElement> {
  const values = await params;
  const id = targetIdSchema.safeParse(values.id);
  const sourceId = targetIdSchema.safeParse(values.sourceId);
  const targets = listTargets();
  const target = targets.find((item) => id.success && item.id === id.data);
  if (target === undefined || !sourceId.success) notFound();
  const research = getResearch(workspacePath(), target.id);
  if (!research.sources.some((source) => source.id === sourceId.data)) notFound();
  return <SourceView initialTargets={targets} target={target} initialResearch={research} id={sourceId.data} />;
}
