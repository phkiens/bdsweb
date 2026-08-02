[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [Guid]$Id,

    [switch]$PassThru
)

$uuidString = $Id.ToString("D")

$sqlStatement = @"
update public.app_invite_codes
set is_active = false
where id = '$uuidString'
returning id, label, is_active;
"@

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "CAU LENH SQL THU HOI MA MOI" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Cau lenh SQL UPDATE (dan vao Supabase SQL Editor):" -ForegroundColor Yellow
Write-Host ""
Write-Host $sqlStatement -ForegroundColor White
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan

if ($PassThru) {
    return $sqlStatement
}
