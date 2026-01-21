export async function GET() {
  return Response.json({
    hasServerKey: !!process.env.OPENROUTER_API_KEY
  })
}
