import { t } from '@lingui/core/macro';
import { Group, SegmentedControl, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { canViewSettingsRoot } from '../../functions/settingsPermissions';
import { useUserState } from '../../states/UserState';
import { StylishText } from '../items/StylishText';

interface SettingsHeaderInterface {
  label: string;
  title: string;
  shorthand?: string;
  subtitle?: string | ReactNode;
}

/**
 * Construct a settings page header with interlinks to one other settings page
 */
export function SettingsHeader({
  label,
  title,
  shorthand,
  subtitle
}: Readonly<SettingsHeaderInterface>) {
  const user = useUserState();
  const navigate = useNavigate();

  const settingOptions = [
    { value: 'user', label: t`User Settings` },
    { value: 'system', label: t`System Settings` },
    { value: 'admin', label: t`Admin Center` }
  ].filter((option) =>
    canViewSettingsRoot(user, option.value as 'user' | 'system' | 'admin')
  );

  const selectedValue = settingOptions.some((option) => option.value === label)
    ? label
    : (settingOptions[0]?.value ?? label);

  return (
    <Group justify='space-between'>
      <Stack gap='0' ml={'sm'}>
        <Group>
          <StylishText size='xl'>{title}</StylishText>
          {shorthand && <Text c='dimmed'>({shorthand})</Text>}
        </Group>
        <Group>{subtitle ? <Text c='dimmed'>{subtitle}</Text> : null}</Group>
      </Stack>
      {settingOptions.length > 0 && (
        <SegmentedControl
          data={settingOptions}
          onChange={(value) => navigate(`/settings/${value}`)}
          value={selectedValue}
        />
      )}
    </Group>
  );
}
