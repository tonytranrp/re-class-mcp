param(
    [string]$Configuration = "Release",
    [ValidateSet("x64", "x86")]
    [string]$Platform = "x64",
    [string]$ReClassInstallRoot = "",
    [bool]$DisableLegacyPlugin = $true
)

$ErrorActionPreference = "Stop"

function Resolve-ReClassInstallRoot {
    param([string]$PreferredRoot, [string]$PlatformName)

    $candidates = @()
    if (-not [string]::IsNullOrWhiteSpace($PreferredRoot)) {
        $candidates += $PreferredRoot
    }
    if ($env:RECLASS_INSTALL_DIR) {
        $candidates += $env:RECLASS_INSTALL_DIR
    }
    $candidates += "C:\Users\tonyi\Downloads\ReClass.NET"

    foreach ($candidate in $candidates | Select-Object -Unique) {
        $reClassExe = Join-Path (Join-Path $candidate $PlatformName) "ReClass.NET.exe"
        if (Test-Path $reClassExe) {
            return $candidate
        }
    }

    throw "ReClass.NET.exe was not found. Pass -ReClassInstallRoot or set RECLASS_INSTALL_DIR."
}

function Resolve-BuildTool {
    $vswherePath = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path $vswherePath) {
        $found = & $vswherePath -latest -requires Microsoft.Component.MSBuild -find "MSBuild\**\Bin\MSBuild.exe" | Select-Object -First 1
        if ($found) {
            return $found
        }
    }

    $fallbacks = @(
        "${env:ProgramFiles}\Microsoft Visual Studio\2022\Community\MSBuild\Current\Bin\MSBuild.exe",
        "${env:ProgramFiles}\Microsoft Visual Studio\2022\Professional\MSBuild\Current\Bin\MSBuild.exe",
        "${env:ProgramFiles}\Microsoft Visual Studio\2022\Enterprise\MSBuild\Current\Bin\MSBuild.exe",
        "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2019\Community\MSBuild\Current\Bin\MSBuild.exe",
        "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2019\Professional\MSBuild\Current\Bin\MSBuild.exe",
        "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2019\Enterprise\MSBuild\Current\Bin\MSBuild.exe",
        "${env:ProgramFiles(x86)}\MSBuild\14.0\Bin\MSBuild.exe"
    )

    foreach ($path in $fallbacks) {
        if (Test-Path $path) {
            return $path
        }
    }

    $command = Get-Command msbuild -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    $dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
    if ($dotnet) {
        return $dotnet.Source
    }

    throw "Neither MSBuild nor dotnet was found. Install Visual Studio Build Tools or the .NET SDK."
}

function Invoke-ProjectBuild {
    param(
        [string]$BuildToolPath,
        [string]$ProjectPath,
        [string]$ConfigurationName,
        [string]$PlatformName,
        [string]$ReClassBinaryDir
    )

    if ([System.IO.Path]::GetFileName($BuildToolPath).Equals("dotnet.exe", [System.StringComparison]::OrdinalIgnoreCase)) {
        & $BuildToolPath build $ProjectPath `
            --nologo `
            --verbosity minimal `
            -p:Configuration=$ConfigurationName `
            -p:Platform=$PlatformName `
            -p:ReClassNetInstallDir="$ReClassBinaryDir"
    }
    else {
        & $BuildToolPath $ProjectPath `
            /restore `
            /t:Build `
            /p:Configuration=$ConfigurationName `
            /p:Platform=$PlatformName `
            /p:ReClassNetInstallDir="$ReClassBinaryDir" `
            /v:minimal
    }

    if ($LASTEXITCODE -ne 0) {
        throw "Build failed: $ProjectPath"
    }
}

$repoRoot = Split-Path $PSScriptRoot -Parent
$pluginRoot = Join-Path $repoRoot "plugin"
$installRoot = Resolve-ReClassInstallRoot -PreferredRoot $ReClassInstallRoot -PlatformName $Platform
$reClassBinaryDir = Join-Path $installRoot $Platform
$reClassExe = Join-Path $reClassBinaryDir "ReClass.NET.exe"
$pluginsDir = Join-Path $reClassBinaryDir "Plugins"
$buildToolPath = Resolve-BuildTool

Write-Host "Building ReClassMcp plugin stack..." -ForegroundColor Cyan
Write-Host "Configuration: $Configuration"
Write-Host "Platform: $Platform"
Write-Host "ReClass.NET: $reClassExe"
Write-Host "Build tool: $buildToolPath"

New-Item -ItemType Directory -Path $pluginsDir -Force | Out-Null

$contractsProject = Join-Path $pluginRoot "ReClassMcp.Contracts\ReClassMcp.Contracts.csproj"
$runtimeProject = Join-Path $pluginRoot "ReClassMcp.Runtime\ReClassMcp.Runtime.csproj"
$bootstrapProject = Join-Path $pluginRoot "ReClassMcp.Bootstrap\ReClassMcp.Bootstrap.csproj"

Invoke-ProjectBuild -BuildToolPath $buildToolPath -ProjectPath $contractsProject -ConfigurationName $Configuration -PlatformName $Platform -ReClassBinaryDir $reClassBinaryDir
Invoke-ProjectBuild -BuildToolPath $buildToolPath -ProjectPath $runtimeProject -ConfigurationName $Configuration -PlatformName $Platform -ReClassBinaryDir $reClassBinaryDir
Invoke-ProjectBuild -BuildToolPath $buildToolPath -ProjectPath $bootstrapProject -ConfigurationName $Configuration -PlatformName $Platform -ReClassBinaryDir $reClassBinaryDir

$outputs = @(
    (Join-Path $pluginRoot "ReClassMcp.Contracts\bin\$Platform\$Configuration\ReClassMcp.Contracts.dll"),
    (Join-Path $pluginRoot "ReClassMcp.Runtime\bin\$Platform\$Configuration\ReClassMcp.Runtime.dll"),
    (Join-Path $pluginRoot "ReClassMcp.Runtime\bin\$Platform\$Configuration\ReClassMcp.Runtime.pdb"),
    (Join-Path $pluginRoot "ReClassMcp.Bootstrap\bin\$Platform\$Configuration\ReClassMcpBootstrap.dll"),
    (Join-Path $pluginRoot "ReClassMcp.Bootstrap\bin\$Platform\$Configuration\ReClassMcpBootstrap.pdb"),
    (Join-Path $pluginRoot "ReClassMcp.Runtime\bin\$Platform\$Configuration\Newtonsoft.Json.dll")
)

foreach ($output in $outputs) {
    if (Test-Path $output) {
        Copy-Item $output $pluginsDir -Force
    }
}

if ($DisableLegacyPlugin) {
    $legacyArtifacts = @(
        "ReClassMCP.dll",
        "ReClassMCP.dll.staged",
        "ReClassMCP.dll.bak",
        "ReClassMcp.Bootstrap.dll",
        "ReClassMcp.Bootstrap.pdb"
    )

    foreach ($artifact in $legacyArtifacts) {
        $artifactPath = Join-Path $pluginsDir $artifact
        if (Test-Path $artifactPath) {
            $disabledPath = "$artifactPath.disabled"
            try {
                if (Test-Path $disabledPath) {
                    Remove-Item $disabledPath -Force
                }

                Rename-Item $artifactPath -NewName ([System.IO.Path]::GetFileName($disabledPath)) -Force
                Write-Host "Disabled legacy plugin artifact: $artifact" -ForegroundColor Yellow
            }
            catch {
                Write-Warning "Failed to disable legacy plugin artifact '$artifactPath': $($_.Exception.Message)"
            }
        }
    }
}

Write-Host "Copied plugin artifacts to: $pluginsDir" -ForegroundColor Green
Write-Host "Done." -ForegroundColor Cyan
