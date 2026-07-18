package com.example.data.local.database

import androidx.room.testing.MigrationTestHelper
import androidx.sqlite.db.framework.FrameworkSQLiteOpenHelperFactory
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.IOException

@RunWith(AndroidJUnit4::class)
class MigrationTest {
    private val TEST_DB = "migration-test"

    @Rule
    @JvmField
    val helper: MigrationTestHelper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        AppDatabase::class.java.canonicalName,
        FrameworkSQLiteOpenHelperFactory()
    )

    @Test
    @Throws(IOException::class)
    fun testAllMigrations() {
        // Create the database at version 2 and then run all migrations sequentially
        var db = helper.createDatabase(TEST_DB, 2)
        db.close()

        var currentVersion = 2
        for (migration in AppDatabase.ALL_MIGRATIONS) {
            currentVersion++
            db = helper.runMigrationsAndValidate(
                TEST_DB,
                currentVersion,
                true,
                migration
            )
            db.close()
        }
    }
}
