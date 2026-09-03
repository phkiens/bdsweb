import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { AppDatabase } from "../../src/data/local/db";
import { seedInitialData, SEED_PROPERTIES, SEED_CUSTOMERS, SEED_LINKS } from "../../src/data/local/seed";

describe("Database Seed Data (Deterministic Fixtures)", () => {
  it("seeds deterministic properties, customers, and links into IndexedDB", async () => {
    const testDb = new AppDatabase();

    const result = await seedInitialData(testDb);
    expect(result.propertiesCount).toBe(5);
    expect(result.customersCount).toBe(3);
    expect(result.linksCount).toBe(1);

    // Verify properties table
    const props = await testDb.properties.toArray();
    expect(props).toHaveLength(5);
    const verifiedProps = props.filter((p) => p.isVerified);
    const unverifiedProps = props.filter((p) => !p.isVerified);
    expect(verifiedProps).toHaveLength(4);
    expect(unverifiedProps).toHaveLength(1);

    // Verify customers table
    const customers = await testDb.customers.toArray();
    expect(customers).toHaveLength(3);
    const buyers = customers.filter((c) => c.role === "BUYER");
    expect(buyers).toHaveLength(2);

    // Verify links
    const links = await testDb.customer_property_links.toArray();
    expect(links).toHaveLength(1);
    expect(links[0].customerId).toBe("cust-seed-003");
    expect(links[0].propertyId).toBe("prop-seed-001");
  });
});
