package com.example.ui.common

import android.content.Context
import android.util.Log
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

object ZipHelper {
    private const val TAG = "ZipHelper"

    data class ImportResult(
        val propertiesJson: String?,
        val unverifiedJson: String?,
        val customersJson: String?,
        val customerLinksJson: String?,
        val restoredImages: List<String>,
        val settingsJson: String? = null
    )

    fun exportToZip(
        context: Context,
        propertiesJson: String,
        unverifiedJson: String,
        customersJson: String,
        customerLinksJson: String,
        imagePaths: List<String>,
        destZipFile: File,
        settingsJson: String? = null,
        onProgress: ((String) -> Unit)? = null
    ): Boolean {
        try {
            onProgress?.invoke("Bắt đầu khởi tạo tệp nén sao lưu...")
            ZipOutputStream(BufferedOutputStream(FileOutputStream(destZipFile))).use { zos ->
                // 1. Add Properties JSON entry
                onProgress?.invoke("Đang nén dữ liệu Bất động sản...")
                zos.putNextEntry(ZipEntry("properties.json"))
                zos.write(propertiesJson.toByteArray(Charsets.UTF_8))
                zos.closeEntry()

                // 2. Add Unverified Properties JSON entry
                onProgress?.invoke("Đang nén tin chưa xác thực...")
                zos.putNextEntry(ZipEntry("unverified_properties.json"))
                zos.write(unverifiedJson.toByteArray(Charsets.UTF_8))
                zos.closeEntry()

                // 3. Add Customers JSON entry
                onProgress?.invoke("Đang nén thông tin Khách hàng...")
                zos.putNextEntry(ZipEntry("customers.json"))
                zos.write(customersJson.toByteArray(Charsets.UTF_8))
                zos.closeEntry()

                // 4. Add Customer Property Links JSON entry
                onProgress?.invoke("Đang nén dữ liệu liên kết...")
                zos.putNextEntry(ZipEntry("customer_property_links.json"))
                zos.write(customerLinksJson.toByteArray(Charsets.UTF_8))
                zos.closeEntry()

                // Add settings.json if provided
                if (settingsJson != null) {
                    onProgress?.invoke("Đang nén cài đặt hệ thống...")
                    zos.putNextEntry(ZipEntry("settings.json"))
                    zos.write(settingsJson.toByteArray(Charsets.UTF_8))
                    zos.closeEntry()
                }

                // 5. Add images
                val imageDir = File(context.filesDir, "bds_images")
                val totalImages = imagePaths.size
                imagePaths.forEachIndexed { index, path ->
                    val file = File(path)
                    if (file.exists()) {
                        val entryName = "images/" + file.name
                        onProgress?.invoke("Đang nén hình ảnh (${index + 1}/$totalImages): ${file.name}...")
                        zos.putNextEntry(ZipEntry(entryName))
                        file.inputStream().use { input ->
                            input.copyTo(zos)
                        }
                        zos.closeEntry()
                    }
                }
            }
            AppLogger.log(TAG, "Successfully exported data and media to ${destZipFile.absolutePath}")
            return true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to export ZIP", e)
            AppLogger.log(TAG, "Export ZIP failed: ${e.localizedMessage}")
            return false
        }
    }

    fun importFromZip(
        context: Context,
        zipFile: File,
        onProgress: ((String) -> Unit)? = null
    ): ImportResult? {
        var propertiesJson: String? = null
        var unverifiedJson: String? = null
        var customersJson: String? = null
        var customerLinksJson: String? = null
        var settingsJson: String? = null
        val restoredImages = mutableListOf<String>()

        val imagesDir = File(context.filesDir, "bds_images").apply { mkdirs() }

        try {
            onProgress?.invoke("Bắt đầu đọc tệp ZIP sao lưu...")
            ZipInputStream(FileInputStream(zipFile)).use { zis ->
                var entry: ZipEntry? = zis.nextEntry
                while (entry != null) {
                    val name = entry.name
                    when {
                        name == "properties.json" || name == "data.json" -> {
                            onProgress?.invoke("Đang giải nén dữ liệu Bất động sản...")
                            propertiesJson = String(zis.readBytes(), Charsets.UTF_8)
                        }
                        name == "unverified_properties.json" -> {
                            onProgress?.invoke("Đang giải nén tin chưa xác thực...")
                            unverifiedJson = String(zis.readBytes(), Charsets.UTF_8)
                        }
                        name == "customers.json" -> {
                            onProgress?.invoke("Đang giải nén dữ liệu Khách hàng...")
                            customersJson = String(zis.readBytes(), Charsets.UTF_8)
                        }
                        name == "customer_property_links.json" -> {
                            onProgress?.invoke("Đang giải nén liên kết khách hàng...")
                            customerLinksJson = String(zis.readBytes(), Charsets.UTF_8)
                        }
                        name == "settings.json" -> {
                            onProgress?.invoke("Đang giải nén cài đặt hệ thống...")
                            settingsJson = String(zis.readBytes(), Charsets.UTF_8)
                        }
                        name.startsWith("images/") -> {
                            val fileName = name.substringAfter("images/")
                            if (fileName.isNotEmpty()) {
                                onProgress?.invoke("Đang giải nén hình ảnh: $fileName...")
                                val destFile = File(imagesDir, fileName)
                                FileOutputStream(destFile).use { fos ->
                                    zis.copyTo(fos)
                                }
                                restoredImages.add(destFile.absolutePath)
                            }
                        }
                    }
                    zis.closeEntry()
                    entry = zis.nextEntry
                }
            }
            AppLogger.log(TAG, "Successfully imported zip backup containing ${restoredImages.size} images.")
            return ImportResult(propertiesJson, unverifiedJson, customersJson, customerLinksJson, restoredImages, settingsJson)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to import ZIP", e)
            AppLogger.log(TAG, "Import ZIP failed: ${e.localizedMessage}")
            return null
        }
    }
}
