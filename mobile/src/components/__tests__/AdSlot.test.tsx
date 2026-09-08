import React from "react";
import ReactTestRenderer from "react-test-renderer";
import { AdSlot } from "../AdSlot";
import { useShowsAds } from "../../state/api/plan";

jest.mock("../../state/api/plan", () => ({ useShowsAds: jest.fn() }));

const mockUseShowsAds = useShowsAds as jest.MockedFunction<typeof useShowsAds>;

async function renderSlot() {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<AdSlot placement="home" />);
  });
  return tree;
}

describe("AdSlot", () => {
  afterEach(() => jest.resetAllMocks());

  it("renders nothing at all for a paying merchant — not an empty box holding layout space", async () => {
    mockUseShowsAds.mockReturnValue(false);
    const tree = await renderSlot();
    expect(tree.toJSON()).toBeNull();
  });

  it("renders the promo on the free plan", async () => {
    mockUseShowsAds.mockReturnValue(true);
    const tree = await renderSlot();
    expect(tree.root.findAllByProps({ testID: "ad-slot-home" }).length).toBeGreaterThan(0);
  });

  it("shows nothing while the plan is unknown, so a Pro merchant never flashes an ad", async () => {
    // useShowsAds already defaults to false on a loading/failed plan query;
    // this pins that the component trusts it rather than defaulting to shown.
    mockUseShowsAds.mockReturnValue(false);
    const tree = await renderSlot();
    expect(tree.toJSON()).toBeNull();
  });
});
