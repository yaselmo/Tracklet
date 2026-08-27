import { t } from '@lingui/core/macro';
import {
  ActionIcon,
  Button,
  Card,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { IconFileTypePdf, IconPlus, IconTrash } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { ActionButton } from '@lib/components/ActionButton';
import { ApiEndpoints } from '@lib/enums/ApiEndpoints';
import { apiUrl } from '@lib/functions/Api';
import { useApi } from '../../contexts/ApiContext';
import { showApiErrorMessage } from '../../functions/notifications';

type ManualReportItem = {
  part_name: string;
  quantity: number;
  notes: string;
};

const EMPTY_ITEM: ManualReportItem = {
  part_name: '',
  quantity: 1,
  notes: ''
};

export default function ProjectAutomaticReportsPanel({
  projectId,
  projectName,
  projectLocation,
  projectLocationDisplay,
  readOnly,
  onReportCreated
}: Readonly<{
  projectId: number;
  projectName?: string;
  projectLocation?: number | null;
  projectLocationDisplay?: string;
  readOnly?: boolean;
  onReportCreated?: () => void;
}>) {
  const api = useApi();
  const queryClient = useQueryClient();

  const [opened, setOpened] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reportType, setReportType] = useState('BROKEN');
  const [title, setTitle] = useState('');
  const [items, setItems] = useState<ManualReportItem[]>([{ ...EMPTY_ITEM }]);

  const resetForm = useCallback(() => {
    setReportType('BROKEN');
    setTitle('');
    setItems([{ ...EMPTY_ITEM }]);
  }, []);

  const openModal = useCallback(() => {
    resetForm();
    setOpened(true);
  }, [resetForm]);

  const submitReport = useCallback(async () => {
    if (
      !reportType ||
      !title.trim() ||
      items.length <= 0 ||
      items.some(
        (item) => !item.part_name.trim() || Number(item.quantity || 0) <= 0
      )
    ) {
      showNotification({
        title: t`Missing required fields`,
        message: t`Report Type, Report Title and all Part Name fields are required`,
        color: 'red'
      });
      return;
    }

    setSubmitting(true);
    try {
      const response = await api.post(
        apiUrl(ApiEndpoints.project_reports_broken, projectId),
        {
          report_title: title,
          report_type: reportType,
          items: items.map((item) => ({
            part_name: item.part_name.trim(),
            quantity: Number(item.quantity || 1),
            notes: item.notes || ''
          })),
          location: projectLocation || null
        }
      );

      const attachmentUrl = response?.data?.attachment_url;
      if (attachmentUrl) {
        window.open(attachmentUrl, '_blank', 'noopener,noreferrer');
      }

      showNotification({
        title: t`Success`,
        message: attachmentUrl
          ? t`Broken report generated and opened`
          : t`Broken report generated`,
        color: 'green'
      });

      setOpened(false);
      await queryClient.invalidateQueries({
        queryKey: ['tabledata', apiUrl(ApiEndpoints.attachment_list)]
      });
      onReportCreated?.();
    } catch (error) {
      showApiErrorMessage({
        error,
        title: t`Failed to generate report`
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    api,
    reportType,
    projectId,
    title,
    items,
    projectLocation,
    queryClient,
    onReportCreated
  ]);

  const canGenerate = useMemo(() => {
    return (
      !!reportType &&
      !!title.trim() &&
      items.length > 0 &&
      items.every(
        (item) => !!item.part_name.trim() && Number(item.quantity || 0) > 0
      )
    );
  }, [reportType, title, items]);

  return (
    <>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title={t`New Broken Report`}
        size='xl'
      >
        <Stack>
          <TextInput
            label={t`Project`}
            value={projectName || `#${projectId}`}
            readOnly
          />
          <TextInput
            label={t`Report Title`}
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
            placeholder={t`Enter report title...`}
          />
          <Select
            label={t`Report Type`}
            data={[
              { value: 'BROKEN', label: t`Broken` },
              { value: 'CHARGING', label: t`Charging` },
              { value: 'MISSING', label: t`Missing` },
              { value: 'RETURNED', label: t`Returned` }
            ]}
            value={reportType}
            onChange={(value) => setReportType(value ?? 'BROKEN')}
            searchable
            required
          />
          {items.map((item, index) => (
            <Card key={`manual-item-${index}`} withBorder>
              <Stack>
                <Group grow align='flex-end'>
                  <TextInput
                    label={t`Part Name`}
                    value={item.part_name}
                    onChange={(event) => {
                      const next = [...items];
                      next[index].part_name = event.currentTarget.value;
                      setItems(next);
                    }}
                    placeholder={t`Enter part name...`}
                    required
                  />
                  <TextInput
                    label={t`Quantity`}
                    type='number'
                    min={1}
                    value={String(item.quantity)}
                    onChange={(event) => {
                      const next = [...items];
                      const parsed = Number(event.currentTarget.value);
                      next[index].quantity =
                        Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
                      setItems(next);
                    }}
                    required
                  />
                  <ActionIcon
                    color='red'
                    variant='light'
                    onClick={() => {
                      if (items.length <= 1) {
                        return;
                      }
                      setItems(
                        items.filter((_, itemIndex) => itemIndex !== index)
                      );
                    }}
                    disabled={items.length <= 1}
                    mb={4}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
                <TextInput
                  label={t`Notes / Usage`}
                  value={item.notes}
                  onChange={(event) => {
                    const next = [...items];
                    next[index].notes = event.currentTarget.value;
                    setItems(next);
                  }}
                  placeholder={t`Enter notes...`}
                />
              </Stack>
            </Card>
          ))}
          <TextInput
            label={t`Location`}
            value={projectLocationDisplay || '-'}
            readOnly
          />
          <Text size='sm' c='dimmed'>
            {t`Project and location are pulled from this project automatically.`}
          </Text>
          <Group justify='space-between'>
            <Button
              variant='light'
              leftSection={<IconPlus size={16} />}
              onClick={() => setItems([...items, { ...EMPTY_ITEM }])}
            >
              {t`Add Row`}
            </Button>
            <Button
              onClick={submitReport}
              loading={submitting}
              disabled={!canGenerate}
            >
              {t`Generate PDF`}
            </Button>
          </Group>
        </Stack>
      </Modal>
      <ActionButton
        key='generate-project-report'
        tooltip={t`Generate Report`}
        onClick={openModal}
        hidden={!!readOnly}
        icon={<IconFileTypePdf />}
      />
    </>
  );
}
