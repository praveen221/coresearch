import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { ProfileView } from '../components/profile-view.tsx';
import { getProfile } from '../lib/profile.ts';
import { listTargets } from '../lib/targets.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// The layout's title template skips pages in its own segment.
export const metadata: Metadata = { title: 'Profile · Coresearch' };

export default function Page(): ReactElement {
  return <ProfileView initialProfile={getProfile()} initialTargets={listTargets()} />;
}
