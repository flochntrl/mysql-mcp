export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  charset: string;
}

export function readDatabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseConfig {
  const host = requiredValue(env, "MYSQL_HOST");
  const database = requiredValue(env, "MYSQL_DATABASE");
  const user = requiredValue(env, "MYSQL_USER");
  const password = requiredValue(env, "MYSQL_PASSWORD", true);
  const rawPort = env.MYSQL_PORT ?? "3306";
  const port = Number(rawPort);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("MYSQL_PORT doit être un entier compris entre 1 et 65535.");
  }

  const charset = env.MYSQL_CHARSET ?? "utf8mb4";
  if (!/^[A-Za-z0-9_]+$/.test(charset)) {
    throw new Error("MYSQL_CHARSET contient des caractères non valides.");
  }

  return { host, port, database, user, password, charset };
}

function requiredValue(
  env: NodeJS.ProcessEnv,
  name: string,
  allowEmpty = false,
): string {
  const value = env[name];
  if (value === undefined || (!allowEmpty && value.trim() === "")) {
    throw new Error(`${name} est obligatoire.`);
  }

  return value;
}
