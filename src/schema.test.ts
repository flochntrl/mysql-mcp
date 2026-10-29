import assert from "node:assert/strict";
import test from "node:test";
import { createSchemaHandlers, schemaTools, type MetadataQuery } from "./schema.js";

test("exposes only the three schema metadata tools in French", () => {
  assert.deepEqual(
    schemaTools.map(({ name }) => name),
    ["list_tables", "get_table_schema", "list_relations"],
  );
  assert.ok(schemaTools.every(({ description }) => /SELECT/.test(description)));
  assert.ok(schemaTools.every(({ description }) => /n’exécute jamais/.test(description)));
});

test("lists tables through information_schema only", async () => {
  const queries: string[] = [];
  const query: MetadataQuery = async (sql) => {
    queries.push(sql);
    return [{ tableName: "accounts", tableType: "BASE TABLE" }];
  };
  const handlers = createSchemaHandlers(query);

  assert.deepEqual(await handlers.listTables(), [
    { tableName: "accounts", tableType: "BASE TABLE" },
  ]);
  assert.equal(queries.length, 1);
  assert.match(queries[0], /FROM information_schema\.TABLES/);
  assert.doesNotMatch(queries[0], /FROM\s+(?!information_schema)/i);
});

test("returns only columns, primary key and foreign keys for one table", async () => {
  const queries: Array<{ sql: string; params: readonly string[] }> = [];
  const query: MetadataQuery = async (sql, params) => {
    queries.push({ sql, params });
    if (/information_schema\.COLUMNS/.test(sql)) {
      return [
        {
          columnName: "id",
          dataType: "int",
          columnType: "int unsigned",
          isNullable: "NO",
          ordinalPosition: 1,
        },
      ];
    }
    if (/TABLE_CONSTRAINTS/.test(sql)) return [{ columnName: "id" }];
    return [
      {
        constraintName: "fk_orders_account",
        columnName: "account_id",
        referencedTable: "accounts",
        referencedColumn: "id",
      },
    ];
  };
  const handlers = createSchemaHandlers(query);

  assert.deepEqual(await handlers.getTableSchema({ tableName: " orders " }), {
    tableName: "orders",
    columns: [
      {
        columnName: "id",
        dataType: "int",
        columnType: "int unsigned",
        isNullable: "NO",
        ordinalPosition: 1,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        constraintName: "fk_orders_account",
        columnName: "account_id",
        referencedTable: "accounts",
        referencedColumn: "id",
      },
    ],
  });
  assert.equal(queries.length, 3);
  assert.ok(queries.every(({ sql }) => /information_schema\./.test(sql)));
  assert.ok(queries.every(({ params }) => params[0] === "orders"));
});

test("rejects empty or oversized table names before querying", async () => {
  let queryCount = 0;
  const handlers = createSchemaHandlers(async () => {
    queryCount++;
    return [];
  });

  await assert.rejects(handlers.getTableSchema({ tableName: " " }));
  await assert.rejects(handlers.getTableSchema({ tableName: "t".repeat(65) }));
  assert.equal(queryCount, 0);
});

test("lists foreign-key relations from information_schema only", async () => {
  const queries: string[] = [];
  const handlers = createSchemaHandlers(async (sql) => {
    queries.push(sql);
    return [
      {
        tableName: "orders",
        constraintName: "fk_orders_account",
        columnName: "account_id",
        referencedTable: "accounts",
        referencedColumn: "id",
      },
    ];
  });

  assert.deepEqual(await handlers.listRelations(), [
    {
      tableName: "orders",
      constraintName: "fk_orders_account",
      columnName: "account_id",
      referencedTable: "accounts",
      referencedColumn: "id",
    },
  ]);
  assert.equal(queries.length, 1);
  assert.match(queries[0], /FROM information_schema\.KEY_COLUMN_USAGE/);
});
