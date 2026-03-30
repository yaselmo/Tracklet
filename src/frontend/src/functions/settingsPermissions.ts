import { ModelType } from '@lib/enums/ModelType';
import { UserPermissions, UserRoles } from '@lib/enums/Roles';
import type { UserStateProps } from '@lib/types/User';

type PanelAccess = {
  view: boolean;
  edit: boolean;
};

export type SettingsRoot = 'user' | 'system' | 'admin';

export function hasPerm(
  user: UserStateProps,
  role: UserRoles,
  permission: UserPermissions = UserPermissions.view
): boolean {
  return user.checkUserRole(role, permission);
}

export function canEdit(user: UserStateProps, role: UserRoles): boolean {
  return hasPerm(user, role, UserPermissions.change);
}

function roleAccess(user: UserStateProps, role: UserRoles): PanelAccess {
  return {
    view: hasPerm(user, role, UserPermissions.view),
    edit: hasPerm(user, role, UserPermissions.change)
  };
}

function modelAccess(user: UserStateProps, model: ModelType): PanelAccess {
  return {
    view: user.hasViewPermission(model),
    edit: user.hasChangePermission(model)
  };
}

export function getAdminPanelAccess(
  user: UserStateProps,
  panelName: string
): PanelAccess {
  switch (panelName) {
    case 'home':
    case 'user':
    case 'import':
    case 'export':
    case 'barcode-history':
    case 'background':
    case 'errors':
    case 'currencies':
    case 'project-codes':
    case 'custom-states':
    case 'custom-units':
    case 'labels':
    case 'reports':
      return roleAccess(user, UserRoles.admin);
    case 'parameters':
      return roleAccess(user, UserRoles.part);
    case 'category-parameters':
      return roleAccess(user, UserRoles.part_category);
    case 'location-types':
      return roleAccess(user, UserRoles.stock_location);
    case 'plugin':
    case 'machine':
    case 'email': {
      const superUser = user.isSuperuser();
      return { view: superUser, edit: superUser };
    }
    default:
      return { view: false, edit: false };
  }
}

export function getSystemPanelAccess(
  user: UserStateProps,
  panelName: string
): PanelAccess {
  switch (panelName) {
    case 'server':
    case 'authentication':
    case 'barcode':
    case 'dashboard':
    case 'notifications':
    case 'pricing':
    case 'reporting':
    case 'plugins':
      return roleAccess(user, UserRoles.admin);
    case 'labels':
      return modelAccess(user, ModelType.labeltemplate);
    case 'parameters':
    case 'parts':
      return roleAccess(user, UserRoles.part);
    case 'stock':
    case 'stock-history':
      return roleAccess(user, UserRoles.stock);
    case 'buildorders':
      return roleAccess(user, UserRoles.build);
    case 'purchaseorders':
      return roleAccess(user, UserRoles.purchase_order);
    case 'salesorders':
      return roleAccess(user, UserRoles.sales_order);
    case 'returnorders':
      return roleAccess(user, UserRoles.return_order);
    default:
      return { view: false, edit: false };
  }
}

export function getUserSettingsPanelAccess(
  user: UserStateProps,
  _panelName: string
): PanelAccess {
  const allowed = user.isLoggedIn();
  return { view: allowed, edit: allowed };
}

export function canViewSettingsRoot(
  user: UserStateProps,
  root: SettingsRoot
): boolean {
  if (root === 'user') {
    return user.isLoggedIn();
  }

  if (!user.isLoggedIn()) {
    return false;
  }

  if (root === 'admin') {
    return user.isStaff() && hasPerm(user, UserRoles.admin, UserPermissions.view);
  }

  return user.isStaff();
}
