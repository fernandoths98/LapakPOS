import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  createBottomTabNavigator,
  BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { NavigatorScreenParams } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../theme/Text';
import { colors } from '../theme/tokens';
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
  SellTab: 'Kasir',
  BillsTab: 'PPOB',
  StockTab: 'Stok',
  RecapTab: 'Laporan',
};

const TAB_ICONS: Record<keyof MainTabsParamList, string> = {
  HomeTab: '⌂',
  SellTab: '▣',
  BillsTab: '⌁',
  StockTab: '□',
  RecapTab: '≡',
};

/**
 * Custom tab bar matching the prototype's `tabs` render logic: a 2px
 * accent-colored bar above the label marks the active group, never a filled
 * pill or icon — color is stroke/mark only, per the design system.
 */
function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.tabBar, { paddingBottom: Math.max(10, insets.bottom) }]}
    >
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const label =
          TAB_LABELS[route.name as keyof MainTabsParamList] ?? route.name;
        const icon = TAB_ICONS[route.name as keyof MainTabsParamList] ?? '•';

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
            <View style={[styles.iconWrap, isFocused && styles.iconWrapActive]}>
              <Text variant="h3" color={isFocused ? colors.surface : colors.neutral600} style={styles.icon}>
                {icon}
              </Text>
            </View>
            <Text
              variant="kicker"
              style={styles.label}
              color={isFocused ? colors.accent700 : colors.neutral600}
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

export function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }} tabBar={renderTabBar}>
      <Tab.Screen name="HomeTab" component={HomeStack} />
      <Tab.Screen name="SellTab" component={SellStack} />
      <Tab.Screen name="BillsTab" component={BillsStack} />
      <Tab.Screen name="StockTab" component={StockStack} />
      <Tab.Screen name="RecapTab" component={RecapStack} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
    paddingTop: 6,
    paddingBottom: 10,
    paddingHorizontal: 4,
  },
  tabItem: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingTop: 4,
    paddingBottom: 4,
  },
  iconWrap: { width: 29, height: 25, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  iconWrapActive: { backgroundColor: colors.accent },
  icon: { fontSize: 17, lineHeight: 20 },
  label: {
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'none',
  },
});
