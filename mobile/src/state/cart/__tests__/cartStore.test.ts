import { cartCount, cartTotal, useCartStore } from "../cartStore";

const PRODUCT_A = { id: "a", name: "Es Kopi Susu Gula Aren", sellPrice: 18000 };
const PRODUCT_B = { id: "b", name: "Teh Botol 450ml", sellPrice: 6000 };

describe("cartStore", () => {
  beforeEach(() => {
    useCartStore.setState({ lines: {} });
  });

  it("adds a new product as a qty-1 line", () => {
    useCartStore.getState().addItem(PRODUCT_A);
    expect(useCartStore.getState().lines.a).toEqual({
      productId: "a",
      name: "Es Kopi Susu Gula Aren",
      unitPrice: 18000,
      qty: 1,
    });
  });

  it("increments qty when the same product is added again, matching the prototype's add()", () => {
    useCartStore.getState().addItem(PRODUCT_A);
    useCartStore.getState().addItem(PRODUCT_A);
    expect(useCartStore.getState().lines.a.qty).toBe(2);
  });

  it("bump increases and decreases qty", () => {
    useCartStore.getState().addItem(PRODUCT_A);
    useCartStore.getState().bump("a", 1);
    expect(useCartStore.getState().lines.a.qty).toBe(2);
    useCartStore.getState().bump("a", -1);
    expect(useCartStore.getState().lines.a.qty).toBe(1);
  });

  it("removes the line once qty reaches 0, matching the prototype's bump()", () => {
    useCartStore.getState().addItem(PRODUCT_A);
    useCartStore.getState().bump("a", -1);
    expect(useCartStore.getState().lines.a).toBeUndefined();
  });

  it("is a no-op bumping a product that isn't in the cart", () => {
    useCartStore.getState().bump("nonexistent", 1);
    expect(useCartStore.getState().lines).toEqual({});
  });

  it("clear empties the cart", () => {
    useCartStore.getState().addItem(PRODUCT_A);
    useCartStore.getState().addItem(PRODUCT_B);
    useCartStore.getState().clear();
    expect(useCartStore.getState().lines).toEqual({});
  });

  it("cartTotal and cartCount derive from every line", () => {
    useCartStore.getState().addItem(PRODUCT_A);
    useCartStore.getState().addItem(PRODUCT_A);
    useCartStore.getState().addItem(PRODUCT_B);
    const { lines } = useCartStore.getState();
    expect(cartTotal(lines)).toBe(18000 * 2 + 6000);
    expect(cartCount(lines)).toBe(3);
  });
});
