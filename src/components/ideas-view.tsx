'use client';

import { useState, useTransition } from 'react';
import type { ReactElement, SubmitEvent } from 'react';
import { Button, Flex, Heading, Select, Text, TextArea } from '@radix-ui/themes';
import { createIdea, deleteIdea } from '../app/actions.ts';
import { ideaKinds, ideaListSchema } from '../lib/research-schema.ts';
import type { Idea } from '../lib/research-schema.ts';
import type { Target } from '../lib/target-schema.ts';
import { Shell } from './shell.tsx';
import { useLive } from './use-live.ts';
import styles from './ui.module.css';

const kindLabels: Record<Idea['kind'], string> = { question: 'Research question', area: 'Research area' };

export function IdeasView({ initialIdeas, initialTargets }: Readonly<{ initialIdeas: Idea[]; initialTargets: Target[] }>): ReactElement {
  const { value: ideas, setValue: setIdeas, failed } = useLive('/api/ideas', ideaListSchema, initialIdeas);
  const [kind, setKind] = useState<Idea['kind']>('question');
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  function submit(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    startTransition(async () => {
      const result = await createIdea({ kind, text });
      if (result.ok) { setIdeas([...ideas, result.value]); setText(''); setErrors([]); } else setErrors(result.errors);
    });
  }
  function remove(id: number): void {
    startTransition(async () => {
      const result = await deleteIdea(id);
      if (result.ok) setIdeas(ideas.filter((idea) => idea.id !== id)); else setErrors(result.errors);
    });
  }

  return <Shell current="ideas" initialTargets={initialTargets} section="Ideas" step="02 / Ideas">
    <Text as="p" size="2" color="gray">[ What you bring ]</Text>
    <Heading as="h1" size="7" className={styles['title']}>Your ideas</Heading>
    <Text as="p" color="gray">
      Research questions or areas you already have in mind. Each one becomes a student track. With none, your agent reads the
      lab’s recent abstracts and proposes tracks.
    </Text>
    <section aria-labelledby="ideas-heading" className={styles['section']}>
      <Heading as="h2" size="3" id="ideas-heading">Saved</Heading>
      {ideas.length === 0 ? <Text as="p" color="gray" mt="4">No ideas yet.</Text> : <ul className={styles['items']}>
        {ideas.map((idea) => <li key={idea.id} className={styles['editableItem']}>
          <span><Text color="gray">{kindLabels[idea.kind]}:</Text> {idea.text}</span>
          <Button type="button" variant="ghost" color="gray" aria-label={`Remove ${idea.text}`} disabled={pending}
            onClick={() => { remove(idea.id); }}>[remove]</Button>
        </li>)}
      </ul>}
    </section>
    <section aria-labelledby="add-idea-heading" className={styles['section']}>
      <Heading as="h2" size="3" id="add-idea-heading">Add an idea</Heading>
      <form onSubmit={submit}>
        <Flex direction="column" gap="3" mt="4">
          <div className={styles['label']}>
            <label htmlFor="idea-kind">Kind</label>
            <Select.Root value={kind} onValueChange={(value) => {
              const match = ideaKinds.find((item) => item === value);
              if (match !== undefined) setKind(match);
            }}>
              <Select.Trigger id="idea-kind" />
              <Select.Content>{ideaKinds.map((item) => <Select.Item key={item} value={item}>{kindLabels[item]}</Select.Item>)}</Select.Content>
            </Select.Root>
          </div>
          <label className={styles['label']}>In your own words
            <TextArea rows={3} value={text} onChange={(event) => { setText(event.target.value); }} />
          </label>
          <Flex><Button type="submit" disabled={pending || text.trim() === ''}>{pending ? 'Saving…' : 'Add idea'}</Button></Flex>
        </Flex>
      </form>
      {errors.map((error) => <Text key={error} as="p" size="2" mt="2" role="alert">[!] {error}</Text>)}
    </section>
    <Flex py="5" role="status">
      <Text size="2" color="gray">{failed ? 'Live refresh unavailable; retrying automatically.' : 'Ideas from your agent appear automatically.'}</Text>
    </Flex>
  </Shell>;
}
