/**
 * Component for loading an image from the InvenTree server
 *
 * Image caching is handled automagically by the browsers cache
 */
import { Image, type ImageProps, Skeleton, Stack } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';

import { generateUrl } from '../../functions/urls';
import { useLocalState } from '../../states/LocalState';

interface ApiImageProps extends ImageProps {
  onClick?: (event: any) => void;
}

/**
 * Construct an image container which will load and display the image
 */
export function ApiImage(props: Readonly<ApiImageProps>) {
  const { getHost } = useLocalState.getState();
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [props.src]);

  const imageUrl = useMemo(() => {
    const src = imageFailed ? '/static/img/blank_image.png' : props.src;
    return generateUrl(src, getHost());
  }, [getHost, imageFailed, props.src]);

  return (
    <Stack>
      {imageUrl ? (
        <Image
          {...props}
          src={imageUrl}
          fit='contain'
          onError={() => setImageFailed(true)}
        />
      ) : (
        <Skeleton h={props?.h ?? props.w} w={props?.w ?? props.h} />
      )}
    </Stack>
  );
}
