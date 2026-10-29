import { z } from "zod";

export interface TableMetadata {
  tableName: string;
  tableType: string;
}

export interface ColumnMetadata {
  columnName: string;
  dataType: string;
  columnType: string;
  isNullable: "YES" | "NO";
  ordinalPosition: number;
}

export interface ForeignKeyMetadata {
  constraintName: string;
  columnName: string;
  referencedTable: string;
  referencedColumn: string;
}

export interface TableSchema {
  tableName: string;
  columns: ColumnMetadata[];
  primaryKey: string[];
  foreignKeys: ForeignKeyMetadata[];
}

export interface RelationMetadata extends ForeignKeyMetadata {
  tableName: string;
}

export type MetadataRow = Record<string, unknown>;
export type MetadataQuery = (
  sql: string,
  params: readonly string[],
) => Promise<MetadataRow[]>;

const tableNameSchema = z.string().trim().min(1).max(64);
const tableMetadataSchema = z.object({
  tableName: z.string(),
  tableType: z.string(),
});
const columnMetadataSchema = z.object({
  columnName: z.string(),
  dataType: z.string(),
  columnType: z.string(),
  isNullable: z.enum(["YES", "NO"]),
  ordinalPosition: z.number(),
});
const foreignKeyMetadataSchema = z.object({
  constraintName: z.string(),
  columnName: z.string(),
  referencedTable: z.string(),
  referencedColumn: z.string(),
});
const relationMetadataSchema = foreignKeyMetadataSchema.extend({
  tableName: z.string(),
});

export const schemaTools = [
  {
    name: "list_tables",
    title: "Lister les tables",
    description:
      "Liste les tables et vues de la base MySQL/MariaDB configurée, sans lire leurs données. Utilisez ces métadonnées pour proposer une requête SELECT que l’utilisateur exécutera séparément; ce serveur n’exécute jamais de requête métier.",
  },
  {
    name: "get_table_schema",
    title: "Décrire une table",
    description:
      "Retourne les colonnes, leurs types, la clé primaire et les clés étrangères d’une table de la base configurée. Ne lit aucune ligne de table. Utilisez ces métadonnées pour proposer une requête SELECT à exécuter séparément; ce serveur n’exécute jamais de requête métier.",
  },
  {
    name: "list_relations",
    title: "Lister les relations",
    description:
      "Liste les relations de clés étrangères entre tables de la base configurée. Ne lit aucune ligne de table. Utilisez ces métadonnées pour proposer une requête SELECT à exécuter séparément; ce serveur n’exécute jamais de requête métier.",
  },
] as const;

const listTablesSql = `
  SELECT TABLE_NAME AS tableName, TABLE_TYPE AS tableType
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
  ORDER BY TABLE_NAME
`;

const listColumnsSql = `
  SELECT
    COLUMN_NAME AS columnName,
    DATA_TYPE AS dataType,
    COLUMN_TYPE AS columnType,
    IS_NULLABLE AS isNullable,
    ORDINAL_POSITION AS ordinalPosition
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
  ORDER BY ORDINAL_POSITION
`;

const listPrimaryKeySql = `
  SELECT KEY_COLUMN_USAGE.COLUMN_NAME AS columnName
  FROM information_schema.TABLE_CONSTRAINTS
  JOIN information_schema.KEY_COLUMN_USAGE
    ON KEY_COLUMN_USAGE.CONSTRAINT_SCHEMA = TABLE_CONSTRAINTS.CONSTRAINT_SCHEMA
    AND KEY_COLUMN_USAGE.TABLE_NAME = TABLE_CONSTRAINTS.TABLE_NAME
    AND KEY_COLUMN_USAGE.CONSTRAINT_NAME = TABLE_CONSTRAINTS.CONSTRAINT_NAME
  WHERE TABLE_CONSTRAINTS.CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_CONSTRAINTS.TABLE_NAME = ?
    AND TABLE_CONSTRAINTS.CONSTRAINT_TYPE = 'PRIMARY KEY'
  ORDER BY KEY_COLUMN_USAGE.ORDINAL_POSITION
`;

const listTableForeignKeysSql = `
  SELECT
    CONSTRAINT_NAME AS constraintName,
    COLUMN_NAME AS columnName,
    REFERENCED_TABLE_NAME AS referencedTable,
    REFERENCED_COLUMN_NAME AS referencedColumn
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = ?
    AND REFERENCED_TABLE_NAME IS NOT NULL
  ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION
`;

const listRelationsSql = `
  SELECT
    TABLE_NAME AS tableName,
    CONSTRAINT_NAME AS constraintName,
    COLUMN_NAME AS columnName,
    REFERENCED_TABLE_NAME AS referencedTable,
    REFERENCED_COLUMN_NAME AS referencedColumn
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND REFERENCED_TABLE_NAME IS NOT NULL
  ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION
`;

export function createSchemaHandlers(query: MetadataQuery) {
  return {
    async listTables(): Promise<TableMetadata[]> {
      return z.array(tableMetadataSchema).parse(await query(listTablesSql, []));
    },

    async getTableSchema(input: { tableName: unknown }): Promise<TableSchema> {
      const tableName = tableNameSchema.parse(input.tableName);
      const [columnRows, primaryKeyRows, foreignKeyRows] = await Promise.all([
        query(listColumnsSql, [tableName]),
        query(listPrimaryKeySql, [tableName]),
        query(listTableForeignKeysSql, [tableName]),
      ]);
      const columns = z.array(columnMetadataSchema).parse(columnRows);
      const primaryKey = z
        .array(z.object({ columnName: z.string() }))
        .parse(primaryKeyRows);
      const foreignKeys = z.array(foreignKeyMetadataSchema).parse(foreignKeyRows);

      return {
        tableName,
        columns,
        primaryKey: primaryKey.map((row) => row.columnName),
        foreignKeys,
      };
    },

    async listRelations(): Promise<RelationMetadata[]> {
      return z.array(relationMetadataSchema).parse(await query(listRelationsSql, []));
    },
  };
}
