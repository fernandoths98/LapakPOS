import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StockScreen } from "../../screens/Stock/StockScreen";
import { ProductScreen } from "../../screens/Stock/ProductScreen";
import { SheetScreen } from "../../screens/Stock/SheetScreen";
import { OutletInventoryScreen } from "../../screens/Stock/OutletInventoryScreen";
import { stackScreenOptions } from "./stackScreenOptions";

export type StockStackParamList = {
  Stock: undefined;
  /** Absent params (`undefined`) means "add"; `{ productId }` means "edit". */
  Product: { productId: string } | undefined;
  /** Excel import (spreadsheet → catalog) and export (sales ledger / stock valuation). */
  Sheet: undefined;
  /** Per-outlet stock / price override / availability for the active outlet. */
  OutletInventory: undefined;
};

const Stack = createNativeStackNavigator<StockStackParamList>();

/** Stock (catalog + stat strip) → Product (add/edit) and → Sheet (Excel import/export). */
export function StockStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="Stock" component={StockScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="Product"
        component={ProductScreen}
        options={{ title: "Product", headerBackTitle: "Stock" }}
      />
      <Stack.Screen name="Sheet" component={SheetScreen} options={{ title: "Excel", headerBackTitle: "Stock" }} />
      <Stack.Screen name="OutletInventory" component={OutletInventoryScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
