param([Parameter(Mandatory=$true)][string]$RunDirectory,[Parameter(Mandatory=$true)][int]$WorkerPid)
$ErrorActionPreference='Stop'
$state=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '.state'))
$run=[IO.Path]::GetFullPath($RunDirectory)
if(-not $run.StartsWith($state+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Invalid restoration directory.'}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$principal=New-Object Security.Principal.WindowsPrincipal($identity)
if($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){exit 1}
$deadline=[DateTime]::UtcNow.AddHours(9)
do {
    $transactionPath=Join-Path $run 'transaction.json'
    $transaction=$null
    if(Test-Path -LiteralPath $transactionPath){try{$transaction=Get-Content -LiteralPath $transactionPath -Raw|ConvertFrom-Json}catch{}}
    if($transaction -and $transaction.completed){
        $request=Join-Path $run 'steam-restart.request'
        if(Test-Path -LiteralPath $request){
            Start-Process -FilePath 'C:\Program Files (x86)\Steam\steam.exe' -ArgumentList '-silent' -WindowStyle Hidden|Out-Null
            Remove-Item -LiteralPath $request
        }
        exit 0
    }
    if(-not (Get-Process -Id $WorkerPid -ErrorAction SilentlyContinue)){exit 0}
    Start-Sleep -Seconds 1
}while([DateTime]::UtcNow -lt $deadline)
