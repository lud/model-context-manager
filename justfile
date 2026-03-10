default: test

install: build schema
  cp dist/mcm ~/.local/bin/mcm

uninstall:
  rm -f ~/.local/bin/mcm

build:
  npm run build

upgrade-bun:
  bun upgrade

format:
  prettier --write '**/*.{ts,tsx}'

typecheck:
  npm run typecheck

demo:
  npx tsx src/main.ts demo Foo

schema:
  npx tsx tools/build-json-schema.ts


site:
  npx tsx tools/build-site.ts

test:
  npm run test

_git_status:
  git status

check: test schema site typecheck format _git_status