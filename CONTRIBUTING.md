# Contributing

Thanks for your interest in contributing to `node-kaseya-vsax`.

## Development setup

```bash
git clone https://github.com/WYRE-AI/node-kaseya-vsax.git
cd node-kaseya-vsax
npm install
npm test
```

## Quality bar

Before opening a pull request, please make sure:

- `npm test` passes
- `npm run typecheck` is clean
- `npm run lint` is clean
- `npm run build` produces `dist/` with both CJS and ESM
- New behavior is covered by tests in `tests/`
- No `any` types in the public surface

## Commit messages

This project uses [semantic-release](https://semantic-release.gitbook.io/),
so commit messages must follow the
[Conventional Commits](https://www.conventionalcommits.org/) spec:

- `feat: …` — new feature (minor version bump)
- `fix: …` — bug fix (patch version bump)
- `docs: …`, `chore: …`, `refactor: …`, `test: …` — no version bump
- `feat!: …` or `BREAKING CHANGE:` in the body — major version bump

## License

By contributing you agree that your contributions will be licensed under the
project's [Apache-2.0 license](LICENSE).
