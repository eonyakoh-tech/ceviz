#Requires -Version 5.1
<#
.SYNOPSIS
    CEVIZ — Windows 백엔드 설치 스크립트
.DESCRIPTION
    WSL2 환경에서 install-linux.sh를 실행하거나,
    Ollama Windows 네이티브 버전 + Task Scheduler를 설정합니다.
    멱등성: 이미 설치된 컴포넌트는 건너뜁니다.
    보안: 관리자 권한 없이 사용자 공간에만 설치합니다.
.PARAMETER Lang
    출력 언어: 'ko' (기본) 또는 'en'
.PARAMETER DryRun
    변경 없이 점검만 수행합니다.
.PARAMETER ForceNative
    WSL2가 있어도 네이티브 설치를 강제합니다.
.EXAMPLE
    .\install-windows.ps1
    .\install-windows.ps1 -Lang en -DryRun
#>
[CmdletBinding()]
param(
    [ValidateSet('ko','en')]
    [string]$Lang = 'ko',
    [switch]$DryRun,
    [switch]$ForceNative
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── 다국어 ────────────────────────────────────────────────────────────────────
function _t([string]$Ko, [string]$En) {
    if ($Lang -eq 'en') { $En } else { $Ko }
}

# ── 색상 출력 헬퍼 ────────────────────────────────────────────────────────────
function Write-Ok($msg)   { Write-Host "[OK]    $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[WARN]  $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "[FAIL]  $msg" -ForegroundColor Red }
function Write-Info($msg) { Write-Host "[INFO]  $msg" -ForegroundColor Cyan }
function Write-Step($msg) { Write-Host "`n$msg" -ForegroundColor White }

# ── dry-run 래퍼 ──────────────────────────────────────────────────────────────
$script:RollbackActions = [System.Collections.Generic.List[scriptblock]]::new()

function Invoke-Safe([scriptblock]$Action, [string]$Description = "") {
    if ($DryRun) {
        Write-Host "  [DRY-RUN] $Description" -ForegroundColor Cyan
    } else {
        & $Action
    }
}

function Register-Rollback([scriptblock]$Action) {
    $script:RollbackActions.Add($Action)
}

function Invoke-Rollback {
    Write-Warn (_t '롤백 중...' 'Rolling back...')
    for ($i = $script:RollbackActions.Count - 1; $i -ge 0; $i--) {
        try { & $script:RollbackActions[$i] } catch { }
    }
}

# ── 안전 점검 ─────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host ("═" * 48) -ForegroundColor White
Write-Host "  CEVIZ 백엔드 설치 — Windows" -ForegroundColor White
Write-Host ("═" * 48) -ForegroundColor White
Write-Host "  $(_t '시작:' 'Started:') $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host "  $(_t '대상:' 'Target:')  $env:APPDATA\ceviz"
if ($DryRun) { Write-Warn "-- DRY-RUN 모드: 실제 변경 없음 --" }
Write-Host ""

# 실행 정책 확인
$policy = Get-ExecutionPolicy -Scope CurrentUser
if ($policy -eq 'Restricted') {
    Write-Warn (_t '실행 정책이 Restricted입니다. 아래 명령을 먼저 실행하세요:' `
                   'Execution policy is Restricted. Run the following first:')
    Write-Host "  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser"
    exit 1
}

# ── 1. WSL2 확인 ──────────────────────────────────────────────────────────────
Write-Step (_t '1. WSL2 확인' '1. Checking WSL2')

$wslAvailable = $false
try {
    $wslOutput = wsl --status 2>&1
    if ($LASTEXITCODE -eq 0 -or $wslOutput -match 'Default Distribution') {
        $wslAvailable = $true
    }
} catch { }

if (-not $wslAvailable) {
    try {
        $distros = wsl --list --quiet 2>&1
        if ($distros -and $distros.Count -gt 0) { $wslAvailable = $true }
    } catch { }
}

if ($wslAvailable -and -not $ForceNative) {
    Write-Ok (_t 'WSL2 감지됨 — WSL2 내부에서 install-linux.sh를 실행합니다.' `
                 'WSL2 detected — running install-linux.sh inside WSL2.')
    Write-Info (_t '이 방법이 가장 완전한 기능을 제공합니다.' `
                   'This provides the most complete feature set.')

    # 스크립트 경로를 WSL 경로로 변환
    $scriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
    $repoRoot   = Split-Path -Parent $scriptDir
    $wslRepoRoot = $repoRoot -replace '^([A-Za-z]):', '/mnt/$1' -replace '\\', '/'
    $wslScript  = "$wslRepoRoot/scripts/install-linux.sh"

    Write-Info "WSL path: $wslScript"

    $wslArgs = @("bash", $wslScript)
    if ($DryRun)          { $wslArgs += "--dry-run" }
    if ($Lang -eq 'en')   { $wslArgs += "--lang=en" }

    Invoke-Safe {
        wsl @wslArgs
        if ($LASTEXITCODE -ne 0) {
            throw (_t 'install-linux.sh 실행 실패' 'install-linux.sh failed')
        }
    } "wsl bash $wslScript $($wslArgs[2..$wslArgs.Length] -join ' ')"

    Write-Host ""
    Write-Ok (_t 'WSL2 기반 설치 완료!' 'WSL2-based installation complete!')
    Write-Info (_t 'VS Code에서 ceviz.serverIp를 localhost:8000 으로 설정하세요.' `
                   'Set ceviz.serverIp to localhost:8000 in VS Code settings.')
    exit 0
}

# ── 2. 네이티브 Windows 설치 경로 ────────────────────────────────────────────
if (-not $wslAvailable) {
    Write-Warn (_t 'WSL2가 설치되어 있지 않습니다.' 'WSL2 is not installed.')
    Write-Info (_t '권장: WSL2를 설치하면 더 완전한 기능을 이용할 수 있습니다.' `
                   'Recommended: Install WSL2 for full feature support.')
    Write-Host "  wsl --install"
    Write-Host "  → https://aka.ms/wsl"
    Write-Host ""
    Write-Info (_t 'WSL2 없이 네이티브 Windows 설치를 계속합니다.' `
                   'Continuing with native Windows installation (no WSL2).')
}

$CevizDir   = Join-Path $env:APPDATA "ceviz"
$LogFile    = Join-Path $CevizDir "install.log"
$TokenFile  = Join-Path $CevizDir ".api_token"
$VenvDir    = Join-Path $CevizDir "venv"
$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot   = Split-Path -Parent $ScriptDir

# ── 3. 디렉터리 준비 ──────────────────────────────────────────────────────────
Write-Step (_t '3. 디렉터리 준비' '3. Preparing directories')
Invoke-Safe {
    @($CevizDir,
      (Join-Path $CevizDir "logs"),
      (Join-Path $CevizDir "skills"),
      (Join-Path $CevizDir "projects")) | ForEach-Object {
        if (-not (Test-Path $_)) { New-Item -ItemType Directory -Path $_ | Out-Null }
    }
} "mkdir $CevizDir ..."
Write-Ok $CevizDir

# ── 4. winget 확인 ────────────────────────────────────────────────────────────
Write-Step (_t '4. winget 확인' '4. Checking winget')
$wingetOk = $false
try {
    winget --version 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { $wingetOk = $true; Write-Ok "winget" }
} catch {
    Write-Warn (_t 'winget을 찾을 수 없습니다. Microsoft Store에서 "앱 설치 관리자"를 업데이트하세요.' `
                   'winget not found. Update "App Installer" from Microsoft Store.')
}

function Install-WithWinget([string]$Id, [string]$Name) {
    if (-not $wingetOk) {
        Write-Warn "$(_t '건너뜀 (winget 없음):' 'Skipped (no winget):') $Name"
        return
    }
    $installed = winget list --id $Id 2>&1 | Select-String $Id
    if ($installed) {
        Write-Ok "$(_t '이미 설치됨:' 'Already installed:') $Name"
    } else {
        Write-Info "$(_t '설치 중:' 'Installing:') $Name"
        Invoke-Safe { winget install --id $Id --silent --accept-source-agreements --accept-package-agreements } `
                    "winget install $Id"
        Write-Ok $Name
    }
}

# ── 5. Ollama 네이티브 설치 ───────────────────────────────────────────────────
Write-Step (_t '5. Ollama 설치' '5. Installing Ollama')
Install-WithWinget "Ollama.Ollama" "Ollama"

# ── 6. Python ─────────────────────────────────────────────────────────────────
Write-Step (_t '6. Python 설치' '6. Installing Python')
$pythonOk = $false
try {
    $pyVer = python --version 2>&1
    if ($pyVer -match '3\.(1[0-9]|[2-9]\d)') {
        Write-Ok "$(_t '이미 설치됨:' 'Already installed:') $pyVer"
        $pythonOk = $true
    } else {
        Write-Warn "$(_t '구버전 Python 감지:' 'Old Python detected:') $pyVer → $(_t '업그레이드 필요' 'upgrade needed')"
        Install-WithWinget "Python.Python.3.12" "Python 3.12"
        $pythonOk = $true
    }
} catch {
    Install-WithWinget "Python.Python.3.12" "Python 3.12"
    $pythonOk = $true
}

# ── 7. ffmpeg + ripgrep ───────────────────────────────────────────────────────
Write-Step (_t '7. 추가 도구' '7. Additional tools')
Install-WithWinget "Gyan.FFmpeg"                  "ffmpeg"
Install-WithWinget "BurntSushi.ripgrep.MSVC"      "ripgrep"
Install-WithWinget "yt-dlp.yt-dlp"               "yt-dlp"

# ── 8. Python 가상환경 + 패키지 ──────────────────────────────────────────────
Write-Step (_t '8. Python 패키지 설치' '8. Python packages')
if ($pythonOk) {
    if (-not (Test-Path $VenvDir)) {
        Invoke-Safe { python -m venv $VenvDir } "python -m venv $VenvDir"
        Register-Rollback { Remove-Item -Recurse -Force $VenvDir -ErrorAction SilentlyContinue }
        Write-Ok $VenvDir
    } else {
        Write-Ok "$(_t '이미 존재:' 'Already exists:') $VenvDir"
    }
    $pip = Join-Path $VenvDir "Scripts\pip.exe"
    Invoke-Safe { & $pip install --upgrade pip fastapi uvicorn httpx chromadb 2>&1 | Out-Null } `
                "pip install fastapi uvicorn httpx chromadb"
    Write-Ok "fastapi uvicorn httpx chromadb"
} else {
    Write-Warn (_t 'Python 없음 — 패키지 설치 건너뜀' 'Python not available — skipping packages')
}

# ── 9. 백엔드 파일 복사 ───────────────────────────────────────────────────────
Write-Step (_t '9. 백엔드 파일 배포' '9. Deploying backend files')

function Deploy-PyFile([string]$Src, [string]$DstName) {
    $srcPath = Join-Path $RepoRoot $Src
    $dstPath = Join-Path $CevizDir $DstName
    if (-not (Test-Path $srcPath)) {
        Write-Warn "$(_t '소스 없음 (건너뜀):' 'Source missing (skipped):') $Src"
        return
    }
    $same = (Test-Path $dstPath) -and
            ((Get-FileHash $srcPath).Hash -eq (Get-FileHash $dstPath).Hash)
    if ($same) {
        Write-Ok "$(_t '변경 없음:' 'Unchanged:') $DstName"
    } else {
        if (Test-Path $dstPath) { Copy-Item $dstPath "$dstPath.bak" -Force }
        Invoke-Safe { Copy-Item $srcPath $dstPath -Force } "copy $DstName"
        # Windows ACL: 현재 사용자만 읽기/쓰기 허용
        Invoke-Safe {
            $acl = Get-Acl $dstPath
            $acl.SetAccessRuleProtection($true, $false)
            $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
                $env:USERNAME, "FullControl", "Allow")
            $acl.SetAccessRule($rule)
            Set-Acl $dstPath $acl
        } "icacls restrict $DstName"
        Write-Ok $DstName
    }
}

Deploy-PyFile "pn40_rss_router.py"     "rss_router.py"
Deploy-PyFile "pn40_rss_worker.py"     "rss_worker.py"
Deploy-PyFile "pn40_rss_whitepaper.py" "rss_whitepaper.py"
Deploy-PyFile "pn40_evolution_patch.py" "evolution_router.py"
Deploy-PyFile "pn40_domain_router.py"  "domain_router.py"
Deploy-PyFile "pn40_auth_patch.py"     "auth.py"
Deploy-PyFile "pn40_skills_patch.py"   "skills_router.py"
Deploy-PyFile "engine.py"              "engine.py"

# ── 10. API 토큰 생성 ─────────────────────────────────────────────────────────
Write-Step (_t '10. API 토큰 생성' '10. Generating API token')
if (Test-Path $TokenFile) {
    Write-Ok (_t '토큰 이미 존재합니다.' 'Token already exists.')
} else {
    $token = [System.Web.HttpUtility]::UrlEncode(
        [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
    )
    Invoke-Safe {
        Set-Content -Path $TokenFile -Value $token -Encoding UTF8 -NoNewline
        $acl = Get-Acl $TokenFile
        $acl.SetAccessRuleProtection($true, $false)
        $acl.SetAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule(
            $env:USERNAME, "FullControl", "Allow")))
        Set-Acl $TokenFile $acl
    } "write token file"
    Write-Ok "$(_t '토큰 생성:' 'Token created:') $TokenFile"
    Write-Warn (_t '아래 토큰을 CEVIZ Extension ☁️ Cloud 탭 → PN40 인증에 입력하세요:' `
                   'Paste this token in CEVIZ Extension ☁️ Cloud tab → PN40 Auth:')
    Write-Host "  $(Get-Content $TokenFile)" -ForegroundColor White
}

# ── 11. Windows Defender 예외 등록 ───────────────────────────────────────────
Write-Step (_t '11. Windows Defender 예외 등록' '11. Windows Defender exclusion')
$ollamaPath = "$env:LOCALAPPDATA\Programs\Ollama"
if (Test-Path $ollamaPath) {
    Invoke-Safe {
        Add-MpPreference -ExclusionPath $ollamaPath -ErrorAction SilentlyContinue
        Add-MpPreference -ExclusionPath $CevizDir   -ErrorAction SilentlyContinue
    } "Add-MpPreference exclusions"
    Write-Ok ($_ = $ollamaPath)
} else {
    Write-Info (_t 'Ollama 경로 없음 — Defender 예외 건너뜀' 'Ollama path not found — skipping Defender exclusion')
}

# ── 12. Task Scheduler 등록 ───────────────────────────────────────────────────
Write-Step (_t '12. Task Scheduler 서비스 등록' '12. Registering Task Scheduler services')

$uvicorn = Join-Path $VenvDir "Scripts\uvicorn.exe"
$python  = Join-Path $VenvDir "Scripts\python.exe"

function Register-CevizTask([string]$TaskName, [string]$Exe, [string]$Arguments, [string]$TriggerDesc) {
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Info "$(_t '기존 태스크 교체:' 'Replacing existing task:') $TaskName"
        Invoke-Safe { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false } "Remove task $TaskName"
    }
    $action  = New-ScheduledTaskAction -Execute $Exe -Argument $Arguments -WorkingDirectory $CevizDir
    $trigger = if ($TriggerDesc -eq 'logon') {
        New-ScheduledTaskTrigger -AtLogOn
    } else {
        New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes 30) -Once -At (Get-Date)
    }
    $settings = New-ScheduledTaskSettingsSet `
        -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
        -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
        -StartWhenAvailable
    Invoke-Safe {
        Register-ScheduledTask -TaskName $TaskName -Action $action `
            -Trigger $trigger -Settings $settings -Force | Out-Null
        Register-Rollback { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -EA SilentlyContinue }
    } "Register-ScheduledTask $TaskName"
    Write-Ok $TaskName
}

if (Test-Path $uvicorn) {
    Register-CevizTask "CevizApi" $uvicorn `
        "api_server:app --host 0.0.0.0 --port 8000 --workers 1" "logon"
} else {
    Write-Warn (_t 'uvicorn 없음 — API 태스크 건너뜀 (Python 설치 필요)' `
                   'uvicorn not found — skipping API task (Python required)')
}

if (Test-Path $python) {
    Register-CevizTask "CevizRss" $python "rss_worker.py --once" "interval"
} else {
    Write-Warn (_t 'Python venv 없음 — RSS 태스크 건너뜀' 'Python venv not found — skipping RSS task')
}

# ── 13. 설치 검증 ─────────────────────────────────────────────────────────────
Write-Step (_t '13. 설치 검증' '13. Verifying installation')
if (-not $DryRun) {
    # API 태스크 즉시 시작 시도
    try {
        Start-ScheduledTask -TaskName "CevizApi" -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 3
    } catch { }

    $verified = $false
    for ($i = 1; $i -le 15; $i++) {
        try {
            $resp = Invoke-WebRequest -Uri "http://localhost:8000/status" -UseBasicParsing -TimeoutSec 2 -EA Stop
            if ($resp.StatusCode -eq 200) { $verified = $true; break }
        } catch { }
        Start-Sleep -Seconds 1
    }
    if ($verified) {
        Write-Ok (_t 'API 서버 응답 확인 ✓' 'API server responded ✓')
    } else {
        Write-Warn (_t 'API 서버 미응답 (태스크 시작 후 잠시 대기 필요할 수 있음).' `
                       'API server did not respond (may need a moment to start).')
        Write-Info "http://localhost:8000/status"
    }
} else {
    Write-Ok "[DRY-RUN] $(_t '검증 건너뜀' 'Verification skipped')"
}

# ── 완료 ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host ("═" * 48) -ForegroundColor White
Write-Ok (_t 'CEVIZ 백엔드 설치 완료 (Windows)!' 'CEVIZ backend installation complete (Windows)!')
Write-Host ("═" * 48) -ForegroundColor White
Write-Host ""
Write-Info (_t '태스크 상태 확인:' 'Check task status:')
Write-Host "  Get-ScheduledTask -TaskName CevizApi"
Write-Host "  Get-ScheduledTask -TaskName CevizRss"
Write-Host ""
Write-Info (_t 'VS Code 설정:' 'VS Code setting:')
Write-Host "  ceviz.serverIp = localhost:8000"
Write-Host ""
"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] install-windows.ps1 completed" |
    Add-Content (Join-Path $CevizDir "install.log") -ErrorAction SilentlyContinue
