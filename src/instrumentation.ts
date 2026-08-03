export const register = async () => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { readingContextMcpService } =
    await import('@/lib/services/readingContextMcp/readingContextMcp.service')

  await readingContextMcpService.initialize()
}
