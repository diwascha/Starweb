
export const dynamic = 'force-static';

export async function GET() {
  return new Response(JSON.stringify({ message: 'AI features are disabled.' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
