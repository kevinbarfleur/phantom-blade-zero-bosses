$ErrorActionPreference='Stop'
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$principal=New-Object Security.Principal.WindowsPrincipal($identity)
if($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Open Restore-Campaign.cmd normally. Only the guardian should receive administrator rights.'}
if (@(Get-Process PBZ,ProjectPBZ -ErrorAction SilentlyContinue).Count -gt 0) { throw 'Close the game before restoring.' }
$stateRoot=Join-Path $PSScriptRoot '.state'
if (-not (Test-Path -LiteralPath $stateRoot)) { Write-Output 'No session needs restoration.'; exit }
foreach ($run in Get-ChildItem -LiteralPath $stateRoot -Directory) {
    $transactionPath=Join-Path $run.FullName 'transaction.json'
    if (-not (Test-Path -LiteralPath $transactionPath)) { continue }
    $transaction=Get-Content -LiteralPath $transactionPath -Raw | ConvertFrom-Json
    if ($transaction.completed) { continue }
    $statusPath=Join-Path $run.FullName 'status.json'
    if (Test-Path -LiteralPath $statusPath) {
        $status=Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
        if (Get-Process -Id $status.workerPid -ErrorAction SilentlyContinue) { throw 'The session guardian is still running. Wait for automatic restoration.' }
    }
    $arguments='-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $PSScriptRoot 'Session-Core.ps1')+'" -RunDirectory "'+$run.FullName+'" -RecoverOnly'
    $worker=Start-Process powershell.exe -ArgumentList $arguments -Verb RunAs -WindowStyle Hidden -PassThru -Wait
    if ($worker.ExitCode -ne 0) { throw ('Restoration needs verification: '+$run.FullName) }
}
foreach($run in Get-ChildItem -LiteralPath $stateRoot -Directory){
    $request=Join-Path $run.FullName 'steam-restart.request'
    $transaction=Join-Path $run.FullName 'transaction.json'
    if((Test-Path -LiteralPath $request) -and (Test-Path -LiteralPath $transaction) -and (Get-Content -LiteralPath $transaction -Raw|ConvertFrom-Json).completed){
        & (Join-Path $PSScriptRoot 'Watch-Restoration.ps1') -RunDirectory $run.FullName -WorkerPid $PID
    }
}
Write-Output 'Restoration completed.'
