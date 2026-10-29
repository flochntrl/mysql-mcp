# Serveur MCP de schéma MySQL/MariaDB

Ce serveur local communique avec Copilot par **stdio** et se connecte à une seule base configurée par variables d’environnement. Il expose uniquement les métadonnées de schéma : tables/vues, colonnes et types, clés primaires et relations par clés étrangères. Il ne lit aucune ligne métier et ne propose aucun outil d’exécution SQL. Copilot peut s’appuyer sur ces métadonnées pour **proposer une requête `SELECT` à exécuter séparément**.

Le compte MySQL existant conserve ses privilèges actuels. Le serveur n’exécute aucune requête métier et ne restreint ni n’élargit les privilèges du compte.

## Prérequis et construction de l’image

- Docker avec accès au réseau Docker Compose de MySQL.
- Node.js 24 et npm, uniquement pour les tests ou la construction locale de développement.

Depuis ce dossier, construire l’image MCP :

```sh
docker build -t mysql-schema-mcp:local .
```

Le serveur s’exécute dans son propre conteneur sur le même réseau Docker que MySQL. Le nom d’hôte `mysql` est alors résolu par Docker. Aucun réseau ni secret n’est figé dans l’image ou dans ce dépôt.

Pour retrouver le nom du réseau Compose auquel le conteneur MySQL est attaché, repérez son conteneur (`docker compose ps`) puis inspectez ses réseaux :

```sh
docker inspect <conteneur-mysql> --format '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}'
```

Utilisez le réseau affiché à la place de `<reseau-compose>` dans la configuration Copilot ci-dessous. Si vous avez plusieurs conteneurs Compose, sélectionnez le réseau du conteneur qui héberge MySQL. Le nom `mysql` doit être un alias/DNS utilisable sur ce réseau.

Vérification dans l’environnement Docker utilisé pour préparer ce projet : le conteneur MySQL était sur `saga_default`, et `mysql` s’y résolvait depuis un conteneur. Le fichier de configuration conserve volontairement `<reseau-compose>` pour que vous puissiez utiliser le nom réellement affiché par votre installation.

## Variables de connexion

Configurez les variables dans la configuration MCP **locale et non versionnée de Copilot**, pas dans ce dépôt :

| Variable | Valeur |
| --- | --- |
| `MYSQL_HOST` | `mysql` |
| `MYSQL_PORT` | `3306` par défaut, ou le port MySQL du conteneur |
| `MYSQL_DATABASE` | `dkt-saga` |
| `MYSQL_USER` | Nom de votre compte MySQL existant |
| `MYSQL_PASSWORD` | Mot de passe de ce compte |
| `MYSQL_CHARSET` | `utf8mb4` par défaut |

`MYSQL_HOST`, `MYSQL_DATABASE`, `MYSQL_USER` et `MYSQL_PASSWORD` sont obligatoires. Le port et le jeu de caractères ont des valeurs par défaut. Le mot de passe n’est pas écrit dans l’image, les journaux ou les fichiers du projet. Les messages d’erreur indiquent un code, jamais les variables de connexion.

## Configuration de GitHub Copilot Desktop

La documentation GitHub indique que l’application Copilot rend disponibles les serveurs MCP configurés pour Copilot CLI et permet aussi d’ajouter un serveur personnalisé depuis **Customize > MCP**. La méthode ci-dessous utilise la configuration utilisateur Copilot CLI, prise en charge par l’application.

1. Construisez l’image Docker comme indiqué plus haut.
2. Ouvrez `~/.copilot/mcp-config.json` (créez le fichier si nécessaire). Ce fichier est dans votre dossier personnel, pas dans le dépôt.
3. Ajoutez cette entrée dans l’objet `mcpServers`, en remplaçant le réseau et les valeurs utilisateur. Ne collez jamais le vrai mot de passe dans le dépôt :

```json
{
  "mcpServers": {
    "mysql-schema": {
      "type": "local",
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "--network",
        "<reseau-compose>",
        "-e",
        "MYSQL_HOST",
        "-e",
        "MYSQL_PORT",
        "-e",
        "MYSQL_DATABASE",
        "-e",
        "MYSQL_USER",
        "-e",
        "MYSQL_PASSWORD",
        "-e",
        "MYSQL_CHARSET",
        "mysql-schema-mcp:local"
      ],
      "env": {
        "MYSQL_HOST": "mysql",
        "MYSQL_PORT": "3306",
        "MYSQL_DATABASE": "dkt-saga",
        "MYSQL_USER": "<votre-compte-mysql>",
        "MYSQL_PASSWORD": "<votre-mot-de-passe>",
        "MYSQL_CHARSET": "utf8mb4"
      },
      "tools": ["*"]
    }
  }
}
```

Les options Docker `-e NOM` transmettent au conteneur les valeurs définies dans `env` par Copilot. Remplacez les deux valeurs entre chevrons, puis gardez le fichier de configuration utilisateur privé. N’ajoutez pas cette configuration au dépôt. L’option `-i` conserve stdio pour le protocole MCP; n’ajoutez pas `-t`.

Vous pouvez aussi ajouter le même serveur depuis **Customize > MCP > Add custom server** : type **Local/STDIO**, commande `docker`, arguments correspondant à la liste `args` ci-dessus et variables d’environnement correspondant à `env`. Renseignez les valeurs dans l’interface de Copilot, sans les enregistrer dans ce projet.

Après la configuration, vérifiez dans **Customize > Installed** que le serveur est présent puis demandez à Copilot de lister les tables disponibles. Les outils sont `list_tables`, `get_table_schema` et `list_relations`.

## Développement et tests

```sh
npm ci
npm test
npm run typecheck
npm run build
```

Pour lancer le serveur hors Docker à des fins de développement, définissez les variables `MYSQL_*` dans le processus puis exécutez `npm start`. Dans ce mode, l’hôte `mysql` ne fonctionnera que si le processus Node.js est lui-même sur le réseau Docker ou si ce nom est résolu depuis la machine hôte.

La connexion utilise un délai maximal de 10 secondes; les requêtes de métadonnées ont également un délai maximal de 10 secondes. À l’arrêt, le serveur ferme sa connexion au pool MySQL.

## Configuration de référence

- [GitHub Copilot app : personnaliser l’application et configurer MCP](https://docs.github.com/en/copilot/how-tos/github-copilot-app/customize-github-copilot-app)
- [GitHub Copilot CLI : ajouter des serveurs MCP et configurer `~/.copilot/mcp-config.json`](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers)
