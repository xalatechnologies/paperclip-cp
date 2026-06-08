#!/usr/bin/env pwsh
# =============================================================================
# Push all PCC operational secrets to Convex environment variables
#
# Run this once after `npx convex login && npx convex dev --once`
# After this, .env only needs the 5 bootstrap vars.
#
# Usage: .\scripts\push-env-to-convex.ps1
# =============================================================================

$ErrorActionPreference = "Stop"

Write-Host "`n🔐 Pushing PCC secrets to Convex...`n" -ForegroundColor Cyan

# --- Paperclip API ---
npx convex env set PAPERCLIP_API_KEY="<YOUR_PAPERCLIP_API_KEY>"
npx convex env set PAPERCLIP_BASE_URL="https://paperclip-cumf.srv1212925.hstgr.cloud"
npx convex env set PAPERCLIP_EMAIL="ibrahim@xala.no"
npx convex env set PAPERCLIP_PASSWORD="<YOUR_PAPERCLIP_PASSWORD>"
npx convex env set PAPERCLIP_AGENT_JWT_SECRET="<YOUR_JWT_SECRET>"

# --- Company IDs ---
npx convex env set DOXIS_COMPANY_ID="4b6c96b5-c5bf-4d89-9a39-def9d2ac095f"
npx convex env set DOXIS_ISSUE_PREFIX="DOX"
npx convex env set FULLSTACK_COMPANY_ID="2e9ebe22-a96a-409f-8e49-f7efeb4e5aab"
npx convex env set FULLSTACK_ISSUE_PREFIX="FUL"
npx convex env set XALA_COMPANY_ID="c5552411-52e2-49a1-bf3d-a530206ac121"
npx convex env set XALA_ISSUE_PREFIX="XAL"

# --- VPS / SSH ---
npx convex env set VPS_HOST="paperclip-cumf.srv1212925.hstgr.cloud"
npx convex env set VPS_IP="72.61.82.22"
npx convex env set VPS_USER="root"
npx convex env set VPS_PASSWORD="<YOUR_VPS_PASSWORD>"
npx convex env set VPS_SSH_KEY_PATH="C:/Users/IbrahimRahmani/.ssh/pcc_vps"
npx convex env set VPS_COMPOSE_DIR="/docker/paperclip-cumf"
npx convex env set VPS_API_BASE="http://72.61.82.22:3001"
npx convex env set VPS_API_KEY="<YOUR_VPS_API_KEY>"

# --- Integrations ---
npx convex env set LINEAR_API_KEY="<YOUR_LINEAR_API_KEY>"
npx convex env set GH_TOKEN="<YOUR_GITHUB_TOKEN>"
npx convex env set GITHUB_USER="xalatechnologies"

# --- AI / LLM ---
# Set your OpenAI key (required for RAG embeddings + distillation):
# npx convex env set OPENAI_API_KEY="sk-..."
#
# For Z.ai GLM-5.1 Coding Max (if using as executor):
# npx convex env set OPENAI_API_KEY="<your-zai-key>"
# npx convex env set OPENAI_BASE_URL="https://api.z.ai/api/coding/paas/v4"

Write-Host "`n✅ All secrets pushed to Convex!" -ForegroundColor Green
Write-Host "   View them at: npx convex env list" -ForegroundColor Gray
Write-Host "   Dashboard:    https://dashboard.convex.dev`n" -ForegroundColor Gray
