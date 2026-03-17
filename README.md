# WAMM HUB

Production-ready music marketplace and artist platform.

## Core Features

- Discover releases and artist profiles
- Role-based auth (`listener` / `artist`) with email-password and Google OAuth
- Artist Studio for:
  - profile management (avatar, banner, bio, payout settings)
  - release and track upload/edit/replace/delete
  - visibility and for-sale controls
  - activity and order tracking
- Waveform-based timestamp comments on tracks
- Like and share actions (X, Facebook, LinkedIn, copy link)
- Purchase flows:
  - Crypto checkout with live USD -> native-coin quote
  - IBAN checkout with admin approval workflow
- Remote media upload/stream support via PHP endpoint

## Tech Stack

- Frontend: `React + Vite + TypeScript + Tailwind + shadcn-ui`
- Backend: `Express + Prisma`
- Database: `SQLite` (default) / persistent volume on Railway

## Project Layout

```txt
backend/
  prisma/                 # schema + seed scripts
  src/                    # API routes, auth, payment, studio logic
src/                      # frontend pages/components
content/                  # synced artist/release media source
contracts/                # optional on-chain split contract
docs/                     # deployment and integration guides
scripts/                  # content sync and utility scripts
```

## Local Development

1. Install dependencies:

```bash
npm install
```

2. (Optional) sync latest content:

```bash
npm run content:sync
```

3. Initialize database and seed:

```bash
npm run db:setup
```

4. Start dev servers:

```bash
npm run dev
```

- Frontend: `http://localhost:8080`
- API: `http://localhost:3001`

## Required Environment Variables

Define these in deployment environment (Railway):

- `DATABASE_URL`
- `PUBLIC_BASE_URL`
- `FRONTEND_BASE_URL`
- `AUTH_STATE_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET` (recommended for server-side token exchange)
- `GOOGLE_REDIRECT_URI`
- `REMOTE_MEDIA_UPLOAD_URL`
- `REMOTE_MEDIA_PUBLIC_BASE_URL`
- `REMOTE_MEDIA_TOKEN`
- `PLATFORM_WALLET_ADDRESS`
- `CRYPTO_VERIFY_ONCHAIN`
- `CRYPTO_VERIFY_STRICT`
- `CRYPTO_RPC_URL`
- `CRYPTO_CHAIN_ID`
- `CRYPTO_SPLIT_ENABLED`
- `CRYPTO_SPLIT_CONTRACT_ADDRESS` (optional)

## Deployment Notes (Railway)

- Attach a persistent volume and point database to it:
  - `DATABASE_URL=file:/data/dev.db`
- Run startup sequence:
  - `npm run db:generate && npm run db:sync && npm run db:seed:safe && npm run start:api`
- Ensure OAuth callback URL in Google Cloud exactly matches:
  - `https://<your-domain>/api/auth/google/callback`

## Additional Docs

- Remote media upload endpoint:
  - [docs/remote-upload-php.md](docs/remote-upload-php.md)
- Split contract integration:
  - [docs/crypto-split-contract.md](docs/crypto-split-contract.md)

## Security

- Do not commit credentials, private keys, or access details.
- Keep sensitive values only in environment variables.
