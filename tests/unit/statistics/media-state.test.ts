import { describe, it, expect } from "vitest";
import { createDefaultProperty, Property } from "../../../src/core/models/property";
import {
  evaluateMediaState,
  HasR2Media,
  HasLocalMedia,
  CanonicalZeroMedia,
  NoMediaReference,
} from "../../../src/core/statistics/media-state";

describe("MediaStateTest", () => {
  function baseProperty(partial?: Partial<Property>): Property {
    return createDefaultProperty({
      id: "prop-test",
      area: "Lê Chân",
      latitude: 20.85,
      longitude: 106.68,
      areaSize: 60.0,
      price: 3.0,
      description: "Test property",
      propertyType: "Nhà phố",
      ...partial
    });
  }

  it("testR2PrecedenceOverDriveAndLocal", () => {
    const r2Json = JSON.stringify([
      {
        objectKey: "properties/p1/img1.jpg",
        fileName: "img1.jpg",
        contentType: "image/jpeg",
        sortOrder: 0
      }
    ]);
    const driveJson = JSON.stringify({ photo1: "drive-file-id-123" });
    const localPath = "/storage/emulated/0/DCIM/pic1.jpg";

    const property = baseProperty({
      r2MediaKeys: r2Json,
      driveMediaIds: driveJson,
      imagePath: localPath
    });

    const state = evaluateMediaState(property);
    expect(state).toBeInstanceOf(HasR2Media);
    expect((state as HasR2Media).count).toBe(1);
  });

  it("testR2CanonicalZeroMediaNeverFallsBackToDrive", () => {
    const emptyR2Array = "[]";
    const driveJson = JSON.stringify({ photo1: "drive-file-id-123" });
    const localPath = "/storage/emulated/0/DCIM/pic1.jpg";

    const property = baseProperty({
      r2MediaKeys: emptyR2Array,
      driveMediaIds: driveJson,
      imagePath: localPath
    });

    const state = evaluateMediaState(property);
    expect(state).toBe(CanonicalZeroMedia);
  });

  it("testR2BlankOrNullStringTreatedAsCanonicalZero", () => {
    const propBlank = baseProperty({
      r2MediaKeys: "   ",
      driveMediaIds: JSON.stringify({ photo1: "drive-id" })
    });
    const propNullStr = baseProperty({
      r2MediaKeys: "null",
      driveMediaIds: JSON.stringify({ photo1: "drive-id" })
    });
    const propEmptyObj = baseProperty({
      r2MediaKeys: "{}",
      driveMediaIds: JSON.stringify({ photo1: "drive-id" })
    });

    expect(evaluateMediaState(propBlank)).toBe(CanonicalZeroMedia);
    expect(evaluateMediaState(propNullStr)).toBe(CanonicalZeroMedia);
    expect(evaluateMediaState(propEmptyObj)).toBe(CanonicalZeroMedia);
  });

  it("testDriveOnlyWithoutR2OrLocalYieldsNoMediaReference", () => {
    const driveJson = JSON.stringify({ photo1: "drive-file-id-123" });
    const property = baseProperty({
      r2MediaKeys: null,
      driveMediaIds: driveJson,
      imagePath: null
    });
    expect(evaluateMediaState(property)).toBe(NoMediaReference);
  });

  it("testDriveWithLocalImagePathYieldsHasLocalMedia", () => {
    const driveJson = JSON.stringify({ photo1: "drive-file-id-123" });
    const localPath = "/storage/emulated/0/DCIM/pic1.jpg";

    const property = baseProperty({
      r2MediaKeys: null,
      driveMediaIds: driveJson,
      imagePath: localPath
    });

    const state = evaluateMediaState(property);
    expect(state).toBe(HasLocalMedia);
  });

  it("testLocalMediaDelimitedByPipes", () => {
    const single = baseProperty({ imagePath: "/data/user/0/img1.jpg" });
    expect(evaluateMediaState(single)).toBe(HasLocalMedia);

    const multi = baseProperty({
      imagePath: "/data/user/0/img1.jpg ||| /data/user/0/img2.jpg ||| "
    });
    expect(evaluateMediaState(multi)).toBe(HasLocalMedia);
  });

  it("testNoMediaReferenceWhenAllEmptyOrSentinel", () => {
    const propAllNull = baseProperty({
      r2MediaKeys: null,
      driveMediaIds: null,
      imagePath: null
    });
    expect(evaluateMediaState(propAllNull)).toBe(NoMediaReference);

    const propBlankStrings = baseProperty({
      r2MediaKeys: null,
      driveMediaIds: "  ",
      imagePath: "   ||| null "
    });
    expect(evaluateMediaState(propBlankStrings)).toBe(NoMediaReference);
  });
});
