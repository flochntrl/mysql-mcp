import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createPool, type RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { readDatabaseConfig } from "./config.js";
import { createSchemaHandlers, schemaTools } from "./schema.js";

const CONNECTION_TIMEOUT_MS = 10_000;
const QUERY_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  const config = readDatabaseConfig();
  const pool = createPool({
    ...config,
    waitForConnections: true,
    connectionLimit: 2,
    connectTimeout: CONNECTION_TIMEOUT_MS,
  });

  let server: McpServer | undefined;

  try {
    const connection = await pool.getConnection();
    connection.release();

    const handlers = createSchemaHandlers(async (sql, params) => {
      const [rows] = await pool.query<RowDataPacket[]>(
        { sql, timeout: QUERY_TIMEOUT_MS },
        [...params],
      );
      return rows;
    });

    server = new McpServer({
      name: "mysql-schema-mcp",
      version: "1.0.0",
    });

    server.registerTool(
      "list_tables",
      {
        title: schemaTools[0].title,
        description: schemaTools[0].description,
        inputSchema: {},
        annotations: { readOnlyHint: true, destructiveHint: false },
      },
      async () => ({
        content: [{ type: "text", text: JSON.stringify(await handlers.listTables()) }],
      }),
    );

    server.registerTool(
      "get_table_schema",
      {
        title: schemaTools[1].title,
        description: schemaTools[1].description,
        inputSchema: { tableName: z.string().trim().min(1).max(64) },
        annotations: { readOnlyHint: true, destructiveHint: false },
      },
      async ({ tableName }) => ({
        content: [
          {
            type: "text",
            text: JSON.stringify(await handlers.getTableSchema({ tableName })),
          },
        ],
      }),
    );

    server.registerTool(
      "list_relations",
      {
        title: schemaTools[2].title,
        description: schemaTools[2].description,
        inputSchema: {},
        annotations: { readOnlyHint: true, destructiveHint: false },
      },
      async () => ({
        content: [{ type: "text", text: JSON.stringify(await handlers.listRelations()) }],
      }),
    );

    const transport = new StdioServerTransport();
    await server.connect(transport);

    let closing = false;
    const close = async () => {
      if (closing) return;
      closing = true;
      const cleanupErrors: string[] = [];
      await server?.close().catch(() => {
        cleanupErrors.push("serveur MCP");
      });
      await pool.end().catch(() => {
        cleanupErrors.push("pool MySQL");
      });
      if (cleanupErrors.length > 0) {
        console.error(`Erreur lors de la fermeture du ${cleanupErrors.join(" et du ")}.`);
        process.exitCode = 1;
      }
    };

    process.once("SIGINT", () => void close());
    process.once("SIGTERM", () => void close());
  } catch (error) {
    await server?.close().catch(() => {
      console.error("Impossible de fermer proprement le serveur MCP.");
    });
    await pool.end().catch(() => {
      console.error("Impossible de fermer proprement le pool MySQL.");
    });
    throw error;
  }
}

main().catch((error: unknown) => {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "ERREUR";
  console.error(
    `Impossible de démarrer le serveur MCP ou de se connecter à MySQL/MariaDB (${code}). Vérifiez les variables MYSQL_* et l’accès réseau au serveur.`,
  );
  process.exitCode = 1;
});
