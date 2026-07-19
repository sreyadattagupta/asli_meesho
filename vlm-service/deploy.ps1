# Canonical deploy for the Cloud Run CV/VLM service.
#
# ALWAYS deploy through this script. `gcloud run deploy` does not remember flags you passed last
# time — any flag left off silently reverts to a Cloud Run default on the new revision. That is how
# revision 00041 ended up at 4Gi/concurrency-160 on 19 Jul 2026: every /vlm/match OOM-killed the
# container mid-request, the web app's withDegradation() failed closed, and sellers saw
# "Verification service is temporarily unavailable" on the possession step.
#
#   .\deploy.ps1              # build from source, canary first (default, recommended)
#   .\deploy.ps1 -Promote     # send 100% traffic to the canary once you've tested it
#   .\deploy.ps1 -Image <digest>  # redeploy an existing image (config-only change, no rebuild)

param(
  [switch]$Promote,
  [switch]$Check,
  [string]$Revision = "",
  [string]$Image = ""
)

$ErrorActionPreference = "Stop"

$SERVICE = "asli-meesho-vlm"
$REGION  = "us-central1"
$PROJECT = "scenic-arc-390418"

# --- Resource floor. Do not lower these without measuring first. -------------------------------
# 12Gi: three torch HF models (SigLIP-large gate + ViT garment-type + SegFormer clothes-seg) load
#       in-container on top of torch + paddle + onnxruntime + opencv. 8Gi OOMs during warmup;
#       4Gi OOMs on the first real /vlm/match.
# 4   : concurrency. Cloud Run's default (80/160) puts that many heavy CV requests on one instance,
#       which OOMs even at 12Gi. Each /vlm/match holds hundreds of MB of tensors for ~30-60s.
# 1   : min-instances. Cold start is ~30-60s (onnx + paddle + three HF models) and exceeds the
#       Vercel function timeout, so the first judge to open the app would see a failure.
#       Billable while idle — revert to 0 after judging ends (2026-07-29).
$MEMORY      = "12Gi"
$CPU         = "4"
$CONCURRENCY = "4"
$MIN_INST    = "1"

# gcloud on this box was bootstrapped from the zip archive and ships no Python of its own, and
# there is none on PATH — bare `gcloud` fails with `exec: python: not found`. Point it at Anaconda.
if (-not $env:CLOUDSDK_PYTHON) {
  $env:CLOUDSDK_PYTHON = "C:\Users\SREYA DATTA GUPTA\anaconda3\python.exe"
}
$GCLOUD = "$env:LOCALAPPDATA\google-cloud-sdk-dl\google-cloud-sdk\bin\gcloud.cmd"

function Get-ServingRevision {
  $svc = & $GCLOUD run services describe $SERVICE --region $REGION --project $PROJECT --format=json | ConvertFrom-Json
  # A revision can appear twice in status.traffic: once for its traffic share and once for its tag
  # (tag-only entries carry no percent). Pick the biggest share, tagged or not.
  $top = $svc.status.traffic | Where-Object { $_.percent -gt 0 } | Sort-Object percent -Descending | Select-Object -First 1
  return $top.revisionName
}

# The drift guard. `services describe` reports spec.template, which is NOT necessarily what is
# taking traffic — in the 19 Jul incident the template said 8Gi while the serving revision ran 4Gi.
# So always assert against the revision that actually serves.
function Assert-Resources([string]$revision) {
  if (-not $revision) { throw "Could not determine the serving revision." }
  $rev = & $GCLOUD run revisions describe $revision --region $REGION --project $PROJECT --format=json | ConvertFrom-Json
  $mem = $rev.spec.containers[0].resources.limits.memory
  $cpu = $rev.spec.containers[0].resources.limits.cpu
  $con = $rev.spec.containerConcurrency
  Write-Host "Serving revision $revision -> memory=$mem cpu=$cpu concurrency=$con"

  $problems = @()
  if ($mem -ne $MEMORY)          { $problems += "memory is $mem, expected $MEMORY" }
  if ($cpu -ne $CPU)             { $problems += "cpu is $cpu, expected $CPU" }
  if ([int]$con -gt [int]$CONCURRENCY) { $problems += "concurrency is $con, expected <= $CONCURRENCY" }
  if ($problems.Count -gt 0) {
    throw "RESOURCE DRIFT on the serving revision: $($problems -join '; '). " +
          "/vlm/match will OOM-kill the container and the possession step will report " +
          "'Verification service is temporarily unavailable'. Redeploy via this script."
  }
  Write-Host "Resource check passed."
}

# --- Check only: assert the live service is correctly sized ------------------------------------
# Cheap, read-only, no deploy. Worth running before any demo or judging session.
if ($Check) {
  $target = if ($Revision) { $Revision } else { Get-ServingRevision }
  Assert-Resources $target
  exit 0
}

# --- Promote: shift traffic to the canary you already tested -----------------------------------
if ($Promote) {
  $svc = & $GCLOUD run services describe $SERVICE --region $REGION --project $PROJECT --format=json | ConvertFrom-Json
  $canary = ($svc.status.traffic | Where-Object { $_.tag -eq "canary" }).revisionName
  if (-not $canary) { throw "No canary revision to promote. Run .\deploy.ps1 first." }
  Write-Host "Promoting $canary to 100% traffic..."
  & $GCLOUD run services update-traffic $SERVICE --region $REGION --project $PROJECT `
      --to-revisions "$canary=100" | Out-Null
  Assert-Resources (Get-ServingRevision)
  exit 0
}

# --- Deploy a new revision with NO traffic, tagged canary --------------------------------------
# Note: no --set-env-vars here on purpose. Omitting it preserves the env vars already on the
# service (GEMINI_API_KEY, SERPAPI_KEY, the HF repo pins). Passing it would REPLACE the whole set.
$deployArgs = @(
  "run", "deploy", $SERVICE,
  "--region", $REGION, "--project", $PROJECT,
  "--memory", $MEMORY, "--cpu", $CPU,
  "--concurrency", $CONCURRENCY, "--min-instances", $MIN_INST,
  "--tag", "canary", "--no-traffic"
)
if ($Image) {
  $deployArgs += @("--image", $Image)
} else {
  # The big ONNX backbones are excluded by .gcloudignore and pulled from the HF Hub at build time,
  # which keeps this source upload at ~30MB. A 450MB upload times out on a home uplink.
  $deployArgs += @("--source", $PSScriptRoot)
}

Write-Host "Deploying canary ($MEMORY / $CPU cpu / concurrency $CONCURRENCY)..."
& $GCLOUD @deployArgs

Write-Host ""
Write-Host "Canary deployed with no traffic. Test it, then promote:"
Write-Host "  curl https://canary---asli-meesho-vlm-lgym2tsiaq-uc.a.run.app/health"
Write-Host "  # expect status ok and every model loaded:true (warmup is sequential, allow ~60s)"
Write-Host "  .\deploy.ps1 -Promote"
