import { t } from '@lingui/core/macro';

import CompanyDetail from './CompanyDetail';

export default function SupplierDetail() {
  return (
    <CompanyDetail
      title={t`Supplier`}
      breadcrumbs={[{ name: t`Suppliers`, url: '/suppliers/' }]}
      last_crumb_url='/suppliers/supplier'
    />
  );
}
