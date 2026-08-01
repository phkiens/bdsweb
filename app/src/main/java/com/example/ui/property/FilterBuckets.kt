package com.example.ui.property

data class RangeBucket(
    val label: String,
    val min: Double?,
    val max: Double?
)

object FilterBuckets {
    val PRICE_BUCKETS = listOf(
        RangeBucket("<1", null, 1.0),
        RangeBucket("1-2", 1.0, 2.0),
        RangeBucket("2-3", 2.0, 3.0),
        RangeBucket("3-4", 3.0, 4.0),
        RangeBucket("4-5", 4.0, 5.0),
        RangeBucket("5-7", 5.0, 7.0),
        RangeBucket("7-10", 7.0, 10.0),
        RangeBucket(">10", 10.0, null)
    )

    val SIZE_BUCKETS = listOf(
        RangeBucket("<30", null, 30.0),
        RangeBucket("30-50", 30.0, 50.0),
        RangeBucket("50-80", 50.0, 80.0),
        RangeBucket("80-100", 80.0, 100.0),
        RangeBucket("100-150", 100.0, 150.0),
        RangeBucket(">150", 150.0, null)
    )

    /**
     * Checks if a value falls into ANY of the selected buckets (OR logic).
     * Returns true if:
     * - selectedLabels is empty
     * - value is null (missing field rule 12.5)
     * - value matches at least one selected bucket range
     */
    fun matchesAnyBucket(
        value: Double?,
        selectedLabels: Set<String>,
        buckets: List<RangeBucket>
    ): Boolean {
        if (selectedLabels.isEmpty() || value == null) return true

        val activeBuckets = buckets.filter { it.label in selectedLabels }
        if (activeBuckets.isEmpty()) return true

        return activeBuckets.any { b ->
            val minOk = b.min == null || value >= b.min
            val maxOk = b.max == null || value <= b.max
            minOk && maxOk
        }
    }
}
