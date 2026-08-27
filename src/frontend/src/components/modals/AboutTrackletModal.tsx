import { t } from '@lingui/core/macro';
import { Anchor, Button, Divider, Stack, Text } from '@mantine/core';
import type { ContextModalProps } from '@mantine/modals';
import { StylishText } from '../items/StylishText';

export function AboutTrackletModal({
  context,
  id
}: Readonly<ContextModalProps<{}>>) {
  return (
    <Stack style={{ userSelect: 'none' }}>
      <Divider />
      <StylishText size='lg'>Tracklet</StylishText>
      <Text>
        <Text span fw={600}>
          Version:
        </Text>{' '}
        v2.1
      </Text>
      <Text>
        <Text span fw={600}>
          Developed by:
        </Text>
        <br />
        Yasser El Mouatadir
      </Text>
      <Text>
        <Text span fw={600}>
          Email:
        </Text>
        <br />
        <Anchor href='mailto:Yasser.ElMouatadir@nrc-cnrc.gc.ca'>
          Yasser.ElMouatadir@nrc-cnrc.gc.ca
        </Anchor>
      </Text>
      <Text>{'\u00A9'} 2026</Text>
      <Divider />
      <Button
        style={{ alignSelf: 'flex-end' }}
        onClick={() => {
          context.closeModal(id);
        }}
      >
        {t`Close`}
      </Button>
    </Stack>
  );
}
