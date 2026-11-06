param(
    [Parameter(Mandatory=$true)][string]$RunDirectory,
    [switch]$RecoverOnly,
    [switch]$ValidateOnly,
    [switch]$ProbeOnly,
    [switch]$Persistent
)
$ErrorActionPreference = 'Stop'
$PackageRoot = $PSScriptRoot
$GameRoot = 'C:\Program Files (x86)\Steam\steamapps\common\PBZ'
$SavedRoot = Join-Path $GameRoot 'ProjectPBZ\Saved'
$SteamRoot = 'C:\Program Files (x86)\Steam'
$ModPath = Join-Path $GameRoot 'ProjectPBZ\Content\Paks\~mods\zzz_CodexBossLab_P.pak'
$StateRoot = Join-Path $PackageRoot '.state'
$RunRoot = [IO.Path]::GetFullPath($RunDirectory)
if (-not $RunRoot.StartsWith([IO.Path]::GetFullPath($StateRoot) + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Session directory is outside the package.' }
$StatusFile = Join-Path $RunRoot 'status.json'
$TransactionFile = Join-Path $RunRoot 'transaction.json'
function Write-JsonAtomic($Path, $Object) {
    $tempPath = $Path + '.new'
    $Object | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath $tempPath -Encoding UTF8
    Move-Item -LiteralPath $tempPath -Destination $Path -Force
}
function Set-Status([string]$Phase,[string]$Message) {
    Write-JsonAtomic $StatusFile ([ordered]@{phase=$Phase;message=$Message;utc=[DateTime]::UtcNow.ToString('o');workerPid=$PID})
}
function Hash-File([string]$Path) { return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
function Get-GameProcesses {
    return @(Get-Process PBZ,ProjectPBZ -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq (Join-Path $GameRoot 'platform\steam\PBZ.exe') })
}
function Get-SteamClient {
    return @(Get-Process steam -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq (Join-Path $SteamRoot 'steam.exe') })
}
function Relative-Saved([string]$Path) {
    $fullPath = [IO.Path]::GetFullPath($Path)
    $prefix = [IO.Path]::GetFullPath($SavedRoot) + '\'
    if (-not $fullPath.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)) { throw 'File is outside the save directory.' }
    return $fullPath.Substring($prefix.Length)
}

$OwnedRoots=@('ProjectPBZ/PBZModLoader','ProjectPBZ/Content/JavaScript/PBZModLoader')
$MainRelative='ProjectPBZ/PBZModLoader/mods/CodexBosses/main.js'
function Game-Path([string]$Relative) {
    if($Relative.Contains('\') -or $Relative.Contains(':') -or @($Relative.Split('/')|Where-Object {$_ -in '.','..',''}).Count -or [IO.Path]::IsPathRooted($Relative)){throw 'Invalid deployment path.'}
    if($Relative -ne 'platform/steam/version.dll' -and $Relative -notmatch '^ProjectPBZ/(PBZModLoader|Content/JavaScript/PBZModLoader)(/|$)'){throw 'Path is outside the BOSSES loader.'}
    $full=[IO.Path]::GetFullPath((Join-Path $GameRoot $Relative))
    if(-not $full.StartsWith([IO.Path]::GetFullPath($GameRoot)+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Path is outside the game directory.'}
    $check=$full
    while($check -and $check.Length -ge $GameRoot.Length){
        if((Test-Path -LiteralPath $check) -and ((Get-Item -LiteralPath $check -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Filesystem links are not allowed in deployment paths.'}
        $check=Split-Path -Parent $check
    }
    return $full
}
function Validate-Deployment($Manifest) {
    if($Manifest.deployment -ne 'temporary-pbzmodloader'){throw 'Unsupported package format.'}
    . (Join-Path $PackageRoot 'Acquire-Dependency.ps1')
    $script:DependencyRoot=Get-BossesDependency
    $spec=Get-Content -LiteralPath (Join-Path $PackageRoot 'Dependencies/PBZModLoader-1.0.2.json') -Raw|ConvertFrom-Json
    $entries=@($Manifest.files);$paths=@{}
    if($entries.Count -ne @($spec.files).Count+1){throw 'Unexpected loader file count.'}
    foreach($entry in $entries){
        [void](Game-Path $entry.path)
        if($paths.ContainsKey($entry.path)){throw 'Duplicate deployment file.'};$paths[$entry.path]=$true
        if($entry.source -eq 'mod' -and $entry.path -eq $MainRelative){$local=Join-Path (Join-Path $PackageRoot 'Payload') $entry.path}
        elseif($entry.source -eq 'dependency'){
            $expected=@($spec.files|Where-Object path -eq $entry.path)
            if($expected.Count -ne 1 -or $expected[0].sha256 -ne $entry.sha256){throw 'Unrecognized dependency.'}
            $local=Join-Path $script:DependencyRoot $entry.path
        }else{throw 'File source is not allowed.'}
        if((Hash-File $local) -ne $entry.sha256){throw 'Deployment file hash does not match.'}
    }
    if(-not $paths.ContainsKey($MainRelative)){throw 'BOSSES entry point is missing.'}
    return $entries
}
function Install-Deployment($Entries) {
    foreach($entry in $Entries){
        $destination=Game-Path $entry.path
        $root=if($entry.source -eq 'mod'){Join-Path $PackageRoot 'Payload'}else{$script:DependencyRoot}
        New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force|Out-Null
        Copy-Item -LiteralPath (Join-Path $root $entry.path) -Destination $destination -Force
        if((Hash-File $destination) -ne $entry.sha256){throw 'Installation verification failed.'}
    }
}
function Restore-Deployment($Transaction) {
    if($Transaction.version -ne '0.6.1-loader'){throw 'Unknown loader transaction format.'}
    $proxy=Game-Path 'platform/steam/version.dll'
    if(Test-Path -LiteralPath $proxy){
        $entry=@($Transaction.modFiles|Where-Object path -eq 'platform/steam/version.dll')
        if($entry.Count -ne 1 -or (Hash-File $proxy) -ne $entry[0].sha256){throw 'The installed proxy has changed; automatic removal was refused.'}
    }
    foreach($relative in $OwnedRoots){
        $root=Game-Path $relative
        if(-not (Test-Path -LiteralPath $root)){continue}
        foreach($file in Get-ChildItem -LiteralPath $root -Recurse -File -Force){
            $rel=$file.FullName.Substring($GameRoot.Length+1).Replace('\','/')
            [void](Game-Path $rel)
            $target=Join-Path (Join-Path $RunRoot 'removed-runtime') $rel
            New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force|Out-Null
            Move-Item -LiteralPath $file.FullName -Destination $target -Force
        }
        $directories=@(Get-ChildItem -LiteralPath $root -Recurse -Directory -Force|Sort-Object {$_.FullName.Length} -Descending)
        foreach($directory in $directories){
            [void](Game-Path $directory.FullName.Substring($GameRoot.Length+1).Replace('\','/'))
            if([IO.Directory]::GetFileSystemEntries($directory.FullName).Count -eq 0){Remove-Item -LiteralPath $directory.FullName -Force}
        }
        if([IO.Directory]::GetFileSystemEntries($root).Count -eq 0){Remove-Item -LiteralPath $root -Force}
    }
    if(Test-Path -LiteralPath $proxy){Move-Item -LiteralPath $proxy -Destination (Join-Path $RunRoot 'removed-version.dll') -Force}
}

function Restore-Transaction($Transaction) {
    if ((Get-GameProcesses).Count -gt 0) { throw 'Close Phantom Blade Zero before restoring.' }
    Set-Status 'restoring' 'Restoring the campaign before restoring Steam network access.'
    # End the offline client's cloud work queue before restoring and unblocking.
    # A fresh client then reads the restored originals rather than cached lab data.
    $restartSteam=(Get-SteamClient).Count -gt 0
    if ($restartSteam) {
        Start-Process -FilePath (Join-Path $SteamRoot 'steam.exe') -ArgumentList '-shutdown' -WindowStyle Hidden | Out-Null
        $steamDeadline=[DateTime]::UtcNow.AddSeconds(30)
        while ((Get-SteamClient).Count -gt 0 -and [DateTime]::UtcNow -lt $steamDeadline) { Start-Sleep -Milliseconds 250 }
        if ((Get-SteamClient).Count -gt 0) { throw 'Steam has not finished shutting down. Network access remains blocked; close Steam, then run Restore-Campaign.cmd again.' }
    }
    $labRoot = Join-Path $RunRoot 'lab-results'
    New-Item -ItemType Directory -Path $labRoot -Force | Out-Null
    $originalPaths = @{}
    foreach ($entry in $Transaction.files) { $originalPaths[$entry.relative] = $entry }
    $liveFiles = @(Get-ChildItem -LiteralPath $SavedRoot -Recurse -File | Where-Object { $_.Extension -in '.sav','.vdf' })
    foreach ($file in $liveFiles) {
        $relative = Relative-Saved $file.FullName
        $labCopy = Join-Path $labRoot $relative
        New-Item -ItemType Directory -Path (Split-Path -Parent $labCopy) -Force | Out-Null
        Copy-Item -LiteralPath $file.FullName -Destination $labCopy -Force
        if (-not $originalPaths.ContainsKey($relative)) {
            # Preserve every file created by the test, outside the active save tree.
            $extraCopy = $labCopy + '.removed-from-live'
            Move-Item -LiteralPath $file.FullName -Destination $extraCopy -Force
        }
    }
    foreach ($entry in $Transaction.files) {
        $backupPath = Join-Path (Join-Path $RunRoot 'original-saves') $entry.relative
        if ((Hash-File $backupPath) -ne $entry.sha256) { throw ('Invalid backup: ' + $entry.relative) }
        $livePath = Join-Path $SavedRoot $entry.relative
        [void](Relative-Saved $livePath)
        New-Item -ItemType Directory -Path (Split-Path -Parent $livePath) -Force | Out-Null
        Copy-Item -LiteralPath $backupPath -Destination $livePath -Force
        if ((Hash-File $livePath) -ne $entry.sha256) { throw ('Restoration verification failed: ' + $entry.relative) }
    }
    Restore-Deployment $Transaction
    # Network is restored only after all original save hashes have matched.
    foreach ($ruleName in $Transaction.rules) {
        Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    }
    if ($restartSteam) { New-Item -ItemType File -Path (Join-Path $RunRoot 'steam-restart.request') -Force|Out-Null }
    $Transaction.completed = $true
    Write-JsonAtomic $TransactionFile $Transaction
    Set-Status 'restored' 'Campaign restored and verified; mod removed; temporary firewall rules removed.'
}
try {
    New-Item -ItemType Directory -Path $RunRoot -Force | Out-Null
    if (-not $ValidateOnly) {
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
        $principal = New-Object Security.Principal.WindowsPrincipal($identity)
        if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Administrator rights are required for the firewall and game directory.' }
    }
    # Recovery depends on the verified backup, never on the continued presence
    # or integrity of a mod bundle that may have been removed or updated.
    if ($RecoverOnly) {
        $transaction = Get-Content -LiteralPath $TransactionFile -Raw | ConvertFrom-Json
        Restore-Transaction $transaction
        exit 0
    }
    $manifest = Get-Content -LiteralPath (Join-Path $PackageRoot 'manifest.json') -Raw | ConvertFrom-Json
    if (-not $RecoverOnly -and -not $Persistent -and $manifest.qa.mode -ne 'manual') { throw 'This package is for automated tests only. Use the playable release.' }
    $bundleFiles = @(Validate-Deployment $manifest)
    $acf = Get-Content -LiteralPath (Join-Path $SteamRoot 'steamapps\appmanifest_4115450.acf') -Raw
    $installedBuild = [regex]::Match($acf,'"buildid"\s+"(\d+)"').Groups[1].Value
    if (-not $RecoverOnly -and $installedBuild -ne [string]$manifest.gameBuild) { throw ('Unsupported game build: ' + $installedBuild + '. This mod requires build ' + $manifest.gameBuild + '; use a mod release compatible with your game update.') }
    if ($manifest.validation.runtimeCompatible -eq $false) { throw 'This game build rejects legacy script packages. This BOSSES package requires migration to PBZModLoader and cannot be launched.' }
    if ($ValidateOnly) { Set-Status 'validated' 'Package, paths and game build verified. No game changes made.'; exit 0 }
    if ((Get-GameProcesses).Count -gt 0) { throw 'The game is already running.' }
    foreach($relative in $OwnedRoots){if(Test-Path -LiteralPath (Game-Path $relative)){throw 'A loader is already installed. This temporary package requires a game installation without a loader.'}}
    foreach($name in @('version.dll','hid.dll','winmm.dll','dsound.dll','dxgi.dll')){if(Test-Path -LiteralPath (Join-Path $GameRoot ('platform/steam/'+$name))){throw 'A proxy DLL is already installed; it will not be replaced.'}}
    if(@(Get-ChildItem -LiteralPath (Split-Path -Parent $ModPath) -Filter 'zzz_CodexBossLab_P.*' -File -ErrorAction SilentlyContinue).Count){throw 'A legacy BOSSES package is still installed.'}
    foreach ($profile in Get-NetFirewallProfile -PolicyStore ActiveStore) {
        if ($profile.Enabled.ToString() -ne 'True') { throw 'The firewall must be enabled for every profile during this protected session.' }
    }
    $backupRoot = Join-Path $RunRoot 'original-saves'
    New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
    $files = @()
    foreach ($file in Get-ChildItem -LiteralPath $SavedRoot -Recurse -File | Where-Object { $_.Extension -in '.sav','.vdf' }) {
        $relative = Relative-Saved $file.FullName
        $backupPath = Join-Path $backupRoot $relative
        New-Item -ItemType Directory -Path (Split-Path -Parent $backupPath) -Force | Out-Null
        Copy-Item -LiteralPath $file.FullName -Destination $backupPath
        $hash = Hash-File $file.FullName
        if ((Hash-File $backupPath) -ne $hash) { throw 'Backup verification failed.' }
        $files += [pscustomobject]@{relative=$relative;sha256=$hash;bytes=$file.Length}
    }
    if (@($files | Where-Object { $_.relative -like '*PBZSaveGame.sav' }).Count -ne 1) { throw 'The main save is missing or ambiguous.' }
    $programs = @(Get-ChildItem -LiteralPath $GameRoot -Recurse -File -Filter '*.exe' | ForEach-Object { $_.FullName })
    $programs += @((Join-Path $SteamRoot 'steam.exe'),(Join-Path $SteamRoot 'bin\cef\cef.win64\steamwebhelper.exe'))
    $programs = @($programs | Where-Object { Test-Path -LiteralPath $_ } | Sort-Object -Unique)
    $programs=@($programs)+@($bundleFiles|Where-Object {$_.path.EndsWith('.exe')}|ForEach-Object {Game-Path $_.path})
    $programs=@($programs|Sort-Object -Unique)
    $ruleSpecs = @()
    $tag = 'CodexBossLab-' + (Split-Path -Leaf $RunRoot)
    for ($i=0; $i -lt $programs.Count; $i++) {
        foreach ($direction in @('Outbound','Inbound')) {
            $ruleSpecs += [pscustomobject]@{name=($tag+'-'+$i+'-'+$direction);program=$programs[$i];direction=$direction}
        }
    }
    $transaction = [pscustomobject]@{version='0.6.1-loader';completed=$false;files=$files;rules=@($ruleSpecs | ForEach-Object {$_.name});modFiles=$bundleFiles;programs=$programs}
    Write-JsonAtomic $TransactionFile $transaction
    Set-Status 'preparing' 'Backups verified; applying temporary network blocking.'
    foreach ($spec in $ruleSpecs) {
        New-NetFirewallRule -Name $spec.name -DisplayName $spec.name -Group $tag -Direction $spec.direction -Action Block -Enabled True -Profile Any -Program $spec.program -Protocol Any | Out-Null
    }
    foreach ($spec in $ruleSpecs) {
        $rule = Get-NetFirewallRule -PolicyStore ActiveStore -Name $spec.name
        $filter = Get-NetFirewallApplicationFilter -AssociatedNetFirewallRule $rule
        if ($rule.Action.ToString() -ne 'Block' -or $rule.Enabled.ToString() -ne 'True' -or $filter.Program -ne $spec.program) { throw 'A network blocking rule is not effective.' }
    }
    Install-Deployment $bundleFiles
    Set-Status 'ready' 'Backups and package verified; Steam and PBZ executables are blocked from the network.'
    if ($Persistent) {
        $controllerDeadline = [DateTime]::UtcNow.AddHours(8)
        $wasRunning = $false
        do {
            $gameProcesses = Get-GameProcesses
            if ($gameProcesses.Count -gt 0) {
                if (-not $wasRunning) { Set-Status 'running' 'Autonomous tests are running; the campaign is protected and game network access is blocked.' }
                $wasRunning = $true
            } else {
                if ($wasRunning) { Set-Status 'idle' 'Game closed; guardian active and ready for the next test without another elevation prompt.'; $wasRunning = $false }
                if ((Test-Path -LiteralPath (Join-Path $RunRoot 'stop.request')) -or [DateTime]::UtcNow -ge $controllerDeadline) { break }
                $stageRequest = Join-Path $RunRoot 'stage.request'
                if (Test-Path -LiteralPath $stageRequest) {
                    # Only this mod's three fixed files may be replaced. The
                    # controller never evaluates commands supplied by a request.
                    Set-Status 'staging' 'Checking the revision before the next test.'
                    $nextManifest=Get-Content -LiteralPath (Join-Path $PackageRoot 'manifest.json') -Raw|ConvertFrom-Json
                    if([string]$nextManifest.gameBuild -ne $installedBuild){throw 'Incompatible revision.'}
                    $nextFiles=@(Validate-Deployment $nextManifest)
                    if($nextFiles.Count -ne @($transaction.modFiles).Count){throw 'The revision file layout has changed.'}
                    foreach($next in $nextFiles){
                        $old=@($transaction.modFiles|Where-Object path -eq $next.path)
                        if($old.Count -ne 1){throw 'Unknown revision file.'}
                        if((Hash-File (Game-Path $next.path)) -ne $old[0].sha256){throw 'An installed file has changed.'}
                        if($next.path -ne $MainRelative -and $next.sha256 -ne $old[0].sha256){throw 'Only the BOSSES entry point may change during these tests.'}
                    }
                    $transaction.modFiles=$nextFiles
                    Write-JsonAtomic $TransactionFile $transaction
                    $main=@($nextFiles|Where-Object path -eq $MainRelative)
                    Install-Deployment $main
                    Remove-Item -LiteralPath $stageRequest
                    Set-Status 'ready' 'New revision verified; ready to launch without another elevation prompt.'
                }
            }
            Start-Sleep -Milliseconds 500
        } while ($true)
        Restore-Transaction $transaction
        exit 0
    }
    $deadline = [DateTime]::UtcNow.AddMinutes(3)
    do {
        if (Test-Path -LiteralPath (Join-Path $RunRoot 'cancel.request')) { throw 'Launch cancelled.' }
        $gameProcesses = Get-GameProcesses
        if ($gameProcesses.Count -gt 0) { break }
        Start-Sleep -Milliseconds 500
    } while ([DateTime]::UtcNow -lt $deadline)
    if ($gameProcesses.Count -eq 0) { throw 'The game did not start within three minutes.' }
    Set-Status 'running' 'BOSSES session active; the campaign will be restored automatically after the game closes.'
    do {
        Start-Sleep -Seconds 2
        $gameProcesses = Get-GameProcesses
    } while ($gameProcesses.Count -gt 0)
    Start-Sleep -Seconds 3
    Restore-Transaction $transaction
} catch {
    $message = $_.Exception.Message
    try {
        if ((Test-Path -LiteralPath $TransactionFile) -and (Get-GameProcesses).Count -eq 0) {
            $transaction = Get-Content -LiteralPath $TransactionFile -Raw | ConvertFrom-Json
            Restore-Transaction $transaction
        }
    } catch { $message += ' | Restoration needs attention: ' + $_.Exception.Message }
    Set-Status 'failed' $message
    $message | Set-Content -LiteralPath (Join-Path $RunRoot 'error.txt') -Encoding UTF8
    exit 1
}
