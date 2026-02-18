import { t } from '@lingui/core/macro';
import { Badge, Grid, Stack, Text } from '@mantine/core';
import { IconInfoCircle, IconList, IconNotes } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';

import { ApiEndpoints } from '@lib/enums/ApiEndpoints';
import { UserRoles } from '@lib/enums/Roles';
import PrimaryActionButton from '../../components/buttons/PrimaryActionButton';
import {
  type DetailsField,
  DetailsTable
} from '../../components/details/Details';
import InstanceDetail from '../../components/nav/InstanceDetail';
import { PageDetail } from '../../components/nav/PageDetail';
import type { PanelType } from '../../components/panels/Panel';
import { PanelGroup } from '../../components/panels/PanelGroup';
import { useEditApiFormModal } from '../../hooks/UseForm';
import { useInstance } from '../../hooks/UseInstance';
import { useUserState } from '../../states/UserState';
import { useRentalOrderFields } from '../../forms/EventRentalForms';
import { RentalLineItemTable } from '../../tables/rentals/RentalLineItemTable';

export default function RentalOrderDetail() {
  const { id } = useParams();
  const user = useUserState();

  const {
    instance: order,
    instanceQuery,
    refreshInstance
  } = useInstance({
    endpoint: ApiEndpoints.tracklet_rental_order_list,
    pk: id,
    params: {
      customer_detail: true
    }
  });

  const orderFields = useRentalOrderFields({});

  const editOrder = useEditApiFormModal({
    url: ApiEndpoints.tracklet_rental_order_list,
    pk: order.pk,
    title: t`Edit Rental Order`,
    fields: orderFields,
    onFormSuccess: refreshInstance
  });

  const activateOrder = useEditApiFormModal({
    url: ApiEndpoints.tracklet_rental_order_list,
    pk: order.pk,
    title: t`Mark Active`,
    fields: {
      status: {
        value: 20,
        hidden: true
      }
    },
    fetchInitialData: false,
    onFormSuccess: refreshInstance
  });

  const returnOrder = useEditApiFormModal({
    url: ApiEndpoints.tracklet_rental_order_list,
    pk: order.pk,
    title: t`Mark Returned`,
    fields: {
      status: {
        value: 40,
        hidden: true
      },
      returned_date: {}
    },
    onFormSuccess: refreshInstance
  });

  const extendOrder = useEditApiFormModal({
    url: ApiEndpoints.tracklet_rental_order_list,
    pk: order.pk,
    title: t`Extend Rental`,
    fields: {
      rental_end: {}
    },
    onFormSuccess: refreshInstance
  });

  const cancelOrder = useEditApiFormModal({
    url: ApiEndpoints.tracklet_rental_order_list,
    pk: order.pk,
    title: t`Cancel Rental`,
    fields: {
      status: {
        value: 50,
        hidden: true
      }
    },
    fetchInitialData: false,
    onFormSuccess: refreshInstance
  });

  const addNote = useEditApiFormModal({
    url: ApiEndpoints.tracklet_rental_order_list,
    pk: order.pk,
    title: t`Add Note`,
    fields: {
      notes: {}
    },
    onFormSuccess: refreshInstance
  });

  const detailPanel = useMemo(() => {
    const left: DetailsField[] = [
      {
        type: 'text',
        name: 'reference',
        label: t`Reference`,
        copy: true
      },
      {
        type: 'text',
        name: 'customer_detail.name',
        label: t`Customer`
      },
      {
        type: 'text',
        name: 'status_name',
        label: t`Status`
      },
      {
        type: 'text',
        name: 'responsible',
        label: t`Responsible`,
        hidden: !order.responsible
      }
    ];

    const right: DetailsField[] = [
      {
        type: 'date',
        name: 'rental_start',
        label: t`Rental Start`,
        copy: true
      },
      {
        type: 'date',
        name: 'rental_end',
        label: t`Rental End`,
        copy: true
      },
      {
        type: 'date',
        name: 'returned_date',
        label: t`Returned Date`,
        copy: true,
        hidden: !order.returned_date
      },
      {
        type: 'date',
        name: 'last_updated',
        label: t`Last Updated`,
        copy: true
      }
    ];

    return (
      <Grid>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <DetailsTable fields={left} item={order} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <DetailsTable fields={right} item={order} />
        </Grid.Col>
      </Grid>
    );
  }, [order]);

  const panels: PanelType[] = useMemo(() => {
    return [
      {
        name: 'overview',
        label: t`Overview`,
        icon: <IconInfoCircle />,
        content: detailPanel
      },
      {
        name: 'line-items',
        label: t`Line Items`,
        icon: <IconList />,
        content: order.pk ? (
          <RentalLineItemTable orderId={order.pk} refreshOrder={refreshInstance} />
        ) : (
          <></>
        )
      },
      {
        name: 'notes',
        label: t`Notes`,
        icon: <IconNotes />,
        content: (
          <Text style={{ whiteSpace: 'pre-wrap' }} size='sm'>
            {order.notes || t`No notes`}
          </Text>
        )
      }
    ];
  }, [order, detailPanel]);

  const actions = useMemo(() => {
    return [
      <PrimaryActionButton
        title={t`Edit`}
        icon='edit'
        hidden={!user.hasChangeRole(UserRoles.sales_order)}
        onClick={editOrder.open}
      />,
      <PrimaryActionButton
        title={t`Mark Active`}
        icon='issue'
        hidden={!user.hasChangeRole(UserRoles.sales_order)}
        onClick={activateOrder.open}
      />,
      <PrimaryActionButton
        title={t`Mark Returned`}
        icon='complete'
        hidden={!user.hasChangeRole(UserRoles.sales_order)}
        onClick={returnOrder.open}
      />,
      <PrimaryActionButton
        title={t`Extend Rental`}
        icon='calendar'
        hidden={!user.hasChangeRole(UserRoles.sales_order)}
        onClick={extendOrder.open}
      />,
      <PrimaryActionButton
        title={t`Cancel`}
        icon='cancel'
        hidden={!user.hasChangeRole(UserRoles.sales_order)}
        onClick={cancelOrder.open}
      />,
      <PrimaryActionButton
        title={t`Add Note`}
        icon='note'
        hidden={!user.hasChangeRole(UserRoles.sales_order)}
        onClick={addNote.open}
      />
    ];
  }, [
    user,
    editOrder,
    activateOrder,
    returnOrder,
    extendOrder,
    cancelOrder,
    addNote
  ]);

  return (
    <>
      {editOrder.modal}
      {activateOrder.modal}
      {returnOrder.modal}
      {extendOrder.modal}
      {cancelOrder.modal}
      {addNote.modal}
      <InstanceDetail query={instanceQuery} requiredRole={UserRoles.sales_order}>
        <Stack gap='xs'>
          <PageDetail
            title={`${t`Rental Order`}: ${order.reference}`}
            subtitle={order.customer_detail?.name}
            actions={actions}
            breadcrumbs={[{ name: t`Rentals`, url: '/rentals/' }]}
            lastCrumb={[
              {
                name: order.reference,
                url: `/rentals/rental-order/${order.pk}`
              }
            ]}
            badges={
              order.status_name
                ? [
                    <Badge key='rental-status' size='lg'>
                      {order.status_name}
                    </Badge>
                  ]
                : []
            }
          />
          <PanelGroup
            pageKey='rental-order-detail'
            panels={panels}
            model={'rentals'}
            id={order.pk}
            instance={order}
            reloadInstance={refreshInstance}
          />
        </Stack>
      </InstanceDetail>
    </>
  );
}
