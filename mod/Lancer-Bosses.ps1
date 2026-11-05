param([switch]$ValidateOnly)
$ErrorActionPreference = 'Stop'
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$principal=New-Object Security.Principal.WindowsPrincipal($identity)
if($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Ouvre Lancer-Bosses.cmd normalement. Seul le gardien doit recevoir les droits administrateur.'}
$stateRoot = Join-Path $PSScriptRoot '.state'
New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null
$unfinished = @(Get-ChildItem -LiteralPath $stateRoot -Directory | Where-Object {
    $file = Join-Path $_.FullName 'transaction.json'
    if (Test-Path -LiteralPath $file) { -not (Get-Content -LiteralPath $file -Raw | ConvertFrom-Json).completed } else { $false }
})
if ($unfinished.Count -gt 0) { throw 'Une session precedente doit etre restauree : lance Restaurer-Campagne.cmd.' }
$runDirectory = Join-Path $stateRoot ('run-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $runDirectory | Out-Null
$core = Join-Path $PSScriptRoot 'Session-Core.ps1'
if ($ValidateOnly) { & $core -RunDirectory $runDirectory -ValidateOnly; exit $LASTEXITCODE }
# Check the package and current Steam build before requesting administrator rights.
& $core -RunDirectory $runDirectory -ValidateOnly
if ($LASTEXITCODE -ne 0) {
    $preflightFile = Join-Path $runDirectory 'status.json'
    if (Test-Path -LiteralPath $preflightFile) {
        $preflight = Get-Content -LiteralPath $preflightFile -Raw | ConvertFrom-Json
        throw $preflight.message
    }
    throw 'Verification du paquet impossible. Consulte .state avant de relancer.'
}
$arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $core + '" -RunDirectory "' + $runDirectory + '"'
$worker = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -Verb RunAs -WindowStyle Hidden -PassThru
$watch=Join-Path $PSScriptRoot 'Veiller-Restauration.ps1'
$watchArguments='-NoProfile -ExecutionPolicy Bypass -File "'+$watch+'" -RunDirectory "'+$runDirectory+'" -WorkerPid '+$worker.Id
$watcherShell=Join-Path $PSHOME $(if($PSVersionTable.PSEdition -eq 'Core'){'pwsh.exe'}else{'powershell.exe'})
Start-Process -FilePath $watcherShell -ArgumentList $watchArguments -WindowStyle Hidden|Out-Null
$statusFile = Join-Path $runDirectory 'status.json'
$deadline = [DateTime]::UtcNow.AddMinutes(2)
do {
    Start-Sleep -Milliseconds 500
    if (Test-Path -LiteralPath $statusFile) {
        try { $status = Get-Content -LiteralPath $statusFile -Raw | ConvertFrom-Json }
        catch { continue }
        if ($status.phase -eq 'ready') { break }
        if ($status.phase -eq 'failed') { throw $status.message }
    }
    if ($worker.HasExited) { throw 'La preparation s est arretee. Consulte le dernier fichier error.txt dans .state.' }
} while ([DateTime]::UtcNow -lt $deadline)
if (-not $status -or $status.phase -ne 'ready') { throw 'Preparation non confirmee : aucun lancement du jeu.' }
Write-Output ('Session prete : ' + $runDirectory)
$oldAppId = $env:SteamAppId
$oldGameId = $env:SteamGameId
try {
    $env:SteamAppId='4115450'
    $env:SteamGameId='4115450'
    $gameExe = 'C:\Program Files (x86)\Steam\steamapps\common\PBZ\steam\PBZ.exe'
    # The official launcher supplies the native -basedir and -pc-platform options.
    $gameArguments='-CodexBossLab'
    $game = Start-Process -FilePath $gameExe -WorkingDirectory 'C:\Program Files (x86)\Steam\steamapps\common\PBZ\steam' -ArgumentList $gameArguments -PassThru
    Write-Output ('Jeu lance, PID ' + $game.Id + '. F8 : menu du combat. Fermer le jeu restaure la campagne.')
} catch {
    New-Item -ItemType File -Path (Join-Path $runDirectory 'cancel.request') -Force | Out-Null
    throw
} finally {
    $env:SteamAppId=$oldAppId
    $env:SteamGameId=$oldGameId
}
