import type { ReactElement } from 'react';
import { ProfileView } from '../components/profile-view.tsx';
import { getProfile } from '../lib/profile.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default function Page(): ReactElement {
  return <ProfileView initialProfile={getProfile()} />;
}
