package com.example.ui.common

import android.content.ActivityNotFoundException
import android.content.Intent
import android.provider.ContactsContract
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext

class ContactPickerLauncher(
    private val launchPicker: () -> Unit
) {
    fun launch() {
        launchPicker()
    }
}

@Composable
fun rememberContactPickerLauncher(
    onContactPicked: (name: String, phone: String) -> Unit
): ContactPickerLauncher {
    val context = LocalContext.current
    val activityLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == android.app.Activity.RESULT_OK) {
            val contactUri = result.data?.data
            if (contactUri != null) {
                try {
                    val projection = arrayOf(
                        ContactsContract.CommonDataKinds.Phone.NUMBER,
                        ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME
                    )
                    context.contentResolver.query(contactUri, projection, null, null, null)?.use { cursor ->
                        if (cursor.moveToFirst()) {
                            val numberIdx = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
                            val nameIdx = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
                            val number = if (numberIdx >= 0) cursor.getString(numberIdx).orEmpty() else ""
                            val name = if (nameIdx >= 0) cursor.getString(nameIdx).orEmpty() else ""
                            if (name.isNotBlank() || number.isNotBlank()) {
                                onContactPicked(name, number)
                            } else {
                                Toast.makeText(context, "Không lấy được SĐT từ danh bạ", Toast.LENGTH_SHORT).show()
                            }
                        } else {
                            Toast.makeText(context, "Không lấy được SĐT từ danh bạ", Toast.LENGTH_SHORT).show()
                        }
                    }
                } catch (e: Exception) {
                    Toast.makeText(context, "Lỗi lấy liên hệ: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    return ContactPickerLauncher {
        try {
            val intent = Intent(
                Intent.ACTION_PICK,
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI
            )
            activityLauncher.launch(intent)
        } catch (e: ActivityNotFoundException) {
            Toast.makeText(context, "Không mở được danh bạ", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Toast.makeText(context, "Lỗi mở danh bạ: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
        }
    }
}
