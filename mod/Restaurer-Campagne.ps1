$ErrorActionPreference='Stop'
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$principal=New-Object Security.Principal.WindowsPrincipal($identity)
if($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Ouvre Restaurer-Campagne.cmd normalement. Seul le gardien doit recevoir les droits administrateur.'}
if (@(Get-Process PBZ,ProjectPBZ -ErrorAction SilentlyContinue).Count -gt 0) { throw 'Ferme le jeu avant de restaurer.' }
$stateRoot=Join-Path $PSScriptRoot '.state'
if (-not (Test-Path -LiteralPath $stateRoot)) { Write-Output 'Aucune session a restaurer.'; exit }
foreach ($run in Get-ChildItem -LiteralPath $stateRoot -Directory) {
    $transactionPath=Join-Path $run.FullName 'transaction.json'
    if (-not (Test-Path -LiteralPath $transactionPath)) { continue }
    $transaction=Get-Content -LiteralPath $transactionPath -Raw | ConvertFrom-Json
    if ($transaction.completed) { continue }
    $statusPath=Join-Path $run.FullName 'status.json'
    if (Test-Path -LiteralPath $statusPath) {
        $status=Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
        if (Get-Process -Id $status.workerPid -ErrorAction SilentlyContinue) { throw 'Le gardien de session est encore actif. Attends la restauration automatique.' }
    }
    $arguments='-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $PSScriptRoot 'Session-Core.ps1')+'" -RunDirectory "'+$run.FullName+'" -RecoverOnly'
    $worker=Start-Process powershell.exe -ArgumentList $arguments -Verb RunAs -WindowStyle Hidden -PassThru -Wait
    if ($worker.ExitCode -ne 0) { throw ('Restauration a verifier : '+$run.FullName) }
}
foreach($run in Get-ChildItem -LiteralPath $stateRoot -Directory){
    $request=Join-Path $run.FullName 'steam-restart.request'
    $transaction=Join-Path $run.FullName 'transaction.json'
    if((Test-Path -LiteralPath $request) -and (Test-Path -LiteralPath $transaction) -and (Get-Content -LiteralPath $transaction -Raw|ConvertFrom-Json).completed){
        & (Join-Path $PSScriptRoot 'Veiller-Restauration.ps1') -RunDirectory $run.FullName -WorkerPid $PID
    }
}
Write-Output 'Restauration terminee.'
