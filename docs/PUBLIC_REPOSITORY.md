# Public Repository Boundary

EstateFlow is an in-progress Arabic-first Training Demo. This guide defines what may be public and what must remain private.

## Included

The public repository may include:

- Application source, tests, and documentation needed to study the project.
- Prisma schema, versioned migrations, and PostGIS initialization scripts.
- Isolated local and test Docker Compose templates.
- Placeholder-only configuration in [`.env.example`](../.env.example).
- Synthetic/demo fixtures when they contain no real person, customer, office, or operational record.
- Architecture, learning, and verification material that contains no sensitive values.

## Excluded

The public repository must not include:

- `.env` files, credentials, tokens, private keys, or real connection strings.
- Database dumps, SQLite files, database volumes, backups, or operational records.
- Customer, broker, employee, office, financial, or other real-world data.
- Production infrastructure topology, private hostnames, IP addresses, or deployment configuration.
- Generated build output, local logs, or editor state.

## Configuration policy

Copy `.env.example` to an untracked `.env` only for an isolated local setup. Its values are intentionally placeholders, not usable defaults. Use local-only values and keep local and test databases separate. The test stack may permit destructive operations only when its explicit safety flag targets the isolated test database.

## Database material

Public database material is limited to the Prisma schema, versioned migrations, PostGIS initialization, and isolated local/test Compose templates. No database dump, volume, operational record, or real data is included.

## Publishing-audit checklist

Before any public publication, an independent reviewer must confirm:

- [ ] `.gitignore` ignores `.env` variants and database files while allowing `.env.example`.
- [ ] `.env.example` contains placeholders only—no credential, host, IP address, port, or connection string.
- [ ] No dump, volume, SQLite file, real data, secret, token, or private key is staged.
- [ ] README, SECURITY.md, and this guide accurately describe the Training Demo boundary.
- [ ] LICENSE is the intended MIT License.
- [ ] The staged content is independently audited before any commit, push, release, or publication.
