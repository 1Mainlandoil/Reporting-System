export const ROLES = {
  STAFF: 'staff',
  SUPERVISOR: 'supervisor',
  ADMIN: 'admin',
  TERMINAL_OPERATOR: 'terminal_operator',
  INSPECTOR: 'inspector',
}

export const ROLE_OPTIONS = [
  { label: 'Manager', value: ROLES.STAFF },
  { label: 'Supervisor', value: ROLES.SUPERVISOR },
  { label: 'Admin', value: ROLES.ADMIN },
  { label: 'Terminal Operator', value: ROLES.TERMINAL_OPERATOR },
  { label: 'Station Inspector', value: ROLES.INSPECTOR },
]

export const ROLE_ROUTE_MAP = {
  [ROLES.STAFF]: '/staff',
  [ROLES.SUPERVISOR]: '/supervisor',
  [ROLES.ADMIN]: '/admin/profit-loss',
  [ROLES.TERMINAL_OPERATOR]: '/terminal-operator',
  [ROLES.INSPECTOR]: '/inspector',
}
