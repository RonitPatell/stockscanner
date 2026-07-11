<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Platform Guide

Major dashboard / Prop Desk UI changes must update `src/lib/platform-guide.ts` (bump `PLATFORM_GUIDE_VERSION`, sync step copy + `data-guide` targets). See `.cursor/rules/platform-guide.mdc`.
