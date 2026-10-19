'use client';

import { Button, Flex, Heading, Text } from '@radix-ui/themes';
import type { ReactElement } from 'react';

export default function ErrorPage({ reset }: Readonly<{ reset: () => void }>): ReactElement {
  return <Flex direction="column" gap="4" p="6" align="start">
    <Heading as="h1" size="5">Unable to load your profile</Heading>
    <Text>Check the local server log, then try again. Saved data has not been replaced.</Text>
    <Button onClick={reset}>Try again</Button>
  </Flex>;
}
