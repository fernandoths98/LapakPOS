import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import axios from 'axios';
import QRCode from 'react-native-qrcode-svg';
import { CheckCircle2, Clock3, QrCode, ShieldCheck, WalletCards } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatRupiah, WalletTopupResponse } from '@lapak/shared';
import { Text } from '../../theme/Text';
import { Button } from '../../components/Button';
import { colors, radius, shadow, space } from '../../theme/tokens';
import { useCreateWalletTopup, useWalletSummary, useWalletTopups } from '../../state/api/ppob';
import { useQueryClient } from '@tanstack/react-query';

const QUICK_AMOUNTS = [50_000, 100_000, 250_000, 500_000];

function topupError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string } | undefined;
    if (data?.message) return data.message;
    if (!error.response) return 'Tidak dapat terhubung ke server. Periksa internet lalu coba lagi.';
  }
  return error instanceof Error ? error.message : 'QRIS belum dapat dibuat. Silakan coba lagi.';
}

export function WalletTopupScreen() {
  const { width } = useWindowDimensions();
  const landscape = width >= 760;
  const [amountText, setAmountText] = useState('100000');
  const [active, setActive] = useState<WalletTopupResponse | null>(null);
  const create = useCreateWalletTopup();
  const wallet = useWalletSummary();
  const queryClient = useQueryClient();
  const topups = useWalletTopups(20, active?.status === 'pending');
  const amount = Number(amountText.replace(/\D/g, '')) || 0;

  useEffect(() => {
    if (!active) return;
    const latest = topups.data?.find(item => item.id === active.id);
    if (latest?.status === 'paid') {
      setActive(latest);
      queryClient.invalidateQueries({ queryKey: ['ppob', 'wallet'] });
    }
  }, [active, queryClient, topups.data]);

  const generate = async () => {
    try { setActive(await create.mutateAsync(amount)); }
    catch (error) { Alert.alert('QRIS gagal dibuat', topupError(error)); }
  };

  return <SafeAreaView style={styles.container} edges={[]}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <View style={styles.pageHeader}>
        <View style={styles.headerIcon}><WalletCards size={23} color={colors.accent2} /></View>
        <View style={styles.headerCopy}><Text variant="h2">Isi Saldo PPOB</Text><Text variant="caption" color={colors.neutral600}>Modal transaksi pulsa, tagihan, dan produk digital.</Text></View>
        <View style={styles.balancePill}><Text variant="caption" color={colors.neutral600}>SALDO SAAT INI</Text><Text variant="h3" color={colors.accent2}>{wallet.data ? formatRupiah(wallet.data.balance) : '—'}</Text></View>
      </View>

      <View style={[styles.main, landscape && styles.mainLandscape]}>
        <View style={[styles.primaryColumn, landscape && styles.primaryLandscape]}>
          {active ? <View style={styles.card}>
            {active.status === 'paid' ? <View style={styles.centered}>
              <View style={styles.successIcon}><CheckCircle2 size={38} color={colors.success} /></View>
              <Text variant="h2">Saldo sudah masuk</Text><Text variant="h1" color={colors.accent2} style={styles.amountResult}>{formatRupiah(active.amount)}</Text>
              <Text variant="caption" color={colors.neutral600}>Pembayaran terverifikasi dan tercatat di mutasi saldo.</Text>
              <Button title="Isi saldo lagi" variant="secondary" onPress={() => setActive(null)} style={styles.actionButton} />
            </View> : <View style={styles.centered}>
              <View style={styles.cardTitleRow}><QrCode size={20} color={colors.accent2} /><Text variant="h3">Scan QRIS</Text></View>
              <Text variant="caption" color={colors.neutral600}>Bayar melalui aplikasi bank atau dompet digital</Text>
              <View style={styles.qrFrame}><QRCode value={active.qrContent} size={landscape ? 190 : 210} /></View>
              <Text variant="h1" style={styles.amountResult}>{formatRupiah(active.amount)}</Text>
              <View style={styles.waiting}><Clock3 size={15} color={colors.warning} /><Text variant="caption" color={colors.neutral700}>Menunggu pembayaran · berlaku 10 menit</Text></View>
              <Button title="Batalkan transaksi" variant="secondary" onPress={() => setActive(null)} style={styles.actionButton} />
            </View>}
          </View> : <View style={styles.card}>
            <Text variant="h3">Pilih nominal isi saldo</Text><Text variant="caption" color={colors.neutral600} style={styles.sectionCaption}>Minimal Rp10.000 · maksimal Rp10.000.000</Text>
            <View style={styles.amountInputWrap}><Text variant="h2" color={colors.neutral600}>Rp</Text><TextInput value={amountText} onChangeText={value => setAmountText(value.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.neutral400} style={styles.amountInput} /></View>
            <View style={styles.quickGrid}>{QUICK_AMOUNTS.map(value => <Pressable key={value} onPress={() => setAmountText(String(value))} style={({ pressed }) => [styles.quick, amount === value && styles.quickActive, pressed && styles.quickPressed]}><Text variant="body" style={styles.quickLabel} color={amount === value ? colors.surface : colors.neutral800}>{formatRupiah(value)}</Text></Pressable>)}</View>
            <Button title={create.isPending ? 'Menyiapkan QRIS…' : `Lanjut bayar ${formatRupiah(amount)}`} onPress={generate} loading={create.isPending} disabled={amount < 10_000 || amount > 10_000_000} fullWidth style={styles.payButton} />
            <View style={styles.secureRow}><ShieldCheck size={17} color={colors.success} /><Text variant="caption" color={colors.neutral600}>Pembayaran aman via NusaPay. Saldo masuk otomatis.</Text></View>
          </View>}
        </View>

        <View style={[styles.historyCard, landscape && styles.historyLandscape]}>
          <View style={styles.historyHeader}><Text variant="h3">Riwayat isi saldo</Text><Text variant="caption" color={colors.neutral600}>Transaksi terbaru</Text></View>
          {(topups.data ?? []).length === 0 ? <View style={styles.empty}><Clock3 size={28} color={colors.neutral400} /><Text variant="body" color={colors.neutral600}>Belum ada riwayat isi saldo.</Text></View> : null}
          {(topups.data ?? []).map(item => <View key={item.id} style={styles.historyRow}>
            <View style={[styles.historyIcon, item.status === 'paid' ? styles.iconPaid : item.status === 'pending' ? styles.iconPending : styles.iconFailed]}>{item.status === 'paid' ? <CheckCircle2 size={18} color={colors.success} /> : <Clock3 size={18} color={item.status === 'pending' ? colors.warning : colors.neutral500} />}</View>
            <View style={styles.historyCopy}><Text variant="body" style={styles.bold}>{formatRupiah(item.amount)}</Text><Text variant="caption" color={colors.neutral600}>{new Date(item.createdAt).toLocaleString('id-ID')}</Text></View>
            <View style={[styles.statusBadge, item.status === 'paid' ? styles.badgePaid : item.status === 'pending' ? styles.badgePending : styles.badgeFailed]}><Text variant="caption" color={item.status === 'paid' ? colors.success : item.status === 'pending' ? '#9A6700' : colors.neutral600}>{item.status === 'paid' ? 'Berhasil' : item.status === 'pending' ? 'Menunggu' : item.status === 'expired' ? 'Kedaluwarsa' : 'Gagal'}</Text></View>
          </View>)}
        </View>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg }, content: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: space[4], paddingBottom: space[8] },
  pageHeader: { flexDirection: 'row', alignItems: 'center', gap: space[3], marginBottom: space[4] }, headerIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent2100 }, headerCopy: { flex: 1 }, balancePill: { alignItems: 'flex-end', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.divider, paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.md },
  main: { gap: space[4] }, mainLandscape: { flexDirection: 'row', alignItems: 'flex-start' }, primaryColumn: { width: '100%' }, primaryLandscape: { flex: 1.2 }, card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.lg, padding: space[6], ...shadow.sm }, sectionCaption: { marginTop: 3 },
  amountInputWrap: { flexDirection: 'row', alignItems: 'center', gap: space[2], borderWidth: 1.5, borderColor: colors.accent2300, backgroundColor: colors.neutral100, borderRadius: radius.md, paddingHorizontal: space[4], marginTop: space[4] }, amountInput: { flex: 1, minHeight: 68, fontSize: 30, fontWeight: '600', color: colors.text, paddingVertical: 8 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[3] }, quick: { width: '48%', flexGrow: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.neutral100 }, quickActive: { backgroundColor: colors.accent2, borderColor: colors.accent2 }, quickPressed: { opacity: 0.75 }, quickLabel: { fontWeight: '600' }, payButton: { marginTop: space[4], minHeight: 54 }, secureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: space[3] },
  centered: { alignItems: 'center' }, cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] }, qrFrame: { padding: 14, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.lg, backgroundColor: '#FFF', marginTop: space[4], ...shadow.sm }, amountResult: { marginTop: space[3], fontSize: 28 }, waiting: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF8E7', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginTop: space[2] }, actionButton: { marginTop: space[4], minWidth: 210 }, successIcon: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF8F0', marginBottom: space[3] },
  historyCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.lg, overflow: 'hidden', ...shadow.sm }, historyLandscape: { flex: 0.8, maxHeight: 520 }, historyHeader: { padding: space[4], borderBottomWidth: 1, borderBottomColor: colors.divider }, historyRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderBottomWidth: 1, borderBottomColor: colors.divider }, historyIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, iconPaid: { backgroundColor: '#EAF8F0' }, iconPending: { backgroundColor: '#FFF6DF' }, iconFailed: { backgroundColor: colors.neutral200 }, historyCopy: { flex: 1 }, bold: { fontWeight: '600' }, statusBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12 }, badgePaid: { backgroundColor: '#EAF8F0' }, badgePending: { backgroundColor: '#FFF6DF' }, badgeFailed: { backgroundColor: colors.neutral200 }, empty: { alignItems: 'center', gap: space[2], paddingVertical: space[8] },
});
