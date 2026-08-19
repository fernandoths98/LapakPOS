import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StockScreen } from "../../screens/Stock/StockScreen";
import { ProductScreen } from "../../screens/Stock/ProductScreen";
import { SheetScreen } from "../../screens/Stock/SheetScreen";
import { stackScreenOptions } from "./stackScreenOptions";

export type StockStackParamList = {
  Stock: undefined;
  /** Absent params (`undefined`) means "add"; `{ productId }` means "edit". */
  Product: { productId: string } | undefined;
  /** Excel import (spreadsheet → catalog) and export (sales ledger / stock valuation). */
  Sheet: undefined;
};

const Stack = createNativeStackNavigator<StockStackParamList>();

/** Stock (catalog + stat strip) → Product (add/edit) and → Sheet (Excel import/export). */
export function StockStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="Stock" component={StockScreen} options={{ title: "Stock" }} />
      <Stack.Screen
        name="Product"
        component={ProductScreen}
        options={{ title: "Product", headerBackTitle: "Stock" }}
      />
      <Stack.Screen name="Sheet" component={SheetScreen} options={{ title: "Excel", headerBackTitle: "Stock" }} />
    </Stack.Navigator>
  );
}
