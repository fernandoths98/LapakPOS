import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  createBottomTabNavigator,
  BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { NavigatorScreenParams } from '@react-navigation/native';
import {
  ChartNoAxesColumnIncreasing,
  House,
  PackageOpen,
  ReceiptText,
  ShoppingCart,
  type LucideIcon,
} from 'lucide-react-native';
import type { UserRole } from '@lapak/shared';
import { Text } from '../theme/Text';
import { colors, shadow } from '../theme/tokens';
import { useAuthStore } from '../state/auth/authStore';
import { Walkthrough } from '../components/Walkthrough';
import { HomeStack, HomeStackParamList } from './stacks/HomeStack';
import { SellStack } from './stacks/SellStack';
import { BillsStack, BillsStackParamList } from './stacks/BillsStack';
import { StockStack, StockStackParamList } from './stacks/StockStack';
import { RecapStack, RecapStackParamList } from './stacks/RecapStack';

/**
 * Each tab's param list is typed as `NavigatorScreenParams<...>` (not plain
 * `undefined`) so a screen in one tab's stack can cross-navigate into a
 * specific screen of another tab — e.g. Home's shortcuts jumping straight to
 * Stock's `Sheet` route — via `navigation.navigate("StockTab", { screen:
 * "Sheet" })` and have it typecheck.
 */
export type MainTabsParamList = {
  HomeTab: NavigatorScreenParams<HomeStackParamList>;
  SellTab: undefined;
  BillsTab: NavigatorScreenParams<BillsStackParamList>;
  StockTab: NavigatorScreenParams<StockStackParamList>;
  RecapTab: NavigatorScreenParams<RecapStackParamList>;
};

const Tab = createBottomTabNavigator<MainTabsParamList>();

const TAB_LABELS: Record<keyof MainTabsParamList, string> = {
  HomeTab: 'Beranda',
  SellTab: 'Jualan',
  BillsTab: 'Tagihan',
  StockTab: 'Stok',
  RecapTab: 'Laporan',
};

const TAB_ICONS: Record<keyof MainTabsParamList, LucideIcon> = {
  HomeTab: House,
  SellTab: ShoppingCart,
  BillsTab: ReceiptText,
  StockTab: PackageOpen,
  RecapTab: ChartNoAxesColumnIncreasing,
};

/** Which tabs each role sees. Owner/manager get everything. */
const TABS_BY_ROLE: Record<UserRole, Array<keyof MainTabsParamList>> = {
  owner: ['HomeTab', 'SellTab', 'BillsTab', 'StockTab', 'RecapTab'],
  manager: ['HomeTab', 'SellTab', 'BillsTab', 'StockTab', 'RecapTab'],
  cashier: ['HomeTab', 'SellTab', 'BillsTab'],
  stocker: ['HomeTab', 'StockTab'],
};

/**
 * Custom tab bar: the active tab gets a soft tinted pill behind its icon and
 * a brand-coloured label, so the current place is obvious at a glance.
 */
function TabBar({ state, navigation }: BottomTabBarProps) {
  return (
    <View style={styles.tabBar}>
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const label =
          TAB_LABELS[route.name as keyof MainTabsParamList] ?? route.name;
        const Icon = TAB_ICONS[route.name as keyof MainTabsParamList] ?? House;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            onPress={onPress}
            style={styles.tabItem}
          >
            <View style={[styles.iconPill, { backgroundColor: isFocused ? colors.accent100 : colors.surface }]}>
              <Icon size={24} strokeWidth={isFocused ? 2.4 : 1.9} color={isFocused ? colors.actionFill : colors.neutral500} />
            </View>
            <Text
              variant="caption"
              style={[styles.label, isFocused && styles.labelActive]}
              color={isFocused ? colors.actionFill : colors.neutral600}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * `tabBar` is a render *function* that react-navigation invokes as
 * `tabBar(props)`, not a component it renders. Passing `TabBar` straight
 * through would therefore call it like a plain function, running its hooks
 * (`useSafeAreaInsets`) outside any component render — React throws
 * "Invalid hook call". Wrapping it in an element gives it a real component
 * instance of its own; defined at module scope so the callback identity is
 * stable across renders.
 */
const renderTabBar = (props: BottomTabBarProps) => <TabBar {...props} />;

const TAB_COMPONENTS: Record<keyof MainTabsParamList, React.ComponentType> = {
  HomeTab: HomeStack,
  SellTab: SellStack,
  BillsTab: BillsStack,
  StockTab: StockStack,
  RecapTab: RecapStack,
};

export function MainTabs() {
  const role = useAuthStore((s) => s.user?.role) ?? 'owner';
  const visibleTabs = TABS_BY_ROLE[role] ?? TABS_BY_ROLE.owner;
  return (
    <>
      <Tab.Navigator screenOptions={{ headerShown: false }} tabBar={renderTabBar}>
        {visibleTabs.map((name) => (
          <Tab.Screen key={name} name={name} component={TAB_COMPONENTS[name]} />
        ))}
      </Tab.Navigator>
      <Walkthrough />
    </>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 0,
    ...shadow.md,
    shadowOffset: { width: 0, height: -2 },
    backgroundColor: colors.surface,
    paddingHorizontal: 2,
  },
  tabItem: {
    flex: 1,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingTop: 7,
    paddingBottom: 5,
  },
  // The pill always has a fill (surface when idle) and clips to its radius:
  // on Android, toggling a background onto a rounded view after first render
  // can repaint it as a plain rectangle.
  iconPill: { width: 60, height: 34, borderRadius: 17, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  label: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '500',
  },
  labelActive: { fontWeight: '700' },
});
