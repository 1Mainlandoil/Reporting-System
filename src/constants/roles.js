export const ROLES = {
  STAFF: 'staff',
  SUPERVISOR: 'supervisor',
  ADMIN: 'admin',
}

export const ROLE_OPTIONS = [
  { label: 'Manager', value: ROLES.STAFF },
  { label: 'Supervisor', value: ROLES.SUPERVISOR },
  { label: 'Admin', value: ROLES.ADMIN },
]

export const ROLE_ROUTE_MAP = {
  [ROLES.STAFF]: '/staff',
  [ROLES.SUPERVISOR]: '/supervisor',
  [ROLES.ADMIN]: '/admin/dashboard',
}
