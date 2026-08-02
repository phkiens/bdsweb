[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Label,

    [int]$MaxActivations = 1,

    [int]$ExpiresInDays = 7,

    [switch]$CopyCode,

    [switch]$PassThru
)

# Validate Label
if ([string]::IsNullOrWhiteSpace($Label)) {
    throw "Label invalid: Label cannot be empty."
}
if ($Label.Length -gt 64) {
    throw "Label invalid: Label exceeds 64 characters."
}

# Validate MaxActivations
if ($MaxActivations -lt 1 -or $MaxActivations -gt 100) {
    throw "MaxActivations must be between 1 and 100."
}

# Validate ExpiresInDays
if ($ExpiresInDays -lt 1 -or $ExpiresInDays -gt 365) {
    throw "ExpiresInDays must be between 1 and 365."
}

# Alphabet without easily confused characters (O, 0, I, 1)
$alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".ToCharArray()

function Get-RandomChar {
    $bytes = New-Object byte[] 1
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        do {
            $rng.GetBytes($bytes)
            $val = $bytes[0]
        } while ($val -ge 224) # 32 * 7 = 224 for uniform distribution
        return $alphabet[$val % 32]
    } finally {
        $rng.Dispose()
    }
}

function Generate-Group {
    $chars = @()
    for ($i = 0; $i -lt 4; $i++) {
        $chars += Get-RandomChar
    }
    return -join $chars
}

$group1 = Generate-Group
$group2 = Generate-Group
$group3 = Generate-Group

$code = "BDS-$group1-$group2-$group3"

# Calculate SHA-256 hash (UTF-8) -> 64 hex lowercase chars
$sha256 = [System.Security.Cryptography.SHA256]::Create()
try {
    $codeBytes = [System.Text.Encoding]::UTF8.GetBytes($code)
    $hashBytes = $sha256.ComputeHash($codeBytes)
    $codeHash = ([System.BitConverter]::ToString($hashBytes)).Replace("-", "").ToLower()
} finally {
    $sha256.Dispose()
}

# Escape single quotes in label for SQL safety
$escapedLabel = $Label.Replace("'", "''")

$sqlStatement = @"
insert into public.app_invite_codes (code_hash, label, max_activations, expires_at, is_active)
values (
  '$codeHash',
  '$escapedLabel',
  $MaxActivations,
  now() + interval '$ExpiresInDays days',
  true
)
returning id, label, max_activations, expires_at, is_active;
"@

# Copy code to clipboard only if -CopyCode switch is passed
if ($CopyCode) {
    Set-Clipboard -Value $code
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "MA MOI KICH HOAT VA CAU SQL INSERT" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Ma moi cua ban (CANH BAO: CHI HIEN THI LAN NAY!):" -ForegroundColor Yellow
Write-Host "   $code" -ForegroundColor Green
Write-Host "------------------------------------------------------------"
Write-Host "Cau lenh SQL INSERT (dan vao Supabase SQL Editor):" -ForegroundColor Yellow
Write-Host ""
Write-Host $sqlStatement -ForegroundColor White
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
if ($CopyCode) {
    Write-Host "[THONG BAO] Da chep ma '$code' vao clipboard." -ForegroundColor Green
}

if ($PassThru) {
    return [PSCustomObject]@{
        Code     = $code
        CodeHash = $codeHash
        Sql      = $sqlStatement
    }
}
