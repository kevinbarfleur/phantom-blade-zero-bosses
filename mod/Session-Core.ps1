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
if (-not $RunRoot.StartsWith([IO.Path]::GetFullPath($StateRoot) + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Dossier de session hors du paquet.' }
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
    if (-not $fullPath.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)) { throw 'Fichier hors des sauvegardes.' }
    return $fullPath.Substring($prefix.Length)
}
function Restore-Transaction($Transaction) {
    if ((Get-GameProcesses).Count -gt 0) { throw 'Ferme Phantom Blade Zero avant la restauration.' }
    Set-Status 'restoring' 'Restauration de la campagne avant le retour du reseau Steam.'
    # End the offline client's cloud work queue before restoring and unblocking.
    # A fresh client then reads the restored originals rather than cached lab data.
    $restartSteam=(Get-SteamClient).Count -gt 0
    if ($restartSteam) {
        Start-Process -FilePath (Join-Path $SteamRoot 'steam.exe') -ArgumentList '-shutdown' -WindowStyle Hidden | Out-Null
        $steamDeadline=[DateTime]::UtcNow.AddSeconds(30)
        while ((Get-SteamClient).Count -gt 0 -and [DateTime]::UtcNow -lt $steamDeadline) { Start-Sleep -Milliseconds 250 }
        if ((Get-SteamClient).Count -gt 0) { throw 'Steam n a pas termine sa fermeture. Le reseau reste bloque ; ferme Steam puis relance Restaurer-Campagne.cmd.' }
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
        if ((Hash-File $backupPath) -ne $entry.sha256) { throw ('Copie de secours invalide : ' + $entry.relative) }
        $livePath = Join-Path $SavedRoot $entry.relative
        [void](Relative-Saved $livePath)
        New-Item -ItemType Directory -Path (Split-Path -Parent $livePath) -Force | Out-Null
        Copy-Item -LiteralPath $backupPath -Destination $livePath -Force
        if ((Hash-File $livePath) -ne $entry.sha256) { throw ('Restauration invalide : ' + $entry.relative) }
    }
    $modFiles = @($Transaction.modFiles)
    if (-not $Transaction.modFiles) { $modFiles = @([pscustomobject]@{name='zzz_CodexBossLab_P.pak';sha256=$Transaction.pakHash}) }
    foreach ($modFile in $modFiles) {
        $installedPath = Join-Path (Split-Path -Parent $ModPath) $modFile.name
        if (Test-Path -LiteralPath $installedPath) {
            $acceptedHashes = @($modFile.sha256) + @($modFile.previousHashes)
            if ((Hash-File $installedPath) -notin $acceptedHashes) { throw 'Un fichier installe a change ; retrait automatique refuse.' }
            Move-Item -LiteralPath $installedPath -Destination (Join-Path $RunRoot ('removed-'+$modFile.name)) -Force
        }
    }
    # Network is restored only after all original save hashes have matched.
    foreach ($ruleName in $Transaction.rules) {
        Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    }
    $Transaction.completed = $true
    Write-JsonAtomic $TransactionFile $Transaction
    Set-Status 'restored' 'Campagne restauree et verifiee ; mod retire ; regles temporaires retirees.'
    if ($restartSteam) {
        try { Start-Process -FilePath (Join-Path $SteamRoot 'steam.exe') -ArgumentList '-silent' -WindowStyle Hidden | Out-Null }
        catch { Set-Status 'restored' 'Campagne restauree ; reseau retabli. Steam peut etre relance manuellement.' }
    }
}
try {
    New-Item -ItemType Directory -Path $RunRoot -Force | Out-Null
    if (-not $ValidateOnly) {
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
        $principal = New-Object Security.Principal.WindowsPrincipal($identity)
        if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Droits administrateur requis pour le pare-feu et le dossier du jeu.' }
    }
    # Recovery depends on the verified backup, never on the continued presence
    # or integrity of a mod bundle that may have been removed or updated.
    if ($RecoverOnly) {
        $transaction = Get-Content -LiteralPath $TransactionFile -Raw | ConvertFrom-Json
        Restore-Transaction $transaction
        exit 0
    }
    $manifest = Get-Content -LiteralPath (Join-Path $PackageRoot 'manifest.json') -Raw | ConvertFrom-Json
    if (-not $RecoverOnly -and -not $Persistent -and $manifest.qa.mode -ne 'manual') { throw 'Ce paquet est reserve aux essais automatiques. Utilise la version jouable.' }
    $pakSource = Join-Path $PackageRoot $manifest.pak.name
    if ((Hash-File $pakSource) -ne $manifest.pak.sha256) { throw 'Empreinte du paquet incorrecte.' }
    $bundleFiles = @($manifest.bundle)
    if (-not $manifest.bundle) { $bundleFiles = @($manifest.pak) }
    foreach ($file in $bundleFiles) {
        if ($file.name -notmatch '^zzz_CodexBossLab_P\.(pak|utoc|ucas)$') { throw 'Nom de fichier de paquet inattendu.' }
        if ((Hash-File (Join-Path $PackageRoot $file.name)) -ne $file.sha256) { throw 'Empreinte d un fichier du paquet incorrecte.' }
    }
    $acf = Get-Content -LiteralPath (Join-Path $SteamRoot 'steamapps\appmanifest_4115450.acf') -Raw
    $installedBuild = [regex]::Match($acf,'"buildid"\s+"(\d+)"').Groups[1].Value
    if (-not $RecoverOnly -and $installedBuild -ne [string]$manifest.gameBuild) { throw ('Build non compatible : ' + $installedBuild) }
    if ($ValidateOnly) { Set-Status 'validated' 'Paquet, chemins et build verifies. Aucune modification.'; exit 0 }
    if ((Get-GameProcesses).Count -gt 0) { throw 'Le jeu est deja ouvert.' }
    foreach ($file in $bundleFiles) {
        if (Test-Path -LiteralPath (Join-Path (Split-Path -Parent $ModPath) $file.name)) { throw 'Un paquet Boss Lab existe deja : utilise Restaurer avant de continuer.' }
    }
    foreach ($profile in Get-NetFirewallProfile -PolicyStore ActiveStore) {
        if ($profile.Enabled.ToString() -ne 'True') { throw 'Le pare-feu doit etre actif sur tous les profils pour ce test.' }
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
        if ((Hash-File $backupPath) -ne $hash) { throw 'Sauvegarde de secours non verifiee.' }
        $files += [pscustomobject]@{relative=$relative;sha256=$hash;bytes=$file.Length}
    }
    if (@($files | Where-Object { $_.relative -like '*PBZSaveGame.sav' }).Count -ne 1) { throw 'Sauvegarde principale absente ou ambigue.' }
    $programs = @(Get-ChildItem -LiteralPath $GameRoot -Recurse -File -Filter '*.exe' | ForEach-Object { $_.FullName })
    $programs += @((Join-Path $SteamRoot 'steam.exe'),(Join-Path $SteamRoot 'bin\cef\cef.win64\steamwebhelper.exe'))
    $programs = @($programs | Where-Object { Test-Path -LiteralPath $_ } | Sort-Object -Unique)
    $ruleSpecs = @()
    $tag = 'CodexBossLab-' + (Split-Path -Leaf $RunRoot)
    for ($i=0; $i -lt $programs.Count; $i++) {
        foreach ($direction in @('Outbound','Inbound')) {
            $ruleSpecs += [pscustomobject]@{name=($tag+'-'+$i+'-'+$direction);program=$programs[$i];direction=$direction}
        }
    }
    $transaction = [pscustomobject]@{version='0.1';completed=$false;files=$files;rules=@($ruleSpecs | ForEach-Object {$_.name});pakHash=$manifest.pak.sha256;modFiles=$bundleFiles;programs=$programs}
    Write-JsonAtomic $TransactionFile $transaction
    Set-Status 'preparing' 'Copies verifiees ; mise en place du blocage reseau temporaire.'
    foreach ($spec in $ruleSpecs) {
        New-NetFirewallRule -Name $spec.name -DisplayName $spec.name -Group $tag -Direction $spec.direction -Action Block -Enabled True -Profile Any -Program $spec.program -Protocol Any | Out-Null
    }
    foreach ($spec in $ruleSpecs) {
        $rule = Get-NetFirewallRule -PolicyStore ActiveStore -Name $spec.name
        $filter = Get-NetFirewallApplicationFilter -AssociatedNetFirewallRule $rule
        if ($rule.Action.ToString() -ne 'Block' -or $rule.Enabled.ToString() -ne 'True' -or $filter.Program -ne $spec.program) { throw 'Regle de blocage non effective.' }
    }
    if (-not $ProbeOnly) {
        New-Item -ItemType Directory -Path (Split-Path -Parent $ModPath) -Force | Out-Null
        foreach ($file in $bundleFiles) {
            $destination = Join-Path (Split-Path -Parent $ModPath) $file.name
            Copy-Item -LiteralPath (Join-Path $PackageRoot $file.name) -Destination $destination
            if ((Hash-File $destination) -ne $file.sha256) { throw 'Installation non verifiee.' }
        }
    }
    Set-Status 'ready' 'Copies et paquet verifies ; Steam et les executables PBZ bloques sur le reseau.'
    if ($Persistent) {
        $controllerDeadline = [DateTime]::UtcNow.AddHours(8)
        $wasRunning = $false
        do {
            $gameProcesses = Get-GameProcesses
            if ($gameProcesses.Count -gt 0) {
                if (-not $wasRunning) { Set-Status 'running' 'Tests autonomes actifs ; campagne protegee et reseau du jeu bloque.' }
                $wasRunning = $true
            } else {
                if ($wasRunning) { Set-Status 'idle' 'Jeu ferme ; gardien actif, pret pour le prochain test sans nouvelle elevation.'; $wasRunning = $false }
                if ((Test-Path -LiteralPath (Join-Path $RunRoot 'stop.request')) -or [DateTime]::UtcNow -ge $controllerDeadline) { break }
                $stageRequest = Join-Path $RunRoot 'stage.request'
                if (Test-Path -LiteralPath $stageRequest) {
                    # Only this mod's three fixed files may be replaced. The
                    # controller never evaluates commands supplied by a request.
                    Set-Status 'staging' 'Verification de la revision avant le prochain test.'
                    $nextManifest = Get-Content -LiteralPath (Join-Path $PackageRoot 'manifest.json') -Raw | ConvertFrom-Json
                    $nextFiles = @($nextManifest.bundle)
                    if ([string]$nextManifest.gameBuild -ne $installedBuild -or $nextFiles.Count -ne 3) { throw 'Revision incompatible.' }
                    $names = @($nextFiles | ForEach-Object { $_.name } | Sort-Object -Unique)
                    if ($names.Count -ne 3) { throw 'Revision ambigue.' }
                    foreach ($next in $nextFiles) {
                        if ($next.name -notmatch '^zzz_CodexBossLab_P\.(pak|utoc|ucas)$') { throw 'Fichier de revision interdit.' }
                        if ((Hash-File (Join-Path $PackageRoot $next.name)) -ne $next.sha256) { throw 'Revision non verifiee.' }
                        $old = @($transaction.modFiles | Where-Object name -eq $next.name)
                        if ($old.Count -ne 1) { throw 'Paquet precedent ambigu.' }
                        $installed = Join-Path (Split-Path -Parent $ModPath) $next.name
                        if ((Hash-File $installed) -ne $old[0].sha256) { throw 'Le paquet installe a ete modifie hors du gardien.' }
                    }
                    $nextTransactionFiles = @()
                    foreach ($next in $nextFiles) {
                        $old = @($transaction.modFiles | Where-Object name -eq $next.name)[0]
                        $accepted = @($old.sha256) + @($old.previousHashes) | Where-Object { $_ } | Sort-Object -Unique
                        $nextTransactionFiles += [pscustomobject]@{name=$next.name;sha256=$next.sha256;previousHashes=@($accepted)}
                    }
                    $transaction.modFiles = $nextTransactionFiles
                    Write-JsonAtomic $TransactionFile $transaction
                    foreach ($next in $nextFiles) {
                        $installed = Join-Path (Split-Path -Parent $ModPath) $next.name
                        Copy-Item -LiteralPath (Join-Path $PackageRoot $next.name) -Destination $installed -Force
                        if ((Hash-File $installed) -ne $next.sha256) { throw 'Installation de revision non verifiee.' }
                    }
                    Remove-Item -LiteralPath $stageRequest
                    Set-Status 'ready' 'Nouvelle revision verifiee ; lancement possible sans nouvelle elevation.'
                }
            }
            Start-Sleep -Milliseconds 500
        } while ($true)
        Restore-Transaction $transaction
        exit 0
    }
    $deadline = [DateTime]::UtcNow.AddMinutes(3)
    do {
        if (Test-Path -LiteralPath (Join-Path $RunRoot 'cancel.request')) { throw 'Lancement annule.' }
        $gameProcesses = Get-GameProcesses
        if ($gameProcesses.Count -gt 0) { break }
        Start-Sleep -Milliseconds 500
    } while ([DateTime]::UtcNow -lt $deadline)
    if ($gameProcesses.Count -eq 0) { throw 'Le jeu ne s est pas lance dans les trois minutes.' }
    Set-Status 'running' 'Session Boss Lab active ; restauration automatique apres fermeture du jeu.'
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
    } catch { $message += ' | Restauration a reprendre : ' + $_.Exception.Message }
    Set-Status 'failed' $message
    $message | Set-Content -LiteralPath (Join-Path $RunRoot 'error.txt') -Encoding UTF8
    exit 1
}
