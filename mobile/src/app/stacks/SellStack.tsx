import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Sale } from "@lapak/shared";
import { SellScreen } from "../../screens/Sell/SellScreen";
import { CartScreen } from "../../screens/Sell/CartScreen";
import { PaidScreen } from "../../screens/Sell/PaidScreen";
import { stackScreenOptions } from "./stackScreenOptions";

export type SellStackParamList = {
  Sell: undefined;
  Cart: undefined;
  Paid: { sale: Sale; cashReceived?: number; change?: number };
};

const Stack = createNativeStackNavigator<SellStackParamList>();

/** Kasir → Keranjang → Selesai. */
export function SellStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="Sell" component={SellScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Cart" component={CartScreen} options={{ title: "Keranjang", headerBackTitle: "Kasir" }} />
      <Stack.Screen name="Paid" component={PaidScreen} options={{ title: "Pembayaran berhasil", headerBackVisible: false }} />
    </Stack.Navigator>
  );
}
