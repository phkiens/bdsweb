package com.example

import com.example.data.remote.supabase.MediaReconciler
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MediaReconcilerTest {

    @Test
    fun testReconcile_RemoteDeletedPhoto() {
        val currentImagePath = "/path/to/img1.jpg|||/path/to/img2.jpg"
        val localDriveMediaIds = """{"/path/to/img1.jpg":"drive_id_1","/path/to/img2.jpg":"drive_id_2"}"""
        // Remote driveMediaIds does not contain drive_id_1 (meaning img1 was deleted from remote)
        val remoteDriveMediaIds = """{"/path/to/img2.jpg":"drive_id_2"}"""

        val result = MediaReconciler.reconcile(
            currentImagePath = currentImagePath,
            localDriveMediaIdsStr = localDriveMediaIds,
            remoteDriveMediaIdsStr = remoteDriveMediaIds
        )

        assertEquals(listOf("/path/to/img1.jpg"), result.pathsToDelete)
        assertEquals("/path/to/img2.jpg", result.newImagePath)
    }

    @Test
    fun testReconcile_LocalUnsyncedPhotoKept() {
        // img_new is taken locally on B but not synced yet (no drive ID in localDriveMediaIds)
        val currentImagePath = "/path/to/img1.jpg|||/path/to/img_new.jpg"
        val localDriveMediaIds = """{"/path/to/img1.jpg":"drive_id_1"}"""
        val remoteDriveMediaIds = """{"/path/to/img1.jpg":"drive_id_1"}"""

        val result = MediaReconciler.reconcile(
            currentImagePath = currentImagePath,
            localDriveMediaIdsStr = localDriveMediaIds,
            remoteDriveMediaIdsStr = remoteDriveMediaIds
        )

        assertTrue(result.pathsToDelete.isEmpty())
        assertEquals("/path/to/img1.jpg|||/path/to/img_new.jpg", result.newImagePath)
    }

    @Test
    fun testReconcile_NormalPhotosPreserved() {
        val currentImagePath = "/path/to/img1.jpg|||/path/to/img2.jpg"
        val localDriveMediaIds = """{"/path/to/img1.jpg":"drive_id_1","/path/to/img2.jpg":"drive_id_2"}"""
        val remoteDriveMediaIds = """{"/path/to/img1.jpg":"drive_id_1","/path/to/img2.jpg":"drive_id_2"}"""

        val result = MediaReconciler.reconcile(
            currentImagePath = currentImagePath,
            localDriveMediaIdsStr = localDriveMediaIds,
            remoteDriveMediaIdsStr = remoteDriveMediaIds
        )

        assertTrue(result.pathsToDelete.isEmpty())
        assertEquals("/path/to/img1.jpg|||/path/to/img2.jpg", result.newImagePath)
    }

    @Test
    fun testReconcile_RemoteAllDeleted() {
        val currentImagePath = "/path/to/img1.jpg"
        val localDriveMediaIds = """{"/path/to/img1.jpg":"drive_id_1"}"""
        val remoteDriveMediaIds = "{}" // Intentionally empty JSON from remote

        val result = MediaReconciler.reconcile(
            currentImagePath = currentImagePath,
            localDriveMediaIdsStr = localDriveMediaIds,
            remoteDriveMediaIdsStr = remoteDriveMediaIds
        )

        assertEquals(listOf("/path/to/img1.jpg"), result.pathsToDelete)
        assertNull(result.newImagePath)
    }

    @Test
    fun testRebuildImagePathAfterDownload_UnionAndExistence() {
        val currentImagePath = "/path/to/img1.jpg|||/path/to/img_new.jpg"
        // img2 was downloaded. img3 is in driveMediaIds but does not exist on disk yet.
        val driveMediaIds = """{"/path/to/img1.jpg":"drive_id_1","/path/to/img2.jpg":"drive_id_2","/path/to/img3.jpg":"drive_id_3"}"""

        val fakeFileSystem = setOf("/path/to/img1.jpg", "/path/to/img2.jpg", "/path/to/img_new.jpg")
        val fileCheck: (String) -> Boolean = { fakeFileSystem.contains(it) }

        val result = MediaReconciler.rebuildImagePathAfterDownload(
            currentImagePath = currentImagePath,
            driveMediaIdsStr = driveMediaIds,
            fileExistsCheck = fileCheck
        )

        // Must include:
        // - img1 and img2 (in driveMediaIds and exist on disk)
        // - img_new (in currentImagePath, not in driveMediaIds, and exists on disk)
        // Must exclude:
        // - img3 (in driveMediaIds but doesn't exist on disk)
        val expected = "/path/to/img1.jpg|||/path/to/img2.jpg|||/path/to/img_new.jpg"
        assertEquals(expected, result)
    }

    @Test
    fun testReconcileWithDriveMediaIdsToUse_RemoteAllDeleted() {
        val existingDriveMediaIds = """{"/path/to/img1.jpg":"drive_id_1"}"""
        val existingImagePath = "/path/to/img1.jpg"

        // Simulated remote update
        val remoteDriveMediaIds = "{}" // Remote deleted all photos

        // Mimic RealtimeSyncManager logic
        val driveMediaIdsToUse = if ((remoteDriveMediaIds.isNullOrEmpty() || remoteDriveMediaIds == "null") &&
            remoteDriveMediaIds != "{}" &&
            !existingDriveMediaIds.isNullOrEmpty() && existingDriveMediaIds != "null" && existingDriveMediaIds != "{}"
        ) {
            existingDriveMediaIds
        } else {
            remoteDriveMediaIds
        }

        // Run reconcile
        val result = MediaReconciler.reconcile(
            currentImagePath = existingImagePath,
            localDriveMediaIdsStr = existingDriveMediaIds,
            remoteDriveMediaIdsStr = driveMediaIdsToUse
        )

        assertEquals(listOf("/path/to/img1.jpg"), result.pathsToDelete)
        assertNull(result.newImagePath)
    }

    @Test
    fun testReconcileWithDriveMediaIdsToUse_RemoteNullStale() {
        val existingDriveMediaIds = """{"/path/to/img1.jpg":"drive_id_1"}"""
        val existingImagePath = "/path/to/img1.jpg"

        // Simulated remote update where driveMediaIds is null (e.g. stale text sync)
        val remoteDriveMediaIds: String? = null

        // Mimic RealtimeSyncManager logic
        val driveMediaIdsToUse = if ((remoteDriveMediaIds.isNullOrEmpty() || remoteDriveMediaIds == "null") &&
            remoteDriveMediaIds != "{}" &&
            !existingDriveMediaIds.isNullOrEmpty() && existingDriveMediaIds != "null" && existingDriveMediaIds != "{}"
        ) {
            existingDriveMediaIds
        } else {
            remoteDriveMediaIds
        }

        // Run reconcile
        val result = MediaReconciler.reconcile(
            currentImagePath = existingImagePath,
            localDriveMediaIdsStr = existingDriveMediaIds,
            remoteDriveMediaIdsStr = driveMediaIdsToUse
        )

        // Should keep local photos (no deletion) because remote was null/stale
        assertTrue(result.pathsToDelete.isEmpty())
        assertEquals("/path/to/img1.jpg", result.newImagePath)
    }
}
