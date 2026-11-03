import { describe, expect, it } from 'vitest';

import { camelizeSchema, toCamelCase, toPascalCase } from './camelize-schema.js';

const introspected = `generator client {
  provider = "prisma-client-js"
}

model employee {
  EMPLOYEE_ID     Int               @id @default(autoincrement())
  FIRST_NM        String            @db.VarChar(50)
  GENDER          employee_GENDER?
  employee_access employee_access[]
}

model employee_access {
  EMPLOYEE_ACCESS_ID Int      @id @default(autoincrement())
  EMPLOYEE_ID        Int
  ACTIVE_S           String?  @db.Char(1) // legacy flag
  employee           employee @relation(fields: [EMPLOYEE_ID], references: [EMPLOYEE_ID], onDelete: NoAction, map: "FK_EA_EMP")

  @@index([EMPLOYEE_ID, ACTIVE_S(length: 1)], map: "IDX_EA_EMP")
}

model chart_of_accounts {
  ID           Int           @id
  ACCOUNT_TYPE Int?
  account_type account_type? @relation(fields: [ACCOUNT_TYPE], references: [ACCOUNT_TYPE_ID])
}

model account_type {
  ACCOUNT_TYPE_ID   Int                 @id
  chart_of_accounts chart_of_accounts[]
}

model stock_adjustment_working {
  ID Int @id
}

model stock_adjustment_working {
  X24_HOURS String? @map("24_HOURS") @db.Char(1)

  @@map("#stock_adjustment_working")
  @@ignore
}

enum employee_GENDER {
  M
  F
}
`;

describe('name helpers', () => {
  it('converts legacy names', () => {
    expect(toPascalCase('employee_pharmacy_role')).toBe('EmployeePharmacyRole');
    expect(toCamelCase('EMPLOYEE_ID')).toBe('employeeId');
    expect(toCamelCase('X24_HOURS')).toBe('x24Hours');
    expect(toPascalCase('24_hours')).toBe('T24Hours');
  });
});

describe('camelizeSchema', () => {
  const output = camelizeSchema(introspected);

  it('renames models and keeps the table name with @@map', () => {
    expect(output).toContain('model EmployeeAccess {');
    expect(output).toContain('@@map("employee_access")');
  });

  it('renames scalar fields and keeps the column name with @map', () => {
    expect(output).toMatch(
      /employeeId\s+Int\s+@id @default\(autoincrement\(\)\) @map\("EMPLOYEE_ID"\)/,
    );
    expect(output).toContain('@db.Char(1) @map("ACTIVE_S") // legacy flag');
  });

  it('rewrites relation and index references', () => {
    expect(output).toContain('@relation(fields: [employeeId], references: [employeeId]');
    expect(output).toContain('@@index([employeeId, activeS(length: 1)], map: "IDX_EA_EMP")');
    expect(output).toMatch(/employeeAccess\s+EmployeeAccess\[\]/);
  });

  it('suffixes a relation field that collides with its foreign-key column', () => {
    expect(output).toMatch(/accountType\s+Int\? @map\("ACCOUNT_TYPE"\)/);
    expect(output).toMatch(
      /accountTypeRelation\s+AccountType\?\s+@relation\(fields: \[accountType\], references: \[accountTypeId\]\)/,
    );
  });

  it('renames enums and their uses', () => {
    expect(output).toContain('enum EmployeeGender {');
    expect(output).toMatch(/gender\s+EmployeeGender\?/);
  });

  it('gives legacy # scratch tables a Temp prefix so they do not clash with the regular table', () => {
    expect(output).toContain('model StockAdjustmentWorking {');
    expect(output).toContain('model TempStockAdjustmentWorking {');
  });

  it('keeps existing @map and @@map attributes', () => {
    expect(output).toContain('x24Hours String? @map("24_HOURS")');
    expect(output.match(/@@map\("#stock_adjustment_working"\)/g)).toHaveLength(1);
  });

  it('is idempotent', () => {
    expect(camelizeSchema(output)).toBe(output);
  });
});
