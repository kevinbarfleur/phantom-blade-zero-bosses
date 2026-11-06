$ErrorActionPreference='Stop'
function Get-BossesDependency {
    $spec=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'Dependencies/PBZModLoader-1.0.2.json') -Raw|ConvertFrom-Json
    $cache=Join-Path $PSScriptRoot '.dependencies/PBZModLoader-1.0.2'
    $valid=Test-Path -LiteralPath $cache
    if($valid){foreach($file in $spec.files){$target=Join-Path $cache $file.path;if(-not (Test-Path -LiteralPath $target) -or (Get-FileHash -LiteralPath $target).Hash.ToLowerInvariant() -ne $file.sha256){$valid=$false;break}}}
    if($valid){return $cache}
    $candidates=@(Get-ChildItem -LiteralPath $PSScriptRoot -File -Filter '*PBZModLoader*.zip')
    $downloads=Join-Path $env:USERPROFILE 'Downloads'
    if(Test-Path -LiteralPath $downloads){$candidates+=@(Get-ChildItem -LiteralPath $downloads -File -Filter '*PBZModLoader*.zip')}
    $archive=@($candidates|Where-Object {(Get-FileHash -LiteralPath $_.FullName).Hash.ToLowerInvariant() -eq $spec.zipSha256}|Select-Object -First 1)
    if(-not $archive.Count){throw ('Download PBZModLoader 1.0.2 and leave its ZIP in Downloads: '+$spec.url)}
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip=[IO.Compression.ZipFile]::OpenRead($archive[0].FullName)
    try {
        foreach($file in $spec.files){
            if($file.path -match '(^|/)\.\.?(/|$)|:|\\' -or [IO.Path]::IsPathRooted($file.path)){throw 'Invalid dependency path.'}
            $entry=$zip.GetEntry($file.path)
            if(-not $entry){throw ('Missing loader file: '+$file.path)}
            $target=[IO.Path]::GetFullPath((Join-Path $cache $file.path))
            if(-not $target.StartsWith([IO.Path]::GetFullPath($cache)+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Extraction path is outside the dependency cache.'}
            New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force|Out-Null
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$target,$true)
            if((Get-FileHash -LiteralPath $target).Hash.ToLowerInvariant() -ne $file.sha256){throw 'Loader file hash does not match.'}
        }
    } finally {$zip.Dispose()}
    return $cache
}
