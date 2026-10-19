import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { notFound } from 'next/navigation';
import { TrackView } from '../../../../../components/track-view.tsx';
import { workspacePath } from '../../../../../lib/database.ts';
import { getResearch, getTrackDetail } from '../../../../../lib/research.ts';
import { listTargets, targetIdSchema } from '../../../../../lib/targets.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const metadata: Metadata = { title: 'Track' };

export default async function Page({ params }: PageProps<'/targets/[id]/tracks/[trackId]'>): Promise<ReactElement> {
  const values = await params;
  const id = targetIdSchema.safeParse(values.id);
  const trackId = targetIdSchema.safeParse(values.trackId);
  const targets = listTargets();
  const target = targets.find((item) => id.success && item.id === id.data);
  if (target === undefined || !trackId.success) notFound();
  const research = getResearch(workspacePath(), target.id);
  if (!research.tracks.some((track) => track.id === trackId.data)) notFound();
  return <TrackView initialTargets={targets} target={target} initialDetail={getTrackDetail(workspacePath(), trackId.data)} initialResearch={research} />;
}
