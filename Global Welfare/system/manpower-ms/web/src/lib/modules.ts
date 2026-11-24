import {
  FileText, GlobeHemisphereWest, ListChecks, ShieldCheck, Users, UsersThree, Wallet,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';

export const APP_NAME = import.meta.env.VITE_APP_NAME ?? 'Global Welfare HR Solution';

export const ROLE_LABELS: Record<string, string> = {
  CEO: 'CEO',
  CEO_ADMIN: 'CEO administration',
  FINANCE_MANAGER: 'Finance manager',
  FINANCE_OFFICER: 'Finance officer',
  RECRUITMENT_OFFICER: 'Recruitment officer',
  PROCESSING_OFFICER: 'Processing officer',
  DATA_ENTRY: 'Data entry officer',
  TECH_ADMIN: 'Technical administrator',
};

export type ModuleDef = {
  key: string;
  title: string;
  description: string;
  icon: Icon;
  anyOf: string[];
  path?: string;
};

export const MODULES: ModuleDef[] = [
  { key: 'candidates', title: 'Candidates', description: 'Register people and track their applications.', icon: Users, anyOf: ['candidate.read', 'candidate.create'], path: '/candidates' },
  { key: 'applications', title: 'Applications', description: 'Track each candidate application by position.', icon: FileText, anyOf: ['application.read'], path: '/applications' },
  { key: 'catalogue', title: 'Catalogue', description: 'Countries, cities, employers, demands, and prices.', icon: GlobeHemisphereWest, anyOf: ['catalogue.read', 'catalogue.manage'], path: '/catalogue' },
  { key: 'finance', title: 'Finance', description: 'Receipts, expenses, commissions, settlements, and refunds.', icon: Wallet, anyOf: ['finance.receipt.read', 'finance.expense.read', 'finance.commission.manage', 'finance.settlement.prepare'], path: '/finance' },
  { key: 'approvals', title: 'Approvals', description: 'Review pending approval requests.', icon: ListChecks, anyOf: ['application.read', 'catalogue.manage', 'finance.settlement.approve', 'finance.commission.approve', 'application.source_change_approve'], path: '/approvals' },
  { key: 'users', title: 'Users', description: 'Manage user accounts and roles.', icon: UsersThree, anyOf: ['admin.users.manage'], path: '/users' },
  { key: 'audit', title: 'Audit log', description: 'Review recorded system activity.', icon: ShieldCheck, anyOf: ['audit.read'], path: '/audit' },
];
