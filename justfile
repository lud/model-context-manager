
format:
  prettier --write '**/*.{ts,tsx}'

typecheck:
  npm run typecheck

demo:
  npx tsx src/main.ts demo Foo

test:
  npm run test

_git_status:
  git status

check: test typecheck format _git_status