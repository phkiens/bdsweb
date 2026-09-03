# Google Drive Legacy Cleanup Note

Current decision:
- Google Drive runtime = 0.
- App hiện dùng:
  - Room = local data
  - Supabase = text/metadata + sync
  - Cloudflare R2 = property media
- Không còn Drive read/write/delete trong runtime.
- Không còn Drive UI/auth/DI runtime.

DO NOT DELETE YET:
- các class Google Drive đã deprecated/dead
- các worker/service legacy đã stub/disable
- các DB fields legacy:
  - driveMediaIds
  - driveFolderId
  - avatarDriveUrl
  - txtFileId
  - propertyDetailJsonFileId

Reason:
- giữ để tránh regression/migration rủi ro
- chưa cần cleanup code/schema ngay
- không ảnh hưởng runtime hiện tại

Cleanup chỉ được thực hiện sau khi:
1. test end-to-end 2 máy Supabase + R2 PASS
2. fresh install restore R2 PASS
3. add/edit/delete property PASS
4. manual sync + scheduled sync PASS
5. customer sync PASS
6. xác nhận không còn code runtime phụ thuộc legacy fields

Khi cleanup sau này:
- audit call graph trước
- xóa dead code theo từng nhóm
- migration DB phải non-destructive hoặc có backup
- tuyệt đối không tự ý xóa dữ liệu Google Drive thật
