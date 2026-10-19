'use client';

import { useEffect, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Box, Button, Flex, Heading, Text, Separator } from '@radix-ui/themes';
import { profileSchema } from '../lib/profile-schema.ts';
import type { Profile } from '../lib/profile-schema.ts';
import { ProfileForm } from './profile-form.tsx';
import styles from './profile-view.module.css';

function Field({ label, children }: Readonly<{ label: string; children: ReactNode }>): ReactElement {
  return <div className={styles['field']}><dt>{label}</dt><dd>{children}</dd></div>;
}
function Value({ value }: Readonly<{ value: string | null }>): ReactElement {
  return value === null ? <Text color="gray">Not provided</Text> : <Text>{value}</Text>;
}
function ItemList({ items }: Readonly<{ items: readonly string[] }>): ReactElement {
  if (items.length === 0) return <Text color="gray">Not provided</Text>;
  return <ul className={styles['items']}>{items.map((item) => <li key={item}>{item}</li>)}</ul>;
}

export function ProfileView({ initialProfile }: Readonly<{ initialProfile: Profile }>): ReactElement {
  const [profile, setProfile] = useState(initialProfile);
  const [refreshFailed, setRefreshFailed] = useState(false);
  // Snapshot taken when editing starts; live refresh keeps updating `profile` for conflict warnings.
  const [editing, setEditing] = useState<Profile | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function refresh(): Promise<void> {
      if (pending || document.visibilityState === 'hidden') return;
      pending = true;
      try {
        const response = await fetch('/api/profile', {
          cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
        });
        if (!response.ok) throw new Error('Profile refresh failed.');
        const input: unknown = await response.json();
        const saved = profileSchema.parse(input);
        if (!controller.signal.aborted) {
          setProfile(saved);
          setRefreshFailed(false);
        }
      } catch {
        if (!controller.signal.aborted) setRefreshFailed(true);
      } finally {
        pending = false;
      }
    }
    const timer = setInterval(() => { void refresh(); }, 2000);
    return (): void => { controller.abort(); clearInterval(timer); };
  }, []);

  const funding = profile.needsFunding === null ? null : profile.needsFunding ? 'Funding needed' : 'Funding not needed';
  return (
    <div className={styles['shell']}>
      <a href="#profile" className={styles['skip']}>Skip to profile</a>
      <aside className={styles['sidebar']}>
        <Text size="5" weight="bold" className={styles['brand']}>coresearch<span aria-hidden="true">_</span></Text>
        <nav aria-label="Main navigation" className={styles['navigation']}>
          <a href="/" aria-current="page" className={styles['selected']}><span aria-hidden="true">[·]</span> Profile</a>
          <details open className={styles['workspace']}>
            <summary>Workspace</summary>
            <Text as="p" size="2" color="gray" className={styles['emptyLabs']}>No labs yet</Text>
          </details>
        </nav>
        <Text size="2" color="gray" className={styles['localNote']}>Local workspace<br />Stored on this computer</Text>
      </aside>
      <main id="profile" className={styles['main']}>
        <header className={styles['header']}>
          <Text size="2" color="gray">Profile</Text>
          <Text size="2" color="gray">01 / Setup</Text>
        </header>
        <Box className={styles['content']}>
          <Text as="p" size="2" color="gray">[ Your starting point ]</Text>
          <Heading as="h1" size="7" className={styles['title']}>Your profile</Heading>
          <Flex justify="between" align="start" gap="4" wrap="wrap">
            <Text as="p" color="gray">Tell your agent about yourself, or edit the details here.</Text>
            {editing === null ? <Button variant="soft" color="gray" onClick={() => { setEditing(profile); }}>Edit profile</Button> : null}
          </Flex>
          {editing !== null ? <ProfileForm initialBase={editing} latest={profile}
            onSaved={(saved) => { setProfile(saved); setEditing(null); }}
            onCancel={() => { setEditing(null); }} /> : <>
          <section aria-labelledby="about-heading" className={styles['section']}>
            <Heading as="h2" size="3" id="about-heading">About you</Heading>
            <dl className={styles['fields']}>
              <Field label="Name"><Value value={profile.name} /></Field>
              <Field label="Background"><Value value={profile.background} /></Field>
            </dl>
          </section>
          <section aria-labelledby="interests-heading" className={styles['section']}>
            <Heading as="h2" size="3" id="interests-heading">Research interests</Heading>
            <Box mt="4"><ItemList items={profile.interests} /></Box>
          </section>
          <section aria-labelledby="funding-heading" className={styles['section']}>
            <Heading as="h2" size="3" id="funding-heading">Funding</Heading>
            <dl className={styles['fields']}>
              <Field label="Situation"><Value value={funding} /></Field>
              <Field label="Details"><Value value={profile.fundingNotes} /></Field>
            </dl>
          </section>
          <section aria-labelledby="constraints-heading" className={styles['section']}>
            <Heading as="h2" size="3" id="constraints-heading">Practical constraints</Heading>
            <Box mt="4"><ItemList items={profile.constraints} /></Box>
          </section>
          </>}
          <Separator size="4" />
          <Flex direction="column" gap="2" py="5">
            <Text size="2" color="gray">{profile.updatedAt === null ? 'No profile information saved yet.' : `Last saved: ${new Date(profile.updatedAt).toUTCString()}`}</Text>
            <Text size="2" color="gray" role="status">{refreshFailed ? 'Live refresh unavailable. Showing the last loaded profile; retrying automatically.' : 'Updates from your agent appear automatically.'}</Text>
          </Flex>
        </Box>
      </main>
    </div>
  );
}
