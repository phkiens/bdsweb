package com.example.domain.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

@Serializable
private data class NormalizationCase(
    val id: String,
    val description: String,
    val input: String,
    val expected: String
)

@Serializable
private data class NormalizationFixtureRoot(
    val version: String,
    val contract: String,
    val name_cases: List<NormalizationCase>,
    val phone_cases: List<NormalizationCase>
)

class VietnameseNormalizationFixtureTest {

    private val json = Json {
        ignoreUnknownKeys = true
    }

    private fun loadFixture(): NormalizationFixtureRoot {
        val resourcePath = "/contracts/vietnamese-normalization.v1.json"
        val stream = checkNotNull(VietnameseNormalizationFixtureTest::class.java.getResourceAsStream(resourcePath)) {
            "Fixture file not found on classpath: $resourcePath"
        }
        val content = stream.bufferedReader(Charsets.UTF_8).use { it.readText() }
        return json.decodeFromString(NormalizationFixtureRoot.serializer(), content)
    }

    @Test
    fun testFixtureIntegrity() {
        val fixture = loadFixture()
        assertEquals("1.0", fixture.version)
        assertEquals("vietnamese-normalization", fixture.contract)
        assertTrue("Name cases must not be empty", fixture.name_cases.isNotEmpty())
        assertTrue("Phone cases must not be empty", fixture.phone_cases.isNotEmpty())

        val nameIds = fixture.name_cases.map { it.id }
        assertEquals("Name case IDs must be unique", nameIds.size, nameIds.toSet().size)

        val phoneIds = fixture.phone_cases.map { it.id }
        assertEquals("Phone case IDs must be unique", phoneIds.size, phoneIds.toSet().size)
    }

    @Test
    fun testAllNameCasesMatchCanonicalFixture() {
        val fixture = loadFixture()

        for (case in fixture.name_cases) {
            val actual = case.input.normalizeVietnamese()
            assertEquals(
                "[${case.id}] ${case.description}: normalizeVietnamese does not match canonical expected",
                case.expected,
                actual
            )
        }
    }

    @Test
    fun testAllPhoneCasesMatchCanonicalFixture() {
        val fixture = loadFixture()

        for (case in fixture.phone_cases) {
            val actual = canonicalizeVietnamesePhone(case.input)
            assertEquals(
                "[${case.id}] ${case.description}: canonicalizeVietnamesePhone does not match canonical expected",
                case.expected,
                actual
            )
        }
    }
}
