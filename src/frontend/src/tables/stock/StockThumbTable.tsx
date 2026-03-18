import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import {
  AspectRatio,
  Button,
  Divider,
  Group,
  Pagination,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput
} from '@mantine/core';
import { useDebouncedValue, useHover } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { Suspense, useState } from 'react';

import { ApiEndpoints } from '@lib/enums/ApiEndpoints';
import { apiUrl } from '@lib/functions/Api';
import { IconX } from '@tabler/icons-react';
import { api } from '../../App';
import { Thumbnail } from '../../components/images/Thumbnail';

export type StockThumbTableProps = {
  apiPath: string;
  setImage: (image: string) => void;
};

type ImageElement = {
  image: string;
  count: number;
};

type ThumbProps = {
  selected: string | null;
  element: ImageElement;
  selectImage: React.Dispatch<React.SetStateAction<string | null>>;
};

function StockThumbComponent({
  selected,
  element,
  selectImage
}: Readonly<ThumbProps>) {
  const { hovered, ref } = useHover();

  const hoverColor = 'rgba(127,127,127,0.2)';
  const selectedColor = 'rgba(127,127,127,0.29)';

  let color = '';

  if (selected === element?.image) {
    color = selectedColor;
  } else if (hovered) {
    color = hoverColor;
  }

  const filename = String(element?.image || '').split('/').pop() || element.image;

  return (
    <Paper
      withBorder
      style={{ backgroundColor: color }}
      p='sm'
      ref={ref}
      onClick={() => selectImage(element.image)}
    >
      <Stack justify='space-between'>
        <AspectRatio ratio={1}>
          <Thumbnail size={120} src={element?.image} align='center' hover hoverSize={220} />
        </AspectRatio>
        <Text size='xs'>
          {filename} ({element.count})
        </Text>
      </Stack>
    </Paper>
  );
}

async function setNewImage(
  image: string | null,
  apiPath: string,
  setImage: (image: string) => void
) {
  if (image === null) {
    return;
  }

  const normalizedImage = String(image).split('/').pop() || image;

  const response = await api.patch(apiPath, {
    existing_image: normalizedImage
  });

  if (response.data.image) {
    setImage(response.data.image);
    modals.closeAll();
  }
}

export function StockThumbTable({
  apiPath,
  setImage
}: Readonly<StockThumbTableProps>) {
  const limit = 24;

  const [thumbImage, setThumbImage] = useState<string | null>(null);
  const [filterInput, setFilterInput] = useState<string>('');

  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);

  const [searchText] = useDebouncedValue(filterInput, 500);

  const thumbQuery = useQuery({
    queryKey: [ApiEndpoints.stock_thumbs_list, page, searchText],
    throwOnError: () => {
      setTotalPages(1);
      setPage(1);
      return true;
    },
    queryFn: async () => {
      const offset = Math.max(0, page - 1) * limit;

      return api
        .get(apiUrl(ApiEndpoints.stock_thumbs_list), {
          params: {
            offset,
            limit,
            search: searchText
          }
        })
        .then((response) => {
          const records = response?.data?.count ?? 1;
          setTotalPages(Math.ceil(records / limit));
          return response.data?.results ?? response.data;
        });
    }
  });

  return (
    <>
      <Suspense>
        <Divider />
        <Paper p='sm'>
          <SimpleGrid
            cols={{ base: 2, '450px': 3, '600px': 4, '900px': 6 }}
            type='container'
            spacing='xs'
          >
            {!thumbQuery.isFetching
              ? thumbQuery?.data?.map((data: ImageElement, index: number) => (
                  <StockThumbComponent
                    element={data}
                    key={index}
                    selected={thumbImage}
                    selectImage={setThumbImage}
                  />
                ))
              : [...Array(limit)].map((elem, idx) => (
                  <Skeleton
                    height={150}
                    width={150}
                    radius='sm'
                    key={idx}
                    style={{ padding: '5px' }}
                  />
                ))}
          </SimpleGrid>
        </Paper>
      </Suspense>

      <Divider />
      <Paper p='sm'>
        <Group justify='space-between' gap='xs'>
          <Group justify='left' gap='xs'>
            <TextInput
              placeholder={t`Search by filename or stock item...`}
              value={filterInput}
              onChange={(event) => {
                setFilterInput(event.currentTarget.value);
              }}
              rightSection={
                <IconX
                  size='1rem'
                  color='red'
                  onClick={() => setFilterInput('')}
                />
              }
            />
            <Pagination
              total={totalPages}
              value={page}
              onChange={(value) => setPage(value)}
            />
          </Group>
          <Button
            disabled={!thumbImage}
            onClick={() => setNewImage(thumbImage, apiPath, setImage)}
          >
            <Trans>Select</Trans>
          </Button>
        </Group>
      </Paper>
    </>
  );
}
