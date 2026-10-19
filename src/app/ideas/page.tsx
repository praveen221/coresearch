import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { IdeasView } from '../../components/ideas-view.tsx';
import { workspacePath } from '../../lib/database.ts';
import { listIdeas } from '../../lib/research.ts';
import { listTargets } from '../../lib/targets.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const metadata: Metadata = { title: 'Ideas' };

export default function Page(): ReactElement {
  return <IdeasView initialIdeas={listIdeas(workspacePath())} initialTargets={listTargets()} />;
}
