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
        var db = helper.createDatabase(TEST_DB, 23)
        db.close()

        var currentVersion = 23
        val migrations = AppDatabase.ALL_MIGRATIONS
            .filter { it.startVersion >= 23 }
            .sortedBy { it.startVersion }
        for (migration in migrations) {
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
