import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  Lightbulb,
  Package,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Tag,
  TrendingUp,
  TriangleAlert,
} from "lucide-react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { AiChatMessage, formatRupiah, RecapInsight, TopSeller, WeeklyBar } from "@lapak/shared";
import { Text } from "../../theme/Text";
import { Button } from "../../components/Button";
import { PlanUpsell } from "../../components/PlanUpsell";
import { isPlanLimitError } from "../../state/api/apiClient";
import { colors, fonts, radius, shadow, space } from "../../theme/tokens";
import { useAskChat, useAskChatHistory, useDailyRecap, useRegenerateRecap, useWeeklyReports } from "../../state/api/recap";
import { RecapStackParamList } from "../../app/stacks/RecapStack";

/** Jump from the Recap tab to the Subscription screen (which lives in the Home tab's stack). */
function useGoToSubscription() {
  const navigation = useNavigation();
  return () => {
    const parent = navigation.getParent() as unknown as { navigate: (n: string, p: object) => void } | undefined;
    parent?.navigate("HomeTab", { screen: "Subscription" });
  };
}

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

  // The Ask assistant is a chat surface — it manages its own scrolling and a
  // pinned composer, so it renders outside the page's ScrollView.
  if (assistantView === "Ask") {
    return <AskChat onBack={() => setAssistantView(null)} />;
  }

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
      {!assistantView ? <ReportsTab onOpenAssistant={setAssistantView} /> : null}
    </ScrollView>
    </SafeAreaView>
  );
}

function StoryTab() {
  const recapQuery = useDailyRecap();
  const regenerate = useRegenerateRecap();
  const goToSubscription = useGoToSubscription();

  if (recapQuery.isLoading) {
    return <ActivityIndicator style={styles.loading} color={colors.accent} />;
  }
  if (isPlanLimitError(recapQuery.error)) {
    return (
      <PlanUpsell
        title="Insight AI ada di paket Growth"
        message="Ringkasan harian otomatis yang menyoroti omzet, produk terlaris, stok menipis, dan jam sepi. Angka penjualan biasa tetap gratis."
        onUpgrade={goToSubscription}
      />
    );
  }
  if (recapQuery.isError || !recapQuery.data) {
    return (
      <Text variant="body" color={colors.accent700} style={styles.loading}>
        Ringkasan hari ini gagal dimuat. Coba buka kembali halaman ini.
      </Text>
    );
  }

  const recap = recapQuery.data;
  const updatedAt = formatUpdatedAt(recap.generatedAt);

  return (
    <View style={styles.storySection}>
      <View style={styles.storyCard}>
        <View style={styles.storyCardHead}>
          <View style={styles.storyBadge}>
            <Sparkles size={15} color={colors.accent2600} strokeWidth={2.2} />
          </View>
          <Text variant="kicker" color={colors.accent2700} style={styles.storyKicker}>
            INSIGHT OTOMATIS
          </Text>
          {updatedAt ? (
            <Text variant="caption" color={colors.neutral500}>
              {updatedAt}
            </Text>
          ) : null}
        </View>

        <Text style={styles.headline}>{recap.headline}</Text>
        <Text variant="body" color={colors.neutral800} style={styles.storyBody}>
          {recap.body}
        </Text>

        <View style={styles.storyCardFoot}>
          <View style={styles.readOnlyNote}>
            <ShieldCheck size={13} color={colors.neutral500} strokeWidth={2} />
            <Text variant="caption" color={colors.neutral600} style={styles.readOnlyNoteText}>
              Hanya membaca data · tak mengubah transaksi, stok, atau harga
            </Text>
          </View>
          <Pressable
            onPress={() => regenerate.mutate()}
            disabled={regenerate.isPending}
            style={({ pressed }) => [
              styles.regenButton,
              pressed && !regenerate.isPending && styles.regenButtonPressed,
              regenerate.isPending && styles.regenButtonDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Perbarui ringkasan"
          >
            {regenerate.isPending ? (
              <ActivityIndicator size="small" color={colors.accent2600} />
            ) : (
              <RefreshCw size={13} color={colors.accent2600} strokeWidth={2.2} />
            )}
            <Text variant="caption" color={colors.accent2600} style={styles.regenButtonText}>
              {regenerate.isPending ? "Memperbarui…" : "Perbarui"}
            </Text>
          </Pressable>
        </View>
      </View>

      {!recap.aiAvailable ? (
        <View style={styles.storyBanner}>
          <TriangleAlert size={16} color={colors.accent600} strokeWidth={2} />
          <Text variant="caption" color={colors.accent700} style={styles.storyBannerText}>
            {AI_UNAVAILABLE_MESSAGE}
          </Text>
        </View>
      ) : null}

      <View style={styles.insightsHead}>
        <Text variant="h3">Yang perlu diperhatikan</Text>
        {recap.insights.length > 0 ? (
          <View style={styles.countPill}>
            <Text variant="caption" color={colors.neutral700} style={styles.countPillText}>
              {recap.insights.length}
            </Text>
          </View>
        ) : null}
      </View>

      {recap.insights.length === 0 ? (
        <View style={styles.insightsEmpty}>
          <CircleCheck size={18} color={colors.success} strokeWidth={2} />
          <Text variant="caption" color={colors.neutral600} style={styles.insightsEmptyText}>
            Belum ada hal penting yang perlu ditindaklanjuti hari ini.
          </Text>
        </View>
      ) : (
        recap.insights.map((insight, index) => (
          <InsightCard key={`${insight.title}-${index}`} insight={insight} />
        ))
      )}
    </View>
  );
}

/** Local HH:MM for the "last generated" stamp; empty string if the timestamp is unusable. */
function formatUpdatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `Diperbarui ${hh}:${mm}`;
}

/** The insight payload carries no category, so pick a leading icon + tint from keywords in the title. */
function insightVisual(title: string): { Icon: typeof Lightbulb; bg: string; fg: string } {
  const t = title.toLowerCase();
  if (/stok|restok|habis|menipis|kosong|beli/.test(t)) return { Icon: Package, bg: colors.accent100, fg: colors.accent600 };
  if (/sepi|ramai|jam|pukul|waktu|siang|malam|pagi/.test(t)) return { Icon: Clock, bg: colors.accent2100, fg: colors.accent2600 };
  if (/modal|harga|margin|laba|untung|rugi/.test(t)) return { Icon: Tag, bg: colors.accent2100, fg: colors.accent2600 };
  if (/omzet|laris|terjual|penjualan|naik|turun|tren/.test(t)) return { Icon: TrendingUp, bg: colors.accent2100, fg: colors.accent2600 };
  return { Icon: Lightbulb, bg: colors.neutral200, fg: colors.neutral700 };
}

function InsightCard({ insight }: { insight: RecapInsight }) {
  const { Icon, bg, fg } = insightVisual(insight.title);
  return (
    <View style={styles.insightCard}>
      <View style={styles.insightBodyRow}>
        <View style={[styles.insightIcon, { backgroundColor: bg }]}>
          <Icon size={17} color={fg} strokeWidth={2.1} />
        </View>
        <View style={styles.insightText}>
          <Text style={styles.insightTitle}>{insight.title}</Text>
          <Text variant="caption" color={colors.neutral700} style={styles.insightBody}>
            {insight.body}
          </Text>
        </View>
      </View>
      {insight.action ? (
        <View style={styles.insightAction}>
          <ChevronRight size={14} color={colors.accent2600} strokeWidth={2.4} />
          <Text variant="caption" color={colors.accent2600} style={styles.insightActionText}>
            {insight.action}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const ASK_MAX_LENGTH = 500;

function AskChat({ onBack }: { onBack: () => void }) {
  const historyQuery = useAskChatHistory();
  const askChat = useAskChat();
  const [draft, setDraft] = useState("");
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollRef = useRef<React.ElementRef<typeof ScrollView>>(null);

  // Drive the composer's position by the real keyboard height. Neither
  // KeyboardAvoidingView nor bare adjustResize lifts a bottom bar reliably
  // inside this bottom-tab + native-stack screen on Android, so track it
  // directly: the composer sits at `bottom: keyboardHeight`.
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvt, (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const handleSend = (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || askChat.isPending) return;
    setPendingMessage(trimmed);
    setDraft("");
    askChat.mutate(trimmed, { onSettled: () => setPendingMessage(null) });
  };

  const messages = historyQuery.data?.messages ?? [];
  const showAiUnavailableBanner = askChat.data ? !askChat.data.aiAvailable : false;
  const threadEmpty = messages.length === 0 && !pendingMessage && !askChat.isPending;
  const canSend = draft.trim() !== "" && !askChat.isPending;

  return (
    <SafeAreaView style={styles.askScreen} edges={[]}>
      <View style={styles.askHeader}>
        <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" accessibilityLabel="Kembali ke laporan">
          <ChevronLeft size={24} color={colors.neutral700} strokeWidth={2.2} />
        </Pressable>
        <View style={styles.askHeaderCopy}>
          <Text variant="h3">Asisten toko</Text>
          <Text variant="caption" color={colors.neutral600}>Tanya kondisi toko dari data penjualan</Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.askFill}
        contentContainerStyle={[styles.askThread, { paddingBottom: 84 + keyboardHeight }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {historyQuery.isLoading ? (
          <ActivityIndicator style={styles.loading} color={colors.accent} />
        ) : historyQuery.isError ? (
          <Text variant="body" color={colors.accent700}>
            Percakapan gagal dimuat. Coba buka kembali halaman ini.
          </Text>
        ) : (
          <>
            {threadEmpty ? (
              <View style={styles.askEmpty}>
                <Text variant="kicker" color={colors.accent2700}>TANYA DATA TOKO</Text>
                <Text variant="h3" style={styles.featureTitle}>Cari jawaban tanpa membaca tabel</Text>
                <Text variant="caption" color={colors.neutral700} style={styles.featureDescription}>
                  Cocok untuk pertanyaan lanjutan soal penjualan hari ini, produk terlaris, kebutuhan restok,
                  kenaikan modal, atau jam sepi. Jawaban mengikuti data yang tersedia — kalau datanya belum
                  cukup, AI akan mengatakannya.
                </Text>
                <View style={styles.suggestionsRow}>
                  {ASK_SUGGESTIONS.map((suggestion) => (
                    <Button
                      key={suggestion}
                      title={suggestion}
                      variant="secondary"
                      onPress={() => handleSend(suggestion)}
                      style={styles.suggestionChip}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            {showAiUnavailableBanner ? (
              <View style={styles.aiNotice}>
                <Text variant="caption" color={colors.accent700}>{ASK_AI_UNAVAILABLE_MESSAGE}</Text>
              </View>
            ) : null}

            {messages.map((message) => (
              <ChatBubble key={message.id} role={message.role} text={message.content} />
            ))}
            {pendingMessage ? <ChatBubble role="user" text={pendingMessage} /> : null}
            {askChat.isPending ? <ChatBubble role="assistant" text="Sedang menganalisis…" muted /> : null}
          </>
        )}
      </ScrollView>

      {/* Pinned composer, lifted to sit exactly on top of the keyboard via
          the tracked keyboardHeight (see the effect above). */}
      <View style={[styles.composer, { bottom: keyboardHeight }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Tulis pertanyaan…"
          placeholderTextColor={colors.neutral500}
          multiline
          maxLength={ASK_MAX_LENGTH}
          editable={!askChat.isPending}
          style={styles.composerInput}
          returnKeyType="send"
          blurOnSubmit={false}
          onSubmitEditing={() => handleSend(draft)}
        />
        <Pressable
          onPress={() => handleSend(draft)}
          disabled={!canSend}
          style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Kirim pertanyaan"
        >
          {askChat.isPending ? (
            <ActivityIndicator size="small" color={colors.surface} />
          ) : (
            <ArrowUp size={20} color={colors.surface} strokeWidth={2.6} />
          )}
        </Pressable>
      </View>
    </SafeAreaView>
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
  featureTitle: { marginTop: space[1] },
  featureDescription: { marginTop: space[2], lineHeight: 19 },
  aiNotice: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    padding: space[3],
    marginBottom: space[3],
  },

  // Story tab — summary card
  storyCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    padding: space[4],
    ...shadow.sm,
  },
  storyCardHead: { flexDirection: "row", alignItems: "center", gap: space[2], marginBottom: space[3] },
  storyBadge: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.accent2100,
    alignItems: "center",
    justifyContent: "center",
  },
  storyKicker: { flex: 1 },
  headline: {
    fontFamily: fonts.heading,
    fontWeight: "600",
    fontSize: 19,
    lineHeight: 26,
    color: colors.text,
  },
  storyBody: { marginTop: space[2], lineHeight: 22 },
  storyCardFoot: {
    marginTop: space[4],
    paddingTop: space[3],
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
  },
  readOnlyNote: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 6 },
  readOnlyNoteText: { flex: 1, lineHeight: 16 },
  regenButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.accent2300,
    backgroundColor: colors.accent2100,
  },
  regenButtonPressed: { backgroundColor: colors.accent2200 },
  regenButtonDisabled: { opacity: 0.6 },
  regenButtonText: { fontWeight: "600" },

  // Story tab — AI-unavailable banner
  storyBanner: {
    marginTop: space[3],
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[2],
    padding: space[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent200,
    backgroundColor: colors.accent100,
  },
  storyBannerText: { flex: 1, lineHeight: 17 },

  // Story tab — insights
  insightsHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    marginTop: space[6],
    marginBottom: space[3],
  },
  countPill: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    backgroundColor: colors.neutral200,
    alignItems: "center",
    justifyContent: "center",
  },
  countPillText: { fontWeight: "600", lineHeight: 16 },
  insightsEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    padding: space[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
  },
  insightsEmptyText: { flex: 1, lineHeight: 17 },
  insightCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    padding: space[3],
    marginBottom: space[2] + 2,
    ...shadow.sm,
  },
  insightBodyRow: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  insightIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  insightText: { flex: 1 },
  insightTitle: {
    fontFamily: fonts.heading,
    fontWeight: "600",
    fontSize: 15,
    lineHeight: 20,
    color: colors.text,
  },
  insightBody: { marginTop: 3, lineHeight: 18 },
  insightAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: space[2] + 2,
    paddingTop: space[2],
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  insightActionText: { flex: 1, fontWeight: "600", lineHeight: 17 },

  // Ask assistant (chat surface)
  askScreen: { flex: 1, backgroundColor: colors.bg },
  askFill: { flex: 1 },
  askHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  askHeaderCopy: { flex: 1 },
  askThread: { padding: space[3], paddingBottom: 84, gap: space[2] + 3, flexGrow: 1 },
  askEmpty: { paddingVertical: space[2], gap: space[2] + 3 },
  bubble: {
    maxWidth: "86%",
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
  suggestionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2] - 2,
    marginTop: space[2],
  },
  suggestionChip: { paddingHorizontal: space[3], minHeight: 0, paddingVertical: space[2] - 3 },
  composer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space[2],
    paddingHorizontal: space[3],
    paddingTop: space[2],
    paddingBottom: space[3],
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  composerInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingTop: Platform.OS === "ios" ? 12 : 8,
    paddingBottom: Platform.OS === "ios" ? 12 : 8,
    paddingHorizontal: space[3],
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 20,
    color: colors.text,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.lg,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: { backgroundColor: colors.neutral400 },

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
  emptyInsights: { paddingVertical: space[2] },
  marginNote: { marginTop: space[3], lineHeight: 16 },
  assistantSection: { marginTop: space[6], paddingTop: space[4], borderTopWidth: 1, borderTopColor: colors.text },
  assistantActions: { flexDirection: "row", gap: space[2], marginTop: space[3] },
  assistantButton: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.accent2300, borderRadius: radius.sm, backgroundColor: colors.accent2100 },
  assistantButtonText: { fontWeight: "600" },
});
