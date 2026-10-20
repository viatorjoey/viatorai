# Run only after approving the new private HTTPS route. Never uses Funnel or exposes admin ports.
$ErrorActionPreference='Stop'
$tsPath='C:\Program Files\Tailscale\tailscale.exe'
if(!(Test-Path -LiteralPath $tsPath)){throw 'Tailscale is not installed. Install it on Windows and iPhone, then sign in with the same account.'}
$tsStatus=(& $tsPath status --json | ConvertFrom-Json)
if($tsStatus.BackendState -ne 'Running'){throw 'Sign in to Tailscale first.'}
$serveConfig=(& $tsPath serve status --json | ConvertFrom-Json)
if($serveConfig.TCP -or $serveConfig.Web){throw 'Existing Tailscale Serve routes found. Review them before changing routes.'}
& $tsPath serve --bg --https=443 http://127.0.0.1:8799
if($LASTEXITCODE -ne 0){throw 'HTTPS setup needs the account owner to finish the displayed Tailscale step.'}
& $tsPath serve status
