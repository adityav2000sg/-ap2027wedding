import { describe, expect, it } from "vitest";

import { publicRsvpKey, publicRsvpPath, rsvpCodeFromPath } from "./rsvp-links";

const TOKEN = "b15904f14ece436e853beed6bd3394af270272521dbf";

describe("readable RSVP links", () => {
  it("combines a readable name with a private token prefix", () => {
    expect(publicRsvpPath("Afshar Sadeghi", TOKEN)).toBe(
      "/rsvp/afshar-sadeghi-b15904f14ece",
    );
  });

  it("normalises punctuation and accented names", () => {
    expect(publicRsvpKey("Álvaro & Zoë O’Brien", TOKEN)).toBe(
      "alvaro-and-zoe-obrien-b15904f14ece",
    );
  });

  it("recognises a short alias without mistaking a legacy token for one", () => {
    expect(rsvpCodeFromPath("afshar-sadeghi-b15904f14ece")).toBe("b15904f14ece");
    expect(rsvpCodeFromPath(TOKEN)).toBeNull();
  });
});
