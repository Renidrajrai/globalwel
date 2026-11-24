import 'dotenv/config';
import { prisma } from '../src/db';
import { hashPassword } from '../src/lib/password';
import { PERMISSIONS, ROLES } from '../src/rbac/catalog';

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

const CATEGORY_TREE: Record<string, string[]> = {
  'Office overhead': ['Rent', 'Staff salary', 'Electricity', 'Internet', 'Drinking water', 'Office food', 'Stationery', 'Computer and equipment', 'Repair and maintenance'],
  'Applicant processing': ['Medical', 'Police clearance', 'Translation', 'Document processing', 'Courier', 'Appointment payments'],
  'Interview travel': ['Bus ticket', 'Accommodation', 'Meals', 'Local transport', 'Baggage', 'Other trip costs'],
  'Demand and recruitment': ['Employer documentation', 'Advertisement', 'Attestation', 'Recruitment event'],
  Miscellaneous: [],
};

async function ensureCategory(name: string, parentId: string | null) {
  const normalizedName = normalize(name);
  const found = await prisma.expenseCategory.findFirst({ where: { parentId, normalizedName } });
  if (found) return found;
  return prisma.expenseCategory.create({ data: { name, normalizedName, parentId, isSystem: true } });
}

async function main() {
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { description: p.description },
      create: { code: p.code, description: p.description },
    });
  }

  for (const r of ROLES) {
    const role = await prisma.role.upsert({
      where: { code: r.code },
      update: { name: r.name, description: r.description },
      create: { code: r.code, name: r.name, description: r.description },
    });
    const perms = await prisma.permission.findMany({ where: { code: { in: r.permissions } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }

  const { SEED_EMAIL, SEED_NAME, SEED_PASSWORD, SEED_ROLE } = process.env;
  if (SEED_EMAIL && SEED_NAME && SEED_PASSWORD && SEED_ROLE) {
    if (SEED_PASSWORD.length < 12) throw new Error('SEED_PASSWORD must be at least 12 characters.');
    const role = await prisma.role.findUnique({ where: { code: SEED_ROLE } });
    if (!role) throw new Error(`Unknown role ${SEED_ROLE}`);
    const email = SEED_EMAIL.trim().toLowerCase();
    const passwordHash = await hashPassword(SEED_PASSWORD);
    const user = await prisma.user.upsert({
      where: { email },
      update: { fullName: SEED_NAME, passwordHash, status: 'ACTIVE', failedLogins: 0, lockedUntil: null },
      create: { email, fullName: SEED_NAME, passwordHash },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
    console.log(`User ${email} ready with role ${SEED_ROLE}`);
  }
  for (const [parentName, children] of Object.entries(CATEGORY_TREE)) {
    const parent = await ensureCategory(parentName, null);
    for (const child of children) await ensureCategory(child, parent.id);
  }
  console.log('Expense categories synced.');
  console.log('Roles and permissions synced.');
}

main().finally(() => prisma.$disconnect());
