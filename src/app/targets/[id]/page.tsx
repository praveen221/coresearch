import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { notFound } from 'next/navigation';
import { TargetView } from '../../../components/target-view.tsx';
import { listTargets, targetIdSchema } from '../../../lib/targets.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const metadata: Metadata = { title: 'Target' };

export default async function Page({ params }: PageProps<'/targets/[id]'>): Promise<ReactElement> {
  const id = targetIdSchema.safeParse((await params).id);
  const targets = listTargets();
  if (!id.success || !targets.some((target) => target.id === id.data)) notFound();
  return <TargetView initialTargets={targets} id={id.data} />;
}
