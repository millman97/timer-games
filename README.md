# Timer Games

Five timing games for solo play or sharing one phone. Built with Expo, React Native
and TypeScript, with an installable web app that works offline.

## Games

| Game                    | Players | How it works                                                |
| ----------------------- | ------- | ----------------------------------------------------------- |
| Imposter                | 3–12    | Time by feel, bluff your role, and vote for an imposter.    |
| Closest to the Target   | 2–12    | Get as close as possible to the target time.                |
| Closest in X Increments | 2–12    | Reach the target across several timed intervals.            |
| Stay Under the Time     | 1–12    | Add to a hidden total without going over the limit.         |
| Time Rush               | 1–12    | Complete five targets in sequence. Lowest total error wins. |

## Development

Requires Node.js 24.18 or newer and npm.

```sh
npm ci
npm start
```

Use `npm run web` for browser development.

### Checks

```sh
npm run lint
npm run typecheck
npm test
```

Format code with `npm run format`.

## Web deployment

Build and preview the web app:

```sh
npm run build:web
npm run preview
```

Deploy to Cloudflare Workers Static Assets using the name in `wrangler.jsonc`:

```sh
npx wrangler@4 login
npm run deploy
```

On iPhone, open the deployed HTTPS site in Safari and select **Share → Add to
Home Screen**. Open it online once before playing offline.

[Design notes](docs/design.md) · [MIT licence](LICENSE)
