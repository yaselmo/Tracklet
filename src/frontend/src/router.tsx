import { lazy, type ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import {
  manufacturingEnabled,
  purchasingEnabled,
  salesEnabled
} from './defaults/moduleFlags';
import { Loadable } from './functions/loading';
import { useServerApiState } from './states/ServerApiState';

// Lazy loaded pages
export const LayoutComponent = Loadable(
  lazy(() => import('./components/nav/Layout')),
  true,
  true
);
export const LoginLayoutComponent = Loadable(
  lazy(() => import('./pages/Auth/Layout')),
  true,
  true
);

export const Home = Loadable(lazy(() => import('./pages/Index/Home')));

export const CompanyDetail = Loadable(
  lazy(() => import('./pages/company/CompanyDetail'))
);

export const CustomerDetail = Loadable(
  lazy(() => import('./pages/company/CustomerDetail'))
);

export const SupplierDetail = Loadable(
  lazy(() => import('./pages/company/SupplierDetail'))
);
export const SuppliersIndex = Loadable(
  lazy(() => import('./pages/company/SuppliersIndex'))
);

export const ManufacturerDetail = Loadable(
  lazy(() => import('./pages/company/ManufacturerDetail'))
);

export const SupplierPartDetail = Loadable(
  lazy(() => import('./pages/company/SupplierPartDetail'))
);

export const ManufacturerPartDetail = Loadable(
  lazy(() => import('./pages/company/ManufacturerPartDetail'))
);

export const CategoryDetail = Loadable(
  lazy(() => import('./pages/part/CategoryDetail'))
);
export const PartDetail = Loadable(
  lazy(() => import('./pages/part/PartDetail'))
);

export const LocationDetail = Loadable(
  lazy(() => import('./pages/stock/LocationDetail'))
);

export const StockDetail = Loadable(
  lazy(() => import('./pages/stock/StockDetail'))
);

export const BuildIndex = Loadable(
  lazy(() => import('./pages/build/BuildIndex'))
);

export const BuildDetail = Loadable(
  lazy(() => import('./pages/build/BuildDetail'))
);

export const PurchasingIndex = Loadable(
  lazy(() => import('./pages/purchasing/PurchasingIndex'))
);

export const PurchaseOrderDetail = Loadable(
  lazy(() => import('./pages/purchasing/PurchaseOrderDetail'))
);

export const SalesIndex = Loadable(
  lazy(() => import('./pages/sales/SalesIndex'))
);

export const SalesOrderDetail = Loadable(
  lazy(() => import('./pages/sales/SalesOrderDetail'))
);

export const SalesOrderShipmentDetail = Loadable(
  lazy(() => import('./pages/sales/SalesOrderShipmentDetail'))
);

export const ReturnOrderDetail = Loadable(
  lazy(() => import('./pages/sales/ReturnOrderDetail'))
);

export const ProjectsIndex = Loadable(
  lazy(() => import('./pages/projects/ProjectsIndex'))
);

export const ProjectDetail = Loadable(
  lazy(() => import('./pages/projects/ProjectDetail'))
);

export const Scan = Loadable(lazy(() => import('./pages/Index/Scan')));

export const ErrorPage = Loadable(lazy(() => import('./pages/ErrorPage')));

export const Notifications = Loadable(
  lazy(() => import('./pages/Notifications'))
);

export const UserSettings = Loadable(
  lazy(() => import('./pages/Index/Settings/UserSettings'))
);

export const SystemSettings = Loadable(
  lazy(() => import('./pages/Index/Settings/SystemSettings'))
);

export const AdminCenter = Loadable(
  lazy(() => import('./pages/Index/Settings/AdminCenter/Index'))
);

// Core object
export const CoreIndex = Loadable(lazy(() => import('./pages/core/CoreIndex')));
export const UserDetail = Loadable(
  lazy(() => import('./pages/core/UserDetail'))
);
export const GroupDetail = Loadable(
  lazy(() => import('./pages/core/GroupDetail'))
);

export const NotFound = Loadable(
  lazy(() => import('./components/errors/NotFound'))
);

// Auth
export const Login = Loadable(lazy(() => import('./pages/Auth/Login')));
export const LoggedIn = Loadable(
  lazy(() => import('./pages/Auth/LoggedIn')),
  true,
  true
);
export const Logout = Loadable(lazy(() => import('./pages/Auth/Logout')));
export const Register = Loadable(lazy(() => import('./pages/Auth/Register')));
export const Mfa = Loadable(lazy(() => import('./pages/Auth/MFA')));
export const MfaSetup = Loadable(lazy(() => import('./pages/Auth/MFASetup')));
export const ChangePassword = Loadable(
  lazy(() => import('./pages/Auth/ChangePassword'))
);
export const Reset = Loadable(lazy(() => import('./pages/Auth/Reset')));
export const ResetPassword = Loadable(
  lazy(() => import('./pages/Auth/ResetPassword'))
);
export const VerifyEmail = Loadable(
  lazy(() => import('./pages/Auth/VerifyEmail')),
  true,
  true
);

function ModuleRoute({
  module,
  children
}: Readonly<{
  module: 'purchasing' | 'manufacturing' | 'sales';
  children: ReactElement;
}>) {
  const server = useServerApiState((state) => state.server);

  let enabled = false;

  if (module === 'purchasing') {
    enabled = purchasingEnabled(server);
  } else if (module === 'manufacturing') {
    enabled = manufacturingEnabled(server);
  } else {
    enabled = salesEnabled(server);
  }

  return enabled ? children : <NotFound />;
}

// Routes
export const routes = (
  <Routes>
    <Route path='*' element={<NotFound />} errorElement={<ErrorPage />} />
    <Route path='/' element={<LayoutComponent />} errorElement={<ErrorPage />}>
      <Route index element={<Home />} />,
      <Route path='home/' element={<Home />} />,
      <Route path='notifications/*' element={<Notifications />} />,
      <Route path='scan/' element={<Scan />} />,
      <Route path='settings/'>
        <Route index element={<Navigate to='admin/' replace />} />
        <Route path='admin/*' element={<AdminCenter />} />
        <Route path='system/*' element={<SystemSettings />} />
        <Route path='user/*' element={<UserSettings />} />
      </Route>
      <Route path='part/'>
        <Route index element={<Navigate to='category/index/' replace />} />
        <Route path='category/:id?/*' element={<CategoryDetail />} />
        <Route path=':id/*' element={<PartDetail />} />
      </Route>
      <Route path='stock/'>
        <Route index element={<Navigate to='location/index/' replace />} />
        <Route path='location/:id?/*' element={<LocationDetail />} />
        <Route path='item/:id/*' element={<StockDetail />} />
      </Route>
      <Route path='manufacturing/'>
        <Route
          index
          element={
            <ModuleRoute module='manufacturing'>
              <Navigate to='index/' replace />
            </ModuleRoute>
          }
        />
        <Route
          path='index/*'
          element={
            <ModuleRoute module='manufacturing'>
              <BuildIndex />
            </ModuleRoute>
          }
        />
        <Route
          path='build-order/:id/*'
          element={
            <ModuleRoute module='manufacturing'>
              <BuildDetail />
            </ModuleRoute>
          }
        />
      </Route>
      <Route path='purchasing/'>
        <Route
          index
          element={
            <ModuleRoute module='purchasing'>
              <Navigate to='index/' replace />
            </ModuleRoute>
          }
        />
        <Route
          path='index/*'
          element={
            <ModuleRoute module='purchasing'>
              <PurchasingIndex />
            </ModuleRoute>
          }
        />
        <Route
          path='purchase-order/:id/*'
          element={
            <ModuleRoute module='purchasing'>
              <PurchaseOrderDetail />
            </ModuleRoute>
          }
        />
        <Route
          path='supplier/:id/*'
          element={
            <ModuleRoute module='purchasing'>
              <SupplierDetail />
            </ModuleRoute>
          }
        />
        <Route
          path='supplier-part/:id/*'
          element={
            <ModuleRoute module='purchasing'>
              <SupplierPartDetail />
            </ModuleRoute>
          }
        />
        <Route
          path='manufacturer/:id/*'
          element={
            <ModuleRoute module='purchasing'>
              <ManufacturerDetail />
            </ModuleRoute>
          }
        />
        <Route
          path='manufacturer-part/:id/*'
          element={
            <ModuleRoute module='purchasing'>
              <ManufacturerPartDetail />
            </ModuleRoute>
          }
        />
      </Route>
      <Route path='company/:id/*' element={<CompanyDetail />} />
      <Route path='suppliers/'>
        <Route index element={<Navigate to='index/' replace />} />
        <Route path='index/*' element={<SuppliersIndex />} />
        <Route path='supplier/:id/*' element={<SupplierDetail />} />
      </Route>
      <Route path='sales/'>
        <Route
          index
          element={
            <ModuleRoute module='sales'>
              <Navigate to='index/' replace />
            </ModuleRoute>
          }
        />
        <Route
          path='index/*'
          element={
            <ModuleRoute module='sales'>
              <SalesIndex />
            </ModuleRoute>
          }
        />
        <Route
          path='sales-order/:id/*'
          element={
            <ModuleRoute module='sales'>
              <SalesOrderDetail />
            </ModuleRoute>
          }
        />
        <Route
          path='shipment/:id/*'
          element={
            <ModuleRoute module='sales'>
              <SalesOrderShipmentDetail />
            </ModuleRoute>
          }
        />
        <Route
          path='return-order/:id/*'
          element={
            <ModuleRoute module='sales'>
              <ReturnOrderDetail />
            </ModuleRoute>
          }
        />
        <Route
          path='customer/:id/*'
          element={
            <ModuleRoute module='sales'>
              <CustomerDetail />
            </ModuleRoute>
          }
        />
      </Route>
      <Route path='projects/'>
        <Route index element={<Navigate to='index/' replace />} />
        <Route path='index/*' element={<ProjectsIndex />} />
        <Route path=':id/*' element={<ProjectDetail />} />
      </Route>
      <Route path='core/'>
        <Route index element={<Navigate to='index/' replace />} />
        <Route path='index/*' element={<CoreIndex />} />
        <Route path='user/:id/*' element={<UserDetail />} />
        <Route path='group/:id/*' element={<GroupDetail />} />
      </Route>
    </Route>
    <Route
      path='/'
      element={<LoginLayoutComponent />}
      errorElement={<ErrorPage />}
    >
      <Route path='/login' element={<Login />} />,
      <Route path='/logged-in' element={<LoggedIn />} />
      <Route path='/logout' element={<Logout />} />,
      <Route path='/register' element={<Register />} />,
      <Route path='/mfa' element={<Mfa />} />,
      <Route path='/mfa-setup' element={<MfaSetup />} />,
      <Route path='/change-password' element={<ChangePassword />} />
      <Route path='/reset-password' element={<Reset />} />
      <Route path='/set-password' element={<ResetPassword />} />
      <Route path='/verify-email/:key' element={<VerifyEmail />} />
    </Route>
  </Routes>
);
