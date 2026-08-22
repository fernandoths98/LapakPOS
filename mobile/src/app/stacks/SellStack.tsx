import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Sale } from "@lapak/shared";
import { SellScreen } from "../../screens/Sell/SellScreen";
import { CartScreen } from "../../screens/Sell/CartScreen";
import { PaidScreen } from "../../screens/Sell/PaidScreen";
import { SalesHistoryScreen } from "../../screens/Sell/SalesHistoryScreen";
import { SaleDetailScreen } from "../../screens/Sell/SaleDetailScreen";
import { stackScreenOptions } from "./stackScreenOptions";

export type SellStackParamList = {
  Sell: undefined;
  Cart: undefined;
  Paid: { sale: Sale; cashReceived?: number; change?: number };
  SalesHistory: undefined;
  SaleDetail: { saleId: string };
};

const Stack = createNativeStackNavigator<SellStackParamList>();

/** Kasir → Keranjang → Selesai. */
export function SellStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="Sell" component={SellScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Cart" component={CartScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Paid" component={PaidScreen} options={{ title: "Pembayaran berhasil", headerBackVisible: false }} />
      <Stack.Screen name="SalesHistory" component={SalesHistoryScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SaleDetail" component={SaleDetailScreen} options={{ title: "Detail transaksi" }} />
    </Stack.Navigator>
  );
}
