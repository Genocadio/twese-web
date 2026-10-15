# Twese Web

A modern worker portal built with Next.js, React 19 for the Twese delivery platform.

## Features

- **Next.js 16** with React 19
- **GraphQL subscriptions** for live updates
- **Tailwind CSS** for styling
- **shadcn/ui** components
- **Nexxauth** integration for authentication
- **Vercel Analytics** for tracking

## Getting Started

### Prerequisites

- Node.js 18+ or Bun
- CavGo backend running (default: `http://localhost:8080`)

### Installation

```bash
bun install
```

### Environment Variables

Copy the example environment file and fill in the values:

```bash
cp .env.example .env.local
```

Required variables:
- `NEXT_PUBLIC_API_URL` - CavGo backend URL
- `NEXT_PUBLIC_NEXXAUTH_BASE_URL` - Nexxauth identity provider URL
- `NEXT_PUBLIC_NEXXAUTH_CLIENT_ID` - Nexxauth WEB client key

### Development

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Production Build

```bash
bun run build
bun run start
```

## Tech Stack

- **Framework:** Next.js 16
- **UI:** shadcn/ui + Tailwind CSS
- **Backend:** CavGo Spring Boot API
- **Auth:** Nexxauth
- **Realtime:** GraphQL subscriptions

## License

MIT
