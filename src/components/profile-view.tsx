'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';
import { Box, Button, Flex, Heading, Text, Separator } from '@radix-ui/themes';
import { profileSchema } from '../lib/profile-schema.ts';
import type { Profile } from '../lib/profile-schema.ts';
import type { Target } from '../lib/target-schema.ts';
import { ProfileForm } from './profile-form.tsx';
import { Field, Shell, Value } from './shell.tsx';
import { useLive } from './use-live.ts';
import styles from './ui.module.css';

function ItemList({ items }: Readonly<{ items: readonly string[] }>): ReactElement {
  if (items.length === 0) return <Text color="gray">Not provided</Text>;
  return <ul className={styles['items']}>{items.map((item) => <li key={item}>{item}</li>)}</ul>;
}

export function ProfileView({ initialProfile, initialTargets }: Readonly<{
  initialProfile: Profile; initialTargets: Target[];
}>): ReactElement {
  const { value: profile, setValue: setProfile, failed: refreshFailed } = useLive('/api/profile', profileSchema, initialProfile);
  // Snapshot taken when editing starts; live refresh keeps updating `profile` for conflict warnings.
  const [editing, setEditing] = useState<Profile | null>(null);

  const funding = profile.needsFunding === null ? null : profile.needsFunding ? 'Funding needed' : 'Funding not needed';
  return (
    <Shell current="profile" initialTargets={initialTargets} section="Profile" step="01 / Setup">
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
    </Shell>
  );
}
