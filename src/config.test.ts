import assert from "node:assert/strict";
import test from "node:test";
import { readDatabaseConfig } from "./config.js";

test("reads database connection settings and default port/charset", () => {
  assert.deepEqual(
    readDatabaseConfig({
      MYSQL_HOST: "mysql",
      MYSQL_DATABASE: "dkt-saga",
      MYSQL_USER: "schema-reader",
      MYSQL_PASSWORD: "",
    }),
    {
      host: "mysql",
      port: 3306,
      database: "dkt-saga",
      user: "schema-reader",
      password: "",
      charset: "utf8mb4",
    },
  );
});

test("rejects invalid ports and missing required settings", () => {
  const env = {
    MYSQL_HOST: "mysql",
    MYSQL_DATABASE: "dkt-saga",
    MYSQL_USER: "schema-reader",
    MYSQL_PASSWORD: "not-a-real-password",
  };

  assert.throws(() => readDatabaseConfig({ ...env, MYSQL_PORT: "0" }), /MYSQL_PORT/);
  assert.throws(() => readDatabaseConfig({ ...env, MYSQL_PORT: "3306.5" }), /MYSQL_PORT/);
  assert.throws(() => readDatabaseConfig({ ...env, MYSQL_HOST: undefined }), /MYSQL_HOST/);
});
