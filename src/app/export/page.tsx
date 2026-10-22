import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { ExportView } from '../../components/export-view.tsx';
import { workspacePath } from '../../lib/database.ts';
import { listExports } from '../../lib/export.ts';
import { listTargets } from '../../lib/targets.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const metadata: Metadata = { title: 'Share or export' };

export default function Page(): ReactElement {
  return <ExportView initialTargets={listTargets()} initialExports={listExports(workspacePath())} />;
}
