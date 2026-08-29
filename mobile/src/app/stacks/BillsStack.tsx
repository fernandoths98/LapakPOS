import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { BillsScreen } from "../../screens/Bills/BillsScreen";
import { BillFormScreen } from "../../screens/Bills/BillFormScreen";
import { BillSuccessScreen } from "../../screens/Bills/BillSuccessScreen";
import { PpobCategory, PpobTransaction } from "@lapak/shared";
import { stackScreenOptions } from "./stackScreenOptions";
import { WalletTopupScreen } from "../../screens/Bills/WalletTopupScreen";

export type BillsStackParamList = {
  Bills: undefined;
  /** The two-step check → charge flow for one biller. */
  BillForm: { billerId: string; billerName: string; category: PpobCategory };
  /** `fromHistory` reuses this screen as a read-only detail view opened from the recent-transactions list. */
  BillSuccess: { transaction: PpobTransaction; fromHistory?: boolean };
  WalletTopup: undefined;
};

const Stack = createNativeStackNavigator<BillsStackParamList>();

/** Bills (commission/deposit stats + biller grid + recent) → BillForm (check → charge one bill). */
export function BillsStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="Bills" component={BillsScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="BillForm"
        component={BillFormScreen}
        options={({ route }) => ({ title: route.params.billerName, headerBackTitle: "Bills" })}
      />
      <Stack.Screen name="BillSuccess" component={BillSuccessScreen} options={{ headerShown: false }} />
      <Stack.Screen name="WalletTopup" component={WalletTopupScreen} options={{ title: "Isi saldo PPOB" }} />
    </Stack.Navigator>
  );
}
