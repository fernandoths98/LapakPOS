import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RouteProp, useRoute } from "@react-navigation/native";
import { AiChatMessage, formatRupiah, RecapInsight, TopSeller, WeeklyBar } from "@lapak/shared";
import { Text } from "../../theme/Text";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { colors, radius, space } from "../../theme/tokens";
import { useAskChat, useAskChatHistory, useDailyRecap, useRegenerateRecap, useWeeklyReports } from "../../state/api/recap";
import { RecapStackParamList } from "../../app/stacks/RecapStack";

export type RecapTabName = "Story" | "Ask" | "Reports";
const AI_UNAVAILABLE_MESSAGE =
  "Analisis pintar belum aktif. Angka penjualan tetap akurat dan dapat digunakan seperti biasa.";

// Mirrors the prototype's `suggestions` chips exactly (Warung POS.dc.html, isRecap/recapIsAsk block).
const ASK_SUGGESTIONS = ["Stok apa yang perlu dibeli?", "Produk apa paling laku hari ini?", "Kapan toko paling sepi?"];

const ASK_AI_UNAVAILABLE_MESSAGE =
  "Asisten AI belum aktif. Laporan angka tetap tersedia di tab Penjualan.";

const BAR_MAX_HEIGHT = 96;

export function RecapScreen() {
  const route = useRoute<RouteProp<RecapStackParamList, "Recap">>();
  const initialAssistant = route.params?.tab === "Story" || route.params?.tab === "Ask" ? route.params.tab : null;
  const [assistantView, setAssistantView] = useState<"Story" | "Ask" | null>(initialAssistant);

  return (
    <SafeAreaView style={styles.container} edges={[]}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.pageHeader}>
        <View style={styles.headerTitleRow}>
          <View style={styles.headerCopy}>
            <Text variant="h2">{assistantView ? "Asisten toko" : "Laporan"}</Text>
            <Text variant="caption" color={colors.neutral600} style={styles.pageIntro}>
              {assistantView ? "Baca insight atau tanyakan kondisi toko." : "Ringkasan penjualan 7 hari terakhir."}
            </Text>
          </View>
          {assistantView ? (
            <Pressable onPress={() => setAssistantView(null)} style={styles.backToReport}>
              <Text variant="body" color={colors.accent2}>Kembali ke laporan</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {assistantView === "Story" ? <StoryTab /> : null}
      {assistantView === "Ask" ? <AskTab /> : null}
      {!assistantView ? <ReportsTab onOpenAssistant={setAssistantView} /> : null}
    </ScrollView>
    </SafeAreaView>
  );
}

function StoryTab() {
  const recapQuery = useDailyRecap();
  const regenerate = useRegenerateRecap();

  if (recapQuery.isLoading) {
    return <ActivityIndicator style={styles.loading} color={colors.accent} />;
  }
  if (recapQuery.isError || !recapQuery.data) {
    return (
      <Text variant="body" color={colors.accent700} style={styles.loading}>
        Ringkasan hari ini gagal dimuat. Coba buka kembali halaman ini.
      </Text>
    );
  }

  const recap = recapQuery.data;

  return (
    <View style={styles.storySection}>
      <View style={styles.featureIntro}>
        <Text variant="kicker" color={colors.accent2700}>INSIGHT OTOMATIS</Text>
        <Text variant="h3" style={styles.featureTitle}>Prioritas toko hari ini</Text>
        <Text variant="caption" color={colors.neutral700} style={styles.featureDescription}>
          AI memeriksa omzet, produk terlaris, stok menipis, perubahan harga modal, dan pola jam sepi lalu merangkum hal yang perlu ditindaklanjuti.
        </Text>
        <Text variant="caption" color={colors.neutral600} style={styles.readOnlyNote}>
          Hanya membaca data toko · tidak mengubah transaksi, stok, atau harga
        </Text>
      </View>

      {!recap.aiAvailable ? (
        <View style={styles.aiNotice}>
          <Text variant="caption" color={colors.accent700}>
            {AI_UNAVAILABLE_MESSAGE}
          </Text>
        </View>
      ) : null}

      <Text variant="h3" style={styles.headline}>
        {recap.headline}
      </Text>
      <Text variant="body" color={colors.neutral800} style={styles.storyBody}>
        {recap.body}
      </Text>

      <View style={styles.regenerateRow}>
        <Button
          title={regenerate.isPending ? "Memperbarui…" : "Perbarui ringkasan"}
          variant="ghost"
          loading={regenerate.isPending}
          onPress={() => regenerate.mutate()}
        />
      </View>

      <Text variant="kicker" style={styles.sectionLabel}>
        YANG PERLU DIPERHATIKAN
      </Text>
      {recap.insights.length === 0 ? (
        <Text variant="body" color={colors.neutral600} style={styles.emptyInsights}>
          Belum ada hal penting yang perlu ditindaklanjuti hari ini.
        </Text>
      ) : (
        recap.insights.map((insight, index) => <InsightRow key={`${insight.title}-${index}`} insight={insight} />)
      )}
    </View>
  );
}

function InsightRow({ insight }: { insight: RecapInsight }) {
  return (
    <View style={styles.insightRow}>
      <Text variant="h3" style={styles.insightTitle}>
        {insight.title}
      </Text>
      <Text variant="caption" color={colors.neutral700} style={styles.insightBody}>
        {insight.body}
      </Text>
      {insight.action ? (
        <Text variant="caption" color={colors.accent700} style={styles.insightAction}>
          {insight.action}
        </Text>
      ) : null}
    </View>
  );
}

function AskTab() {
  const historyQuery = useAskChatHistory();
  const askChat = useAskChat();
  const [draft, setDraft] = useState("");
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  const handleSend = (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || askChat.isPending) return;
    setPendingMessage(trimmed);
    setDraft("");
    askChat.mutate(trimmed, { onSettled: () => setPendingMessage(null) });
  };

  if (historyQuery.isLoading) {
    return <ActivityIndicator style={styles.loading} color={colors.accent} />;
  }
  if (historyQuery.isError) {
    return (
      <Text variant="body" color={colors.accent700} style={styles.loading}>
        Percakapan gagal dimuat. Coba buka kembali halaman ini.
      </Text>
    );
  }

  const messages = historyQuery.data?.messages ?? [];
  const showAiUnavailableBanner = askChat.data ? !askChat.data.aiAvailable : false;

  return (
    <View style={styles.askSection}>
      <View style={styles.featureIntro}>
        <Text variant="kicker" color={colors.accent2700}>TANYA DATA TOKO</Text>
        <Text variant="h3" style={styles.featureTitle}>Cari jawaban tanpa membaca tabel</Text>
        <Text variant="caption" color={colors.neutral700} style={styles.featureDescription}>
          Gunakan untuk pertanyaan lanjutan tentang penjualan hari ini, produk terlaris, kebutuhan restok, kenaikan modal, atau jam sepi.
        </Text>
        <Text variant="caption" color={colors.neutral600} style={styles.readOnlyNote}>
          Jawaban mengikuti data yang tersedia; jika datanya belum cukup, AI akan mengatakannya.
        </Text>
      </View>

      {showAiUnavailableBanner ? (
        <View style={styles.aiNotice}>
          <Text variant="caption" color={colors.accent700}>
            {ASK_AI_UNAVAILABLE_MESSAGE}
          </Text>
        </View>
      ) : null}

      <View style={styles.chatThread}>
        {messages.length === 0 && !pendingMessage ? (
          <Text variant="body" color={colors.neutral700}>
            Pilih contoh pertanyaan di bawah atau tulis pertanyaan sendiri.
          </Text>
        ) : null}
        {messages.map((message) => (
          <ChatBubble key={message.id} role={message.role} text={message.content} />
        ))}
        {pendingMessage ? <ChatBubble role="user" text={pendingMessage} /> : null}
        {askChat.isPending ? <ChatBubble role="assistant" text="Sedang menganalisis…" muted /> : null}
      </View>

      <View style={styles.suggestionsRow}>
        {ASK_SUGGESTIONS.map((suggestion) => (
          <Button
            key={suggestion}
            title={suggestion}
            variant="secondary"
            disabled={askChat.isPending}
            onPress={() => handleSend(suggestion)}
            style={styles.suggestionChip}
          />
        ))}
      </View>

      <View style={styles.askInputRow}>
        <TextField
          value={draft}
          onChangeText={setDraft}
          placeholder="Contoh: produk apa yang paling laku?"
          editable={!askChat.isPending}
          onSubmitEditing={() => handleSend(draft)}
          style={styles.askInput}
        />
        <Button
          title={askChat.isPending ? "Mengirim…" : "Kirim"}
          onPress={() => handleSend(draft)}
          loading={askChat.isPending}
          disabled={askChat.isPending || draft.trim() === ""}
          style={styles.askButton}
        />
      </View>
    </View>
  );
}

/** Left/right-aligned chat bubble matching the prototype's `chat` rows exactly: user turns align right on a surface fill, assistant turns align left with an accent-bordered, transparent fill. */
function ChatBubble({ role, text, muted }: { role: AiChatMessage["role"]; text: string; muted?: boolean }) {
  const isUser = role === "user";
  return (
    <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
      <Text variant="body" color={muted ? colors.neutral600 : colors.text}>
        {text}
      </Text>
    </View>
  );
}

function ReportsTab({ onOpenAssistant }: { onOpenAssistant: (view: "Story" | "Ask") => void }) {
  const reportsQuery = useWeeklyReports();

  if (reportsQuery.isLoading) {
    return <ActivityIndicator style={styles.loading} color={colors.accent} />;
  }
  if (reportsQuery.isError || !reportsQuery.data) {
    return (
      <Text variant="body" color={colors.accent700} style={styles.loading}>
        Data penjualan gagal dimuat. Coba buka kembali halaman ini.
      </Text>
    );
  }

  const { bars, topSellers } = reportsQuery.data;
  const weeklyTotal = bars.reduce((sum, bar) => sum + bar.total, 0);
  const ppobTotal = bars.reduce((sum, bar) => sum + bar.ppobShare, 0);
  const activeDays = bars.filter((bar) => bar.total > 0).length;
  const averagePerActiveDay = activeDays ? weeklyTotal / activeDays : 0;
  const ppobPercentage = weeklyTotal ? Math.round((ppobTotal / weeklyTotal) * 100) : 0;

  return (
    <View style={styles.reportsSection}>
      <View style={styles.reportIntro}>
        <View>
          <Text variant="kicker" color={colors.neutral600}>PERIODE LAPORAN</Text>
          <Text variant="h3" style={styles.periodTitle}>7 hari terakhir</Text>
        </View>
        <Text variant="caption" color={colors.neutral600}>{activeDays} hari ada transaksi</Text>
      </View>

      <View style={styles.revenueCard}>
        <Text variant="kicker" color={colors.neutral600}>TOTAL OMZET</Text>
        <Text variant="h1" style={styles.revenueValue}>{formatRupiah(weeklyTotal)}</Text>
        <Text variant="caption" color={colors.neutral600}>Penjualan barang dan transaksi PPOB</Text>
      </View>

      <View style={styles.metricGrid}>
        <MetricCard label="RATA-RATA / HARI AKTIF" value={formatRupiah(averagePerActiveDay)} />
        <MetricCard label="KONTRIBUSI PPOB" value={formatRupiah(ppobTotal)} note={`${ppobPercentage}% dari omzet`} />
      </View>

      <View style={styles.reportBlock}>
        <Text variant="h3">Tren omzet harian</Text>
        <Text variant="caption" color={colors.neutral600} style={styles.blockCaption}>Bandingkan pemasukan toko setiap hari.</Text>
        <WeeklyBarChart bars={bars} />
        <View style={styles.legendRow}>
          <LegendSwatch label="Omzet total" color={colors.accent2} />
          <LegendSwatch label="Bagian PPOB" color={colors.accent} />
        </View>
      </View>

      <View style={styles.reportBlock}>
        <Text variant="h3">Rincian per hari</Text>
        <View style={styles.reportTableHeader}>
          <Text variant="kicker" color={colors.neutral600} style={styles.dayColumn}>HARI</Text>
          <Text variant="kicker" color={colors.neutral600} style={styles.amountColumn}>OMZET</Text>
          <Text variant="kicker" color={colors.neutral600} style={styles.amountColumn}>PPOB</Text>
        </View>
        {bars.map((bar, index) => <DailyReportRow key={`${bar.label}-${index}-detail`} bar={bar} />)}
      </View>

      <View style={styles.reportBlock}>
        <View style={styles.topSellersHeaderRow}>
          <View>
            <Text variant="h3">Produk terlaris</Text>
            <Text variant="caption" color={colors.neutral600} style={styles.blockCaption}>Diurutkan dari jumlah terjual terbanyak.</Text>
          </View>
        </View>
        <View style={styles.reportTableHeader}>
          <Text variant="kicker" color={colors.neutral600} style={styles.topSellerName}>PRODUK</Text>
          <Text variant="kicker" color={colors.neutral600}>QTY · EST. LABA</Text>
        </View>
        {topSellers.length === 0 ? (
          <Text variant="body" color={colors.neutral600} style={styles.emptyInsights}>
            Belum ada penjualan dalam 7 hari terakhir.
          </Text>
        ) : (
          topSellers.map((seller) => <TopSellerRow key={seller.name} seller={seller} />)
        )}
        <Text variant="caption" color={colors.neutral500} style={styles.marginNote}>Estimasi laba dihitung dari harga jual dikurangi harga modal yang tersimpan.</Text>
      </View>

      <View style={styles.assistantSection}>
        <Text variant="h3">Butuh bantuan membaca laporan?</Text>
        <Text variant="caption" color={colors.neutral600} style={styles.blockCaption}>AI hanya membaca data toko dan tidak dapat mengubah transaksi.</Text>
        <View style={styles.assistantActions}>
          <Pressable onPress={() => onOpenAssistant("Story")} style={styles.assistantButton}>
            <Text variant="body" color={colors.accent2} style={styles.assistantButtonText}>Lihat insight AI</Text>
          </Pressable>
          <Pressable onPress={() => onOpenAssistant("Ask")} style={styles.assistantButton}>
            <Text variant="body" color={colors.accent2} style={styles.assistantButtonText}>Tanya data toko</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function MetricCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return <View style={styles.metricCard}><Text variant="kicker" color={colors.neutral600}>{label}</Text><Text variant="h3" style={styles.metricValue}>{value}</Text>{note ? <Text variant="caption" color={colors.neutral600}>{note}</Text> : null}</View>;
}

function DailyReportRow({ bar }: { bar: WeeklyBar }) {
  return (
    <View style={styles.dailyRow}>
      <Text variant="body" style={styles.dayColumn}>{bar.label}</Text>
      <Text variant="tabular" style={styles.amountColumn}>{formatRupiah(bar.total)}</Text>
      <Text variant="tabular" color={colors.neutral700} style={styles.amountColumn}>{formatRupiah(bar.ppobShare)}</Text>
    </View>
  );
}

function WeeklyBarChart({ bars }: { bars: WeeklyBar[] }) {
  const maxTotal = useMemo(() => Math.max(1, ...bars.map((b) => b.total)), [bars]);

  return (
    <View style={styles.chart}>
      <View style={styles.chartBars}>
        {bars.map((bar, index) => {
          const totalHeight = Math.max(1, Math.round((bar.total / maxTotal) * BAR_MAX_HEIGHT));
          const ppobHeight = Math.max(0, Math.round((bar.ppobShare / maxTotal) * BAR_MAX_HEIGHT));
          return (
            <View key={`${bar.label}-${index}`} style={styles.barColumn}>
              <View style={styles.barTrack}>
                <View style={[styles.barTotal, { height: totalHeight }]} />
                <View style={[styles.barPpob, { height: ppobHeight }]} />
              </View>
            </View>
          );
        })}
      </View>
      <View style={styles.chartLabels}>
        {bars.map((bar, index) => (
          <Text key={`${bar.label}-${index}-label`} variant="caption" color={colors.neutral600} style={styles.chartLabel}>
            {bar.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

function LegendSwatch({ label, color }: { label: string; color: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Text variant="caption" color={colors.neutral600}>
        {label}
      </Text>
    </View>
  );
}

function TopSellerRow({ seller }: { seller: TopSeller }) {
  return (
    <View style={styles.topSellerRow}>
      <Text variant="body" numberOfLines={1} style={styles.topSellerName}>
        {seller.name}
      </Text>
      <Text variant="tabular" color={colors.neutral700} style={styles.topSellerRight}>
        {seller.qty} · {formatRupiah(seller.margin)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space[4], paddingTop: 0, paddingBottom: space[8] },
  pageHeader: { minHeight: 64, justifyContent: "center" },
  headerTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[3] },
  headerCopy: { flex: 1 },
  pageIntro: { marginTop: space[1], lineHeight: 18 },
  backToReport: { minHeight: 40, justifyContent: "center", paddingHorizontal: space[2] },
  tabRow: { flexDirection: "row", marginTop: space[3], borderBottomWidth: 1, borderBottomColor: colors.divider },
  tabButton: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabButtonActive: { borderBottomColor: colors.accent2 },
  tabButtonPressed: { backgroundColor: colors.neutral100 },
  tabTextActive: { fontWeight: "600" },
  loading: { marginTop: space[6] },

  // Story tab
  storySection: {
    marginTop: space[4],
  },
  featureIntro: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.sm, padding: space[4], marginBottom: space[4] },
  featureTitle: { marginTop: space[1] },
  featureDescription: { marginTop: space[2], lineHeight: 19 },
  readOnlyNote: { marginTop: space[3], paddingTop: space[2], borderTopWidth: 1, borderTopColor: colors.divider, lineHeight: 17 },
  aiNotice: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    padding: space[3],
    marginBottom: space[3],
  },
  headline: { fontWeight: "400", lineHeight: 26 },
  storyBody: { marginTop: space[2], lineHeight: 22 },
  regenerateRow: { alignItems: "flex-start", marginTop: space[2] },
  sectionLabel: { marginTop: space[6], marginBottom: space[2] },
  emptyInsights: { paddingVertical: space[2] },
  insightRow: {
    borderLeftWidth: 2,
    borderLeftColor: colors.accent300,
    paddingLeft: space[3],
    paddingVertical: space[2],
    marginBottom: space[2],
  },
  insightTitle: { fontSize: 14.5 },
  insightBody: { marginTop: 3, lineHeight: 18 },
  insightAction: { marginTop: space[1] + 2 },

  // Ask tab
  askSection: {
    marginTop: space[4],
  },
  chatThread: { gap: space[2] + 3 },
  bubble: {
    maxWidth: "84%",
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space[2] + 2,
    paddingHorizontal: space[3],
  },
  bubbleUser: {
    alignSelf: "flex-end",
    borderColor: colors.divider,
    backgroundColor: colors.surface,
  },
  bubbleAssistant: {
    alignSelf: "flex-start",
    borderColor: colors.accent,
    backgroundColor: "transparent",
  },
  suggestionsRow: { flexDirection: "row", flexWrap: "wrap", gap: space[2] - 2, marginTop: space[4] },
  suggestionChip: { paddingHorizontal: space[3], minHeight: 0, paddingVertical: space[2] - 3 },
  askInputRow: { flexDirection: "row", gap: space[2], marginTop: space[4], alignItems: "flex-start" },
  askInput: { flex: 1 },
  askButton: { paddingHorizontal: space[4] },

  // Reports tab
  reportsSection: {
    marginTop: space[2],
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.sm,
    paddingHorizontal: space[4],
    paddingBottom: space[4],
  },
  reportIntro: { minHeight: 64, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.divider },
  periodTitle: { marginTop: 2 },
  revenueCard: { paddingVertical: space[4] },
  revenueValue: { marginTop: space[1], marginBottom: 2, color: colors.text, fontSize: 28 },
  metricGrid: { flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.divider, borderBottomWidth: 1, borderBottomColor: colors.divider },
  metricCard: { flex: 1, minHeight: 78, paddingVertical: space[3], paddingRight: space[3] },
  metricValue: { marginTop: space[1], marginBottom: 2, fontSize: 16 },
  reportBlock: { marginTop: 20, paddingTop: space[4], borderTopWidth: 1, borderTopColor: colors.divider },
  blockCaption: { marginTop: 2 },
  chart: { marginTop: space[4] },
  chartBars: { flexDirection: "row", alignItems: "flex-end", height: BAR_MAX_HEIGHT + 2, gap: space[1] },
  barColumn: { flex: 1, alignItems: "center" },
  barTrack: { width: "72%", height: BAR_MAX_HEIGHT, justifyContent: "flex-end" },
  barTotal: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.accent2,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  barPpob: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.accent,
  },
  chartLabels: { flexDirection: "row", marginTop: space[1] },
  chartLabel: { flex: 1, textAlign: "center" },
  legendRow: { flexDirection: "row", gap: space[4], marginTop: space[2] },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendSwatch: { width: 12, height: 12, borderRadius: 2 },
  reportTableHeader: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.divider, paddingTop: space[3], paddingBottom: space[2] },
  dailyRow: { flexDirection: "row", alignItems: "center", minHeight: 44, borderBottomWidth: 1, borderBottomColor: colors.divider },
  dayColumn: { flex: 0.65 },
  amountColumn: { flex: 1, textAlign: "right", fontSize: 13 },
  topSellersHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  topSellerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: space[2] + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  topSellerName: { flex: 1, marginRight: space[2] },
  topSellerRight: { fontSize: 13.5 },
  marginNote: { marginTop: space[3], lineHeight: 16 },
  assistantSection: { marginTop: space[6], paddingTop: space[4], borderTopWidth: 1, borderTopColor: colors.text },
  assistantActions: { flexDirection: "row", gap: space[2], marginTop: space[3] },
  assistantButton: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.accent2300, borderRadius: radius.sm, backgroundColor: colors.accent2100 },
  assistantButtonText: { fontWeight: "600" },
});
