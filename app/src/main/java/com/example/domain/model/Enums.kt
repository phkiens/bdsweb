package com.example.domain.model

enum class CustomerRole(val value: String) {
    BUYER("BUYER"),
    OWNER("OWNER");

    companion object {
        fun fromValue(value: String?): CustomerRole {
            return values().find { it.value.equals(value, ignoreCase = true) } ?: BUYER
        }
    }
}

enum class CustomerStatus(val value: String) {
    ACTIVE("ACTIVE"),
    CLOSED("CLOSED");

    companion object {
        fun fromValue(value: String?): CustomerStatus {
            return values().find { it.value.equals(value, ignoreCase = true) } ?: ACTIVE
        }
    }
}

enum class PropertyStatus(val value: String) {
    FOR_SALE("Đang bán"),
    SOLD("Đã bán"),
    PENDING_SURVEY("Chờ khảo sát");

    companion object {
        fun fromValue(value: String?): PropertyStatus {
            return values().find { it.value.equals(value, ignoreCase = true) } ?: FOR_SALE
        }
    }
}

val Customer.customerRole: CustomerRole
    get() = CustomerRole.fromValue(role)

val Customer.customerStatus: CustomerStatus
    get() = CustomerStatus.fromValue(status)

val Property.propertyStatus: PropertyStatus
    get() = PropertyStatus.fromValue(status)

val UnverifiedProperty.propertyStatus: PropertyStatus
    get() = PropertyStatus.fromValue(status)

enum class LinkRole(val value: String) {
    OWNER("OWNER"),
    VIEWER("VIEWER");
    companion object {
        fun fromValue(value: String?): LinkRole =
            values().find { it.value.equals(value, ignoreCase = true) } ?: VIEWER
    }
}

