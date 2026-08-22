import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  ArrowRight,
  FileDown,
  PackagePlus,
  ReceiptText,
  UserRound,
  WalletCards,
  type LucideIcon,
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CompositeNavigationProp,
  useNavigation,
} from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { formatRupiah } from '@lapak/shared';
import { Text } from '../../theme/Text';
import { colors, radius, space } from '../../theme/tokens';
import { useTodaySummary, useHomeAlerts } from '../../state/api/home';
import { useMerchant } from '../../state/api/merchant';
import { useCurrentShift } from '../../state/api/shifts';
import { useDailyRecap } from '../../state/api/recap';
import { HomeStackParamList } from '../../app/stacks/HomeStack';
import type { MainTabsParamList } from '../../app/MainTabs';

type HomeNavigationProp = CompositeNavigationProp<
  NativeStackNavigationProp<HomeStackParamList, 'Home'>,
  BottomTabNavigationProp<MainTabsParamList>
>;

function formatTodayHeading(): string {
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
}

function formatYesterdayShort(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return new Intl.DateTimeFormat('id-ID', { weekday: 'short' }).format(
    yesterday,
  );
}

function formatOpenedAt(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

const RECAP_AI_UNAVAILABLE_LINE =
  'Analisis pintar belum aktif. Angka laporan tetap tersedia dan akurat.';
const RECAP_LOADING_LINE = 'Membaca transaksi hari ini…';
const RECAP_ERROR_LINE = 'Ringkasan hari ini gagal dimuat.';

export function HomeScreen() {
  const navigation = useNavigation<HomeNavigationProp>();

  const merchantQuery = useMerchant();
  const summaryQuery = useTodaySummary();
  const alertsQuery = useHomeAlerts();
  const currentShiftQuery = useCurrentShift();
  const recapQuery = useDailyRecap();

  const yesterdayShort = useMemo(formatYesterdayShort, []);

  if (
    merchantQuery.isLoading ||
    summaryQuery.isLoading ||
    currentShiftQuery.isLoading
  ) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const merchant = merchantQuery.data;
  const summary = summaryQuery.data;
  const alerts = alertsQuery.data?.alerts ?? [];
  const shift = currentShiftQuery.data?.shift ?? null;

  const change = summary?.pctChangeVsYesterday ?? 0;
  const changeIsUp = change >= 0;
  const changeColor = changeIsUp ? colors.accent700 : colors.neutral700;

  const recapLine = recapQuery.isLoading
    ? RECAP_LOADING_LINE
    : recapQuery.isError || !recapQuery.data
    ? RECAP_ERROR_LINE
    : !recapQuery.data.aiAvailable
    ? RECAP_AI_UNAVAILABLE_LINE
    : recapQuery.data.headline;

  const shortcuts: {
    title: string;
    sub: string;
    icon: LucideIcon;
    go: () => void;
  }[] = [
    {
      title: 'Jual PPOB',
      sub: 'Pulsa, token, tagihan',
      icon: ReceiptText,
      go: () => navigation.navigate('BillsTab', { screen: 'Bills' }),
    },
    {
      title: 'Pengeluaran',
      sub: 'Catat kas keluar',
      icon: WalletCards,
      go: () => navigation.navigate('AddExpense'),
    },
    {
      title: 'Import Excel',
      sub: 'Masukkan katalog produk',
      icon: FileDown,
      go: () => navigation.navigate('StockTab', { screen: 'Sheet' }),
    },
    {
      title: 'Tambah produk',
      sub: 'Item katalog baru',
      icon: PackagePlus,
      go: () =>
        navigation.navigate('StockTab', {
          screen: 'Product',
          params: undefined,
        }),
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        <View style={styles.headerRow}>
          <View>
            <Text variant="h2" style={styles.merchantName}>
              {merchant?.name ?? ''}
            </Text>
            <Text variant="caption" color={colors.neutral600}>
              {formatTodayHeading()}
            </Text>
          </View>
          <Pressable
            onPress={() => navigation.navigate('Profile')}
            style={styles.profileButton}
            accessibilityLabel="Buka profil"
          >
            <UserRound size={21} color={colors.text} />
          </Pressable>
        </View>

        <Pressable
          onPress={() =>
            navigation.navigate(shift ? 'ShiftClose' : 'OpenShift')
          }
          style={styles.shiftRow}
        >
          <View
            style={[
              styles.statusDot,
              { backgroundColor: shift ? colors.success : colors.warning },
            ]}
          />
          <View style={styles.shiftCopy}>
            <Text variant="body" style={styles.shiftTitle}>
              {shift ? 'Shift sedang berjalan' : 'Shift belum dibuka'}
            </Text>
            <Text variant="caption" color={colors.neutral600}>
              {shift
                ? `Dibuka pukul ${formatOpenedAt(
                    shift.openedAt,
                  )} · ketuk untuk tutup shift`
                : 'Catat modal awal sebelum mulai berjualan'}
            </Text>
          </View>
          <ArrowRight size={18} color={colors.neutral500} />
        </Pressable>

        <View style={styles.takings}>
          <Text variant="kicker">PENJUALAN HARI INI</Text>
          <Text variant="h1" style={styles.takingsTotal}>
            {formatRupiah(summary?.total ?? 0)}
          </Text>
          <View style={styles.takingsMetaRow}>
            <Metric label="TRANSAKSI" value={`${summary?.count ?? 0}`} />
            <Metric
              label="RATA-RATA"
              value={formatRupiah(summary?.avgTicket ?? 0)}
            />
            <Metric
              label={`VS ${yesterdayShort.toUpperCase()}`}
              value={`${changeIsUp ? '+' : '−'}${Math.abs(
                Math.round(change),
              )}%`}
              valueColor={changeColor}
            />
          </View>
        </View>

        <Text variant="kicker" style={styles.sectionTitle}>
          METODE PEMBAYARAN
        </Text>
        <View style={styles.tenderStrip}>
          {(summary?.tenderMix ?? []).map(t => (
            <View key={t.label} style={styles.tenderCell}>
              <Text
                variant="caption"
                color={colors.neutral600}
                style={styles.tenderLabel}
              >
                {t.label.toUpperCase()}
              </Text>
              <Text variant="tabular" style={styles.tenderAmount}>
                {formatRupiah(t.amount)}
              </Text>
              <View style={styles.tenderBarTrack}>
                <View
                  style={[
                    styles.tenderBarFill,
                    { width: `${Math.max(0, Math.min(100, t.pct))}%` },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>

        <Pressable
          style={styles.recapCard}
          onPress={() =>
            navigation.navigate('RecapTab', {
              screen: 'Recap',
              params: { tab: 'Story' },
            })
          }
        >
          <View style={styles.recapCopy}>
            <Text variant="kicker">ANALISIS HARI INI</Text>
            <Text variant="body" style={styles.recapLine}>
              {recapLine}
            </Text>
          </View>
          <ArrowRight size={20} color={colors.neutral500} />
        </Pressable>

        <Text variant="kicker" style={styles.sectionTitle}>
          AKSES CEPAT
        </Text>
        <View style={styles.shortcutsGrid}>
          {shortcuts.map(s => (
            <Pressable
              key={s.title}
              onPress={s.go}
              style={styles.shortcutCard}
              accessibilityRole="button"
            >
              <s.icon size={20} color={colors.text} />
              <View style={styles.shortcutCopy}>
                <Text variant="body" style={styles.shortcutTitle}>
                  {s.title}
                </Text>
                <Text variant="caption" color={colors.neutral600}>
                  {s.sub}
                </Text>
              </View>
              <ArrowRight size={16} color={colors.neutral400} />
            </Pressable>
          ))}
        </View>

        <Text variant="kicker" style={styles.sectionTitle}>
          PERLU PERHATIAN
        </Text>
        {alerts.length === 0 ? (
          <Text
            variant="body"
            color={colors.neutral600}
            style={styles.alertsEmpty}
          >
            Semua aman. Tidak ada tindakan mendesak.
          </Text>
        ) : (
          alerts.map((alert, index) => (
            <View key={`${alert.text}-${index}`} style={styles.alertRow}>
              <View style={styles.alertDot} />
              <View style={styles.alertBody}>
                <Text variant="body">{alert.text}</Text>
                <Text
                  variant="caption"
                  color={colors.neutral600}
                  style={styles.alertMeta}
                >
                  {alert.meta}
                </Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.metric}>
      <Text variant="kicker" color={colors.neutral500}>
        {label}
      </Text>
      <Text
        variant="tabular"
        color={valueColor ?? colors.text}
        style={styles.metricValue}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: space[4], paddingTop: 0, paddingBottom: space[8] },
  headerRow: {
    minHeight: 60,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  merchantName: { marginBottom: 2 },
  profileButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  shiftRow: {
    marginTop: space[4],
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space[3],
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
  },
  shiftCopy: { flex: 1, marginHorizontal: space[2] },
  shiftTitle: { fontWeight: '600' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  takings: {
    marginTop: space[4],
    padding: space[4],
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
  },
  takingsTotal: { marginTop: space[1], fontSize: 36 },
  takingsMetaRow: {
    flexDirection: 'row',
    marginTop: space[4],
    paddingTop: space[3],
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  metric: { flex: 1 },
  metricValue: { marginTop: 4, fontSize: 14 },
  tenderStrip: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  tenderCell: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: space[3],
    borderRightWidth: 1,
    borderRightColor: colors.divider,
  },
  tenderLabel: { letterSpacing: 1 },
  tenderAmount: { marginTop: 4, fontSize: 16 },
  tenderBarTrack: {
    height: 2,
    marginTop: space[2],
    backgroundColor: 'transparent',
  },
  tenderBarFill: { height: 2, backgroundColor: colors.accent300 },
  recapCard: {
    marginTop: space[4],
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    padding: space[4],
    backgroundColor: colors.surface,
  },
  recapCopy: { flex: 1, paddingRight: space[3] },
  recapLine: { marginTop: space[1] },
  sectionTitle: { marginTop: space[4] + 4, marginBottom: space[2] },
  shortcutsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  shortcutCard: {
    width: '48%',
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    padding: space[3],
    backgroundColor: colors.surface,
  },
  shortcutCopy: { flex: 1, marginLeft: space[2] },
  shortcutTitle: { fontWeight: '600' },
  alertsEmpty: { paddingVertical: space[2] },
  alertRow: {
    flexDirection: 'row',
    gap: space[2] + 2,
    alignItems: 'flex-start',
    paddingVertical: space[2] + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  alertDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.accent,
    marginTop: 7,
  },
  alertBody: { flex: 1 },
  alertMeta: { marginTop: 2 },
});
