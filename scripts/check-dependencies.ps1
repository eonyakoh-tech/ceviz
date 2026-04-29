#Requires -Version 5.1
<#
.SYNOPSIS
    CEVIZ — Windows 의존성 버전 확인 스크립트
.PARAMETER Lang
    출력 언어: 'ko' (기본) 또는 'en'
.PARAMETER Json
    JSON 형식으로 결과 출력
.EXAMPLE
    .\check-dependencies.ps1
    .\check-dependencies.ps1 -Lang en -Json
#>
[CmdletBinding()]
param(
    [ValidateSet('ko','en')]
    [string]$Lang = 'ko',
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'SilentlyContinue'

function _t([string]$Ko, [string]$En) { if ($Lang -eq 'en') { $En } else { $Ko } }

$overall = $true
$results = [System.Collections.Generic.List[hashtable]]::new()

function Get-VersionString([string]$Cmd, [string]$Args = '--version') {
    try {
        $output = & $Cmd $Args 2>&1 | Select-Object -First 1
        return "$output".Trim()
    } catch { return "" }
}

function Compare-MinVersion([string]$Detected, [string]$MinVer) {
    if (-not $MinVer) { return $true }
    $detNum = [regex]::Match($Detected, '\d+\.\d+').Value
    if (-not $detNum) { return $false }
    try {
        $det = [Version]$detNum
        $req = [Version]$MinVer
        return $det -ge $req
    } catch { return $false }
}

function Test-Dependency(
    [string]$Name,
    [string]$Cmd,
    [string]$VersionArgs = '--version',
    [string]$MinVer = '',
    [string]$HintKo,
    [string]$HintEn
) {
    $cmdExists = $null -ne (Get-Command $Cmd -ErrorAction SilentlyContinue)
    $version   = if ($cmdExists) { Get-VersionString $Cmd $VersionArgs } else { "" }
    $hint      = if ($Lang -eq 'en') { $HintEn } else { $HintKo }

    $status = if (-not $cmdExists) { "missing" }
              elseif (-not (Compare-MinVersion $version $MinVer)) { "old" }
              else { "ok" }

    if (-not $Json) {
        $nameCol = $Name.PadRight(16)
        if ($status -eq "ok") {
            Write-Host "[OK]    $nameCol $version" -ForegroundColor Green
        } else {
            $reason = if ($status -eq "missing") { _t "미설치" "not found" }
                      else { "$version ($(_t "최소" "min") $MinVer $(_t "필요" "required"))" }
            Write-Host "[MISS]  $nameCol $reason  →  $hint" -ForegroundColor Yellow
        }
    }

    $results.Add(@{ name=$Name; status=$status; version=$version; minVer=$MinVer; hint=$hint })
    if ($status -ne "ok") { $script:overall = $false }
}

# ── 헤더 ──────────────────────────────────────────────────────────────────────
if (-not $Json) {
    Write-Host ""
    Write-Host (_t 'CEVIZ 의존성 확인' 'CEVIZ Dependency Check') -ForegroundColor White
    Write-Host ("-" * 60)
}

# ── 의존성 목록 ───────────────────────────────────────────────────────────────

Test-Dependency "Ollama"   "ollama"  "--version" "0.3" `
    "winget install Ollama.Ollama" `
    "winget install Ollama.Ollama"

Test-Dependency "Python"   "python"  "--version" "3.10" `
    "winget install Python.Python.3.12" `
    "winget install Python.Python.3.12"

Test-Dependency "Node.js"  "node"    "--version" "18.0" `
    "winget install OpenJS.NodeJS.LTS" `
    "winget install OpenJS.NodeJS.LTS"

Test-Dependency "ffmpeg"   "ffmpeg"  "-version"  "" `
    "winget install Gyan.FFmpeg" `
    "winget install Gyan.FFmpeg"

Test-Dependency "yt-dlp"   "yt-dlp"  "--version" "" `
    "winget install yt-dlp.yt-dlp" `
    "winget install yt-dlp.yt-dlp"

Test-Dependency "ripgrep"  "rg"      "--version" "" `
    "winget install BurntSushi.ripgrep.MSVC" `
    "winget install BurntSushi.ripgrep.MSVC"

Test-Dependency "WSL2"     "wsl"     "--status"  "" `
    "wsl --install  (재시작 필요)" `
    "wsl --install  (reboot required)"

# ── 출력 ──────────────────────────────────────────────────────────────────────
if ($Json) {
    [PSCustomObject]@{
        results = $results.ToArray()
        allOk   = $overall
    } | ConvertTo-Json -Depth 3
} else {
    Write-Host ""
    if ($overall) {
        Write-Host (_t "✅ 모든 의존성 확인 완료" "✅ All dependencies satisfied") -ForegroundColor Green
    } else {
        Write-Host (_t "⚠ 일부 의존성이 미설치/구버전입니다." "⚠ Some dependencies are missing or outdated.") -ForegroundColor Yellow
        Write-Host (_t "위 힌트를 참고하여 설치 후 다시 실행하세요." "Install the missing items and run again.")
    }
    Write-Host ""
}

exit $(if ($overall) { 0 } else { 1 })
