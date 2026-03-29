# STARWEB - Firebase Studio

This is a NextJS application built for HRMS, Payroll, CRM, and Finance management.

## Getting Started

To get started, take a look at `src/app/page.tsx`.

## Git Authentication (GitHub)

GitHub requires a **Personal Access Token (PAT)** for command-line operations. If you encounter an "Authentication failed" error when pushing:

1. **Generate a PAT:**
   - Go to GitHub **Settings** > **Developer Settings** > **Personal Access Tokens** > **Tokens (classic)**.
   - Click "Generate new token".
   - Give it a name and select the `repo` scope.
   - Copy the generated token.

2. **Update your local remote:**
   Run the following command, replacing `YOUR_TOKEN` with the actual token (do not include `< >` brackets):
   ```bash
   git remote set-url origin https://YOUR_TOKEN@github.com/diwascha/Starweb.git
   ```

3. **Push your changes:**
   ```bash
   git push origin main
   ```

## Tech Stack

- **Framework:** Next.js (App Router)
- **UI:** ShadCN UI, Tailwind CSS
- **Icons:** Lucide React
- **Database:** Firebase (Firestore & Realtime Database)
- **AI:** Genkit
