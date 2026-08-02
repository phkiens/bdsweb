# Parse .env file for ACTIVATION_FUNCTION_URL and ACTIVATION_PUBLISHABLE_KEY
$envFilePath = Join-Path $PSScriptRoot "..\..\.env"
if (-not (Test-Path $envFilePath)) {
    Write-Host "[LOI] Khong tim thay file .env tai: $envFilePath" -ForegroundColor Red
    Write-Host "Vui long tao file .env truoc khi dung menu." -ForegroundColor Yellow
    Read-Host "Nhan Enter de thoat..."
    exit 1
}

$functionUrl = $null
$publishableKey = $null

Get-Content $envFilePath | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#")) {
        $parts = $line.Split("=", 2)
        if ($parts.Count -eq 2) {
            $k = $parts[0].Trim()
            $v = $parts[1].Trim().Trim('"').Trim("'")
            if ($k -eq "ACTIVATION_FUNCTION_URL") { $functionUrl = $v }
            if ($k -eq "ACTIVATION_PUBLISHABLE_KEY") { $publishableKey = $v }
        }
    }
}

if ([string]::IsNullOrWhiteSpace($functionUrl) -or [string]::IsNullOrWhiteSpace($publishableKey)) {
    Write-Host "[LOI] File .env thieu ACTIVATION_FUNCTION_URL hoac ACTIVATION_PUBLISHABLE_KEY!" -ForegroundColor Red
    Read-Host "Nhan Enter de thoat..."
    exit 1
}

# Strict URL parsing, Host Pinning & Security Validation (BEFORE reading DPAPI token)
$uri = $null
if (-not [System.Uri]::TryCreate($functionUrl, [System.UriKind]::Absolute, [ref]$uri)) {
    Write-Host "[LOI] ACTIVATION_FUNCTION_URL trong .env khong phai URL hop le!" -ForegroundColor Red
    Read-Host "Nhan Enter de thoat..."
    exit 1
}

if ($uri.Scheme -ne "https") {
    Write-Host "[LOI] ACTIVATION_FUNCTION_URL phai dung giao thuc HTTPS!" -ForegroundColor Red
    Read-Host "Nhan Enter de thoat..."
    exit 1
}

if ($uri.Host.ToLower() -ne "bijfdqzbpjcprhttrgmv.supabase.co") {
    Write-Host "[LOI] ACTIVATION_FUNCTION_URL host khong hop le! Host phai la 'bijfdqzbpjcprhttrgmv.supabase.co'." -ForegroundColor Red
    Read-Host "Nhan Enter de thoat..."
    exit 1
}

if (-not $uri.IsDefaultPort) {
    Write-Host "[LOI] ACTIVATION_FUNCTION_URL khong duoc dung custom port!" -ForegroundColor Red
    Read-Host "Nhan Enter de thoat..."
    exit 1
}

if (-not [string]::IsNullOrEmpty($uri.UserInfo)) {
    Write-Host "[LOI] ACTIVATION_FUNCTION_URL khong duoc chua UserInfo!" -ForegroundColor Red
    Read-Host "Nhan Enter de thoat..."
    exit 1
}

if (-not [string]::IsNullOrEmpty($uri.Query) -or -not [string]::IsNullOrEmpty($uri.Fragment)) {
    Write-Host "[LOI] ACTIVATION_FUNCTION_URL khong duoc chua Query hoac Fragment!" -ForegroundColor Red
    Read-Host "Nhan Enter de thoat..."
    exit 1
}

if ($uri.AbsolutePath -ne "/functions/v1/app-activation") {
    Write-Host "[LOI] ACTIVATION_FUNCTION_URL AbsolutePath phai la '/functions/v1/app-activation'!" -ForegroundColor Red
    Read-Host "Nhan Enter de thoat..."
    exit 1
}

# Safely compute Admin Function URL
$adminPath = "/functions/v1/activation-admin"
$adminFunctionUrl = "https://bijfdqzbpjcprhttrgmv.supabase.co$adminPath"

if ($adminFunctionUrl -eq $functionUrl) {
    Write-Host "[LOI] Admin URL khong duoc trung voi App Activation URL!" -ForegroundColor Red
    Read-Host "Nhan Enter de thoat..."
    exit 1
}

# DPAPI Encrypted Admin Token File (Occurs ONLY AFTER URL Validation Passes)
$tokenFilePath = Join-Path $env:USERPROFILE "Documents\bds-activation-admin\admin-token.dpapi"
if (-not (Test-Path $tokenFilePath)) {
    Write-Host "[LOI] Khong tim thay file admin token tai: $tokenFilePath" -ForegroundColor Red
    Write-Host "Vui long luu token quan tri bang DPAPI truoc." -ForegroundColor Yellow
    Read-Host "Nhan Enter de thoat..."
    exit 1
}

$secureAdminToken = $null
try {
    $encryptedContent = Get-Content $tokenFilePath -Raw
    $secureAdminToken = ConvertTo-SecureString $encryptedContent
} catch {
    Write-Host "[LOI] Khong the doc hoac giai ma file admin token DPAPI!" -ForegroundColor Red
    Read-Host "Nhan Enter de thoat..."
    exit 1
}

function Invoke-ActivationAdminRequest {
    param(
        [Parameter(Mandatory = $true)][string]$ActionName,
        [hashtable]$BodyParams = @{}
    )

    $bstr = [System.IntPtr]::Zero
    $headers = $null
    $jsonBody = $null

    try {
        $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($script:secureAdminToken)
        $plainToken = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)

        $headers = @{
            "apikey" = $script:publishableKey
            "x-activation-admin-token" = $plainToken
            "Content-Type" = "application/json"
        }

        $payload = @{ action = $ActionName }
        foreach ($k in $BodyParams.Keys) {
            $payload[$k] = $BodyParams[$k]
        }
        $jsonBody = $payload | ConvertTo-Json -Compress

        $response = Invoke-RestMethod -Uri $script:adminFunctionUrl -Method Post -Headers $headers -Body $jsonBody -TimeoutSec 30
        return $response
    } catch {
        if ($_.Exception.Response) {
            $statusCode = [int]$_.Exception.Response.StatusCode
            if ($statusCode -eq 401) {
                Write-Host "[LOI] Token quan tri khong hop le (HTTP 401)." -ForegroundColor Red
            } else {
                Write-Host "[LOI] Yeu cau failed voi HTTP status: $statusCode" -ForegroundColor Red
            }
        } else {
            Write-Host "[LOI] Loi ket noi den server admin API." -ForegroundColor Red
        }
        return $null
    } finally {
        if ($headers) {
            $headers["x-activation-admin-token"] = $null
            $headers.Clear()
        }
        $jsonBody = $null
        Remove-Variable headers, jsonBody, plainToken -ErrorAction SilentlyContinue
        if ($bstr -ne [System.IntPtr]::Zero) {
            [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        }
    }
}

function Show-Header {
    Clear-Host
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "CONG CU QUAN LY ACTIVATION (ADMIN API TRUC TIEP)" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Fetch-InvitesList {
    $res = Invoke-ActivationAdminRequest -ActionName "listInvites"
    if ($res -and $res.ok -and ($res.PSObject.Properties.Match('invites').Count -gt 0)) {
        return @($res.invites)
    }
    return @()
}

function Display-InvitesList {
    param([array]$Invites)

    if ($Invites.Count -eq 0) {
        Write-Host "Chua co ma moi nao trong he thong." -ForegroundColor Yellow
        return
    }

    for ($i = 0; $i -lt $Invites.Count; $i++) {
        $inv = $Invites[$i]
        $statusText = switch ($inv.status) {
            "AVAILABLE" { "CO THE SU DUNG" }
            "FULL"      { "DA DUNG DU" }
            "EXPIRED"   { "HET HAN" }
            "REVOKED"   { "DA THU HOI" }
            default     { $inv.status }
        }
        $lastVerified = if ($inv.lastVerifiedAt) { $inv.lastVerifiedAt } else { "Chua co" }
        Write-Host "[$($i + 1)] Label: $($inv.label)" -ForegroundColor Yellow
        Write-Host "    Trang thai: $statusText" -ForegroundColor White
        Write-Host "    Tong kich hoat: $($inv.totalActivations)" -ForegroundColor White
        Write-Host "    Thiet bi dang hoat dong: $($inv.activeDevices)" -ForegroundColor White
        Write-Host "    Gioi han: $($inv.maxActivations)" -ForegroundColor White
        Write-Host "    Het han: $($inv.expiresAt)" -ForegroundColor White
        Write-Host "    Xac minh gan nhat: $lastVerified" -ForegroundColor White
        Write-Host "    UUID: $($inv.id)" -ForegroundColor DarkGray
        Write-Host ""
    }
}

while ($true) {
    Show-Header
    Write-Host "1. Tao ma moi" -ForegroundColor Yellow
    Write-Host "2. Xem danh sach ma" -ForegroundColor Yellow
    Write-Host "3. Thu hoi ma moi" -ForegroundColor Yellow
    Write-Host "4. Xem thiet bi cua ma" -ForegroundColor Yellow
    Write-Host "5. Thu hoi thiet bi" -ForegroundColor Yellow
    Write-Host "0. Thoat" -ForegroundColor Yellow
    Write-Host ""
    $choice = Read-Host "Chon chuc nang (0-5)"

    switch ($choice) {
        "1" {
            Show-Header
            Write-Host "--- CHUC NANG 1: TAO MA MOI ---" -ForegroundColor Green
            Write-Host ""

            # Label Input & Validation
            $labelInput = Read-Host "Nhap Label (ten khach/thiet bi, khong rong, max 64 ky tu)"
            if ([string]::IsNullOrWhiteSpace($labelInput)) {
                Write-Host "[LOI] Label khong duoc de rong!" -ForegroundColor Red
                Read-Host "Nhan Enter de quay lai menu..."
                continue
            }
            if ($labelInput.Length -gt 64) {
                Write-Host "[LOI] Label khong duoc vuot qua 64 ky tu!" -ForegroundColor Red
                Read-Host "Nhan Enter de quay lai menu..."
                continue
            }

            # MaxActivations Input & Validation (Default: 1)
            $maxInput = Read-Host "Nhap so thiet bi duoc dung (Enter de dung mac dinh 1, max 100)"
            if ([string]::IsNullOrWhiteSpace($maxInput)) {
                $maxAct = 1
            } else {
                $parsedMax = 0
                if (-not [int]::TryParse($maxInput, [ref]$parsedMax) -or $parsedMax -lt 1 -or $parsedMax -gt 100) {
                    Write-Host "[LOI] So thiet bi phai la so nguyen tu 1 den 100!" -ForegroundColor Red
                    Read-Host "Nhan Enter de quay lai menu..."
                    continue
                }
                $maxAct = $parsedMax
            }

            # ExpiresInDays Input & Validation (Default: 7)
            $expInput = Read-Host "Nhap so ngay hieu luc (Enter de dung mac dinh 7, range 1-365)"
            if ([string]::IsNullOrWhiteSpace($expInput)) {
                $expDays = 7
            } else {
                $parsedExp = 0
                if (-not [int]::TryParse($expInput, [ref]$parsedExp) -or $parsedExp -lt 1 -or $parsedExp -gt 365) {
                    Write-Host "[LOI] So ngay hieu luc phai la so nguyen tu 1 den 365!" -ForegroundColor Red
                    Read-Host "Nhan Enter de quay lai menu..."
                    continue
                }
                $expDays = $parsedExp
            }

            Write-Host ""
            $res = Invoke-ActivationAdminRequest -ActionName "createInvite" -BodyParams @{
                label = $labelInput
                maxActivations = $maxAct
                expiresInDays = $expDays
            }

            if ($res -and $res.ok -and $res.code) {
                Set-Clipboard -Value $res.code

                Write-Host "============================================================" -ForegroundColor Cyan
                Write-Host "TAO MA MOI THANH CONG" -ForegroundColor Green
                Write-Host "============================================================" -ForegroundColor Cyan
                Write-Host "Label: $($res.invite.label)" -ForegroundColor White
                Write-Host "UUID: $($res.invite.id)" -ForegroundColor White
                Write-Host "Het han: $($res.invite.expiresAt)" -ForegroundColor White
                Write-Host ""
                Write-Host "MA MOI GOC (CHI HIEN THI MOT LAN):" -ForegroundColor Yellow
                Write-Host "   $($res.code)" -ForegroundColor Green
                Write-Host ""
                Write-Host "[THONG BAO] Da copy MA MOI GOC vao clipboard!" -ForegroundColor Green
                Write-Host "Luu y: Ma chi duoc tra ve mot lan. Hay luu/gui ma truoc khi tiep tuc." -ForegroundColor Yellow
                Write-Host ""
                Read-Host "Nhan Enter sau khi da luu ma de quay lai menu..."

                # Clean up plaintext code property in memory
                if ($res.PSObject.Properties.Match('code').Count -gt 0) {
                    $res.code = $null
                }
                Remove-Variable res -ErrorAction SilentlyContinue
            } else {
                Write-Host "[LOI] Khong the tao ma moi tu Admin API!" -ForegroundColor Red
                Read-Host "Nhan Enter de quay lai menu..."
            }
        }
        "2" {
            Show-Header
            Write-Host "--- CHUC NANG 2: XEM DANH SACH MA ---" -ForegroundColor Green
            Write-Host ""

            $invites = Fetch-InvitesList
            Display-InvitesList -Invites $invites

            Read-Host "Nhan Enter de quay lai menu..."
        }
        "3" {
            Show-Header
            Write-Host "--- CHUC NANG 3: THU HOI MA MOI ---" -ForegroundColor Green
            Write-Host ""

            $invites = Fetch-InvitesList
            if ($invites.Count -eq 0) {
                Write-Host "Chua co ma moi nao trong he thong." -ForegroundColor Yellow
                Read-Host "Nhan Enter de quay lai menu..."
                continue
            }

            Display-InvitesList -Invites $invites

            $idxInput = Read-Host "Chon STT ma can thu hoi (1-$($invites.Count))"
            $parsedIdx = 0
            if (-not [int]::TryParse($idxInput, [ref]$parsedIdx) -or $parsedIdx -lt 1 -or $parsedIdx -gt $invites.Count) {
                Write-Host "[LOI] STT khong hop le!" -ForegroundColor Red
                Read-Host "Nhan Enter de quay lai menu..."
                continue
            }

            $targetInv = $invites[$parsedIdx - 1]
            Write-Host ""
            Write-Host "Ma duoc chon:" -ForegroundColor Yellow
            Write-Host "  Label: $($targetInv.label)" -ForegroundColor White
            Write-Host "  UUID:  $($targetInv.id)" -ForegroundColor White
            Write-Host ""

            $confirm = Read-Host "Xac nhan THU HOI ma nay? (Y/N)"
            if ($confirm.Trim().ToUpper() -eq "Y") {
                $res = Invoke-ActivationAdminRequest -ActionName "revokeInvite" -BodyParams @{ inviteId = $targetInv.id }
                if ($res -and $res.ok) {
                    Write-Host ""
                    Write-Host "[THANH CONG] Da thu hoi ma moi thanh cong!" -ForegroundColor Green
                    Write-Host "LUU Y: Thiet bi co lease hop le co the tiep tuc offline cho toi khi phai xac minh lai." -ForegroundColor Yellow
                } else {
                    Write-Host "[LOI] Khong the thu hoi ma moi!" -ForegroundColor Red
                }
            } else {
                Write-Host "Da huy thao tac thu hoi." -ForegroundColor Yellow
            }

            Write-Host ""
            Read-Host "Nhan Enter de quay lai menu..."
        }
        "4" {
            Show-Header
            Write-Host "--- CHUC NANG 4: XEM THIET BI CUA MA ---" -ForegroundColor Green
            Write-Host ""

            $invites = Fetch-InvitesList
            if ($invites.Count -eq 0) {
                Write-Host "Chua co ma moi nao trong he thong." -ForegroundColor Yellow
                Read-Host "Nhan Enter de quay lai menu..."
                continue
            }

            Display-InvitesList -Invites $invites

            $idxInput = Read-Host "Chon STT ma can xem thiet bi (1-$($invites.Count))"
            $parsedIdx = 0
            if (-not [int]::TryParse($idxInput, [ref]$parsedIdx) -or $parsedIdx -lt 1 -or $parsedIdx -gt $invites.Count) {
                Write-Host "[LOI] STT khong hop le!" -ForegroundColor Red
                Read-Host "Nhan Enter de quay lai menu..."
                continue
            }

            $targetInv = $invites[$parsedIdx - 1]
            Write-Host ""
            Write-Host "Danh sach thiet bi cua ma '$($targetInv.label)':" -ForegroundColor Yellow

            $devRes = Invoke-ActivationAdminRequest -ActionName "listDevices" -BodyParams @{ inviteId = $targetInv.id }
            if ($devRes -and $devRes.ok -and ($devRes.PSObject.Properties.Match('devices').Count -gt 0)) {
                $devices = @($devRes.devices)
                if ($devices.Count -eq 0) {
                    Write-Host "Chua co thiet bi nao kich hoat tu ma nay." -ForegroundColor Yellow
                } else {
                    for ($j = 0; $j -lt $devices.Count; $j++) {
                        $dev = $devices[$j]
                        $lastVer = if ($dev.lastVerifiedAt) { $dev.lastVerifiedAt } else { "Chua xac minh" }
                        $revAt = if ($dev.revokedAt) { $dev.revokedAt } else { "Chua thu hoi" }
                        Write-Host "[$($j + 1)] Status: $($dev.status)" -ForegroundColor Yellow
                        Write-Host "    ActivatedAt: $($dev.activatedAt)" -ForegroundColor White
                        Write-Host "    LastVerifiedAt: $lastVer" -ForegroundColor White
                        Write-Host "    RevokedAt: $revAt" -ForegroundColor White
                        Write-Host "    Activation UUID: $($dev.id)" -ForegroundColor DarkGray
                        Write-Host ""
                    }
                }
            } else {
                Write-Host "[LOI] Khong the tai danh sach thiet bi!" -ForegroundColor Red
            }

            Read-Host "Nhan Enter de quay lai menu..."
        }
        "5" {
            Show-Header
            Write-Host "--- CHUC NANG 5: THU HOI THIET BI ---" -ForegroundColor Green
            Write-Host ""

            $invites = Fetch-InvitesList
            if ($invites.Count -eq 0) {
                Write-Host "Chua co ma moi nao trong he thong." -ForegroundColor Yellow
                Read-Host "Nhan Enter de quay lai menu..."
                continue
            }

            Display-InvitesList -Invites $invites

            $idxInput = Read-Host "Chon STT ma de thu hoi thiet bi (1-$($invites.Count))"
            $parsedIdx = 0
            if (-not [int]::TryParse($idxInput, [ref]$parsedIdx) -or $parsedIdx -lt 1 -or $parsedIdx -gt $invites.Count) {
                Write-Host "[LOI] STT khong hop le!" -ForegroundColor Red
                Read-Host "Nhan Enter de quay lai menu..."
                continue
            }

            $targetInv = $invites[$parsedIdx - 1]
            $devRes = Invoke-ActivationAdminRequest -ActionName "listDevices" -BodyParams @{ inviteId = $targetInv.id }

            if (-not $devRes -or -not $devRes.ok -or ($devRes.PSObject.Properties.Match('devices').Count -eq 0)) {
                Write-Host "[LOI] Khong the tai danh sach thiet bi!" -ForegroundColor Red
                Read-Host "Nhan Enter de quay lai menu..."
                continue
            }

            $allDevices = @($devRes.devices)
            $activeDevices = @($allDevices | Where-Object { $_.status -eq "ACTIVE" })
            if ($activeDevices.Count -eq 0) {
                Write-Host "Khong co thiet bi ACTIVE nao de thu hoi cho ma '$($targetInv.label)'." -ForegroundColor Yellow
                Read-Host "Nhan Enter de quay lai menu..."
                continue
            }

            Write-Host ""
            Write-Host "Danh sach thiet bi ACTIVE:" -ForegroundColor Yellow
            for ($k = 0; $k -lt $activeDevices.Count; $k++) {
                $d = $activeDevices[$k]
                Write-Host "[$($k + 1)] Activation UUID: $($d.id)" -ForegroundColor Yellow
                Write-Host "    ActivatedAt: $($d.activatedAt)" -ForegroundColor White
                Write-Host ""
            }

            $devIdxInput = Read-Host "Chon STT thiet bi can thu hoi (1-$($activeDevices.Count))"
            $parsedDevIdx = 0
            if (-not [int]::TryParse($devIdxInput, [ref]$parsedDevIdx) -or $parsedDevIdx -lt 1 -or $parsedDevIdx -gt $activeDevices.Count) {
                Write-Host "[LOI] STT thiet bi khong hop le!" -ForegroundColor Red
                Read-Host "Nhan Enter de quay lai menu..."
                continue
            }

            $targetDev = $activeDevices[$parsedDevIdx - 1]
            Write-Host ""
            Write-Host "Thiet bi duoc chon:" -ForegroundColor Yellow
            Write-Host "  Activation UUID: $($targetDev.id)" -ForegroundColor White
            Write-Host ""

            $confirm = Read-Host "Xac nhan THU HOI thiet bi nay? (Y/N)"
            if ($confirm.Trim().ToUpper() -eq "Y") {
                $revRes = Invoke-ActivationAdminRequest -ActionName "revokeDevice" -BodyParams @{ activationId = $targetDev.id }
                if ($revRes -and $revRes.ok) {
                    Write-Host ""
                    Write-Host "[THANH CONG] Da thu hoi thiet bi thanh cong!" -ForegroundColor Green
                    Write-Host "LUU Y: Thiet bi co the tiep tuc offline trong thoi gian lease hien tai. Lan xac minh online tiep theo se bi chan." -ForegroundColor Yellow
                } else {
                    Write-Host "[LOI] Khong the thu hoi thiet bi!" -ForegroundColor Red
                }
            } else {
                Write-Host "Da huy thao tac thu hoi thiet bi." -ForegroundColor Yellow
            }

            Write-Host ""
            Read-Host "Nhan Enter de quay lai menu..."
        }
        "0" {
            if ($secureAdminToken -ne $null) {
                $secureAdminToken.Dispose()
            }
            Remove-Variable secureAdminToken -ErrorAction SilentlyContinue
            Write-Host "Cam on ban da su dung cong cu!" -ForegroundColor Green
            exit 0
        }
        default {
            Write-Host "[LOI] Lua chon khong hop le! Vui long chon tu 0 den 5." -ForegroundColor Red
            Start-Sleep -Seconds 1
        }
    }
}
