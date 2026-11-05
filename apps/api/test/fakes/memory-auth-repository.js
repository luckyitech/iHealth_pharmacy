/**
 * In-memory AuthRepository with the same synthetic accounts as packages/db/sql/seed/02-test-data.sql.
 * The integration tests run the real repository against MySQL; these fakes keep unit tests fast.
 */

export const SEED = Object.freeze({
  admin: {
    username: 'test.admin',
    password: 'Test-Admin-Pass-1',
    pin: '1234',
    employeeId: 1,
    credentialsId: 1,
  },
  cashier: {
    username: 'test.cashier',
    password: 'Test-Cashier-Pass-1',
    employeeId: 2,
    credentialsId: 2,
  },
  inactive: {
    username: 'test.inactive',
    password: 'Test-Inactive-Pass-1',
    employeeId: 3,
    credentialsId: 3,
  },
});

const ADMIN_BCRYPT = '$2b$10$JJ7Aer1AczhFkRnJGS3/u..zWDZXE.jKaMdoEICbOoy0naTbhfGvS';
const PIN_BCRYPT = '$2b$10$pSkSqcUIDnsK1tRVG915Su.8O9wCdzvHc0KhfO6vpP85Kg7kxNo2q';

/**
 * @returns {import('../../src/features/auth/auth.repository.js').AuthRepository & { state: ReturnType<typeof initialState> }}
 */
export function createMemoryAuthRepository() {
  const state = initialState();
  let nextTokenId = 1n;

  const repository = {
    state,
    async findCredentialsByUsername(/** @type {string} */ username) {
      return state.credentials.find((row) => row.username === username) ?? null;
    },
    async findCredentialsById(/** @type {number} */ id) {
      return state.credentials.find((row) => row.credentialsId === id) ?? null;
    },
    async findCredentialsByEmployee(/** @type {number} */ employeeId) {
      return state.credentials.find((row) => row.employeeId === employeeId) ?? null;
    },
    async findEmployee(/** @type {number} */ employeeId) {
      return state.employees.find((row) => row.employeeId === employeeId) ?? null;
    },
    async findRoles(/** @type {number} */ employeeId) {
      return state.roles
        .filter((role) => role.employeeId === employeeId)
        .map(({ employeeId: _e, ...role }) => role);
    },
    async findEffectivePermissionIds(/** @type {number} */ employeeId) {
      return [...(state.grants.get(employeeId) ?? [])].sort((a, b) => a - b);
    },
    async findUpgradedPassword(/** @type {number} */ credentialsId) {
      return state.upgraded.get(credentialsId) ?? null;
    },
    async saveUpgradedPassword(
      /** @type {number} */ credentialsId,
      /** @type {string} */ hash,
      /** @type {string} */ fingerprint,
    ) {
      state.upgraded.set(credentialsId, { hash, legacyFingerprint: fingerprint });
    },
    async insertRefreshToken(/** @type {any} */ token) {
      const id = nextTokenId++;
      state.tokens.push({ id, ...token, revokedAt: null, revokedReason: null, replacedById: null });
      return id;
    },
    async findRefreshToken(/** @type {string} */ tokenHash) {
      return state.tokens.find((token) => token.tokenHash === tokenHash) ?? null;
    },
    async revokeRefreshToken(
      /** @type {bigint} */ id,
      /** @type {string} */ reason,
      /** @type {bigint | null} */ replacedById,
    ) {
      const token = state.tokens.find((row) => row.id === id && !row.revokedAt);
      if (token)
        Object.assign(token, { revokedAt: new Date(), revokedReason: reason, replacedById });
    },
    async revokeFamily(/** @type {string} */ familyId, /** @type {string} */ reason) {
      for (const token of state.tokens) {
        if (token.familyId === familyId && !token.revokedAt)
          Object.assign(token, { revokedAt: new Date(), revokedReason: reason });
      }
    },
    async transaction(/** @type {(tx: any) => Promise<any>} */ work) {
      return work({});
    },
  };
  return /** @type {any} */ (repository);
}

function initialState() {
  return {
    credentials: [
      {
        credentialsId: 1,
        employeeId: 1,
        username: 'test.admin',
        legacyPassword: ADMIN_BCRYPT,
        approvalPin: PIN_BCRYPT,
        active: true,
        twoFactorEnabled: false,
      },
      {
        credentialsId: 2,
        employeeId: 2,
        username: 'test.cashier',
        legacyPassword: 'Test-Cashier-Pass-1',
        approvalPin: null,
        active: true,
        twoFactorEnabled: false,
      },
      {
        credentialsId: 3,
        employeeId: 3,
        username: 'test.inactive',
        legacyPassword: 'Test-Inactive-Pass-1',
        approvalPin: null,
        active: false,
        twoFactorEnabled: false,
      },
    ],
    employees: [
      {
        employeeId: 1,
        firstName: 'Ada',
        lastName: 'Admin',
        email: 'admin@example.test',
        pharmacyId: 1,
        active: true,
      },
      {
        employeeId: 2,
        firstName: 'Carl',
        lastName: 'Cashier',
        email: 'cashier@example.test',
        pharmacyId: 1,
        active: true,
      },
      {
        employeeId: 3,
        firstName: 'Ivy',
        lastName: 'Inactive',
        email: 'inactive@example.test',
        pharmacyId: 1,
        active: false,
      },
    ],
    roles: [
      { employeeId: 1, roleId: 1, name: 'ADMIN', pharmacyBranchId: 1 },
      { employeeId: 2, roleId: 2, name: 'CASHIER', pharmacyBranchId: 1 },
    ],
    /** @type {Map<number, Set<number>>} */
    grants: new Map([[2, new Set([6, 8])]]),
    /** @type {Map<number, { hash: string, legacyFingerprint: string }>} */
    upgraded: new Map(),
    /** @type {any[]} */
    tokens: [],
  };
}
