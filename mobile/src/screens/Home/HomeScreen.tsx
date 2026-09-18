import React from 'react';
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
  TrendingDown,
  TrendingUp,
  TriangleAlert,
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
import { OutletSwitcher } from '../../components/OutletSwitcher';
import { OutletsSummaryCard } from '../../components/OutletsSummaryCard';
import { TrialBanner } from '../../components/TrialBanner';
import { colors, radius, shadow, space } from '../../theme/tokens';
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

function formatOpenedAt(iso: string): string {
  return new Date(iso).toLocaleTimeString('id-ID', {
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
  // Green when takings grew, red when they fell — previously red meant "up",
  // which read backwards and spent the action colour on a status.

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
          <View style={styles.headerLeft}>
            <Text variant="h2" style={styles.merchantName}>
              {merchant?.name ?? ''}
            </Text>
            <View style={styles.headerMeta}>
              <Text variant="caption" color={colors.neutral600}>
                {formatTodayHeading()}
              </Text>
              <OutletSwitcher />
            </View>
          </View>
          <Pressable
            onPress={() => navigation.navigate('Profile')}
            style={styles.profileButton}
            accessibilityLabel="Buka profil"
          >
            <UserRound size={21} color={colors.text} />
          </Pressable>
        </View>

        <TrialBanner />

        <Pressable
          onPress={() =>
            navigation.navigate(shift ? 'ShiftClose' : 'OpenShift')
          }
          style={styles.shiftRow}
        >
          <View
            style={[
              styles.statusDot,
              { backgroundColor: shift ? colors.success : colors.attention },
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
          <Text variant="kicker" color={HERO_MUTED}>PENJUALAN HARI INI</Text>
          <Text variant="money" color={colors.surface} style={styles.takingsTotal}>
            {formatRupiah(summary?.total ?? 0)}
          </Text>

          {/* The comparison is a direction before it is a number, so it reads
              as a shape — arrow and tint — rather than a third column of
              digits competing with the takings. */}
          <View style={styles.deltaRow}>
            <View
              style={[
                styles.deltaPill,
                {
                  backgroundColor: 'rgba(255,255,255,0.16)',
                },
              ]}
            >
              {changeIsUp ? (
                <TrendingUp size={13} color={colors.surface} strokeWidth={2.6} />
              ) : (
                <TrendingDown size={13} color={colors.surface} strokeWidth={2.6} />
              )}
              <Text
                variant="caption"
                color={colors.surface}
                style={styles.deltaValue}
              >
                {Math.abs(Math.round(change))}%
              </Text>
            </View>
            <Text variant="caption" color={HERO_MUTED}>
              dibanding kemarin
            </Text>
          </View>

          <View style={styles.takingsMetaRow}>
            <Metric label="TRANSAKSI" value={`${summary?.count ?? 0}`} onHero />
            <View style={styles.metricDivider} />
            <Metric
              label="RATA-RATA"
              value={formatRupiah(summary?.avgTicket ?? 0)}
              onHero
            />
          </View>
        </View>

        <Text variant="kicker" style={styles.sectionTitle}>
          METODE PEMBAYARAN
        </Text>
        {/* Stacked rather than columns: a fourth tender leaves ~90px per cell,
            which is not enough for a seven-digit rupiah amount. Stacking also
            gives the bars one shared baseline, so the split is comparable. */}
        <View style={styles.tenderStrip}>
          {!summary?.tenderMix?.length ? (
            <Text variant="body" color={colors.neutral600}>
              Belum ada pembayaran hari ini.
            </Text>
          ) : null}
          {(summary?.tenderMix ?? []).map(t => (
            <View key={t.label} style={styles.tenderRow}>
              <View style={styles.tenderRowHead}>
                <Text variant="body" color={colors.neutral800}>
                  {t.label}
                </Text>
                <Text variant="tabular" style={styles.tenderAmount}>
                  {formatRupiah(t.amount)}
                </Text>
              </View>
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

        <OutletsSummaryCard />

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
              <View style={styles.alertIcon}>
                <TriangleAlert size={17} color={colors.attention} />
              </View>
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
  onHero,
}: {
  label: string;
  value: string;
  valueColor?: string;
  onHero?: boolean;
}) {
  return (
    <View style={styles.metric}>
      <Text variant="kicker" color={onHero ? HERO_MUTED : colors.neutral500}>
        {label}
      </Text>
      <Text
        variant="tabular"
        color={valueColor ?? (onHero ? colors.surface : colors.text)}
        style={styles.metricValue}
      >
        {value}
      </Text>
    </View>
  );
}

/** Secondary text on the dark takings card — 7:1 against accent2700. */
const HERO_MUTED = '#C9D8F5';

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
  headerLeft: { flex: 1, marginRight: space[2] },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginTop: 2, flexWrap: 'wrap' },
  merchantName: { marginBottom: 2 },
  profileButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    ...shadow.sm,
  },
  shiftRow: {
    marginTop: space[4],
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space[3],
    backgroundColor: colors.surface,
    ...shadow.sm,
    borderRadius: radius.lg,
  },
  shiftCopy: { flex: 1, marginHorizontal: space[2] },
  shiftTitle: { fontWeight: '600' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  takings: {
    marginTop: space[4],
    padding: space[6],
    backgroundColor: colors.accent2700,
    ...shadow.md,
    borderRadius: radius.lg,
  },
  // No fontSize here: the `money` variant governs the hero figure.
  takingsTotal: { marginTop: space[1] },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    marginTop: space[2],
  },
  deltaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: space[2],
    borderRadius: 999,
  },
  deltaValue: { fontWeight: '700' },
  takingsMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    marginTop: space[4],
    paddingTop: space[3],
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.18)',
  },
  metric: { flex: 1 },
  metricDivider: { width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.18)' },
  metricValue: { marginTop: 4, fontSize: 18 },
  tenderStrip: {
    ...shadow.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: space[4],
    gap: space[3],
  },
  tenderRow: { gap: 5 },
  tenderRowHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  tenderAmount: { fontSize: 15 },
  tenderBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.neutral200,
    overflow: 'hidden',
  },
  tenderBarFill: { height: 6, borderRadius: 3, backgroundColor: colors.accent2600 },
  recapCard: {
    marginTop: space[4],
    flexDirection: 'row',
    alignItems: 'center',
    ...shadow.sm,
    borderRadius: radius.lg,
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
    ...shadow.sm,
    borderRadius: radius.lg,
    padding: space[3],
    backgroundColor: colors.surface,
  },
  shortcutCopy: { flex: 1, marginLeft: space[2] },
  shortcutTitle: { fontWeight: '600' },
  alertsEmpty: { paddingVertical: space[2] },
  alertRow: {
    flexDirection: 'row',
    gap: space[3],
    alignItems: 'center',
    paddingVertical: space[2] + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  alertIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.attentionBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertBody: { flex: 1 },
  alertMeta: { marginTop: 2 },
});
