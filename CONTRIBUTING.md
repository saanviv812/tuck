# contributing

thanks for wanting to help! a few things that make it easy:

## reporting a bug

open an issue and include:

1. what you did, step by step
2. what you expected, and what happened instead
3. your Windows version and display scaling (Settings → System → Display)
4. if you can, `app.log` from `%APPDATA%\app.tuck.desktop\`

## suggesting something

open an issue or a discussion. tuck tries hard to stay small (see
[docs/product.md](docs/product.md)), so the best ideas make catching a thought
faster or nicer, not the app bigger.

## changing code

you'll need [Node](https://nodejs.org) 20+, [Rust](https://rustup.rs) and the
[C++ build tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/).

```bash
npm install
npm run app:dev       # the real app with live reload
npm run dev           # just the screens in a browser (uses fake local data)
npm run test:ui       # with `npm run dev` running: 46 automated checks
```

before opening a pull request:

- `npm run build` and `npm run test:ui` pass
- the change follows [docs/design.md](docs/design.md) (matte, flat, pixel, lowercase)
- anything that might open a window from a command is `async` (see [docs/architecture.md](docs/architecture.md))
- saving stays first: nothing new should slow it down

## drawing a new buddy

buddies are text in `src/buddies/cast.json`. copy an existing one, keep to the
rules in [docs/design.md](docs/design.md#the-buddies), and check it on
`http://localhost:1420/dev/sheet.html`.
