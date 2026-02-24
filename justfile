
format:
  prettier --write '**/*.{ts,tsx}'

typecheck:
  npm run typecheck

demo:
  npx tsx src/main.ts demo Foo

schema:
  npx tsx tools/build-json-schema.ts


test:
  npm run test

_git_status:
  git status

check: test schema typecheck format _git_status