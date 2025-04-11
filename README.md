# BFB Backend

A NestJS server application with Supabase authentication integration.

## Prerequisites

- Node.js (v23)
- npm
- Supabase account and project

## Environment Setup

1. Create a `.env` file in the root directory with the following variables:
```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_key
```

## Installation

1. Set the correct Node.js version:
```bash
nvm use 23
```

2. Install dependencies:
```bash
npm install
```

## Running the Application

To start the development server:
```bash
npm run start:dev
```

The server will be available at `http://localhost:3000` by default.

## Features

- NestJS server setup
- Supabase authentication integration
- Development hot-reload enabled
