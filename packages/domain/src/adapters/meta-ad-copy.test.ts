import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { suggestMetaAdCopy } from "./meta-ad-copy";

describe("meta-ad-copy", () => {
  it("returns pending_configuration with template when LLM key missing", async () => {
    const result = await suggestMetaAdCopy(
      { businessOrOffer: "Condo leads", geo: "Bangalore" },
      { apiKey: null },
    );
    assert.equal(result.status, "pending_configuration");
    assert.ok(result.suggestion);
    assert.match(result.suggestion!.primaryText, /Condo leads/i);
    assert.match(result.suggestion!.creativeNotes.join(" "), /stub|Template|LLM/i);
  });

  it("returns ready structured copy from mocked provider", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  primaryText: "Live AI primary",
                  headline: "Live headline",
                  description: "Desc",
                  callToAction: "LEARN_MORE",
                  creativeNotes: ["Review before publish"],
                }),
              },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 20 },
        }),
        { status: 200 },
      );
    const result = await suggestMetaAdCopy(
      { businessOrOffer: "Condo leads", geo: "Bangalore" },
      { apiKey: "sk-test", fetchImpl },
    );
    assert.equal(result.status, "ready");
    assert.equal(result.suggestion?.primaryText, "Live AI primary");
    assert.equal(result.suggestion?.callToAction, "LEARN_MORE");
  });

  it("rejects empty offer", async () => {
    const result = await suggestMetaAdCopy({ businessOrOffer: "  " });
    assert.equal(result.status, "error");
    assert.equal(result.suggestion, null);
  });
});
